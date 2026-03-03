// ExportMenu.jsx — v1.9.0
// Chain override for PDF cover, AI insights toggle, generate-first modal
// Drop-in replacement for src/components/ExportMenu.jsx

import { useState } from 'react'
import { Dropdown, Form, Modal, Button } from 'react-bootstrap'
import { useApp } from '../context/AppContext'
import { useTheme } from '../context/ThemeContext'
import Icon from './Icon'

export default function ExportMenu() {
  const {
    filteredVenues,
    selectedFilm,
    selectedFilmId,
    gradeCounts,
    availableChains,
    chainFilter,
    revenueFormat,
    aiReportText,
    aiReportFilmId,
  } = useApp()

  const { theme } = useTheme()

  // ── Local state ──────────────────────────────────────────────
  const [pdfChainOverride, setPdfChainOverride] = useState('')
  const [includeAI, setIncludeAI] = useState(true)
  const [showAIPrompt, setShowAIPrompt] = useState(false)

  // Can we include AI? Only if a report has been generated for the current film
  const canIncludeAI = !!(aiReportText && aiReportFilmId === selectedFilmId)

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
      chainName: pdfChainOverride || chainFilter || '',
      theme,
    })
  }

  // Export PDF without AI (from the modal's secondary button)
  const handlePDFWithoutAI = () => {
    setShowAIPrompt(false)
    setIncludeAI(false)
    // Small delay to let state settle, then trigger export
    setTimeout(async () => {
      const { exportPDF } = await import('../utils/exportUtils')
      exportPDF({
        venues: filteredVenues,
        gradeCounts,
        selectedFilm,
        revenueFormat,
        aiReportText: null,
        chainName: pdfChainOverride || chainFilter || '',
        theme,
      })
    }, 50)
  }

  // ── Build PDF contents description ───────────────────────────
  const pdfContents = [
    'Cover',
    includeAI && canIncludeAI ? 'AI insights' : null,
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
                      (not yet generated)
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
          <p>
            You have opted to include AI insights in the PDF, but they
            haven't been generated yet for this film.
          </p>
          <p className="mb-0">
            Open the <strong>Trends</strong> panel and click{' '}
            <strong>Generate AI Insights</strong> first, then come back to export.
          </p>
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
    </>
  )
}
