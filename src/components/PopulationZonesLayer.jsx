import { useEffect, useRef, useState } from 'react'
import { useMap } from 'react-leaflet'
import L from 'leaflet'
import { feature } from 'topojson-client'
import { useApp } from '../context/AppContext'

/**
 * PopulationZonesLayer
 *
 * Renders choropleth polygons using Canvas renderer for performance.
 * 12,750 zones as SVG is painfully slow; Canvas handles it smoothly.
 * Tooltips use mousemove on the canvas layer for lightweight interaction.
 */

const TOPO_FILES = [
  { url: '/data/england-wales-msoa.json', objectKey: 'ew-msoa-joined', label: 'England & Wales' },
  { url: '/data/scotland-iz.json', objectKey: 'scotland-iz-joined', label: 'Scotland' },
  { url: '/data/northern-ireland-sdz.json', objectKey: 'ni-sdz-joined', label: 'Northern Ireland' },
  { url: '/data/ireland-ed.json', objectKey: 'ireland-ed-joined', label: 'Ireland' },
]

function getDensityColor(den) {
  if (den == null) return '#cccccc'
  if (den > 10000) return '#b91c1c'
  if (den > 5000)  return '#ea580c'
  if (den > 2000)  return '#eab308'
  if (den > 500)   return '#22c55e'
  return '#3b82f6'
}

function getDensityOpacity(den) {
  if (den == null) return 0.2
  if (den > 10000) return 0.6
  if (den > 5000)  return 0.55
  if (den > 2000)  return 0.5
  if (den > 500)   return 0.4
  return 0.3
}

function formatNumber(n) {
  if (n == null) return '—'
  return n.toLocaleString()
}

// Shared canvas renderer — one for all zones, much faster than SVG
const canvasRenderer = L.canvas({ padding: 0.5, tolerance: 5 })

export default function PopulationZonesLayer() {
  const map = useMap()
  const { populationMode, heatmapIntensity } = useApp()
  const layerRef = useRef(null)
  const tooltipRef = useRef(null)
  const [geoData, setGeoData] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [progress, setProgress] = useState('')

  // -- Fetch & convert all TopoJSON files on first toggle --
  useEffect(() => {
    if (populationMode !== 'zones' || geoData) return

    let cancelled = false
    setLoading(true)
    setError(null)

    async function loadAll() {
      const allFeatures = []

      for (let i = 0; i < TOPO_FILES.length; i++) {
        const { url, objectKey, label } = TOPO_FILES[i]
        if (cancelled) return

        setProgress(`Loading ${label}... (${i + 1}/${TOPO_FILES.length})`)

        try {
          const res = await fetch(url)
          if (!res.ok) throw new Error(`HTTP ${res.status} for ${label}`)
          const topo = await res.json()
          const geo = feature(topo, topo.objects[objectKey])
          allFeatures.push(...geo.features)
          console.log(`[CineScope] ${label}: ${geo.features.length} zones loaded`)
        } catch (err) {
          console.error(`Failed to load ${label}:`, err)
        }
      }

      if (!cancelled) {
        console.log(`[CineScope] Total zones: ${allFeatures.length}`)
        setGeoData({ type: 'FeatureCollection', features: allFeatures })
        setLoading(false)
        setProgress('')
      }
    }

    loadAll().catch(err => {
      if (!cancelled) {
        setError(err.message)
        setLoading(false)
      }
    })

    return () => { cancelled = true }
  }, [populationMode, geoData])

  // -- Create / destroy the GeoJSON layer --
  useEffect(() => {
    // Clean up
    if (layerRef.current) {
      map.removeLayer(layerRef.current)
      layerRef.current = null
    }
    if (tooltipRef.current) {
      map.removeLayer(tooltipRef.current)
      tooltipRef.current = null
    }

    if (populationMode !== 'zones' || !geoData) return

    const opacity = heatmapIntensity

    // Create a persistent tooltip (lightweight — one tooltip, not 12,750)
    const tooltip = L.tooltip({ sticky: true, className: 'zone-tooltip' })
    tooltipRef.current = tooltip

    const layer = L.geoJSON(geoData, {
      renderer: canvasRenderer,
      interactive: true,
      style: (feat) => {
        const den = feat.properties?.den
        return {
          fillColor: getDensityColor(den),
          fillOpacity: getDensityOpacity(den) * opacity,
          color: 'rgba(255,255,255,0.2)',
          weight: 0.3,
        }
      },
      onEachFeature: (feat, lyr) => {
        lyr.on('mouseover', (e) => {
          const p = feat.properties || {}
          const parts = [`<strong>${p.nm || 'Unknown'}</strong>`]
          if (p.la) parts.push(`<span style="color:#888">${p.la}</span>`)
          else if (p.lgd) parts.push(`<span style="color:#888">${p.lgd}</span>`)
          else if (p.county) parts.push(`<span style="color:#888">${p.county}</span>`)
          parts.push(`Pop: ${formatNumber(p.pop)}`)
          parts.push(`Density: ${formatNumber(Math.round(p.den || 0))}/km²`)
          if (p.area) parts.push(`Area: ${p.area} km²`)

          tooltip
            .setLatLng(e.latlng)
            .setContent(parts.join('<br>'))
            .addTo(map)
        })
        lyr.on('mousemove', (e) => {
          tooltip.setLatLng(e.latlng)
        })
        lyr.on('mouseout', () => {
          map.removeLayer(tooltip)
        })
      },
    })

    layer.addTo(map)
    layerRef.current = layer

    return () => {
      if (layerRef.current) {
        map.removeLayer(layerRef.current)
        layerRef.current = null
      }
      if (tooltipRef.current) {
        map.removeLayer(tooltipRef.current)
        tooltipRef.current = null
      }
    }
  }, [map, geoData, populationMode, heatmapIntensity])

  if (populationMode === 'zones' && loading) {
    return (
      <div className="population-loading">
        {progress || 'Loading zone boundaries...'}
      </div>
    )
  }

  if (populationMode === 'zones' && error) {
    return (
      <div className="population-loading population-error">
        {error}
      </div>
    )
  }

  return null
}
