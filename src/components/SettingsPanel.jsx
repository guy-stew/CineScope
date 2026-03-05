import React, { useState, useMemo } from 'react'
import { Modal, Button, Form, Badge, OverlayTrigger, Tooltip } from 'react-bootstrap'
import { BarChart, Bar, XAxis, YAxis, ReferenceLine, ResponsiveContainer, Tooltip as RTooltip } from 'recharts'
import { useApp } from '../context/AppContext'
import { useTheme } from '../context/ThemeContext'
import { GRADES, GRADE_ORDER, DEFAULT_GRADE_SETTINGS, suggestBoundaries, buildHistogram } from '../utils/grades'
import Icon from './Icon'

export default function SettingsPanel() {
  const { showSettings, setShowSettings, gradeSettings, updateGradeSettings, resetGradeSettings, selectedFilm, venues, revenueFormat, updateRevenueFormat, apiKey, updateApiKey } = useApp()
  const { theme } = useTheme()

  // Local draft settings (only applied on "Apply")
  const [draft, setDraft] = useState(gradeSettings)
  const [suggestion, setSuggestion] = useState(null)

  // Reset draft when modal opens
  const handleShow = () => {
    setDraft(gradeSettings)
    setSuggestion(null)
  }

  // Get revenue data for the current film
  const revenues = useMemo(() => {
    if (!selectedFilm) return []
    return venues
      .filter(v => v.revenue != null && v.revenue > 0)
      .map(v => v.revenue)
  }, [venues, selectedFilm])

  // Build histogram data
  const histogramData = useMemo(() => buildHistogram(revenues, 25), [revenues])

  // Calculate what the grade thresholds are in £ for current draft
  const thresholdRevenues = useMemo(() => {
    if (revenues.length === 0) return { A: 0, B: 0, C: 0 }
    if (draft.mode === 'manual_revenue') return draft.revenueThresholds

    const sorted = [...revenues].sort((a, b) => a - b)
    const n = sorted.length
    return {
      A: sorted[Math.floor(n * (draft.percentiles.A / 100))] || 0,
      B: sorted[Math.floor(n * (draft.percentiles.B / 100))] || 0,
      C: sorted[Math.floor(n * (draft.percentiles.C / 100))] || 0,
    }
  }, [revenues, draft])

  // Preview grade counts for draft settings
  const previewCounts = useMemo(() => {
    if (revenues.length === 0) return { A: 0, B: 0, C: 0, D: 0 }
    const counts = { A: 0, B: 0, C: 0, D: 0 }
    for (const rev of revenues) {
      if (rev >= thresholdRevenues.A) counts.A++
      else if (rev >= thresholdRevenues.B) counts.B++
      else if (rev >= thresholdRevenues.C) counts.C++
      else counts.D++
    }
    return counts
  }, [revenues, thresholdRevenues])

  // Run auto-suggest
  const handleAutoSuggest = () => {
    const result = suggestBoundaries(revenues)
    setSuggestion(result)
    setDraft(prev => ({
      ...prev,
      mode: 'manual_percentile',
      percentiles: { ...result.percentiles },
    }))
  }

  // Accept suggestion
  const handleAcceptSuggestion = () => {
    if (!suggestion) return
    setDraft(prev => ({
      ...prev,
      mode: 'manual_percentile',
      percentiles: { ...suggestion.percentiles },
    }))
    setSuggestion(null)
  }

  // Mode change
  const handleModeChange = (mode) => {
    setDraft(prev => ({ ...prev, mode }))
    setSuggestion(null)
  }

  // Percentile slider change
  const handlePercentileChange = (grade, value) => {
    const val = Math.max(1, Math.min(99, parseInt(value) || 0))
    setDraft(prev => ({
      ...prev,
      percentiles: { ...prev.percentiles, [grade]: val },
    }))
  }

  // Revenue threshold change
  const handleRevenueChange = (grade, value) => {
    const val = Math.max(0, parseInt(value) || 0)
    setDraft(prev => ({
      ...prev,
      revenueThresholds: { ...prev.revenueThresholds, [grade]: val },
    }))
  }

  // Apply settings
  const handleApply = () => {
    updateGradeSettings(draft)
    setShowSettings(false)
  }

  // Reset to defaults
  const handleReset = () => {
    setDraft(DEFAULT_GRADE_SETTINGS)
    setSuggestion(null)
  }

  const noFilm = !selectedFilm

  return (
    <Modal
      show={showSettings}
      onHide={() => setShowSettings(false)}
      onShow={handleShow}
      size="lg"
      centered
      contentClassName="border-0"
      style={{ '--bs-modal-bg': theme.surface }}
    >
      <Modal.Header
        closeButton
        style={{
          background: theme.surfaceAlt,
          borderColor: theme.border,
          color: theme.text,
        }}
      >
        <Modal.Title style={{ fontSize: '1.1rem' }}>
          <Icon name="settings" size={20} className="me-1" /> Settings
        </Modal.Title>
      </Modal.Header>

      <Modal.Body style={{ background: theme.surface, color: theme.text }}>
        {/* Revenue Display Format — always available */}
        <div className="mb-4 p-3 rounded" style={{ background: theme.surfaceAlt, border: `1px solid ${theme.border}` }}>
          <Form.Label style={{ fontSize: '0.85rem', fontWeight: 600, color: theme.textMuted }}>
            <Icon name="payments" size={18} className="me-1" /> Revenue Display Format
          </Form.Label>
          <div className="d-flex gap-2 mt-1">
            <Button
              size="sm"
              variant={revenueFormat === 'rounded' ? 'primary' : 'outline-secondary'}
              onClick={() => updateRevenueFormat('rounded')}
              style={revenueFormat !== 'rounded' ? { color: theme.text, borderColor: theme.border } : {}}
            >
              Whole Pounds (£346)
            </Button>
            <Button
              size="sm"
              variant={revenueFormat === 'decimal' ? 'primary' : 'outline-secondary'}
              onClick={() => updateRevenueFormat('decimal')}
              style={revenueFormat !== 'decimal' ? { color: theme.text, borderColor: theme.border } : {}}
            >
              Two Decimals (£345.67)
            </Button>
          </div>
          <div style={{ fontSize: '0.75rem', color: theme.textMuted, marginTop: 6 }}>
            Applies to all revenue figures across the map, tables, and exports.
          </div>
        </div>

        {/* Anthropic API Key — for AI Insights */}
        <div className="mb-4 p-3 rounded" style={{ background: theme.surfaceAlt, border: `1px solid ${theme.border}` }}>
          <Form.Label style={{ fontSize: '0.85rem', fontWeight: 600, color: theme.textMuted }}>
            <Icon name="auto_awesome" size={18} className="me-1" /> AI Insights — Anthropic API Key
          </Form.Label>
          <Form.Control
            size="sm"
            type="password"
            placeholder="sk-ant-..."
            value={apiKey}
            onChange={e => updateApiKey(e.target.value)}
            style={{
              backgroundColor: theme.inputBg,
              borderColor: theme.inputBorder,
              color: theme.inputText,
              fontFamily: 'monospace',
              fontSize: '0.82rem',
            }}
          />
          <div style={{ fontSize: '0.75rem', color: theme.textMuted, marginTop: 6 }}>
            {apiKey ? (
              <span style={{ color: '#27ae60' }}>
                <Icon name="check_circle" size={14} className="me-1" />
                Key saved — used for AI-powered trend reports. Stored securely on the server.
              </span>
            ) : (
              <>
                Optional. Get a key from{' '}
                <a href="https://console.anthropic.com/" target="_blank" rel="noopener noreferrer" style={{ color: theme.link || '#0d6efd' }}>
                  console.anthropic.com
                </a>
                {' '}to enable AI-generated trend insights. Your key is stored securely on the server and never exposed in the browser.
              </>
            )}
          </div>
        </div>

        {noFilm ? (
          <div className="text-center py-4" style={{ color: theme.textMuted }}>
            <div style={{ marginBottom: 8 }}><Icon name="bar_chart" size={40} /></div>
            <p>Import a Comscore file first to configure grade boundaries.</p>
            <p style={{ fontSize: '0.85rem' }}>
              The settings panel needs revenue data to show the distribution histogram
              and calculate boundary previews.
            </p>
          </div>
        ) : (
          <>
            {/* Mode selector */}
            <div className="mb-3">
              <Form.Label style={{ fontSize: '0.85rem', fontWeight: 600, color: theme.textMuted }}>
                Grading Mode
              </Form.Label>
              <div className="d-flex gap-2">
                {[
                  { key: 'quartiles', label: 'Equal Quartiles', tip: 'Each grade = 25% of venues' },
                  { key: 'manual_percentile', label: 'Custom Percentiles', tip: 'Set your own percentile splits' },
                  { key: 'manual_revenue', label: 'Fixed Revenue', tip: 'Grade by specific £ thresholds' },
                ].map(({ key, label, tip }) => (
                  <OverlayTrigger key={key} placement="top" overlay={<Tooltip>{tip}</Tooltip>}>
                    <Button
                      size="sm"
                      variant={draft.mode === key ? 'primary' : 'outline-secondary'}
                      onClick={() => handleModeChange(key)}
                      style={draft.mode !== key ? { color: theme.text, borderColor: theme.border } : {}}
                    >
                      {label}
                    </Button>
                  </OverlayTrigger>
                ))}
              </div>
            </div>

            {/* Revenue Histogram */}
            {histogramData.length > 0 && (
              <div className="mb-3 p-2 rounded" style={{ background: theme.surfaceAlt, border: `1px solid ${theme.border}` }}>
                <div style={{ fontSize: '0.78rem', fontWeight: 600, color: theme.textMuted, marginBottom: 4 }}>
                  Revenue Distribution ({revenues.length} venues)
                </div>
                <ResponsiveContainer width="100%" height={140}>
                  <BarChart data={histogramData} margin={{ top: 5, right: 10, left: 0, bottom: 0 }}>
                    <XAxis
                      dataKey="midpoint"
                      tick={{ fontSize: 9, fill: theme.textMuted }}
                      tickFormatter={v => `£${(v / 1000).toFixed(0)}k`}
                      interval="preserveStartEnd"
                    />
                    <YAxis tick={{ fontSize: 9, fill: theme.textMuted }} width={30} />
                    <RTooltip
                      contentStyle={{ background: theme.surface, border: `1px solid ${theme.border}`, fontSize: '0.8rem' }}
                      formatter={(value) => [value, 'Venues']}
                      labelFormatter={(v) => `£${v.toLocaleString()}`}
                    />
                    <Bar dataKey="count" fill="#2E75B6" radius={[2, 2, 0, 0]} />

                    {/* Grade boundary lines */}
                    <ReferenceLine x={thresholdRevenues.C} stroke={GRADES.C.color} strokeWidth={2} strokeDasharray="4 2" label={{ value: 'C', fill: GRADES.C.color, fontSize: 11, fontWeight: 700 }} />
                    <ReferenceLine x={thresholdRevenues.B} stroke={GRADES.B.color} strokeWidth={2} strokeDasharray="4 2" label={{ value: 'B', fill: GRADES.B.color, fontSize: 11, fontWeight: 700 }} />
                    <ReferenceLine x={thresholdRevenues.A} stroke={GRADES.A.color} strokeWidth={2} strokeDasharray="4 2" label={{ value: 'A', fill: GRADES.A.color, fontSize: 11, fontWeight: 700 }} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )}

            {/* Auto-suggest button */}
            {(draft.mode === 'quartiles' || draft.mode === 'manual_percentile') && (
              <div className="mb-3">
                <Button
                  size="sm"
                  variant="outline-info"
                  onClick={handleAutoSuggest}
                  style={{ fontSize: '0.82rem' }}
                >
                  🔍 Auto-Suggest Boundaries
                </Button>
                {suggestion && (
                  <div
                    className="mt-2 p-2 rounded"
                    style={{ background: theme.surfaceAlt, border: `1px solid ${theme.border}`, fontSize: '0.82rem' }}
                  >
                    <div style={{ color: theme.text, fontWeight: 600, marginBottom: 4 }}>
                      💡 Suggestion Applied
                    </div>
                    <div style={{ color: theme.textMuted }}>{suggestion.description}</div>
                    <div className="mt-1" style={{ color: theme.textMuted, fontSize: '0.78rem' }}>
                      A ≥ P{suggestion.percentiles.A} · B ≥ P{suggestion.percentiles.B} · C ≥ P{suggestion.percentiles.C}
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Percentile sliders (for quartiles and manual_percentile modes) */}
            {(draft.mode === 'quartiles' || draft.mode === 'manual_percentile') && (
              <div className="mb-3">
                <Form.Label style={{ fontSize: '0.85rem', fontWeight: 600, color: theme.textMuted }}>
                  Percentile Thresholds
                  {draft.mode === 'quartiles' && (
                    <span style={{ fontWeight: 400, fontSize: '0.78rem', marginLeft: 8 }}>
                      (locked at 25% each in Quartile mode)
                    </span>
                  )}
                </Form.Label>
                {['C', 'B', 'A'].map(grade => (
                  <div key={grade} className="d-flex align-items-center gap-2 mb-2">
                    <Badge bg=""
                      style={{
                        backgroundColor: GRADES[grade].color,
                        color: '#fff',
                        minWidth: 28,
                      }}
                    >
                      {grade}
                    </Badge>
                    <span style={{ fontSize: '0.78rem', color: theme.textMuted, width: 20 }}>≥</span>
                    <Form.Range
                      min={1}
                      max={99}
                      value={draft.percentiles[grade]}
                      onChange={e => handlePercentileChange(grade, e.target.value)}
                      disabled={draft.mode === 'quartiles'}
                      style={{ flex: 1 }}
                    />
                    <span style={{
                      fontSize: '0.82rem',
                      fontWeight: 600,
                      color: theme.text,
                      minWidth: 40,
                      textAlign: 'right',
                    }}>
                      P{draft.percentiles[grade]}
                    </span>
                    <span style={{
                      fontSize: '0.75rem',
                      color: theme.textMuted,
                      minWidth: 70,
                      textAlign: 'right',
                    }}>
                      ≥ £{Math.round(thresholdRevenues[grade]).toLocaleString()}
                    </span>
                  </div>
                ))}
              </div>
            )}

            {/* Revenue threshold inputs (for manual_revenue mode) */}
            {draft.mode === 'manual_revenue' && (
              <div className="mb-3">
                <Form.Label style={{ fontSize: '0.85rem', fontWeight: 600, color: theme.textMuted }}>
                  Revenue Thresholds (£)
                </Form.Label>
                {['C', 'B', 'A'].map(grade => (
                  <div key={grade} className="d-flex align-items-center gap-2 mb-2">
                    <Badge bg=""
                      style={{
                        backgroundColor: GRADES[grade].color,
                        color: '#fff',
                        minWidth: 28,
                      }}
                    >
                      {grade}
                    </Badge>
                    <span style={{ fontSize: '0.78rem', color: theme.textMuted }}>≥ £</span>
                    <Form.Control
                      size="sm"
                      type="number"
                      min={0}
                      value={draft.revenueThresholds[grade]}
                      onChange={e => handleRevenueChange(grade, e.target.value)}
                      style={{
                        width: 120,
                        backgroundColor: theme.inputBg,
                        borderColor: theme.inputBorder,
                        color: theme.inputText,
                      }}
                    />
                  </div>
                ))}
              </div>
            )}

            {/* Preview grade counts */}
            <div className="p-2 rounded" style={{ background: theme.surfaceAlt, border: `1px solid ${theme.border}` }}>
              <div style={{ fontSize: '0.78rem', fontWeight: 600, color: theme.textMuted, marginBottom: 6 }}>
                Preview — Venue Count per Grade
              </div>
              <div className="d-flex gap-2">
                {['A', 'B', 'C', 'D'].map(grade => (
                  <div
                    key={grade}
                    className="flex-fill text-center py-1 rounded"
                    style={{
                      backgroundColor: GRADES[grade].color,
                      opacity: 0.9,
                    }}
                  >
                    <div style={{ fontWeight: 700, fontSize: '0.8rem', color: '#fff' }}>{grade}</div>
                    <div style={{ fontWeight: 800, fontSize: '1.1rem', color: '#fff' }}>{previewCounts[grade]}</div>
                    <div style={{ fontSize: '0.7rem', color: 'rgba(255,255,255,0.8)' }}>
                      {revenues.length > 0 ? Math.round((previewCounts[grade] / revenues.length) * 100) : 0}%
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </>
        )}
      </Modal.Body>

      <Modal.Footer style={{ background: theme.surfaceAlt, borderColor: theme.border }}>
        <Button size="sm" variant="outline-secondary" onClick={handleReset} style={{ color: theme.text, borderColor: theme.border }}>
          Reset to Defaults
        </Button>
        <Button size="sm" variant="outline-secondary" onClick={() => setShowSettings(false)} style={{ color: theme.text, borderColor: theme.border }}>
          Cancel
        </Button>
        <Button size="sm" variant="primary" onClick={handleApply} disabled={noFilm}>
          Apply
        </Button>
      </Modal.Footer>
    </Modal>
  )
}
