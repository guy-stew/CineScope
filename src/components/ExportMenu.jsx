import React, { useState } from 'react'
import { Dropdown, Spinner } from 'react-bootstrap'
import { useApp } from '../context/AppContext'
import { exportCSV, exportMapPNG, exportPDF } from '../utils/exportUtils'
import Icon from './Icon'

export default function ExportMenu() {
  const { filteredVenues, selectedFilm, gradeCounts } = useApp()
  const [exporting, setExporting] = useState(null) // 'csv' | 'png' | 'pdf' | null

  const filmTitle = selectedFilm?.filmInfo.title || 'All Venues'
  const hasVenues = filteredVenues.length > 0

  const handleCSV = () => {
    try {
      exportCSV(filteredVenues, {
        filmTitle,
        includeGrades: !!selectedFilm,
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
    setExporting('pdf')
    try {
      await exportPDF({
        venues: filteredVenues,
        gradeCounts,
        selectedFilm,
        mapSelector: '.map-wrapper',
      })
    } catch (err) {
      console.error('PDF export failed:', err)
    } finally {
      setExporting(null)
    }
  }

  return (
    <Dropdown>
      <Dropdown.Toggle
        size="sm"
        variant="outline-light"
        disabled={!hasVenues || !!exporting}
      >
        {exporting ? (
          <>
            <Spinner animation="border" size="sm" className="me-1" />
            Exporting…
          </>
        ) : (
          <><Icon name="download" size={16} className="me-1" /> Export</>
        )}
      </Dropdown.Toggle>

      <Dropdown.Menu align="end" style={{ fontSize: '0.85rem' }}>
        <Dropdown.Header style={{ fontSize: '0.72rem' }}>
          Export {filteredVenues.length} venues
          {selectedFilm && ` — ${filmTitle}`}
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

        <Dropdown.Item onClick={handlePDF}>
          <Icon name="picture_as_pdf" size={18} className="me-2" />
          Full PDF Report
          <div className="text-muted" style={{ fontSize: '0.72rem' }}>
            Map + grade summary + venue table
          </div>
        </Dropdown.Item>
      </Dropdown.Menu>
    </Dropdown>
  )
}
