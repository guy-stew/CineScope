/**
 * CineScope — Map Panel (v3.0 Stage 2)
 *
 * Right-side panel in the Map view containing:
 *   - Film selector dropdown
 *   - Film info banner
 *   - Grade filter cards (clickable, multi-select)
 *   - Chain + Category filter dropdowns
 *   - Search box
 *   - Scrollable venue list sorted by revenue
 *   - Venue count footer
 *
 * Replaces the old AnalyticsPanel for the Map view.
 * All state comes from AppContext (same source of truth).
 */

import React, { useState, useMemo } from 'react'
import { useApp } from '../context/AppContext'
import { useTheme } from '../context/ThemeContext'
import { GRADES, GRADE_ORDER } from '../utils/grades'
import { formatRevenue } from '../utils/formatRevenue'
import Icon from './Icon'
import FilmSelectorDropdown from './FilmSelectorDropdown'

export default function MapPanel({ visible, onToggle, onVenueFly }) {
  const {
    filteredVenues,
    selectedVenue, setSelectedVenue,
    selectedFilm, selectedFilmId,
    filmDisplayStats, revenueFormat,
    gradeFilter, setGradeFilter,
    chainFilter, setChainFilter,
    categoryFilter, setCategoryFilter,
    availableChains, availableCategories,
    gradeCounts,
  } = useApp()

  const { theme } = useTheme()

  const [searchTerm, setSearchTerm] = useState('')
  const [sortField, setSortField] = useState('revenue')
  const [sortDir, setSortDir] = useState('desc')

  // ── Grade toggle ──
  const toggleGrade = (grade) => {
    if (gradeFilter.includes(grade)) {
      setGradeFilter(gradeFilter.filter(g => g !== grade))
    } else {
      setGradeFilter([...gradeFilter, grade])
    }
  }

  // ── Venue list (sorted + searched) ──
  const displayVenues = useMemo(() => {
    let result = [...filteredVenues]

    if (searchTerm) {
      const term = searchTerm.toLowerCase()
      result = result.filter(v =>
        v.name.toLowerCase().includes(term) ||
        v.city?.toLowerCase().includes(term) ||
        v.chain?.toLowerCase().includes(term)
      )
    }

    result.sort((a, b) => {
      let aVal = a[sortField] ?? ''
      let bVal = b[sortField] ?? ''
      if (typeof aVal === 'string') aVal = aVal.toLowerCase()
      if (typeof bVal === 'string') bVal = bVal.toLowerCase()
      if (aVal < bVal) return sortDir === 'asc' ? -1 : 1
      if (aVal > bVal) return sortDir === 'asc' ? 1 : -1
      return 0
    })

    return result
  }, [filteredVenues, searchTerm, sortField, sortDir])

  const hasRevenue = !!selectedFilm
  const total = Object.values(gradeCounts).reduce((a, b) => a + b, 0)

  if (!visible) return null

  return (
    <div
      className="cs-map-panel"
      style={{
        background: theme.surface,
        borderLeft: `1px solid ${theme.border}`,
      }}
    >
      {/* ── Panel header ── */}
      <div
        className="cs-map-panel__header"
        style={{ borderBottom: `1px solid ${theme.border}` }}
      >
        <span style={{ fontWeight: 600, fontSize: '0.9rem', color: theme.text }}>Venues</span>
        <button
          className="cs-map-panel__close"
          onClick={onToggle}
          title="Hide panel"
          style={{ color: theme.textMuted }}
        >
          <Icon name="close" size={18} />
        </button>
      </div>

      {/* ── Film selector ── */}
      <div
        className="cs-map-panel__film-selector"
        style={{ borderBottom: `1px solid ${theme.border}`, background: theme.surfaceAlt }}
      >
        <FilmSelectorDropdown />
      </div>

      {/* ── Film info banner ── */}
      {selectedFilm && (
        <div
          className="cs-map-panel__film-banner"
          style={{
            borderBottom: `1px solid ${theme.border}`,
            background: `${theme.headerBorder}12`,
          }}
        >
          <div style={{ fontWeight: 600, fontSize: '0.82rem', color: theme.headerBorder }}>
            {selectedFilm.filmInfo.title || 'Untitled'}
          </div>
          <div style={{ fontSize: '0.72rem', color: theme.textMuted, marginTop: 2 }}>
            {filmDisplayStats?.totalWithUnscreened ?? selectedFilm.stats.totalVenues} venues
            {' · '}
            {formatRevenue(filmDisplayStats?.totalRevenue ?? selectedFilm.stats.totalRevenue, revenueFormat)}
            {' · '}
            Avg {formatRevenue(filmDisplayStats?.avgRevenue ?? selectedFilm.stats.avgRevenue, revenueFormat)}
          </div>
        </div>
      )}

      {/* ── Grade cards ── */}
      {selectedFilm && (
        <div
          className="cs-map-panel__grades"
          style={{ borderBottom: `1px solid ${theme.border}` }}
        >
          {GRADE_ORDER.filter(g => g !== 'E').map(grade => {
            const info = GRADES[grade]
            const count = gradeCounts[grade] || 0
            const isActive = gradeFilter.includes(grade)

            return (
              <div
                key={grade}
                className="cs-map-panel__grade-card"
                onClick={() => toggleGrade(grade)}
                title={info.description}
                style={{
                  borderTop: `3px solid ${info.color}`,
                  background: isActive ? info.color : theme.cardBg,
                  border: isActive ? `2px solid ${info.color}` : `1px solid ${theme.border}`,
                  borderTopColor: info.color,
                  cursor: 'pointer',
                }}
              >
                <div style={{
                  fontWeight: 800,
                  fontSize: '0.82rem',
                  color: isActive ? '#fff' : theme.textMuted,
                }}>
                  {grade}
                </div>
                <div style={{
                  fontWeight: 700,
                  fontSize: '1.15rem',
                  lineHeight: 1.2,
                  color: isActive ? '#fff' : theme.text,
                }}>
                  {count}
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* ── Filters ── */}
      <div
        className="cs-map-panel__filters"
        style={{ borderBottom: `1px solid ${theme.border}` }}
      >
        <select
          className="cs-map-panel__filter-select"
          value={chainFilter}
          onChange={e => setChainFilter(e.target.value)}
          style={{
            background: theme.inputBg,
            borderColor: theme.inputBorder,
            color: theme.inputText,
          }}
        >
          <option value="">All Chains</option>
          {availableChains.map(c => <option key={c} value={c}>{c}</option>)}
        </select>
        <select
          className="cs-map-panel__filter-select"
          value={categoryFilter}
          onChange={e => setCategoryFilter(e.target.value)}
          style={{
            background: theme.inputBg,
            borderColor: theme.inputBorder,
            color: theme.inputText,
          }}
        >
          <option value="">All Categories</option>
          {availableCategories.map(c => <option key={c} value={c}>{c}</option>)}
        </select>
      </div>

      {/* ── Search ── */}
      <div
        className="cs-map-panel__search"
        style={{ borderBottom: `1px solid ${theme.border}` }}
      >
        <div className="cs-map-panel__search-wrap">
          <Icon name="search" size={15} style={{ color: theme.textMuted, position: 'absolute', left: 8, top: '50%', transform: 'translateY(-50%)' }} />
          <input
            type="text"
            placeholder="Search venues, cities, chains..."
            value={searchTerm}
            onChange={e => setSearchTerm(e.target.value)}
            className="cs-map-panel__search-input"
            style={{
              background: theme.inputBg,
              borderColor: theme.inputBorder,
              color: theme.inputText,
            }}
          />
        </div>
      </div>

      {/* ── Sort controls ── */}
      {hasRevenue && (
        <div
          className="cs-map-panel__sort-bar"
          style={{ borderBottom: `1px solid ${theme.border}` }}
        >
          <button
            className={`cs-map-panel__sort-btn ${sortField === 'name' ? 'active' : ''}`}
            onClick={() => { setSortField('name'); setSortDir(sortField === 'name' && sortDir === 'asc' ? 'desc' : 'asc') }}
            style={{ color: sortField === 'name' ? theme.headerBorder : theme.textMuted }}
          >
            Name {sortField === 'name' && (sortDir === 'asc' ? '↑' : '↓')}
          </button>
          <button
            className={`cs-map-panel__sort-btn ${sortField === 'revenue' ? 'active' : ''}`}
            onClick={() => { setSortField('revenue'); setSortDir(sortField === 'revenue' && sortDir === 'desc' ? 'asc' : 'desc') }}
            style={{ color: sortField === 'revenue' ? theme.headerBorder : theme.textMuted }}
          >
            Revenue {sortField === 'revenue' && (sortDir === 'asc' ? '↑' : '↓')}
          </button>
          <button
            className={`cs-map-panel__sort-btn ${sortField === 'grade' ? 'active' : ''}`}
            onClick={() => { setSortField('grade'); setSortDir(sortField === 'grade' && sortDir === 'asc' ? 'desc' : 'asc') }}
            style={{ color: sortField === 'grade' ? theme.headerBorder : theme.textMuted }}
          >
            Grade {sortField === 'grade' && (sortDir === 'asc' ? '↑' : '↓')}
          </button>
        </div>
      )}

      {/* ── Venue list ── */}
      <div className="cs-map-panel__venue-list">
        {displayVenues.map((venue, idx) => {
          const grade = venue.grade || null
          const gradeInfo = grade && GRADES[grade] ? GRADES[grade] : null
          const isSelected = selectedVenue?.name === venue.name
          const isClosed = (venue.status || 'open') === 'closed'

          return (
            <div
              key={`${venue.name}-${venue.city}-${idx}`}
              className="cs-map-panel__venue-row"
              onClick={() => {
                setSelectedVenue(venue)
                if (onVenueFly) onVenueFly(venue)
              }}
              style={{
                background: isSelected ? `${theme.headerBorder}12` : 'transparent',
                borderBottom: `1px solid ${theme.border}`,
              }}
            >
              {/* Grade badge */}
              {hasRevenue && gradeInfo && grade !== 'E' ? (
                <div
                  className="cs-map-panel__venue-grade"
                  style={{ background: gradeInfo.color, color: grade === 'B' ? '#1a1c25' : '#fff' }}
                >
                  {grade}
                </div>
              ) : (
                <div
                  className="cs-map-panel__venue-grade"
                  style={{
                    background: isClosed ? '#999' : '#2E75B6',
                    color: '#fff',
                    opacity: isClosed ? 0.5 : 0.6,
                  }}
                >
                  {isClosed ? '×' : '·'}
                </div>
              )}

              {/* Venue info */}
              <div className="cs-map-panel__venue-info">
                <div
                  className="cs-map-panel__venue-name"
                  style={{ color: theme.text }}
                >
                  {venue.name}
                  {isClosed && (
                    <span style={{
                      fontSize: '0.6rem',
                      fontWeight: 600,
                      color: '#e74c3c',
                      background: 'rgba(231,76,60,0.12)',
                      padding: '1px 5px',
                      borderRadius: 3,
                      marginLeft: 6,
                      verticalAlign: 'middle',
                    }}>
                      CLOSED
                    </span>
                  )}
                </div>
                <div style={{ fontSize: '0.68rem', color: theme.textMuted }}>
                  {venue.chain || 'Independent'} · {venue.city}
                </div>
              </div>

              {/* Revenue */}
              {hasRevenue && venue.revenue != null && (
                <div
                  className="cs-map-panel__venue-revenue"
                  style={{ color: theme.text }}
                >
                  {formatRevenue(venue.revenue, revenueFormat)}
                </div>
              )}
            </div>
          )
        })}

        {displayVenues.length === 0 && (
          <div
            className="text-center py-4"
            style={{ color: theme.textMuted, fontSize: '0.82rem' }}
          >
            No venues match current filters
          </div>
        )}
      </div>

      {/* ── Venue count footer ── */}
      <div
        className="cs-map-panel__footer"
        style={{
          borderTop: `1px solid ${theme.border}`,
          color: theme.textMuted,
          background: theme.surfaceAlt,
        }}
      >
        {displayVenues.length} of {filteredVenues.length} venues
        {searchTerm && ' (filtered)'}
      </div>
    </div>
  )
}
