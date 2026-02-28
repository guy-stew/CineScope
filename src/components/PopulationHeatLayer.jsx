import { useEffect, useRef, useState } from 'react'
import { useMap } from 'react-leaflet'
import L from 'leaflet'
import 'leaflet.heat'
import { useApp } from '../context/AppContext'

/**
 * PopulationHeatLayer
 *
 * Renders a Leaflet.heat canvas overlay using pre-processed population
 * density points from /data/population-heatmap.json.
 *
 * Each point is [lat, lng, intensity] where intensity is log-normalised
 * (0.05–1.0) across all four jurisdictions (E&W, Scotland, NI, Ireland).
 *
 * The layer is only active when populationMode === 'heatmap'.
 * Intensity is controlled via heatmapIntensity (0.1–1.0).
 */
export default function PopulationHeatLayer() {
  const map = useMap()
  const { populationMode, heatmapIntensity } = useApp()
  const heatLayerRef = useRef(null)
  const [points, setPoints] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)

  // Fetch heatmap data on first toggle (lazy load, then cache)
  useEffect(() => {
    if (populationMode !== 'heatmap' || points) return

    let cancelled = false
    setLoading(true)
    setError(null)

    fetch('/data/population-heatmap.json')
      .then(res => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`)
        return res.json()
      })
      .then(data => {
        if (!cancelled) {
          setPoints(data)
          setLoading(false)
        }
      })
      .catch(err => {
        if (!cancelled) {
          console.error('Failed to load population heatmap:', err)
          setError(err.message)
          setLoading(false)
        }
      })

    return () => { cancelled = true }
  }, [populationMode, points])

  // Create / update / remove heat layer
  useEffect(() => {
    // Remove existing layer if mode is off or not heatmap
    if (populationMode !== 'heatmap' || !points) {
      if (heatLayerRef.current) {
        map.removeLayer(heatLayerRef.current)
        heatLayerRef.current = null
      }
      return
    }

    // Create heat layer if it doesn't exist
    if (!heatLayerRef.current) {
      heatLayerRef.current = L.heatLayer(points, {
        radius: 18,
        blur: 22,
        maxZoom: 12,
        max: 1.0,
        minOpacity: 0.15,
        gradient: {
          0.0: '#3b0764',
          0.2: '#1e40af',
          0.4: '#059669',
          0.6: '#eab308',
          0.8: '#ea580c',
          1.0: '#dc2626',
        },
      })
      heatLayerRef.current.addTo(map)
    }

    // Update intensity — leaflet.heat doesn't have a direct opacity setter,
    // so we re-set the options and redraw
    if (heatLayerRef.current) {
      heatLayerRef.current.setOptions({
        minOpacity: 0.05 + heatmapIntensity * 0.5,
        radius: Math.round(12 + heatmapIntensity * 14),
        blur: Math.round(14 + heatmapIntensity * 14),
      })
      heatLayerRef.current.redraw()
    }

    // Cleanup on unmount
    return () => {
      if (heatLayerRef.current) {
        map.removeLayer(heatLayerRef.current)
        heatLayerRef.current = null
      }
    }
  }, [map, points, populationMode, heatmapIntensity])

  // Show loading indicator on the map
  if (populationMode === 'heatmap' && loading) {
    return (
      <div className="population-loading">
        Loading population data…
      </div>
    )
  }

  if (populationMode === 'heatmap' && error) {
    return (
      <div className="population-loading population-error">
        Failed to load population data
      </div>
    )
  }

  return null
}
