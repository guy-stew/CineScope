// src/utils/geocoder.js
// ─────────────────────────────────────────────
// CineScope Geocoder — address/postcode → lat/lng
// ─────────────────────────────────────────────
// Wraps calls to /api/geocode (Nominatim proxy).
// Handles rate limiting (1 req/sec) for bulk use.
// ─────────────────────────────────────────────

const API_BASE = '/api';

/**
 * Geocode a single address/postcode.
 *
 * @param {Object} params
 * @param {string} [params.address]  - Full street address
 * @param {string} [params.postcode] - Postcode or Eircode
 * @param {string} [params.country]  - 'United Kingdom' or 'Ireland'
 * @param {Function} getToken - Clerk getToken function
 * @returns {{ lat: number, lng: number, displayName: string } | null}
 */
export async function geocodeAddress({ address, postcode, country }, getToken) {
  if (!address && !postcode) return null;

  const token = await getToken();
  if (!token) throw new Error('Not authenticated');

  const params = new URLSearchParams();
  if (address) params.set('address', address);
  if (postcode) params.set('postcode', postcode);
  if (country) params.set('country', country);

  const res = await fetch(`${API_BASE}/geocode?${params}`, {
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(err.error || `Geocode error: ${res.status}`);
  }

  const data = await res.json();

  if (!data.results || data.results.length === 0) {
    return null;
  }

  // Return the best (first) result
  const best = data.results[0];
  return {
    lat: best.lat,
    lng: best.lng,
    displayName: best.displayName,
    method: data.method,
  };
}


/**
 * Geocode multiple venues with rate limiting.
 * Nominatim allows 1 request per second.
 *
 * @param {Array} venues - Array of { address?, postcode?, country? }
 * @param {Function} getToken - Clerk getToken function
 * @param {Function} [onProgress] - Callback: (completed, total, currentVenue) => void
 * @returns {Array} - Same array with lat/lng added (or null if failed)
 */
export async function geocodeBatch(venues, getToken, onProgress) {
  const results = [];

  for (let i = 0; i < venues.length; i++) {
    const venue = venues[i];

    // Skip if already has coordinates
    if (venue.lat != null && venue.lng != null &&
        venue.lat !== '' && venue.lng !== '') {
      results.push({ ...venue, geocodeStatus: 'existing' });
      if (onProgress) onProgress(i + 1, venues.length, venue);
      continue;
    }

    // Need geocoding — must have address or postcode
    if (!venue.address && !venue.postcode) {
      results.push({ ...venue, geocodeStatus: 'no_address' });
      if (onProgress) onProgress(i + 1, venues.length, venue);
      continue;
    }

    try {
      const result = await geocodeAddress({
        address: venue.address,
        postcode: venue.postcode,
        country: venue.country,
      }, getToken);

      if (result) {
        results.push({
          ...venue,
          lat: result.lat,
          lng: result.lng,
          geocodeStatus: 'success',
          geocodeDisplayName: result.displayName,
        });
      } else {
        results.push({ ...venue, geocodeStatus: 'not_found' });
      }
    } catch (err) {
      console.error(`Geocode failed for "${venue.name}":`, err.message);
      results.push({ ...venue, geocodeStatus: 'error', geocodeError: err.message });
    }

    if (onProgress) onProgress(i + 1, venues.length, venue);

    // Rate limit: wait 1.1 seconds between geocoding requests
    // (only if we actually made a request AND there are more to go)
    if (i < venues.length - 1) {
      await new Promise(resolve => setTimeout(resolve, 1100));
    }
  }

  return results;
}
