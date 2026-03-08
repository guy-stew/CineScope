/**
 * CineScope — Header (v3.3)
 *
 * Minimal header:
 *   Left:  CineScope logo + current view name
 *   Right: Settings + Theme toggle
 *
 * Match Review has moved to sidebar nav (inline view).
 */

import React from 'react'
import { useApp } from '../context/AppContext'
import { useTheme } from '../context/ThemeContext'
import Icon from './Icon'

const VIEW_LABELS = {
  map: 'Map',
  films: 'Film Catalogue',
  venues: 'Venue Manager',
  matching: 'Venue Matching',
  trends: 'Performance & Trends',
  promote: 'Promote',
}

export default function Header({ currentView }) {
  const { showSettings, setShowSettings } = useApp()
  const { themeName, toggleTheme } = useTheme()

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
