// api/films/index.js
// ─────────────────────────────────────────────
// GET  /api/films     → List all films for user
// POST /api/films     → Save a new imported film
// DELETE /api/films   → Clear all films for user
// ─────────────────────────────────────────────

import { getDb } from '../_lib/db.js';
import { authenticate } from '../_lib/auth.js';

export default async function handler(req, res) {
  const user = await authenticate(req, res);
  if (!user) return;

  const sql = getDb();

  // ── GET: List all films (lightweight, no revenue rows) ──
  if (req.method === 'GET') {
    try {
      const films = await sql`
        SELECT id, title, year, date_from, date_to,
               venue_count, total_revenue, imported_at
        FROM films
        WHERE user_id = ${user.id}
        ORDER BY imported_at DESC
      `;
      return res.status(200).json({ films });
    } catch (err) {
      console.error('GET /api/films error:', err);
      return res.status(500).json({ error: 'Failed to fetch films' });
    }
  }

  // ── POST: Save a new film + revenue data ──
  if (req.method === 'POST') {
    try {
      const { title, year, dateFrom, dateTo, revenues } = req.body;

      if (!title || !revenues || !Array.isArray(revenues)) {
        return res.status(400).json({ error: 'Missing required fields: title, revenues[]' });
      }

      // Calculate summary fields
      const venueCount = revenues.length;
      const totalRevenue = revenues.reduce((sum, r) => sum + (r.revenue || 0), 0);

      // Insert film record
      const filmRows = await sql`
        INSERT INTO films (user_id, title, year, date_from, date_to, venue_count, total_revenue)
        VALUES (${user.id}, ${title}, ${year || null}, ${dateFrom || null}, ${dateTo || null},
                ${venueCount}, ${totalRevenue})
        RETURNING id, title, year, date_from, date_to, venue_count, total_revenue, imported_at
      `;

      const film = filmRows[0];

      // Insert revenue rows in batches of 100
      // (Neon handles this efficiently but we keep batches reasonable)
      const batchSize = 100;
      for (let i = 0; i < revenues.length; i += batchSize) {
        const batch = revenues.slice(i, i + batchSize);

        // Build a batch insert using unnest for efficiency
        const venueNames = batch.map(r => r.venueName);
        const venueCities = batch.map(r => r.venueCity);
        const comscoreTheaters = batch.map(r => r.comscoreTheater || null);
        const comscoreCities = batch.map(r => r.comscoreCity || null);
        const comscoreCircuits = batch.map(r => r.comscoreCircuit || null);
        const revenueAmounts = batch.map(r => r.revenue || 0);
        const screensAgg = batch.map(r => r.screensAggregated || 1);
        const matchConfs = batch.map(r => r.matchConfidence || null);
        const matchMethods = batch.map(r => r.matchMethod || null);

        await sql`
          INSERT INTO film_revenues (
            film_id, venue_name, venue_city,
            comscore_theater, comscore_city, comscore_circuit,
            revenue, screens_aggregated, match_confidence, match_method
          )
          SELECT
            ${film.id},
            unnest(${venueNames}::text[]),
            unnest(${venueCities}::text[]),
            unnest(${comscoreTheaters}::text[]),
            unnest(${comscoreCities}::text[]),
            unnest(${comscoreCircuits}::text[]),
            unnest(${revenueAmounts}::numeric[]),
            unnest(${screensAgg}::smallint[]),
            unnest(${matchConfs}::smallint[]),
            unnest(${matchMethods}::text[])
        `;
      }

      return res.status(201).json({ film });

    } catch (err) {
      console.error('POST /api/films error:', err);
      return res.status(500).json({ error: 'Failed to save film' });
    }
  }

  // ── DELETE: Clear all films for user ──
  if (req.method === 'DELETE') {
    try {
      const result = await sql`
        DELETE FROM films WHERE user_id = ${user.id}
        RETURNING id
      `;
      return res.status(200).json({
        deleted: result.length,
        message: `Deleted ${result.length} film(s) and all associated revenue data`
      });
    } catch (err) {
      console.error('DELETE /api/films error:', err);
      return res.status(500).json({ error: 'Failed to delete films' });
    }
  }

  return res.status(405).json({ error: `Method ${req.method} not allowed` });
}
