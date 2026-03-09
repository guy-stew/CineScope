/**
 * CineScope — Trend Panel (Restyled v3.3)
 *
 * Performance & Trends view — tracks venue grade changes across films.
 * Tabs: Venues, Chains, Regions, AI Insights.
 * Matches cinescope_redesign_v2 mockup design language.
 */

import React, { useState, useMemo, useCallback, Component } from 'react'
import { Modal } from 'react-bootstrap'
import { BarChart, Bar, XAxis, YAxis, ResponsiveContainer, Tooltip as RTooltip, Cell } from 'recharts'
import { useApp } from '../context/AppContext'
import { useTheme } from '../context/ThemeContext'
import { useAuth } from '@clerk/clerk-react'
import { GRADES } from '../utils/grades'
import { computeTrends, buildTrendSummaryForAI } from '../utils/trendAnalysis'
import { generateAIReport, buildFilmProfileForAI } from '../utils/aiReport'
import { formatRevenue } from '../utils/formatRevenue'
import Icon from './Icon'
import ExportMenu from './ExportMenu'
import FilmSelectorDropdown from './FilmSelectorDropdown'


// ─── Error Boundary ──────────────────────────────────────────
class TrendErrorBoundary extends Component {
  constructor(props) {
    super(props)
    this.state = { hasError: false, error: null }
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error }
  }

  componentDidCatch(error, errorInfo) {
    console.error('[CineScope] TrendPanel error:', error, errorInfo)
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="cs-tp__error-box">
          <Icon name="error" size={40} style={{ color: '#ef4444' }} />
          <p style={{ marginTop: 12, color: '#ef4444', fontWeight: 600 }}>Trend analysis encountered an error</p>
          <p style={{ fontSize: '0.85rem', color: 'var(--cs-text-muted)' }}>
            {String(this.state.error?.message || 'Unknown error')}
          </p>
          <button
            className="cs-tp__btn"
            onClick={() => this.setState({ hasError: false, error: null })}
          >
            Try Again
          </button>
        </div>
      )
    }
    return this.props.children
  }
}

export default function TrendPanel({ show, onHide, inline = false }) {
  return (
    <TrendErrorBoundary>
      <TrendPanelInner show={show} onHide={onHide} inline={inline} />
    </TrendErrorBoundary>
  )
}


function TrendPanelInner({ show, onHide, inline = false }) {
  const {
    importedFilms, baseVenues, gradeSettings, revenueFormat,
    hasApiKey, selectedFilmId, setAiReportText, setAiReportFilmId,
    catalogue, apiClient
  } = useApp()
  const { theme } = useTheme()
  const { getToken } = useAuth()

  // Tab state
  const [activeTab, setActiveTab] = useState('venues')

  // AI report state
  const [aiReport, setAiReport] = useState('')
  const [aiLoading, setAiLoading] = useState(false)
  const [aiError, setAiError] = useState(null)

  // Venue filter
  const [venueFilter, setVenueFilter] = useState('all')
  const [venueSearch, setVenueSearch] = useState('')

  // Compute trends
  const trendData = useMemo(() => {
    if ((!show && !inline) || importedFilms.length < 2) return null
    try {
      return computeTrends(importedFilms, baseVenues, gradeSettings)
    } catch (err) {
      console.error('[CineScope] Trend computation failed:', err)
      return { error: String(err.message || 'Unknown error') }
    }
  }, [show, inline, importedFilms, baseVenues, gradeSettings])

  // Generate AI report
  const handleGenerateReport = useCallback(async () => {
    if (!trendData || trendData.error) return
    setAiLoading(true)
    setAiError(null)
    setAiReport('')

    try {
      const summary = buildTrendSummaryForAI(trendData)

      let filmProfile = ''
      try {
        const catEntries = []
        for (const film of importedFilms) {
          if (film.catalogueId) {
            const catMatch = catalogue.find(c => c.id === film.catalogueId)
            if (catMatch) {
              const fullEntry = await apiClient.getCatalogueEntry(film.catalogueId)
              if (fullEntry) catEntries.push(fullEntry)
            }
          }
        }
        if (catEntries.length > 0) filmProfile = buildFilmProfileForAI(catEntries)
      } catch (profileErr) {
        console.warn('CineScope: Could not load film profiles for AI', profileErr)
      }

      const fullReport = await generateAIReport(getToken, summary, (chunk) => {
        setAiReport(prev => prev + chunk)
      }, filmProfile || undefined)
      setAiReportText(fullReport)
      setAiReportFilmId(selectedFilmId)
    } catch (err) {
      setAiError(err.message)
    } finally {
      setAiLoading(false)
    }
  }, [trendData, getToken, selectedFilmId, setAiReportText, setAiReportFilmId, importedFilms, catalogue, apiClient])

  // ── Not enough films ──
  if (!show && !inline) return null

  if (!trendData || importedFilms.length < 2) {
    const notEnoughContent = (
      <div className="cs-tp__empty">
        <span className="cs-tp__empty-icon material-symbols-rounded">trending_up</span>
        <p>Import at least 2 Comscore files to see trend analysis.</p>
        <p style={{ fontSize: '0.85rem' }}>
          Trends track how each venue's grade changes across film releases,
          helping you spot improving and declining cinemas.
        </p>
      </div>
    )

    if (inline) {
      return (
        <div className="d-flex flex-column h-100" style={{ background: 'var(--cs-body)', color: 'var(--cs-text)' }}>
          <div className="cs-tp" style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            {notEnoughContent}
          </div>
        </div>
      )
    }

    return (
      <Modal show={show} onHide={onHide} size="lg" centered>
        <Modal.Header closeButton style={{ background: theme.header, borderBottom: `1px solid ${theme.border}` }}>
          <Modal.Title style={{ color: theme.headerText || '#fff' }}>
            <div className="d-flex align-items-center gap-2">
              <Icon name="insights" size={22} /> Trend Analysis
            </div>
          </Modal.Title>
        </Modal.Header>
        <Modal.Body style={{ background: 'var(--cs-body)', color: 'var(--cs-text)' }}>
          {notEnoughContent}
        </Modal.Body>
      </Modal>
    )
  }

  // ── Computation error ──
  if (trendData.error) {
    const errorContent = (
      <div className="cs-tp__error-box">
        <Icon name="error" size={40} style={{ color: '#ef4444' }} />
        <p style={{ marginTop: 12, color: '#ef4444' }}>Could not compute trends</p>
        <p style={{ fontSize: '0.85rem', color: 'var(--cs-text-muted)' }}>{String(trendData.error)}</p>
      </div>
    )

    if (inline) {
      return (
        <div className="d-flex flex-column h-100" style={{ background: 'var(--cs-body)', color: 'var(--cs-text)' }}>
          <div className="cs-tp" style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            {errorContent}
          </div>
        </div>
      )
    }

    return (
      <Modal show={show} onHide={onHide} size="lg" centered>
        <Modal.Header closeButton style={{ background: theme.header, borderBottom: `1px solid ${theme.border}` }}>
          <Modal.Title style={{ color: theme.headerText || '#fff' }}>
            <div className="d-flex align-items-center gap-2">
              <Icon name="insights" size={22} /> Trend Analysis
            </div>
          </Modal.Title>
        </Modal.Header>
        <Modal.Body style={{ background: 'var(--cs-body)', color: 'var(--cs-text)' }}>
          {errorContent}
        </Modal.Body>
      </Modal>
    )
  }


  // ═══════════════════════════════════════════════════════════════
  // MAIN RENDER (has data)
  // ═══════════════════════════════════════════════════════════════

  const summary = trendData.summary || {}
  const venueTrends = trendData.venueTrends || []
  const chainTrends = trendData.chainTrends || []
  const regionalTrends = trendData.regionalTrends || []
  const filmTitles = trendData.filmTitles || []

  // Filtered venue list
  const filteredVenues = venueTrends.filter(v => {
    if (venueFilter !== 'all' && v.direction !== venueFilter) return false
    if (venueSearch.trim()) {
      const term = venueSearch.toLowerCase()
      if (
        !(v.name || '').toLowerCase().includes(term) &&
        !(v.city || '').toLowerCase().includes(term) &&
        !(v.chain || '').toLowerCase().includes(term)
      ) return false
    }
    return true
  })

  const DIRECTION_ICONS = {
    improving: { icon: 'trending_up', color: '#27ae60', label: 'Improving' },
    declining: { icon: 'trending_down', color: '#e74c3c', label: 'Declining' },
    stable:    { icon: 'trending_flat', color: '#95a5a6', label: 'Stable' },
  }

  const mainContent = (
    <div className="cs-tp cs-tp--scroll-table">
      {/* ── Toolbar ── */}
      <div className="cs-tp__toolbar">
        <h1 className="cs-tp__title">
          Trend Analysis
        </h1>
        <div className="cs-tp__toolbar-right">
          <FilmSelectorDropdown compact />
          <ExportMenu />
        </div>
      </div>

      {/* ── Summary Cards ── */}
      <div className="cs-tp__stats">
        <div className="cs-tp__stat-card">
          <Icon name="movie" size={18} className="cs-tp__stat-icon" style={{ color: 'var(--cs-text-muted)' }} />
          <div className="cs-tp__stat-value" style={{ color: 'var(--cs-text)' }}>{summary.filmCount || 0}</div>
          <div className="cs-tp__stat-label">Films Analysed</div>
        </div>
        <div className="cs-tp__stat-card cs-tp__stat-card--highlight">
          <Icon name="location_on" size={18} className="cs-tp__stat-icon" style={{ color: 'var(--cs-header-border)' }} />
          <div className="cs-tp__stat-value" style={{ color: 'var(--cs-header-border)' }}>{summary.trackedVenues || 0}</div>
          <div className="cs-tp__stat-label">Venues Tracked</div>
        </div>
        <div className="cs-tp__stat-card">
          <Icon name="trending_up" size={18} className="cs-tp__stat-icon" style={{ color: '#27ae60' }} />
          <div className="cs-tp__stat-value" style={{ color: '#27ae60' }}>{summary.improving || 0}</div>
          <div className="cs-tp__stat-label">Improving</div>
        </div>
        <div className="cs-tp__stat-card">
          <Icon name="trending_flat" size={18} className="cs-tp__stat-icon" style={{ color: '#95a5a6' }} />
          <div className="cs-tp__stat-value" style={{ color: '#95a5a6' }}>{summary.stable || 0}</div>
          <div className="cs-tp__stat-label">Stable</div>
        </div>
        <div className="cs-tp__stat-card">
          <Icon name="trending_down" size={18} className="cs-tp__stat-icon" style={{ color: '#e74c3c' }} />
          <div className="cs-tp__stat-value" style={{ color: '#e74c3c' }}>{summary.declining || 0}</div>
          <div className="cs-tp__stat-label">Declining</div>
        </div>
      </div>

      {/* ── Tabs ── */}
      <div className="cs-tp__tabs">
        {[
          { key: 'venues',  icon: 'location_on',   label: 'Venues' },
          { key: 'chains',  icon: 'business',      label: 'Chains' },
          { key: 'regions', icon: 'map',            label: 'Regions' },
          { key: 'ai',      icon: 'auto_awesome',   label: 'AI Insights' },
        ].map(tab => (
          <button
            key={tab.key}
            className={`cs-tp__tab ${activeTab === tab.key ? 'cs-tp__tab--active' : ''}`}
            onClick={() => setActiveTab(tab.key)}
          >
            <Icon name={tab.icon} size={16} /> {tab.label}
          </button>
        ))}
      </div>

      {/* ── TAB: Venues ── */}
      {activeTab === 'venues' && (
        <div className="cs-tp__tab-fill">
          <div className="cs-tp__filters">
            <div className="cs-tp__status-pills">
              {['all', 'improving', 'stable', 'declining'].map(f => (
                <button
                  key={f}
                  className={`cs-tp__pill ${venueFilter === f ? 'cs-tp__pill--active' : ''}`}
                  onClick={() => setVenueFilter(f)}
                >
                  {f === 'all' ? 'All' : f.charAt(0).toUpperCase() + f.slice(1)}
                  {f !== 'all' && (
                    <span className="cs-tp__pill-count">
                      {venueTrends.filter(v => v.direction === f).length}
                    </span>
                  )}
                </button>
              ))}
            </div>

            <div className="cs-tp__search-wrap">
              <Icon name="search" size={16} />
              <input
                type="text"
                className="cs-tp__search"
                placeholder="Search venues..."
                value={venueSearch}
                onChange={e => setVenueSearch(e.target.value)}
              />
            </div>

            <span className="cs-tp__venue-count">{filteredVenues.length} venues</span>
          </div>

          <div className="cs-tp__table-wrap cs-tp__table-wrap--fill">
            <div className="cs-tp__table-scroll">
              <table className="cs-tp__table">
                <thead>
                  <tr>
                    <th>Venue</th>
                    <th>City</th>
                    <th>Chain</th>
                    <th>Region</th>
                    <th className="cs-tp__cell-center">Grades</th>
                    <th className="cs-tp__cell-right">Avg Revenue</th>
                    <th className="cs-tp__cell-center">Trend</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredVenues.slice(0, 200).map(v => (
                    <tr key={v.key}>
                      <td className="cs-tp__cell-name">{String(v.name || '')}</td>
                      <td>{String(v.city || '')}</td>
                      <td style={{ fontSize: '12px' }}>{String(v.chain || '')}</td>
                      <td style={{ fontSize: '12px' }}>{String(v.region || '')}</td>
                      <td className="cs-tp__cell-center">
                        <div style={{ display: 'flex', gap: 3, justifyContent: 'center' }}>
                          {(v.grades || []).map((g, i) => {
                            const filmIdx = (v.appearances || [])[i]?.filmIndex
                            const filmName = filmIdx != null ? filmTitles[filmIdx] : filmTitles[i]
                            const filmRevenue = (v.appearances || [])[i]?.revenue
                            const tooltipText = filmName
                              ? `${i + 1}. ${filmName}${filmRevenue != null ? ` — ${formatRevenue(filmRevenue, revenueFormat)}` : ''}`
                              : `Film ${i + 1}`
                            return (
                              <span
                                key={i}
                                className="cs-tp__grade-badge"
                                style={{ backgroundColor: GRADES[g]?.color || '#95a5a6' }}
                                title={tooltipText}
                              >
                                {String(g)}
                              </span>
                            )
                          })}
                        </div>
                      </td>
                      <td className="cs-tp__cell-right">{formatRevenue(v.avgRevenue, revenueFormat)}</td>
                      <td className="cs-tp__cell-center">
                        <TrendIcon direction={v.direction} />
                      </td>
                    </tr>
                  ))}
                  {filteredVenues.length === 0 && (
                    <tr>
                      <td colSpan={7} style={{ textAlign: 'center', padding: '24px 0', color: 'var(--cs-text-muted)' }}>
                        No venues match filters
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
      {/* ── TAB: Chains ── */}
      {activeTab === 'chains' && (
        <div className="cs-tp__tab-fill">
          {chainTrends.length === 0 ? (
            <div className="cs-tp__empty">Not enough chain data across films</div>
          ) : (
            <>
              <div className="cs-tp__chart-wrap" style={{ height: 280, flexShrink: 0 }}>
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={chainTrends.slice(0, 15)} layout="vertical" margin={{ left: 120, right: 20, top: 5, bottom: 5 }}>
                    <XAxis type="number" tickFormatter={v => '\u00A3' + Number(v || 0).toLocaleString()} style={{ fontSize: '0.72rem' }} />
                    <YAxis type="category" dataKey="chain" width={110} style={{ fontSize: '0.72rem' }} />
                    <RTooltip formatter={(v) => ['\u00A3' + Number(v || 0).toLocaleString(), 'Avg Revenue']} contentStyle={{ fontSize: '0.8rem' }} />
                    <Bar dataKey="latestAvgRevenue" radius={[0, 4, 4, 0]}>
                      {chainTrends.slice(0, 15).map((entry, i) => (
                        <Cell key={i} fill={GRADES[entry.latestAvgGrade]?.color || '#95a5a6'} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>

              <div className="cs-tp__table-wrap cs-tp__table-wrap--fill">
                <div className="cs-tp__table-scroll">
                  <table className="cs-tp__table">
                    <thead>
                      <tr>
                        <th>Chain</th>
                        <th className="cs-tp__cell-center">Venues</th>
                        <th className="cs-tp__cell-center">Avg Grade</th>
                        <th className="cs-tp__cell-right">Avg Revenue</th>
                        <th className="cs-tp__cell-center">Per Film</th>
                        <th className="cs-tp__cell-center">Trend</th>
                      </tr>
                    </thead>
                    <tbody>
                      {chainTrends.map(c => {
                        const latest = c.perFilm[c.perFilm.length - 1]
                        return (
                          <tr key={c.chain}>
                            <td className="cs-tp__cell-name">{String(c.chain || '')}</td>
                            <td className="cs-tp__cell-center">{latest?.venueCount || 0}</td>
                            <td className="cs-tp__cell-center">
                              <span className="cs-tp__grade-badge" style={{ backgroundColor: GRADES[c.latestAvgGrade]?.color || '#95a5a6' }}>
                                {String(c.latestAvgGrade || '?')}
                              </span>
                            </td>
                            <td className="cs-tp__cell-right">{formatRevenue(c.latestAvgRevenue, revenueFormat)}</td>
                            <td className="cs-tp__cell-center">
                              <div style={{ display: 'flex', gap: 3, justifyContent: 'center' }}>
                                {(c.perFilm || []).map((p, i) => (
                                  <span
                                    key={i}
                                    className="cs-tp__grade-badge"
                                    style={{ backgroundColor: GRADES[p.avgGrade]?.color || '#95a5a6' }}
                                    title={`${i + 1}. ${String(p.filmTitle || `Film ${i + 1}`)}`}
                                  >
                                    {String(p.avgGrade || '?')}
                                  </span>
                                ))}
                              </div>
                            </td>
                            <td className="cs-tp__cell-center"><TrendIcon direction={c.direction} /></td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            </>
          )}
        </div>
      )}

      {/* ── TAB: Regions ── */}
      {activeTab === 'regions' && (
        <div className="cs-tp__tab-fill">
          {regionalTrends.length === 0 ? (
            <div className="cs-tp__empty">Not enough regional data across films</div>
          ) : (
            <>
              <div className="cs-tp__chart-wrap" style={{ height: 250, flexShrink: 0 }}>
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={regionalTrends} margin={{ left: 10, right: 20, top: 5, bottom: 5 }}>
                    <XAxis dataKey="region" style={{ fontSize: '0.68rem' }} angle={-20} textAnchor="end" height={60} />
                    <YAxis tickFormatter={v => '\u00A3' + Number(v || 0).toLocaleString()} style={{ fontSize: '0.72rem' }} />
                    <RTooltip formatter={(v) => ['\u00A3' + Number(v || 0).toLocaleString(), 'Avg Revenue']} contentStyle={{ fontSize: '0.8rem' }} />
                    <Bar dataKey="latestAvgRevenue" radius={[4, 4, 0, 0]}>
                      {regionalTrends.map((entry, i) => (
                        <Cell key={i} fill={GRADES[entry.latestAvgGrade]?.color || '#95a5a6'} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>

              <div className="cs-tp__table-wrap cs-tp__table-wrap--fill">
                <div className="cs-tp__table-scroll">
                  <table className="cs-tp__table">
                    <thead>
                      <tr>
                        <th>Region</th>
                        <th className="cs-tp__cell-center">Venues</th>
                        <th className="cs-tp__cell-center">Avg Grade</th>
                        <th className="cs-tp__cell-right">Avg Revenue</th>
                        <th className="cs-tp__cell-center">Per Film</th>
                        <th className="cs-tp__cell-center">Trend</th>
                      </tr>
                    </thead>
                    <tbody>
                      {regionalTrends.map(r => {
                        const latest = r.perFilm[r.perFilm.length - 1]
                        return (
                          <tr key={r.region}>
                            <td className="cs-tp__cell-name">{String(r.region || '')}</td>
                            <td className="cs-tp__cell-center">{latest?.venueCount || 0}</td>
                            <td className="cs-tp__cell-center">
                              <span className="cs-tp__grade-badge" style={{ backgroundColor: GRADES[r.latestAvgGrade]?.color || '#95a5a6' }}>
                                {String(r.latestAvgGrade || '?')}
                              </span>
                            </td>
                            <td className="cs-tp__cell-right">{formatRevenue(r.latestAvgRevenue, revenueFormat)}</td>
                            <td className="cs-tp__cell-center">
                              <div style={{ display: 'flex', gap: 3, justifyContent: 'center' }}>
                                {(r.perFilm || []).map((p, i) => (
                                  <span
                                    key={i}
                                    className="cs-tp__grade-badge"
                                    style={{ backgroundColor: GRADES[p.avgGrade]?.color || '#95a5a6' }}
                                    title={`${i + 1}. ${String(p.filmTitle || `Film ${i + 1}`)}`}
                                  >
                                    {String(p.avgGrade || '?')}
                                  </span>
                                ))}
                              </div>
                            </td>
                            <td className="cs-tp__cell-center"><TrendIcon direction={r.direction} /></td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            </>
          )}
        </div>
      )}

      {/* ── TAB: AI Insights ── */}
      {activeTab === 'ai' && (
        <div className="cs-tp__ai-section">
          {!hasApiKey ? (
            <div className="cs-tp__ai-prompt">
              <span className="cs-tp__ai-prompt-icon material-symbols-rounded">key</span>
              <p>Add your Anthropic API key in <strong>Settings</strong> to enable AI-powered insights.</p>
              <p style={{ fontSize: '0.85rem' }}>
                Claude will analyse your trend data and write a concise report highlighting
                marketing opportunities, improving venues, and actionable recommendations.
              </p>
            </div>
          ) : (
            <>
              <div className="cs-tp__ai-actions">
                <button
                  className="cs-tp__btn cs-tp__btn--primary"
                  onClick={handleGenerateReport}
                  disabled={aiLoading}
                >
                  {aiLoading ? (
                    <><Icon name="progress_activity" size={16} /> Analysing...</>
                  ) : (
                    <><Icon name="auto_awesome" size={16} /> Generate Report</>
                  )}
                </button>
                {aiReport && !aiLoading && (
                  <button
                    className="cs-tp__btn"
                    onClick={() => navigator.clipboard.writeText(aiReport)}
                  >
                    <Icon name="content_copy" size={14} /> Copy
                  </button>
                )}
                <span className="cs-tp__ai-powered">Powered by Claude</span>
              </div>

              {aiError && (
                <div className="cs-tp__ai-error">
                  <Icon name="error" size={16} /> {String(aiError)}
                </div>
              )}

              {aiReport && (
                <div className="cs-tp__ai-report">{aiReport}</div>
              )}

              {!aiReport && !aiLoading && !aiError && (
                <div className="cs-tp__ai-prompt">
                  Click "Generate Report" to get AI-powered insights on your {summary.filmCount || 0} films
                  and {summary.trackedVenues || 0} tracked venues.
                </div>
              )}
            </>
          )}
        </div>
      )}
    </div>
  )

  const footerContent = (
    <div className="cs-tp__footer">
      Trends based on {summary.filmCount || 0} films: {filmTitles.join(' \u2192 ')}
    </div>
  )


  // ═══════════════════════════════════════════════════════════════
  // RENDER — INLINE vs MODAL
  // ═══════════════════════════════════════════════════════════════

  if (inline) {
    return (
      <div className="d-flex flex-column h-100" style={{ background: 'var(--cs-body)', color: 'var(--cs-text)' }}>
        <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
          {mainContent}
        </div>
        {footerContent}
      </div>
    )
  }

  return (
    <Modal show={show} onHide={onHide} size="xl" centered scrollable>
      <Modal.Header closeButton style={{ background: theme.header, borderBottom: `1px solid ${theme.border}` }}>
        <Modal.Title style={{ color: theme.headerText || '#fff' }}>
          <div className="d-flex align-items-center gap-2">
            <Icon name="insights" size={22} />
            <span className="fw-bold">Trend Analysis</span>
          </div>
        </Modal.Title>
      </Modal.Header>
      <Modal.Body style={{ maxHeight: '75vh', overflowY: 'auto', background: 'var(--cs-body)', color: 'var(--cs-text)', padding: 0 }}>
        {mainContent}
      </Modal.Body>
      <Modal.Footer style={{ background: 'var(--cs-surface-alt)', borderColor: 'var(--cs-border)', padding: 0 }}>
        {footerContent}
      </Modal.Footer>
    </Modal>
  )
}


// ─── Helper: Trend direction icon ────────────────────────────

function TrendIcon({ direction }) {
  const config = {
    improving: { icon: 'trending_up',   color: '#27ae60' },
    declining: { icon: 'trending_down',  color: '#e74c3c' },
    stable:    { icon: 'trending_flat',  color: '#95a5a6' },
  }
  const c = config[direction] || config.stable
  return (
    <span className="cs-tp__trend-icon" style={{ color: c.color }} title={direction}>
      <Icon name={c.icon} size={18} />
    </span>
  )
}
