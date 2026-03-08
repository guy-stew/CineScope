/**
 * CineScope — MapView (v3.0 Stage 2)
 *
 * Changes from v2.x:
 *   - Added overlay controls bar at top of map (Population mode, Panel toggle)
 *   - Population toggle moved here from Header.jsx
 *   - Panel toggle button to show/hide MapPanel
 *   - Intensity slider appears when population layer is active
 *   - All existing map functionality preserved (markers, clusters, legends, popups)
 */

import React, { useMemo, useEffect, useState } from 'react'
import { MapContainer, TileLayer, CircleMarker, Popup, ZoomControl, useMap } from 'react-leaflet'
import MarkerClusterGroup from 'react-leaflet-cluster'
import { useApp } from '../context/AppContext'
import { useTheme } from '../context/ThemeContext'
import { getGradeColor, GRADES } from '../utils/grades'
import PopulationHeatLayer from './PopulationHeatLayer'
import PopulationZonesLayer from './PopulationZonesLayer'
import VenuePopup from './VenuePopup'
import Icon from './Icon'

const UK_CENTER = [54.0, -2.5]
const DEFAULT_ZOOM = 6

// ── Closed venue styling ──
const CLOSED_COLOR = '#999'
const CLOSED_OPACITY = 0.45

function FitBounds({ venues }) {
  const map = useMap()
  useEffect(() => {
    if (venues.length === 0) return
    const bounds = venues.filter(v => v.lat && v.lng).map(v => [v.lat, v.lng])
    if (bounds.length > 0) {
      map.fitBounds(bounds, { padding: [30, 30], maxZoom: 10 })
    }
  }, [venues, map])
  return null
}

/**
 * Component to swap tile layers when theme changes
 */
function ThemeTiles() {
  const { theme } = useTheme()
  const map = useMap()

  useEffect(() => {
    // Force map to re-render when tiles change
    map.invalidateSize()
  }, [theme.mapTiles, map])

  return (
    <TileLayer
      key={theme.mapTiles}
      attribution={theme.mapAttribution}
      url={theme.mapTiles}
    />
  )
}

function MapLegend({ hasGrades, hasClosedVenues }) {
  const { theme } = useTheme()

  if (!hasGrades && !hasClosedVenues) return null

  return (
    <div className="map-legend" style={{ background: `${theme.surface}ee` }}>
      {hasGrades && (
        <>
          <div className="legend-title" style={{ color: theme.textMuted }}>Grade</div>
          {Object.entries(GRADES).map(([key, grade]) => (
            <div key={key} className="legend-item">
              <span className="legend-dot" style={{ backgroundColor: grade.color }} />
              <span style={{ color: theme.text }}>{key} — {grade.name}</span>
            </div>
          ))}
        </>
      )}
      {hasClosedVenues && (
        <div className="legend-item" style={{ marginTop: hasGrades ? 4 : 0 }}>
          <span
            className="legend-dot"
            style={{ backgroundColor: CLOSED_COLOR, opacity: CLOSED_OPACITY }}
          />
          <span style={{ color: theme.textMuted }}>Closed</span>
        </div>
      )}
    </div>
  )
}

/**
 * Overlay controls that sit on top of the map.
 * Contains: Population mode toggle, Panel toggle.
 */
function MapOverlayControls({ panelVisible, onTogglePanel }) {
  const { populationMode, updatePopulationMode, heatmapIntensity, updateHeatmapIntensity } = useApp()
  const { theme } = useTheme()
  const [localIntensity, setLocalIntensity] = useState(heatmapIntensity)
  const [showPopMenu, setShowPopMenu] = useState(false)

  // Sync local intensity when global changes
  useEffect(() => {
    setLocalIntensity(heatmapIntensity)
  }, [heatmapIntensity])

  const popModes = [
    { key: 'off', label: 'Off', icon: 'visibility_off' },
    { key: 'heatmap', label: 'Heat Map', icon: 'local_fire_department' },
    { key: 'zones', label: 'Area Zones', icon: 'map' },
  ]

  const popActive = populationMode !== 'off'
  const popLabel = populationMode === 'heatmap' ? 'Heat Map' : populationMode === 'zones' ? 'Area Zones' : 'Population'

  return (
    <div className="cs-map-overlay-controls">
      {/* Population toggle group */}
      <div className="cs-map-ctrl-group" style={{ background: `${theme.surface}ee`, borderColor: theme.border }}>
        <button
          className={`cs-map-ctrl-btn ${popActive ? 'cs-map-ctrl-btn--active' : ''}`}
          onClick={() => setShowPopMenu(!showPopMenu)}
          style={{ color: popActive ? theme.headerBorder : theme.textMuted }}
        >
          <Icon name="groups" size={16} />
          <span>{popLabel}</span>
        </button>
      </div>

      {/* Population dropdown */}
      {showPopMenu && (
        <div
          className="cs-map-pop-menu"
          style={{ background: theme.surface, borderColor: theme.border }}
        >
          {popModes.map(({ key, label, icon }) => (
            <button
              key={key}
              className={`cs-map-pop-item ${populationMode === key ? 'cs-map-pop-item--active' : ''}`}
              onClick={() => { updatePopulationMode(key); setShowPopMenu(false) }}
              style={{
                color: populationMode === key ? theme.headerBorder : theme.text,
                background: populationMode === key ? `${theme.headerBorder}12` : 'transparent',
              }}
            >
              <Icon name={icon} size={16} />
              <span>{label}</span>
            </button>
          ))}
          {(populationMode === 'heatmap' || populationMode === 'zones') && (
            <div className="cs-map-pop-slider" style={{ borderTop: `1px solid ${theme.border}` }}>
              <div style={{ fontSize: '0.68rem', fontWeight: 600, color: theme.textMuted, marginBottom: 4 }}>
                Intensity
              </div>
              <input
                type="range"
                min="0.1"
                max="1.0"
                step="0.05"
                value={localIntensity}
                onChange={e => setLocalIntensity(parseFloat(e.target.value))}
                onPointerUp={e => updateHeatmapIntensity(parseFloat(e.target.value))}
                onTouchEnd={e => updateHeatmapIntensity(parseFloat(e.target.value))}
                style={{ width: '100%' }}
              />
            </div>
          )}
        </div>
      )}

      {/* Spacer */}
      <div style={{ flex: 1 }} />

      {/* Panel toggle */}
      <div className="cs-map-ctrl-group" style={{ background: `${theme.surface}ee`, borderColor: theme.border }}>
        <button
          className={`cs-map-ctrl-btn ${panelVisible ? 'cs-map-ctrl-btn--active' : ''}`}
          onClick={onTogglePanel}
          style={{ color: panelVisible ? theme.headerBorder : theme.textMuted }}
        >
          <Icon name="view_sidebar" size={16} />
          <span>Panel</span>
        </button>
      </div>
    </div>
  )
}


/**
 * Invalidate map size when panel visibility changes,
 * so the map fills the available space without grey gaps.
 */
function MapResizer({ panelVisible }) {
  const map = useMap()
  useEffect(() => {
    // Small delay to let CSS transition complete
    const timer = setTimeout(() => map.invalidateSize(), 300)
    return () => clearTimeout(timer)
  }, [panelVisible, map])
  return null
}


export default function MapView({ panelVisible, onTogglePanel }) {
  const { filteredVenues, selectedFilm, setSelectedVenue, populationMode } = useApp()
  const { theme } = useTheme()

  const mappableVenues = useMemo(() => {
    return filteredVenues.filter(v => v.lat && v.lng && !isNaN(v.lat) && !isNaN(v.lng))
  }, [filteredVenues])

  const hasGrades = !!selectedFilm
  const hasClosedVenues = useMemo(() => {
    return mappableVenues.some(v => (v.status || 'open') === 'closed')
  }, [mappableVenues])

  return (
    <div className="map-wrapper h-100 position-relative">
      <MapContainer
        center={UK_CENTER}
        zoom={DEFAULT_ZOOM}
        className="h-100 w-100"
        zoomControl={false}
        scrollWheelZoom={true}
      >
        <ThemeTiles />
        <PopulationHeatLayer />
        <PopulationZonesLayer />
        <FitBounds venues={mappableVenues} />
        <MapResizer panelVisible={panelVisible} />
        <ZoomControl position="bottomleft" />

        <MarkerClusterGroup
          chunkedLoading
          maxClusterRadius={40}
          spiderfyOnMaxZoom
          showCoverageOnHover={false}
        >
          {mappableVenues.map((venue, idx) => {
            const isClosed = (venue.status || 'open') === 'closed'
            const grade = venue.grade || null

            // Colour logic:
            //   Closed → grey
            //   Has grade → grade colour
            //   No film loaded → neutral blue
            const color = isClosed
              ? CLOSED_COLOR
              : grade
                ? getGradeColor(grade)
                : '#2E75B6'

            const fillOpacity = isClosed ? CLOSED_OPACITY : 0.85

            return (
              <CircleMarker
                key={`${venue.name}-${venue.city}-${idx}`}
                center={[venue.lat, venue.lng]}
                radius={isClosed ? 6 : 8}
                pathOptions={{
                  color: isClosed ? '#777' : '#fff',
                  weight: isClosed ? 1 : 2,
                  fillColor: color,
                  fillOpacity,
                }}
                eventHandlers={{
                  click: () => setSelectedVenue(venue),
                }}
              >
                <Popup maxWidth={340} minWidth={300} closeOnClick={false} autoPan={false}>
                  <VenuePopup venue={venue} />
                </Popup>
              </CircleMarker>
            )
          })}
        </MarkerClusterGroup>
      </MapContainer>

      <MapLegend hasGrades={hasGrades} hasClosedVenues={hasClosedVenues} />

      {populationMode !== 'off' && (
        <div className="population-legend" style={{ background: `${theme.surface}ee` }}>
          <div className="pop-legend-title" style={{ color: theme.textMuted }}>
            Population Density
          </div>
          {[
            { color: '#b91c1c', label: '> 10,000/km²' },
            { color: '#ea580c', label: '5,000–10,000' },
            { color: '#eab308', label: '2,000–5,000' },
            { color: '#22c55e', label: '500–2,000' },
            { color: '#3b82f6', label: '< 500/km²' },
          ].map(({ color, label }) => (
            <div key={label} className="pop-legend-item">
              <span className="pop-legend-swatch" style={{ backgroundColor: color }} />
              <span style={{ color: theme.text }}>{label}</span>
            </div>
          ))}
        </div>
      )}

      <div className="map-venue-count" style={{ background: `${theme.header}dd` }}>
        {mappableVenues.length} venues shown
        {!selectedFilm && ' (no film selected)'}
      </div>

      {/* ── Overlay controls (Population toggle + Panel toggle) ── */}
      <MapOverlayControls
        panelVisible={panelVisible}
        onTogglePanel={onTogglePanel}
      />
    </div>
  )
}
