/**
 * CineScope — App Context (v2.1 cloud + venue management)
 *
 * Central state management for the entire application.
 * All persistent data now loads from / saves to the cloud backend
 * (Neon Postgres via Vercel serverless API), authenticated via Clerk.
 *
 * v2.1 changes:
 *   - Venues now loaded from /api/venues instead of static JSON
 *   - Added refreshVenues() for VenueManager to trigger map updates
 *   - baseVenues state is mutable (loaded from API, refreshable)
 *   - Closed venues filtered from map display (unless grade filter overrides)
 *
 * v2.0 changes:
 *   - Replaced IndexedDB (filmStorage.js) with apiClient cloud calls
 *   - Replaced all localStorage settings with cloud user_settings
 *   - Match overrides stored in cloud, passed to venueMatcher as parameter
 *   - Film IDs are now server-generated Postgres integers
 *   - API key stored server-side (never in browser)
 *   - Loading state while cloud data fetches on mount
 */

import React, { createContext, useContext, useState, useMemo, useCallback, useEffect, useRef } from 'react'
import { useAuth } from '@clerk/clerk-react'
import { calculateGrades, DEFAULT_GRADE_SETTINGS } from '../utils/grades'
import { parseComscoreFile } from '../utils/comscoreParser'
import { matchVenues } from '../utils/venueMatcher'
import * as api from '../utils/apiClient'
import * as venueApi from '../utils/venueApi'

const AppContext = createContext(null)


// ─── Data shape helpers ────────────────────────────────────────

/**
 * Transform cloud film + revenues into the app's internal format.
 * Cloud shape:  { film: { id, title, year, ... }, revenues: [{ comscore_theater, ... }] }
 * App shape:    { id, filmInfo, comscoreVenues, stats, aggregationLog }
 */
function cloudFilmToApp(cloudFilm, cloudRevenues) {
  const film = cloudFilm
  const comscoreVenues = (cloudRevenues || []).map(r => ({
    theater: r.comscore_theater || '',
    city: r.comscore_city || '',
    circuit: r.comscore_circuit || '',
    revenue: parseFloat(r.revenue) || 0,
    screens: r.screens_aggregated || 1,
    wasAggregated: (r.screens_aggregated || 1) > 1,
    screensAggregated: r.screens_aggregated || 1,
  }))

  const totalRevenue = comscoreVenues.reduce((s, v) => s + v.revenue, 0)

  return {
    id: film.id, // Server-generated integer ID
    catalogueId: film.catalogue_id || null, // Link to film_catalogue entry
    filmInfo: {
      title: film.title,
      year: film.year || null,
      dateFrom: film.date_from || null, // For chronological sorting in popup
      dateRange: film.date_from && film.date_to
        ? `${film.date_from} — ${film.date_to}`
        : '',
      fileName: null, // Not stored in cloud
    },
    comscoreVenues,
    stats: {
      totalVenues: film.venue_count || comscoreVenues.length,
      totalRevenue: parseFloat(film.total_revenue) || totalRevenue,
      avgRevenue: comscoreVenues.length > 0
        ? Math.round(totalRevenue / comscoreVenues.length)
        : 0,
      aggregatedCount: comscoreVenues.filter(v => v.wasAggregated).length,
    },
    aggregationLog: [],
  }
}

/**
 * Transform app-format parsed Comscore data into the shape POST /api/films expects.
 */
function appFilmToCloud(parsedResult, confirmedTitle, catalogueId) {
  const { filmInfo, venues: comscoreVenues, stats } = parsedResult

  // Try to extract dateFrom/dateTo from dateRange string
  let dateFrom = null
  let dateTo = null
  if (filmInfo.dateRange) {
    const parts = filmInfo.dateRange.split(/\s*[-–—]\s*/)
    if (parts.length === 2) {
      dateFrom = parts[0].trim()
      dateTo = parts[1].trim()
    }
  }

  return {
    title: confirmedTitle,
    year: filmInfo.year || null,
    dateFrom,
    dateTo,
    catalogueId: catalogueId || null,
    revenues: comscoreVenues.map(v => ({
      comscoreTheater: v.theater || '',
      comscoreCity: v.city || '',
      comscoreCircuit: v.circuit || '',
      revenue: v.revenue || 0,
      screensAggregated: v.screensAggregated || v.screens || 1,
      // Use Comscore names initially — matching may update later
      venueName: v.theater || '',
      venueCity: v.city || '',
      matchConfidence: null,
      matchMethod: null,
    })),
  }
}

/**
 * Parse a cloud settings object into typed values with defaults.
 */
function parseCloudSettings(raw) {
  const get = (key, fallback) => {
    if (raw[key] === undefined || raw[key] === null) return fallback
    // Settings are stored as JSONB, so they come back already parsed
    return raw[key]
  }

  return {
    selectedFilmId: get('selected_film', null),
    revenueFormat: get('revenue_format', 'decimal'),
    hasApiKey: !!get('anthropic_api_key', null),
    apiKeyValue: get('anthropic_api_key', ''),
    gradeSettings: get('grade_settings', DEFAULT_GRADE_SETTINGS),
    populationMode: get('population_mode', 'off'),
    heatmapIntensity: parseFloat(get('heatmap_intensity', 0.6)),
    theme: get('theme', null), // null = don't override ThemeContext default
  }
}


/**
 * Normalise a cloud venue record into the shape the map/matcher expects.
 * Cloud venue has: { id, name, comscore_name, city, country, chain, category, lat, lng, status, ... }
 * App expects:     { name, city, country, chain, category, lat, lng, address, placeId, comscore_name, status, ... }
 */
function normaliseCloudVenue(v) {
  return {
    id: v.id,
    name: v.name,
    comscore_name: v.comscore_name || v.name,
    city: v.city,
    country: v.country || 'United Kingdom',
    chain: v.chain || '',
    category: v.category || 'Independent',
    lat: v.lat != null ? parseFloat(v.lat) : null,
    lng: v.lng != null ? parseFloat(v.lng) : null,
    address: v.address || '',
    postcode: v.postcode || '',
    placeId: v.place_id || '',
    status: v.status || 'open',
    source: v.source || 'seed',
    notes: v.notes || '',
  }
}


// ═══════════════════════════════════════════════════════════════
// AppProvider
// ═══════════════════════════════════════════════════════════════

export function AppProvider({ children }) {
  const { getToken, isLoaded: authLoaded } = useAuth()
  const getTokenRef = useRef(getToken)
  getTokenRef.current = getToken

  // ── Loading state ──
  const [isLoading, setIsLoading] = useState(true)
  const [loadError, setLoadError] = useState(null)

  // ── Base venue data (now loaded from cloud, refreshable) ──
  const [baseVenues, setBaseVenues] = useState([])

  // ── Films (from cloud) ──
  const [importedFilms, setImportedFilms] = useState([])

  // ── Selected film ID (cloud-persisted) ──
  const [selectedFilmId, setSelectedFilmIdLocal] = useState(null)

  // Wrap setSelectedFilmId to also persist to cloud
  const setSelectedFilmId = useCallback((id) => {
    setSelectedFilmIdLocal(id)
    // Persist to cloud (fire and forget)
    api.saveSettings({ selected_film: id }, getTokenRef.current).catch(err => {
      console.warn('CineScope: Could not save selected film to cloud', err)
    })
  }, [])

  // ── Revenue format (cloud-persisted) ──
  const [revenueFormat, setRevenueFormatLocal] = useState('decimal')

  const updateRevenueFormat = useCallback((format) => {
    setRevenueFormatLocal(format)
    api.saveSettings({ revenue_format: format }, getTokenRef.current).catch(err => {
      console.warn('CineScope: Could not save revenue format to cloud', err)
    })
  }, [])

  // ── API key presence (actual key is server-side only) ──
  const [hasApiKey, setHasApiKey] = useState(false)
  // We keep a local copy for the Settings input field ONLY
  // (masked display). On save, it goes to cloud immediately.
  const [apiKeyDisplay, setApiKeyDisplay] = useState('')

  const updateApiKey = useCallback(async (key) => {
    setApiKeyDisplay(key)
    try {
      await api.saveSettings({ anthropic_api_key: key || null }, getTokenRef.current)
      setHasApiKey(!!key)
    } catch (err) {
      console.warn('CineScope: Could not save API key to cloud', err)
    }
  }, [])

  // ── AI report state (shared between TrendPanel and ExportMenu) ──
  const [aiReportText, setAiReportText] = useState(null)
  const [aiReportFilmId, setAiReportFilmId] = useState(null)
  const [aiReportChainName, setAiReportChainName] = useState(null)

  // ── Grade settings (cloud-persisted) ──
  const [gradeSettings, setGradeSettingsLocal] = useState(DEFAULT_GRADE_SETTINGS)

  const updateGradeSettings = useCallback((newSettings) => {
    setGradeSettingsLocal(newSettings)
    api.saveSettings({ grade_settings: newSettings }, getTokenRef.current).catch(err => {
      console.warn('CineScope: Could not save grade settings to cloud', err)
    })
  }, [])

  const resetGradeSettings = useCallback(() => {
    updateGradeSettings(DEFAULT_GRADE_SETTINGS)
  }, [updateGradeSettings])

  // ── Match overrides (from cloud, kept in state) ──
  const [overrides, setOverrides] = useState({})

  // Save an override to cloud + update local state (optimistic)
  const cloudSaveOverride = useCallback(async (data) => {
    const key = `${(data.comscoreTheater || '').toLowerCase()}|${(data.comscoreCity || '').toLowerCase()}`
    const newEntry = {
      venueName: data.venueName || null,
      venueCity: data.venueCity || null,
      action: data.action,
    }

    // Optimistic: update local state immediately so UI responds instantly
    setOverrides(prev => ({
      ...prev,
      [key]: newEntry,
    }))

    // Persist to cloud in background
    try {
      const result = await api.saveOverride(data, getTokenRef.current)
      // Update the local entry with the server-generated ID (needed for delete/undo)
      if (result?.override?.id) {
        setOverrides(prev => ({
          ...prev,
          [key]: { ...prev[key], id: result.override.id },
        }))
      }
    } catch (err) {
      console.error('CineScope: Could not save override to cloud', err)
      // Rollback optimistic update on failure
      setOverrides(prev => {
        const next = { ...prev }
        delete next[key]
        return next
      })
      throw err
    }
  }, [])

  // Delete an override from cloud + update local state
  const cloudDeleteOverride = useCallback(async (comscoreTheater, comscoreCity) => {
    try {
      const key = `${(comscoreTheater || '').toLowerCase()}|${(comscoreCity || '').toLowerCase()}`

      // Find the override ID from the lookup (if we have it)
      const existing = overrides[key]
      if (existing?.id) {
        await api.deleteOverride(existing.id, getTokenRef.current)
      } else {
        // If we don't have the ID, re-fetch overrides to reconcile
        const { lookup } = await api.getOverrides(getTokenRef.current)
        setOverrides(lookup)
        return
      }

      setOverrides(prev => {
        const next = { ...prev }
        delete next[key]
        return next
      })
    } catch (err) {
      console.error('CineScope: Could not delete override from cloud', err)
      throw err
    }
  }, [overrides])

  // ── Filters ──
  const [gradeFilter, setGradeFilter] = useState([])
  const [chainFilter, setChainFilter] = useState('')
  const [categoryFilter, setCategoryFilter] = useState('')

  // ── UI state ──
  const [selectedVenue, setSelectedVenue] = useState(null)
  const [showHeatMap, setShowHeatMap] = useState(false)
  const [showSettings, setShowSettings] = useState(false)
  const [showMatchReview, setShowMatchReview] = useState(false)
  const [showTrends, setShowTrends] = useState(false)
  const [importStatus, setImportStatus] = useState(null)

  // ── Population layer (cloud-persisted) ──
  const [populationMode, setPopulationModeLocal] = useState('off')

  const updatePopulationMode = useCallback((mode) => {
    setPopulationModeLocal(mode)
    api.saveSettings({ population_mode: mode }, getTokenRef.current).catch(err => {
      console.warn('CineScope: Could not save population mode to cloud', err)
    })
  }, [])

  const [heatmapIntensity, setHeatmapIntensityLocal] = useState(0.6)

  const updateHeatmapIntensity = useCallback((val) => {
    setHeatmapIntensityLocal(val)
    api.saveSettings({ heatmap_intensity: val }, getTokenRef.current).catch(err => {
      console.warn('CineScope: Could not save heatmap intensity to cloud', err)
    })
  }, [])

  // ── Pending import ──
  const [pendingImport, setPendingImport] = useState(null)

  // ── Film Catalogue (master list — single source of truth) ──
  const [catalogue, setCatalogue] = useState([])

  // ── Analysis Set (which catalogue films to include in combined view) ──
  const [analysisSet, setAnalysisSet] = useState(() => {
    try {
      const stored = localStorage.getItem('cinescope_analysis_set')
      return stored ? JSON.parse(stored) : []
    } catch { return [] }
  })

  // ── Analysis set helpers ──
  const updateAnalysisSet = useCallback((newSet) => {
    setAnalysisSet(newSet)
    localStorage.setItem('cinescope_analysis_set', JSON.stringify(newSet))
  }, [])

  const toggleAnalysisFilm = useCallback((catalogueId) => {
    setAnalysisSet(prev => {
      const next = prev.includes(catalogueId)
        ? prev.filter(id => id !== catalogueId)
        : [...prev, catalogueId]
      localStorage.setItem('cinescope_analysis_set', JSON.stringify(next))
      return next
    })
  }, [])

  const selectAllAnalysis = useCallback(() => {
    const allWithData = catalogue.filter(f => parseInt(f.import_count) > 0).map(f => f.id)
    updateAnalysisSet(allWithData)
  }, [catalogue, updateAnalysisSet])

  const clearAllAnalysis = useCallback(() => {
    updateAnalysisSet([])
  }, [updateAnalysisSet])

  // Refresh catalogue (callable from FilmCatalogue after add/update/delete)
  const refreshCatalogue = useCallback(async () => {
    try {
      const data = await api.getCatalogue(getTokenRef.current)
      setCatalogue(data.catalogue || [])
    } catch (err) {
      console.warn('Failed to refresh catalogue:', err)
    }
  }, [])


  // ═══════════════════════════════════════════════════════════════
  // CLOUD DATA LOADING (on mount)
  // ═══════════════════════════════════════════════════════════════

  useEffect(() => {
    if (!authLoaded) return // Wait for Clerk to be ready

    let cancelled = false

    async function loadCloudData() {
      try {
        // 1. Load settings
        const rawSettings = await api.getSettings(getTokenRef.current)
        if (cancelled) return
        const settings = parseCloudSettings(rawSettings)

        setSelectedFilmIdLocal(settings.selectedFilmId)
        setRevenueFormatLocal(settings.revenueFormat)
        setHasApiKey(settings.hasApiKey)
        setApiKeyDisplay(settings.apiKeyValue || '')
        setGradeSettingsLocal(settings.gradeSettings)
        setPopulationModeLocal(settings.populationMode)
        setHeatmapIntensityLocal(settings.heatmapIntensity)

        // 2. Load venues from cloud (replaces static JSON)
        const venueData = await venueApi.getVenues(getTokenRef.current)
        if (cancelled) return
        const cloudVenues = (venueData.venues || venueData || []).map(normaliseCloudVenue)
        setBaseVenues(cloudVenues)

        // 3. Load film list (lightweight — no revenue data)
        const filmList = await api.getFilms(getTokenRef.current)
        if (cancelled) return

        // 4. Load full revenue data for each film (parallel)
        const fullFilms = await Promise.all(
          filmList.map(async (f) => {
            const { film, revenues } = await api.getFilm(f.id, getTokenRef.current)
            return cloudFilmToApp(film, revenues)
          })
        )
        if (cancelled) return

        setImportedFilms(fullFilms)

        // 4b. Load film catalogue (master list)
        const catData = await api.getCatalogue(getTokenRef.current)
        if (cancelled) return
        const catList = catData.catalogue || []
        setCatalogue(catList)

        // 4c. Initialise analysis set if empty (default: all films with Comscore data)
        const storedSet = localStorage.getItem('cinescope_analysis_set')
        if (!storedSet || JSON.parse(storedSet).length === 0) {
          const defaultSet = catList.filter(f => parseInt(f.import_count) > 0).map(f => f.id)
          setAnalysisSet(defaultSet)
          localStorage.setItem('cinescope_analysis_set', JSON.stringify(defaultSet))
        } else {
          // Clean stale IDs from localStorage
          const validIds = new Set(catList.map(f => f.id))
          const cleaned = JSON.parse(storedSet).filter(id => validIds.has(id))
          setAnalysisSet(cleaned)
          localStorage.setItem('cinescope_analysis_set', JSON.stringify(cleaned))
        }

        // 5. Validate selected film still exists
        if (settings.selectedFilmId && settings.selectedFilmId !== 'all-films') {
          const exists = fullFilms.some(f => f.id === settings.selectedFilmId)
          if (!exists) {
            setSelectedFilmIdLocal(null)
          }
        }

        // 6. Load match overrides
        const { lookup } = await api.getOverrides(getTokenRef.current)
        if (cancelled) return
        setOverrides(lookup)

        setIsLoading(false)
      } catch (err) {
        console.error('CineScope: Failed to load cloud data', err)
        if (!cancelled) {
          setLoadError(err.message || 'Failed to load data from server')
          setIsLoading(false)
        }
      }
    }

    loadCloudData()
    return () => { cancelled = true }
  }, [authLoaded])


  // ── Refresh venues (called by VenueManager after add/edit/import) ──
  const refreshVenues = useCallback(async () => {
    try {
      const venueData = await venueApi.getVenues(getTokenRef.current)
      const cloudVenues = (venueData.venues || venueData || []).map(normaliseCloudVenue)
      setBaseVenues(cloudVenues)
    } catch (err) {
      console.error('CineScope: Failed to refresh venues', err)
    }
  }, [])


  // ═══════════════════════════════════════════════════════════════
  // DERIVED STATE
  // ═══════════════════════════════════════════════════════════════

  // Get the currently selected film data (or build aggregate for "all-films")
  // The "all-films" aggregate now only includes films in the analysisSet.
  const selectedFilm = useMemo(() => {
    if (!selectedFilmId) return null

    // Single film
    if (selectedFilmId !== 'all-films') {
      return importedFilms.find(f => f.id === selectedFilmId) || null
    }

    // All Films aggregate — only include films in the analysis set
    if (importedFilms.length === 0) return null

    // Filter to only films whose catalogue ID is in the analysis set
    const analysisFilms = analysisSet.length > 0
      ? importedFilms.filter(f => f.catalogueId && analysisSet.includes(f.catalogueId))
      : importedFilms // Fallback: if analysisSet is empty, include all (safety net)

    if (analysisFilms.length === 0) return null

    const venueRevMap = new Map()
    for (const film of analysisFilms) {
      for (const cs of film.comscoreVenues) {
        const key = `${cs.theater}|${cs.city}`.toLowerCase()
        if (!venueRevMap.has(key)) {
          venueRevMap.set(key, { ...cs, totalRevenue: cs.revenue, filmCount: 1 })
        } else {
          const existing = venueRevMap.get(key)
          existing.totalRevenue += cs.revenue
          existing.filmCount++
        }
      }
    }

    const combinedVenues = Array.from(venueRevMap.values()).map(v => ({
      ...v,
      revenue: Math.round(v.totalRevenue / v.filmCount),
      originalTotal: v.totalRevenue,
    }))

    const totalRevenue = combinedVenues.reduce((s, v) => s + v.revenue, 0)

    return {
      id: 'all-films',
      filmInfo: {
        title: `Selected Films (${analysisFilms.length} combined)`,
        fileName: 'aggregate',
      },
      comscoreVenues: combinedVenues,
      stats: {
        totalVenues: combinedVenues.length,
        totalRevenue,
        avgRevenue: combinedVenues.length > 0 ? Math.round(totalRevenue / combinedVenues.length) : 0,
        aggregatedCount: 0,
      },
      aggregationLog: [],
    }
  }, [selectedFilmId, importedFilms, analysisSet])

  // ── Only open venues for matching (closed venues excluded from active grading) ──
  const activeVenues = useMemo(() => {
    return baseVenues.filter(v => (v.status || 'open') === 'open')
  }, [baseVenues])

  // Run venue matching (now against active venues, with comscore_name support)
  const matchResult = useMemo(() => {
    if (!selectedFilm) {
      // No film: show all venues (including closed, marked as such)
      return {
        venues: baseVenues.map(v => ({ ...v, grade: null, revenue: null })),
        details: [],
      }
    }

    // Match only against open venues
    const { matched, unmatched, matchDetails: details } = matchVenues(
      selectedFilm.comscoreVenues, activeVenues, overrides
    )

    // ── Deduplicate matched venues by base venue identity ──
    const deduped = (() => {
      const venueMap = new Map()
      for (const v of matched) {
        const key = `${v.name}|${v.city}`.toLowerCase()
        if (!venueMap.has(key)) {
          venueMap.set(key, { ...v, _revenues: [v.revenue || 0] })
        } else {
          const existing = venueMap.get(key)
          existing._revenues.push(v.revenue || 0)
          if (v.wasAggregated) existing.wasAggregated = true
          if (v.screenEntries) {
            existing.screenEntries = (existing.screenEntries || 0) + v.screenEntries
          }
        }
      }

      return Array.from(venueMap.values()).map(({ _revenues, ...venue }) => {
        if (_revenues.length > 1) {
          venue.revenue = selectedFilmId === 'all-films'
            ? Math.round(_revenues.reduce((a, b) => a + b, 0) / _revenues.length)
            : Math.round(_revenues.reduce((a, b) => a + b, 0))
        }
        return venue
      })
    })()

    const graded = calculateGrades(deduped, gradeSettings)

    // Unmatched open venues get grade E
    const matchedKeys = new Set(graded.map(v => `${v.name}|${v.city}`.toLowerCase()))
    const eGradeVenues = activeVenues
      .filter(v => !matchedKeys.has(`${v.name}|${v.city}`.toLowerCase()))
      .map(v => ({ ...v, grade: 'E', revenue: null }))

    // Closed venues: include with null grade + closed status (visible as grey markers)
    const closedVenues = baseVenues
      .filter(v => (v.status || 'open') === 'closed')
      .map(v => ({ ...v, grade: null, revenue: null }))

    return {
      venues: [...graded, ...eGradeVenues, ...closedVenues],
      details,
    }
  }, [baseVenues, activeVenues, selectedFilm, selectedFilmId, gradeSettings, overrides])

  const venues = matchResult.venues
  const matchDetails = matchResult.details

  // ── Corrected film stats from post-match data ──
  // selectedFilm.stats uses raw Comscore name combos (inflated count).
  // This computes the real numbers from deduplicated matched venues.
  const filmDisplayStats = useMemo(() => {
    if (!selectedFilm) return null

    const withRevenue = venues.filter(v => v.revenue != null && v.grade && v.grade !== 'E')
    const totalRevenue = withRevenue.reduce((sum, v) => sum + v.revenue, 0)

    return {
      totalVenues: withRevenue.length,
      totalRevenue,
      avgRevenue: withRevenue.length > 0 ? Math.round(totalRevenue / withRevenue.length) : 0,
      aggregatedCount: selectedFilm.stats?.aggregatedCount || 0,
      // Keep total including E-grade for reference
      totalWithUnscreened: venues.filter(v => v.grade).length,
    }
  }, [selectedFilm, venues])

  // Multi-film venue lookup (for enhanced popup: per-film grades + chronological order)
  // Deferred: this is expensive (runs matchVenues for every film) but only needed
  // when a venue popup opens, so we compute it after the main render completes.
  const [venueFilmData, setVenueFilmData] = useState(new Map())

  useEffect(() => {
    // Skip if no films loaded yet
    if (importedFilms.length === 0 || activeVenues.length === 0) {
      setVenueFilmData(new Map())
      return
    }

    // Defer heavy computation so override changes render instantly
    const timer = setTimeout(() => {
      const lookup = new Map()

      for (const film of importedFilms) {
        const { matched } = matchVenues(film.comscoreVenues, activeVenues, overrides)

        // Deduplicate matched venues
        const venueMap = new Map()
        for (const v of matched) {
          const key = `${v.name}|${v.city}`.toLowerCase()
          if (!venueMap.has(key)) {
            venueMap.set(key, { ...v, _revenues: [v.revenue || 0] })
          } else {
            venueMap.get(key)._revenues.push(v.revenue || 0)
          }
        }
        const deduped = Array.from(venueMap.values()).map(({ _revenues, ...venue }) => {
          if (_revenues.length > 1) {
            venue.revenue = Math.round(_revenues.reduce((a, b) => a + b, 0))
          }
          return venue
        })

        // Calculate grades for this film's venues
        const graded = calculateGrades(deduped, gradeSettings)

        // Build lookup entries with grade, filmId, and date
        for (const venue of graded) {
          const key = `${venue.name}|${venue.city}`.toLowerCase()
          if (!lookup.has(key)) lookup.set(key, [])
          lookup.get(key).push({
            filmId: film.id,
            filmTitle: film.filmInfo.title,
            dateFrom: film.filmInfo.dateFrom || null,
            revenue: venue.revenue,
            grade: venue.grade || 'E',
          })
        }
      }

      // Sort chronologically by dateFrom (fallback: alphabetical by title)
      for (const [, films] of lookup) {
        films.sort((a, b) => {
          if (!a.dateFrom && !b.dateFrom) return a.filmTitle.localeCompare(b.filmTitle)
          if (!a.dateFrom) return 1
          if (!b.dateFrom) return -1
          return a.dateFrom.localeCompare(b.dateFrom)
        })
      }

      setVenueFilmData(lookup)
    }, 50) // Small delay lets the UI render first

    return () => clearTimeout(timer)
  }, [importedFilms, activeVenues, overrides, gradeSettings])

  // Filtered venues
  const filteredVenues = useMemo(() => {
    let result = venues

    if (gradeFilter.length > 0) {
      result = result.filter(v => v.grade && gradeFilter.includes(v.grade))
    }

    if (selectedFilm && gradeFilter.length === 0) {
      // Hide grade E venues and closed venues without revenue
      result = result.filter(v => {
        if (v.grade === 'E') return false
        // Closed venues with no grade and no revenue: hide when a film is selected
        if ((v.status || 'open') === 'closed' && v.grade == null && v.revenue == null) return false
        return true
      })
    }

    if (chainFilter) {
      result = result.filter(v => v.chain === chainFilter)
    }

    if (categoryFilter) {
      result = result.filter(v => v.category === categoryFilter)
    }

    return result
  }, [venues, gradeFilter, chainFilter, categoryFilter, selectedFilm])

  // Unique chain names
  const availableChains = useMemo(() => {
    return [...new Set(baseVenues.map(v => v.chain).filter(Boolean))].sort()
  }, [baseVenues])

  // Unique categories
  const availableCategories = useMemo(() => {
    return [...new Set(baseVenues.map(v => v.category).filter(Boolean))].sort()
  }, [baseVenues])

  // Grade summary counts
  const gradeCounts = useMemo(() => {
    const counts = { A: 0, B: 0, C: 0, D: 0, E: 0 }
    venues.forEach(v => {
      if (v.grade && counts[v.grade] !== undefined) counts[v.grade]++
    })
    return counts
  }, [venues])


  // ═══════════════════════════════════════════════════════════════
  // ACTIONS
  // ═══════════════════════════════════════════════════════════════

  // Import a Comscore file — parse and show film name dialog
  const importComscoreFile = useCallback(async (file) => {
    setImportStatus({ loading: true, error: null, success: null })

    try {
      const result = await parseComscoreFile(file)

      setPendingImport({
        result,
        fileName: file.name,
      })

      setImportStatus({ loading: false, error: null, success: null })
    } catch (err) {
      setImportStatus({ loading: false, error: err.message, success: null })
      throw err
    }
  }, [])

  // Confirm film name and finalize import → save to cloud
  const confirmImport = useCallback(async (confirmedTitle, catalogueId) => {
    if (!pendingImport) return

    const { result, fileName } = pendingImport

    try {
      // If linking to a catalogue entry, use its title (not whatever's in the text box)
      let finalTitle = confirmedTitle
      if (catalogueId) {
        const catEntry = catalogue.find(c => c.id === catalogueId)
        if (catEntry?.title) finalTitle = catEntry.title
      }

      // Transform to cloud format and save (now includes catalogueId)
      const cloudData = appFilmToCloud(result, finalTitle, catalogueId)
      const { film: savedFilm } = await api.saveFilm(cloudData, getTokenRef.current)

      // Now load the full film data back (to get the server-generated ID and clean data)
      const { film, revenues } = await api.getFilm(savedFilm.id, getTokenRef.current)
      const appFilm = cloudFilmToApp(film, revenues)

      // Add to state
      setImportedFilms(prev => [...prev, appFilm])
      setSelectedFilmId(appFilm.id)
      setGradeFilter([])
      setPendingImport(null)
      setShowMatchReview(true)

      // Auto-add to analysis set if linked to a catalogue entry
      if (catalogueId) {
        setAnalysisSet(prev => {
          if (prev.includes(catalogueId)) return prev
          const next = [...prev, catalogueId]
          localStorage.setItem('cinescope_analysis_set', JSON.stringify(next))
          return next
        })
      }

      // Refresh catalogue so import_count updates in the grid
      refreshCatalogue()

      setImportStatus({
        loading: false,
        error: null,
        success: `Imported ${result.venues.length} venues — "${finalTitle}"` +
          (result.stats.aggregatedCount > 0
            ? ` (${result.stats.aggregatedCount} multi-screen rows combined)`
            : ''),
      })

      setTimeout(() => setImportStatus(null), 5000)
    } catch (err) {
      console.error('CineScope: Failed to save film to cloud', err)
      setImportStatus({
        loading: false,
        error: `Failed to save: ${err.message}`,
        success: null,
      })
    }
  }, [pendingImport, setSelectedFilmId, refreshCatalogue, catalogue])

  // Cancel pending import
  const cancelImport = useCallback(() => {
    setPendingImport(null)
  }, [])

  // Clear film selection
  const clearFilmSelection = useCallback(() => {
    setSelectedFilmId(null)
    setGradeFilter([])
  }, [setSelectedFilmId])

  // Delete a single imported film (cloud + state)
  const removeFilm = useCallback(async (filmId) => {
    try {
      await api.deleteFilm(filmId, getTokenRef.current)
      setImportedFilms(prev => prev.filter(f => f.id !== filmId))
      setSelectedFilmIdLocal(prev => prev === filmId ? null : prev)
      setGradeFilter([])
    } catch (err) {
      console.error('CineScope: Failed to delete film', err)
    }
  }, [])

  // Clear all imported films (cloud + state)
  const clearAllFilmsData = useCallback(async () => {
    try {
      await api.deleteAllFilms(getTokenRef.current)
      setImportedFilms([])
      setSelectedFilmIdLocal(null)
      setGradeFilter([])
    } catch (err) {
      console.error('CineScope: Failed to clear all films', err)
    }
  }, [])

  // ── Unified delete: removes catalogue entry + linked Comscore imports + local state ──
  // Called from FilmDetailView Financials tab. The backend now handles deleting
  // linked films rows (which cascade-deletes film_revenues) before removing the
  // catalogue entry itself.
  const deleteFilmUnified = useCallback(async (catalogueId) => {
    try {
      // 1. Call API — deletes imports + catalogue entry server-side
      await api.deleteCatalogueEntry(catalogueId, getTokenRef.current)

      // 2. Remove linked Comscore imports from local state
      setImportedFilms(prev => prev.filter(f => f.catalogueId !== catalogueId))

      // 3. Remove from catalogue state
      setCatalogue(prev => prev.filter(f => f.id !== catalogueId))

      // 4. Remove from analysis set
      setAnalysisSet(prev => {
        const next = prev.filter(id => id !== catalogueId)
        localStorage.setItem('cinescope_analysis_set', JSON.stringify(next))
        return next
      })

      // 5. If the deleted film was selected, clear selection
      setSelectedFilmIdLocal(prev => {
        // Check if any importedFilm with this catalogueId was the selected one
        // (selectedFilmId is the Postgres integer film ID, not the catalogue UUID)
        return prev // Will be handled by the selectedFilm useMemo returning null
      })
    } catch (err) {
      console.error('CineScope: Failed to delete film (unified)', err)
      throw err
    }
  }, [])

  // Rerun matching (called after override changes)
  const rerunMatching = useCallback(() => {
    setOverrides(prev => ({ ...prev }))
  }, [])


  // ═══════════════════════════════════════════════════════════════
  // API CLIENT WRAPPER (for Film Catalogue & TMDB components)
  // Pre-binds getToken so components can call apiClient.getCatalogue()
  // without needing to pass getToken themselves.
  // ═══════════════════════════════════════════════════════════════

  const apiClient = useMemo(() => ({
    getCatalogue:        ()                     => api.getCatalogue(getTokenRef.current),
    getCatalogueEntry:   (id)                   => api.getCatalogueEntry(id, getTokenRef.current),
    createCatalogueEntry:(entry)                => api.createCatalogueEntry(entry, getTokenRef.current),
    updateCatalogueEntry:(id, updates)          => api.updateCatalogueEntry(id, updates, getTokenRef.current),
    linkCatalogueTMDB:   (id, tmdbData)          => api.linkCatalogueTMDB(id, tmdbData, getTokenRef.current),
    deleteCatalogueEntry:(id)                   => api.deleteCatalogueEntry(id, getTokenRef.current),
    searchTMDB:          (query)                => api.searchTMDB(query, getTokenRef.current),
    getTMDBDetails:      (tmdbId)               => api.getTMDBDetails(tmdbId, getTokenRef.current),
    addFilmFromTMDB:     (tmdbId, overrides)    => api.addFilmFromTMDB(tmdbId, overrides, getTokenRef.current),
  }), []) // getTokenRef is a ref — stable, no deps needed


  // ═══════════════════════════════════════════════════════════════
  // CONTEXT VALUE
  // ═══════════════════════════════════════════════════════════════

  const value = {
    // Loading
    isLoading,
    loadError,

    // Venue data
    venues,
    baseVenues,
    filteredVenues,
    refreshVenues,  // ← NEW: for VenueManager to trigger map updates

    // Film management
    importedFilms,
    selectedFilm,
    selectedFilmId,
    filmDisplayStats, // ← corrected venue/revenue counts from post-match data
    setSelectedFilmId,
    importComscoreFile,
    clearFilmSelection,
    removeFilm,
    clearAllFilmsData,
    deleteFilmUnified,
    filmsLoaded: !isLoading, // backwards compat
    importStatus,
    pendingImport,
    confirmImport,
    cancelImport,

    // Film Catalogue (master list)
    catalogue,
    refreshCatalogue,

    // Analysis Set (which films to include in combined view)
    analysisSet,
    toggleAnalysisFilm,
    selectAllAnalysis,
    clearAllAnalysis,

    // Grade settings
    gradeSettings, updateGradeSettings, resetGradeSettings,

    // Revenue formatting
    revenueFormat, updateRevenueFormat,

    // API key (hasApiKey for UI checks, apiKeyDisplay for Settings input)
    hasApiKey,
    apiKey: apiKeyDisplay, // backwards compat name for SettingsPanel
    updateApiKey,

    // AI report text (shared between TrendPanel and ExportMenu)
    aiReportText, setAiReportText,
    aiReportFilmId, setAiReportFilmId,
    aiReportChainName, setAiReportChainName,

    // Multi-film venue data (for popups)
    venueFilmData,

    // Match overrides (for MatchReviewPanel)
    overrides,
    cloudSaveOverride,
    cloudDeleteOverride,

    // Filters
    gradeFilter, setGradeFilter,
    chainFilter, setChainFilter,
    categoryFilter, setCategoryFilter,
    availableChains,
    availableCategories,

    // UI state
    selectedVenue, setSelectedVenue,
    showHeatMap, setShowHeatMap,
    showSettings, setShowSettings,
    showMatchReview, setShowMatchReview,
    showTrends, setShowTrends,
    gradeCounts,
    matchDetails,
    rerunMatching,

    // Population layer
    populationMode, updatePopulationMode,
    heatmapIntensity, updateHeatmapIntensity,

    // API client wrapper (for Film Catalogue & TMDB components)
    apiClient,
  }

  // ── Show loading screen while cloud data fetches ──
  if (isLoading) {
    return (
      <AppContext.Provider value={value}>
        <div className="d-flex flex-column align-items-center justify-content-center vh-100" style={{ background: '#1a365d' }}>
          <div className="spinner-border text-light mb-3" role="status" style={{ width: '3rem', height: '3rem' }}>
            <span className="visually-hidden">Loading...</span>
          </div>
          <div style={{ color: '#fff', fontSize: '1.1rem', fontWeight: 500 }}>Loading CineScope...</div>
          <div style={{ color: 'rgba(255,255,255,0.5)', fontSize: '0.8rem', marginTop: 4 }}>Fetching your data from the cloud</div>
        </div>
      </AppContext.Provider>
    )
  }

  // ── Show error screen if cloud load failed ──
  if (loadError) {
    return (
      <AppContext.Provider value={value}>
        <div className="d-flex flex-column align-items-center justify-content-center vh-100" style={{ background: '#1a365d' }}>
          <div style={{ color: '#e74c3c', fontSize: '2rem', marginBottom: 16 }}>⚠</div>
          <div style={{ color: '#fff', fontSize: '1.1rem', fontWeight: 500 }}>Failed to load CineScope</div>
          <div style={{ color: 'rgba(255,255,255,0.6)', fontSize: '0.85rem', marginTop: 8, maxWidth: 400, textAlign: 'center' }}>
            {loadError}
          </div>
          <button
            className="btn btn-outline-light btn-sm mt-3"
            onClick={() => window.location.reload()}
          >
            Retry
          </button>
        </div>
      </AppContext.Provider>
    )
  }

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>
}

export function useApp() {
  const ctx = useContext(AppContext)
  if (!ctx) throw new Error('useApp must be used within AppProvider')
  return ctx
}
