/**
 * FilmNameDialog — Shown after Comscore import to confirm/edit the detected film title.
 * 
 * The Comscore parser extracts the film name from Row 1 of the spreadsheet
 * (e.g. "Importance Of Being Earnest - NT Live 2025 (Theatre), The - National Theatre - PG")
 * This dialog lets Austin verify or adjust it before it's applied.
 */
import React, { useState, useEffect } from 'react'
import { Modal, Form, Button, Badge } from 'react-bootstrap'
import Icon from './Icon'

export default function FilmNameDialog({ show, onConfirm, onCancel, detectedTitle, rawTitle, dateRange }) {
  const [title, setTitle] = useState(detectedTitle || '')

  // Update local state when props change (new import)
  useEffect(() => {
    setTitle(detectedTitle || '')
  }, [detectedTitle])

  const handleConfirm = () => {
    onConfirm(title.trim() || 'Unknown Film')
  }

  const handleKeyDown = (e) => {
    if (e.key === 'Enter') {
      e.preventDefault()
      handleConfirm()
    }
  }

  return (
    <Modal show={show} onHide={onCancel} centered size="md" backdrop="static">
      <Modal.Header
        closeButton
        style={{ background: '#1a365d', color: '#fff', borderBottom: 'none' }}
      >
        <Modal.Title style={{ fontSize: '1rem' }}>
          <Icon name="movie" size={20} className="me-2" />
          Confirm Film Name
        </Modal.Title>
      </Modal.Header>

      <Modal.Body className="px-4 py-3">
        <p style={{ fontSize: '0.9rem', color: '#666', marginBottom: 16 }}>
          We detected the following film title from the Comscore data. 
          You can edit it below if needed.
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
        <Form.Group>
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
          <div className="mt-2" style={{ fontSize: '0.8rem', color: '#999' }}>
            <Icon name="calendar_month" size={14} className="me-1" />
            Data period: {dateRange}
          </div>
        )}
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
          Apply
        </Button>
      </Modal.Footer>
    </Modal>
  )
}
