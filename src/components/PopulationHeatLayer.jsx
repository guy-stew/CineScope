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
 * (0.05-1.0) across all four jurisdictions (E&W, Scotland, NI, Ireland).
 *
 * The layer is only active when populationMode === 'heatmap'.
 * Intensity is controlled via heatmapIntensity (0.1-1.0).
 */

const HEAT_GRADIENT = {
  0.0: '#3b0764',
  0.2: '#1e40af',
  0.4: '#059669',
  0.6: '#eab308',
  0.8: '#ea580c',
  1.0: '#dc2626',
}

export default function PopulationHeatLayer() {
  const map = useMap()
  const { populationMode, heatmapIntensity } = useApp()
  const heatLayerRef = useRef(null)
  const [points, setPoints] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)

  // -- Effect 1: Fetch heatmap data on first toggle (lazy load, then cache) --
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

  // -- Effect 2: Create or remove the heat layer --
  useEffect(() => {
    // Remove layer if mode switched off or no data yet
    if (populationMode !== 'heatmap' || !points) {
      if (heatLayerRef.current) {
        map.removeLayer(heatLayerRef.current)
        heatLayerRef.current = null
      }
      return
    }

    // Create the heat layer if it doesn't exist
    if (!heatLayerRef.current) {
      heatLayerRef.current = L.heatLayer(points, {
        radius: Math.round(12 + heatmapIntensity * 14),
        blur: Math.round(14 + heatmapIntensity * 14),
        maxZoom: 12,
        max: 1.0,
        minOpacity: 0.05 + heatmapIntensity * 0.5,
        gradient: HEAT_GRADIENT,
      })
      heatLayerRef.current.addTo(map)
    }

    // Cleanup only on unmount or when mode/points change
    return () => {
      if (heatLayerRef.current) {
        map.removeLayer(heatLayerRef.current)
        heatLayerRef.current = null
      }
    }
  }, [map, points, populationMode])

  // -- Effect 3: Update intensity without destroying the layer --
  useEffect(() => {
    if (!heatLayerRef.current) return

    heatLayerRef.current.setOptions({
      radius: Math.round(12 + heatmapIntensity * 14),
      blur: Math.round(14 + heatmapIntensity * 14),
      minOpacity: 0.05 + heatmapIntensity * 0.5,
      gradient: HEAT_GRADIENT,
    })
    heatLayerRef.current.redraw()
  }, [heatmapIntensity])

  // Show loading indicator on the map
  if (populationMode === 'heatmap' && loading) {
    return (
      <div className="population-loading">
        Loading population data...
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
