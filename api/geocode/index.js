// api/geocode/index.js
// ─────────────────────────────────────────────
// GET /api/geocode?address=X&postcode=Y&country=Z
// ─────────────────────────────────────────────
// Thin proxy to OpenStreetMap Nominatim API.
// Adds the required User-Agent header and keeps
// the Nominatim URL off the client.
//
// Nominatim fair use policy:
//   - Max 1 request per second (enforced client-side)
//   - Must include a valid User-Agent
//   - No heavy bulk usage
//
// We don't need Clerk auth for this since it's
// a simple read-only lookup with no user data.
// However, we still authenticate to prevent
// abuse from unauthenticated callers.
// ─────────────────────────────────────────────

import { authenticate } from '../_lib/auth.js';

const NOMINATIM_URL = 'https://nominatim.openstreetmap.org/search';
const USER_AGENT = 'CineScope/2.0 (cinescope.pro; cinema analytics)';

export default async function handler(req, res) {
  // Auth check to prevent abuse
  const user = await authenticate(req, res);
  if (!user) return;

  if (req.method !== 'GET') {
    return res.status(405).json({ error: `Method ${req.method} not allowed` });
  }

  const { address, postcode, country } = req.query;

  if (!address && !postcode) {
    return res.status(400).json({
      error: 'At least one of address or postcode is required'
    });
  }

  try {
    // Build search query — postcode is most reliable,
    // fall back to full address
    let query = '';
    const countryCode = (country?.toLowerCase()?.includes('ireland')) ? 'ie' : 'gb';

    if (postcode && address) {
      // Best: combine both for accuracy
      query = `${address}, ${postcode}`;
    } else if (postcode) {
      query = postcode;
    } else {
      query = address;
    }

    const params = new URLSearchParams({
      q: query,
      countrycodes: countryCode,
      format: 'json',
      limit: '3',
      addressdetails: '1',
    });

    const response = await fetch(`${NOMINATIM_URL}?${params}`, {
      headers: {
        'User-Agent': USER_AGENT,
        'Accept': 'application/json',
      },
    });

    if (!response.ok) {
      console.error(`Nominatim error: ${response.status} ${response.statusText}`);
      return res.status(502).json({ error: 'Geocoding service unavailable' });
    }

    const results = await response.json();

    if (!results || results.length === 0) {
      // If combined query failed and we have both, try postcode only
      if (postcode && address) {
        const fallbackParams = new URLSearchParams({
          q: postcode,
          countrycodes: countryCode,
          format: 'json',
          limit: '3',
          addressdetails: '1',
        });

        const fallbackRes = await fetch(`${NOMINATIM_URL}?${fallbackParams}`, {
          headers: {
            'User-Agent': USER_AGENT,
            'Accept': 'application/json',
          },
        });

        if (fallbackRes.ok) {
          const fallbackResults = await fallbackRes.json();
          if (fallbackResults && fallbackResults.length > 0) {
            return res.status(200).json({
              results: fallbackResults.map(formatResult),
              method: 'postcode_fallback',
            });
          }
        }
      }

      return res.status(200).json({
        results: [],
        method: 'not_found',
      });
    }

    return res.status(200).json({
      results: results.map(formatResult),
      method: (postcode && address) ? 'address_and_postcode' : (postcode ? 'postcode' : 'address'),
    });

  } catch (err) {
    console.error('Geocode proxy error:', err);
    return res.status(500).json({ error: 'Geocoding lookup failed' });
  }
}

/**
 * Extract the fields we need from a Nominatim result.
 */
function formatResult(r) {
  return {
    lat: parseFloat(r.lat),
    lng: parseFloat(r.lon),
    displayName: r.display_name,
    type: r.type,
    importance: r.importance,
    address: {
      road: r.address?.road,
      suburb: r.address?.suburb,
      city: r.address?.city || r.address?.town || r.address?.village,
      county: r.address?.county,
      postcode: r.address?.postcode,
      country: r.address?.country,
    },
  };
}
