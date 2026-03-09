/**
 * CineScope — Film Selector Dropdown (v3.4)
 *
 * Shared custom dropdown for selecting active film and toggling analysis set.
 * Used in MapPanel and TrendPanel.
 *
 * Features:
 *   - "All Venues (no film)" option
 *   - "Selected Films (N)" combined view option
 *   - Individual film rows with checkbox (analysis set) + click to select
 *   - Select All / Deselect All toggles
 *   - Closes on outside click
 *
 * Props:
 *   compact  - boolean: uses smaller styling (e.g. for toolbar badges)
 */

import React, { useState, useRef, useEffect, useMemo } from 'react'
import { useApp } from '../context/AppContext'
import Icon from './Icon'

export default function FilmSelectorDropdown({ compact = false }) {
  const {
    selectedFilmId, setSelectedFilmId, clearFilmSelection,
    importedFilms,
    catalogue,
    analysisSet,
    toggleAnalysisFilm,
    selectAllAnalysis,
    clearAllAnalysis,
  } = useApp()

  const [open, setOpen] = useState(false)
  const ref = useRef(null)

  // Close on outside click
  useEffect(() => {
    if (!open) return
    const handler = (e) => {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [open])

  // Films with Comscore data
  const filmsWithData = useMemo(() =>
    catalogue.filter(f => parseInt(f.import_count) > 0),
    [catalogue]
  )

  // Map catalogue ID → imported film ID
  const getImportedFilmId = (catEntry) => {
    const imp = importedFilms.find(f => f.catalogueId === catEntry.id)
    return imp ? imp.id : null
  }

  const analysisCount = filmsWithData.filter(f => analysisSet.includes(f.id)).length
  const allChecked = analysisCount === filmsWithData.length && filmsWithData.length > 0

  // Display label for the trigger button
  const displayLabel = useMemo(() => {
    if (!selectedFilmId) return 'All Venues (no film)'
    if (selectedFilmId === 'all-films') return `Selected Films (${analysisCount})`
    const film = importedFilms.find(f => f.id === selectedFilmId)
    if (film) {
      const title = film.filmInfo?.title || 'Untitled'
      return title.length > 36 ? title.slice(0, 34) + '...' : title
    }
    return 'Select film...'
  }, [selectedFilmId, importedFilms, analysisCount])

  const handleSelectFilm = (filmId) => {
    if (filmId === null) {
      clearFilmSelection()
    } else {
      setSelectedFilmId(filmId)
    }
    setOpen(false)
  }

  const handleToggleCheck = (e, catalogueId) => {
    e.stopPropagation()
    toggleAnalysisFilm(catalogueId)
  }

  return (
    <div className={`cs-film-dd ${compact ? 'cs-film-dd--compact' : ''}`} ref={ref}>
      {/* ── Trigger button ── */}
      <button
        className="cs-film-dd__trigger"
        onClick={() => setOpen(!open)}
        title={displayLabel}
      >
        <Icon name="movie" size={compact ? 14 : 15} />
        <span className="cs-film-dd__trigger-text">{displayLabel}</span>
        <Icon name={open ? 'expand_less' : 'expand_more'} size={16} />
      </button>

      {/* ── Dropdown menu ── */}
      {open && (
        <div className="cs-film-dd__menu">
          {/* No film */}
          <div
            className={`cs-film-dd__item ${!selectedFilmId ? 'cs-film-dd__item--active' : ''}`}
            onClick={() => handleSelectFilm(null)}
          >
            <Icon name="visibility_off" size={15} className="cs-film-dd__item-icon" />
            <span className="cs-film-dd__item-label">All Venues (no film)</span>
          </div>

          {/* Combined view */}
          {filmsWithData.length >= 2 && (
            <div
              className={`cs-film-dd__item ${selectedFilmId === 'all-films' ? 'cs-film-dd__item--active' : ''}`}
              onClick={() => handleSelectFilm('all-films')}
            >
              <Icon name="layers" size={15} className="cs-film-dd__item-icon" />
              <span className="cs-film-dd__item-label">
                Selected Films ({analysisCount})
              </span>
            </div>
          )}

          {/* Divider + Select All / Deselect All */}
          {filmsWithData.length > 0 && (
            <>
              <div className="cs-film-dd__divider" />
              <div className="cs-film-dd__controls">
                <button
                  className="cs-film-dd__ctrl-btn"
                  onClick={(e) => { e.stopPropagation(); allChecked ? clearAllAnalysis() : selectAllAnalysis() }}
                >
                  {allChecked ? 'Deselect All' : 'Select All'}
                </button>
                <span className="cs-film-dd__ctrl-count">
                  {analysisCount} of {filmsWithData.length}
                </span>
              </div>
            </>
          )}

          {/* Individual films */}
          <div className="cs-film-dd__films">
            {filmsWithData.map(catFilm => {
              const impId = getImportedFilmId(catFilm)
              if (!impId) return null
              const isChecked = analysisSet.includes(catFilm.id)
              const isActive = selectedFilmId === impId

              return (
                <div
                  key={catFilm.id}
                  className={`cs-film-dd__film ${isActive ? 'cs-film-dd__film--active' : ''}`}
                  onClick={() => handleSelectFilm(impId)}
                  title={catFilm.title}
                >
                  {/* Checkbox */}
                  <div
                    className={`cs-film-dd__check ${isChecked ? 'cs-film-dd__check--on' : ''}`}
                    onClick={(e) => handleToggleCheck(e, catFilm.id)}
                  >
                    {isChecked && <Icon name="check" size={12} />}
                  </div>

                  {/* Film title */}
                  <span className="cs-film-dd__film-title">{catFilm.title}</span>
                </div>
              )
            })}
          </div>

          {filmsWithData.length === 0 && (
            <div className="cs-film-dd__empty">
              No films with Comscore data
            </div>
          )}
        </div>
      )}
    </div>
  )
}
