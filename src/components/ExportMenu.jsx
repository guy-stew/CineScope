// ExportMenu.jsx — v1.11
// Chain-tailored AI report generation + film list on cover page
// Drop-in replacement for src/components/ExportMenu.jsx
//
// v1.11 changes:
//   - "Generate Chain Report" button when a chain is selected
//   - Streaming modal for chain report generation
//   - AI report tracks chain name (validates film + chain match)
//   - Film titles list passed to PDF for cover page
//   - Report replaces general AI insights when chain-specific

import { useState, useCallback } from 'react'
import { Dropdown, Form, Modal, Button, Spinner, Alert } from 'react-bootstrap'
import { useApp } from '../context/AppContext'
import { useTheme } from '../context/ThemeContext'
import { generateChainAIReport } from '../utils/aiReport'
import Icon from './Icon'

export default function ExportMenu() {
  const {
    filteredVenues,
    venues,           // ← all venues (for network comparison in chain report)
    selectedFilm,
    selectedFilmId,
    importedFilms,    // ← for film title list on cover page
    gradeCounts,
    availableChains,
    chainFilter,
    revenueFormat,
    apiKey,
    aiReportText,
    aiReportFilmId,
    aiReportChainName,  // ← NEW v1.11
    setAiReportText,
    setAiReportFilmId,
    setAiReportChainName, // ← NEW v1.11
  } = useApp()

  const { theme } = useTheme()

  // ── Local state ──────────────────────────────────────────────
  const [pdfChainOverride, setPdfChainOverride] = useState('')
  const [includeAI, setIncludeAI] = useState(true)
  const [showAIPrompt, setShowAIPrompt] = useState(false)

  // Chain report generation state (NEW v1.11)
  const [showChainReportModal, setShowChainReportModal] = useState(false)
  const [chainReportText, setChainReportText] = useState('')
  const [chainReportLoading, setChainReportLoading] = useState(false)
  const [chainReportError, setChainReportError] = useState(null)

  // Effective chain name (override takes precedence over active filter)
  const effectiveChain = pdfChainOverride || chainFilter || ''

  // Can we include AI? Must match current film AND chain
  const canIncludeAI = !!(
    aiReportText &&
    aiReportFilmId === selectedFilmId &&
    (aiReportChainName || '') === effectiveChain
  )

  // ── Build film titles list for cover page ──────────────────
  const filmTitlesList = importedFilms.map(f => f.filmInfo?.title || f.filmInfo?.fileName || 'Untitled')

  // ── Chain Report Generation (NEW v1.11) ────────────────────

  const handleGenerateChainReport = useCallback(async () => {
    if (!effectiveChain || !apiKey || !selectedFilm) return

    setChainReportLoading(true)
    setChainReportError(null)
    setChainReportText('')

    try {
      // Get all venues for this chain (including E-grade)
      const chainVenues = venues.filter(v => v.chain === effectiveChain)

      const fullReport = await generateChainAIReport(
        apiKey,
        effectiveChain,
        chainVenues,
        venues,
        selectedFilm,
        (chunk) => {
          setChainReportText(prev => prev + chunk)
        }
      )

      // Save to shared context (replaces any existing AI report)
      setAiReportText(fullReport)
      setAiReportFilmId(selectedFilmId)
      setAiReportChainName(effectiveChain)
    } catch (err) {
      setChainReportError(err.message)
    } finally {
      setChainReportLoading(false)
    }
  }, [effectiveChain, apiKey, selectedFilm, selectedFilmId, venues, setAiReportText, setAiReportFilmId, setAiReportChainName])

  // ── Handlers ─────────────────────────────────────────────────

  const handleCSV = async () => {
    const { exportCSV } = await import('../utils/exportUtils')
    const filmTitle = selectedFilm?.filmInfo?.title || 'All Venues'
    exportCSV(filteredVenues, { filmTitle, revenueFormat })
  }

  const handlePNG = async () => {
    const { exportMapPNG } = await import('../utils/exportUtils')
    exportMapPNG()
  }

  const handlePDF = async () => {
    // If user wants AI but hasn't generated it yet, show prompt
    if (includeAI && !canIncludeAI) {
      setShowAIPrompt(true)
      return
    }

    const { exportPDF } = await import('../utils/exportUtils')
    exportPDF({
      venues: filteredVenues,
      gradeCounts,
      selectedFilm,
      revenueFormat,
      aiReportText: (includeAI && canIncludeAI) ? aiReportText : null,
      chainName: effectiveChain,
      filmTitlesList,  // ← NEW v1.11: individual film titles for cover page
      theme,
    })
  }

  // Export PDF without AI (from the modal's secondary button)
  const handlePDFWithoutAI = () => {
    setShowAIPrompt(false)
    setIncludeAI(false)
    setTimeout(async () => {
      const { exportPDF } = await import('../utils/exportUtils')
      exportPDF({
        venues: filteredVenues,
        gradeCounts,
        selectedFilm,
        revenueFormat,
        aiReportText: null,
        chainName: effectiveChain,
        filmTitlesList,
        theme,
      })
    }, 50)
  }

  // ── Build PDF contents description ───────────────────────────
  const pdfContents = [
    'Cover',
    includeAI && canIncludeAI ? (effectiveChain ? `${effectiveChain} AI report` : 'AI insights') : null,
    'map',
    'venue list',
  ].filter(Boolean).join(' + ')

  // ── Render ───────────────────────────────────────────────────
  return (
    <>
      <Dropdown align="end">
        <Dropdown.Toggle
          variant={theme === 'dark' ? 'outline-light' : 'outline-secondary'}
          size="sm"
          className="d-flex align-items-center gap-1"
        >
          <Icon name="download" size={16} />
          <span style={{ fontSize: '0.78rem' }}>Export</span>
        </Dropdown.Toggle>

        <Dropdown.Menu style={{ minWidth: 280, fontSize: '0.85rem' }}>

          {/* ── Quick exports ─────────────────────────── */}
          <Dropdown.Header style={{ fontSize: '0.72rem', fontWeight: 700 }}>
            Quick Export
          </Dropdown.Header>

          <Dropdown.Item onClick={handleCSV}>
            <Icon name="table_chart" size={18} className="me-2" />
            CSV Spreadsheet
          </Dropdown.Item>

          <Dropdown.Item onClick={handlePNG}>
            <Icon name="image" size={18} className="me-2" />
            Map Screenshot (PNG)
          </Dropdown.Item>

          <Dropdown.Divider />

          {/* ── PDF report options ────────────────────── */}
          <Dropdown.Header style={{ fontSize: '0.72rem', fontWeight: 700 }}>
            PDF Report Options
          </Dropdown.Header>

          {/* AI insights toggle */}
          <div className="px-3 py-1">
            <Form.Check
              type="switch"
              id="include-ai-toggle"
              label={
                <span style={{ fontSize: '0.78rem' }}>
                  Include AI insights
                  {!canIncludeAI && includeAI && (
                    <span className="text-warning ms-1" style={{ fontSize: '0.68rem' }}>
                      (not yet generated{effectiveChain ? ` for ${effectiveChain}` : ''})
                    </span>
                  )}
                </span>
              }
              checked={includeAI}
              onChange={(e) => setIncludeAI(e.target.checked)}
              style={{ fontSize: '0.78rem' }}
            />
          </div>

          {/* Chain on cover selector */}
          <div className="px-3 py-1">
            <Form.Label style={{ fontSize: '0.75rem', marginBottom: 2, color: '#888' }}>
              Chain on cover
              {chainFilter && !pdfChainOverride && (
                <span className="text-muted ms-1" style={{ fontSize: '0.68rem' }}>
                  (using active filter)
                </span>
              )}
            </Form.Label>
            <Form.Select
              size="sm"
              value={pdfChainOverride}
              onChange={(e) => setPdfChainOverride(e.target.value)}
              style={{ fontSize: '0.78rem' }}
            >
              <option value="">
                {chainFilter
                  ? `Active filter: ${chainFilter}`
                  : 'All chains (no cover name)'}
              </option>
              {availableChains.map(c => (
                <option key={c} value={c}>{c}</option>
              ))}
            </Form.Select>
          </div>

          {/* ── NEW v1.11: Generate Chain Report button ─── */}
          {effectiveChain && selectedFilm && apiKey && (
            <div className="px-3 py-1">
              <Button
                variant="outline-primary"
                size="sm"
                className="w-100 d-flex align-items-center justify-content-center gap-1"
                style={{ fontSize: '0.78rem' }}
                onClick={() => {
                  setShowChainReportModal(true)
                  // Auto-start generation
                  setTimeout(() => handleGenerateChainReport(), 100)
                }}
              >
                <Icon name="auto_awesome" size={14} />
                Generate {effectiveChain} Report
              </Button>
              {canIncludeAI && (
                <div className="text-success mt-1" style={{ fontSize: '0.68rem' }}>
                  <Icon name="check_circle" size={12} className="me-1" />
                  {effectiveChain} report ready
                </div>
              )}
            </div>
          )}

          {/* Show hint if no API key but chain selected */}
          {effectiveChain && selectedFilm && !apiKey && (
            <div className="px-3 py-1">
              <div className="text-muted" style={{ fontSize: '0.7rem' }}>
                <Icon name="key" size={12} className="me-1" />
                Add API key in Settings to generate chain reports
              </div>
            </div>
          )}

          {/* PDF export button */}
          <Dropdown.Item onClick={handlePDF} className="mt-1">
            <Icon name="picture_as_pdf" size={18} className="me-2" />
            Full PDF Report
            <div className="text-muted" style={{ fontSize: '0.72rem' }}>
              {pdfContents}
            </div>
          </Dropdown.Item>
        </Dropdown.Menu>
      </Dropdown>

      {/* ── "Generate insights first" modal ──────────── */}
      <Modal show={showAIPrompt} onHide={() => setShowAIPrompt(false)} centered size="sm">
        <Modal.Header closeButton>
          <Modal.Title style={{ fontSize: '1rem' }}>
            <Icon name="auto_awesome" size={20} className="me-2" />
            AI Insights Not Generated
          </Modal.Title>
        </Modal.Header>
        <Modal.Body style={{ fontSize: '0.85rem' }}>
          {effectiveChain ? (
            <>
              <p>
                You have opted to include AI insights, but a report hasn't been
                generated yet for <strong>{effectiveChain}</strong> on this film.
              </p>
              <p className="mb-0">
                Use the <strong>"Generate {effectiveChain} Report"</strong> button
                in the Export menu, then come back to export.
              </p>
            </>
          ) : (
            <>
              <p>
                You have opted to include AI insights in the PDF, but they
                haven't been generated yet for this film.
              </p>
              <p className="mb-0">
                Open the <strong>Trends</strong> panel and click{' '}
                <strong>Generate AI Insights</strong> first, then come back to export.
              </p>
            </>
          )}
        </Modal.Body>
        <Modal.Footer>
          <Button variant="outline-secondary" size="sm" onClick={handlePDFWithoutAI}>
            Export without AI
          </Button>
          <Button variant="primary" size="sm" onClick={() => setShowAIPrompt(false)}>
            OK, I'll generate first
          </Button>
        </Modal.Footer>
      </Modal>

      {/* ── NEW v1.11: Chain Report Generation Modal ─── */}
      <Modal
        show={showChainReportModal}
        onHide={() => { if (!chainReportLoading) setShowChainReportModal(false) }}
        centered
        size="lg"
      >
        <Modal.Header
          closeButton
          style={{ background: 'var(--cs-header, #1a365d)', color: 'white' }}
        >
          <Modal.Title style={{ fontSize: '1rem' }}>
            <Icon name="auto_awesome" size={20} className="me-2" />
            {effectiveChain} — AI Performance Report
          </Modal.Title>
        </Modal.Header>
        <Modal.Body style={{ maxHeight: '60vh', overflowY: 'auto' }}>

          {chainReportError && (
            <Alert variant="danger" className="py-2" style={{ fontSize: '0.85rem' }}>
              <Icon name="error" size={16} className="me-1" /> {String(chainReportError)}
            </Alert>
          )}

          {chainReportLoading && !chainReportText && (
            <div className="text-center py-4 text-muted">
              <Spinner animation="border" size="sm" className="me-2" />
              Generating {effectiveChain} performance analysis...
            </div>
          )}

          {chainReportText && (
            <div
              className="p-3 rounded"
              style={{
                background: '#f8f9fa',
                border: '1px solid #dee2e6',
                fontSize: '0.88rem',
                lineHeight: 1.65,
                whiteSpace: 'pre-wrap',
              }}
            >
              {chainReportText}
              {chainReportLoading && (
                <span className="text-muted">
                  <Spinner animation="border" size="sm" style={{ width: 10, height: 10 }} />
                </span>
              )}
            </div>
          )}

          {!chainReportText && !chainReportLoading && !chainReportError && (
            <div className="text-center py-4 text-muted" style={{ fontSize: '0.85rem' }}>
              Click below to generate a tailored report for {effectiveChain}.
            </div>
          )}
        </Modal.Body>
        <Modal.Footer>
          <div className="d-flex w-100 justify-content-between align-items-center">
            <small className="text-muted">Powered by Claude</small>
            <div className="d-flex gap-2">
              {chainReportText && !chainReportLoading && (
                <Button
                  variant="outline-secondary"
                  size="sm"
                  onClick={() => navigator.clipboard.writeText(chainReportText)}
                >
                  <Icon name="content_copy" size={14} className="me-1" /> Copy
                </Button>
              )}
              {!chainReportLoading && !chainReportText && (
                <Button
                  variant="primary"
                  size="sm"
                  onClick={handleGenerateChainReport}
                >
                  <Icon name="auto_awesome" size={14} className="me-1" />
                  Generate Report
                </Button>
              )}
              {chainReportText && !chainReportLoading && (
                <Button
                  variant="outline-primary"
                  size="sm"
                  onClick={handleGenerateChainReport}
                >
                  <Icon name="refresh" size={14} className="me-1" /> Regenerate
                </Button>
              )}
              <Button
                variant="secondary"
                size="sm"
                onClick={() => setShowChainReportModal(false)}
                disabled={chainReportLoading}
              >
                {canIncludeAI ? 'Done' : 'Close'}
              </Button>
            </div>
          </div>
        </Modal.Footer>
      </Modal>
    </>
  )
}
