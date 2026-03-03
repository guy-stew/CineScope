import React, { useState, useMemo, useCallback } from 'react'
import { Modal, Badge, Button, Tab, Tabs, Spinner, Form } from 'react-bootstrap'
import { BarChart, Bar, XAxis, YAxis, ResponsiveContainer, Tooltip as RTooltip, Cell } from 'recharts'
import { useApp } from '../context/AppContext'
import { useTheme } from '../context/ThemeContext'
import { GRADES } from '../utils/grades'
import { computeTrends, buildTrendSummaryForAI } from '../utils/trendAnalysis'
import { generateAIReport } from '../utils/aiReport'
import { formatRevenue } from '../utils/formatRevenue'
import Icon from './Icon'

const DIRECTION_ICONS = {
  improving: { icon: 'trending_up', color: '#27ae60', label: 'Improving' },
  declining: { icon: 'trending_down', color: '#e74c3c', label: 'Declining' },
  stable: { icon: 'trending_flat', color: '#95a5a6', label: 'Stable' },
}

export default function TrendPanel({ show, onHide }) {
  const { importedFilms, baseVenues, gradeSettings, revenueFormat, apiKey } = useApp()
  const { theme } = useTheme()

  // AI report state
  const [aiReport, setAiReport] = useState('')
  const [aiLoading, setAiLoading] = useState(false)
  const [aiError, setAiError] = useState(null)

  // Venue filter
  const [venueFilter, setVenueFilter] = useState('all') // all, improving, declining, stable
  const [venueSearch, setVenueSearch] = useState('')

  // Compute trends
  const trendData = useMemo(() => {
    if (!show || importedFilms.length < 2) return null
    return computeTrends(importedFilms, baseVenues, gradeSettings)
  }, [show, importedFilms, baseVenues, gradeSettings])

  // Generate AI report
  const handleGenerateReport = useCallback(async () => {
    if (!trendData) return
    setAiLoading(true)
    setAiError(null)
    setAiReport('')

    try {
      const summary = buildTrendSummaryForAI(trendData)
      await generateAIReport(apiKey, summary, (chunk) => {
        setAiReport(prev => prev + chunk)
      })
    } catch (err) {
      setAiError(err.message)
    } finally {
      setAiLoading(false)
    }
  }, [trendData, apiKey])

  if (!trendData) {
    return (
      <Modal show={show} onHide={onHide} size="lg" centered>
        <Modal.Header closeButton style={{ background: 'var(--cs-header, #1a365d)', color: 'white' }}>
          <Modal.Title><Icon name="insights" size={22} className="me-2" /> Trend Analysis</Modal.Title>
        </Modal.Header>
        <Modal.Body className="text-center py-5" style={{ background: theme.surface, color: theme.textMuted }}>
          <Icon name="trending_up" size={48} />
          <p className="mt-3">Import at least 2 Comscore files to see trend analysis.</p>
          <p style={{ fontSize: '0.85rem' }}>
            Trends track how each venue's grade changes across film releases,
            helping you spot improving and declining cinemas.
          </p>
        </Modal.Body>
      </Modal>
    )
  }

  const { summary, venueTrends, chainTrends, regionalTrends, filmTitles } = trendData

  // Filtered venue list
  const filteredVenues = useMemo(() => {
    let list = venueTrends
    if (venueFilter !== 'all') {
      list = list.filter(v => v.direction === venueFilter)
    }
    if (venueSearch.trim()) {
      const term = venueSearch.toLowerCase()
      list = list.filter(v =>
        v.name.toLowerCase().includes(term) ||
        v.city.toLowerCase().includes(term) ||
        (v.chain || '').toLowerCase().includes(term)
      )
    }
    return list
  }, [venueTrends, venueFilter, venueSearch])

  return (
    <Modal show={show} onHide={onHide} size="xl" centered scrollable>
      <Modal.Header closeButton style={{ background: 'var(--cs-header, #1a365d)', color: 'white' }}>
        <Modal.Title className="d-flex align-items-center gap-2">
          <Icon name="insights" size={22} /> Trend Analysis
          <Badge bg="light" text="dark" style={{ fontSize: '0.7rem', fontWeight: 'normal' }}>
            {summary.filmCount} films
          </Badge>
        </Modal.Title>
      </Modal.Header>

      <Modal.Body style={{ maxHeight: '75vh', overflowY: 'auto', background: theme.surface, color: theme.text }}>

        {/* ── Summary Bar ── */}
        <div className="d-flex gap-3 mb-3 flex-wrap">
          <SummaryCard label="Films Analysed" value={summary.filmCount} color="#6c757d" icon="movie" />
          <SummaryCard label="Venues Tracked" value={summary.trackedVenues} color="#17a2b8" icon="location_on" />
          <SummaryCard label="Improving" value={summary.improving} color="#27ae60" icon="trending_up" />
          <SummaryCard label="Stable" value={summary.stable} color="#95a5a6" icon="trending_flat" />
          <SummaryCard label="Declining" value={summary.declining} color="#e74c3c" icon="trending_down" />
        </div>

        {/* ── Tabs ── */}
        <Tabs defaultActiveKey="venues" className="mb-3">

          {/* ─── Venue Trends ─── */}
          <Tab eventKey="venues" title={<><Icon name="location_on" size={16} className="me-1" /> Venues</>}>
            <div className="d-flex gap-2 mb-3 flex-wrap align-items-center">
              <div className="d-flex gap-1">
                {['all', 'improving', 'stable', 'declining'].map(f => (
                  <Button
                    key={f}
                    size="sm"
                    variant={venueFilter === f ? 'primary' : 'outline-secondary'}
                    onClick={() => setVenueFilter(f)}
                    style={venueFilter !== f ? { color: theme.text, borderColor: theme.border } : {}}
                  >
                    {f === 'all' ? 'All' : f.charAt(0).toUpperCase() + f.slice(1)}
                    {f !== 'all' && (
                      <Badge bg="light" text="dark" className="ms-1" style={{ fontSize: '0.65rem' }}>
                        {venueTrends.filter(v => v.direction === f).length}
                      </Badge>
                    )}
                  </Button>
                ))}
              </div>
              <Form.Control
                size="sm"
                type="text"
                placeholder="Search venues..."
                value={venueSearch}
                onChange={e => setVenueSearch(e.target.value)}
                style={{ maxWidth: 200, backgroundColor: theme.inputBg, borderColor: theme.inputBorder, color: theme.inputText }}
              />
              <small style={{ color: theme.textMuted }}>{filteredVenues.length} venues</small>
            </div>

            <div className="table-responsive" style={{ maxHeight: 400, fontSize: '0.82rem' }}>
              <table className="table table-sm table-hover align-middle mb-0" style={{ color: theme.text }}>
                <thead>
                  <tr style={{ borderBottom: `2px solid ${theme.border}` }}>
                    <th>Venue</th>
                    <th>City</th>
                    <th>Chain</th>
                    <th>Region</th>
                    <th className="text-center">Grades</th>
                    <th className="text-end">Avg Revenue</th>
                    <th className="text-center">Trend</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredVenues.slice(0, 200).map(v => (
                    <tr key={v.key}>
                      <td className="text-truncate" style={{ maxWidth: 160 }}>{v.name}</td>
                      <td className="text-truncate" style={{ maxWidth: 90 }}>{v.city}</td>
                      <td><small style={{ color: theme.textMuted }}>{v.chain}</small></td>
                      <td><small style={{ color: theme.textMuted }}>{v.region}</small></td>
                      <td className="text-center">
                        <div className="d-flex gap-1 justify-content-center">
                          {v.grades.map((g, i) => (
                            <Badge
                              key={i}
                              bg=""
                              style={{
                                backgroundColor: GRADES[g]?.color,
                                color: '#fff',
                                minWidth: 22,
                                fontSize: '0.7rem',
                              }}
                              title={filmTitles[v.appearances[i]?.filmIndex] || ''}
                            >
                              {g}
                            </Badge>
                          ))}
                        </div>
                      </td>
                      <td className="text-end" style={{ fontWeight: 600 }}>
                        {formatRevenue(v.avgRevenue, revenueFormat)}
                      </td>
                      <td className="text-center">
                        <TrendBadge direction={v.direction} />
                      </td>
                    </tr>
                  ))}
                  {filteredVenues.length === 0 && (
                    <tr>
                      <td colSpan={7} className="text-center py-4" style={{ color: theme.textMuted }}>
                        No venues match filters
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </Tab>

          {/* ─── Chain Trends ─── */}
          <Tab eventKey="chains" title={<><Icon name="business" size={16} className="me-1" /> Chains</>}>
            {chainTrends.length === 0 ? (
              <div className="text-center py-4" style={{ color: theme.textMuted }}>
                Not enough chain data across films
              </div>
            ) : (
              <>
                <div className="mb-3" style={{ height: 250 }}>
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={chainTrends.slice(0, 15)} layout="vertical" margin={{ left: 120, right: 20, top: 5, bottom: 5 }}>
                      <XAxis type="number" tickFormatter={v => `£${v.toLocaleString()}`} style={{ fontSize: '0.72rem' }} />
                      <YAxis type="category" dataKey="chain" width={110} style={{ fontSize: '0.72rem' }} />
                      <RTooltip
                        formatter={(v) => [`£${v.toLocaleString()}`, 'Avg Revenue']}
                        contentStyle={{ fontSize: '0.8rem' }}
                      />
                      <Bar dataKey="latestAvgRevenue" radius={[0, 4, 4, 0]}>
                        {chainTrends.slice(0, 15).map((entry, i) => (
                          <Cell key={i} fill={GRADES[entry.latestAvgGrade]?.color || '#95a5a6'} />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>

                <div className="table-responsive" style={{ fontSize: '0.82rem' }}>
                  <table className="table table-sm table-hover align-middle mb-0" style={{ color: theme.text }}>
                    <thead>
                      <tr style={{ borderBottom: `2px solid ${theme.border}` }}>
                        <th>Chain</th>
                        <th className="text-center">Venues</th>
                        <th className="text-center">Avg Grade</th>
                        <th className="text-end">Avg Revenue</th>
                        <th className="text-center">Per Film</th>
                        <th className="text-center">Trend</th>
                      </tr>
                    </thead>
                    <tbody>
                      {chainTrends.map(c => (
                        <tr key={c.chain}>
                          <td><strong>{c.chain}</strong></td>
                          <td className="text-center">{c.perFilm[c.perFilm.length - 1]?.venueCount || 0}</td>
                          <td className="text-center">
                            <Badge bg="" style={{ backgroundColor: GRADES[c.latestAvgGrade]?.color, color: '#fff' }}>
                              {c.latestAvgGrade}
                            </Badge>
                          </td>
                          <td className="text-end" style={{ fontWeight: 600 }}>
                            {formatRevenue(c.latestAvgRevenue, revenueFormat)}
                          </td>
                          <td className="text-center">
                            <div className="d-flex gap-1 justify-content-center">
                              {c.perFilm.map((p, i) => (
                                <Badge
                                  key={i}
                                  bg=""
                                  style={{
                                    backgroundColor: GRADES[p.avgGrade]?.color,
                                    color: '#fff',
                                    fontSize: '0.65rem',
                                  }}
                                  title={p.filmTitle}
                                >
                                  {p.avgGrade}
                                </Badge>
                              ))}
                            </div>
                          </td>
                          <td className="text-center"><TrendBadge direction={c.direction} /></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </>
            )}
          </Tab>

          {/* ─── Regional Trends ─── */}
          <Tab eventKey="regions" title={<><Icon name="map" size={16} className="me-1" /> Regions</>}>
            {regionalTrends.length === 0 ? (
              <div className="text-center py-4" style={{ color: theme.textMuted }}>
                Not enough regional data across films
              </div>
            ) : (
              <>
                <div className="mb-3" style={{ height: 220 }}>
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={regionalTrends} margin={{ left: 10, right: 20, top: 5, bottom: 5 }}>
                      <XAxis dataKey="region" style={{ fontSize: '0.68rem' }} angle={-20} textAnchor="end" height={60} />
                      <YAxis tickFormatter={v => `£${v.toLocaleString()}`} style={{ fontSize: '0.72rem' }} />
                      <RTooltip
                        formatter={(v) => [`£${v.toLocaleString()}`, 'Avg Revenue']}
                        contentStyle={{ fontSize: '0.8rem' }}
                      />
                      <Bar dataKey="latestAvgRevenue" radius={[4, 4, 0, 0]}>
                        {regionalTrends.map((entry, i) => (
                          <Cell key={i} fill={GRADES[entry.latestAvgGrade]?.color || '#95a5a6'} />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>

                <div className="table-responsive" style={{ fontSize: '0.82rem' }}>
                  <table className="table table-sm table-hover align-middle mb-0" style={{ color: theme.text }}>
                    <thead>
                      <tr style={{ borderBottom: `2px solid ${theme.border}` }}>
                        <th>Region</th>
                        <th className="text-center">Venues</th>
                        <th className="text-center">Avg Grade</th>
                        <th className="text-end">Avg Revenue</th>
                        <th className="text-center">Per Film</th>
                        <th className="text-center">Trend</th>
                      </tr>
                    </thead>
                    <tbody>
                      {regionalTrends.map(r => (
                        <tr key={r.region}>
                          <td><strong>{r.region}</strong></td>
                          <td className="text-center">{r.perFilm[r.perFilm.length - 1]?.venueCount || 0}</td>
                          <td className="text-center">
                            <Badge bg="" style={{ backgroundColor: GRADES[r.latestAvgGrade]?.color, color: '#fff' }}>
                              {r.latestAvgGrade}
                            </Badge>
                          </td>
                          <td className="text-end" style={{ fontWeight: 600 }}>
                            {formatRevenue(r.latestAvgRevenue, revenueFormat)}
                          </td>
                          <td className="text-center">
                            <div className="d-flex gap-1 justify-content-center">
                              {r.perFilm.map((p, i) => (
                                <Badge
                                  key={i}
                                  bg=""
                                  style={{
                                    backgroundColor: GRADES[p.avgGrade]?.color,
                                    color: '#fff',
                                    fontSize: '0.65rem',
                                  }}
                                  title={p.filmTitle}
                                >
                                  {p.avgGrade}
                                </Badge>
                              ))}
                            </div>
                          </td>
                          <td className="text-center"><TrendBadge direction={r.direction} /></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </>
            )}
          </Tab>

          {/* ─── AI Insights ─── */}
          <Tab eventKey="ai" title={<><Icon name="auto_awesome" size={16} className="me-1" /> AI Insights</>}>
            <div className="p-3">
              {!apiKey ? (
                <div className="text-center py-4" style={{ color: theme.textMuted }}>
                  <Icon name="key" size={40} />
                  <p className="mt-3">Add your Anthropic API key in <strong>Settings</strong> to enable AI-powered insights.</p>
                  <p style={{ fontSize: '0.85rem' }}>
                    Claude will analyse your trend data and write a concise report highlighting
                    marketing opportunities, improving venues, and actionable recommendations.
                  </p>
                </div>
              ) : (
                <>
                  <div className="d-flex align-items-center gap-2 mb-3">
                    <Button
                      variant="primary"
                      size="sm"
                      onClick={handleGenerateReport}
                      disabled={aiLoading}
                    >
                      {aiLoading ? (
                        <><Spinner animation="border" size="sm" className="me-1" /> Analysing...</>
                      ) : (
                        <><Icon name="auto_awesome" size={16} className="me-1" /> Generate Report</>
                      )}
                    </Button>
                    {aiReport && !aiLoading && (
                      <Button
                        variant="outline-secondary"
                        size="sm"
                        onClick={() => navigator.clipboard.writeText(aiReport)}
                        style={{ color: theme.text, borderColor: theme.border }}
                      >
                        <Icon name="content_copy" size={14} className="me-1" /> Copy
                      </Button>
                    )}
                    <small style={{ color: theme.textMuted }}>
                      Powered by Claude · Uses your API key
                    </small>
                  </div>

                  {aiError && (
                    <div className="alert alert-danger py-2" style={{ fontSize: '0.85rem' }}>
                      <Icon name="error" size={16} className="me-1" /> {aiError}
                    </div>
                  )}

                  {aiReport && (
                    <div
                      className="p-3 rounded"
                      style={{
                        background: theme.surfaceAlt,
                        border: `1px solid ${theme.border}`,
                        fontSize: '0.88rem',
                        lineHeight: 1.65,
                        whiteSpace: 'pre-wrap',
                      }}
                    >
                      {aiReport}
                    </div>
                  )}

                  {!aiReport && !aiLoading && !aiError && (
                    <div className="text-center py-4" style={{ color: theme.textMuted, fontSize: '0.85rem' }}>
                      Click "Generate Report" to get AI-powered insights on your {summary.filmCount} films
                      and {summary.trackedVenues} tracked venues.
                    </div>
                  )}
                </>
              )}
            </div>
          </Tab>

        </Tabs>
      </Modal.Body>

      <Modal.Footer style={{ background: theme.surfaceAlt, borderColor: theme.border }}>
        <div style={{ fontSize: '0.75rem', color: theme.textMuted }}>
          Trends based on {summary.filmCount} films: {filmTitles.join(' → ')}
        </div>
        <Button variant="secondary" size="sm" onClick={onHide}>Close</Button>
      </Modal.Footer>
    </Modal>
  )
}


// ─── Helper Components ────────────────────────────────────────

function SummaryCard({ label, value, color, icon }) {
  return (
    <div
      className="text-center px-3 py-2 rounded flex-fill"
      style={{ border: `2px solid ${color}`, minWidth: 90 }}
    >
      <Icon name={icon} size={18} style={{ color }} />
      <div style={{ fontSize: '1.4rem', fontWeight: 700, color }}>{value}</div>
      <div style={{ fontSize: '0.72rem', color: '#888' }}>{label}</div>
    </div>
  )
}

function TrendBadge({ direction }) {
  const info = DIRECTION_ICONS[direction] || DIRECTION_ICONS.stable
  return (
    <span
      style={{
        color: info.color,
        fontSize: '0.78rem',
        fontWeight: 600,
        display: 'inline-flex',
        alignItems: 'center',
        gap: 2,
      }}
      title={info.label}
    >
      <Icon name={info.icon} size={16} />
    </span>
  )
}
