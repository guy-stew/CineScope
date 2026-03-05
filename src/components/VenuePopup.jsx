/**
 * VenuePopup.jsx — Enhanced venue popup for CineScope v2.1
 *
 * Renders inside a react-leaflet <Popup> when a map marker is clicked.
 * Shows: grade badge, national + chain rankings, per-film breakdown
 * with individual grade badges, and a Recharts mini trend chart.
 *
 * Contact management section will be added in Stage 3.
 */

import React, { useMemo } from 'react'
import { useApp } from '../context/AppContext'
import { getGradeColor } from '../utils/grades'
import { formatRevenue } from '../utils/formatRevenue'
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts'


export default function VenuePopup({ venue }) {
  const {
    venues,
    selectedFilm,
    selectedFilmId,
    venueFilmData,
    importedFilms,
    revenueFormat,
  } = useApp()

  const venueKey = `${venue.name}|${venue.city}`.toLowerCase()
  const filmEntries = venueFilmData.get(venueKey) || []

  const grade = venue.grade || null
  const color = grade ? getGradeColor(grade) : '#2E75B6'


  // ── National Ranking ──────────────────────────────────────────
  const nationalRanking = useMemo(() => {
    if (!selectedFilm) return null
    const withRevenue = venues.filter(v => v.revenue != null && v.grade && v.grade !== 'E')
    const sorted = [...withRevenue].sort((a, b) => b.revenue - a.revenue)
    const rank = sorted.findIndex(v =>
      v.name === venue.name && v.city === venue.city
    ) + 1
    if (rank === 0) return null
    return { rank, total: sorted.length }
  }, [venues, venue, selectedFilm])


  // ── Chain Ranking (hidden for independents / single-venue chains) ──
  const chainRanking = useMemo(() => {
    if (!selectedFilm || !venue.chain) return null
    const chainVenues = venues.filter(v =>
      v.chain === venue.chain && v.revenue != null && v.grade && v.grade !== 'E'
    )
    if (chainVenues.length <= 1) return null
    const sorted = [...chainVenues].sort((a, b) => b.revenue - a.revenue)
    const rank = sorted.findIndex(v =>
      v.name === venue.name && v.city === venue.city
    ) + 1
    if (rank === 0) return null
    return { rank, total: sorted.length, chain: venue.chain }
  }, [venues, venue, selectedFilm])


  // ── Unscreened films (imported but venue has no revenue) ──
  const unscreenedFilms = useMemo(() => {
    if (importedFilms.length === 0) return []
    const screenedIds = new Set(filmEntries.map(f => f.filmId))
    return importedFilms
      .filter(film => !screenedIds.has(film.id))
      .map(film => ({
        filmId: film.id,
        filmTitle: film.filmInfo.title,
        dateFrom: film.filmInfo.dateFrom || null,
      }))
      .sort((a, b) => {
        if (!a.dateFrom && !b.dateFrom) return a.filmTitle.localeCompare(b.filmTitle)
        if (!a.dateFrom) return 1
        if (!b.dateFrom) return -1
        return a.dateFrom.localeCompare(b.dateFrom)
      })
  }, [importedFilms, filmEntries])


  // ── Chart data (only for 2+ films, only in combined/no-selection view) ──
  const showChart = filmEntries.length >= 2 &&
    (!selectedFilmId || selectedFilmId === 'all-films')

  const chartData = useMemo(() => {
    if (!showChart) return []
    return filmEntries.map(f => ({
      name: f.filmTitle.length > 15
        ? f.filmTitle.substring(0, 13) + '…'
        : f.filmTitle,
      fullName: f.filmTitle,
      revenue: f.revenue,
    }))
  }, [filmEntries, showChart])


  // ── Styles ────────────────────────────────────────────────────
  const styles = {
    container: {
      minWidth: 280,
      maxWidth: 320,
      fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
      lineHeight: 1.4,
    },
    header: {
      display: 'flex',
      justifyContent: 'space-between',
      alignItems: 'flex-start',
      marginBottom: 8,
    },
    title: {
      fontWeight: 700,
      fontSize: '1rem',
      lineHeight: 1.2,
      color: '#1a1a1a',
    },
    subtitle: {
      fontSize: '0.78rem',
      color: '#777',
      marginTop: 2,
    },
    gradeBadge: {
      width: 36,
      height: 36,
      borderRadius: '50%',
      backgroundColor: color,
      color: '#fff',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      fontWeight: 700,
      fontSize: '1rem',
      flexShrink: 0,
      marginLeft: 10,
    },
    statsBox: {
      background: '#f5f6f8',
      borderRadius: 6,
      padding: '7px 10px',
      marginBottom: 8,
      fontSize: '0.83rem',
    },
    revenue: {
      fontWeight: 700,
      fontSize: '1rem',
      color: '#1a1a1a',
    },
    rankRow: {
      color: '#555',
      marginTop: 2,
    },
    sectionLabel: {
      fontWeight: 600,
      fontSize: '0.73rem',
      color: '#888',
      marginBottom: 4,
      textTransform: 'uppercase',
      letterSpacing: '0.04em',
    },
    filmRow: {
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      padding: '3px 0',
    },
    filmTitle: {
      color: '#333',
      flex: 1,
      overflow: 'hidden',
      textOverflow: 'ellipsis',
      whiteSpace: 'nowrap',
      marginRight: 8,
      fontSize: '0.8rem',
    },
    filmRevenue: {
      fontWeight: 600,
      marginRight: 6,
      whiteSpace: 'nowrap',
      fontSize: '0.8rem',
    },
    miniGradeBadge: (gradeColor) => ({
      display: 'inline-flex',
      alignItems: 'center',
      justifyContent: 'center',
      width: 20,
      height: 20,
      borderRadius: '50%',
      fontSize: '0.65rem',
      fontWeight: 700,
      color: '#fff',
      flexShrink: 0,
      backgroundColor: gradeColor,
    }),
    address: {
      fontSize: '0.73rem',
      color: '#999',
      borderTop: '1px solid #eee',
      paddingTop: 5,
      marginTop: 4,
    },
  }


  return (
    <div style={styles.container}>

      {/* ── Header + Grade Badge ── */}
      <div style={styles.header}>
        <div style={{ flex: 1 }}>
          <div style={styles.title}>{venue.name}</div>
          <div style={styles.subtitle}>
            {venue.city}
            {venue.country === 'Ireland' ? ', Ireland' : ''}
            {' | '}{venue.chain} | {venue.category}
          </div>
        </div>
        {grade && grade !== 'E' && selectedFilm && (
          <div style={styles.gradeBadge}>{grade}</div>
        )}
      </div>


      {/* ── Revenue + Rankings ── */}
      {venue.revenue != null && (
        <div style={styles.statsBox}>
          <div style={styles.revenue}>
            Revenue: {formatRevenue(venue.revenue, revenueFormat)}
            {venue.wasAggregated && (
              <span
                style={{ fontSize: '0.75em', marginLeft: 4, cursor: 'help' }}
                title={`Combined from ${venue.screenEntries} screen entries`}
              >
                🖥️×{venue.screenEntries}
              </span>
            )}
          </div>

          {nationalRanking && (
            <div style={styles.rankRow}>
              National: <strong>#{nationalRanking.rank}</strong> of {nationalRanking.total} venues
            </div>
          )}

          {chainRanking && (
            <div style={styles.rankRow}>
              Chain: <strong>#{chainRanking.rank}</strong> of {chainRanking.total} {chainRanking.chain} venues
            </div>
          )}
        </div>
      )}


      {/* ── Per-Film Breakdown ── */}
      {(filmEntries.length > 0 || unscreenedFilms.length > 0) && (
        <div style={{ marginBottom: 8 }}>
          <div style={styles.sectionLabel}>Per-Film Breakdown</div>

          {/* Screened films */}
          {filmEntries.map((f, i) => (
            <div
              key={f.filmId}
              style={{
                ...styles.filmRow,
                borderBottom: (i < filmEntries.length - 1 || unscreenedFilms.length > 0)
                  ? '1px solid #f0f0f0' : 'none',
              }}
            >
              <span style={styles.filmTitle}>{f.filmTitle}</span>
              <span style={styles.filmRevenue}>
                {formatRevenue(f.revenue, revenueFormat)}
              </span>
              <span style={styles.miniGradeBadge(getGradeColor(f.grade))}>
                {f.grade}
              </span>
            </div>
          ))}

          {/* Unscreened films */}
          {unscreenedFilms.map((f, i) => (
            <div
              key={`un-${f.filmId}`}
              style={{
                ...styles.filmRow,
                opacity: 0.55,
                borderBottom: i < unscreenedFilms.length - 1
                  ? '1px solid #f0f0f0' : 'none',
              }}
            >
              <span style={{ ...styles.filmTitle, color: '#999' }}>
                {f.filmTitle}
              </span>
              <span style={{ ...styles.filmRevenue, color: '#bbb', fontStyle: 'italic', fontSize: '0.73rem' }}>
                Not screened
              </span>
              <span style={styles.miniGradeBadge(getGradeColor('E'))}>E</span>
            </div>
          ))}
        </div>
      )}


      {/* ── Trend Chart (2+ films, combined/unfiltered view only) ── */}
      {showChart && (
        <div style={{ marginBottom: 8 }}>
          <div style={styles.sectionLabel}>Revenue Trend</div>
          <div style={{ width: 280, height: 120 }}>
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={chartData} margin={{ top: 5, right: 8, bottom: 5, left: 0 }}>
                <XAxis
                  dataKey="name"
                  tick={{ fontSize: 9, fill: '#888' }}
                  interval={0}
                  angle={-15}
                  textAnchor="end"
                  height={32}
                />
                <YAxis
                  tick={{ fontSize: 9, fill: '#888' }}
                  tickFormatter={(v) => v >= 1000 ? `${(v / 1000).toFixed(0)}k` : v}
                  width={32}
                />
                <Tooltip
                  formatter={(value) => [formatRevenue(value, revenueFormat), 'Revenue']}
                  labelFormatter={(label, payload) => payload?.[0]?.payload?.fullName || label}
                  contentStyle={{ fontSize: '0.78rem', borderRadius: 4 }}
                />
                <Line
                  type="monotone"
                  dataKey="revenue"
                  stroke="#2E75B6"
                  strokeWidth={2}
                  dot={{ r: 4, fill: '#2E75B6', stroke: '#fff', strokeWidth: 1 }}
                  activeDot={{ r: 6 }}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}

      {/* Single-film hint */}
      {filmEntries.length === 1 && importedFilms.length <= 1 && (
        <div style={{ fontSize: '0.7rem', color: '#aaa', textAlign: 'center', marginBottom: 6 }}>
          Import more films to see trends
        </div>
      )}


      {/* ── Address ── */}
      {venue.address && (
        <div style={styles.address}>{venue.address}</div>
      )}
    </div>
  )
}
