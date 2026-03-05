/**
 * CineScope — Venue Import (Spreadsheet Upload)
 *
 * Drag-and-drop .xlsx upload → parse with SheetJS → validate →
 * preview table → batch geocode missing coords → confirm import.
 *
 * Renders inside VenueManager when the import view is active.
 */

import React, { useState, useCallback, useRef, useMemo } from 'react'
import { Button, Badge, Alert, Table, ProgressBar, Spinner, OverlayTrigger, Tooltip } from 'react-bootstrap'
import { useAuth } from '@clerk/clerk-react'
import { useTheme } from '../context/ThemeContext'
import Icon from './Icon'
import { geocodeBatch } from '../utils/geocoder'
import * as venueApi from '../utils/venueApi'
import * as XLSX from 'xlsx'

// Expected column headers (case-insensitive match)
const EXPECTED_COLUMNS = {
  'venue name': 'name',
  'comscore name': 'comscore_name',
  'city': 'city',
  'country': 'country',
  'chain': 'chain',
  'category': 'category',
  'address': 'address',
  'postcode': 'postcode',
  'latitude': 'lat',
  'longitude': 'lng',
  'status': 'status',
  'notes': 'notes',
}

const REQUIRED_FIELDS = ['name', 'comscore_name', 'city', 'country', 'category']

const VALID_COUNTRIES = ['united kingdom', 'ireland']
const VALID_CATEGORIES = ['large chain', 'small chain', 'independent']
const VALID_STATUSES = ['open', 'closed']

const TEMPLATE_PATH = '/data/CineScope_Venue_Import_Template.xlsx'


/**
 * Validate a single parsed row. Returns array of error strings.
 */
function validateRow(row) {
  const errors = []

  // Required fields
  for (const field of REQUIRED_FIELDS) {
    if (!row[field]?.toString().trim()) {
      const label = Object.entries(EXPECTED_COLUMNS).find(([, v]) => v === field)?.[0] || field
      errors.push(`Missing ${label}`)
    }
  }

  // Country validation
  if (row.country && !VALID_COUNTRIES.includes(row.country.toString().toLowerCase().trim())) {
    errors.push('Country must be "United Kingdom" or "Ireland"')
  }

  // Category validation
  if (row.category && !VALID_CATEGORIES.includes(row.category.toString().toLowerCase().trim())) {
    errors.push('Category must be "Large Chain", "Small Chain", or "Independent"')
  }

  // Status validation
  if (row.status && !VALID_STATUSES.includes(row.status.toString().toLowerCase().trim())) {
    errors.push('Status must be "Open" or "Closed"')
  }

  // Lat/lng validation
  if (row.lat && isNaN(parseFloat(row.lat))) errors.push('Invalid latitude')
  if (row.lng && isNaN(parseFloat(row.lng))) errors.push('Invalid longitude')
  if (row.lat && !row.lng) errors.push('Longitude required with latitude')
  if (row.lng && !row.lat) errors.push('Latitude required with longitude')

  return errors
}


export default function VenueImport({ existingVenues, onImportComplete, onCancel }) {
  const { getToken } = useAuth()
  const { theme } = useTheme()
  const fileInputRef = useRef(null)
  const abortRef = useRef(null)

  // ── State machine: 'upload' → 'preview' → 'geocoding' → 'importing' → 'done' ──
  const [stage, setStage] = useState('upload')
  const [parsedRows, setParsedRows] = useState([])
  const [parseError, setParseError] = useState(null)
  const [dragActive, setDragActive] = useState(false)

  // Geocoding progress
  const [geocodeProgress, setGeocodeProgress] = useState({ completed: 0, total: 0 })

  // Import progress
  const [importError, setImportError] = useState(null)
  const [importResult, setImportResult] = useState(null)


  // ═══════════════════════════════════════════════════════════════
  // FILE PARSING
  // ═══════════════════════════════════════════════════════════════

  const parseFile = useCallback((file) => {
    setParseError(null)

    if (!file.name.match(/\.xlsx?$/i)) {
      setParseError('Please upload an .xlsx file. Download the template if you need the correct format.')
      return
    }

    const reader = new FileReader()
    reader.onload = (e) => {
      try {
        const data = new Uint8Array(e.target.result)
        const workbook = XLSX.read(data, { type: 'array' })

        // Read the first sheet (or 'Venue Import' if it exists)
        const sheetName = workbook.SheetNames.includes('Venue Import')
          ? 'Venue Import'
          : workbook.SheetNames[0]
        const sheet = workbook.Sheets[sheetName]
        const rawRows = XLSX.utils.sheet_to_json(sheet, { defval: '' })

        if (rawRows.length === 0) {
          setParseError('The spreadsheet appears to be empty. Make sure data starts below the header row.')
          return
        }

        // Map column headers to our field names
        const firstRow = rawRows[0]
        const headerMap = {}
        for (const rawHeader of Object.keys(firstRow)) {
          const normalised = rawHeader.toString().toLowerCase().trim()
          if (EXPECTED_COLUMNS[normalised]) {
            headerMap[rawHeader] = EXPECTED_COLUMNS[normalised]
          }
        }

        // Check we found the essential columns
        const mappedFields = new Set(Object.values(headerMap))
        const missingRequired = REQUIRED_FIELDS.filter(f => !mappedFields.has(f))
        if (missingRequired.length > 0) {
          const labels = missingRequired.map(f =>
            Object.entries(EXPECTED_COLUMNS).find(([, v]) => v === f)?.[0] || f
          )
          setParseError(`Missing required columns: ${labels.join(', ')}. Download the template to see the expected format.`)
          return
        }

        // Transform rows
        const rows = rawRows
          .map((raw, idx) => {
            const row = { _rowNum: idx + 1 }
            for (const [rawHeader, field] of Object.entries(headerMap)) {
              row[field] = raw[rawHeader]?.toString().trim() || ''
            }
            return row
          })
          // Skip the "Required/Optional" indicator row if present
          .filter(row => {
            const nameVal = (row.name || '').toLowerCase()
            return nameVal !== 'required' && nameVal !== 'optional' && nameVal !== ''
          })
          // Skip example rows
          .filter(row => {
            const notes = (row.notes || '').toLowerCase()
            return !notes.includes('example row')
          })

        if (rows.length === 0) {
          setParseError('No data rows found after filtering headers and example rows. Make sure you\'ve added your venue data.')
          return
        }

        // Validate each row
        const validated = rows.map(row => {
          const errors = validateRow(row)

          // Check for duplicates within the import
          const dupeInFile = rows.filter(r =>
            r !== row &&
            r.name?.toLowerCase() === row.name?.toLowerCase() &&
            r.city?.toLowerCase() === row.city?.toLowerCase()
          ).length > 0

          // Check for duplicates against existing venues
          const dupeInDb = existingVenues?.some(v =>
            v.name?.toLowerCase() === row.name?.toLowerCase() &&
            v.city?.toLowerCase() === row.city?.toLowerCase()
          )

          // Coordinate status
          const hasCoords = row.lat && row.lng && !isNaN(parseFloat(row.lat)) && !isNaN(parseFloat(row.lng))
          const canGeocode = !hasCoords && (row.address || row.postcode)

          return {
            ...row,
            lat: hasCoords ? parseFloat(row.lat) : null,
            lng: hasCoords ? parseFloat(row.lng) : null,
            _errors: errors,
            _warnings: [
              ...(dupeInFile ? ['Duplicate in this file'] : []),
              ...(dupeInDb ? ['Already exists in database'] : []),
              ...(canGeocode ? ['Will attempt geocoding'] : []),
              ...(!hasCoords && !canGeocode ? ['No coordinates and no address for geocoding'] : []),
            ],
            _hasCoords: hasCoords,
            _canGeocode: canGeocode,
            _isValid: errors.length === 0,
            _selected: errors.length === 0, // Pre-select valid rows
          }
        })

        setParsedRows(validated)
        setStage('preview')
      } catch (err) {
        console.error('Parse error:', err)
        setParseError(`Failed to parse file: ${err.message}`)
      }
    }
    reader.readAsArrayBuffer(file)
  }, [existingVenues])

  const handleFileDrop = useCallback((e) => {
    e.preventDefault()
    setDragActive(false)
    const file = e.dataTransfer?.files?.[0]
    if (file) parseFile(file)
  }, [parseFile])

  const handleFileSelect = useCallback((e) => {
    const file = e.target.files?.[0]
    if (file) parseFile(file)
    e.target.value = ''
  }, [parseFile])

  const toggleRow = (idx) => {
    setParsedRows(prev => prev.map((r, i) =>
      i === idx ? { ...r, _selected: !r._selected } : r
    ))
  }

  const toggleAll = () => {
    const allSelected = selectedRows.length === validRows.length
    setParsedRows(prev => prev.map(r =>
      r._isValid ? { ...r, _selected: !allSelected } : r
    ))
  }


  // ═══════════════════════════════════════════════════════════════
  // DERIVED DATA
  // ═══════════════════════════════════════════════════════════════

  const validRows = useMemo(() => parsedRows.filter(r => r._isValid), [parsedRows])
  const invalidRows = useMemo(() => parsedRows.filter(r => !r._isValid), [parsedRows])
  const selectedRows = useMemo(() => parsedRows.filter(r => r._selected), [parsedRows])
  const needsGeocoding = useMemo(() => selectedRows.filter(r => r._canGeocode && !r._hasCoords), [selectedRows])


  // ═══════════════════════════════════════════════════════════════
  // GEOCODING
  // ═══════════════════════════════════════════════════════════════

  const startGeocoding = useCallback(async () => {
    if (needsGeocoding.length === 0) {
      // Skip straight to import
      doImport()
      return
    }

    setStage('geocoding')
    setGeocodeProgress({ completed: 0, total: needsGeocoding.length })

    const controller = new AbortController()
    abortRef.current = controller

    await geocodeBatch(needsGeocoding, getToken, {
      signal: controller.signal,
      onProgress: ({ completed, total, current }) => {
        setGeocodeProgress({ completed, total })
        // Update the row in-place
        setParsedRows(prev => prev.map(r => {
          if (r._rowNum === current._rowNum) {
            return {
              ...r,
              lat: current.lat || r.lat,
              lng: current.lng || r.lng,
              _hasCoords: !!(current.lat && current.lng),
              _geocodeStatus: current._geocodeStatus,
              _geocodeDisplay: current._geocodeDisplay,
              _canGeocode: false,
            }
          }
          return r
        }))
      },
    })

    abortRef.current = null
    setStage('preview')
  }, [needsGeocoding, getToken])

  const cancelGeocoding = () => {
    if (abortRef.current) abortRef.current.abort()
    setStage('preview')
  }


  // ═══════════════════════════════════════════════════════════════
  // IMPORT
  // ═══════════════════════════════════════════════════════════════

  const doImport = useCallback(async () => {
    setStage('importing')
    setImportError(null)

    try {
      const payload = selectedRows.map(r => ({
        name: r.name,
        comscore_name: r.comscore_name,
        city: r.city,
        country: r.country,
        chain: r.chain || null,
        category: r.category,
        address: r.address || null,
        postcode: r.postcode || null,
        lat: r.lat ? parseFloat(r.lat) : null,
        lng: r.lng ? parseFloat(r.lng) : null,
        status: (r.status || 'open').toLowerCase(),
        notes: r.notes || null,
        source: 'import',
      }))

      const result = await venueApi.importVenues(payload, getToken)
      setImportResult(result)
      setStage('done')
    } catch (err) {
      console.error('Import failed:', err)
      setImportError(err.message)
      setStage('preview')
    }
  }, [selectedRows, getToken])


  // ═══════════════════════════════════════════════════════════════
  // RENDER
  // ═══════════════════════════════════════════════════════════════

  return (
    <div className="p-3 p-md-4" style={{ maxWidth: 1100, margin: '0 auto' }}>

      {/* ── UPLOAD STAGE ── */}
      {stage === 'upload' && (
        <>
          <div className="text-center mb-4">
            <h5 style={{ color: theme.text }}>Import Venues from Spreadsheet</h5>
            <p style={{ color: theme.textMuted, fontSize: '0.88rem' }}>
              Upload an .xlsx file with venue data. Use the template for the correct format.
            </p>
            <Button
              variant="outline-primary"
              size="sm"
              href={TEMPLATE_PATH}
              download="CineScope_Venue_Import_Template.xlsx"
              className="d-inline-flex align-items-center gap-1"
            >
              <Icon name="download" size={16} /> Download Template
            </Button>
          </div>

          {/* Drop zone */}
          <div
            className="d-flex flex-column align-items-center justify-content-center"
            style={{
              border: `2px dashed ${dragActive ? '#0d6efd' : theme.border}`,
              borderRadius: 12,
              padding: '60px 40px',
              background: dragActive ? 'rgba(13,110,253,0.05)' : theme.surface,
              cursor: 'pointer',
              transition: 'all 0.2s',
            }}
            onClick={() => fileInputRef.current?.click()}
            onDragOver={(e) => { e.preventDefault(); setDragActive(true) }}
            onDragLeave={() => setDragActive(false)}
            onDrop={handleFileDrop}
          >
            <Icon
              name="upload_file"
              size={48}
              style={{ color: dragActive ? '#0d6efd' : theme.textMuted, marginBottom: 12 }}
            />
            <div style={{ fontSize: '1rem', fontWeight: 500, color: theme.text }}>
              {dragActive ? 'Drop your file here' : 'Drag & drop your .xlsx file here'}
            </div>
            <div style={{ color: theme.textMuted, fontSize: '0.82rem', marginTop: 4 }}>
              or click to browse
            </div>
            <input
              ref={fileInputRef}
              type="file"
              accept=".xlsx,.xls"
              onChange={handleFileSelect}
              className="d-none"
            />
          </div>

          {parseError && (
            <Alert variant="danger" className="mt-3">
              <Icon name="error" size={16} className="me-1" /> {parseError}
            </Alert>
          )}
        </>
      )}


      {/* ── PREVIEW STAGE ── */}
      {stage === 'preview' && (
        <>
          {/* Summary bar */}
          <div className="d-flex flex-wrap align-items-center gap-2 mb-3">
            <h6 className="mb-0" style={{ color: theme.text }}>Import Preview</h6>
            <Badge bg="primary">{parsedRows.length} rows parsed</Badge>
            <Badge bg="success">{validRows.length} valid</Badge>
            {invalidRows.length > 0 && <Badge bg="danger">{invalidRows.length} errors</Badge>}
            <Badge bg="info">{selectedRows.length} selected for import</Badge>
            {needsGeocoding.length > 0 && (
              <Badge bg="warning" text="dark">{needsGeocoding.length} need geocoding</Badge>
            )}
            <div className="flex-grow-1" />
            <Button
              size="sm"
              variant="outline-secondary"
              onClick={() => { setStage('upload'); setParsedRows([]); setParseError(null) }}
            >
              <Icon name="arrow_back" size={14} className="me-1" /> Re-upload
            </Button>
          </div>

          {importError && (
            <Alert variant="danger" dismissible onClose={() => setImportError(null)}>
              <Icon name="error" size={16} className="me-1" /> {importError}
            </Alert>
          )}

          {/* Preview table */}
          <div style={{ maxHeight: 500, overflowY: 'auto', border: `1px solid ${theme.border}`, borderRadius: 8 }}>
            <Table size="sm" hover className="mb-0" style={{ color: theme.text, fontSize: '0.82rem' }}>
              <thead style={{ position: 'sticky', top: 0, background: theme.surface, zIndex: 1 }}>
                <tr>
                  <th style={{ width: 36, textAlign: 'center' }}>
                    <input
                      type="checkbox"
                      checked={selectedRows.length === validRows.length && validRows.length > 0}
                      onChange={toggleAll}
                    />
                  </th>
                  <th style={{ width: 36 }}>#</th>
                  <th>Venue Name</th>
                  <th>Comscore Name</th>
                  <th>City</th>
                  <th>Country</th>
                  <th>Category</th>
                  <th>Chain</th>
                  <th style={{ width: 80 }}>Coords</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {parsedRows.map((row, idx) => {
                  const hasErrors = row._errors.length > 0
                  const hasWarnings = row._warnings.length > 0

                  return (
                    <tr
                      key={idx}
                      style={{
                        opacity: hasErrors ? 0.6 : 1,
                        background: hasErrors ? 'rgba(220,53,69,0.05)' : 'transparent',
                      }}
                    >
                      <td className="text-center">
                        <input
                          type="checkbox"
                          checked={!!row._selected}
                          disabled={hasErrors}
                          onChange={() => toggleRow(idx)}
                        />
                      </td>
                      <td style={{ color: theme.textMuted }}>{row._rowNum}</td>
                      <td style={{ fontWeight: 500 }}>{row.name || <span className="text-danger">—</span>}</td>
                      <td>{row.comscore_name || <span className="text-danger">—</span>}</td>
                      <td>{row.city || <span className="text-danger">—</span>}</td>
                      <td>{row.country === 'Ireland' ? '🇮🇪 IRE' : '🇬🇧 UK'}</td>
                      <td style={{ fontSize: '0.78rem' }}>{row.category}</td>
                      <td style={{ fontSize: '0.78rem', color: row.chain ? theme.text : theme.textMuted }}>
                        {row.chain || 'Indie'}
                      </td>
                      <td>
                        {row._hasCoords ? (
                          <OverlayTrigger
                            placement="top"
                            overlay={<Tooltip>{parseFloat(row.lat).toFixed(4)}, {parseFloat(row.lng).toFixed(4)}</Tooltip>}
                          >
                            <Badge bg="success" style={{ fontSize: '0.68rem' }}>
                              {row._geocodeStatus === 'found' ? 'Geocoded' : 'Has coords'}
                            </Badge>
                          </OverlayTrigger>
                        ) : row._geocodeStatus === 'not_found' ? (
                          <Badge bg="warning" text="dark" style={{ fontSize: '0.68rem' }}>Not found</Badge>
                        ) : row._canGeocode ? (
                          <Badge bg="secondary" style={{ fontSize: '0.68rem' }}>Pending</Badge>
                        ) : (
                          <Badge bg="danger" style={{ fontSize: '0.68rem' }}>None</Badge>
                        )}
                      </td>
                      <td>
                        <Badge
                          bg={(row.status || 'open').toLowerCase() === 'open' ? 'success' : 'secondary'}
                          style={{ fontSize: '0.68rem' }}
                        >
                          {row.status || 'Open'}
                        </Badge>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </Table>
          </div>

          {/* Error/warning details for rows with issues */}
          {invalidRows.length > 0 && (
            <Alert variant="danger" className="mt-3" style={{ fontSize: '0.82rem' }}>
              <div className="fw-semibold mb-1">
                <Icon name="error" size={14} className="me-1" />
                {invalidRows.length} row{invalidRows.length !== 1 ? 's' : ''} with errors (will be skipped):
              </div>
              {invalidRows.slice(0, 10).map((row, i) => (
                <div key={i} style={{ marginLeft: 20 }}>
                  Row {row._rowNum}: {row._errors.join(', ')}
                </div>
              ))}
              {invalidRows.length > 10 && (
                <div style={{ marginLeft: 20, fontStyle: 'italic' }}>
                  ...and {invalidRows.length - 10} more
                </div>
              )}
            </Alert>
          )}

          {/* Action buttons */}
          <div className="d-flex justify-content-end gap-2 mt-3 pt-3" style={{ borderTop: `1px solid ${theme.border}` }}>
            <Button variant="outline-secondary" onClick={onCancel}>
              Cancel
            </Button>

            {needsGeocoding.length > 0 && (
              <Button
                variant="outline-primary"
                onClick={startGeocoding}
                disabled={selectedRows.length === 0}
                className="d-flex align-items-center gap-1"
              >
                <Icon name="my_location" size={16} />
                Geocode {needsGeocoding.length} venue{needsGeocoding.length !== 1 ? 's' : ''} first
              </Button>
            )}

            <Button
              variant="success"
              onClick={doImport}
              disabled={selectedRows.length === 0}
              className="d-flex align-items-center gap-1"
            >
              <Icon name="check_circle" size={16} />
              Import {selectedRows.length} venue{selectedRows.length !== 1 ? 's' : ''}
            </Button>
          </div>
        </>
      )}


      {/* ── GEOCODING STAGE ── */}
      {stage === 'geocoding' && (
        <div className="text-center py-5">
          <Spinner animation="border" className="mb-3" />
          <h5 style={{ color: theme.text }}>Geocoding Addresses...</h5>
          <p style={{ color: theme.textMuted, fontSize: '0.88rem' }}>
            Looking up coordinates for {geocodeProgress.total} venue{geocodeProgress.total !== 1 ? 's' : ''}.
            <br />
            This takes about 1 second per venue (Nominatim rate limit).
          </p>
          <div style={{ maxWidth: 400, margin: '0 auto' }}>
            <ProgressBar
              now={(geocodeProgress.completed / geocodeProgress.total) * 100}
              label={`${geocodeProgress.completed} / ${geocodeProgress.total}`}
              animated
              className="mb-3"
            />
          </div>
          <div style={{ color: theme.textMuted, fontSize: '0.82rem' }}>
            Estimated time remaining: ~{Math.max(0, geocodeProgress.total - geocodeProgress.completed)} seconds
          </div>
          <Button
            variant="outline-secondary"
            size="sm"
            className="mt-3"
            onClick={cancelGeocoding}
          >
            Cancel Geocoding
          </Button>
        </div>
      )}


      {/* ── IMPORTING STAGE ── */}
      {stage === 'importing' && (
        <div className="text-center py-5">
          <Spinner animation="border" className="mb-3" />
          <h5 style={{ color: theme.text }}>Importing Venues...</h5>
          <p style={{ color: theme.textMuted }}>
            Saving {selectedRows.length} venue{selectedRows.length !== 1 ? 's' : ''} to the database
          </p>
        </div>
      )}


      {/* ── DONE STAGE ── */}
      {stage === 'done' && (
        <div className="text-center py-5">
          <div style={{ fontSize: '3rem', marginBottom: 12 }}>
            <Icon name="check_circle" size={64} style={{ color: '#27ae60' }} />
          </div>
          <h5 style={{ color: theme.text }}>Import Complete!</h5>
          <p style={{ color: theme.textMuted, fontSize: '0.88rem' }}>
            {importResult?.imported ?? selectedRows.length} venue{(importResult?.imported ?? selectedRows.length) !== 1 ? 's' : ''} added successfully.
            {importResult?.skipped > 0 && ` ${importResult.skipped} skipped (duplicates).`}
          </p>
          <Button
            variant="primary"
            onClick={() => onImportComplete(importResult)}
          >
            <Icon name="arrow_back" size={16} className="me-1" /> Back to Venue List
          </Button>
        </div>
      )}
    </div>
  )
}
