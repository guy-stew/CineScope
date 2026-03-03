import React, { useState } from 'react'
import { Dropdown, Form, Modal, Button, Spinner } from 'react-bootstrap'
import { useApp } from '../context/AppContext'
import { exportCSV, exportMapPNG, exportPDF } from '../utils/exportUtils'
import Icon from './Icon'

export default function ExportMenu() {
  const {
    filteredVenues,
    selectedFilm,
    gradeCounts,
    revenueFormat,
    aiReportText,     // Lifted from TrendPanel -> AppContext
  } = useApp()

  const [exporting, setExporting] = useState(null) // 'csv' | 'png' | 'pdf' | null
  const [includeAI, setIncludeAI] = useState(true) // checkbox default
  const [showAIPrompt, setShowAIPrompt] = useState(false) // "generate first" modal

  const filmTitle = selectedFilm?.filmInfo.title || 'All Venues'
  const hasVenues = filteredVenues.length > 0

  // AI insights are only relevant when a film is selected (need trend data)
  const canIncludeAI = !!selectedFilm
  const hasAIReport = !!aiReportText

  const handleCSV = () => {
    try {
      exportCSV(filteredVenues, {
        filmTitle,
        includeGrades: !!selectedFilm,
        revenueFormat,
      })
    } catch (err) {
      console.error('CSV export failed:', err)
    }
  }

  const handlePNG = async () => {
    setExporting('png')
    try {
      await exportMapPNG('.map-wrapper')
    } catch (err) {
      console.error('Map screenshot failed:', err)
    } finally {
      setExporting(null)
    }
  }

  const handlePDF = async () => {
    // If user wants AI insights but they haven't been generated yet, prompt them
    if (includeAI && canIncludeAI && !hasAIReport) {
      setShowAIPrompt(true)
      return
    }

    setExporting('pdf')
    try {
      await exportPDF({
        venues: filteredVenues,
        gradeCounts,
        selectedFilm,
        mapSelector: '.map-wrapper',
        revenueFormat,
        aiReportText: (includeAI && canIncludeAI && hasAIReport) ? aiReportText : null,
      })
    } catch (err) {
      console.error('PDF export failed:', err)
    } finally {
      setExporting(null)
    }
  }

  // Export PDF without AI (from the prompt modal)
  const handlePDFWithoutAI = async () => {
    setShowAIPrompt(false)
    setExporting('pdf')
    try {
      await exportPDF({
        venues: filteredVenues,
        gradeCounts,
        selectedFilm,
        mapSelector: '.map-wrapper',
        revenueFormat,
        aiReportText: null,
      })
    } catch (err) {
      console.error('PDF export failed:', err)
    } finally {
      setExporting(null)
    }
  }

  return (
    <>
      <Dropdown>
        <Dropdown.Toggle
          size="sm"
          variant="outline-light"
          disabled={!hasVenues || !!exporting}
        >
          {exporting ? (
            <>
              <Spinner animation="border" size="sm" className="me-1" />
              Exporting...
            </>
          ) : (
            <><Icon name="download" size={16} className="me-1" /> Export</>
          )}
        </Dropdown.Toggle>

        <Dropdown.Menu align="end" style={{ fontSize: '0.85rem', minWidth: '260px' }}>
          <Dropdown.Header style={{ fontSize: '0.72rem' }}>
            Export {filteredVenues.length} venues
            {selectedFilm && ` \u2014 ${filmTitle}`}
          </Dropdown.Header>

          <Dropdown.Item onClick={handleCSV}>
            <Icon name="table_chart" size={18} className="me-2" />
            CSV Spreadsheet
            <div className="text-muted" style={{ fontSize: '0.72rem' }}>
              Opens in Excel — includes all visible columns
            </div>
          </Dropdown.Item>

          <Dropdown.Item onClick={handlePNG}>
            <Icon name="map" size={18} className="me-2" />
            Map Screenshot (PNG)
            <div className="text-muted" style={{ fontSize: '0.72rem' }}>
              High-res image of the current map view
            </div>
          </Dropdown.Item>

          <Dropdown.Divider />

          {/* AI Insights checkbox — only shown when a film is selected */}
          {canIncludeAI && (
            <div className="px-3 py-1">
              <Form.Check
                type="checkbox"
                id="include-ai-insights"
                label={
                  <span style={{ fontSize: '0.8rem' }}>
                    Include AI Insights
                    {hasAIReport ? (
                      <Icon name="check_circle" size={14} className="ms-1 text-success" />
                    ) : (
                      <span className="text-muted ms-1" style={{ fontSize: '0.7rem' }}>
                        (not yet generated)
                      </span>
                    )}
                  </span>
                }
                checked={includeAI}
                onChange={(e) => setIncludeAI(e.target.checked)}
                style={{ fontSize: '0.8rem' }}
              />
            </div>
          )}

          <Dropdown.Item onClick={handlePDF}>
            <Icon name="picture_as_pdf" size={18} className="me-2" />
            Full PDF Report
            <div className="text-muted" style={{ fontSize: '0.72rem' }}>
              {includeAI && canIncludeAI
                ? 'AI insights + map + grade summary + venue table'
                : 'Map + grade summary + venue table'
              }
            </div>
          </Dropdown.Item>
        </Dropdown.Menu>
      </Dropdown>

      {/* "Generate insights first" prompt modal */}
      <Modal show={showAIPrompt} onHide={() => setShowAIPrompt(false)} centered size="sm">
        <Modal.Header closeButton>
          <Modal.Title style={{ fontSize: '1rem' }}>
            <Icon name="auto_awesome" size={20} className="me-2" />
            AI Insights Not Generated
          </Modal.Title>
        </Modal.Header>
        <Modal.Body style={{ fontSize: '0.85rem' }}>
          <p>
            You've opted to include AI insights in the PDF, but they haven't been generated yet
            for this film.
          </p>
          <p className="mb-0">
            Open the <strong>Trends</strong> panel and click <strong>Generate AI Insights</strong> first,
            then come back to export.
          </p>
        </Modal.Body>
        <Modal.Footer>
          <Button
            variant="outline-secondary"
            size="sm"
            onClick={handlePDFWithoutAI}
          >
            Export without AI
          </Button>
          <Button
            variant="primary"
            size="sm"
            onClick={() => setShowAIPrompt(false)}
          >
            OK, I'll generate first
          </Button>
        </Modal.Footer>
      </Modal>
    </>
  )
}
