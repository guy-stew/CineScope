/**
 * CineScope — Venue Form (Add / Edit)
 *
 * Form for adding a new venue or editing an existing one.
 * Includes:
 *   - All venue fields (name, comscore name, city, country, chain, etc.)
 *   - Geocoding button (address → lat/lng via Nominatim proxy)
 *   - Live map preview showing pin at current coordinates
 *   - Save wires to POST /api/venues (add) or PUT /api/venues/:id (edit)
 */

import React, { useState, useEffect, useRef, useMemo } from 'react'
import { MapContainer, TileLayer, CircleMarker, useMap } from 'react-leaflet'
import { useAuth } from '@clerk/clerk-react'
import Icon from './Icon'
import * as venueApi from '../utils/venueApi'

const UK_CENTER = [54.0, -2.5]
const PREVIEW_ZOOM = 14

const EMPTY_FORM = {
  name: '',
  comscore_name: '',
  city: '',
  country: 'United Kingdom',
  chain: '',
  category: 'Independent',
  address: '',
  postcode: '',
  lat: '',
  lng: '',
  status: 'open',
  place_id: '',
  notes: '',
}


/**
 * Small helper to re-centre the map when lat/lng changes.
 */
function MapUpdater({ lat, lng }) {
  const map = useMap()
  useEffect(() => {
    if (lat && lng && !isNaN(lat) && !isNaN(lng)) {
      map.setView([parseFloat(lat), parseFloat(lng)], PREVIEW_ZOOM)
    }
  }, [lat, lng, map])
  return null
}


export default function VenueForm({ venue, onSave, onCancel, onDelete }) {
  const { getToken } = useAuth()

  const isEditing = !!venue?.id
  const canDelete = isEditing && venue?.source !== 'seed'
  const mapRef = useRef(null)

  // ── Form state ──
  const [form, setForm] = useState(EMPTY_FORM)
  const [saving, setSaving] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)
  const [geocoding, setGeocoding] = useState(false)
  const [error, setError] = useState(null)
  const [geocodeMessage, setGeocodeMessage] = useState(null)
  const [dirty, setDirty] = useState(false)

  // Populate form when editing
  useEffect(() => {
    if (venue) {
      setForm({
        name: venue.name || '',
        comscore_name: venue.comscore_name || venue.name || '',
        city: venue.city || '',
        country: venue.country || 'United Kingdom',
        chain: venue.chain || '',
        category: venue.category || 'Independent',
        address: venue.address || '',
        postcode: venue.postcode || '',
        lat: venue.lat != null ? String(venue.lat) : '',
        lng: venue.lng != null ? String(venue.lng) : '',
        status: venue.status || 'open',
        place_id: venue.place_id || '',
        notes: venue.notes || '',
      })
      setDirty(false)
    } else {
      setForm(EMPTY_FORM)
      setDirty(false)
    }
  }, [venue])

  // Force map to re-render after modal animation
  useEffect(() => {
    const timer = setTimeout(() => {
      mapRef.current?.invalidateSize()
    }, 300)
    return () => clearTimeout(timer)
  }, [])

  // ── Form helpers ──

  const updateField = (field, value) => {
    setForm(prev => ({ ...prev, [field]: value }))
    setDirty(true)
    setError(null)
  }

  const hasCoords = useMemo(() => {
    const lat = parseFloat(form.lat)
    const lng = parseFloat(form.lng)
    return !isNaN(lat) && !isNaN(lng) && lat !== 0 && lng !== 0
  }, [form.lat, form.lng])

  const mapCenter = useMemo(() => {
    if (hasCoords) return [parseFloat(form.lat), parseFloat(form.lng)]
    return UK_CENTER
  }, [hasCoords, form.lat, form.lng])


  // ═══════════════════════════════════════════════════════════════
  // GEOCODING
  // ═══════════════════════════════════════════════════════════════

  const handleGeocode = async () => {
    if (!form.postcode && !form.address) {
      setGeocodeMessage({ type: 'warning', text: 'Enter an address or postcode first' })
      return
    }

    setGeocoding(true)
    setGeocodeMessage(null)

    try {
      const result = await venueApi.geocodeAddress({
        address: form.address,
        postcode: form.postcode,
        country: form.country,
      }, getToken)

      if (result.lat && result.lng) {
        setForm(prev => ({
          ...prev,
          lat: String(result.lat),
          lng: String(result.lng),
        }))
        setDirty(true)
        setGeocodeMessage({
          type: 'success',
          text: result.display_name
            ? `Found: ${result.display_name}`
            : 'Coordinates found — check the map preview below',
        })
      } else if (result.error) {
        setGeocodeMessage({ type: 'warning', text: result.error })
      } else {
        setGeocodeMessage({ type: 'warning', text: 'No results found. Try a different address or postcode.' })
      }
    } catch (err) {
      setGeocodeMessage({ type: 'danger', text: `Geocoding failed: ${err.message}` })
    } finally {
      setGeocoding(false)
    }
  }


  // ═══════════════════════════════════════════════════════════════
  // SAVE
  // ═══════════════════════════════════════════════════════════════

  const validate = () => {
    if (!form.name.trim()) return 'Venue Name is required'
    if (!form.comscore_name.trim()) return 'Comscore Name is required'
    if (!form.city.trim()) return 'City is required'
    if (!form.country) return 'Country is required'
    if (!form.category) return 'Category is required'

    // Validate coordinates if provided
    if (form.lat && isNaN(parseFloat(form.lat))) return 'Latitude must be a number'
    if (form.lng && isNaN(parseFloat(form.lng))) return 'Longitude must be a number'
    if (form.lat && !form.lng) return 'If you enter latitude, longitude is also required'
    if (form.lng && !form.lat) return 'If you enter longitude, latitude is also required'

    return null
  }

  const handleSave = async () => {
    const validationError = validate()
    if (validationError) {
      setError(validationError)
      return
    }

    setSaving(true)
    setError(null)

    try {
      const payload = {
        name: form.name.trim(),
        comscoreName: form.comscore_name.trim(),
        city: form.city.trim(),
        country: form.country,
        chain: form.chain.trim() || null,
        category: form.category,
        address: form.address.trim() || null,
        postcode: form.postcode.trim() || null,
        lat: form.lat ? parseFloat(form.lat) : null,
        lng: form.lng ? parseFloat(form.lng) : null,
        status: form.status,
        placeId: form.place_id.trim() || null,
        notes: form.notes.trim() || null,
      }

      // For new venues, set source to 'manual'
      if (!isEditing) {
        payload.source = 'manual'
      }

      let saved
      if (isEditing) {
        saved = await venueApi.updateVenue(venue.id, payload, getToken)
      } else {
        saved = await venueApi.addVenue(payload, getToken)
      }

      // Attach a flag so VenueManager can show the right success message
      const result = saved.venue || saved
      result._isNew = !isEditing
      onSave(result)
    } catch (err) {
      setError(`Failed to save: ${err.message}`)
    } finally {
      setSaving(false)
    }
  }


  // ═══════════════════════════════════════════════════════════════
  // DELETE
  // ═══════════════════════════════════════════════════════════════

  const handleDelete = async () => {
    setDeleting(true)
    setError(null)

    try {
      await venueApi.deleteVenue(venue.id, getToken)
      setShowDeleteConfirm(false)
      if (onDelete) onDelete(venue)
    } catch (err) {
      setError(`Failed to delete: ${err.message}`)
      setShowDeleteConfirm(false)
    } finally {
      setDeleting(false)
    }
  }


  // ═══════════════════════════════════════════════════════════════
  // RENDER
  // ═══════════════════════════════════════════════════════════════

  return (
    <div className="cs-vf">
      {error && (
        <div className="cs-vf__alert cs-vf__alert--error">
          <Icon name="error" size={16} /> {error}
          <button className="cs-vf__alert-close" onClick={() => setError(null)}>&times;</button>
        </div>
      )}

      <div className="cs-vf__grid">
        {/* Left column: main fields */}
        <div className="cs-vf__col-left">
          {/* Venue Name */}
          <div className="cs-vf__field">
            <label className="cs-vf__label">
              Venue Name <span className="cs-vf__required">*</span>
            </label>
            <input
              type="text"
              className="cs-vf__input"
              value={form.name}
              onChange={e => updateField('name', e.target.value)}
              placeholder="e.g. Odeon Luxe Leicester Square"
            />
            <span className="cs-vf__hint">Display name shown on the map and in reports</span>
          </div>

          {/* Comscore Name */}
          <div className="cs-vf__field">
            <label className="cs-vf__label">
              Comscore Name <span className="cs-vf__required">*</span>
            </label>
            <input
              type="text"
              className="cs-vf__input"
              value={form.comscore_name}
              onChange={e => updateField('comscore_name', e.target.value)}
              placeholder="e.g. ODEON LUXE LEICESTER SQUARE"
            />
            <span className="cs-vf__hint">Name as it appears in Comscore reports (used for matching)</span>
          </div>

          {/* City + Country */}
          <div className="cs-vf__row">
            <div className="cs-vf__field" style={{ flex: 1 }}>
              <label className="cs-vf__label">
                City <span className="cs-vf__required">*</span>
              </label>
              <input
                type="text"
                className="cs-vf__input"
                value={form.city}
                onChange={e => updateField('city', e.target.value)}
                placeholder="e.g. London"
              />
            </div>
            <div className="cs-vf__field" style={{ flex: '0 0 180px' }}>
              <label className="cs-vf__label">
                Country <span className="cs-vf__required">*</span>
              </label>
              <select
                className="cs-vf__select"
                value={form.country}
                onChange={e => updateField('country', e.target.value)}
              >
                <option>United Kingdom</option>
                <option>Ireland</option>
              </select>
            </div>
          </div>

          {/* Chain + Category */}
          <div className="cs-vf__row">
            <div className="cs-vf__field" style={{ flex: 1 }}>
              <label className="cs-vf__label">Chain</label>
              <input
                type="text"
                className="cs-vf__input"
                value={form.chain}
                onChange={e => updateField('chain', e.target.value)}
                placeholder="e.g. Odeon (leave blank for independents)"
              />
            </div>
            <div className="cs-vf__field" style={{ flex: '0 0 180px' }}>
              <label className="cs-vf__label">
                Category <span className="cs-vf__required">*</span>
              </label>
              <select
                className="cs-vf__select"
                value={form.category}
                onChange={e => updateField('category', e.target.value)}
              >
                <option>Large Chain</option>
                <option>Small Chain</option>
                <option>Independent</option>
              </select>
            </div>
          </div>

          {/* Address */}
          <div className="cs-vf__field">
            <label className="cs-vf__label">Address</label>
            <input
              type="text"
              className="cs-vf__input"
              value={form.address}
              onChange={e => updateField('address', e.target.value)}
              placeholder="Full street address (for geocoding)"
            />
          </div>

          {/* Postcode + Geocode button */}
          <div className="cs-vf__row cs-vf__row--align-end">
            <div className="cs-vf__field" style={{ flex: 1 }}>
              <label className="cs-vf__label">Postcode</label>
              <input
                type="text"
                className="cs-vf__input"
                value={form.postcode}
                onChange={e => updateField('postcode', e.target.value)}
                placeholder="e.g. WC2H 7NA"
              />
            </div>
            <button
              className="cs-vf__geocode-btn"
              onClick={handleGeocode}
              disabled={geocoding || (!form.address && !form.postcode)}
            >
              {geocoding
                ? <><Icon name="progress_activity" size={15} /> Looking up...</>
                : <><Icon name="my_location" size={15} /> Lookup Coordinates</>
              }
            </button>
          </div>

          {geocodeMessage && (
            <div className={`cs-vf__alert cs-vf__alert--${geocodeMessage.type === 'success' ? 'success' : geocodeMessage.type === 'warning' ? 'warning' : 'error'}`}>
              {geocodeMessage.text}
              <button className="cs-vf__alert-close" onClick={() => setGeocodeMessage(null)}>&times;</button>
            </div>
          )}

          {/* Lat / Lng */}
          <div className="cs-vf__row">
            <div className="cs-vf__field" style={{ flex: 1 }}>
              <label className="cs-vf__label">Latitude</label>
              <input
                type="text"
                className="cs-vf__input"
                value={form.lat}
                onChange={e => updateField('lat', e.target.value)}
                placeholder="e.g. 51.5115"
              />
            </div>
            <div className="cs-vf__field" style={{ flex: 1 }}>
              <label className="cs-vf__label">Longitude</label>
              <input
                type="text"
                className="cs-vf__input"
                value={form.lng}
                onChange={e => updateField('lng', e.target.value)}
                placeholder="e.g. -0.1281"
              />
            </div>
          </div>

          {/* Status + Place ID */}
          <div className="cs-vf__row">
            <div className="cs-vf__field" style={{ flex: '0 0 140px' }}>
              <label className="cs-vf__label">Status</label>
              <select
                className="cs-vf__select"
                value={form.status}
                onChange={e => updateField('status', e.target.value)}
              >
                <option value="open">Open</option>
                <option value="closed">Closed</option>
              </select>
            </div>
            <div className="cs-vf__field" style={{ flex: 1 }}>
              <label className="cs-vf__label">Google Place ID</label>
              <input
                type="text"
                className="cs-vf__input"
                value={form.place_id}
                onChange={e => updateField('place_id', e.target.value)}
                placeholder="Optional"
              />
            </div>
          </div>

          {/* Notes */}
          <div className="cs-vf__field">
            <label className="cs-vf__label">Notes</label>
            <textarea
              className="cs-vf__textarea"
              rows={3}
              value={form.notes}
              onChange={e => updateField('notes', e.target.value)}
              placeholder="Any additional notes about this venue..."
            />
          </div>
        </div>

        {/* Right column: map preview + info */}
        <div className="cs-vf__col-right">
          <div className="cs-vf__field">
            <label className="cs-vf__label">Map Preview</label>
            <div className="cs-vf__map-container">
              <MapContainer
                center={mapCenter}
                zoom={hasCoords ? PREVIEW_ZOOM : 6}
                style={{ height: '100%', width: '100%' }}
                zoomControl={true}
                scrollWheelZoom={true}
                ref={mapRef}
              >
                <TileLayer
                  attribution='&copy; <a href="https://www.openstreetmap.org/">OSM</a>'
                  url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                />
                <MapUpdater lat={form.lat} lng={form.lng} />
                {hasCoords && (
                  <CircleMarker
                    center={[parseFloat(form.lat), parseFloat(form.lng)]}
                    radius={10}
                    pathOptions={{
                      color: '#fff',
                      weight: 2,
                      fillColor: '#e74c3c',
                      fillOpacity: 0.9,
                    }}
                  />
                )}
              </MapContainer>
            </div>
            {!hasCoords && (
              <div className="cs-vf__map-hint">
                <Icon name="info" size={14} />
                Enter coordinates or use Lookup to place the pin
              </div>
            )}
            {hasCoords && (
              <div className="cs-vf__map-hint cs-vf__map-hint--success">
                <Icon name="check_circle" size={14} />
                {parseFloat(form.lat).toFixed(5)}, {parseFloat(form.lng).toFixed(5)}
              </div>
            )}
          </div>

          {/* Venue info card (edit mode only) */}
          {isEditing && (
            <div className="cs-vf__info-card">
              <div className="cs-vf__info-title">Venue Info</div>
              <div className="cs-vf__info-row">
                <span>ID</span>
                <span className="cs-vf__info-mono">{venue.id}</span>
              </div>
              <div className="cs-vf__info-row">
                <span>Source</span>
                <span className={`cs-vf__source-badge cs-vf__source-badge--${venue.source || 'seed'}`}>
                  {venue.source || 'seed'}
                </span>
              </div>
              {venue.created_at && (
                <div className="cs-vf__info-row">
                  <span>Created</span>
                  <span>{new Date(venue.created_at).toLocaleDateString()}</span>
                </div>
              )}
              {venue.updated_at && (
                <div className="cs-vf__info-row">
                  <span>Updated</span>
                  <span>{new Date(venue.updated_at).toLocaleDateString()}</span>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Action buttons */}
      <div className="cs-vf__actions">
        {canDelete && (
          <button
            className="cs-vm__btn cs-vm__btn--danger"
            onClick={() => setShowDeleteConfirm(true)}
            disabled={saving || deleting}
          >
            <Icon name="delete" size={16} /> Delete Venue
          </button>
        )}
        <div style={{ flex: 1 }} />
        <button className="cs-vm__btn" onClick={onCancel} disabled={saving || deleting}>
          Cancel
        </button>
        <button
          className="cs-vm__btn cs-vm__btn--primary"
          onClick={handleSave}
          disabled={saving || deleting || !dirty}
        >
          {saving
            ? <><Icon name="progress_activity" size={16} /> Saving...</>
            : <><Icon name="save" size={16} /> {isEditing ? 'Update Venue' : 'Add Venue'}</>
          }
        </button>
      </div>

      {/* Delete confirmation overlay */}
      {showDeleteConfirm && (
        <div className="cs-vf__delete-overlay">
          <div className="cs-vf__delete-dialog">
            <div className="cs-vf__delete-icon">
              <Icon name="warning" size={32} />
            </div>
            <h3 className="cs-vf__delete-title">Delete Venue?</h3>
            <p className="cs-vf__delete-text">
              This will permanently remove <strong>{venue.name}</strong> ({venue.city}) from
              your venue list. Any Comscore matching data associated with this venue will
              no longer resolve to it.
            </p>
            <p className="cs-vf__delete-warning">This action cannot be undone.</p>
            <div className="cs-vf__delete-actions">
              <button
                className="cs-vm__btn"
                onClick={() => setShowDeleteConfirm(false)}
                disabled={deleting}
              >
                Cancel
              </button>
              <button
                className="cs-vm__btn cs-vm__btn--danger"
                onClick={handleDelete}
                disabled={deleting}
              >
                {deleting
                  ? <><Icon name="progress_activity" size={16} /> Deleting...</>
                  : <><Icon name="delete" size={16} /> Yes, delete permanently</>
                }
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
