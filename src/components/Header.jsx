/**
 * CineScope — Header (v3.0 Stage 6 — Final Polish)
 *
 * Slim header matching mockup design:
 *   Left:  CineScope logo + current view name
 *   Right: Import (icon) + Export + Match Review (conditional) + Settings + Theme
 */

import React, { useRef } from 'react'
import { useApp } from '../context/AppContext'
import { useTheme } from '../context/ThemeContext'
import ExportMenu from './ExportMenu'
import Icon from './Icon'

const VIEW_LABELS = {
  map: 'Map',
  films: 'Film Catalogue',
  venues: 'Venue Manager',
  trends: 'Performance & Trends',
  promote: 'Promote',
}

export default function Header({ currentView }) {
  const {
    selectedFilm,
    showSettings, setShowSettings,
    showMatchReview, setShowMatchReview,
    matchDetails,
    importComscoreFile, importStatus,
  } = useApp()

  const { themeName, toggleTheme } = useTheme()
  const fileInputRef = useRef(null)

  const reviewCount = selectedFilm && matchDetails.length > 0
    ? matchDetails.filter(m => m.confidence.key === 'medium' || m.confidence.key === 'low').length
    : 0

  const handleFileClick = () => fileInputRef.current?.click()
  const handleFileChange = async (e) => {
    const file = e.target.files?.[0]
    if (!file) return
    try { await importComscoreFile(file) } catch (err) { console.error('Import failed:', err) }
    e.target.value = ''
  }

  return (
    <header className="cs-header">
      {/* Left: Logo + View name */}
      <div className="cs-header__left">
        <div className="cs-header__brand">
          <Icon name="movie" size={22} />
          <span className="cs-header__title">CineScope</span>
        </div>
        {currentView && (
          <div className="cs-header__view-name">
            {VIEW_LABELS[currentView] || ''}
          </div>
        )}
      </div>

      {/* Right: Action icons */}
      <div className="cs-header__right">
        {/* Import status indicator */}
        {importStatus?.loading && (
          <div className="cs-header__status cs-header__status--loading">
            <Icon name="progress_activity" size={16} />
          </div>
        )}
        {importStatus?.success && (
          <div className="cs-header__status cs-header__status--success" title={importStatus.success}>
            <Icon name="check_circle" size={16} />
          </div>
        )}
        {importStatus?.error && (
          <div className="cs-header__status cs-header__status--error" title={importStatus.error}>
            <Icon name="error" size={16} />
          </div>
        )}

        {/* Import Comscore file */}
        <input type="file" ref={fileInputRef} onChange={handleFileChange} accept=".csv,.xls,.xlsx" className="d-none" />
        <button
          className="cs-header__icon-btn"
          onClick={handleFileClick}
          title="Import Comscore data"
        >
          <Icon name="upload_file" size={18} />
        </button>

        {/* Export */}
        <ExportMenu />

        {/* Match review — only when film loaded and matches exist */}
        {selectedFilm && matchDetails.length > 0 && (
          <button
            className={`cs-header__icon-btn ${reviewCount > 0 ? 'cs-header__icon-btn--warn' : ''}`}
            onClick={() => setShowMatchReview(true)}
            title={`Review venue matching${reviewCount > 0 ? ` (${reviewCount} need attention)` : ''}`}
          >
            <Icon name="link" size={18} />
            {reviewCount > 0 && (
              <span className="cs-header__badge">{reviewCount}</span>
            )}
          </button>
        )}

        {/* Settings */}
        <button
          className="cs-header__icon-btn"
          onClick={() => setShowSettings(true)}
          title="Grade boundary settings"
        >
          <Icon name="settings" size={18} />
        </button>

        {/* Theme toggle */}
        <button
          className="cs-header__icon-btn"
          onClick={toggleTheme}
          title={`Switch to ${themeName === 'light' ? 'dark' : 'light'} theme`}
        >
          <Icon name={themeName === 'light' ? 'dark_mode' : 'light_mode'} size={18} />
        </button>
      </div>
    </header>
  )
}
