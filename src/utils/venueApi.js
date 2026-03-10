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
  return authFetch(`${API_BASE}/venues?id=${id}`, getToken, {
    method: 'PUT',
    body: JSON.stringify(data),
  })
}

/**
 * Toggle a venue's status between 'open' and 'closed'.
 * Requires the new status in the request body.
 */
export async function toggleVenueStatus(id, newStatus, getToken) {
  return authFetch(`${API_BASE}/venues?id=${id}`, getToken, {
    method: 'PATCH',
    body: JSON.stringify({ status: newStatus }),
  })
}

/**
 * Delete a venue permanently. Only works for manual/import venues.
 */
export async function deleteVenue(id, getToken) {
  return authFetch(`${API_BASE}/venues?id=${id}`, getToken, {
    method: 'DELETE',
  })
}

/**
 * Bulk import venues from spreadsheet data.
 * Accepts an array of venue objects.
 * Returns { imported: N, skipped: N, errors: [...] }
 */
export async function importVenues(venues, getToken) {
  return authFetch(`${API_BASE}/venues?bulk=true`, getToken, {
    method: 'POST',
    body: JSON.stringify({ venues }),
  })
}


// ── Geocoding ───────────────────────────────────────────────────

/**
 * Geocode an address via the server-side Nominatim proxy.
 * Returns { results: [...], method } — caller picks the best result.
 */
export async function geocodeAddress({ address, postcode, country }, getToken) {
  const params = new URLSearchParams()
  if (address) params.set('address', address)
  if (postcode) params.set('postcode', postcode)
  if (country) params.set('country', country)

  const data = await authFetch(`${API_BASE}/geocode?${params}`, getToken)

  // Return the top result in the shape VenueForm expects
  if (data.results && data.results.length > 0) {
    const top = data.results[0]
    return {
      lat: top.lat,
      lng: top.lng,
      display_name: top.displayName,
    }
  }

  return { error: 'No results found. Try a different address or postcode.' }
}
