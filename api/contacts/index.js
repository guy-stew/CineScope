// api/contacts/index.js
// ─────────────────────────────────────────────────────────
// CineScope — Venue Contact Management API
// ─────────────────────────────────────────────────────────
// Methods:
//   GET  ?venue_name=X&venue_city=Y&chain=Z  → Resolve contact (venue-specific → chain default)
//   GET  ?chain=X&list=true                   → List all contacts for a chain
//   PUT  body: { scope, chain_name, venue_name?, venue_city?, ...fields }  → Upsert contact
//   DELETE ?id=X                              → Remove a venue-specific override
// ─────────────────────────────────────────────────────────

import { authenticate } from '../_lib/auth.js';
import { getDb } from '../_lib/db.js';

export default async function handler(req, res) {
  // ── CORS preflight ──
  if (req.method === 'OPTIONS') {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, PUT, DELETE, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    return res.status(200).end();
  }

  // ── Auth ──
  const user = await authenticate(req, res);
  if (!user) return; // 401 already sent by authenticate()

  const sql = getDb();
  const userId = user.id;

  try {
    // ═══════════════════════════════════════════════════
    // GET — Resolve contact or list chain contacts
    // ═══════════════════════════════════════════════════
    if (req.method === 'GET') {
      const { venue_name, venue_city, chain, list } = req.query;

      // ── List all contacts for a chain ──
      if (list === 'true' && chain) {
        const rows = await sql`
          SELECT * FROM venue_contacts
          WHERE user_id = ${userId} AND chain_name = ${chain}
          ORDER BY scope ASC, venue_name ASC
        `;
        return res.status(200).json({ contacts: rows });
      }

      // ── Resolve single venue contact ──
      if (!chain) {
        return res.status(400).json({ error: 'Missing required parameter: chain' });
      }

      // Step 1: Check for venue-specific override
      let contact = null;
      if (venue_name && venue_city) {
        const venueRows = await sql`
          SELECT * FROM venue_contacts
          WHERE user_id = ${userId}
            AND scope = 'venue'
            AND chain_name = ${chain}
            AND venue_name = ${venue_name}
            AND venue_city = ${venue_city}
          LIMIT 1
        `;
        if (venueRows.length > 0) {
          contact = venueRows[0];
        }
      }

      // Step 2: Fall back to chain default
      if (!contact) {
        const chainRows = await sql`
          SELECT * FROM venue_contacts
          WHERE user_id = ${userId}
            AND scope = 'chain'
            AND chain_name = ${chain}
          LIMIT 1
        `;
        if (chainRows.length > 0) {
          contact = chainRows[0];
        }
      }

      // Return resolved contact (or null if none found)
      return res.status(200).json({
        contact: contact || null,
        resolved_scope: contact ? contact.scope : null
      });
    }

    // ═══════════════════════════════════════════════════
    // PUT — Upsert a contact record
    // ═══════════════════════════════════════════════════
    if (req.method === 'PUT') {
      const {
        scope,
        chain_name,
        venue_name = null,
        venue_city = null,
        manager_name = null,
        booking_contact_name = null,
        booking_contact_email = null,
        notes = null
      } = req.body;

      // Validation
      if (!scope || !chain_name) {
        return res.status(400).json({ error: 'Missing required fields: scope, chain_name' });
      }
      if (!['chain', 'venue'].includes(scope)) {
        return res.status(400).json({ error: 'scope must be "chain" or "venue"' });
      }
      if (scope === 'venue' && (!venue_name || !venue_city)) {
        return res.status(400).json({ error: 'venue_name and venue_city required for scope="venue"' });
      }

      // Upsert: try update first, then insert if no rows affected
      // This avoids ON CONFLICT issues with the unique index + COALESCE
      const vn = venue_name || '';
      const vc = venue_city || '';

      const existing = await sql`
        SELECT id FROM venue_contacts
        WHERE user_id = ${userId}
          AND scope = ${scope}
          AND chain_name = ${chain_name}
          AND COALESCE(venue_name, '') = ${vn}
          AND COALESCE(venue_city, '') = ${vc}
        LIMIT 1
      `;

      let contact;
      if (existing.length > 0) {
        // Update existing record
        const updated = await sql`
          UPDATE venue_contacts SET
            manager_name = ${manager_name},
            booking_contact_name = ${booking_contact_name},
            booking_contact_email = ${booking_contact_email},
            notes = ${notes},
            updated_at = NOW()
          WHERE id = ${existing[0].id}
          RETURNING *
        `;
        contact = updated[0];
      } else {
        // Insert new record
        const inserted = await sql`
          INSERT INTO venue_contacts (
            user_id, scope, chain_name, venue_name, venue_city,
            manager_name, booking_contact_name, booking_contact_email, notes
          )
          VALUES (
            ${userId}, ${scope}, ${chain_name}, ${venue_name}, ${venue_city},
            ${manager_name}, ${booking_contact_name}, ${booking_contact_email}, ${notes}
          )
          RETURNING *
        `;
        contact = inserted[0];
      }

      return res.status(200).json({ contact });
    }

    // ═══════════════════════════════════════════════════
    // DELETE — Remove a venue-specific override
    // ═══════════════════════════════════════════════════
    if (req.method === 'DELETE') {
      const { id } = req.query;

      if (!id) {
        return res.status(400).json({ error: 'Missing required parameter: id' });
      }

      // Only allow deleting own records, and only venue-level overrides
      const deleted = await sql`
        DELETE FROM venue_contacts
        WHERE id = ${id} AND user_id = ${userId} AND scope = 'venue'
        RETURNING id
      `;

      if (deleted.length === 0) {
        return res.status(404).json({
          error: 'Contact not found, not owned by you, or is a chain-level record (use PUT to clear chain contacts)'
        });
      }

      return res.status(200).json({ deleted: true, id: deleted[0].id });
    }

    // ── Method not allowed ──
    res.setHeader('Allow', 'GET, PUT, DELETE, OPTIONS');
    return res.status(405).json({ error: `Method ${req.method} not allowed` });

  } catch (err) {
    console.error('Contacts API error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
}
