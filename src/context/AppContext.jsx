import React, { createContext, useContext, useState, useMemo, useCallback } from 'react'
import sampleData from '../data/venues-sample.json'
import { calculateGrades } from '../utils/grades'
import { parseComscoreFile } from '../utils/comscoreParser'
import { matchVenues } from '../utils/venueMatcher'

const AppContext = createContext(null)

export function AppProvider({ children }) {
  // Base venue data (geocoded venues — never changes)
  const [baseVenues] = useState(sampleData.venues)

  // Imported films: array of { id, filmInfo, comscoreVenues, stats }
  const [importedFilms, setImportedFilms] = useState([])

  // Currently selected film ID (null = show all venues, no grades)
  const [selectedFilmId, setSelectedFilmId] = useState(null)

  // Filters
  const [gradeFilter, setGradeFilter] = useState([])
  const [chainFilter, setChainFilter] = useState('')
  const [categoryFilter, setCategoryFilter] = useState('')

  // UI state
  const [selectedVenue, setSelectedVenue] = useState(null)
  const [showHeatMap, setShowHeatMap] = useState(false)
  const [importStatus, setImportStatus] = useState(null) // { loading, error, success }

  // Get the currently selected film data
  const selectedFilm = useMemo(() => {
    if (!selectedFilmId) return null
    return importedFilms.find(f => f.id === selectedFilmId) || null
  }, [selectedFilmId, importedFilms])

  // Build the enriched venue list:
  // - If a film is selected: merge revenue data + calculate grades
  // - If no film selected: show base venues without grades
  const venues = useMemo(() => {
    if (!selectedFilm) {
      // No film selected — show all base venues, no grades
      return baseVenues.map(v => ({ ...v, grade: null, revenue: null }))
    }

    // Match Comscore data to geocoded venues
    const { matched, unmatched } = matchVenues(selectedFilm.comscoreVenues, baseVenues)

    // Calculate grades on matched venues
    const graded = calculateGrades(matched)

    // Add E grade for unmatched base venues (didn't screen this film)
    const matchedNames = new Set(graded.map(v => v.name))
    const eGradeVenues = baseVenues
      .filter(v => !matchedNames.has(v.name))
      .map(v => ({ ...v, grade: 'E', revenue: null }))

    return [...graded, ...eGradeVenues]
  }, [baseVenues, selectedFilm])

  // Filtered venues
  const filteredVenues = useMemo(() => {
    let result = venues

    // Filter by grade
    if (gradeFilter.length > 0) {
      result = result.filter(v => v.grade && gradeFilter.includes(v.grade))
    }

    // Hide E grades when a film is selected
    if (selectedFilm && gradeFilter.length === 0) {
      result = result.filter(v => v.grade !== 'E')
    }

    // Filter by chain
    if (chainFilter) {
      result = result.filter(v => v.chain === chainFilter)
    }

    // Filter by category
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

  // Grade summary counts (from current venue set)
  const gradeCounts = useMemo(() => {
    const counts = { A: 0, B: 0, C: 0, D: 0, E: 0 }
    venues.forEach(v => {
      if (v.grade && counts[v.grade] !== undefined) {
        counts[v.grade]++
      }
    })
    return counts
  }, [venues])

  // Import a Comscore file
  const importComscoreFile = useCallback(async (file) => {
    setImportStatus({ loading: true, error: null, success: null })

    try {
      const result = await parseComscoreFile(file)
      const filmId = `film-${Date.now()}`

      const filmEntry = {
        id: filmId,
        filmInfo: result.filmInfo,
        comscoreVenues: result.venues,
        stats: result.stats,
        aggregationLog: result.aggregationLog || [],
      }

      setImportedFilms(prev => [...prev, filmEntry])
      setSelectedFilmId(filmId)
      setGradeFilter([]) // reset filters on new import

      setImportStatus({
        loading: false,
        error: null,
        success: `Imported ${result.venues.length} venues from "${result.filmInfo.title || file.name}"` +
          (result.stats.aggregatedCount > 0
            ? ` (${result.stats.aggregatedCount} multi-screen rows combined)`
            : ''),
      })

      // Clear success message after 5 seconds
      setTimeout(() => setImportStatus(null), 5000)

      return filmEntry
    } catch (err) {
      setImportStatus({ loading: false, error: err.message, success: null })
      throw err
    }
  }, [])

  // Clear film selection (show all venues)
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

    // Filters
    gradeFilter, setGradeFilter,
    chainFilter, setChainFilter,
    categoryFilter, setCategoryFilter,
    availableChains,
    availableCategories,

    // UI state
    selectedVenue, setSelectedVenue,
    showHeatMap, setShowHeatMap,
    gradeCounts,
  }

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>
}

export function useApp() {
  const ctx = useContext(AppContext)
  if (!ctx) throw new Error('useApp must be used within AppProvider')
  return ctx
}
