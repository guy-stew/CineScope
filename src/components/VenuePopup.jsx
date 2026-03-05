/**
 * VenuePopup.jsx — Enhanced venue popup for CineScope v2.1
 *
 * Renders inside a react-leaflet <Popup> when a map marker is clicked.
 * Shows: grade badge, national + chain rankings, per-film breakdown
 * with individual grade badges, Recharts mini trend chart, and
 * contact management with chain-default / venue-override model.
 */

import React, { useMemo, useState, useEffect, useCallback } from 'react'
import { useAuth } from '@clerk/clerk-react'
import { useApp } from '../context/AppContext'
import { getGradeColor } from '../utils/grades'
import { formatRevenue } from '../utils/formatRevenue'
import * as api from '../utils/apiClient'
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
  const { getToken } = useAuth()

  const venueKey = `${venue.name}|${venue.city}`.toLowerCase()
  const filmEntries = venueFilmData.get(venueKey) || []

  const grade = venue.grade || null
  const color = grade ? getGradeColor(grade) : '#2E75B6'

  // Is this an independent / single-location venue?
  const isIndependent = !venue.chain || venue.chain === 'Independent'


  // ── Contact state ─────────────────────────────────────────────
  const [contact, setContact] = useState(null)
  const [resolvedScope, setResolvedScope] = useState(null)
  const [contactLoading, setContactLoading] = useState(true)
  const [contactError, setContactError] = useState(null)
  const [editing, setEditing] = useState(false)
  const [saving, setSaving] = useState(false)

  // Edit form fields
  const [editFields, setEditFields] = useState({
    manager_name: '',
    booking_contact_name: '',
    booking_contact_email: '',
    notes: '',
  })
  // Chain-broadcast checkbox (only relevant for chain venues)
  const [applyToChain, setApplyToChain] = useState(false)


  // ── Fetch contact on mount ────────────────────────────────────
  useEffect(() => {
    let cancelled = false
    async function loadContact() {
      try {
        setContactLoading(true)
        setContactError(null)
        const chainName = venue.chain || 'Independent'
        const result = await api.getContact(venue.name, venue.city, chainName, getToken)
        if (cancelled) return
        setContact(result.contact)
        setResolvedScope(result.resolved_scope)
      } catch (err) {
        if (!cancelled) setContactError('Could not load contact')
        console.warn('Contact fetch error:', err)
      } finally {
        if (!cancelled) setContactLoading(false)
      }
    }
    loadContact()
    return () => { cancelled = true }
  }, [venue.name, venue.city, venue.chain, getToken])


  // ── Start editing ─────────────────────────────────────────────
  const startEdit = useCallback(() => {
    setEditFields({
      manager_name: contact?.manager_name || '',
      booking_contact_name: contact?.booking_contact_name || '',
      booking_contact_email: contact?.booking_contact_email || '',
      notes: contact?.notes || '',
    })
    setApplyToChain(false)
    setEditing(true)
  }, [contact])


  // ── Save contact ──────────────────────────────────────────────
  const saveContactHandler = useCallback(async () => {
    setSaving(true)
    try {
      const chainName = venue.chain || 'Independent'
      const scope = (!isIndependent && applyToChain) ? 'chain' : 'venue'

      const payload = {
        scope,
        chain_name: chainName,
        ...editFields,
      }

      // For venue-level saves, include venue identifiers
      if (scope === 'venue') {
        payload.venue_name = venue.name
        payload.venue_city = venue.city
      }

      const result = await api.saveContact(payload, getToken)
      setContact(result.contact)
      setResolvedScope(result.contact.scope)
      setEditing(false)
    } catch (err) {
      console.error('Failed to save contact:', err)
      setContactError('Save failed')
    } finally {
      setSaving(false)
    }
  }, [editFields, applyToChain, venue, isIndependent, getToken])


  // ── Reset to chain default ────────────────────────────────────
  const resetToChainDefault = useCallback(async () => {
    if (!contact?.id) return
    setSaving(true)
    try {
      await api.deleteContact(contact.id, getToken)
      // Re-fetch to get the chain default
      const chainName = venue.chain || 'Independent'
      const result = await api.getContact(venue.name, venue.city, chainName, getToken)
      setContact(result.contact)
      setResolvedScope(result.resolved_scope)
      setEditing(false)
    } catch (err) {
      console.error('Failed to reset contact:', err)
      setContactError('Reset failed')
    } finally {
      setSaving(false)
    }
  }, [contact, venue, getToken])


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


  // ── Unscreened films ──────────────────────────────────────────
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


  // ── Chart data ────────────────────────────────────────────────
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
  const s = {
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
    // Contact styles
    contactSection: {
      borderTop: '1px solid #e5e5e5',
      paddingTop: 8,
      marginTop: 8,
    },
    contactRow: {
      fontSize: '0.8rem',
      color: '#444',
      marginBottom: 2,
    },
    contactLabel: {
      color: '#888',
      fontWeight: 500,
      marginRight: 4,
      fontSize: '0.75rem',
    },
    contactNotes: {
      fontSize: '0.78rem',
      color: '#666',
      fontStyle: 'italic',
      marginTop: 3,
    },
    badge: {
      display: 'inline-block',
      fontSize: '0.65rem',
      fontWeight: 600,
      padding: '1px 6px',
      borderRadius: 3,
      marginLeft: 6,
    },
    customBadge: {
      background: '#e8f4fd',
      color: '#1a7bc0',
    },
    chainBadge: {
      background: '#f0f0f0',
      color: '#888',
    },
    input: {
      width: '100%',
      padding: '4px 7px',
      fontSize: '0.8rem',
      border: '1px solid #ddd',
      borderRadius: 4,
      marginTop: 2,
      marginBottom: 5,
      boxSizing: 'border-box',
      outline: 'none',
      fontFamily: 'inherit',
    },
    textarea: {
      width: '100%',
      padding: '4px 7px',
      fontSize: '0.8rem',
      border: '1px solid #ddd',
      borderRadius: 4,
      marginTop: 2,
      marginBottom: 5,
      resize: 'vertical',
      minHeight: 40,
      boxSizing: 'border-box',
      outline: 'none',
      fontFamily: 'inherit',
    },
    btnRow: {
      display: 'flex',
      gap: 6,
      marginTop: 4,
      flexWrap: 'wrap',
      alignItems: 'center',
    },
    btn: {
      fontSize: '0.75rem',
      padding: '3px 10px',
      borderRadius: 4,
      border: '1px solid #ccc',
      background: '#fff',
      cursor: 'pointer',
      fontWeight: 500,
    },
    btnPrimary: {
      fontSize: '0.75rem',
      padding: '3px 10px',
      borderRadius: 4,
      border: 'none',
      background: '#2E75B6',
      color: '#fff',
      cursor: 'pointer',
      fontWeight: 500,
    },
    btnDanger: {
      fontSize: '0.7rem',
      padding: '2px 8px',
      borderRadius: 4,
      border: '1px solid #e74c3c',
      background: '#fff',
      color: '#e74c3c',
      cursor: 'pointer',
      fontWeight: 500,
    },
    checkboxRow: {
      display: 'flex',
      alignItems: 'center',
      gap: 6,
      marginTop: 4,
      marginBottom: 2,
      fontSize: '0.78rem',
      color: '#555',
    },
  }


  // ── Helper: is there any contact info to display? ─────────────
  const hasContactInfo = contact && (
    contact.manager_name ||
    contact.booking_contact_name ||
    contact.booking_contact_email ||
    contact.notes
  )


  return (
    <div style={s.container}>

      {/* ── Header + Grade Badge ── */}
      <div style={s.header}>
        <div style={{ flex: 1 }}>
          <div style={s.title}>{venue.name}</div>
          <div style={s.subtitle}>
            {venue.city}
            {venue.country === 'Ireland' ? ', Ireland' : ''}
            {' | '}{venue.chain} | {venue.category}
          </div>
        </div>
        {grade && grade !== 'E' && selectedFilm && (
          <div style={s.gradeBadge}>{grade}</div>
        )}
      </div>


      {/* ── Revenue + Rankings ── */}
      {venue.revenue != null && (
        <div style={s.statsBox}>
          <div style={s.revenue}>
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
            <div style={s.rankRow}>
              National: <strong>#{nationalRanking.rank}</strong> of {nationalRanking.total} venues
            </div>
          )}

          {chainRanking && (
            <div style={s.rankRow}>
              Chain: <strong>#{chainRanking.rank}</strong> of {chainRanking.total} {chainRanking.chain} venues
            </div>
          )}
        </div>
      )}


      {/* ── Per-Film Breakdown ── */}
      {(filmEntries.length > 0 || unscreenedFilms.length > 0) && (
        <div style={{ marginBottom: 8 }}>
          <div style={s.sectionLabel}>Per-Film Breakdown</div>

          {filmEntries.map((f, i) => (
            <div
              key={f.filmId}
              style={{
                ...s.filmRow,
                borderBottom: (i < filmEntries.length - 1 || unscreenedFilms.length > 0)
                  ? '1px solid #f0f0f0' : 'none',
              }}
            >
              <span style={s.filmTitle}>{f.filmTitle}</span>
              <span style={s.filmRevenue}>
                {formatRevenue(f.revenue, revenueFormat)}
              </span>
              <span style={s.miniGradeBadge(getGradeColor(f.grade))}>
                {f.grade}
              </span>
            </div>
          ))}

          {unscreenedFilms.map((f, i) => (
            <div
              key={`un-${f.filmId}`}
              style={{
                ...s.filmRow,
                opacity: 0.55,
                borderBottom: i < unscreenedFilms.length - 1
                  ? '1px solid #f0f0f0' : 'none',
              }}
            >
              <span style={{ ...s.filmTitle, color: '#999' }}>
                {f.filmTitle}
              </span>
              <span style={{ ...s.filmRevenue, color: '#bbb', fontStyle: 'italic', fontSize: '0.73rem' }}>
                Not screened
              </span>
              <span style={s.miniGradeBadge(getGradeColor('E'))}>E</span>
            </div>
          ))}
        </div>
      )}


      {/* ── Trend Chart ── */}
      {showChart && (
        <div style={{ marginBottom: 8 }}>
          <div style={s.sectionLabel}>Revenue Trend</div>
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

      {filmEntries.length === 1 && importedFilms.length <= 1 && (
        <div style={{ fontSize: '0.7rem', color: '#aaa', textAlign: 'center', marginBottom: 6 }}>
          Import more films to see trends
        </div>
      )}


      {/* ══════════════════════════════════════════════════════════
          CONTACT INFORMATION
         ══════════════════════════════════════════════════════════ */}
      <div style={s.contactSection}>
        <div style={{ display: 'flex', alignItems: 'center', marginBottom: 6 }}>
          <div style={s.sectionLabel}>Contact Information</div>

          {/* Scope badges */}
          {resolvedScope === 'venue' && !editing && (
            <span style={{ ...s.badge, ...s.customBadge }}>Custom contact</span>
          )}
          {resolvedScope === 'chain' && !editing && !isIndependent && (
            <span style={{ ...s.badge, ...s.chainBadge }}>Chain default</span>
          )}
        </div>

        {/* Loading state */}
        {contactLoading && (
          <div style={{ fontSize: '0.78rem', color: '#aaa' }}>Loading contact...</div>
        )}

        {/* Error */}
        {contactError && !contactLoading && (
          <div style={{ fontSize: '0.78rem', color: '#e74c3c' }}>{contactError}</div>
        )}

        {/* ── Display mode ── */}
        {!contactLoading && !editing && (
          <>
            {hasContactInfo ? (
              <div>
                {contact.manager_name && (
                  <div style={s.contactRow}>
                    <span style={s.contactLabel}>Manager:</span>
                    {contact.manager_name}
                  </div>
                )}
                {contact.booking_contact_name && (
                  <div style={s.contactRow}>
                    <span style={s.contactLabel}>Booking:</span>
                    {contact.booking_contact_name}
                  </div>
                )}
                {contact.booking_contact_email && (
                  <div style={s.contactRow}>
                    <span style={s.contactLabel}>Email:</span>
                    <a
                      href={`mailto:${contact.booking_contact_email}`}
                      style={{ color: '#2E75B6', textDecoration: 'none', fontSize: '0.8rem' }}
                    >
                      {contact.booking_contact_email}
                    </a>
                  </div>
                )}
                {contact.notes && (
                  <div style={s.contactNotes}>{contact.notes}</div>
                )}
              </div>
            ) : (
              <div style={{ fontSize: '0.78rem', color: '#bbb' }}>
                No contact information yet
              </div>
            )}

            {/* Action buttons */}
            <div style={s.btnRow}>
              <button
                style={s.btn}
                onClick={startEdit}
              >
                {hasContactInfo ? 'Edit' : 'Add Contact'}
              </button>

              {/* Reset to chain default — only for venue-level overrides on chain venues */}
              {resolvedScope === 'venue' && !isIndependent && (
                <button
                  style={s.btnDanger}
                  onClick={resetToChainDefault}
                  disabled={saving}
                >
                  {saving ? 'Resetting...' : 'Reset to Chain Default'}
                </button>
              )}
            </div>
          </>
        )}

        {/* ── Edit mode ── */}
        {editing && (
          <div>
            <div style={{ fontSize: '0.75rem', color: '#888', marginBottom: 2 }}>Manager</div>
            <input
              style={s.input}
              value={editFields.manager_name}
              onChange={(e) => setEditFields(f => ({ ...f, manager_name: e.target.value }))}
              placeholder="Manager name"
            />

            <div style={{ fontSize: '0.75rem', color: '#888', marginBottom: 2 }}>Booking Contact</div>
            <input
              style={s.input}
              value={editFields.booking_contact_name}
              onChange={(e) => setEditFields(f => ({ ...f, booking_contact_name: e.target.value }))}
              placeholder="Booking contact name"
            />

            <div style={{ fontSize: '0.75rem', color: '#888', marginBottom: 2 }}>Email</div>
            <input
              style={s.input}
              type="email"
              value={editFields.booking_contact_email}
              onChange={(e) => setEditFields(f => ({ ...f, booking_contact_email: e.target.value }))}
              placeholder="booking@example.co.uk"
            />

            <div style={{ fontSize: '0.75rem', color: '#888', marginBottom: 2 }}>Notes</div>
            <textarea
              style={s.textarea}
              value={editFields.notes}
              onChange={(e) => setEditFields(f => ({ ...f, notes: e.target.value }))}
              placeholder="Any additional notes..."
            />

            {/* Chain-broadcast checkbox (only for chain venues) */}
            {!isIndependent && (
              <label style={s.checkboxRow}>
                <input
                  type="checkbox"
                  checked={applyToChain}
                  onChange={(e) => setApplyToChain(e.target.checked)}
                />
                Apply to all {venue.chain} venues
              </label>
            )}

            <div style={s.btnRow}>
              <button
                style={s.btnPrimary}
                onClick={saveContactHandler}
                disabled={saving}
              >
                {saving ? 'Saving...' : 'Save'}
              </button>
              <button
                style={s.btn}
                onClick={() => setEditing(false)}
                disabled={saving}
              >
                Cancel
              </button>
            </div>
          </div>
        )}
      </div>


      {/* ── Address ── */}
      {venue.address && (
        <div style={s.address}>{venue.address}</div>
      )}
    </div>
  )
}
