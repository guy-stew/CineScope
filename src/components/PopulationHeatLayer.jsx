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

  // -- Fetch data once on first toggle --
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
          setPoints(Array.isArray(data) ? data : data.points)
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

  // -- Create / destroy heat layer (rebuilds cleanly on every change) --
  useEffect(() => {
    // Always clean up the old layer first
    if (heatLayerRef.current) {
      map.removeLayer(heatLayerRef.current)
      heatLayerRef.current = null
    }

    // Only create if mode is on and we have data
    if (populationMode !== 'heatmap' || !points) return

    const layer = L.heatLayer(points, {
      radius: Math.round(12 + heatmapIntensity * 14),
      blur: Math.round(14 + heatmapIntensity * 14),
      maxZoom: 12,
      max: 1.0,
      minOpacity: 0.05 + heatmapIntensity * 0.5,
      gradient: HEAT_GRADIENT,
    })

    layer.addTo(map)
    heatLayerRef.current = layer

    return () => {
      if (heatLayerRef.current) {
        map.removeLayer(heatLayerRef.current)
        heatLayerRef.current = null
      }
    }
  }, [map, points, populationMode, heatmapIntensity])

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
