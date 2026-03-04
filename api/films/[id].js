// api/films/[id].js
// ─────────────────────────────────────────────
// GET    /api/films/:id  → Get film + all revenue rows
// DELETE /api/films/:id  → Delete a single film
// ─────────────────────────────────────────────

import { getDb } from '../_lib/db.js';
import { authenticate } from '../_lib/auth.js';

export default async function handler(req, res) {
  const user = await authenticate(req, res);
  if (!user) return;

  const sql = getDb();
  const { id } = req.query;

  if (!id) {
    return res.status(400).json({ error: 'Missing film ID' });
  }

  // ── GET: Single film with all revenue data ──
  if (req.method === 'GET') {
    try {
      // Fetch film (verify ownership)
      const filmRows = await sql`
        SELECT id, title, year, date_from, date_to,
               venue_count, total_revenue, imported_at
        FROM films
        WHERE id = ${id} AND user_id = ${user.id}
      `;

      if (filmRows.length === 0) {
        return res.status(404).json({ error: 'Film not found' });
      }

      // Fetch all revenue rows for this film
      const revenues = await sql`
        SELECT venue_name, venue_city,
               comscore_theater, comscore_city, comscore_circuit,
               revenue, screens_aggregated, match_confidence, match_method
        FROM film_revenues
        WHERE film_id = ${id}
        ORDER BY revenue DESC
      `;

      return res.status(200).json({
        film: filmRows[0],
        revenues,
      });

    } catch (err) {
      console.error(`GET /api/films/${id} error:`, err);
      return res.status(500).json({ error: 'Failed to fetch film' });
    }
  }

  // ── DELETE: Remove single film (CASCADE removes revenues) ──
  if (req.method === 'DELETE') {
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
      console.error(`DELETE /api/films/${id} error:`, err);
      return res.status(500).json({ error: 'Failed to delete film' });
    }
  }

  return res.status(405).json({ error: `Method ${req.method} not allowed` });
}
