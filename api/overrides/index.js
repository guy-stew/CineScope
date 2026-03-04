// api/overrides/index.js
// ─────────────────────────────────────────────
// GET  /api/overrides  → Get all match overrides
// PUT  /api/overrides  → Upsert a match override
// ─────────────────────────────────────────────

import { getDb } from '../_lib/db.js';
import { authenticate } from '../_lib/auth.js';

export default async function handler(req, res) {
  const user = await authenticate(req, res);
  if (!user) return;

  const sql = getDb();

  // ── GET: All overrides for user ──
  // Returns in the same format the app currently reads
  // from localStorage, so the frontend swap is minimal.
  if (req.method === 'GET') {
    try {
      const overrides = await sql`
        SELECT id, comscore_theater, comscore_city,
               action, venue_name, venue_city, created_at
        FROM match_overrides
        WHERE user_id = ${user.id}
        ORDER BY created_at DESC
      `;

      // Also return as a lookup object keyed by "theater|city"
      // to match the current localStorage format
      const lookup = {};
      for (const row of overrides) {
        const key = `${row.comscore_theater}|${row.comscore_city}`;
        lookup[key] = {
          id: row.id,
          venueName: row.venue_name,
          venueCity: row.venue_city,
          action: row.action,
        };
      }

      return res.status(200).json({ overrides, lookup });

    } catch (err) {
      console.error('GET /api/overrides error:', err);
      return res.status(500).json({ error: 'Failed to fetch overrides' });
    }
  }

  // ── PUT: Upsert an override ──
  if (req.method === 'PUT') {
    try {
      const { comscoreTheater, comscoreCity, action, venueName, venueCity } = req.body;

      if (!comscoreTheater || !comscoreCity || !action) {
        return res.status(400).json({
          error: 'Missing required fields: comscoreTheater, comscoreCity, action'
        });
      }

      if (!['assign', 'dismiss'].includes(action)) {
        return res.status(400).json({ error: 'action must be "assign" or "dismiss"' });
      }

      const rows = await sql`
        INSERT INTO match_overrides (
          user_id, comscore_theater, comscore_city,
          action, venue_name, venue_city
        )
        VALUES (
          ${user.id}, ${comscoreTheater}, ${comscoreCity},
          ${action}, ${venueName || null}, ${venueCity || null}
        )
        ON CONFLICT (user_id, comscore_theater, comscore_city)
        DO UPDATE SET
          action = EXCLUDED.action,
          venue_name = EXCLUDED.venue_name,
          venue_city = EXCLUDED.venue_city,
          created_at = NOW()
        RETURNING id, comscore_theater, comscore_city, action, venue_name, venue_city
      `;

      return res.status(200).json({ override: rows[0] });

    } catch (err) {
      console.error('PUT /api/overrides error:', err);
      return res.status(500).json({ error: 'Failed to save override' });
    }
  }

  return res.status(405).json({ error: `Method ${req.method} not allowed` });
}
