/**
 * CineScope — Header (v3.4 — User Menu + Admin Impersonation)
 *
 * Minimal header:
 *   Left:  CineScope logo + current view name
 *   Right: Settings + Theme toggle + User Avatar
 *
 * User Avatar:
 *   - Shows initials in a gradient circle (matches mockup)
 *   - Click opens dropdown: Sign Out (all users), Switch User (admin only)
 *   - During impersonation: orange ring on avatar + warning banner below header
 */

import React, { useState, useEffect, useRef, useCallback } from 'react'
import { useAuth, useUser, useClerk } from '@clerk/clerk-react'
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

// ── Helper: extract initials from name or email ──
function getInitials(displayName, email) {
  if (displayName) {
    const parts = displayName.trim().split(/\s+/)
    if (parts.length >= 2) {
      return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
    }
    return displayName[0].toUpperCase()
  }
  if (email) {
    return email[0].toUpperCase()
  }
  return '?'
}


// ═══════════════════════════════════════════════
// UserMenu component
// ═══════════════════════════════════════════════

function UserMenu() {
  const { signOut } = useClerk()
  const { user: clerkUser } = useUser()
  const {
    currentUserInfo,
    isAdmin,
    impersonating,
    allUsers,
    startImpersonation,
    stopImpersonation,
  } = useApp()

  const [open, setOpen] = useState(false)
  const [showUserList, setShowUserList] = useState(false)
  const menuRef = useRef(null)

  // Close menu on outside click
  useEffect(() => {
    function handleClickOutside(e) {
      if (menuRef.current && !menuRef.current.contains(e.target)) {
        setOpen(false)
        setShowUserList(false)
      }
    }
    if (open) {
      document.addEventListener('mousedown', handleClickOutside)
      return () => document.removeEventListener('mousedown', handleClickOutside)
    }
  }, [open])

  // Determine display info
  const displayName = impersonating
    ? impersonating.displayName || impersonating.email || 'User'
    : clerkUser?.fullName || clerkUser?.primaryEmailAddress?.emailAddress || ''
  const displayEmail = impersonating
    ? impersonating.email || ''
    : clerkUser?.primaryEmailAddress?.emailAddress || ''
  const initials = impersonating
    ? getInitials(impersonating.displayName, impersonating.email)
    : getInitials(clerkUser?.fullName, clerkUser?.primaryEmailAddress?.emailAddress)

  const handleToggle = useCallback(() => {
    setOpen(prev => !prev)
    setShowUserList(false)
  }, [])

  const handleSignOut = useCallback(() => {
    setOpen(false)
    signOut()
  }, [signOut])

  const handleSwitchUser = useCallback((targetUser) => {
    setOpen(false)
    setShowUserList(false)
    startImpersonation(targetUser)
  }, [startImpersonation])

  const handleExitImpersonation = useCallback(() => {
    setOpen(false)
    stopImpersonation()
  }, [stopImpersonation])

  return (
    <div className="cs-user-menu" ref={menuRef}>
      {/* Avatar circle */}
      <button
        className={`cs-user-avatar ${impersonating ? 'cs-user-avatar--impersonating' : ''}`}
        onClick={handleToggle}
        title={impersonating ? `Viewing as ${displayName}` : displayName}
      >
        {initials}
      </button>

      {/* Dropdown */}
      {open && (
        <div className="cs-user-dropdown">
          {/* User info header */}
          <div className="cs-user-dropdown__header">
            <div className="cs-user-dropdown__name">{displayName}</div>
            <div className="cs-user-dropdown__email">{displayEmail}</div>
          </div>

          <div className="cs-user-dropdown__divider" />

          {/* Exit impersonation (shown when impersonating) */}
          {impersonating && (
            <button className="cs-user-dropdown__item cs-user-dropdown__item--exit" onClick={handleExitImpersonation}>
              <Icon name="undo" size={16} />
              Back to my account
            </button>
          )}

          {/* Switch User (admin only, not shown during impersonation) */}
          {isAdmin && !impersonating && (
            <>
              <button
                className="cs-user-dropdown__item"
                onClick={() => setShowUserList(prev => !prev)}
              >
                <Icon name="swap_horiz" size={16} />
                Switch User
                <span className="cs-user-dropdown__chevron">{showUserList ? '\u25B2' : '\u25BC'}</span>
              </button>

              {showUserList && (
                <div className="cs-user-dropdown__user-list">
                  {allUsers.length === 0 && (
                    <div className="cs-user-dropdown__loading">Loading users...</div>
                  )}
                  {allUsers
                    .filter(u => u.id !== currentUserInfo?.id) // Don't show self
                    .map(u => (
                      <button
                        key={u.id}
                        className="cs-user-dropdown__user-item"
                        onClick={() => handleSwitchUser(u)}
                      >
                        <div className="cs-user-dropdown__user-avatar">
                          {getInitials(u.displayName, u.email)}
                        </div>
                        <div className="cs-user-dropdown__user-info">
                          <div className="cs-user-dropdown__user-name">
                            {u.displayName || u.email}
                          </div>
                          {u.displayName && (
                            <div className="cs-user-dropdown__user-email">{u.email}</div>
                          )}
                        </div>
                      </button>
                    ))
                  }
                </div>
              )}
            </>
          )}

          {/* Sign Out */}
          <button className="cs-user-dropdown__item cs-user-dropdown__item--signout" onClick={handleSignOut}>
            <Icon name="logout" size={16} />
            Sign Out
          </button>
        </div>
      )}
    </div>
  )
}


// ═══════════════════════════════════════════════
// Impersonation Banner
// ═══════════════════════════════════════════════

function ImpersonationBanner() {
  const { impersonating, stopImpersonation } = useApp()

  if (!impersonating) return null

  const name = impersonating.displayName || impersonating.email || 'another user'

  return (
    <div className="cs-impersonation-banner">
      <span className="cs-impersonation-banner__icon">
        <Icon name="visibility" size={16} />
      </span>
      <span>
        Viewing as <strong>{name}</strong> — all data shown belongs to this account
      </span>
      <button
        className="cs-impersonation-banner__exit"
        onClick={stopImpersonation}
      >
        Exit
      </button>
    </div>
  )
}


// ═══════════════════════════════════════════════
// Header (main export)
// ═══════════════════════════════════════════════

export default function Header({ currentView }) {
  const { showSettings, setShowSettings } = useApp()
  const { themeName, toggleTheme } = useTheme()

  return (
    <>
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

        {/* Right: Action icons + User Menu */}
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

          {/* User Avatar + Menu */}
          <UserMenu />
        </div>
      </header>

      {/* Impersonation warning banner (below header, above content) */}
      <ImpersonationBanner />
    </>
  )
}
