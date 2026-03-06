// api/catalogue/index.js
// Film Catalogue CRUD — master film records with TMDB metadata
// Methods: GET (list / single), POST (create), PUT (update), DELETE

import { authenticate } from '../_lib/auth.js';
import { getDb } from '../_lib/db.js';

export default async function handler(req, res) {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return res.status(200)
      .setHeader('Access-Control-Allow-Origin', '*')
      .setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS')
      .setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization')
      .end();
  }

  // Authenticate
  let userId;
  try {
    const auth = await authenticate(req);
    userId = auth.userId;
  } catch (err) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const sql = getDb();
  const { id } = req.query;

  try {
    // ─── GET: List all or get single ───
    if (req.method === 'GET') {
      if (id) {
        // Single catalogue entry with full details + linked Comscore imports
        const rows = await sql`
          SELECT fc.*,
            (SELECT COUNT(*) FROM films f WHERE f.catalogue_id = fc.id) AS import_count,
            (SELECT COALESCE(SUM(f.total_revenue), 0) FROM films f WHERE f.catalogue_id = fc.id) AS total_uk_revenue
          FROM film_catalogue fc
          WHERE fc.id = ${id} AND fc.user_id = ${userId}
        `;

        if (rows.length === 0) {
          return res.status(404).json({ error: 'Catalogue entry not found' });
        }

        // Also fetch linked Comscore imports
        const imports = await sql`
          SELECT id, title, year, date_from, date_to, venue_count, total_revenue, imported_at
          FROM films
          WHERE catalogue_id = ${id} AND user_id = ${userId}
          ORDER BY date_from DESC
        `;

        return res.status(200).json({
          ...rows[0],
          imports,
        });

      } else {
        // List all catalogue entries (lightweight — no tmdb_data blob)
        const rows = await sql`
          SELECT 
            fc.id, fc.title, fc.year, fc.status, fc.release_date, fc.genres,
            fc.poster_path, fc.backdrop_path, fc.certification, fc.runtime,
            fc.tmdb_id, fc.tmdb_popularity, fc.tmdb_vote_average,
            fc.distribution_cost, fc.production_cost,
            fc.created_at, fc.updated_at,
            (SELECT COUNT(*) FROM films f WHERE f.catalogue_id = fc.id) AS import_count,
            (SELECT COALESCE(SUM(f.total_revenue), 0) FROM films f WHERE f.catalogue_id = fc.id) AS total_uk_revenue
          FROM film_catalogue fc
          WHERE fc.user_id = ${userId}
          ORDER BY fc.updated_at DESC
        `;

        return res.status(200).json({ catalogue: rows });
      }
    }

    // ─── POST: Create new catalogue entry ───
    if (req.method === 'POST') {
      const {
        title, year, status, release_date, synopsis, genres,
        tmdb_id, tmdb_data, poster_path, backdrop_path,
        certification, runtime, tmdb_budget, tmdb_revenue,
        tmdb_popularity, tmdb_vote_average,
        distribution_cost, production_cost, notes
      } = req.body;

      if (!title || title.trim().length === 0) {
        return res.status(400).json({ error: 'Title is required' });
      }

      // Check for duplicate TMDB ID (if provided)
      if (tmdb_id) {
        const existing = await sql`
          SELECT id, title FROM film_catalogue
          WHERE user_id = ${userId} AND tmdb_id = ${tmdb_id}
        `;
        if (existing.length > 0) {
          return res.status(409).json({
            error: 'This film is already in your catalogue',
            existing_id: existing[0].id,
            existing_title: existing[0].title,
          });
        }
      }

      const rows = await sql`
        INSERT INTO film_catalogue (
          user_id, title, year, status, release_date, synopsis, genres,
          tmdb_id, tmdb_data, poster_path, backdrop_path,
          certification, runtime, tmdb_budget, tmdb_revenue,
          tmdb_popularity, tmdb_vote_average,
          distribution_cost, production_cost, notes
        ) VALUES (
          ${userId},
          ${title.trim()},
          ${year || null},
          ${status || 'pre_release'},
          ${release_date || null},
          ${synopsis || null},
          ${genres || null},
          ${tmdb_id || null},
          ${tmdb_data ? JSON.stringify(tmdb_data) : null},
          ${poster_path || null},
          ${backdrop_path || null},
          ${certification || null},
          ${runtime || null},
          ${tmdb_budget || 0},
          ${tmdb_revenue || 0},
          ${tmdb_popularity || null},
          ${tmdb_vote_average || null},
          ${distribution_cost || null},
          ${production_cost || null},
          ${notes || null}
        )
        RETURNING *
      `;

      return res.status(201).json(rows[0]);
    }

    // ─── PUT: Update existing catalogue entry ───
    if (req.method === 'PUT') {
      if (!id) {
        return res.status(400).json({ error: 'Missing id parameter' });
      }

      // Verify ownership
      const existing = await sql`
        SELECT id FROM film_catalogue WHERE id = ${id} AND user_id = ${userId}
      `;
      if (existing.length === 0) {
        return res.status(404).json({ error: 'Catalogue entry not found' });
      }

      // Build dynamic update from provided fields
      const body = req.body;
      const updatable = [
        'title', 'year', 'status', 'release_date', 'synopsis', 'genres',
        'tmdb_id', 'tmdb_data', 'poster_path', 'backdrop_path',
        'certification', 'runtime', 'tmdb_budget', 'tmdb_revenue',
        'tmdb_popularity', 'tmdb_vote_average',
        'distribution_cost', 'production_cost', 'notes'
      ];

      // Filter to only fields present in the request body
      const updates = {};
      for (const field of updatable) {
        if (field in body) {
          updates[field] = body[field];
        }
      }

      if (Object.keys(updates).length === 0) {
        return res.status(400).json({ error: 'No fields to update' });
      }

      // Build SET clause dynamically
      // We have to handle tmdb_data specially (needs JSON.stringify)
      const setClauses = [];
      const values = [];
      let paramIndex = 1;

      for (const [field, value] of Object.entries(updates)) {
        if (field === 'tmdb_data') {
          setClauses.push(`${field} = $${paramIndex}`);
          values.push(value ? JSON.stringify(value) : null);
        } else {
          setClauses.push(`${field} = $${paramIndex}`);
          values.push(value === undefined ? null : value);
        }
        paramIndex++;
      }

      // Add the WHERE clause params
      values.push(id);
      values.push(userId);

      const query = `
        UPDATE film_catalogue
        SET ${setClauses.join(', ')}
        WHERE id = $${paramIndex} AND user_id = $${paramIndex + 1}
        RETURNING *
      `;

      const rows = await sql.unsafe(query, values);

      return res.status(200).json(rows[0]);
    }

    // ─── DELETE: Remove catalogue entry ───
    if (req.method === 'DELETE') {
      if (!id) {
        return res.status(400).json({ error: 'Missing id parameter' });
      }

      // This will SET NULL on films.catalogue_id (cascade rule)
      const rows = await sql`
        DELETE FROM film_catalogue
        WHERE id = ${id} AND user_id = ${userId}
        RETURNING id, title
      `;

      if (rows.length === 0) {
        return res.status(404).json({ error: 'Catalogue entry not found' });
      }

      return res.status(200).json({ deleted: rows[0] });
    }

    return res.status(405).json({ error: 'Method not allowed' });

  } catch (err) {
    console.error('Catalogue API error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
}
