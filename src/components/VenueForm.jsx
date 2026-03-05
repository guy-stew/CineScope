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
import { Form, Button, Row, Col, Spinner, Alert, Badge } from 'react-bootstrap'
import { MapContainer, TileLayer, CircleMarker, useMap } from 'react-leaflet'
import { useAuth } from '@clerk/clerk-react'
import { useTheme } from '../context/ThemeContext'
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


export default function VenueForm({ venue, onSave, onCancel }) {
  const { getToken } = useAuth()
  const { theme } = useTheme()

  const isEditing = !!venue?.id
  const mapRef = useRef(null)

  // ── Form state ──
  const [form, setForm] = useState(EMPTY_FORM)
  const [saving, setSaving] = useState(false)
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
        comscore_name: form.comscore_name.trim(),
        city: form.city.trim(),
        country: form.country,
        chain: form.chain.trim() || null,
        category: form.category,
        address: form.address.trim() || null,
        postcode: form.postcode.trim() || null,
        lat: form.lat ? parseFloat(form.lat) : null,
        lng: form.lng ? parseFloat(form.lng) : null,
        status: form.status,
        place_id: form.place_id.trim() || null,
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
  // RENDER
  // ═══════════════════════════════════════════════════════════════

  return (
    <div className="p-3 p-md-4" style={{ maxWidth: 900, margin: '0 auto' }}>
      {error && (
        <Alert variant="danger" dismissible onClose={() => setError(null)}>
          <Icon name="error" size={16} className="me-1" /> {error}
        </Alert>
      )}

      <Row>
        {/* Left column: main fields */}
        <Col md={7}>
          {/* Venue Name */}
          <Form.Group className="mb-3">
            <Form.Label className="fw-semibold" style={{ fontSize: '0.85rem' }}>
              Venue Name <span className="text-danger">*</span>
            </Form.Label>
            <Form.Control
              type="text"
              value={form.name}
              onChange={e => updateField('name', e.target.value)}
              placeholder="e.g. Odeon Luxe Leicester Square"
            />
            <Form.Text className="text-muted" style={{ fontSize: '0.75rem' }}>
              Display name shown on the map and in reports
            </Form.Text>
          </Form.Group>

          {/* Comscore Name */}
          <Form.Group className="mb-3">
            <Form.Label className="fw-semibold" style={{ fontSize: '0.85rem' }}>
              Comscore Name <span className="text-danger">*</span>
            </Form.Label>
            <Form.Control
              type="text"
              value={form.comscore_name}
              onChange={e => updateField('comscore_name', e.target.value)}
              placeholder="e.g. ODEON LUXE LEICESTER SQUARE"
            />
            <Form.Text className="text-muted" style={{ fontSize: '0.75rem' }}>
              Name as it appears in Comscore reports (used for matching)
            </Form.Text>
          </Form.Group>

          {/* City + Country */}
          <Row className="mb-3">
            <Col>
              <Form.Group>
                <Form.Label className="fw-semibold" style={{ fontSize: '0.85rem' }}>
                  City <span className="text-danger">*</span>
                </Form.Label>
                <Form.Control
                  type="text"
                  value={form.city}
                  onChange={e => updateField('city', e.target.value)}
                  placeholder="e.g. London"
                />
              </Form.Group>
            </Col>
            <Col xs={5}>
              <Form.Group>
                <Form.Label className="fw-semibold" style={{ fontSize: '0.85rem' }}>
                  Country <span className="text-danger">*</span>
                </Form.Label>
                <Form.Select
                  value={form.country}
                  onChange={e => updateField('country', e.target.value)}
                >
                  <option>United Kingdom</option>
                  <option>Ireland</option>
                </Form.Select>
              </Form.Group>
            </Col>
          </Row>

          {/* Chain + Category */}
          <Row className="mb-3">
            <Col>
              <Form.Group>
                <Form.Label className="fw-semibold" style={{ fontSize: '0.85rem' }}>Chain</Form.Label>
                <Form.Control
                  type="text"
                  value={form.chain}
                  onChange={e => updateField('chain', e.target.value)}
                  placeholder="e.g. Odeon (leave blank for independents)"
                />
              </Form.Group>
            </Col>
            <Col xs={5}>
              <Form.Group>
                <Form.Label className="fw-semibold" style={{ fontSize: '0.85rem' }}>
                  Category <span className="text-danger">*</span>
                </Form.Label>
                <Form.Select
                  value={form.category}
                  onChange={e => updateField('category', e.target.value)}
                >
                  <option>Large Chain</option>
                  <option>Small Chain</option>
                  <option>Independent</option>
                </Form.Select>
              </Form.Group>
            </Col>
          </Row>

          {/* Address + Postcode + Geocode */}
          <Form.Group className="mb-2">
            <Form.Label className="fw-semibold" style={{ fontSize: '0.85rem' }}>Address</Form.Label>
            <Form.Control
              type="text"
              value={form.address}
              onChange={e => updateField('address', e.target.value)}
              placeholder="Full street address (for geocoding)"
            />
          </Form.Group>

          <Row className="mb-3 align-items-end">
            <Col>
              <Form.Group>
                <Form.Label className="fw-semibold" style={{ fontSize: '0.85rem' }}>Postcode</Form.Label>
                <Form.Control
                  type="text"
                  value={form.postcode}
                  onChange={e => updateField('postcode', e.target.value)}
                  placeholder="e.g. WC2H 7NA"
                />
              </Form.Group>
            </Col>
            <Col xs="auto">
              <Button
                variant="outline-primary"
                size="sm"
                onClick={handleGeocode}
                disabled={geocoding || (!form.address && !form.postcode)}
                className="d-flex align-items-center gap-1"
                style={{ height: 38 }}
              >
                {geocoding
                  ? <><Spinner animation="border" size="sm" /> Looking up...</>
                  : <><Icon name="my_location" size={16} /> Lookup Coordinates</>
                }
              </Button>
            </Col>
          </Row>

          {geocodeMessage && (
            <Alert
              variant={geocodeMessage.type}
              dismissible
              onClose={() => setGeocodeMessage(null)}
              style={{ fontSize: '0.82rem' }}
            >
              {geocodeMessage.text}
            </Alert>
          )}

          {/* Lat / Lng */}
          <Row className="mb-3">
            <Col>
              <Form.Group>
                <Form.Label className="fw-semibold" style={{ fontSize: '0.85rem' }}>Latitude</Form.Label>
                <Form.Control
                  type="text"
                  value={form.lat}
                  onChange={e => updateField('lat', e.target.value)}
                  placeholder="e.g. 51.5115"
                />
              </Form.Group>
            </Col>
            <Col>
              <Form.Group>
                <Form.Label className="fw-semibold" style={{ fontSize: '0.85rem' }}>Longitude</Form.Label>
                <Form.Control
                  type="text"
                  value={form.lng}
                  onChange={e => updateField('lng', e.target.value)}
                  placeholder="e.g. -0.1281"
                />
              </Form.Group>
            </Col>
          </Row>

          {/* Status + Place ID */}
          <Row className="mb-3">
            <Col xs={4}>
              <Form.Group>
                <Form.Label className="fw-semibold" style={{ fontSize: '0.85rem' }}>Status</Form.Label>
                <Form.Select
                  value={form.status}
                  onChange={e => updateField('status', e.target.value)}
                >
                  <option value="open">Open</option>
                  <option value="closed">Closed</option>
                </Form.Select>
              </Form.Group>
            </Col>
            <Col>
              <Form.Group>
                <Form.Label className="fw-semibold" style={{ fontSize: '0.85rem' }}>Google Place ID</Form.Label>
                <Form.Control
                  type="text"
                  value={form.place_id}
                  onChange={e => updateField('place_id', e.target.value)}
                  placeholder="Optional"
                />
              </Form.Group>
            </Col>
          </Row>

          {/* Notes */}
          <Form.Group className="mb-3">
            <Form.Label className="fw-semibold" style={{ fontSize: '0.85rem' }}>Notes</Form.Label>
            <Form.Control
              as="textarea"
              rows={3}
              value={form.notes}
              onChange={e => updateField('notes', e.target.value)}
              placeholder="Any additional notes about this venue..."
            />
          </Form.Group>
        </Col>

        {/* Right column: map preview + info */}
        <Col md={5}>
          <div className="mb-3">
            <Form.Label className="fw-semibold" style={{ fontSize: '0.85rem' }}>Map Preview</Form.Label>
            <div
              style={{
                height: 300,
                borderRadius: 8,
                overflow: 'hidden',
                border: `1px solid ${theme.border}`,
              }}
            >
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
              <div className="text-muted text-center mt-2" style={{ fontSize: '0.78rem' }}>
                <Icon name="info" size={14} className="me-1" />
                Enter coordinates or use Lookup to place the pin
              </div>
            )}
            {hasCoords && (
              <div className="text-success text-center mt-2" style={{ fontSize: '0.78rem' }}>
                <Icon name="check_circle" size={14} className="me-1" />
                {parseFloat(form.lat).toFixed(5)}, {parseFloat(form.lng).toFixed(5)}
              </div>
            )}
          </div>

          {/* Venue info card (edit mode only) */}
          {isEditing && (
            <div
              className="p-3 rounded"
              style={{
                background: theme.surface,
                border: `1px solid ${theme.border}`,
                fontSize: '0.8rem',
              }}
            >
              <div className="fw-semibold mb-2" style={{ color: theme.textMuted }}>Venue Info</div>
              <div className="d-flex justify-content-between mb-1">
                <span style={{ color: theme.textMuted }}>ID</span>
                <span className="font-monospace">{venue.id}</span>
              </div>
              <div className="d-flex justify-content-between mb-1">
                <span style={{ color: theme.textMuted }}>Source</span>
                <Badge bg={venue.source === 'seed' ? 'secondary' : venue.source === 'manual' ? 'info' : 'primary'}>
                  {venue.source || 'seed'}
                </Badge>
              </div>
              {venue.created_at && (
                <div className="d-flex justify-content-between mb-1">
                  <span style={{ color: theme.textMuted }}>Created</span>
                  <span>{new Date(venue.created_at).toLocaleDateString()}</span>
                </div>
              )}
              {venue.updated_at && (
                <div className="d-flex justify-content-between">
                  <span style={{ color: theme.textMuted }}>Updated</span>
                  <span>{new Date(venue.updated_at).toLocaleDateString()}</span>
                </div>
              )}
            </div>
          )}
        </Col>
      </Row>

      {/* Action buttons */}
      <div
        className="d-flex justify-content-end gap-2 mt-3 pt-3"
        style={{ borderTop: `1px solid ${theme.border}` }}
      >
        <Button variant="outline-secondary" onClick={onCancel} disabled={saving}>
          Cancel
        </Button>
        <Button
          variant="success"
          onClick={handleSave}
          disabled={saving || !dirty}
          className="d-flex align-items-center gap-1"
        >
          {saving
            ? <><Spinner animation="border" size="sm" /> Saving...</>
            : <><Icon name="save" size={16} /> {isEditing ? 'Update Venue' : 'Add Venue'}</>
          }
        </Button>
      </div>
    </div>
  )
}
