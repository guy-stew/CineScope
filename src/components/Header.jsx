/**
 * CineScope — Header (v3.0 Final)
 *
 * Minimal header matching mockup:
 *   Left:  CineScope logo + current view name
 *   Right: Match Review (conditional) + Settings + Theme toggle
 */

import React from 'react'
import { useApp } from '../context/AppContext'
import { useTheme } from '../context/ThemeContext'
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
  } = useApp()

  const { themeName, toggleTheme } = useTheme()

  const reviewCount = selectedFilm && matchDetails.length > 0
    ? matchDetails.filter(m => m.confidence.key === 'medium' || m.confidence.key === 'low').length
    : 0

  return (
    <header className="cs-header">
      {/* Left: Logo + View name */}
      <div className="cs-header__left">
        <div className="cs-header__brand">
          <Icon name="movie" size={22} />
          <span className="cs-header__title">
            <span className="cs-header__title-cine">Cine</span><span className="cs-header__title-scope">Scope</span>
          </span>
          <span className="cs-header__version">v3.0</span>
        </div>
        {currentView && (
          <div className="cs-header__view-name">
            {VIEW_LABELS[currentView] || ''}
          </div>
        )}
      </div>

      {/* Right: Action icons */}
      <div className="cs-header__right">
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
