import React, { useState, useMemo } from 'react'
import { Modal, Badge, Button, Form, Tab, Tabs, OverlayTrigger, Tooltip } from 'react-bootstrap'
import { useApp } from '../context/AppContext'
import { CONFIDENCE, makeOverrideKey } from '../utils/venueMatcher'
import Icon from './Icon'

/**
 * MatchReviewPanel — Shows matching results after import with confidence tiers.
 * Allows manual reassignment of medium/unmatched venues.
 *
 * v2.0 changes:
 *   - Overrides save/delete through cloud API (via AppContext)
 *   - Removed direct localStorage imports from venueMatcher
 *   - Override changes trigger automatic re-matching via state dependency
 */
export default function MatchReviewPanel() {
  const {
    matchDetails, baseVenues, selectedFilm, rerunMatching,
    showMatchReview, setShowMatchReview,
    cloudSaveOverride, cloudDeleteOverride,
  } = useApp()

  const show = showMatchReview
  const onHide = () => setShowMatchReview(false)

  if (!matchDetails || matchDetails.length === 0) {
    return (
      <Modal show={show} onHide={onHide} size="lg" centered>
        <Modal.Header closeButton>
          <Modal.Title><Icon name="link" size={22} className="me-2" />Venue Matching</Modal.Title>
        </Modal.Header>
        <Modal.Body className="text-center text-muted py-5">
          Import a Comscore file to see matching results.
        </Modal.Body>
      </Modal>
    )
  }

  // Categorise matches by confidence
  const high = matchDetails.filter(m => m.confidence.key === 'high')
  const medium = matchDetails.filter(m => m.confidence.key === 'medium')
  const low = matchDetails.filter(m => m.confidence.key === 'low')
  const chainWarnings = matchDetails.filter(m => !m.chainOk)

  const totalComscore = matchDetails.length
  const matchedCount = high.length + medium.length
  const unmatchedCount = low.length
  const overrideCount = matchDetails.filter(m => m.method === 'manual_override').length

  return (
    <Modal show={show} onHide={onHide} size="xl" centered scrollable>
      <Modal.Header closeButton style={{ background: 'var(--cs-header, #1a365d)', color: 'white' }}>
        <Modal.Title className="d-flex align-items-center gap-2">
          <Icon name="link" size={22} className="me-2" /> Venue Matching Review
          {selectedFilm && (
            <Badge bg="light" text="dark" style={{ fontSize: '0.7rem', fontWeight: 'normal' }}>
              {selectedFilm.filmInfo.title || selectedFilm.filmInfo.fileName}
            </Badge>
          )}
        </Modal.Title>
      </Modal.Header>

      <Modal.Body style={{ maxHeight: '70vh', overflowY: 'auto' }}>

        {/* ── Summary Stats Bar ── */}
        <div className="d-flex gap-3 mb-3 flex-wrap">
          <StatBox
            label="Comscore Venues"
            value={totalComscore}
            color="#6c757d"
          />
          <StatBox
            label="High Confidence"
            value={high.length}
            color={CONFIDENCE.HIGH.color}
            pct={Math.round((high.length / totalComscore) * 100)}
          />
          <StatBox
            label="Needs Review"
            value={medium.length}
            color={CONFIDENCE.MEDIUM.color}
            pct={Math.round((medium.length / totalComscore) * 100)}
          />
          <StatBox
            label="Unmatched"
            value={low.length}
            color={CONFIDENCE.LOW.color}
            pct={Math.round((low.length / totalComscore) * 100)}
          />
          {overrideCount > 0 && (
            <StatBox
              label="Manual Overrides"
              value={overrideCount}
              color="#17a2b8"
            />
          )}
          {chainWarnings.length > 0 && (
            <StatBox
              label="Chain Warnings"
              value={chainWarnings.length}
              color="#fd7e14"
            />
          )}
        </div>

        {/* ── Tabs for each tier ── */}
        <Tabs defaultActiveKey={medium.length > 0 ? 'medium' : low.length > 0 ? 'low' : 'high'} className="mb-3">

          {/* Needs Review tab */}
          <Tab
            eventKey="medium"
            title={<><Icon name="warning" size={16} className="me-1" /> Needs Review <Badge bg="warning" text="dark">{medium.length}</Badge></>}
          >
            {medium.length === 0 ? (
              <EmptyState message="No venues need review — all matches are high confidence!" />
            ) : (
              <MatchTable
                details={medium}
                baseVenues={baseVenues}
                showReassign
                showAccept
                cloudSaveOverride={cloudSaveOverride}
                cloudDeleteOverride={cloudDeleteOverride}
              />
            )}
          </Tab>

          {/* Unmatched tab */}
          <Tab
            eventKey="low"
            title={<><Icon name="cancel" size={16} className="me-1" /> Unmatched <Badge bg="danger">{low.length}</Badge></>}
          >
            {low.length === 0 ? (
              <EmptyState message="All Comscore venues matched successfully!" />
            ) : (
              <MatchTable
                details={low}
                baseVenues={baseVenues}
                showReassign
                cloudSaveOverride={cloudSaveOverride}
                cloudDeleteOverride={cloudDeleteOverride}
              />
            )}
          </Tab>

          {/* High Confidence tab */}
          <Tab
            eventKey="high"
            title={<><Icon name="check_circle" size={16} className="me-1" /> Matched <Badge bg="success">{high.length}</Badge></>}
          >
            <MatchTable
              details={high}
              baseVenues={baseVenues}
              showReassign
              cloudSaveOverride={cloudSaveOverride}
              cloudDeleteOverride={cloudDeleteOverride}
            />
          </Tab>

        </Tabs>

      </Modal.Body>

      <Modal.Footer className="justify-content-between">
        <div className="text-muted" style={{ fontSize: '0.75rem' }}>
          Overrides are saved automatically to the cloud and apply to all future imports.
        </div>
        <Button variant="secondary" onClick={onHide}>
          Close
        </Button>
      </Modal.Footer>
    </Modal>
  )
}


// ─── Summary Stat Box ──────────────────────────────────────

function StatBox({ label, value, color, pct }) {
  return (
    <div
      className="text-center px-3 py-2 rounded"
      style={{
        border: `2px solid ${color}`,
        minWidth: 100,
        flex: '1 1 0',
      }}
    >
      <div style={{ fontSize: '1.5rem', fontWeight: 700, color }}>{value}</div>
      <div style={{ fontSize: '0.72rem', color: '#666' }}>
        {label}
        {pct != null && <span className="ms-1">({pct}%)</span>}
      </div>
    </div>
  )
}


// ─── Match Table ───────────────────────────────────────────

function MatchTable({ details, baseVenues, showReassign = false, showAccept = false, cloudSaveOverride, cloudDeleteOverride }) {
  return (
    <div className="table-responsive" style={{ fontSize: '0.82rem' }}>
      <table className="table table-sm table-hover align-middle mb-0">
        <thead>
          <tr>
            <th style={{ width: '25%' }}>Comscore Theater</th>
            <th style={{ width: '12%' }}>City</th>
            <th style={{ width: '12%' }}>Circuit</th>
            <th style={{ width: '10%' }}>Revenue</th>
            <th style={{ width: '3%' }}></th>
            <th style={{ width: '25%' }}>Matched Venue</th>
            <th style={{ width: '8%' }}>Score</th>
            {showReassign && <th style={{ width: '5%' }}>Action</th>}
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
      .slice(0, 15) // Limit results for performance
  }, [search, baseVenues])

  const handleAssign = (assignVenue) => {
    // Fire-and-forget: cloudSaveOverride does optimistic state update + rollback on error
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

  // Quick accept — confirms the current auto-matched venue as correct
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

  // Method badge
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
          <strong>{comscore.theater}</strong>
          {!chainOk && (
            <OverlayTrigger
              placement="top"
              overlay={<Tooltip>Chain mismatch: circuit "{comscore.circuit}" doesn't match venue chain</Tooltip>}
            >
              <Badge bg="warning" text="dark" className="ms-1" style={{ fontSize: '0.65rem' }}><Icon name="warning" size={12} /> Chain</Badge>
            </OverlayTrigger>
          )}
        </td>
        <td className="text-muted">{comscore.city}</td>
        <td className="text-muted" style={{ fontSize: '0.75rem' }}>{comscore.circuit}</td>
        <td>£{(comscore.revenue || 0).toLocaleString()}</td>

        {/* Arrow */}
        <td className="text-center">{venue ? <Icon name="arrow_forward" size={16} /> : <Icon name="close" size={16} style={{ color: '#dc3545' }} />}</td>

        {/* Matched venue */}
        <td>
          {venue ? (
            <>
              <span>{venue.name}</span>
              <span className="text-muted ms-1" style={{ fontSize: '0.75rem' }}>
                {venue.city} · {venue.chain}
              </span>
            </>
          ) : (
            <span className="text-muted fst-italic">No match found</span>
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
          <div style={{ fontSize: '0.65rem', color: '#999' }}>
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
          <td colSpan={showReassign ? 8 : 7} style={{ background: '#f8f9fa' }}>
            <div className="p-2">
              <div className="d-flex gap-2 align-items-center mb-2">
                <Form.Control
                  size="sm"
                  type="text"
                  placeholder="Search venues by name, city, or chain..."
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                  autoFocus
                  style={{ maxWidth: 400 }}
                />
                <Button
                  size="sm"
                  variant="outline-danger"
                  onClick={handleDismiss}
                  disabled={saving}
                  title="Mark as intentionally unmatched (e.g. venue not in our database)"
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
                <div className="text-muted" style={{ fontSize: '0.8rem' }}>
                  No venues match "{search}"
                </div>
              )}

              {filteredVenues.length > 0 && (
                <div style={{ maxHeight: 200, overflowY: 'auto', fontSize: '0.8rem' }}>
                  <table className="table table-sm table-hover mb-0">
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
                          <td>{v.name}</td>
                          <td>{v.city}</td>
                          <td>{v.chain}</td>
                          <td className="text-muted">{v.category}</td>
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


function EmptyState({ message }) {
  return (
    <div className="text-center text-muted py-4" style={{ fontSize: '0.9rem' }}>
      {message}
    </div>
  )
}
