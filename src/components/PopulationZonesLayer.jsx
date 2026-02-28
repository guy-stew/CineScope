import { useEffect, useRef, useState } from 'react'
import { useMap } from 'react-leaflet'
import L from 'leaflet'
import { feature } from 'topojson-client'
import { useApp } from '../context/AppContext'

/**
 * PopulationZonesLayer
 *
 * Renders choropleth polygons from TopoJSON boundary files.
 * Four files are lazy-loaded on first toggle, converted to GeoJSON,
 * and rendered as a single Leaflet layer with density-based colouring.
 */

const TOPO_FILES = [
  { url: '/data/england-wales-msoa.json', objectKey: 'ew-msoa-joined', label: 'England & Wales' },
  { url: '/data/scotland-iz.json', objectKey: 'scotland-iz-joined', label: 'Scotland' },
  { url: '/data/northern-ireland-sdz.json', objectKey: 'ni-sdz-joined', label: 'Northern Ireland' },
  { url: '/data/ireland-ed.json', objectKey: 'ireland-ed-joined', label: 'Ireland' },
]

// Density colour scale (persons per km²)
function getDensityColor(den) {
  if (den == null) return '#cccccc'
  if (den > 10000) return '#b91c1c'   // very high — deep red
  if (den > 5000)  return '#ea580c'   // high — orange
  if (den > 2000)  return '#eab308'   // medium — yellow
  if (den > 500)   return '#22c55e'   // low — green
  return '#3b82f6'                     // very low — blue
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

export default function PopulationZonesLayer() {
  const map = useMap()
  const { populationMode, heatmapIntensity } = useApp()
  const layerRef = useRef(null)
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

          // Convert TopoJSON → GeoJSON
          const geo = feature(topo, topo.objects[objectKey])
          allFeatures.push(...geo.features)

          console.log(`[CineScope] ${label}: ${geo.features.length} zones loaded`)
        } catch (err) {
          console.error(`Failed to load ${label}:`, err)
          // Continue with other files even if one fails
        }
      }

      if (!cancelled) {
        console.log(`[CineScope] Total zones: ${allFeatures.length}`)
        setGeoData({
          type: 'FeatureCollection',
          features: allFeatures,
        })
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
    // Clean up old layer
    if (layerRef.current) {
      map.removeLayer(layerRef.current)
      layerRef.current = null
    }

    if (populationMode !== 'zones' || !geoData) return

    const opacity = heatmapIntensity // reuse the same slider

    const layer = L.geoJSON(geoData, {
      style: (feat) => {
        const den = feat.properties?.den
        return {
          fillColor: getDensityColor(den),
          fillOpacity: getDensityOpacity(den) * opacity,
          color: 'rgba(255,255,255,0.3)',
          weight: 0.5,
        }
      },
      onEachFeature: (feat, lyr) => {
        const p = feat.properties || {}
        const parts = [
          `<strong>${p.nm || 'Unknown'}</strong>`,
        ]

        // Add region context
        if (p.la) parts.push(`<span style="color:#888">${p.la}</span>`)
        else if (p.lgd) parts.push(`<span style="color:#888">${p.lgd}</span>`)
        else if (p.county) parts.push(`<span style="color:#888">${p.county}</span>`)

        parts.push(`Pop: ${formatNumber(p.pop)}`)
        parts.push(`Density: ${formatNumber(Math.round(p.den || 0))}/km²`)
        if (p.area) parts.push(`Area: ${p.area} km²`)

        lyr.bindTooltip(parts.join('<br>'), {
          sticky: true,
          className: 'zone-tooltip',
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
