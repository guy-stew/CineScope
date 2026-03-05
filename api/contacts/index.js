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

import { verifyAuth } from '../_lib/auth.js';
import { query } from '../_lib/db.js';

export default async function handler(req, res) {
  // ── CORS preflight ──
  if (req.method === 'OPTIONS') {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, PUT, DELETE, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    return res.status(200).end();
  }

  // ── Auth ──
  let userId;
  try {
    const auth = await verifyAuth(req);
    userId = auth.userId;
  } catch (err) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  try {
    // ═══════════════════════════════════════════════════
    // GET — Resolve contact or list chain contacts
    // ═══════════════════════════════════════════════════
    if (req.method === 'GET') {
      const { venue_name, venue_city, chain, list } = req.query;

      // ── List all contacts for a chain ──
      if (list === 'true' && chain) {
        const result = await query(
          `SELECT * FROM venue_contacts
           WHERE user_id = $1 AND chain_name = $2
           ORDER BY scope ASC, venue_name ASC`,
          [userId, chain]
        );
        return res.status(200).json({ contacts: result.rows });
      }

      // ── Resolve single venue contact ──
      if (!chain) {
        return res.status(400).json({ error: 'Missing required parameter: chain' });
      }

      // Step 1: Check for venue-specific override
      let contact = null;
      if (venue_name && venue_city) {
        const venueResult = await query(
          `SELECT * FROM venue_contacts
           WHERE user_id = $1
             AND scope = 'venue'
             AND chain_name = $2
             AND venue_name = $3
             AND venue_city = $4
           LIMIT 1`,
          [userId, chain, venue_name, venue_city]
        );
        if (venueResult.rows.length > 0) {
          contact = venueResult.rows[0];
        }
      }

      // Step 2: Fall back to chain default
      if (!contact) {
        const chainResult = await query(
          `SELECT * FROM venue_contacts
           WHERE user_id = $1
             AND scope = 'chain'
             AND chain_name = $2
           LIMIT 1`,
          [userId, chain]
        );
        if (chainResult.rows.length > 0) {
          contact = chainResult.rows[0];
        }
      }

      // Return resolved contact (or null if none found)
      return res.status(200).json({
        contact: contact || null,
        // Tell the frontend which level was resolved so it can show
        // the "Custom contact" badge / "Reset to chain default" button
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

      // Upsert using the unique constraint
      // COALESCE matches the constraint definition for NULL handling
      const result = await query(
        `INSERT INTO venue_contacts (
            user_id, scope, chain_name, venue_name, venue_city,
            manager_name, booking_contact_name, booking_contact_email, notes
         )
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
         ON CONFLICT ON CONSTRAINT uq_contacts_scope
         DO UPDATE SET
            manager_name = EXCLUDED.manager_name,
            booking_contact_name = EXCLUDED.booking_contact_name,
            booking_contact_email = EXCLUDED.booking_contact_email,
            notes = EXCLUDED.notes,
            updated_at = NOW()
         RETURNING *`,
        [userId, scope, chain_name, venue_name, venue_city,
         manager_name, booking_contact_name, booking_contact_email, notes]
      );

      return res.status(200).json({ contact: result.rows[0] });
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
      const result = await query(
        `DELETE FROM venue_contacts
         WHERE id = $1 AND user_id = $2 AND scope = 'venue'
         RETURNING id`,
        [id, userId]
      );

      if (result.rows.length === 0) {
        return res.status(404).json({
          error: 'Contact not found, not owned by you, or is a chain-level record (use PUT to clear chain contacts)'
        });
      }

      return res.status(200).json({ deleted: true, id: result.rows[0].id });
    }

    // ── Method not allowed ──
    res.setHeader('Allow', 'GET, PUT, DELETE, OPTIONS');
    return res.status(405).json({ error: `Method ${req.method} not allowed` });

  } catch (err) {
    console.error('Contacts API error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
}
