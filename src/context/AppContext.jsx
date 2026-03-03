import React, { createContext, useContext, useState, useMemo, useCallback, useEffect } from 'react'
import venueData from '../data/venues.json'
import { calculateGrades, DEFAULT_GRADE_SETTINGS } from '../utils/grades'
import { parseComscoreFile } from '../utils/comscoreParser'
import { matchVenues } from '../utils/venueMatcher'
import { saveFilm, loadAllFilms, deleteFilm as removeFilmFromDB, clearAllFilms } from '../utils/filmStorage'

const AppContext = createContext(null)

export function AppProvider({ children }) {
  // Base venue data (geocoded venues — never changes)
  const [baseVenues] = useState(venueData.venues)

  // Imported films: array of { id, filmInfo, comscoreVenues, stats }
  const [importedFilms, setImportedFilms] = useState([])
  const [filmsLoaded, setFilmsLoaded] = useState(false)

  // Currently selected film ID (persisted to localStorage)
  const [selectedFilmId, setSelectedFilmId] = useState(() => {
    try {
      return localStorage.getItem('cinescope-selected-film') || null
    } catch { return null }
  })

  // Persist selected film ID to localStorage
  useEffect(() => {
    try {
      if (selectedFilmId) {
        localStorage.setItem('cinescope-selected-film', selectedFilmId)
      } else {
        localStorage.removeItem('cinescope-selected-film')
      }
    } catch {}
  }, [selectedFilmId])

  // Load saved films from IndexedDB on mount
  useEffect(() => {
    loadAllFilms().then(savedFilms => {
      if (savedFilms.length > 0) {
        setImportedFilms(savedFilms)
      }
      setFilmsLoaded(true)
    }).catch(() => {
      setFilmsLoaded(true)
    })
  }, [])

  // If the persisted selectedFilmId doesn't match any loaded film, clear it
  useEffect(() => {
    if (!filmsLoaded) return
    if (!selectedFilmId) return
    if (selectedFilmId === 'all-films' && importedFilms.length > 0) return
    if (importedFilms.some(f => f.id === selectedFilmId)) return
    // Film no longer exists — clear selection
    setSelectedFilmId(null)
  }, [filmsLoaded, importedFilms, selectedFilmId])

  // Revenue format setting: 'rounded' (whole pounds) or 'decimal' (2 d.p.)
  const [revenueFormat, setRevenueFormat] = useState(() => {
    try {
      return localStorage.getItem('cinescope-revenue-format') || 'decimal'
    } catch { return 'decimal' }
  })

  const updateRevenueFormat = useCallback((format) => {
    setRevenueFormat(format)
    try { localStorage.setItem('cinescope-revenue-format', format) } catch {}
  }, [])

  // Anthropic API key for AI insights (stored in localStorage, never leaves browser)
  const [apiKey, setApiKey] = useState(() => {
    try {
      return localStorage.getItem('cinescope-api-key') || ''
    } catch { return '' }
  })

  const updateApiKey = useCallback((key) => {
    setApiKey(key)
    try {
      if (key) {
        localStorage.setItem('cinescope-api-key', key)
      } else {
        localStorage.removeItem('cinescope-api-key')
      }
    } catch {}
  }, [])

  // AI report text — shared between TrendPanel (generates) and ExportMenu (includes in PDF)
  const [aiReportText, setAiReportText] = useState(null)
  // Which film the AI report was generated for (so ExportMenu knows if it's stale)
  const [aiReportFilmId, setAiReportFilmId] = useState(null)

  // Grade boundary settings (persisted to localStorage)
  const [gradeSettings, setGradeSettings] = useState(() => {
    try {
      const saved = localStorage.getItem('cinescope-grade-settings')
      return saved ? JSON.parse(saved) : DEFAULT_GRADE_SETTINGS
    } catch {
      return DEFAULT_GRADE_SETTINGS
    }
  })

  // Persist grade settings
  const updateGradeSettings = useCallback((newSettings) => {
    setGradeSettings(newSettings)
    try {
      localStorage.setItem('cinescope-grade-settings', JSON.stringify(newSettings))
    } catch { /* localStorage might not be available */ }
  }, [])

  const resetGradeSettings = useCallback(() => {
    updateGradeSettings(DEFAULT_GRADE_SETTINGS)
  }, [updateGradeSettings])

  // Filters
  const [gradeFilter, setGradeFilter] = useState([])
  const [chainFilter, setChainFilter] = useState('')
  const [categoryFilter, setCategoryFilter] = useState('')

  // UI state
  const [selectedVenue, setSelectedVenue] = useState(null)
  const [showHeatMap, setShowHeatMap] = useState(false)
  const [showSettings, setShowSettings] = useState(false)
  const [showMatchReview, setShowMatchReview] = useState(false)
  const [showTrends, setShowTrends] = useState(false)
  const [importStatus, setImportStatus] = useState(null)

  // Population layer state (persisted to localStorage)
  const [populationMode, setPopulationMode] = useState(() => {
    try {
      return localStorage.getItem('cinescope-pop-mode') || 'off'
    } catch { return 'off' }
  })

  const [heatmapIntensity, setHeatmapIntensity] = useState(() => {
    try {
      const saved = localStorage.getItem('cinescope-pop-intensity')
      return saved ? parseFloat(saved) : 0.6
    } catch { return 0.6 }
  })

  // Persist population settings
  const updatePopulationMode = useCallback((mode) => {
    setPopulationMode(mode)
    try { localStorage.setItem('cinescope-pop-mode', mode) } catch {}
  }, [])

  const updateHeatmapIntensity = useCallback((val) => {
    setHeatmapIntensity(val)
    try { localStorage.setItem('cinescope-pop-intensity', String(val)) } catch {}
  }, [])

  // Pending import — holds parsed data while waiting for film name confirmation
  const [pendingImport, setPendingImport] = useState(null)

  // Get the currently selected film data (or build aggregate for "all-films")
  const selectedFilm = useMemo(() => {
    if (!selectedFilmId) return null

    // Single film
    if (selectedFilmId !== 'all-films') {
      return importedFilms.find(f => f.id === selectedFilmId) || null
    }

    // All Films aggregate — combine all imported films
    if (importedFilms.length === 0) return null

    // Merge all Comscore venues, averaging revenue per venue across films
    const venueRevMap = new Map() // key → { totalRev, filmCount, ...baseData }

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

    // Average the revenue across films each venue appeared in
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

  // Force re-run matching (called after manual override changes)
  const [matchVersion, setMatchVersion] = useState(0)
  const rerunMatching = useCallback(() => {
    setMatchVersion(v => v + 1)
  }, [])

  // Run venue matching (produces both venues and match details)
  const matchResult = useMemo(() => {
    if (!selectedFilm) {
      return {
        venues: baseVenues.map(v => ({ ...v, grade: null, revenue: null })),
        details: [],
      }
    }

    const { matched, unmatched, matchDetails: details } = matchVenues(selectedFilm.comscoreVenues, baseVenues)

    // Pass grade settings to calculateGrades
    const graded = calculateGrades(matched, gradeSettings)

    // Add E grade for unmatched base venues
    const matchedKeys = new Set(graded.map(v => `${v.name}|${v.city}`.toLowerCase()))
    const eGradeVenues = baseVenues
      .filter(v => !matchedKeys.has(`${v.name}|${v.city}`.toLowerCase()))
      .map(v => ({ ...v, grade: 'E', revenue: null }))

    return {
      venues: [...graded, ...eGradeVenues],
      details,
    }
    // matchVersion triggers re-computation after manual overrides
  }, [baseVenues, selectedFilm, gradeSettings, matchVersion])

  const venues = matchResult.venues
  const matchDetails = matchResult.details

  // ── Multi-film venue lookup ────────────────────────────────
  // Build a map of venueKey → [{ filmTitle, revenue }] across ALL imported films.
  // This lets popups show all films' data for each venue regardless of which film is selected.
  const venueFilmData = useMemo(() => {
    const lookup = new Map() // venueKey → [{ filmTitle, revenue }]

    for (const film of importedFilms) {
      // Run matching for each film to get venue associations
      const { matched } = matchVenues(film.comscoreVenues, baseVenues)

      for (const venue of matched) {
        const key = `${venue.name}|${venue.city}`.toLowerCase()
        if (!lookup.has(key)) {
          lookup.set(key, [])
        }
        lookup.get(key).push({
          filmTitle: film.filmInfo.title,
          revenue: venue.revenue,
        })
      }
    }

    // Sort each venue's film list alphabetically
    for (const [, films] of lookup) {
      films.sort((a, b) => a.filmTitle.localeCompare(b.filmTitle))
    }

    return lookup
  }, [importedFilms, baseVenues])

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
      if (v.grade && counts[v.grade] !== undefined) {
        counts[v.grade]++
      }
    })
    return counts
  }, [venues])

  // Import a Comscore file — parse and show film name dialog
  const importComscoreFile = useCallback(async (file) => {
    setImportStatus({ loading: true, error: null, success: null })

    try {
      const result = await parseComscoreFile(file)

      // Store parsed data and show the film name confirmation dialog
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

  // Confirm film name and finalize import
  const confirmImport = useCallback((confirmedTitle) => {
    if (!pendingImport) return

    const { result, fileName } = pendingImport
    const filmId = `film-${Date.now()}`

    // Override the title with what the user confirmed/edited
    const filmInfo = { ...result.filmInfo, title: confirmedTitle }

    const filmEntry = {
      id: filmId,
      filmInfo,
      comscoreVenues: result.venues,
      stats: result.stats,
      aggregationLog: result.aggregationLog || [],
    }

    setImportedFilms(prev => [...prev, filmEntry])
    setSelectedFilmId(filmId)
    setGradeFilter([])
    setPendingImport(null)
    setShowMatchReview(true) // Auto-show review panel after import

    // Persist to IndexedDB (fire and forget — non-blocking)
    saveFilm(filmEntry)

    setImportStatus({
      loading: false,
      error: null,
      success: `Imported ${result.venues.length} venues — "${confirmedTitle}"` +
        (result.stats.aggregatedCount > 0
          ? ` (${result.stats.aggregatedCount} multi-screen rows combined)`
          : ''),
    })

    setTimeout(() => setImportStatus(null), 5000)
  }, [pendingImport])

  // Cancel pending import
  const cancelImport = useCallback(() => {
    setPendingImport(null)
  }, [])

  // Clear film selection
  const clearFilmSelection = useCallback(() => {
    setSelectedFilmId(null)
    setGradeFilter([])
  }, [])

  // Delete a single imported film (from state + IndexedDB)
  const removeFilm = useCallback((filmId) => {
    setImportedFilms(prev => prev.filter(f => f.id !== filmId))
    removeFilmFromDB(filmId)
    // If the deleted film was selected, clear selection
    setSelectedFilmId(prev => prev === filmId ? null : prev)
    setGradeFilter([])
  }, [])

  // Clear all imported films (state + IndexedDB)
  const clearAllFilmsData = useCallback(() => {
    setImportedFilms([])
    clearAllFilms()
    setSelectedFilmId(null)
    setGradeFilter([])
  }, [])

  const value = {
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
    filmsLoaded,
    importStatus,
    pendingImport,
    confirmImport,
    cancelImport,

    // Grade settings
    gradeSettings, updateGradeSettings, resetGradeSettings,

    // Revenue formatting
    revenueFormat, updateRevenueFormat,

    // API key for AI insights
    apiKey, updateApiKey,

    // AI report text (shared between TrendPanel and ExportMenu for PDF export)
    aiReportText, setAiReportText,
    // Which film the AI report was generated for (lets ExportMenu check freshness)
    aiReportFilmId, setAiReportFilmId,

    // Multi-film venue data (for popups showing all films)
    venueFilmData,

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

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>
}

export function useApp() {
  const ctx = useContext(AppContext)
  if (!ctx) throw new Error('useApp must be used within AppProvider')
  return ctx
}
