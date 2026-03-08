/**
 * CineScope — Sidebar Navigation (v3.0)
 *
 * Collapsible left sidebar with icon + label navigation.
 * Neon-style: expanded shows icons + labels, collapsed shows icons only with tooltips.
 *
 * Props:
 *   currentView  - string: 'map' | 'films' | 'venues' | 'trends' | 'promote'
 *   onViewChange - function(viewId): called when a nav item is clicked
 *   collapsed    - boolean: whether sidebar is in collapsed (icons-only) mode
 *   onToggle     - function(): toggle collapsed state
 */

import React from 'react'
import { useApp } from '../context/AppContext'
import { useTheme } from '../context/ThemeContext'
import Icon from './Icon'

const NAV_SECTIONS = [
  {
    label: 'Library',
    items: [
      { id: 'films', icon: 'movie', label: 'Films' },
      { id: 'venues', icon: 'storefront', label: 'Venues', badge: 'count' },
    ],
  },
  {
    label: 'Analysis',
    items: [
      { id: 'map', icon: 'map', label: 'Map' },
      { id: 'trends', icon: 'insights', label: 'Trends' },
    ],
  },
  {
    label: 'Marketing',
    items: [
      { id: 'promote', icon: 'campaign', label: 'Promote', badge: 'soon' },
    ],
  },
]

export default function Sidebar({ currentView, onViewChange, collapsed, onToggle }) {
  const { filteredVenues } = useApp()
  const { theme } = useTheme()

  const venueCount = filteredVenues?.length || 0

  return (
    <aside
      className={`cs-sidebar ${collapsed ? 'cs-sidebar--collapsed' : ''}`}
      style={{
        background: theme.surface,
        borderRight: `1px solid ${theme.border}`,
      }}
    >
      <nav className="cs-sidebar__nav">
        {NAV_SECTIONS.map((section) => (
          <div key={section.label} className="cs-sidebar__section">
            <div
              className="cs-sidebar__section-label"
              style={{ color: theme.textMuted }}
            >
              {section.label}
            </div>
            {section.items.map((item) => {
              const isActive = currentView === item.id
              return (
                <button
                  key={item.id}
                  className={`cs-sidebar__item ${isActive ? 'cs-sidebar__item--active' : ''}`}
                  onClick={() => onViewChange(item.id)}
                  title={collapsed ? item.label : undefined}
                  style={{
                    color: isActive ? undefined : theme.textMuted,
                    background: isActive ? undefined : 'transparent',
                  }}
                >
                  <span className="cs-sidebar__icon">
                    <Icon name={item.icon} size={20} />
                  </span>
                  <span className="cs-sidebar__label">{item.label}</span>
                  {/* Badge */}
                  {item.badge === 'count' && !collapsed && (
                    <span
                      className="cs-sidebar__badge"
                      style={{
                        background: `${theme.headerBorder}22`,
                        color: theme.headerBorder,
                      }}
                    >
                      {venueCount}
                    </span>
                  )}
                  {item.badge === 'soon' && !collapsed && (
                    <span
                      className="cs-sidebar__badge cs-sidebar__badge--soon"
                    >
                      SOON
                    </span>
                  )}
                </button>
              )
            })}
          </div>
        ))}
      </nav>

      {/* Collapse toggle */}
      <div
        className="cs-sidebar__footer"
        style={{ borderTop: `1px solid ${theme.border}` }}
      >
        <button
          className="cs-sidebar__collapse-btn"
          onClick={onToggle}
          title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          style={{ color: theme.textMuted }}
        >
          <Icon
            name={collapsed ? 'chevron_right' : 'chevron_left'}
            size={18}
          />
          <span className="cs-sidebar__label">
            {collapsed ? '' : 'Collapse'}
          </span>
        </button>
      </div>
    </aside>
  )
}
