// api/settings/index.js
// ─────────────────────────────────────────────
// GET /api/settings  → Get all settings for user
// PUT /api/settings  → Upsert one or more settings
// ─────────────────────────────────────────────

import { getDb } from '../_lib/db.js';
import { authenticate } from '../_lib/auth.js';

export default async function handler(req, res) {
  const user = await authenticate(req, res);
  if (!user) return;

  const sql = getDb();

  // ── GET: All settings as a flat key-value object ──
  if (req.method === 'GET') {
    try {
      const rows = await sql`
        SELECT setting_key, setting_value
        FROM user_settings
        WHERE user_id = ${user.id}
      `;

      // Flatten into { grade_mode: "quartiles", theme: "dark", ... }
      const settings = {};
      for (const row of rows) {
        settings[row.setting_key] = row.setting_value;
      }

      return res.status(200).json({ settings });

    } catch (err) {
      console.error('GET /api/settings error:', err);
      return res.status(500).json({ error: 'Failed to fetch settings' });
    }
  }

  // ── PUT: Upsert one or more settings ──
  // Body: { grade_mode: "quartiles", theme: "dark", ... }
  // Each key-value pair is upserted independently.
  if (req.method === 'PUT') {
    try {
      const settings = req.body;

      if (!settings || typeof settings !== 'object') {
        return res.status(400).json({ error: 'Body must be a JSON object of key-value pairs' });
      }

      const entries = Object.entries(settings);
      if (entries.length === 0) {
        return res.status(400).json({ error: 'No settings provided' });
      }

      // Validate key length
      for (const [key] of entries) {
        if (key.length > 50) {
          return res.status(400).json({ error: `Setting key "${key}" exceeds 50 characters` });
        }
      }

      // Upsert all settings in a single query using unnest
      const keys = entries.map(([k]) => k);
      const values = entries.map(([, v]) => JSON.stringify(v));

      await sql`
        INSERT INTO user_settings (user_id, setting_key, setting_value)
        SELECT
          ${user.id},
          unnest(${keys}::text[]),
          unnest(${values}::jsonb[])
        ON CONFLICT (user_id, setting_key)
        DO UPDATE SET
          setting_value = EXCLUDED.setting_value,
          updated_at = NOW()
      `;

      return res.status(200).json({
        updated: keys,
        message: `Updated ${keys.length} setting(s)`
      });

    } catch (err) {
      console.error('PUT /api/settings error:', err);
      return res.status(500).json({ error: 'Failed to save settings' });
    }
  }

  return res.status(405).json({ error: `Method ${req.method} not allowed` });
}
