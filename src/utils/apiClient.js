// src/utils/apiClient.js
// ─────────────────────────────────────────────
// CineScope Cloud API Client
// ─────────────────────────────────────────────
// Replaces filmStorage.js (IndexedDB) and
// localStorage calls with cloud API requests.
//
// Uses Clerk's useAuth() token for every request.
// Designed as a drop-in replacement so the rest
// of the app (AppContext, components) needs
// minimal changes.
//
// v2.0.1: Uses query params (?id=) instead of
// path params (/id) to consolidate Vercel
// serverless functions under the Hobby plan
// 12-function limit.
//
// v2.1.0: Added venue contact methods
//
// v3.4.0: Added admin impersonation support.
//   setImpersonateUserId(id) makes all subsequent
//   API calls operate as the target user.
//   clearImpersonation() reverts to own account.
// ─────────────────────────────────────────────

const API_BASE = '/api';

// ─────────────────────────────────────────────
// Impersonation state (module-level singleton)
// ─────────────────────────────────────────────
// When set, every API request includes the
// X-Impersonate-User-Id header. Only works if
// the caller is an admin (server enforces this).
// ─────────────────────────────────────────────
let _impersonateUserId = null;

export function setImpersonateUserId(userId) {
  _impersonateUserId = userId || null;
}

export function clearImpersonation() {
  _impersonateUserId = null;
}

export function getImpersonateUserId() {
  return _impersonateUserId;
}


// ─────────────────────────────────────────────
// Internal: authenticated fetch wrapper
// ─────────────────────────────────────────────

async function apiFetch(path, options = {}, getToken) {
  const token = await getToken();
  if (!token) {
    throw new Error('Not authenticated');
  }

  // Build headers — include impersonation header if active
  const headers = {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${token}`,
    ...(options.headers || {}),
  };

  if (_impersonateUserId) {
    headers['X-Impersonate-User-Id'] = _impersonateUserId;
  }

  const res = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers,
  });

  // Handle non-JSON responses (e.g. SSE streams)
  if (options.raw) return res;

  // Read body as text first to avoid "unexpected end of JSON" on empty responses
  const text = await res.text();

  if (!res.ok) {
    let errMsg = res.statusText || `API error: ${res.status}`;
    try {
      const errBody = JSON.parse(text);
      errMsg = errBody.error || errMsg;
    } catch {}
    throw new Error(errMsg);
  }

  // Parse JSON, handling empty body gracefully
  if (!text || !text.trim()) {
    return null;
  }
  return JSON.parse(text);
}


// ═══════════════════════════════════════════════
// ADMIN
// ═══════════════════════════════════════════════

/**
 * Get current user info (id, email, displayName, isAdmin).
 * Always returns the REAL caller's info, even during impersonation.
 * @param {Function} getToken
 */
export async function getMe(getToken) {
  // Don't send impersonation header for this call —
  // we always want the real user's info
  const token = await getToken();
  const res = await fetch(`${API_BASE}/admin?action=me`, {
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
  });
  const text = await res.text();
  if (!res.ok) throw new Error('Failed to fetch user info');
  return JSON.parse(text);
}

/**
 * List all users (admin only).
 * @param {Function} getToken
 */
export async function getUsers(getToken) {
  const token = await getToken();
  const res = await fetch(`${API_BASE}/admin?action=users`, {
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
  });
  const text = await res.text();
  if (!res.ok) {
    const err = JSON.parse(text);
    throw new Error(err.error || 'Failed to fetch users');
  }
  return JSON.parse(text);
}


// ═══════════════════════════════════════════════
// FILMS
// ═══════════════════════════════════════════════

/**
 * Get all films for the current user (lightweight list, no revenue data).
 * @param {Function} getToken - Clerk getToken function
 * @returns {Array} films
 */
export async function getFilms(getToken) {
  const data = await apiFetch('/films', {}, getToken);
  return data.films;
}

/**
 * Get a single film with all its revenue data.
 * @param {string} filmId
 * @param {Function} getToken
 * @returns {{ film, revenues }}
 */
export async function getFilm(filmId, getToken) {
  return apiFetch(`/films?id=${filmId}`, {}, getToken);
}

/**
 * Save a newly imported film and its revenue data.
 * @param {Object} filmData - { title, year, dateFrom, dateTo, revenues[] }
 * @param {Function} getToken
 * @returns {{ film }} - the created film record
 */
export async function saveFilm(filmData, getToken) {
  return apiFetch('/films', {
    method: 'POST',
    body: JSON.stringify(filmData),
  }, getToken);
}

/**
 * Delete a single film (and all its revenue data).
 * @param {string} filmId
 * @param {Function} getToken
 */
export async function deleteFilm(filmId, getToken) {
  return apiFetch(`/films?id=${filmId}`, { method: 'DELETE' }, getToken);
}

/**
 * Delete all films for the current user.
 * @param {Function} getToken
 */
export async function deleteAllFilms(getToken) {
  return apiFetch('/films', { method: 'DELETE' }, getToken);
}


// ═══════════════════════════════════════════════
// MATCH OVERRIDES
// ═══════════════════════════════════════════════

/**
 * Get all match overrides. Returns both a flat array
 * and a lookup object keyed by "theater|city".
 * @param {Function} getToken
 * @returns {{ overrides, lookup }}
 */
export async function getOverrides(getToken) {
  return apiFetch('/overrides', {}, getToken);
}

/**
 * Create or update a match override.
 * @param {Object} override - { comscoreTheater, comscoreCity, action, venueName?, venueCity? }
 * @param {Function} getToken
 */
export async function saveOverride(override, getToken) {
  return apiFetch('/overrides', {
    method: 'PUT',
    body: JSON.stringify(override),
  }, getToken);
}

/**
 * Delete a match override (revert to auto-matching).
 * @param {string} overrideId
 * @param {Function} getToken
 */
export async function deleteOverride(overrideId, getToken) {
  return apiFetch(`/overrides?id=${overrideId}`, { method: 'DELETE' }, getToken);
}


// ═══════════════════════════════════════════════
// SETTINGS
// ═══════════════════════════════════════════════

/**
 * Get all settings as a flat { key: value } object.
 * @param {Function} getToken
 * @returns {Object} settings
 */
export async function getSettings(getToken) {
  const data = await apiFetch('/settings', {}, getToken);
  return data.settings;
}

/**
 * Save one or more settings.
 * @param {Object} settings - { grade_mode: "quartiles", theme: "dark", ... }
 * @param {Function} getToken
 */
export async function saveSettings(settings, getToken) {
  return apiFetch('/settings', {
    method: 'PUT',
    body: JSON.stringify(settings),
  }, getToken);
}


// ═══════════════════════════════════════════════
// AI REPORT (streaming proxy)
// ═══════════════════════════════════════════════

/**
 * Generate an AI report via the server-side proxy.
 * Returns the raw Response object for SSE streaming.
 *
 * Usage:
 *   const res = await generateAIReport({ system, messages }, getToken);
 *   const reader = res.body.getReader();
 *   // ... read SSE stream as before
 *
 * @param {Object} payload - { model?, system, messages, max_tokens? }
 * @param {Function} getToken
 * @returns {Response} raw fetch response for streaming
 */
export async function generateAIReport(payload, getToken) {
  const res = await apiFetch('/ai/report', {
    method: 'POST',
    body: JSON.stringify(payload),
    raw: true, // Don't parse JSON — return raw Response for streaming
  }, getToken);

  if (!res.ok) {
    const errBody = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(errBody.error || `AI report error: ${res.status}`);
  }

  return res;
}


// ═══════════════════════════════════════════════
// VENUE CONTACTS
// ═══════════════════════════════════════════════

/**
 * Resolve the contact for a specific venue.
 * Checks for venue-specific override first, falls back to chain default.
 *
 * @param {string} venueName - CineScope venue name
 * @param {string} venueCity - CineScope venue city
 * @param {string} chain     - Chain name (e.g. 'Odeon', 'Independent')
 * @param {Function} getToken
 * @returns {{ contact: object|null, resolved_scope: string|null }}
 */
export async function getContact(venueName, venueCity, chain, getToken) {
  const params = new URLSearchParams({
    venue_name: venueName,
    venue_city: venueCity,
    chain: chain,
  });
  return apiFetch(`/contacts?${params}`, {}, getToken);
}

/**
 * Save (upsert) a contact record.
 * For chain-level: scope='chain', chain_name required.
 * For venue-level: scope='venue', chain_name + venue_name + venue_city required.
 *
 * @param {Object} contactData - { scope, chain_name, venue_name?, venue_city?,
 *                                 manager_name?, booking_contact_name?,
 *                                 booking_contact_email?, notes? }
 * @param {Function} getToken
 * @returns {{ contact: object }}
 */
export async function saveContact(contactData, getToken) {
  return apiFetch('/contacts', {
    method: 'PUT',
    body: JSON.stringify(contactData),
  }, getToken);
}

/**
 * Delete a venue-specific contact override (reverts to chain default).
 * Only works for scope='venue' records.
 *
 * @param {string} contactId - UUID of the venue_contacts record to delete
 * @param {Function} getToken
 * @returns {{ deleted: boolean, id: string }}
 */
export async function deleteContact(contactId, getToken) {
  return apiFetch(`/contacts?id=${contactId}`, { method: 'DELETE' }, getToken);
}

/**
 * List all contacts for a specific chain.
 * Useful for a future contacts management screen.
 *
 * @param {string} chain - Chain name (e.g. 'Odeon')
 * @param {Function} getToken
 * @returns {{ contacts: object[] }}
 */
export async function listChainContacts(chain, getToken) {
  const params = new URLSearchParams({
    chain: chain,
    list: 'true',
  });
  return apiFetch(`/contacts?${params}`, {}, getToken);
}

// ═══════════════════════════════════════════════
// VENUES
// ═══════════════════════════════════════════════

/**
 * Get all venues for the current user.
 * Called on app startup to replace the static JSON fetch.
 * @param {Function} getToken - Clerk getToken function
 * @returns {Array} venues
 */
export async function getVenues(getToken) {
  const data = await apiFetch('/venues', {}, getToken);
  return data.venues;
}

/**
 * Get a single venue by ID.
 * @param {number} venueId
 * @param {Function} getToken
 * @returns {{ venue }}
 */
export async function getVenue(venueId, getToken) {
  return apiFetch(`/venues?id=${venueId}`, {}, getToken);
}

/**
 * Search venues by name, city, or chain.
 * @param {string} searchTerm
 * @param {Function} getToken
 * @returns {Array} venues
 */
export async function searchVenues(searchTerm, getToken) {
  const data = await apiFetch(`/venues?search=${encodeURIComponent(searchTerm)}`, {}, getToken);
  return data.venues;
}

/**
 * Add a single new venue.
 * @param {Object} venueData - { name, comscoreName, city, country, chain?,
 *                               category, lat?, lng?, address?, postcode?,
 *                               placeId?, status?, notes? }
 * @param {Function} getToken
 * @returns {{ venue }} - the created venue record
 */
export async function addVenue(venueData, getToken) {
  return apiFetch('/venues', {
    method: 'POST',
    body: JSON.stringify(venueData),
  }, getToken);
}

/**
 * Update an existing venue (partial update — only send changed fields).
 * @param {number} venueId
 * @param {Object} updates - only the fields that changed
 * @param {Function} getToken
 * @returns {{ venue }} - the updated venue record
 */
export async function updateVenue(venueId, updates, getToken) {
  return apiFetch(`/venues?id=${venueId}`, {
    method: 'PUT',
    body: JSON.stringify(updates),
  }, getToken);
}

/**
 * Toggle a venue's status between open and closed.
 * @param {number} venueId
 * @param {string} status - 'open' or 'closed'
 * @param {Function} getToken
 * @returns {{ venue }} - { id, name, city, status }
 */
export async function setVenueStatus(venueId, status, getToken) {
  return apiFetch(`/venues?id=${venueId}`, {
    method: 'PATCH',
    body: JSON.stringify({ status }),
  }, getToken);
}

/**
 * Delete a venue.
 * @param {number} venueId
 * @param {Function} getToken
 * @returns {{ deleted, message }}
 */
export async function deleteVenue(venueId, getToken) {
  return apiFetch(`/venues?id=${venueId}`, { method: 'DELETE' }, getToken);
}

/**
 * Bulk import venues from a spreadsheet.
 * @param {Array} venues - Array of venue objects from the parsed spreadsheet
 * @param {Function} getToken
 * @returns {{ inserted, total, duplicates?, validationErrors?, message }}
 */
export async function importVenues(venues, getToken) {
  return apiFetch('/venues?bulk=true', {
    method: 'POST',
    body: JSON.stringify({ venues }),
  }, getToken);
}

// ═══════════════════════════════════════════════
// FILM CATALOGUE
// ═══════════════════════════════════════════════

/**
 * Get all catalogue entries (lightweight, no tmdb_data blob).
 * Returns { catalogue: [...] } with import_count and total_uk_revenue per entry.
 * @param {Function} getToken
 */
export async function getCatalogue(getToken) {
  return apiFetch('/catalogue', {}, getToken);
}

/**
 * Get a single catalogue entry with full details + linked Comscore imports.
 * @param {string} id - Catalogue entry UUID
 * @param {Function} getToken
 */
export async function getCatalogueEntry(id, getToken) {
  return apiFetch(`/catalogue?id=${id}`, {}, getToken);
}

/**
 * Create a new catalogue entry.
 * @param {Object} entry - { title, year, status, release_date, synopsis, genres,
 *   tmdb_id, tmdb_data, poster_path, backdrop_path, certification, runtime,
 *   tmdb_budget, tmdb_revenue, tmdb_popularity, tmdb_vote_average,
 *   distribution_cost, production_cost, notes }
 * @param {Function} getToken
 * @returns The created entry with id
 */
export async function createCatalogueEntry(entry, getToken) {
  // Use raw fetch to handle 409 specially
  const token = await getToken();
  const headers = {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${token}`,
  };
  if (_impersonateUserId) {
    headers['X-Impersonate-User-Id'] = _impersonateUserId;
  }
  const res = await fetch(`${API_BASE}/catalogue`, {
    method: 'POST',
    headers,
    body: JSON.stringify(entry),
  });
  if (res.status === 409) {
    const data = await res.json();
    throw new Error(`DUPLICATE:${data.existing_id}:${data.existing_title}`);
  }
  if (!res.ok) {
    const errBody = await res.json().catch(() => ({}));
    throw new Error(errBody.error || 'Failed to create catalogue entry');
  }
  return res.json();
}

/**
 * Update an existing catalogue entry (partial update — only send changed fields).
 * @param {string} id - Catalogue entry UUID
 * @param {Object} updates - Only the fields being changed
 * @param {Function} getToken
 */
export async function updateCatalogueEntry(id, updates, getToken) {
  return apiFetch(`/catalogue?id=${id}`, {
    method: 'PUT',
    body: JSON.stringify(updates),
  }, getToken);
}

/**
 * Link a catalogue entry to TMDB — dedicated endpoint for reliable JSONB handling.
 * @param {string} id - Catalogue entry UUID
 * @param {Object} tmdbData - TMDB fields to set (title, tmdb_id, tmdb_data, poster_path, etc.)
 * @param {Function} getToken
 */
export async function linkCatalogueTMDB(id, tmdbData, getToken) {
  return apiFetch(`/catalogue?id=${id}&action=tmdb_link`, {
    method: 'PUT',
    body: JSON.stringify(tmdbData),
  }, getToken);
}

/**
 * Delete a catalogue entry. Linked Comscore imports are preserved (just unlinked).
 * @param {string} id - Catalogue entry UUID
 * @param {Function} getToken
 */
export async function deleteCatalogueEntry(id, getToken) {
  return apiFetch(`/catalogue?id=${id}`, { method: 'DELETE' }, getToken);
}


// ═══════════════════════════════════════════════
// TMDB SEARCH & DETAILS
// ═══════════════════════════════════════════════

/**
 * Search TMDB for movies matching a query string.
 * @param {string} query - Search text (e.g. "Importance of Being Earnest")
 * @param {Function} getToken
 * @returns { results: [...], total_results: number }
 */
export async function searchTMDB(query, getToken) {
  return apiFetch(`/tmdb?action=search&query=${encodeURIComponent(query)}`, {}, getToken);
}

/**
 * Get full movie details from TMDB by ID.
 * Includes cast, crew, keywords, UK certification, budget, revenue, etc.
 * @param {number} tmdbId - TMDB movie ID (e.g. 1352026)
 * @param {Function} getToken
 * @returns Full structured movie data
 */
export async function getTMDBDetails(tmdbId, getToken) {
  return apiFetch(`/tmdb?action=details&id=${tmdbId}`, {}, getToken);
}

/**
 * Convenience: Fetch TMDB details and create a catalogue entry in one go.
 * Used by the "Add Film" flow when user selects a TMDB result.
 * @param {number} tmdbId - The TMDB movie ID from search results
 * @param {Object} overrides - Any user-entered overrides (status, costs, notes)
 * @param {Function} getToken
 * @returns The created catalogue entry
 */
export async function addFilmFromTMDB(tmdbId, overrides = {}, getToken) {
  // 1. Fetch full details from TMDB
  const details = await getTMDBDetails(tmdbId, getToken);

  // 2. Build the catalogue entry from TMDB data + user overrides
  const entry = {
    title: details.title,
    year: details.year,
    status: overrides.status || (details.status === 'Released' ? 'released' : 'pre_release'),
    release_date: details.release_date,
    synopsis: details.overview,
    genres: (details.genres || []).join(', '),
    tmdb_id: details.tmdb_id,
    tmdb_data: details, // Store the full response for future use
    poster_path: details.poster_path,
    backdrop_path: details.backdrop_path,
    certification: details.certification,
    runtime: details.runtime,
    tmdb_budget: details.budget,
    tmdb_revenue: details.revenue,
    tmdb_popularity: details.popularity,
    tmdb_vote_average: details.vote_average,
    distribution_cost: overrides.distribution_cost || null,
    production_cost: overrides.production_cost || null,
    notes: overrides.notes || null,
  };

  // 3. Create the catalogue entry
  return createCatalogueEntry(entry, getToken);
}


// ═══════════════════════════════════════════════
// TMDB IMAGE URL HELPER
// ═══════════════════════════════════════════════

/**
 * Build a full TMDB image URL from a poster/backdrop path.
 * @param {string} path - e.g. "/abc123.jpg"
 * @param {string} size - "w92" | "w154" | "w185" | "w342" | "w500" | "w780" | "original"
 * @returns Full URL or null if no path
 */
export function tmdbImageUrl(path, size = 'w500') {
  if (!path) return null;
  return `https://image.tmdb.org/t/p/${size}${path}`;
}
