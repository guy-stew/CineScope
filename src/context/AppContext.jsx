/**
 * CineScope — App Context (v2.0 cloud)
 *
 * Central state management for the entire application.
 * All persistent data now loads from / saves to the cloud backend
 * (Neon Postgres via Vercel serverless API), authenticated via Clerk.
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
import venueData from '../data/venues.json'
import { calculateGrades, DEFAULT_GRADE_SETTINGS } from '../utils/grades'
import { parseComscoreFile } from '../utils/comscoreParser'
import { matchVenues } from '../utils/venueMatcher'
import * as api from '../utils/apiClient'

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
    filmInfo: {
      title: film.title,
      year: film.year || null,
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
function appFilmToCloud(parsedResult, confirmedTitle) {
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

  // ── Base venue data (geocoded venues — never changes) ──
  const [baseVenues] = useState(venueData.venues)

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

  // Save an override to cloud + update local state
  const cloudSaveOverride = useCallback(async (data) => {
    try {
      await api.saveOverride(data, getTokenRef.current)
      // Update local override lookup
      const key = `${(data.comscoreTheater || '').toLowerCase()}|${(data.comscoreCity || '').toLowerCase()}`
      setOverrides(prev => ({
        ...prev,
        [key]: {
          venueName: data.venueName || null,
          venueCity: data.venueCity || null,
          action: data.action,
        },
      }))
    } catch (err) {
      console.error('CineScope: Could not save override to cloud', err)
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
        // If we don't have the ID, save a fresh "assign" then delete
        // Or we can just remove from local state. The next full load will reconcile.
        // For safety, let's re-fetch overrides
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

        // 2. Load film list (lightweight — no revenue data)
        const filmList = await api.getFilms(getTokenRef.current)
        if (cancelled) return

        // 3. Load full revenue data for each film (parallel)
        const fullFilms = await Promise.all(
          filmList.map(async (f) => {
            const { film, revenues } = await api.getFilm(f.id, getTokenRef.current)
            return cloudFilmToApp(film, revenues)
          })
        )
        if (cancelled) return

        setImportedFilms(fullFilms)

        // 4. Validate selected film still exists
        if (settings.selectedFilmId && settings.selectedFilmId !== 'all-films') {
          const exists = fullFilms.some(f => f.id === settings.selectedFilmId)
          if (!exists) {
            setSelectedFilmIdLocal(null)
          }
        }

        // 5. Load match overrides
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


  // ═══════════════════════════════════════════════════════════════
  // DERIVED STATE
  // ═══════════════════════════════════════════════════════════════

  // Get the currently selected film data (or build aggregate for "all-films")
  const selectedFilm = useMemo(() => {
    if (!selectedFilmId) return null

    // Single film
    if (selectedFilmId !== 'all-films') {
      return importedFilms.find(f => f.id === selectedFilmId) || null
    }

    // All Films aggregate
    if (importedFilms.length === 0) return null

    const venueRevMap = new Map()
    for (const film of importedFilms) {
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
        title: `All Films (${importedFilms.length} combined)`,
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
  }, [selectedFilmId, importedFilms])

  // Run venue matching (now takes overrides as parameter)
  const matchResult = useMemo(() => {
    if (!selectedFilm) {
      return {
        venues: baseVenues.map(v => ({ ...v, grade: null, revenue: null })),
        details: [],
      }
    }

    const { matched, unmatched, matchDetails: details } = matchVenues(
      selectedFilm.comscoreVenues, baseVenues, overrides
    )

    // ── Deduplicate matched venues by base venue identity ──
    // Multiple Comscore entries (from different films with slightly different
    // naming, or residual multi-screen variants) can all match to the same
    // base venue.  Merge them into ONE entry per physical cinema so we get
    // one map pin and one table row per venue.
    const deduped = (() => {
      const venueMap = new Map()
      for (const v of matched) {
        const key = `${v.name}|${v.city}`.toLowerCase()
        if (!venueMap.has(key)) {
          // First occurrence — clone and start tracking revenue entries
          venueMap.set(key, { ...v, _revenues: [v.revenue || 0] })
        } else {
          // Duplicate — accumulate revenue
          const existing = venueMap.get(key)
          existing._revenues.push(v.revenue || 0)
          // Preserve aggregation flag if any entry was aggregated
          if (v.wasAggregated) existing.wasAggregated = true
          if (v.screenEntries) {
            existing.screenEntries = (existing.screenEntries || 0) + v.screenEntries
          }
        }
      }

      return Array.from(venueMap.values()).map(({ _revenues, ...venue }) => {
        if (_revenues.length > 1) {
          // "All Films" mode: each entry is already an average for its Comscore key,
          // so average again across the duplicate matches to get the true per-venue average.
          // Single film mode: sum (handles any residual multi-screen leakage).
          venue.revenue = selectedFilmId === 'all-films'
            ? Math.round(_revenues.reduce((a, b) => a + b, 0) / _revenues.length)
            : Math.round(_revenues.reduce((a, b) => a + b, 0))
        }
        return venue
      })
    })()

    const graded = calculateGrades(deduped, gradeSettings)

    const matchedKeys = new Set(graded.map(v => `${v.name}|${v.city}`.toLowerCase()))
    const eGradeVenues = baseVenues
      .filter(v => !matchedKeys.has(`${v.name}|${v.city}`.toLowerCase()))
      .map(v => ({ ...v, grade: 'E', revenue: null }))

    return {
      venues: [...graded, ...eGradeVenues],
      details,
    }
  }, [baseVenues, selectedFilm, selectedFilmId, gradeSettings, overrides])

  const venues = matchResult.venues
  const matchDetails = matchResult.details

  // Multi-film venue lookup (for popups showing all films)
  const venueFilmData = useMemo(() => {
    const lookup = new Map()

    for (const film of importedFilms) {
      const { matched } = matchVenues(film.comscoreVenues, baseVenues, overrides)

      for (const venue of matched) {
        const key = `${venue.name}|${venue.city}`.toLowerCase()
        if (!lookup.has(key)) lookup.set(key, [])
        lookup.get(key).push({
          filmTitle: film.filmInfo.title,
          revenue: venue.revenue,
        })
      }
    }

    for (const [, films] of lookup) {
      films.sort((a, b) => a.filmTitle.localeCompare(b.filmTitle))
    }

    return lookup
  }, [importedFilms, baseVenues, overrides])

  // Filtered venues
  const filteredVenues = useMemo(() => {
    let result = venues

    if (gradeFilter.length > 0) {
      result = result.filter(v => v.grade && gradeFilter.includes(v.grade))
    }

    if (selectedFilm && gradeFilter.length === 0) {
      result = result.filter(v => v.grade !== 'E')
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
  const confirmImport = useCallback(async (confirmedTitle) => {
    if (!pendingImport) return

    const { result, fileName } = pendingImport

    try {
      // Transform to cloud format and save
      const cloudData = appFilmToCloud(result, confirmedTitle)
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

      setImportStatus({
        loading: false,
        error: null,
        success: `Imported ${result.venues.length} venues — "${confirmedTitle}"` +
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
  }, [pendingImport, setSelectedFilmId])

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

  // Rerun matching (called after override changes — now the `overrides` dependency handles it,
  // but we keep this for backwards compatibility with MatchReviewPanel)
  const rerunMatching = useCallback(() => {
    // overrides state change already triggers useMemo re-run,
    // but this provides an explicit signal for edge cases
    setOverrides(prev => ({ ...prev }))
  }, [])


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

    // Film management
    importedFilms,
    selectedFilm,
    selectedFilmId,
    setSelectedFilmId,
    importComscoreFile,
    clearFilmSelection,
    removeFilm,
    clearAllFilmsData,
    filmsLoaded: !isLoading, // backwards compat
    importStatus,
    pendingImport,
    confirmImport,
    cancelImport,

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
