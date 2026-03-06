// api/tmdb/index.js
// TMDB API proxy — keeps API key server-side
// Actions: search (search movies), details (get full movie data)

import { authenticate } from '../_lib/auth.js';

const TMDB_BASE = 'https://api.themoviedb.org/3';

// CORS headers (same pattern as other API routes)
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
};

export default async function handler(req, res) {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return res.status(200).setHeader('Access-Control-Allow-Origin', '*')
      .setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS')
      .setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization')
      .end();
  }

  // Only GET allowed
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // Authenticate (prevents unauthenticated abuse of our TMDB proxy)
  const user = await authenticate(req, res);
  if (!user) return;

  const apiKey = process.env.TMDB_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: 'TMDB API key not configured. Add TMDB_API_KEY to Vercel environment variables.' });
  }

  const { action, query, id } = req.query;

  try {
    if (action === 'search') {
      // ─── Search for movies ───
      if (!query || query.trim().length === 0) {
        return res.status(400).json({ error: 'Missing query parameter' });
      }

      const url = `${TMDB_BASE}/search/movie?api_key=${apiKey}&query=${encodeURIComponent(query)}&language=en-GB&include_adult=false`;
      const tmdbRes = await fetch(url);

      if (!tmdbRes.ok) {
        const errText = await tmdbRes.text();
        console.error('TMDB search error:', tmdbRes.status, errText);
        return res.status(tmdbRes.status).json({ error: 'TMDB search failed' });
      }

      const data = await tmdbRes.json();

      // Return a simplified results array (no need to send the full TMDB response)
      const results = (data.results || []).map(movie => ({
        tmdb_id: movie.id,
        title: movie.title,
        original_title: movie.original_title,
        year: movie.release_date ? parseInt(movie.release_date.substring(0, 4)) : null,
        release_date: movie.release_date || null,
        overview: movie.overview || '',
        poster_path: movie.poster_path || null,
        backdrop_path: movie.backdrop_path || null,
        popularity: movie.popularity || 0,
        vote_average: movie.vote_average || 0,
        vote_count: movie.vote_count || 0,
        genre_ids: movie.genre_ids || [],
      }));

      return res.status(200).json({ results, total_results: data.total_results });

    } else if (action === 'details') {
      // ─── Get full movie details ───
      if (!id) {
        return res.status(400).json({ error: 'Missing id parameter' });
      }

      // Use append_to_response to get credits, keywords, and release_dates in one call
      const url = `${TMDB_BASE}/movie/${id}?api_key=${apiKey}&language=en-GB&append_to_response=credits,keywords,release_dates`;
      const tmdbRes = await fetch(url);

      if (!tmdbRes.ok) {
        const errText = await tmdbRes.text();
        console.error('TMDB details error:', tmdbRes.status, errText);
        return res.status(tmdbRes.status).json({ error: 'TMDB details fetch failed' });
      }

      const movie = await tmdbRes.json();

      // Extract UK certification from release_dates
      let certification = null;
      if (movie.release_dates && movie.release_dates.results) {
        const gbRelease = movie.release_dates.results.find(r => r.iso_3166_1 === 'GB');
        if (gbRelease && gbRelease.release_dates && gbRelease.release_dates.length > 0) {
          // Find the theatrical release (type 3) or the first one with a certification
          const theatrical = gbRelease.release_dates.find(rd => rd.type === 3 && rd.certification);
          const any = gbRelease.release_dates.find(rd => rd.certification);
          certification = (theatrical || any)?.certification || null;
        }
      }

      // Extract top cast (limit to 20 to keep data manageable)
      const cast = (movie.credits?.cast || []).slice(0, 20).map(c => ({
        id: c.id,
        name: c.name,
        character: c.character,
        profile_path: c.profile_path,
        order: c.order,
      }));

      // Extract key crew (director, writer, producer)
      const importantJobs = ['Director', 'Writer', 'Screenplay', 'Producer', 'Executive Producer', 'Novel', 'Original Music Composer'];
      const crew = (movie.credits?.crew || [])
        .filter(c => importantJobs.includes(c.job))
        .map(c => ({
          id: c.id,
          name: c.name,
          job: c.job,
          department: c.department,
          profile_path: c.profile_path,
        }));

      // Extract keywords
      const keywords = (movie.keywords?.keywords || []).map(k => ({
        id: k.id,
        name: k.name,
      }));

      // Extract genres
      const genres = (movie.genres || []).map(g => g.name);

      // Build the structured response
      const result = {
        tmdb_id: movie.id,
        title: movie.title,
        original_title: movie.original_title,
        year: movie.release_date ? parseInt(movie.release_date.substring(0, 4)) : null,
        release_date: movie.release_date || null,
        overview: movie.overview || '',
        tagline: movie.tagline || '',
        poster_path: movie.poster_path || null,
        backdrop_path: movie.backdrop_path || null,
        genres,
        runtime: movie.runtime || null,
        budget: movie.budget || 0,
        revenue: movie.revenue || 0,
        popularity: movie.popularity || 0,
        vote_average: movie.vote_average || 0,
        vote_count: movie.vote_count || 0,
        status: movie.status || null,
        certification,
        cast,
        crew,
        keywords,
        // Store the full raw response for future-proofing (minus the bulky release_dates)
        _raw: {
          ...movie,
          release_dates: undefined, // Strip this — we extracted what we need
          credits: undefined,       // Strip — we extracted cast/crew above
          keywords: undefined,      // Strip — extracted above
        },
      };

      return res.status(200).json(result);

    } else {
      return res.status(400).json({ error: 'Invalid action. Use action=search or action=details' });
    }

  } catch (err) {
    console.error('TMDB proxy error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
}
