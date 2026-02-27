import React, { useMemo, useEffect } from 'react'
import { MapContainer, TileLayer, CircleMarker, Popup, useMap } from 'react-leaflet'
import MarkerClusterGroup from 'react-leaflet-cluster'
import { useApp } from '../context/AppContext'
import { useTheme } from '../context/ThemeContext'
import { getGradeColor, GRADES } from '../utils/grades'

const UK_CENTER = [54.0, -2.5]
const DEFAULT_ZOOM = 6

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

function MapLegend({ hasGrades }) {
  const { theme } = useTheme()

  if (!hasGrades) return null

  return (
    <div className="map-legend" style={{ background: `${theme.surface}ee` }}>
      <div className="legend-title" style={{ color: theme.textMuted }}>Grade</div>
      {Object.entries(GRADES).map(([key, grade]) => (
        <div key={key} className="legend-item">
          <span className="legend-dot" style={{ backgroundColor: grade.color }} />
          <span style={{ color: theme.text }}>{key} — {grade.name}</span>
        </div>
      ))}
    </div>
  )
}

export default function MapView() {
  const { filteredVenues, selectedFilm, setSelectedVenue } = useApp()
  const { theme } = useTheme()

  const mappableVenues = useMemo(() => {
    return filteredVenues.filter(v => v.lat && v.lng && !isNaN(v.lat) && !isNaN(v.lng))
  }, [filteredVenues])

  const hasGrades = !!selectedFilm

  return (
    <div className="map-wrapper h-100 position-relative">
      <MapContainer
        center={UK_CENTER}
        zoom={DEFAULT_ZOOM}
        className="h-100 w-100"
        zoomControl={true}
        scrollWheelZoom={true}
      >
        <ThemeTiles />
        <FitBounds venues={mappableVenues} />

        <MarkerClusterGroup
          chunkedLoading
          maxClusterRadius={40}
          spiderfyOnMaxZoom
          showCoverageOnHover={false}
        >
          {mappableVenues.map((venue, idx) => {
            const grade = venue.grade || null
            // When no film loaded, use a neutral blue for all markers
            const color = grade ? getGradeColor(grade) : '#2E75B6'

            return (
              <CircleMarker
                key={`${venue.name}-${idx}`}
                center={[venue.lat, venue.lng]}
                radius={8}
                pathOptions={{
                  color: '#fff',
                  weight: 2,
                  fillColor: color,
                  fillOpacity: 0.85,
                }}
                eventHandlers={{
                  click: () => setSelectedVenue(venue),
                }}
              >
                <Popup>
                  <div className="venue-popup">
                    <div className="popup-header">
                      <strong>{venue.name}</strong>
                      {grade && grade !== 'E' && (
                        <span
                          className="popup-grade"
                          style={{
                            backgroundColor: color,
                            color: grade === 'B' ? '#333' : '#fff',
                          }}
                        >
                          {grade}
                        </span>
                      )}
                    </div>
                    <div className="popup-details">
                      <div>{venue.city}{venue.country === 'Ireland' ? ', Ireland' : ''}</div>
                      <div className="text-muted">{venue.chain} — {venue.category}</div>
                      {venue.revenue != null && (
                        <div className="popup-revenue">
                          £{venue.revenue.toLocaleString()}
                          {venue.wasAggregated && (
                            <span
                              className="ms-1"
                              title={`Combined from ${venue.screenEntries} screen entries`}
                              style={{ fontSize: '0.75em', cursor: 'help' }}
                            >
                              🖥️×{venue.screenEntries}
                            </span>
                          )}
                        </div>
                      )}
                      {venue.revenuePerScreen != null && (
                        <div style={{ fontSize: '0.8em', color: '#666' }}>
                          £{venue.revenuePerScreen.toLocaleString()} per screen
                        </div>
                      )}
                      {venue.address && (
                        <div className="popup-address text-muted mt-1" style={{ fontSize: '0.8em' }}>
                          {venue.address}
                        </div>
                      )}
                    </div>
                  </div>
                </Popup>
              </CircleMarker>
            )
          })}
        </MarkerClusterGroup>
      </MapContainer>

      <MapLegend hasGrades={hasGrades} />

      <div className="map-venue-count" style={{ background: `${theme.header}dd` }}>
        {mappableVenues.length} venues shown
        {!selectedFilm && ' (no film selected)'}
      </div>
    </div>
  )
}
