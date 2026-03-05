/**
 * CineScope — Venue Manager Modal
 *
 * Full-screen modal for browsing, adding, editing, and importing venues.
 * Accessed via the storefront icon in the header bar.
 *
 * Internal view states:
 *   'list'   — searchable/sortable venue table with pagination
 *   'add'    — blank VenueForm for creating a new venue
 *   'edit'   — VenueForm pre-filled with selected venue data
 *   'import' — VenueImport for spreadsheet upload
 */

import React, { useState, useEffect, useMemo, useCallback } from 'react'
import { Modal, Form, Button, Badge, Spinner, Table, InputGroup, OverlayTrigger, Tooltip } from 'react-bootstrap'
import { useAuth } from '@clerk/clerk-react'
import { useTheme } from '../context/ThemeContext'
import Icon from './Icon'
import VenueForm from './VenueForm'
import VenueImport from './VenueImport'
import * as venueApi from '../utils/venueApi'

const PAGE_SIZE = 25

const STATUS_BADGES = {
  open: { bg: 'success', label: 'Open' },
  closed: { bg: 'secondary', label: 'Closed' },
}

const CATEGORY_LABELS = {
  'Large Chain': 'Large',
  'Small Chain': 'Small',
  'Independent': 'Indie',
}

export default function VenueManager({ show, onHide }) {
  const { getToken } = useAuth()
  const { theme } = useTheme()

  // ── View state ──
  const [view, setView] = useState('list') // 'list' | 'add' | 'edit' | 'import'
  const [editVenue, setEditVenue] = useState(null)

  // ── Venue data ──
  const [venues, setVenues] = useState([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)

  // ── Filters & search ──
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('open') // 'all' | 'open' | 'closed'
  const [categoryFilter, setCategoryFilter] = useState('')

  // ── Sorting ──
  const [sortField, setSortField] = useState('name')
  const [sortDir, setSortDir] = useState('asc')

  // ── Pagination ──
  const [page, setPage] = useState(1)

  // ── Save feedback ──
  const [saveMessage, setSaveMessage] = useState(null)


  // ═══════════════════════════════════════════════════════════════
  // DATA LOADING
  // ═══════════════════════════════════════════════════════════════

  const loadVenues = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const data = await venueApi.getVenues(getToken)
      setVenues(data.venues || data || [])
    } catch (err) {
      console.error('VenueManager: Failed to load venues', err)
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }, [getToken])

  // Load venues when modal opens
  useEffect(() => {
    if (show) {
      loadVenues()
      setView('list')
      setEditVenue(null)
      setSearch('')
      setPage(1)
      setSaveMessage(null)
    }
  }, [show, loadVenues])


  // ═══════════════════════════════════════════════════════════════
  // FILTERING, SORTING, PAGINATION
  // ═══════════════════════════════════════════════════════════════

  const filtered = useMemo(() => {
    let result = [...venues]

    // Status filter
    if (statusFilter !== 'all') {
      result = result.filter(v => (v.status || 'open') === statusFilter)
    }

    // Category filter
    if (categoryFilter) {
      result = result.filter(v => v.category === categoryFilter)
    }

    // Search (name, city, chain, comscore_name)
    if (search.trim()) {
      const term = search.toLowerCase().trim()
      result = result.filter(v =>
        (v.name || '').toLowerCase().includes(term) ||
        (v.city || '').toLowerCase().includes(term) ||
        (v.chain || '').toLowerCase().includes(term) ||
        (v.comscore_name || '').toLowerCase().includes(term)
      )
    }

    // Sort
    result.sort((a, b) => {
      const aVal = (a[sortField] || '').toString().toLowerCase()
      const bVal = (b[sortField] || '').toString().toLowerCase()
      const cmp = aVal.localeCompare(bVal)
      return sortDir === 'asc' ? cmp : -cmp
    })

    return result
  }, [venues, search, statusFilter, categoryFilter, sortField, sortDir])

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE))
  const safePage = Math.min(page, totalPages)
  const pageVenues = filtered.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE)

  // Reset page when filters change
  useEffect(() => { setPage(1) }, [search, statusFilter, categoryFilter])

  // Unique categories from loaded venues
  const categories = useMemo(() => {
    return [...new Set(venues.map(v => v.category).filter(Boolean))].sort()
  }, [venues])

  // Counts for status badges
  const statusCounts = useMemo(() => {
    const open = venues.filter(v => (v.status || 'open') === 'open').length
    return { open, closed: venues.length - open, all: venues.length }
  }, [venues])


  // ═══════════════════════════════════════════════════════════════
  // ACTIONS
  // ═══════════════════════════════════════════════════════════════

  const handleSort = (field) => {
    if (sortField === field) {
      setSortDir(d => d === 'asc' ? 'desc' : 'asc')
    } else {
      setSortField(field)
      setSortDir('asc')
    }
  }

  const handleEdit = (venue) => {
    setEditVenue(venue)
    setView('edit')
  }

  const handleAdd = () => {
    setEditVenue(null)
    setView('add')
  }

  const handleImport = () => {
    setView('import')
  }

  const handleToggleStatus = async (venue, e) => {
    e.stopPropagation()
    try {
      await venueApi.toggleVenueStatus(venue.id, getToken)
      // Update local state immediately
      setVenues(prev => prev.map(v =>
        v.id === venue.id
          ? { ...v, status: v.status === 'open' ? 'closed' : 'open' }
          : v
      ))
    } catch (err) {
      console.error('Failed to toggle status:', err)
    }
  }

  const handleFormSave = async (savedVenue) => {
    // Reload the full list to pick up the new/updated venue
    await loadVenues()
    setView('list')
    setEditVenue(null)
    const action = savedVenue._isNew ? 'added' : 'updated'
    setSaveMessage(`${savedVenue.name} ${action} successfully`)
    setTimeout(() => setSaveMessage(null), 4000)
  }

  const handleFormCancel = () => {
    setView('list')
    setEditVenue(null)
  }

  const handleImportComplete = async (result) => {
    await loadVenues()
    setView('list')
    const count = result?.imported ?? 0
    setSaveMessage(`${count} venue${count !== 1 ? 's' : ''} imported successfully`)
    setTimeout(() => setSaveMessage(null), 5000)
  }

  const SortIcon = ({ field }) => {
    if (sortField !== field) return <Icon name="unfold_more" size={14} style={{ opacity: 0.3 }} />
    return <Icon name={sortDir === 'asc' ? 'arrow_upward' : 'arrow_downward'} size={14} />
  }


  // ═══════════════════════════════════════════════════════════════
  // RENDER
  // ═══════════════════════════════════════════════════════════════

  const viewTitle = {
    list: 'Venue Manager',
    add: 'Add New Venue',
    edit: `Edit: ${editVenue?.name || 'Venue'}`,
    import: 'Import Venues',
  }

  return (
    <Modal
      show={show}
      onHide={onHide}
      fullscreen
      className="venue-manager-modal"
    >
      <Modal.Header
        closeButton
        style={{
          background: theme.header,
          borderBottom: `1px solid ${theme.border}`,
        }}
      >
        <Modal.Title className="d-flex align-items-center gap-2" style={{ color: theme.headerText || '#fff' }}>
          {view !== 'list' && (
            <Button
              variant="link"
              size="sm"
              onClick={handleFormCancel}
              style={{ color: theme.headerText || '#fff', padding: 0, marginRight: 4 }}
              title="Back to list"
            >
              <Icon name="arrow_back" size={20} />
            </Button>
          )}
          <Icon name="storefront" size={22} />
          <span>{viewTitle[view]}</span>
          {view === 'list' && (
            <Badge bg="secondary" className="ms-2 fw-normal" style={{ fontSize: '0.7rem' }}>
              {venues.length} venues
            </Badge>
          )}
        </Modal.Title>
      </Modal.Header>

      <Modal.Body style={{ background: theme.background, color: theme.text, padding: 0 }}>
        {/* ── LIST VIEW ── */}
        {view === 'list' && (
          <div className="d-flex flex-column h-100">
            {/* Toolbar */}
            <div
              className="d-flex flex-wrap align-items-center gap-2 px-3 py-2"
              style={{ borderBottom: `1px solid ${theme.border}`, background: theme.surface }}
            >
              {/* Search */}
              <InputGroup size="sm" style={{ width: 280 }}>
                <InputGroup.Text style={{ background: theme.inputBg || '#fff' }}>
                  <Icon name="search" size={16} />
                </InputGroup.Text>
                <Form.Control
                  type="text"
                  placeholder="Search name, city, or chain..."
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                  style={{ background: theme.inputBg || '#fff', color: theme.text }}
                />
                {search && (
                  <Button
                    variant="outline-secondary"
                    size="sm"
                    onClick={() => setSearch('')}
                    style={{ borderLeft: 'none' }}
                  >
                    <Icon name="close" size={14} />
                  </Button>
                )}
              </InputGroup>

              {/* Status filter */}
              <div className="d-flex gap-1">
                {[
                  { key: 'open', label: 'Open', count: statusCounts.open },
                  { key: 'closed', label: 'Closed', count: statusCounts.closed },
                  { key: 'all', label: 'All', count: statusCounts.all },
                ].map(({ key, label, count }) => (
                  <Button
                    key={key}
                    size="sm"
                    variant={statusFilter === key ? 'primary' : 'outline-secondary'}
                    onClick={() => setStatusFilter(key)}
                    className="d-flex align-items-center gap-1"
                  >
                    {label}
                    <Badge
                      bg={statusFilter === key ? 'light' : 'secondary'}
                      text={statusFilter === key ? 'dark' : 'light'}
                      pill
                      style={{ fontSize: '0.65rem' }}
                    >
                      {count}
                    </Badge>
                  </Button>
                ))}
              </div>

              {/* Category filter */}
              <Form.Select
                size="sm"
                value={categoryFilter}
                onChange={e => setCategoryFilter(e.target.value)}
                style={{ width: 150 }}
              >
                <option value="">All Categories</option>
                {categories.map(c => (
                  <option key={c} value={c}>{c}</option>
                ))}
              </Form.Select>

              {/* Spacer */}
              <div className="flex-grow-1" />

              {/* Save message */}
              {saveMessage && (
                <Badge bg="success" className="d-flex align-items-center gap-1">
                  <Icon name="check_circle" size={14} /> {saveMessage}
                </Badge>
              )}

              {/* Import button — NOW ENABLED */}
              <Button size="sm" variant="outline-primary" onClick={handleImport}>
                <Icon name="upload_file" size={16} className="me-1" /> Import
              </Button>

              {/* Add venue button */}
              <Button size="sm" variant="success" onClick={handleAdd}>
                <Icon name="add" size={16} className="me-1" /> Add Venue
              </Button>
            </div>

            {/* Loading / Error */}
            {loading && (
              <div className="d-flex justify-content-center align-items-center py-5">
                <Spinner animation="border" size="sm" className="me-2" />
                <span>Loading venues...</span>
              </div>
            )}

            {error && (
              <div className="text-center py-4">
                <div className="text-danger mb-2">
                  <Icon name="error" size={20} className="me-1" /> {error}
                </div>
                <Button size="sm" variant="outline-primary" onClick={loadVenues}>
                  Retry
                </Button>
              </div>
            )}

            {/* Venue table */}
            {!loading && !error && (
              <div className="flex-grow-1" style={{ overflowY: 'auto' }}>
                <Table
                  hover
                  className="mb-0 venue-table"
                  style={{ color: theme.text }}
                >
                  <thead style={{ position: 'sticky', top: 0, background: theme.surface, zIndex: 1 }}>
                    <tr>
                      {[
                        { field: 'name', label: 'Venue Name', width: null },
                        { field: 'city', label: 'City', width: 140 },
                        { field: 'chain', label: 'Chain', width: 140 },
                        { field: 'category', label: 'Category', width: 100 },
                        { field: 'country', label: 'Country', width: 110 },
                        { field: 'status', label: 'Status', width: 90 },
                        { field: null, label: '', width: 50 }, // Actions
                      ].map(({ field, label, width }, i) => (
                        <th
                          key={i}
                          style={{
                            width: width || 'auto',
                            cursor: field ? 'pointer' : 'default',
                            userSelect: 'none',
                            fontSize: '0.8rem',
                            fontWeight: 600,
                            color: theme.textMuted,
                            borderBottom: `2px solid ${theme.border}`,
                            whiteSpace: 'nowrap',
                          }}
                          onClick={() => field && handleSort(field)}
                        >
                          <span className="d-flex align-items-center gap-1">
                            {label}
                            {field && <SortIcon field={field} />}
                          </span>
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {pageVenues.length === 0 && (
                      <tr>
                        <td colSpan={7} className="text-center text-muted py-4">
                          {search || statusFilter !== 'open' || categoryFilter
                            ? 'No venues match your filters'
                            : 'No venues found'}
                        </td>
                      </tr>
                    )}
                    {pageVenues.map(venue => {
                      const status = venue.status || 'open'
                      const badge = STATUS_BADGES[status] || STATUS_BADGES.open

                      return (
                        <tr
                          key={venue.id}
                          onClick={() => handleEdit(venue)}
                          style={{
                            cursor: 'pointer',
                            opacity: status === 'closed' ? 0.6 : 1,
                          }}
                        >
                          <td style={{ fontWeight: 500 }}>
                            {venue.name}
                            {venue.source === 'manual' && (
                              <Badge bg="info" className="ms-2" style={{ fontSize: '0.6rem' }}>Manual</Badge>
                            )}
                            {venue.source === 'import' && (
                              <Badge bg="primary" className="ms-2" style={{ fontSize: '0.6rem' }}>Imported</Badge>
                            )}
                          </td>
                          <td>{venue.city}</td>
                          <td>{venue.chain || <span className="text-muted" style={{ fontSize: '0.8rem' }}>Independent</span>}</td>
                          <td>
                            <span style={{ fontSize: '0.8rem' }}>
                              {CATEGORY_LABELS[venue.category] || venue.category}
                            </span>
                          </td>
                          <td style={{ fontSize: '0.8rem' }}>{venue.country === 'Ireland' ? '🇮🇪' : '🇬🇧'} {venue.country === 'Ireland' ? 'IRE' : 'UK'}</td>
                          <td>
                            <Badge bg={badge.bg} style={{ fontSize: '0.7rem', cursor: 'pointer' }}>
                              {badge.label}
                            </Badge>
                          </td>
                          <td className="text-end">
                            <OverlayTrigger
                              placement="left"
                              overlay={<Tooltip>{status === 'open' ? 'Mark as Closed' : 'Mark as Open'}</Tooltip>}
                            >
                              <span
                                role="button"
                                onClick={(e) => handleToggleStatus(venue, e)}
                                style={{ opacity: 0.5, padding: '2px 4px' }}
                                onMouseEnter={e => e.currentTarget.style.opacity = '1'}
                                onMouseLeave={e => e.currentTarget.style.opacity = '0.5'}
                              >
                                <Icon name={status === 'open' ? 'block' : 'check_circle'} size={16} />
                              </span>
                            </OverlayTrigger>
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </Table>
              </div>
            )}

            {/* Pagination footer */}
            {!loading && filtered.length > PAGE_SIZE && (
              <div
                className="d-flex justify-content-between align-items-center px-3 py-2"
                style={{
                  borderTop: `1px solid ${theme.border}`,
                  background: theme.surface,
                  fontSize: '0.82rem',
                }}
              >
                <span style={{ color: theme.textMuted }}>
                  Showing {((safePage - 1) * PAGE_SIZE) + 1}–{Math.min(safePage * PAGE_SIZE, filtered.length)} of {filtered.length} venues
                </span>
                <div className="d-flex gap-1">
                  <Button
                    size="sm"
                    variant="outline-secondary"
                    disabled={safePage <= 1}
                    onClick={() => setPage(1)}
                    title="First page"
                  >
                    <Icon name="first_page" size={16} />
                  </Button>
                  <Button
                    size="sm"
                    variant="outline-secondary"
                    disabled={safePage <= 1}
                    onClick={() => setPage(p => p - 1)}
                  >
                    <Icon name="chevron_left" size={16} />
                  </Button>

                  {/* Page number buttons */}
                  {(() => {
                    const pages = []
                    let start = Math.max(1, safePage - 2)
                    let end = Math.min(totalPages, start + 4)
                    if (end - start < 4) start = Math.max(1, end - 4)

                    for (let i = start; i <= end; i++) {
                      pages.push(
                        <Button
                          key={i}
                          size="sm"
                          variant={i === safePage ? 'primary' : 'outline-secondary'}
                          onClick={() => setPage(i)}
                          style={{ minWidth: 32 }}
                        >
                          {i}
                        </Button>
                      )
                    }
                    return pages
                  })()}

                  <Button
                    size="sm"
                    variant="outline-secondary"
                    disabled={safePage >= totalPages}
                    onClick={() => setPage(p => p + 1)}
                  >
                    <Icon name="chevron_right" size={16} />
                  </Button>
                  <Button
                    size="sm"
                    variant="outline-secondary"
                    disabled={safePage >= totalPages}
                    onClick={() => setPage(totalPages)}
                    title="Last page"
                  >
                    <Icon name="last_page" size={16} />
                  </Button>
                </div>
              </div>
            )}
          </div>
        )}

        {/* ── ADD / EDIT VIEW ── */}
        {(view === 'add' || view === 'edit') && (
          <VenueForm
            venue={editVenue}
            onSave={handleFormSave}
            onCancel={handleFormCancel}
          />
        )}

        {/* ── IMPORT VIEW ── */}
        {view === 'import' && (
          <VenueImport
            existingVenues={venues}
            onImportComplete={handleImportComplete}
            onCancel={handleFormCancel}
          />
        )}
      </Modal.Body>
    </Modal>
  )
}
