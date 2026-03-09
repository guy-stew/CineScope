// api/admin/index.js
// ─────────────────────────────────────────────
// CineScope — Admin API (v3.4)
// ─────────────────────────────────────────────
// Admin-only endpoints for user management
// and impersonation support.
//
// Routes:
//   GET  /api/admin?action=users   — List all users (admin only)
//   GET  /api/admin?action=me      — Get current user info + admin status
// ─────────────────────────────────────────────

import { authenticate } from '../_lib/auth.js';
import { getDb } from '../_lib/db.js';

export default async function handler(req, res) {
  // ── CORS preflight ──
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // Authenticate (no impersonation header used here — always the real user)
  // We do a manual auth check instead of the standard authenticate()
  // because we need to ensure the REAL user is admin, not an impersonated one.
  const user = await authenticate(req, res);
  if (!user) return; // 401 already sent

  const action = req.query.action || 'me';
  const sql = getDb();

  // ─── GET ?action=me — Current user info ───
  // Returns the real caller's info + admin status.
  // Available to all authenticated users (not admin-gated).
  if (action === 'me') {
    // If we're impersonating, the user.id is the target.
    // We need the REAL user's info. Use user.clerkId which is always the caller.
    const rows = await sql`
      SELECT id, clerk_id, email, display_name, is_admin
      FROM users
      WHERE clerk_id = ${user.clerkId}
    `;

    if (rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }

    const me = rows[0];
    return res.status(200).json({
      user: {
        id: me.id,
        email: me.email,
        displayName: me.display_name,
        isAdmin: me.is_admin === true,
      },
    });
  }

  // ─── GET ?action=users — List all users (admin only) ───
  if (action === 'users') {
    if (!user.isAdmin) {
      return res.status(403).json({ error: 'Forbidden: admin access required' });
    }

    const rows = await sql`
      SELECT id, email, display_name, is_admin, created_at
      FROM users
      ORDER BY display_name ASC NULLS LAST, email ASC
    `;

    return res.status(200).json({
      users: rows.map(r => ({
        id: r.id,
        email: r.email,
        displayName: r.display_name,
        isAdmin: r.is_admin === true,
        createdAt: r.created_at,
      })),
    });
  }

  return res.status(400).json({ error: `Unknown action: ${action}` });
}
