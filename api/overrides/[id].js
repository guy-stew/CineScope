// api/overrides/[id].js
// ─────────────────────────────────────────────
// DELETE /api/overrides/:id  → Remove an override
// ─────────────────────────────────────────────

import { getDb } from '../_lib/db.js';
import { authenticate } from '../_lib/auth.js';

export default async function handler(req, res) {
  const user = await authenticate(req, res);
  if (!user) return;

  const sql = getDb();
  const { id } = req.query;

  if (req.method === 'DELETE') {
    try {
      const result = await sql`
        DELETE FROM match_overrides
        WHERE id = ${id} AND user_id = ${user.id}
        RETURNING id, comscore_theater, comscore_city
      `;

      if (result.length === 0) {
        return res.status(404).json({ error: 'Override not found' });
      }

      return res.status(200).json({
        deleted: result[0],
        message: 'Override removed — venue will return to auto-matching'
      });

    } catch (err) {
      console.error(`DELETE /api/overrides/${id} error:`, err);
      return res.status(500).json({ error: 'Failed to delete override' });
    }
  }

  return res.status(405).json({ error: `Method ${req.method} not allowed` });
}
