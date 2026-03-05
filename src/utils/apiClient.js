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
// (getContact, saveContact, deleteContact,
// listChainContacts) for Feature 1.
// ─────────────────────────────────────────────

const API_BASE = '/api';

// ─────────────────────────────────────────────
// Internal: authenticated fetch wrapper
// ─────────────────────────────────────────────

async function apiFetch(path, options = {}, getToken) {
  const token = await getToken();
  if (!token) {
    throw new Error('Not authenticated');
  }

  const res = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
      ...(options.headers || {}),
    },
  });

  // Handle non-JSON responses (e.g. SSE streams)
  if (options.raw) return res;

  if (!res.ok) {
    const errBody = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(errBody.error || `API error: ${res.status}`);
  }

  return res.json();
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
