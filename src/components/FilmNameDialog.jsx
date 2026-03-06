/**
 * FilmNameDialog — Shown after Comscore import to confirm/edit the detected film title
 * and optionally link to a Film Catalogue entry.
 *
 * v3.0 changes:
 *   - Loads catalogue entries on open
 *   - Auto-matches detected title against catalogue (fuzzy token overlap)
 *   - Dropdown to manually pick a catalogue entry
 *   - Passes catalogueId back through onConfirm(title, catalogueId)
 */
import React, { useState, useEffect, useMemo } from 'react'
import { Modal, Form, Button, Badge, Spinner, Alert } from 'react-bootstrap'
import { useApp } from '../context/AppContext'
import { tmdbImageUrl } from '../utils/apiClient'
import Icon from './Icon'

/**
 * Simple fuzzy match: normalise both strings and check token overlap.
 * Returns a score 0-1 (1 = perfect match).
 */
function fuzzyScore(a, b) {
  if (!a || !b) return 0
  const norm = s => s.toLowerCase()
    .replace(/[^a-z0-9\s]/g, '')
    .replace(/\b(the|a|an|nt live|national theatre live|live)\b/g, '')
    .trim()
    .split(/\s+/)
    .filter(Boolean)
  const tokensA = norm(a)
  const tokensB = norm(b)
  if (tokensA.length === 0 || tokensB.length === 0) return 0
  const setB = new Set(tokensB)
  const matches = tokensA.filter(t => setB.has(t)).length
  return matches / Math.max(tokensA.length, tokensB.length)
}

export default function FilmNameDialog({ show, onConfirm, onCancel, detectedTitle, rawTitle, dateRange }) {
  const { apiClient } = useApp()

  const [title, setTitle] = useState(detectedTitle || '')
  const [catalogue, setCatalogue] = useState([])
  const [loadingCatalogue, setLoadingCatalogue] = useState(false)
  const [selectedCatalogueId, setSelectedCatalogueId] = useState(null)
  const [linkMode, setLinkMode] = useState('auto') // 'auto' | 'manual' | 'none'

  // Update local state when props change (new import)
  useEffect(() => {
    setTitle(detectedTitle || '')
    setSelectedCatalogueId(null)
    setLinkMode('auto')
  }, [detectedTitle])

  // Load catalogue entries when dialog opens
  useEffect(() => {
    if (!show || !apiClient) return
    setLoadingCatalogue(true)
    apiClient.getCatalogue()
      .then(data => {
        setCatalogue(data.catalogue || [])
      })
      .catch(err => {
        console.warn('Could not load catalogue:', err)
        setCatalogue([])
      })
      .finally(() => setLoadingCatalogue(false))
  }, [show, apiClient])

  // Auto-match: find best catalogue match for the detected title
  const autoMatch = useMemo(() => {
    if (!detectedTitle || catalogue.length === 0) return null
    let bestScore = 0
    let bestEntry = null
    for (const entry of catalogue) {
      const score = fuzzyScore(detectedTitle, entry.title)
      if (score > bestScore) {
        bestScore = score
        bestEntry = entry
      }
    }
    // Only suggest if score > 0.4 (at least ~40% token overlap)
    return bestScore > 0.4 ? { entry: bestEntry, score: bestScore } : null
  }, [detectedTitle, catalogue])

  // Apply auto-match on first load
  useEffect(() => {
    if (autoMatch && linkMode === 'auto') {
      setSelectedCatalogueId(autoMatch.entry.id)
    }
  }, [autoMatch, linkMode])

  const handleConfirm = () => {
    const catalogueId = linkMode === 'none' ? null : selectedCatalogueId
    onConfirm(title.trim() || 'Unknown Film', catalogueId)
  }

  const handleKeyDown = (e) => {
    if (e.key === 'Enter') {
      e.preventDefault()
      handleConfirm()
    }
  }

  const selectedEntry = catalogue.find(c => c.id === selectedCatalogueId)

  return (
    <Modal show={show} onHide={onCancel} centered size="md" backdrop="static">
      <Modal.Header
        closeButton
        style={{ background: '#1a365d', color: '#fff', borderBottom: 'none' }}
      >
        <Modal.Title style={{ fontSize: '1rem' }}>
          <Icon name="movie" size={20} className="me-2" />
          Confirm Film Import
        </Modal.Title>
      </Modal.Header>

      <Modal.Body className="px-4 py-3">
        <p style={{ fontSize: '0.9rem', color: '#666', marginBottom: 16 }}>
          We detected the following film title from the Comscore data.
          You can edit it below and link it to a film in your catalogue.
        </p>

        {/* Detected raw title for reference */}
        {rawTitle && (
          <div
            className="mb-3 p-2"
            style={{
              background: '#f8f9fa',
              borderRadius: 6,
              border: '1px solid #e9ecef',
              fontSize: '0.78rem',
              color: '#888',
              wordBreak: 'break-word',
            }}
          >
            <strong style={{ color: '#666' }}>Source:</strong> {rawTitle}
          </div>
        )}

        {/* Editable film name */}
        <Form.Group className="mb-3">
          <Form.Label className="fw-semibold" style={{ fontSize: '0.85rem' }}>
            Film Title
          </Form.Label>
          <Form.Control
            type="text"
            size="lg"
            value={title}
            onChange={e => setTitle(e.target.value)}
            onKeyDown={handleKeyDown}
            autoFocus
            placeholder="Enter film title..."
            style={{ fontSize: '1.1rem', fontWeight: 600 }}
          />
        </Form.Group>

        {/* Date range info if available */}
        {dateRange && (
          <div className="mb-3" style={{ fontSize: '0.8rem', color: '#999' }}>
            <Icon name="calendar_month" size={14} className="me-1" />
            Data period: {dateRange}
          </div>
        )}

        {/* ─── Catalogue Linking Section ─── */}
        <div
          className="p-3 rounded mb-2"
          style={{ background: '#f0f7ff', border: '1px solid #cce0ff', borderRadius: 8 }}
        >
          <div className="d-flex align-items-center gap-2 mb-2">
            <Icon name="link" size={18} style={{ color: '#2563eb' }} />
            <strong style={{ fontSize: '0.9rem', color: '#1e40af' }}>Link to Catalogue</strong>
          </div>

          {loadingCatalogue ? (
            <div className="d-flex align-items-center gap-2 text-muted" style={{ fontSize: '0.85rem' }}>
              <Spinner animation="border" size="sm" /> Loading catalogue...
            </div>
          ) : catalogue.length === 0 ? (
            <div style={{ fontSize: '0.85rem', color: '#666' }}>
              No films in your catalogue yet. This import will create a standalone Comscore record.
              You can link it to a catalogue entry later.
            </div>
          ) : (
            <>
              {/* Auto-match result */}
              {autoMatch && linkMode === 'auto' && (
                <Alert variant="info" className="py-2 mb-2 d-flex align-items-start gap-2" style={{ fontSize: '0.85rem' }}>
                  {autoMatch.entry.poster_path && (
                    <img
                      src={tmdbImageUrl(autoMatch.entry.poster_path, 'w92')}
                      alt=""
                      style={{ width: 36, height: 54, borderRadius: 3, objectFit: 'cover', flexShrink: 0 }}
                    />
                  )}
                  <div>
                    <div>
                      <strong>Auto-matched:</strong> {autoMatch.entry.title}
                      {autoMatch.entry.year && <span className="text-muted ms-1">({autoMatch.entry.year})</span>}
                    </div>
                    <div className="text-muted" style={{ fontSize: '0.75rem' }}>
                      Match confidence: {Math.round(autoMatch.score * 100)}%
                    </div>
                    <div className="mt-1 d-flex gap-1">
                      <Button
                        size="sm"
                        variant="outline-primary"
                        style={{ fontSize: '0.75rem', padding: '1px 8px' }}
                        onClick={() => setLinkMode('manual')}
                      >
                        Wrong film? Pick another
                      </Button>
                      <Button
                        size="sm"
                        variant="outline-secondary"
                        style={{ fontSize: '0.75rem', padding: '1px 8px' }}
                        onClick={() => { setLinkMode('none'); setSelectedCatalogueId(null); }}
                      >
                        Don't link
                      </Button>
                    </div>
                  </div>
                </Alert>
              )}

              {/* Manual picker (shown when auto-match rejected or no auto-match) */}
              {(linkMode === 'manual' || (!autoMatch && linkMode !== 'none')) && (
                <div>
                  <Form.Select
                    size="sm"
                    value={selectedCatalogueId || ''}
                    onChange={e => {
                      const val = e.target.value
                      if (val === '') {
                        setSelectedCatalogueId(null)
                        setLinkMode('none')
                      } else {
                        setSelectedCatalogueId(val)
                        setLinkMode('manual')
                      }
                    }}
                    style={{ fontSize: '0.85rem' }}
                  >
                    <option value="">Don't link to catalogue</option>
                    {catalogue.map(entry => (
                      <option key={entry.id} value={entry.id}>
                        {entry.title} {entry.year ? `(${entry.year})` : ''}
                        {entry.genres ? ` - ${entry.genres}` : ''}
                      </option>
                    ))}
                  </Form.Select>

                  {selectedEntry && selectedEntry.poster_path && (
                    <div className="d-flex align-items-center gap-2 mt-2" style={{ fontSize: '0.8rem' }}>
                      <img
                        src={tmdbImageUrl(selectedEntry.poster_path, 'w92')}
                        alt=""
                        style={{ width: 32, height: 48, borderRadius: 3, objectFit: 'cover' }}
                      />
                      <span className="text-muted">
                        {selectedEntry.status === 'pre_release' && <Badge bg="info" style={{ fontSize: '0.65rem' }}>Pre-release</Badge>}
                        {selectedEntry.status === 'released' && <Badge bg="primary" style={{ fontSize: '0.65rem' }}>Released</Badge>}
                        {selectedEntry.certification && <Badge bg="dark" className="ms-1" style={{ fontSize: '0.65rem' }}>{selectedEntry.certification}</Badge>}
                      </span>
                    </div>
                  )}
                </div>
              )}

              {/* "No link" confirmation */}
              {linkMode === 'none' && autoMatch && (
                <div className="d-flex align-items-center gap-2" style={{ fontSize: '0.8rem', color: '#888' }}>
                  <Icon name="link_off" size={16} />
                  Not linked to catalogue.
                  <Button
                    size="sm"
                    variant="link"
                    className="p-0"
                    style={{ fontSize: '0.8rem' }}
                    onClick={() => { setLinkMode('auto'); setSelectedCatalogueId(autoMatch.entry.id); }}
                  >
                    Undo
                  </Button>
                </div>
              )}
            </>
          )}
        </div>
      </Modal.Body>

      <Modal.Footer style={{ borderTop: '1px solid #eee' }}>
        <Button variant="outline-secondary" size="sm" onClick={onCancel}>
          Skip
        </Button>
        <Button
          variant="primary"
          size="sm"
          onClick={handleConfirm}
          disabled={!title.trim()}
        >
          <Icon name="check" size={16} className="me-1" />
          {selectedCatalogueId && linkMode !== 'none' ? 'Import & Link' : 'Import'}
        </Button>
      </Modal.Footer>
    </Modal>
  )
}
