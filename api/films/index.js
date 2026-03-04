// api/films/index.js
// ─────────────────────────────────────────────
// GET    /api/films         → List all films for user
// GET    /api/films?id=123  → Get single film + revenue rows
// POST   /api/films         → Save a new imported film
// DELETE /api/films         → Clear all films for user
// DELETE /api/films?id=123  → Delete a single film
// ─────────────────────────────────────────────

import { getDb } from '../_lib/db.js';
import { authenticate } from '../_lib/auth.js';

export default async function handler(req, res) {
  const user = await authenticate(req, res);
  if (!user) return;

  const sql = getDb();
  const { id } = req.query;

  // ── GET ───────────────────────────────────────

  if (req.method === 'GET') {

    // Single film with revenue data
    if (id) {
      try {
        const filmRows = await sql`
          SELECT id, title, year, date_from, date_to,
                 venue_count, total_revenue, imported_at
          FROM films
          WHERE id = ${id} AND user_id = ${user.id}
        `;

        if (filmRows.length === 0) {
          return res.status(404).json({ error: 'Film not found' });
        }

        const revenues = await sql`
          SELECT venue_name, venue_city,
                 comscore_theater, comscore_city, comscore_circuit,
                 revenue, screens_aggregated, match_confidence, match_method
          FROM film_revenues
          WHERE film_id = ${id}
          ORDER BY revenue DESC
        `;

        return res.status(200).json({ film: filmRows[0], revenues });

      } catch (err) {
        console.error(`GET /api/films?id=${id} error:`, err);
        return res.status(500).json({ error: 'Failed to fetch film' });
      }
    }

    // List all films (lightweight, no revenue rows)
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

  // ── POST: Save a new film + revenue data ──────

  if (req.method === 'POST') {
    try {
      const { title, year, dateFrom, dateTo, revenues } = req.body;

      if (!title || !revenues || !Array.isArray(revenues)) {
        return res.status(400).json({ error: 'Missing required fields: title, revenues[]' });
      }

      const venueCount = revenues.length;
      const totalRevenue = revenues.reduce((sum, r) => sum + (r.revenue || 0), 0);

      const filmRows = await sql`
        INSERT INTO films (user_id, title, year, date_from, date_to, venue_count, total_revenue)
        VALUES (${user.id}, ${title}, ${year || null}, ${dateFrom || null}, ${dateTo || null},
                ${venueCount}, ${totalRevenue})
        RETURNING id, title, year, date_from, date_to, venue_count, total_revenue, imported_at
      `;

      const film = filmRows[0];

      // Insert revenue rows in batches of 100
      const batchSize = 100;
      for (let i = 0; i < revenues.length; i += batchSize) {
        const batch = revenues.slice(i, i + batchSize);

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

  // ── DELETE ────────────────────────────────────

  if (req.method === 'DELETE') {

    // Delete single film
    if (id) {
      try {
        const result = await sql`
          DELETE FROM films
          WHERE id = ${id} AND user_id = ${user.id}
          RETURNING id, title
        `;

        if (result.length === 0) {
          return res.status(404).json({ error: 'Film not found' });
        }

        return res.status(200).json({
          deleted: result[0],
          message: `Deleted "${result[0].title}" and all associated revenue data`
        });

      } catch (err) {
        console.error(`DELETE /api/films?id=${id} error:`, err);
        return res.status(500).json({ error: 'Failed to delete film' });
      }
    }

    // Delete all films
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
