// api/_lib/auth.js
// ─────────────────────────────────────────────
// Clerk authentication for Vercel serverless
// ─────────────────────────────────────────────
// Verifies the Clerk session token from the
// request, then looks up (or creates) the
// internal user record in our database.
//
// Usage in any API route:
//   const user = await authenticate(req, res);
//   if (!user) return; // 401 already sent
//   // user.id = our internal UUID
//   // user.clerkId = Clerk user ID
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
      SELECT id, clerk_id, email, display_name
      FROM users
      WHERE clerk_id = ${clerkId}
    `;

    if (rows.length === 0) {
      // User exists in Clerk but not in our DB yet.
      // This can happen if the webhook hasn't fired yet,
      // or during development. Auto-create the user record.
      const newRows = await sql`
        INSERT INTO users (clerk_id, email)
        VALUES (${clerkId}, ${payload.email || null})
        ON CONFLICT (clerk_id) DO NOTHING
        RETURNING id, clerk_id, email, display_name
      `;

      if (newRows.length > 0) {
        return { id: newRows[0].id, clerkId: newRows[0].clerk_id };
      }

      // Race condition: another request created it between SELECT and INSERT
      const retryRows = await sql`
        SELECT id, clerk_id FROM users WHERE clerk_id = ${clerkId}
      `;
      if (retryRows.length > 0) {
        return { id: retryRows[0].id, clerkId: retryRows[0].clerk_id };
      }

      res.status(500).json({ error: 'Failed to resolve user record' });
      return null;
    }

    return { id: rows[0].id, clerkId: rows[0].clerk_id };

  } catch (err) {
    console.error('Authentication error:', err);
    res.status(401).json({ error: 'Authentication failed' });
    return null;
  }
}
