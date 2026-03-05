/**
 * CineScope — Venue Management API Client
 *
 * Additions for /api/venues and /api/geocode endpoints.
 * Same auth pattern as existing apiClient.js methods.
 *
 * INTEGRATION: Keep as separate file (VenueManager imports directly)
 * or merge into apiClient.js if preferred.
 */

const API_BASE = '/api'

async function authFetch(url, getToken, options = {}) {
  const token = await getToken()
  const res = await fetch(url, {
    ...options,
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      ...options.headers,
    },
  })
  if (!res.ok) {
    const body = await res.text().catch(() => '')
    throw new Error(body || `API error ${res.status}: ${res.statusText}`)
  }
  return res.json()
}


// ── Venue CRUD ──────────────────────────────────────────────────

/**
 * Load all venues for the current user.
 * Returns { venues: [...] }
 */
export async function getVenues(getToken) {
  return authFetch(`${API_BASE}/venues`, getToken)
}

/**
 * Search venues by name, city, or chain (server-side filtering).
 * Returns { venues: [...] }
 */
export async function searchVenues(query, getToken) {
  return authFetch(
    `${API_BASE}/venues?search=${encodeURIComponent(query)}`,
    getToken
  )
}

/**
 * Add a single new venue. Returns the created venue object.
 */
export async function addVenue(data, getToken) {
  return authFetch(`${API_BASE}/venues`, getToken, {
    method: 'POST',
    body: JSON.stringify(data),
  })
}

/**
 * Update an existing venue (partial update — send changed fields only).
 */
export async function updateVenue(id, data, getToken) {
  return authFetch(`${API_BASE}/venues/${id}`, getToken, {
    method: 'PUT',
    body: JSON.stringify(data),
  })
}

/**
 * Toggle a venue's status between 'open' and 'closed'.
 */
export async function toggleVenueStatus(id, getToken) {
  return authFetch(`${API_BASE}/venues/${id}/status`, getToken, {
    method: 'PATCH',
  })
}

/**
 * Bulk import venues from spreadsheet data.
 * Accepts an array of venue objects.
 * Returns { imported: N, skipped: N, errors: [...] }
 */
export async function importVenues(venues, getToken) {
  return authFetch(`${API_BASE}/venues/import`, getToken, {
    method: 'POST',
    body: JSON.stringify({ venues }),
  })
}


// ── Geocoding ───────────────────────────────────────────────────

/**
 * Geocode an address via the server-side Nominatim proxy.
 * Returns { lat, lng, display_name } or { error }.
 */
export async function geocodeAddress({ address, postcode, country }, getToken) {
  return authFetch(`${API_BASE}/geocode`, getToken, {
    method: 'POST',
    body: JSON.stringify({ address, postcode, country }),
  })
}
