// api/webhooks/clerk.js
// ─────────────────────────────────────────────
// POST /api/webhooks/clerk → Clerk webhook handler
// ─────────────────────────────────────────────
// Clerk fires this webhook when a user signs up,
// updates their profile, or deletes their account.
// We use it to create/update the local user record
// in our database.
//
// Setup in Clerk Dashboard:
//   Webhooks → Add Endpoint
//   URL: https://cine-scope-omega.vercel.app/api/webhooks/clerk
//   Events: user.created, user.updated, user.deleted
//   Copy the Signing Secret → add as CLERK_WEBHOOK_SECRET env var
// ─────────────────────────────────────────────

import { Webhook } from 'svix';
import { getDb } from '../_lib/db.js';

// Vercel serverless: need raw body for signature verification
export const config = {
  api: {
    bodyParser: false,
  },
};

// Read raw body from request
async function getRawBody(req) {
  const chunks = [];
  for await (const chunk of req) {
    chunks.push(typeof chunk === 'string' ? Buffer.from(chunk) : chunk);
  }
  return Buffer.concat(chunks);
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    // ── Verify webhook signature ──
    const webhookSecret = process.env.CLERK_WEBHOOK_SECRET;
    if (!webhookSecret) {
      console.error('CLERK_WEBHOOK_SECRET not set');
      return res.status(500).json({ error: 'Webhook secret not configured' });
    }

    const rawBody = await getRawBody(req);
    const svixId = req.headers['svix-id'];
    const svixTimestamp = req.headers['svix-timestamp'];
    const svixSignature = req.headers['svix-signature'];

    if (!svixId || !svixTimestamp || !svixSignature) {
      return res.status(400).json({ error: 'Missing Svix headers' });
    }

    const wh = new Webhook(webhookSecret);
    let event;

    try {
      event = wh.verify(rawBody.toString(), {
        'svix-id': svixId,
        'svix-timestamp': svixTimestamp,
        'svix-signature': svixSignature,
      });
    } catch (verifyErr) {
      console.error('Webhook signature verification failed:', verifyErr);
      return res.status(400).json({ error: 'Invalid signature' });
    }

    // ── Handle events ──
    const sql = getDb();
    const { type, data } = event;

    if (type === 'user.created' || type === 'user.updated') {
      const clerkId = data.id;
      const email = data.email_addresses?.[0]?.email_address || null;
      const displayName = [data.first_name, data.last_name]
        .filter(Boolean).join(' ') || null;

      await sql`
        INSERT INTO users (clerk_id, email, display_name)
        VALUES (${clerkId}, ${email}, ${displayName})
        ON CONFLICT (clerk_id)
        DO UPDATE SET
          email = EXCLUDED.email,
          display_name = EXCLUDED.display_name
      `;

      console.log(`User ${type}: ${clerkId} (${email})`);
    }

    if (type === 'user.deleted') {
      const clerkId = data.id;
      await sql`
        DELETE FROM users WHERE clerk_id = ${clerkId}
      `;
      // CASCADE will remove all their films, revenues, overrides, settings
      console.log(`User deleted: ${clerkId}`);
    }

    return res.status(200).json({ received: true });

  } catch (err) {
    console.error('Webhook handler error:', err);
    return res.status(500).json({ error: 'Webhook processing failed' });
  }
}
