// api/venues/index.js
// ─────────────────────────────────────────────
// GET    /api/venues             → List all venues for user
// GET    /api/venues?id=123      → Get single venue
// GET    /api/venues?search=X    → Search venues by name/city/chain
// POST   /api/venues             → Add a single new venue
// POST   /api/venues?bulk=true   → Bulk import venues (array)
// PUT    /api/venues?id=123      → Update an existing venue
// PATCH  /api/venues?id=123      → Toggle venue status (open/closed)
// DELETE /api/venues?id=123      → Delete a single venue
// ─────────────────────────────────────────────

import { getDb } from '../_lib/db.js';
import { authenticate } from '../_lib/auth.js';

export default async function handler(req, res) {
  const user = await authenticate(req, res);
  if (!user) return;

  const sql = getDb();
  const { id, search, bulk } = req.query;

  // ── GET ───────────────────────────────────────

  if (req.method === 'GET') {

    // Single venue by ID
    if (id) {
      try {
        const rows = await sql`
          SELECT id, name, comscore_name, city, country,
                 chain, category, lat, lng, address, postcode,
                 place_id, status, source, notes,
                 created_at, updated_at
          FROM venues
          WHERE id = ${id} AND user_id = ${user.id}
        `;

        if (rows.length === 0) {
          return res.status(404).json({ error: 'Venue not found' });
        }

        return res.status(200).json({ venue: rows[0] });

      } catch (err) {
        console.error(`GET /api/venues?id=${id} error:`, err);
        return res.status(500).json({ error: 'Failed to fetch venue' });
      }
    }

    // Search venues by name, city, or chain
    if (search) {
      try {
        const term = `%${search}%`;
        const venues = await sql`
          SELECT id, name, comscore_name, city, country,
                 chain, category, lat, lng, address, postcode,
                 place_id, status, source, notes
          FROM venues
          WHERE user_id = ${user.id}
            AND (
              name ILIKE ${term}
              OR city ILIKE ${term}
              OR chain ILIKE ${term}
              OR comscore_name ILIKE ${term}
            )
          ORDER BY name ASC
          LIMIT 100
        `;
        return res.status(200).json({ venues });

      } catch (err) {
        console.error('GET /api/venues?search error:', err);
        return res.status(500).json({ error: 'Failed to search venues' });
      }
    }

    // List all venues (full list for app startup)
    try {
      const venues = await sql`
        SELECT id, name, comscore_name, city, country,
               chain, category, lat, lng, address, postcode,
               place_id, status, source, notes
        FROM venues
        WHERE user_id = ${user.id}
        ORDER BY name ASC
      `;
      return res.status(200).json({ venues });

    } catch (err) {
      console.error('GET /api/venues error:', err);
      return res.status(500).json({ error: 'Failed to fetch venues' });
    }
  }

  // ── POST: Add venue(s) ────────────────────────

  if (req.method === 'POST') {

    // Bulk import
    if (bulk === 'true') {
      try {
        const { venues: venueList } = req.body;

        if (!venueList || !Array.isArray(venueList) || venueList.length === 0) {
          return res.status(400).json({ error: 'Missing required field: venues[] (non-empty array)' });
        }

        // Validate each venue
        const errors = [];
        const valid = [];

        for (let i = 0; i < venueList.length; i++) {
          const v = venueList[i];
          const rowErrors = [];

          if (!v.name?.trim()) rowErrors.push('name is required');
          if (!v.comscoreName?.trim()) rowErrors.push('comscoreName is required');
          if (!v.city?.trim()) rowErrors.push('city is required');
          if (!v.country?.trim()) rowErrors.push('country is required');
          if (!v.category?.trim()) rowErrors.push('category is required');

          if (v.country && !['United Kingdom', 'Ireland'].includes(v.country.trim())) {
            rowErrors.push('country must be "United Kingdom" or "Ireland"');
          }
          if (v.category && !['Large Chain', 'Small Chain', 'Independent'].includes(v.category.trim())) {
            rowErrors.push('category must be "Large Chain", "Small Chain", or "Independent"');
          }

          if (rowErrors.length > 0) {
            errors.push({ row: i + 1, name: v.name || '(empty)', errors: rowErrors });
          } else {
            valid.push(v);
          }
        }

        if (errors.length > 0 && valid.length === 0) {
          return res.status(400).json({ error: 'All rows have validation errors', errors });
        }

        // Insert valid venues in batches of 50
        const batchSize = 50;
        let inserted = 0;
        const duplicates = [];

        for (let i = 0; i < valid.length; i += batchSize) {
          const batch = valid.slice(i, i + batchSize);

          const names = batch.map(v => v.name.trim());
          const comscoreNames = batch.map(v => v.comscoreName.trim());
          const cities = batch.map(v => v.city.trim());
          const countries = batch.map(v => v.country.trim());
          const chains = batch.map(v => v.chain?.trim() || null);
          const categories = batch.map(v => v.category.trim());
          const lats = batch.map(v => v.lat != null ? parseFloat(v.lat) : null);
          const lngs = batch.map(v => v.lng != null ? parseFloat(v.lng) : null);
          const addresses = batch.map(v => v.address?.trim() || null);
          const postcodes = batch.map(v => v.postcode?.trim() || null);
          const statuses = batch.map(v => {
            const s = v.status?.trim()?.toLowerCase();
            return (s === 'closed') ? 'closed' : 'open';
          });
          const notesList = batch.map(v => v.notes?.trim() || null);

          try {
            const result = await sql`
              INSERT INTO venues (
                user_id, name, comscore_name, city, country,
                chain, category, lat, lng, address,
                postcode, status, source, notes
              )
              SELECT
                ${user.id},
                unnest(${names}::text[]),
                unnest(${comscoreNames}::text[]),
                unnest(${cities}::text[]),
                unnest(${countries}::text[]),
                unnest(${chains}::text[]),
                unnest(${categories}::text[]),
                unnest(${lats}::numeric[]),
                unnest(${lngs}::numeric[]),
                unnest(${addresses}::text[]),
                unnest(${postcodes}::text[]),
                unnest(${statuses}::text[]),
                'import',
                unnest(${notesList}::text[])
              ON CONFLICT (user_id, name, city) DO NOTHING
              RETURNING id
            `;
            inserted += result.length;
            const skipped = batch.length - result.length;
            if (skipped > 0) {
              // Some were duplicates — figure out which ones
              for (const v of batch) {
                const exists = await sql`
                  SELECT id FROM venues
                  WHERE user_id = ${user.id}
                    AND name = ${v.name.trim()}
                    AND city = ${v.city.trim()}
                `;
                if (exists.length > 0) {
                  duplicates.push({ name: v.name, city: v.city });
                }
              }
            }
          } catch (batchErr) {
            console.error('Bulk insert batch error:', batchErr);
            // Continue with next batch
          }
        }

        return res.status(201).json({
          inserted,
          total: venueList.length,
          duplicates: duplicates.length > 0 ? duplicates : undefined,
          validationErrors: errors.length > 0 ? errors : undefined,
          message: `Imported ${inserted} of ${venueList.length} venues`
        });

      } catch (err) {
        console.error('POST /api/venues?bulk=true error:', err);
        return res.status(500).json({ error: 'Failed to import venues' });
      }
    }

    // Single venue add
    try {
      const {
        name, comscoreName, city, country, chain, category,
        lat, lng, address, postcode, placeId, status, notes
      } = req.body;

      if (!name?.trim() || !comscoreName?.trim() || !city?.trim()) {
        return res.status(400).json({
          error: 'Missing required fields: name, comscoreName, city'
        });
      }

      const venueCountry = country?.trim() || 'United Kingdom';
      const venueCategory = category?.trim() || 'Independent';
      const venueStatus = (status?.trim()?.toLowerCase() === 'closed') ? 'closed' : 'open';

      if (!['United Kingdom', 'Ireland'].includes(venueCountry)) {
        return res.status(400).json({ error: 'country must be "United Kingdom" or "Ireland"' });
      }
      if (!['Large Chain', 'Small Chain', 'Independent'].includes(venueCategory)) {
        return res.status(400).json({ error: 'category must be "Large Chain", "Small Chain", or "Independent"' });
      }

      const rows = await sql`
        INSERT INTO venues (
          user_id, name, comscore_name, city, country,
          chain, category, lat, lng, address,
          postcode, place_id, status, source, notes
        )
        VALUES (
          ${user.id},
          ${name.trim()},
          ${comscoreName.trim()},
          ${city.trim()},
          ${venueCountry},
          ${chain?.trim() || null},
          ${venueCategory},
          ${lat != null ? parseFloat(lat) : null},
          ${lng != null ? parseFloat(lng) : null},
          ${address?.trim() || null},
          ${postcode?.trim() || null},
          ${placeId?.trim() || null},
          ${venueStatus},
          'manual',
          ${notes?.trim() || null}
        )
        RETURNING id, name, comscore_name, city, country,
                  chain, category, lat, lng, address, postcode,
                  place_id, status, source, notes,
                  created_at, updated_at
      `;

      return res.status(201).json({ venue: rows[0] });

    } catch (err) {
      // Handle unique constraint violation
      if (err.code === '23505') {
        return res.status(409).json({
          error: 'A venue with this name and city already exists'
        });
      }
      console.error('POST /api/venues error:', err);
      return res.status(500).json({ error: 'Failed to add venue' });
    }
  }

  // ── PUT: Update an existing venue ─────────────

  if (req.method === 'PUT') {
    if (!id) {
      return res.status(400).json({ error: 'Missing required query parameter: id' });
    }

    try {
      const {
        name, comscoreName, city, country, chain, category,
        lat, lng, address, postcode, placeId, status, notes
      } = req.body;

      // Validate enum fields if provided
      if (country && !['United Kingdom', 'Ireland'].includes(country.trim())) {
        return res.status(400).json({ error: 'country must be "United Kingdom" or "Ireland"' });
      }
      if (category && !['Large Chain', 'Small Chain', 'Independent'].includes(category.trim())) {
        return res.status(400).json({ error: 'category must be "Large Chain", "Small Chain", or "Independent"' });
      }
      if (status && !['open', 'closed'].includes(status.trim().toLowerCase())) {
        return res.status(400).json({ error: 'status must be "open" or "closed"' });
      }

      // Build dynamic UPDATE — only update provided fields
      // (We use COALESCE-style: if field is undefined, keep the existing value)
      const rows = await sql`
        UPDATE venues SET
          name          = COALESCE(${name?.trim() ?? null},          name),
          comscore_name = COALESCE(${comscoreName?.trim() ?? null},  comscore_name),
          city          = COALESCE(${city?.trim() ?? null},          city),
          country       = COALESCE(${country?.trim() ?? null},       country),
          chain         = ${chain !== undefined ? (chain?.trim() || null) : sql`chain`},
          category      = COALESCE(${category?.trim() ?? null},      category),
          lat           = ${lat !== undefined ? (lat != null ? parseFloat(lat) : null) : sql`lat`},
          lng           = ${lng !== undefined ? (lng != null ? parseFloat(lng) : null) : sql`lng`},
          address       = ${address !== undefined ? (address?.trim() || null) : sql`address`},
          postcode      = ${postcode !== undefined ? (postcode?.trim() || null) : sql`postcode`},
          place_id      = ${placeId !== undefined ? (placeId?.trim() || null) : sql`place_id`},
          status        = COALESCE(${status?.trim()?.toLowerCase() ?? null}, status),
          notes         = ${notes !== undefined ? (notes?.trim() || null) : sql`notes`}
        WHERE id = ${id} AND user_id = ${user.id}
        RETURNING id, name, comscore_name, city, country,
                  chain, category, lat, lng, address, postcode,
                  place_id, status, source, notes,
                  created_at, updated_at
      `;

      if (rows.length === 0) {
        return res.status(404).json({ error: 'Venue not found' });
      }

      return res.status(200).json({ venue: rows[0] });

    } catch (err) {
      if (err.code === '23505') {
        return res.status(409).json({
          error: 'A venue with this name and city already exists'
        });
      }
      console.error(`PUT /api/venues?id=${id} error:`, err);
      return res.status(500).json({ error: 'Failed to update venue' });
    }
  }

  // ── PATCH: Toggle venue status ────────────────

  if (req.method === 'PATCH') {
    if (!id) {
      return res.status(400).json({ error: 'Missing required query parameter: id' });
    }

    try {
      const { status } = req.body;

      if (!status || !['open', 'closed'].includes(status.trim().toLowerCase())) {
        return res.status(400).json({ error: 'status must be "open" or "closed"' });
      }

      const rows = await sql`
        UPDATE venues
        SET status = ${status.trim().toLowerCase()}
        WHERE id = ${id} AND user_id = ${user.id}
        RETURNING id, name, city, status
      `;

      if (rows.length === 0) {
        return res.status(404).json({ error: 'Venue not found' });
      }

      return res.status(200).json({ venue: rows[0] });

    } catch (err) {
      console.error(`PATCH /api/venues?id=${id} error:`, err);
      return res.status(500).json({ error: 'Failed to update venue status' });
    }
  }

  // ── DELETE ────────────────────────────────────

  if (req.method === 'DELETE') {
    if (!id) {
      return res.status(400).json({ error: 'Missing required query parameter: id' });
    }

    try {
      const result = await sql`
        DELETE FROM venues
        WHERE id = ${id} AND user_id = ${user.id}
        RETURNING id, name, city
      `;

      if (result.length === 0) {
        return res.status(404).json({ error: 'Venue not found' });
      }

      return res.status(200).json({
        deleted: result[0],
        message: `Deleted venue "${result[0].name}" (${result[0].city})`
      });

    } catch (err) {
      console.error(`DELETE /api/venues?id=${id} error:`, err);
      return res.status(500).json({ error: 'Failed to delete venue' });
    }
  }

  return res.status(405).json({ error: `Method ${req.method} not allowed` });
}
