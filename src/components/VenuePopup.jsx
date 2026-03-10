/**
 * VenuePopup.jsx — CineScope v3.6
 *
 * Redesigned venue popup for map markers.
 * Changes from v2.1:
 *   - Landscape 2-column layout (left: revenue/films, right: contact/chart)
 *   - Theme-aware (dark/light mode via ThemeContext)
 *   - "Average Revenue" label (was "Revenue")
 *   - Grade tooltip on hover (explains quartile system + venue position)
 *   - No "#" prefix on rankings
 *   - Styled close button handled via CSS (circle with offset)
 *   - More padding, spacing, CineScope design language
 */

import React, { useMemo, useState, useEffect, useCallback, useRef } from 'react'
import { useAuth } from '@clerk/clerk-react'
import { useApp } from '../context/AppContext'
import { useTheme } from '../context/ThemeContext'
import { getGradeColor, GRADES } from '../utils/grades'
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
  const { theme } = useTheme()
  const { getToken } = useAuth()

  const venueKey = `${venue.name}|${venue.city}`.toLowerCase()
  const filmEntries = venueFilmData.get(venueKey) || []

  const grade = venue.grade || null
  const gradeColor = grade ? getGradeColor(grade) : '#2E75B6'

  const isIndependent = !venue.chain || venue.chain === 'Independent'

  // ── Grade tooltip ──
  const [showGradeTooltip, setShowGradeTooltip] = useState(false)

  // ── Contact state ──
  const [contact, setContact] = useState(null)
  const [resolvedScope, setResolvedScope] = useState(null)
  const [contactLoading, setContactLoading] = useState(true)
  const [contactError, setContactError] = useState(null)
  const [editing, setEditing] = useState(false)
  const [saving, setSaving] = useState(false)

  const [editFields, setEditFields] = useState({
    manager_name: '',
    booking_contact_name: '',
    booking_contact_email: '',
    notes: '',
  })
  const [applyToChain, setApplyToChain] = useState(false)


  // ── Fetch contact on mount ──
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


  const saveContactHandler = useCallback(async () => {
    setSaving(true)
    try {
      const chainName = venue.chain || 'Independent'
      const scope = (!isIndependent && applyToChain) ? 'chain' : 'venue'
      const payload = { scope, chain_name: chainName, ...editFields }
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


  const resetToChainDefault = useCallback(async () => {
    if (!contact?.id) return
    setSaving(true)
    try {
      await api.deleteContact(contact.id, getToken)
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


  // ── National Ranking ──
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


  // ── Chain Ranking ──
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


  // ── Unscreened films ──
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


  // ── Chart data ──
  const showChart = filmEntries.length >= 2 &&
    (!selectedFilmId || selectedFilmId === 'all-films')

  const chartData = useMemo(() => {
    if (!showChart) return []
    return filmEntries.map(f => ({
      name: f.filmTitle.length > 12
        ? f.filmTitle.substring(0, 10) + '..'
        : f.filmTitle,
      fullName: f.filmTitle,
      revenue: f.revenue,
    }))
  }, [filmEntries, showChart])


  // ── Helpers ──
  const hasContactInfo = contact && (
    contact.manager_name ||
    contact.booking_contact_name ||
    contact.booking_contact_email ||
    contact.notes
  )

  const hasFilmData = filmEntries.length > 0 || unscreenedFilms.length > 0
  const useTwoColumns = hasFilmData

  const stopPropagation = useCallback((e) => {
    e.stopPropagation()
    if (e.nativeEvent) e.nativeEvent.stopImmediatePropagation()
  }, [])


  // ── Shared label style ──
  const sectionLabel = {
    fontWeight: 600,
    fontSize: '0.68rem',
    color: theme.textMuted,
    marginBottom: 6,
    textTransform: 'uppercase',
    letterSpacing: '0.05em',
  }

  // ── Input style ──
  const inputStyle = {
    width: '100%',
    padding: '3px 7px',
    fontSize: '0.78rem',
    border: `1px solid ${theme.border}`,
    borderRadius: 4,
    marginBottom: 5,
    boxSizing: 'border-box',
    outline: 'none',
    fontFamily: 'inherit',
    background: theme.inputBg || theme.surface,
    color: theme.text,
  }

  const btnStyle = {
    fontSize: '0.72rem',
    padding: '3px 10px',
    borderRadius: 5,
    border: `1px solid ${theme.border}`,
    background: theme.surface,
    color: theme.text,
    cursor: 'pointer',
    fontWeight: 500,
    fontFamily: 'inherit',
  }

  const btnPrimaryStyle = {
    ...btnStyle,
    border: 'none',
    background: theme.headerBorder || '#2E75B6',
    color: '#fff',
  }


  return (
    <div
      className="cs-venue-popup"
      onClick={stopPropagation}
      onMouseDown={stopPropagation}
      style={{
        fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
        lineHeight: 1.4,
        minWidth: useTwoColumns ? 440 : 280,
        maxWidth: useTwoColumns ? 540 : 320,
        padding: '16px 18px',
      }}
    >

      {/* ══ HEADER — Venue name + Grade badge ══ */}
      <div style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'flex-start',
        marginBottom: 8,
        gap: 12,
      }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{
            fontWeight: 700,
            fontSize: '0.95rem',
            lineHeight: 1.25,
            color: theme.text,
          }}>
            {venue.name}
          </div>
          <div style={{
            fontSize: '0.74rem',
            color: theme.textMuted,
            marginTop: 3,
          }}>
            {venue.city}
            {venue.country === 'Ireland' ? ', Ireland' : ''}
            {' \u00b7 '}{venue.chain || 'Independent'} {' \u00b7 '} {venue.category}
          </div>
          {(venue.status || 'open') === 'closed' && (
            <span style={{
              display: 'inline-block',
              marginTop: 4,
              padding: '1px 8px',
              borderRadius: 3,
              fontSize: '0.62rem',
              fontWeight: 700,
              letterSpacing: '0.05em',
              background: '#e74c3c',
              color: '#fff',
            }}>
              CLOSED
            </span>
          )}
        </div>

        {/* Grade badge with hover tooltip */}
        {grade && grade !== 'E' && selectedFilm && (
          <div
            style={{ position: 'relative', flexShrink: 0 }}
            onMouseEnter={() => setShowGradeTooltip(true)}
            onMouseLeave={() => setShowGradeTooltip(false)}
          >
            <div style={{
              width: 38,
              height: 38,
              borderRadius: '50%',
              backgroundColor: gradeColor,
              color: grade === 'B' ? '#1a1c25' : '#fff',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontWeight: 700,
              fontSize: '1rem',
              cursor: 'help',
              boxShadow: `0 2px 8px ${gradeColor}44`,
            }}>
              {grade}
            </div>

            {showGradeTooltip && (
              <div style={{
                position: 'absolute',
                top: '100%',
                right: 0,
                marginTop: 6,
                width: 230,
                padding: '10px 12px',
                background: theme.surface,
                border: `1px solid ${theme.border}`,
                borderRadius: 8,
                boxShadow: '0 4px 20px rgba(0,0,0,0.35)',
                zIndex: 10000,
                fontSize: '0.7rem',
                lineHeight: 1.5,
                color: theme.text,
              }}>
                <div style={{ fontWeight: 700, marginBottom: 5, color: gradeColor, fontSize: '0.74rem' }}>
                  Grade {grade} {GRADES[grade]?.name ? `\u2014 ${GRADES[grade].name}` : ''}
                </div>
                <div style={{ color: theme.textMuted, fontSize: '0.66rem', marginBottom: 4 }}>
                  Venues graded A\u2013E by revenue quartiles:
                </div>
                {['A', 'B', 'C', 'D', 'E'].map(g => (
                  <div key={g} style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 6,
                    padding: '1px 0',
                    fontWeight: g === grade ? 700 : 400,
                    color: g === grade ? theme.text : theme.textMuted,
                    fontSize: '0.66rem',
                  }}>
                    <span style={{
                      display: 'inline-block',
                      width: 7,
                      height: 7,
                      borderRadius: '50%',
                      background: getGradeColor(g),
                      flexShrink: 0,
                    }} />
                    <span>
                      {g === 'A' && 'A \u2014 Top 25%'}
                      {g === 'B' && 'B \u2014 25\u201350%'}
                      {g === 'C' && 'C \u2014 50\u201375%'}
                      {g === 'D' && 'D \u2014 Bottom 25%'}
                      {g === 'E' && 'E \u2014 Not screened'}
                    </span>
                  </div>
                ))}
                {nationalRanking && (
                  <div style={{
                    borderTop: `1px solid ${theme.border}`,
                    paddingTop: 5,
                    marginTop: 5,
                    fontWeight: 600,
                    fontSize: '0.68rem',
                    color: theme.text,
                  }}>
                    This venue: {nationalRanking.rank} of {nationalRanking.total} nationally
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </div>


      {/* ══ REVENUE + RANKINGS ══ */}
      {venue.revenue != null && (
        <div style={{
          background: `${theme.headerBorder}10`,
          borderRadius: 8,
          padding: '8px 12px',
          marginBottom: 10,
          border: `1px solid ${theme.border}`,
        }}>
          <div style={{
            fontWeight: 700,
            fontSize: '0.92rem',
            color: theme.text,
          }}>
            Average Revenue: {formatRevenue(venue.revenue, revenueFormat)}
            {venue.wasAggregated && (
              <span
                style={{ fontSize: '0.72em', marginLeft: 4, cursor: 'help' }}
                title={`Combined from ${venue.screenEntries} screen entries`}
              >
                {'\uD83D\uDDA5\uFE0F'}&times;{venue.screenEntries}
              </span>
            )}
          </div>

          {nationalRanking && (
            <div style={{ color: theme.textMuted, fontSize: '0.76rem', marginTop: 3 }}>
              National: <strong style={{ color: theme.text }}>{nationalRanking.rank}</strong> of {nationalRanking.total} venues
            </div>
          )}

          {chainRanking && (
            <div style={{ color: theme.textMuted, fontSize: '0.76rem', marginTop: 1 }}>
              Chain: <strong style={{ color: theme.text }}>{chainRanking.rank}</strong> of {chainRanking.total} {chainRanking.chain} venues
            </div>
          )}
        </div>
      )}


      {/* ══ TWO-COLUMN BODY ══ */}
      <div style={{
        display: useTwoColumns ? 'flex' : 'block',
        gap: 14,
      }}>

        {/* ── LEFT: Per-Film Breakdown + Chart ── */}
        {hasFilmData && (
          <div style={{ flex: useTwoColumns ? '1 1 55%' : 'none', minWidth: 0 }}>
            <div style={sectionLabel}>Per-Film Breakdown</div>

            <div style={{ maxHeight: 200, overflowY: 'auto', marginBottom: 6 }}>
              {filmEntries.map((f, i) => (
                <div
                  key={f.filmId}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    padding: '4px 0',
                    borderBottom: (i < filmEntries.length - 1 || unscreenedFilms.length > 0)
                      ? `1px solid ${theme.border}` : 'none',
                  }}
                >
                  <span style={{
                    color: theme.text,
                    flex: 1,
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                    marginRight: 8,
                    fontSize: '0.78rem',
                  }}>
                    {f.filmTitle}
                  </span>
                  <span style={{
                    fontWeight: 600,
                    marginRight: 6,
                    whiteSpace: 'nowrap',
                    fontSize: '0.78rem',
                    color: theme.text,
                  }}>
                    {formatRevenue(f.revenue, revenueFormat)}
                  </span>
                  <span style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    width: 20,
                    height: 20,
                    borderRadius: '50%',
                    fontSize: '0.62rem',
                    fontWeight: 700,
                    color: '#fff',
                    flexShrink: 0,
                    backgroundColor: getGradeColor(f.grade),
                  }}>
                    {f.grade}
                  </span>
                </div>
              ))}

              {unscreenedFilms.map((f, i) => (
                <div
                  key={`un-${f.filmId}`}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    padding: '4px 0',
                    opacity: 0.5,
                    borderBottom: i < unscreenedFilms.length - 1
                      ? `1px solid ${theme.border}` : 'none',
                  }}
                >
                  <span style={{
                    color: theme.textMuted,
                    flex: 1,
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                    marginRight: 8,
                    fontSize: '0.78rem',
                  }}>
                    {f.filmTitle}
                  </span>
                  <span style={{
                    color: theme.textMuted,
                    fontStyle: 'italic',
                    fontSize: '0.7rem',
                    marginRight: 6,
                    whiteSpace: 'nowrap',
                  }}>
                    Not screened
                  </span>
                  <span style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    width: 20,
                    height: 20,
                    borderRadius: '50%',
                    fontSize: '0.62rem',
                    fontWeight: 700,
                    color: '#fff',
                    flexShrink: 0,
                    backgroundColor: getGradeColor('E'),
                  }}>
                    E
                  </span>
                </div>
              ))}
            </div>

            {/* Trend Chart */}
            {showChart && (
              <div style={{ marginTop: 4 }}>
                <div style={sectionLabel}>Revenue Trend</div>
                <div style={{ width: '100%', height: 110 }}>
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={chartData} margin={{ top: 5, right: 8, bottom: 5, left: 0 }}>
                      <XAxis
                        dataKey="name"
                        tick={{ fontSize: 8, fill: theme.textMuted }}
                        interval={0}
                        angle={-15}
                        textAnchor="end"
                        height={28}
                      />
                      <YAxis
                        tick={{ fontSize: 8, fill: theme.textMuted }}
                        tickFormatter={(v) => v >= 1000 ? `${(v / 1000).toFixed(0)}k` : v}
                        width={30}
                      />
                      <Tooltip
                        formatter={(value) => [formatRevenue(value, revenueFormat), 'Revenue']}
                        labelFormatter={(label, payload) => payload?.[0]?.payload?.fullName || label}
                        contentStyle={{
                          fontSize: '0.74rem',
                          borderRadius: 6,
                          background: theme.surface,
                          border: `1px solid ${theme.border}`,
                          color: theme.text,
                        }}
                      />
                      <Line
                        type="monotone"
                        dataKey="revenue"
                        stroke={theme.headerBorder || '#6c8aff'}
                        strokeWidth={2}
                        dot={{ r: 3, fill: theme.headerBorder || '#6c8aff', stroke: '#fff', strokeWidth: 1 }}
                        activeDot={{ r: 5 }}
                      />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              </div>
            )}

            {filmEntries.length === 1 && importedFilms.length <= 1 && (
              <div style={{ fontSize: '0.68rem', color: theme.textMuted, textAlign: 'center', marginTop: 4 }}>
                Import more films to see trends
              </div>
            )}
          </div>
        )}


        {/* ── RIGHT: Contact + Address ── */}
        <div style={{
          flex: useTwoColumns ? '1 1 45%' : 'none',
          minWidth: 0,
          borderLeft: useTwoColumns ? `1px solid ${theme.border}` : 'none',
          paddingLeft: useTwoColumns ? 14 : 0,
          paddingTop: useTwoColumns ? 0 : (hasFilmData ? 0 : 0),
        }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', marginBottom: 6, flexWrap: 'wrap', gap: 4 }}>
              <div style={sectionLabel}>Contact</div>
              {resolvedScope === 'venue' && !editing && (
                <span style={{
                  fontSize: '0.6rem', fontWeight: 600, padding: '1px 6px', borderRadius: 3,
                  background: `${theme.headerBorder}18`, color: theme.headerBorder,
                }}>Custom</span>
              )}
              {resolvedScope === 'chain' && !editing && !isIndependent && (
                <span style={{
                  fontSize: '0.6rem', fontWeight: 600, padding: '1px 6px', borderRadius: 3,
                  background: `${theme.textMuted}18`, color: theme.textMuted,
                }}>Chain default</span>
              )}
            </div>

            {contactLoading && (
              <div style={{ fontSize: '0.75rem', color: theme.textMuted }}>Loading contact..</div>
            )}

            {contactError && !contactLoading && (
              <div style={{ fontSize: '0.75rem', color: '#e74c3c' }}>{contactError}</div>
            )}

            {!contactLoading && !editing && (
              <>
                {hasContactInfo ? (
                  <div style={{ fontSize: '0.78rem' }}>
                    {contact.manager_name && (
                      <div style={{ color: theme.text, marginBottom: 2 }}>
                        <span style={{ color: theme.textMuted, fontWeight: 500, fontSize: '0.72rem' }}>Manager: </span>
                        {contact.manager_name}
                      </div>
                    )}
                    {contact.booking_contact_name && (
                      <div style={{ color: theme.text, marginBottom: 2 }}>
                        <span style={{ color: theme.textMuted, fontWeight: 500, fontSize: '0.72rem' }}>Booking: </span>
                        {contact.booking_contact_name}
                      </div>
                    )}
                    {contact.booking_contact_email && (
                      <div style={{ marginBottom: 2 }}>
                        <span style={{ color: theme.textMuted, fontWeight: 500, fontSize: '0.72rem' }}>Email: </span>
                        <a
                          href={`mailto:${contact.booking_contact_email}`}
                          style={{ color: theme.headerBorder, textDecoration: 'none', fontSize: '0.78rem' }}
                        >
                          {contact.booking_contact_email}
                        </a>
                      </div>
                    )}
                    {contact.notes && (
                      <div style={{ fontSize: '0.74rem', color: theme.textMuted, fontStyle: 'italic', marginTop: 3 }}>
                        {contact.notes}
                      </div>
                    )}
                  </div>
                ) : (
                  <div style={{ fontSize: '0.75rem', color: theme.textMuted }}>
                    No contact information yet
                  </div>
                )}

                <div style={{ display: 'flex', gap: 6, marginTop: 8, flexWrap: 'wrap' }}>
                  <button style={btnStyle} onClick={startEdit}>
                    {hasContactInfo ? 'Edit' : 'Add Contact'}
                  </button>
                  {resolvedScope === 'venue' && !isIndependent && (
                    <button
                      style={{ ...btnStyle, borderColor: '#e74c3c', color: '#e74c3c', fontSize: '0.68rem' }}
                      onClick={resetToChainDefault}
                      disabled={saving}
                    >
                      {saving ? 'Resetting..' : 'Reset to Chain Default'}
                    </button>
                  )}
                </div>
              </>
            )}

            {editing && (
              <div>
                {[
                  { key: 'manager_name', label: 'Manager', placeholder: 'Manager name' },
                  { key: 'booking_contact_name', label: 'Booking Contact', placeholder: 'Booking contact name' },
                  { key: 'booking_contact_email', label: 'Email', placeholder: 'booking@example.co.uk', type: 'email' },
                ].map(({ key, label, placeholder, type }) => (
                  <div key={key}>
                    <div style={{ fontSize: '0.7rem', color: theme.textMuted, marginBottom: 1 }}>{label}</div>
                    <input
                      type={type || 'text'}
                      style={inputStyle}
                      value={editFields[key]}
                      onChange={(e) => setEditFields(f => ({ ...f, [key]: e.target.value }))}
                      placeholder={placeholder}
                    />
                  </div>
                ))}

                <div style={{ fontSize: '0.7rem', color: theme.textMuted, marginBottom: 1 }}>Notes</div>
                <textarea
                  style={{ ...inputStyle, resize: 'vertical', minHeight: 36 }}
                  value={editFields.notes}
                  onChange={(e) => setEditFields(f => ({ ...f, notes: e.target.value }))}
                  placeholder="Any additional notes..."
                />

                {!isIndependent && (
                  <label style={{
                    display: 'flex', alignItems: 'center', gap: 6,
                    marginTop: 2, marginBottom: 4, fontSize: '0.74rem',
                    color: theme.textMuted, cursor: 'pointer',
                  }}>
                    <input
                      type="checkbox"
                      checked={applyToChain}
                      onChange={(e) => setApplyToChain(e.target.checked)}
                    />
                    Apply to all {venue.chain} venues
                  </label>
                )}

                <div style={{ display: 'flex', gap: 6, marginTop: 4 }}>
                  <button style={btnPrimaryStyle} onClick={saveContactHandler} disabled={saving}>
                    {saving ? 'Saving..' : 'Save'}
                  </button>
                  <button style={btnStyle} onClick={() => setEditing(false)} disabled={saving}>
                    Cancel
                  </button>
                </div>
              </div>
            )}
          </div>

          {venue.address && (
            <div style={{
              fontSize: '0.7rem',
              color: theme.textMuted,
              borderTop: `1px solid ${theme.border}`,
              paddingTop: 6,
              marginTop: 10,
            }}>
              {venue.address}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
