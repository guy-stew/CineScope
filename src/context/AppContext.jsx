import React, { createContext, useContext, useState, useMemo, useCallback } from 'react'
import venueData from '../data/venues.json'
import { calculateGrades, DEFAULT_GRADE_SETTINGS } from '../utils/grades'
import { parseComscoreFile } from '../utils/comscoreParser'
import { matchVenues } from '../utils/venueMatcher'

const AppContext = createContext(null)

export function AppProvider({ children }) {
  // Base venue data (geocoded venues — never changes)
  const [baseVenues] = useState(venueData.venues)

  // Imported films: array of { id, filmInfo, comscoreVenues, stats }
  const [importedFilms, setImportedFilms] = useState([])

  // Currently selected film ID (null = show all venues, no grades)
  const [selectedFilmId, setSelectedFilmId] = useState(null)

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
  const [importStatus, setImportStatus] = useState(null)

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
    importStatus,
    pendingImport,
    confirmImport,
    cancelImport,

    // Grade settings
    gradeSettings, updateGradeSettings, resetGradeSettings,

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
    gradeCounts,
    matchDetails,
    rerunMatching,
  }

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>
}

export function useApp() {
  const ctx = useContext(AppContext)
  if (!ctx) throw new Error('useApp must be used within AppProvider')
  return ctx
}
