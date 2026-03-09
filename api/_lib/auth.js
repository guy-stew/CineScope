// api/_lib/auth.js
// ─────────────────────────────────────────────
// Clerk authentication for Vercel serverless
// ─────────────────────────────────────────────
// Verifies the Clerk session token from the
// request, then looks up (or creates) the
// internal user record in our database.
//
// v3.4: Added admin impersonation support.
//   If the caller is an admin and sends the
//   X-Impersonate-User-Id header, the returned
//   user object uses the target user's ID instead.
//   This lets admins view/manage other accounts
//   without logging out.
//
// Usage in any API route:
//   const user = await authenticate(req, res);
//   if (!user) return; // 401 already sent
//   // user.id = internal UUID (may be impersonated)
//   // user.clerkId = Clerk user ID (always the real caller)
//   // user.isAdmin = true if the caller is admin
//   // user.impersonating = target user info (if active)
// ─────────────────────────────────────────────

import { verifyToken } from '@clerk/backend';
import { getDb } from './db.js';

export async function authenticate(req, res) {
  try {
    // Extract the session token from the Authorization header
    // Frontend sends: Authorization: Bearer <token>
    const authHeader = req.headers.authorization || req.headers.Authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      res.status(401).json({ error: 'Missing or invalid Authorization header' });
      return null;
    }

    const token = authHeader.split(' ')[1];

    // Verify the token with Clerk
    const payload = await verifyToken(token, {
      secretKey: process.env.CLERK_SECRET_KEY,
    });

    if (!payload || !payload.sub) {
      res.status(401).json({ error: 'Invalid session token' });
      return null;
    }

    const clerkId = payload.sub;

    // Look up the internal user record
    const sql = getDb();
    const rows = await sql`
      SELECT id, clerk_id, email, display_name, is_admin
      FROM users
      WHERE clerk_id = ${clerkId}
    `;

    let realUser;

    if (rows.length === 0) {
      // User exists in Clerk but not in our DB yet.
      // Auto-create the user record.
      const newRows = await sql`
        INSERT INTO users (clerk_id, email)
        VALUES (${clerkId}, ${payload.email || null})
        ON CONFLICT (clerk_id) DO NOTHING
        RETURNING id, clerk_id, email, display_name, is_admin
      `;

      if (newRows.length > 0) {
        realUser = newRows[0];
      } else {
        // Race condition: another request created it between SELECT and INSERT
        const retryRows = await sql`
          SELECT id, clerk_id, email, display_name, is_admin
          FROM users WHERE clerk_id = ${clerkId}
        `;
        if (retryRows.length > 0) {
          realUser = retryRows[0];
        } else {
          res.status(500).json({ error: 'Failed to resolve user record' });
          return null;
        }
      }
    } else {
      realUser = rows[0];
    }

    const isAdmin = realUser.is_admin === true;

    // ── Admin impersonation check ──
    const impersonateUserId = req.headers['x-impersonate-user-id'];

    if (impersonateUserId) {
      // Only admins can impersonate
      if (!isAdmin) {
        res.status(403).json({ error: 'Forbidden: admin access required for impersonation' });
        return null;
      }

      // Look up the target user
      const targetRows = await sql`
        SELECT id, clerk_id, email, display_name
        FROM users
        WHERE id = ${impersonateUserId}
      `;

      if (targetRows.length === 0) {
        res.status(404).json({ error: 'Target user not found' });
        return null;
      }

      const target = targetRows[0];

      // Return the target user's ID for all data queries,
      // but keep the real caller's info for audit/logging
      return {
        id: target.id,              // ← Data scoped to target user
        clerkId: realUser.clerk_id, // ← Real caller (for audit)
        isAdmin: true,
        impersonating: {
          userId: target.id,
          email: target.email,
          displayName: target.display_name,
        },
      };
    }

    // Normal (non-impersonated) return
    return {
      id: realUser.id,
      clerkId: realUser.clerk_id,
      isAdmin,
    };

  } catch (err) {
    console.error('Authentication error:', err);
    res.status(401).json({ error: 'Authentication failed' });
    return null;
  }
}
