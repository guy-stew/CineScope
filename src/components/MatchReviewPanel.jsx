/**
 * CineScope — Match Review Panel (v3.3 — inline view support)
 *
 * Shows matching results after Comscore import with confidence tiers.
 * Allows manual reassignment of medium/unmatched venues.
 * Now supports inline rendering as a sidebar view (same pattern as other views).
 *
 * Props:
 *   inline - boolean: render as inline div (sidebar view) vs modal overlay
 */

import React, { useState, useMemo } from 'react'
import { Modal, Badge, Button, Form, OverlayTrigger, Tooltip } from 'react-bootstrap'
import { useApp } from '../context/AppContext'
import { useTheme } from '../context/ThemeContext'
import { CONFIDENCE, makeOverrideKey } from '../utils/venueMatcher'
import Icon from './Icon'

export default function MatchReviewPanel({ inline = false }) {
  const {
    matchDetails, baseVenues, rerunMatching,
    showMatchReview, setShowMatchReview,
    cloudSaveOverride, cloudDeleteOverride,
  } = useApp()
  const { theme } = useTheme()

  // Tab state
  const [activeTab, setActiveTab] = useState(null)

  const show = showMatchReview
  const onHide = () => setShowMatchReview(false)

  // Categorise matches by confidence
  const high = matchDetails.filter(m => m.confidence.key === 'high')
  const medium = matchDetails.filter(m => m.confidence.key === 'medium')
  const low = matchDetails.filter(m => m.confidence.key === 'low')
  const chainWarnings = matchDetails.filter(m => !m.chainOk)
  const totalComscore = matchDetails.length
  const overrideCount = matchDetails.filter(m => m.method === 'manual_override').length

  // Default tab to the most relevant one
  const effectiveTab = activeTab || (medium.length > 0 ? 'medium' : low.length > 0 ? 'low' : 'high')

  const tabData = {
    medium: { details: medium, label: 'Needs Review', icon: 'warning', color: CONFIDENCE.MEDIUM?.color || '#f5c542', emptyMsg: 'No venues need review — all matches are high confidence!' },
    low:    { details: low, label: 'Unmatched', icon: 'cancel', color: CONFIDENCE.LOW?.color || '#e74c3c', emptyMsg: 'All Comscore venues matched successfully!' },
    high:   { details: high, label: 'Matched', icon: 'check_circle', color: CONFIDENCE.HIGH?.color || '#27ae60', emptyMsg: '' },
  }

  const currentTabData = tabData[effectiveTab] || tabData.high

  // ── No match data at all (modal-only fallback) ──
  if (!inline && (!matchDetails || matchDetails.length === 0)) {
    return (
      <Modal show={show} onHide={onHide} size="lg" centered>
        <Modal.Header closeButton style={{ background: theme.header, borderBottom: `1px solid ${theme.border}` }}>
          <Modal.Title style={{ color: theme.headerText || '#fff' }}>
            <div className="d-flex align-items-center gap-2">
              <Icon name="link" size={22} /> Venue Matching
            </div>
          </Modal.Title>
        </Modal.Header>
        <Modal.Body className="text-center py-5" style={{ background: 'var(--cs-body)', color: 'var(--cs-text-muted)' }}>
          Import a Comscore file to see matching results.
        </Modal.Body>
      </Modal>
    )
  }

  // ═══════════════════════════════════════════════════════════════
  // MAIN CONTENT
  // ═══════════════════════════════════════════════════════════════

  const mainContent = (
    <div className="cs-tp cs-tp--scroll-table">
      {/* ── Toolbar ── */}
      <div className="cs-tp__toolbar">
        <h1 className="cs-tp__title">
          Venue Matching
        </h1>
      </div>

      {/* ── Summary Cards ── */}
      <div className="cs-tp__stats">
        <div className="cs-tp__stat-card">
          <Icon name="format_list_numbered" size={18} className="cs-tp__stat-icon" style={{ color: 'var(--cs-text-muted)' }} />
          <div className="cs-tp__stat-value" style={{ color: 'var(--cs-text)' }}>{totalComscore}</div>
          <div className="cs-tp__stat-label">Comscore Venues</div>
        </div>
        <div className="cs-tp__stat-card cs-tp__stat-card--highlight">
          <Icon name="check_circle" size={18} className="cs-tp__stat-icon" style={{ color: CONFIDENCE.HIGH?.color || '#27ae60' }} />
          <div className="cs-tp__stat-value" style={{ color: CONFIDENCE.HIGH?.color || '#27ae60' }}>{high.length}</div>
          <div className="cs-tp__stat-label">High Confidence</div>
        </div>
        <div className="cs-tp__stat-card">
          <Icon name="warning" size={18} className="cs-tp__stat-icon" style={{ color: CONFIDENCE.MEDIUM?.color || '#f5c542' }} />
          <div className="cs-tp__stat-value" style={{ color: CONFIDENCE.MEDIUM?.color || '#f5c542' }}>{medium.length}</div>
          <div className="cs-tp__stat-label">Needs Review</div>
        </div>
        <div className="cs-tp__stat-card">
          <Icon name="cancel" size={18} className="cs-tp__stat-icon" style={{ color: CONFIDENCE.LOW?.color || '#e74c3c' }} />
          <div className="cs-tp__stat-value" style={{ color: CONFIDENCE.LOW?.color || '#e74c3c' }}>{low.length}</div>
          <div className="cs-tp__stat-label">Unmatched</div>
        </div>
        {overrideCount > 0 && (
          <div className="cs-tp__stat-card">
            <Icon name="edit" size={18} className="cs-tp__stat-icon" style={{ color: '#17a2b8' }} />
            <div className="cs-tp__stat-value" style={{ color: '#17a2b8' }}>{overrideCount}</div>
            <div className="cs-tp__stat-label">Manual Overrides</div>
          </div>
        )}
        {chainWarnings.length > 0 && (
          <div className="cs-tp__stat-card">
            <Icon name="warning" size={18} className="cs-tp__stat-icon" style={{ color: '#fd7e14' }} />
            <div className="cs-tp__stat-value" style={{ color: '#fd7e14' }}>{chainWarnings.length}</div>
            <div className="cs-tp__stat-label">Chain Warnings</div>
          </div>
        )}
      </div>

      {/* ── Tabs ── */}
      <div className="cs-tp__tabs">
        {[
          { key: 'medium', icon: 'warning',      label: `Needs Review (${medium.length})` },
          { key: 'low',    icon: 'cancel',        label: `Unmatched (${low.length})` },
          { key: 'high',   icon: 'check_circle',  label: `Matched (${high.length})` },
        ].map(tab => (
          <button
            key={tab.key}
            className={`cs-tp__tab ${effectiveTab === tab.key ? 'cs-tp__tab--active' : ''}`}
            onClick={() => setActiveTab(tab.key)}
          >
            <Icon name={tab.icon} size={16} /> {tab.label}
          </button>
        ))}
      </div>

      {/* ── Tab Content ── */}
      {currentTabData.details.length === 0 ? (
        <div className="cs-tp__empty" style={{ padding: '32px 20px' }}>
          {currentTabData.emptyMsg}
        </div>
      ) : (
        <div className="cs-tp__table-wrap cs-tp__table-wrap--fill">
          <div className="cs-tp__table-scroll">
            <MatchTable
              details={currentTabData.details}
              baseVenues={baseVenues}
              showReassign
              showAccept={effectiveTab === 'medium'}
              cloudSaveOverride={cloudSaveOverride}
              cloudDeleteOverride={cloudDeleteOverride}
            />
          </div>
        </div>
      )}
    </div>
  )

  const footerContent = (
    <div className="cs-tp__footer">
      Overrides are saved automatically to the cloud and apply to all future imports.
    </div>
  )

  // ═══════════════════════════════════════════════════════════════
  // RENDER — INLINE vs MODAL
  // ═══════════════════════════════════════════════════════════════

  if (inline) {
    return (
      <div className="d-flex flex-column h-100" style={{ background: 'var(--cs-body)', color: 'var(--cs-text)' }}>
        <div style={{ flex: 1, overflow: 'auto' }}>
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
            <Icon name="link" size={22} /> Venue Matching Review
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


// ─── Match Table ───────────────────────────────────────────

function MatchTable({ details, baseVenues, showReassign = false, showAccept = false, cloudSaveOverride, cloudDeleteOverride }) {
  return (
    <div style={{ fontSize: '0.82rem' }}>
      <table className="cs-tp__table">
        <thead>
          <tr>
            <th style={{ width: '25%' }}>Comscore Theater</th>
            <th style={{ width: '12%' }}>City</th>
            <th style={{ width: '14%' }}>Circuit</th>
            <th style={{ width: '3%' }}></th>
            <th style={{ width: '28%' }}>Matched Venue</th>
            <th style={{ width: '8%' }}>Score</th>
            {showReassign && <th style={{ width: '10%' }}>Action</th>}
          </tr>
        </thead>
        <tbody>
          {details.map((detail, idx) => (
            <MatchRow
              key={idx}
              detail={detail}
              baseVenues={baseVenues}
              showReassign={showReassign}
              showAccept={showAccept}
              cloudSaveOverride={cloudSaveOverride}
              cloudDeleteOverride={cloudDeleteOverride}
            />
          ))}
        </tbody>
      </table>
    </div>
  )
}


// ─── Individual Match Row ──────────────────────────────────

function MatchRow({ detail, baseVenues, showReassign, showAccept, cloudSaveOverride, cloudDeleteOverride }) {
  const [showDropdown, setShowDropdown] = useState(false)
  const [search, setSearch] = useState('')
  const [saving, setSaving] = useState(false)

  const { comscore, venue, score, confidence, method, chainOk } = detail

  // Filter venue list for manual assignment dropdown
  const filteredVenues = useMemo(() => {
    if (!search.trim()) return []
    const term = search.toLowerCase()
    return baseVenues
      .filter(v =>
        v.name.toLowerCase().includes(term) ||
        (v.city || '').toLowerCase().includes(term) ||
        (v.chain || '').toLowerCase().includes(term)
      )
      .slice(0, 15)
  }, [search, baseVenues])

  const handleAssign = (assignVenue) => {
    cloudSaveOverride({
      comscoreTheater: comscore.theater,
      comscoreCity: comscore.city,
      action: 'assign',
      venueName: assignVenue.name,
      venueCity: assignVenue.city || '',
    }).catch(err => console.error('Failed to save override:', err))
    setShowDropdown(false)
    setSearch('')
  }

  const handleAcceptMatch = () => {
    if (!venue) return
    cloudSaveOverride({
      comscoreTheater: comscore.theater,
      comscoreCity: comscore.city,
      action: 'assign',
      venueName: venue.name,
      venueCity: venue.city || '',
    }).catch(err => console.error('Failed to save override:', err))
  }

  const handleDismiss = () => {
    cloudSaveOverride({
      comscoreTheater: comscore.theater,
      comscoreCity: comscore.city,
      action: 'dismiss',
    }).catch(err => console.error('Failed to save override:', err))
    setShowDropdown(false)
  }

  const handleClearOverride = async () => {
    setSaving(true)
    try {
      await cloudDeleteOverride(comscore.theater, comscore.city)
    } catch (err) {
      console.error('Failed to delete override:', err)
    } finally {
      setSaving(false)
    }
  }

  const isOverride = method === 'manual_override' || method === 'manual_dismiss'

  const methodLabels = {
    exact_name: 'Exact',
    name_city: 'Name+City',
    fuzzy_token: 'Fuzzy',
    chain_prefix: 'Chain+Name',
    chain_city: 'Chain+City',
    manual_override: 'Manual',
    manual_dismiss: 'Dismissed',
    none: '—',
  }

  return (
    <>
      <tr style={{ borderLeft: `3px solid ${confidence.color}` }}>
        {/* Comscore info */}
        <td>
          <span className="cs-tp__cell-name" style={{ display: 'inline' }}>{comscore.theater}</span>
          {!chainOk && (
            <OverlayTrigger
              placement="top"
              overlay={<Tooltip>Chain mismatch: circuit "{comscore.circuit}" doesn't match venue chain</Tooltip>}
            >
              <Badge bg="warning" text="dark" className="ms-1" style={{ fontSize: '0.65rem' }}><Icon name="warning" size={12} /> Chain</Badge>
            </OverlayTrigger>
          )}
        </td>
        <td>{comscore.city}</td>
        <td style={{ fontSize: '0.75rem' }}>{comscore.circuit}</td>

        {/* Arrow */}
        <td style={{ textAlign: 'center' }}>
          {venue ? <Icon name="arrow_forward" size={16} /> : <Icon name="close" size={16} style={{ color: '#e74c3c' }} />}
        </td>

        {/* Matched venue */}
        <td>
          {venue ? (
            <>
              <span style={{ fontWeight: 500, color: 'var(--cs-text)' }}>{venue.name}</span>
              <span style={{ fontSize: '0.75rem', color: 'var(--cs-text-muted)', marginLeft: 6 }}>
                {venue.city} · {venue.chain}
              </span>
            </>
          ) : (
            <span style={{ fontStyle: 'italic', color: 'var(--cs-text-muted)' }}>No match found</span>
          )}
        </td>

        {/* Score */}
        <td>
          <Badge
            bg={score >= 90 ? 'success' : score >= 50 ? 'warning' : 'danger'}
            text={score >= 50 && score < 90 ? 'dark' : undefined}
            style={{ fontSize: '0.72rem' }}
          >
            {score}
          </Badge>
          <div style={{ fontSize: '0.65rem', color: 'var(--cs-text-muted)' }}>
            {methodLabels[method] || method}
          </div>
        </td>

        {/* Actions */}
        {showReassign && (
          <td>
            <div className="d-flex gap-1">
              {showAccept && venue && !isOverride && (
                <Button
                  size="sm"
                  variant="outline-success"
                  onClick={handleAcceptMatch}
                  disabled={saving}
                  style={{ fontSize: '0.7rem', padding: '1px 6px' }}
                  title="Accept this match as correct"
                >
                  <Icon name="check" size={14} />
                </Button>
              )}
              <Button
                size="sm"
                variant="outline-primary"
                onClick={() => setShowDropdown(!showDropdown)}
                disabled={saving}
                style={{ fontSize: '0.7rem', padding: '1px 6px' }}
                title="Reassign to a different venue"
              >
                <Icon name="edit" size={14} />
              </Button>
              {isOverride && (
                <Button
                  size="sm"
                  variant="outline-secondary"
                  onClick={handleClearOverride}
                  disabled={saving}
                  style={{ fontSize: '0.7rem', padding: '1px 6px' }}
                  title="Remove override, revert to auto-matching"
                >
                  <Icon name="undo" size={14} />
                </Button>
              )}
            </div>
          </td>
        )}
      </tr>

      {/* Reassignment dropdown row */}
      {showDropdown && (
        <tr>
          <td colSpan={showReassign ? 7 : 6} style={{ background: 'var(--cs-surface-alt)' }}>
            <div className="p-2">
              <div className="d-flex gap-2 align-items-center mb-2">
                <Form.Control
                  size="sm"
                  type="text"
                  placeholder="Search venues by name, city, or chain..."
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                  autoFocus
                  style={{ maxWidth: 400, background: 'var(--cs-surface)', color: 'var(--cs-text)', borderColor: 'var(--cs-border)' }}
                />
                <Button
                  size="sm"
                  variant="outline-danger"
                  onClick={handleDismiss}
                  disabled={saving}
                  title="Mark as intentionally unmatched"
                >
                  <Icon name="block" size={14} className="me-1" /> Dismiss
                </Button>
                <Button
                  size="sm"
                  variant="outline-secondary"
                  onClick={() => { setShowDropdown(false); setSearch('') }}
                >
                  Cancel
                </Button>
              </div>

              {search.trim() && filteredVenues.length === 0 && (
                <div style={{ fontSize: '0.8rem', color: 'var(--cs-text-muted)' }}>
                  No venues match "{search}"
                </div>
              )}

              {filteredVenues.length > 0 && (
                <div style={{ maxHeight: 200, overflowY: 'auto', fontSize: '0.8rem' }}>
                  <table className="cs-tp__table">
                    <thead>
                      <tr>
                        <th>Venue</th>
                        <th>City</th>
                        <th>Chain</th>
                        <th>Category</th>
                        <th></th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredVenues.map((v, i) => (
                        <tr key={i}>
                          <td style={{ fontWeight: 500, color: 'var(--cs-text)' }}>{v.name}</td>
                          <td>{v.city}</td>
                          <td>{v.chain}</td>
                          <td style={{ color: 'var(--cs-text-muted)' }}>{v.category}</td>
                          <td>
                            <Button
                              size="sm"
                              variant="success"
                              onClick={() => handleAssign(v)}
                              disabled={saving}
                              style={{ fontSize: '0.7rem', padding: '1px 8px' }}
                            >
                              {saving ? '...' : 'Assign'}
                            </Button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </td>
        </tr>
      )}
    </>
  )
}
