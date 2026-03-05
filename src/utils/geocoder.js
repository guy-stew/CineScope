/**
 * CineScope — Geocoder Utility
 *
 * Wraps calls to /api/geocode (Nominatim proxy) with:
 *   - Single address lookup (for the Add Venue form)
 *   - Batch geocoding with 1-second rate limiting (for spreadsheet import)
 *   - Progress callback for UI updates during batch operations
 */

import * as venueApi from './venueApi'

/**
 * Geocode a single address.
 * Returns { lat, lng, display_name } or null.
 */
export async function geocodeSingle({ address, postcode, country }, getToken) {
  try {
    const result = await venueApi.geocodeAddress({ address, postcode, country }, getToken)
    if (result.lat && result.lng) {
      return {
        lat: parseFloat(result.lat),
        lng: parseFloat(result.lng),
        display_name: result.display_name || null,
      }
    }
    return null
  } catch (err) {
    console.warn('Geocode failed:', err.message)
    return null
  }
}


/**
 * Batch geocode an array of venues that are missing coordinates.
 *
 * Respects Nominatim's 1 request/second rate limit.
 * Calls onProgress({ completed, total, current, result }) after each lookup.
 * Returns the same array with lat/lng filled in where found.
 *
 * @param {Array} venues — array of { address, postcode, country, ... }
 * @param {Function} getToken — Clerk auth token getter
 * @param {Object} options
 * @param {Function} options.onProgress — progress callback
 * @param {AbortSignal} options.signal — for cancellation
 * @returns {Array} venues with lat/lng populated where geocoding succeeded
 */
export async function geocodeBatch(venues, getToken, { onProgress, signal } = {}) {
  // Filter to only venues needing geocoding
  const needsGeocoding = venues.filter(v => !v.lat && !v.lng && (v.address || v.postcode))
  const total = needsGeocoding.length

  if (total === 0) return venues

  let completed = 0

  for (const venue of needsGeocoding) {
    // Check for cancellation
    if (signal?.aborted) {
      break
    }

    const result = await geocodeSingle(
      {
        address: venue.address || '',
        postcode: venue.postcode || '',
        country: venue.country || 'United Kingdom',
      },
      getToken
    )

    completed++

    if (result) {
      venue.lat = result.lat
      venue.lng = result.lng
      venue._geocodeStatus = 'found'
      venue._geocodeDisplay = result.display_name
    } else {
      venue._geocodeStatus = 'not_found'
    }

    if (onProgress) {
      onProgress({
        completed,
        total,
        current: venue,
        result,
      })
    }

    // Rate limit: wait 1.1 seconds between requests (Nominatim fair use)
    if (completed < total && !signal?.aborted) {
      await delay(1100)
    }
  }

  return venues
}


/**
 * Simple delay helper.
 */
function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms))
}
