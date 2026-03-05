import React, { useState, useMemo } from 'react'
import { Card, Table, Form, Badge } from 'react-bootstrap'
import { useApp } from '../context/AppContext'
import { useTheme } from '../context/ThemeContext'
import { GRADES } from '../utils/grades'
import { formatRevenue } from '../utils/formatRevenue'
import GradeSummary from './GradeSummary'

export default function AnalyticsPanel() {
  const { filteredVenues, selectedVenue, setSelectedVenue, selectedFilm, gradeFilter, revenueFormat } = useApp()
  const { theme } = useTheme()
  const [sortField, setSortField] = useState('name')
  const [sortDir, setSortDir] = useState('asc')
  const [searchTerm, setSearchTerm] = useState('')

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
  }, [filteredVenues, sortField, sortDir, searchTerm])

  const handleSort = (field) => {
    if (field === sortField) {
      setSortDir(d => d === 'asc' ? 'desc' : 'asc')
    } else {
      setSortField(field)
      setSortDir(field === 'revenue' ? 'desc' : 'asc')
    }
  }

  const sortIcon = (field) => {
    if (field !== sortField) return ' ↕'
    return sortDir === 'asc' ? ' ↑' : ' ↓'
  }

  const hasRevenue = !!selectedFilm

  return (
    <div className="analytics-panel p-3" style={{ background: theme.surface }}>
      {/* Film info banner */}
      {selectedFilm && (
        <div
          className="mb-3 p-2 rounded"
          style={{ background: theme.surfaceAlt, border: `1px solid ${theme.border}` }}
        >
          <div className="d-flex justify-content-between align-items-center">
            <div>
              <strong style={{ color: theme.text, fontSize: '0.9rem' }}>
                {selectedFilm.filmInfo.title || selectedFilm.filmInfo.fileName}
              </strong>
              <div style={{ color: theme.textMuted, fontSize: '0.78rem' }}>
                {selectedFilm.stats.totalVenues} venues · {formatRevenue(selectedFilm.stats.totalRevenue, revenueFormat)} total
                {selectedFilm.stats.aggregatedCount > 0 && (
                  <span title="Multi-screen entries were automatically combined">
                    {' '}· 🖥️ {selectedFilm.stats.aggregatedCount} rows combined
                  </span>
                )}
              </div>
            </div>
            <Badge bg="info" style={{ fontSize: '0.75rem' }}>
              Avg {formatRevenue(selectedFilm.stats.avgRevenue, revenueFormat)}
            </Badge>
          </div>
        </div>
      )}

      {/* Grade summary cards */}
      <GradeSummary />

      {/* Active filter indicator */}
      {gradeFilter.length > 0 && (
        <div className="mb-2">
          <small style={{ color: theme.textMuted }}>
            Filtering:{' '}
            {gradeFilter.map(g => (
              <Badge
                key={g}
                bg=""
                className="me-1"
                style={{ backgroundColor: GRADES[g].color, color: '#fff' }}
              >
                Grade {g}
              </Badge>
            ))}
          </small>
        </div>
      )}

      {/* Search */}
      <Form.Control
        size="sm"
        type="text"
        placeholder="Search venues, cities, chains..."
        value={searchTerm}
        onChange={e => setSearchTerm(e.target.value)}
        className="mb-3"
        style={{
          backgroundColor: theme.inputBg,
          borderColor: theme.inputBorder,
          color: theme.inputText,
        }}
      />

      {/* Venue table */}
      <Card style={{ borderColor: theme.border, background: theme.surface, borderRadius: 8, overflow: 'hidden' }}>
        <Card.Header
          className="py-2 d-flex justify-content-between align-items-center"
          style={{ background: theme.surfaceAlt, borderColor: theme.border }}
        >
          <strong style={{ color: theme.text, fontSize: '0.9rem' }}>Venues</strong>
        </Card.Header>
        <div className="table-responsive" style={{ maxHeight: 'calc(100vh - 380px)' }}>
          <Table
            striped
            hover
            size="sm"
            className="mb-0 venue-table"
            style={{ '--bs-table-bg': theme.surface, '--bs-table-striped-bg': theme.tableStripe, color: theme.text }}
          >
            <thead>
              <tr style={{ borderBottom: `2px solid ${theme.border}` }}>
                <th onClick={() => handleSort('name')} className="sortable-header" style={{ color: theme.textMuted }}>
                  Venue{sortIcon('name')}
                </th>
                <th onClick={() => handleSort('city')} className="sortable-header" style={{ color: theme.textMuted }}>
                  City{sortIcon('city')}
                </th>
                <th onClick={() => handleSort('chain')} className="sortable-header" style={{ color: theme.textMuted }}>
                  Chain{sortIcon('chain')}
                </th>
                {hasRevenue && (
                  <th onClick={() => handleSort('revenue')} className="sortable-header text-end" style={{ color: theme.textMuted }}>
                    Revenue{sortIcon('revenue')}
                  </th>
                )}
                {hasRevenue && (
                  <th onClick={() => handleSort('grade')} className="sortable-header text-center" style={{ color: theme.textMuted }}>
                    Grade{sortIcon('grade')}
                  </th>
                )}
              </tr>
            </thead>
            <tbody>
              {displayVenues.map((venue, idx) => {
                const grade = venue.grade || null
                const isSelected = selectedVenue?.name === venue.name
                return (
                  <tr
                    key={`${venue.name}-${idx}`}
                    onClick={() => setSelectedVenue(venue)}
                    style={{
                      cursor: 'pointer',
                      backgroundColor: isSelected ? theme.tableHover : undefined,
                    }}
                  >
                    <td className="text-truncate" style={{ maxWidth: 160, color: theme.text }}>
                      {venue.name}
                    </td>
                    <td className="text-truncate" style={{ maxWidth: 90, color: theme.text }}>
                      {venue.city}
                    </td>
                    <td>
                      <small style={{ color: theme.textMuted }}>{venue.chain}</small>
                    </td>
                    {hasRevenue && (
                      <td className="text-end" style={{ fontWeight: 600, color: theme.text }}>
                        {venue.revenue != null ? (
                          <>
                            {formatRevenue(venue.revenue, revenueFormat)}
                            {venue.wasAggregated && (
                              <span
                                title={`Combined from ${venue.screenEntries} screen entries`}
                                style={{ fontSize: '0.7em', cursor: 'help', marginLeft: 3 }}
                              >
                                🖥️{venue.screenEntries}
                              </span>
                            )}
                          </>
                        ) : '—'}
                      </td>
                    )}
                    {hasRevenue && (
                      <td className="text-center">
                        {grade && grade !== 'E' ? (
                          <Badge
                            bg=""
                            style={{
                              backgroundColor: GRADES[grade]?.color,
                              color: '#fff',
                              minWidth: 28,
                            }}
                          >
                            {grade}
                          </Badge>
                        ) : (
                          <span style={{ color: theme.textMuted }}>—</span>
                        )}
                      </td>
                    )}
                  </tr>
                )
              })}
              {displayVenues.length === 0 && (
                <tr>
                  <td colSpan={hasRevenue ? 5 : 3} className="text-center py-4" style={{ color: theme.textMuted }}>
                    No venues match current filters
                  </td>
                </tr>
              )}
            </tbody>
          </Table>
        </div>
      </Card>
    </div>
  )
}
