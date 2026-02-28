import { useEffect, useRef, useState, useCallback } from 'react'
import { useMap } from 'react-leaflet'
import L from 'leaflet'
import { useApp } from '../context/AppContext'

/**
 * PopulationHeatLayer
 *
 * leaflet.heat is a 2014 plugin that needs window.L as a global.
 * Leaflet's ESM build (used by Vite) does NOT set window.L.
 * So we bridge the gap: set window.L, then load leaflet.heat via
 * a script tag at runtime, guaranteeing correct load order.
 */

const HEAT_GRADIENT = {
  0.0: '#3b0764',
  0.2: '#1e40af',
  0.4: '#059669',
  0.6: '#eab308',
  0.8: '#ea580c',
  1.0: '#dc2626',
}

const CDN_URL = 'https://unpkg.com/leaflet.heat@0.2.0/dist/leaflet-heat.js'

// Load leaflet.heat once via script tag (cached across re-renders)
let heatPluginPromise = null
function loadHeatPlugin() {
  if (typeof L.heatLayer === 'function') {
    return Promise.resolve()
  }
  if (heatPluginPromise) return heatPluginPromise

  // Bridge: set window.L so the plugin can find it
  window.L = L

  heatPluginPromise = new Promise((resolve, reject) => {
    const script = document.createElement('script')
    script.src = CDN_URL
    script.onload = () => {
      console.log('[CineScope] leaflet.heat loaded, L.heatLayer:', typeof L.heatLayer)
      resolve()
    }
    script.onerror = () => reject(new Error('Failed to load leaflet.heat from CDN'))
    document.head.appendChild(script)
  })

  return heatPluginPromise
}

export default function PopulationHeatLayer() {
  const map = useMap()
  const { populationMode, heatmapIntensity } = useApp()
  const heatLayerRef = useRef(null)
  const [points, setPoints] = useState(null)
  const [pluginReady, setPluginReady] = useState(typeof L.heatLayer === 'function')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)

  // -- Load the plugin on first toggle --
  useEffect(() => {
    if (populationMode !== 'heatmap' || pluginReady) return

    loadHeatPlugin()
      .then(() => setPluginReady(true))
      .catch(err => {
        console.error(err)
        setError('Failed to load heat map library')
      })
  }, [populationMode, pluginReady])

  // -- Fetch data once --
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
          const pts = Array.isArray(data) ? data : data.points
          console.log('[CineScope] Population data:', pts.length, 'points, sample:', pts[0])
          setPoints(pts)
          setLoading(false)
        }
      })
      .catch(err => {
        if (!cancelled) {
          console.error('Failed to load population data:', err)
          setError(err.message)
          setLoading(false)
        }
      })

    return () => { cancelled = true }
  }, [populationMode, points])

  // -- Create / destroy heat layer --
  useEffect(() => {
    // Clean up old layer
    if (heatLayerRef.current) {
      map.removeLayer(heatLayerRef.current)
      heatLayerRef.current = null
    }

    if (populationMode !== 'heatmap' || !points || !pluginReady) return

    console.log('[CineScope] Creating heat layer:', points.length, 'points, intensity:', heatmapIntensity)

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
  }, [map, points, populationMode, heatmapIntensity, pluginReady])

  if (populationMode === 'heatmap' && (loading || !pluginReady)) {
    return (
      <div className="population-loading">
        Loading population data...
      </div>
    )
  }

  if (error) {
    return (
      <div className="population-loading population-error">
        {error}
      </div>
    )
  }

  return null
}
