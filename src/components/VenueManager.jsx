/**
 * CineScope — Venue Manager (Restyled v3.3)
 *
 * Full-screen modal or inline view for browsing, adding, editing,
 * and importing venues. Matches the cinescope_redesign_v2 mockup.
 *
 * Internal view states:
 *   'list'   — searchable/sortable venue table with pagination
 *   'add'    — blank VenueForm for creating a new venue
 *   'edit'   — VenueForm pre-filled with selected venue data
 *   'import' — VenueImport for spreadsheet upload
 */

import React, { useState, useEffect, useMemo, useCallback } from 'react'
import { Modal } from 'react-bootstrap'
import { useAuth } from '@clerk/clerk-react'
import { useApp } from '../context/AppContext'
import { useTheme } from '../context/ThemeContext'
import Icon from './Icon'
import VenueForm from './VenueForm'
import VenueImport from './VenueImport'
import * as venueApi from '../utils/venueApi'

const CATEGORY_LABELS = {
  'Large Chain': 'Large',
  'Small Chain': 'Small',
  'Independent': 'Indie',
}

export default function VenueManager({ show, onHide, inline = false }) {
  const { getToken } = useAuth()
  const { refreshVenues } = useApp()
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

  // Load venues when modal opens or inline view mounts
  useEffect(() => {
    if (show || inline) {
      loadVenues()
      setView('list')
      setEditVenue(null)
      setSearch('')
      setSaveMessage(null)
    }
  }, [show, inline, loadVenues])


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

  // Reset filters when search changes (no-op placeholder for future use)
  // useEffect(() => {}, [search, statusFilter, categoryFilter])

  // Unique categories from loaded venues
  const categories = useMemo(() => {
    return [...new Set(venues.map(v => v.category).filter(Boolean))].sort()
  }, [venues])

  // Counts for status badges
  const statusCounts = useMemo(() => {
    const open = venues.filter(v => (v.status || 'open') === 'open').length
    return { open, closed: venues.length - open, all: venues.length }
  }, [venues])

  // Stat card data
  const stats = useMemo(() => {
    const chains = new Set(venues.map(v => v.chain).filter(Boolean))
    const indieCount = venues.filter(v => !v.chain || v.chain === 'Independent').length
    return {
      total: venues.length,
      chains: chains.size,
      open: statusCounts.open,
      closed: statusCounts.closed,
      indie: indieCount,
    }
  }, [venues, statusCounts])


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
      setVenues(prev => prev.map(v =>
        v.id === venue.id
          ? { ...v, status: v.status === 'open' ? 'closed' : 'open' }
          : v
      ))
      refreshVenues()
    } catch (err) {
      console.error('Failed to toggle status:', err)
    }
  }

  const handleFormSave = async (savedVenue) => {
    await loadVenues()
    await refreshVenues()
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
    await refreshVenues()
    setView('list')
    const count = result?.imported ?? 0
    setSaveMessage(`${count} venue${count !== 1 ? 's' : ''} imported successfully`)
    setTimeout(() => setSaveMessage(null), 5000)
  }

  // Sort icon helper
  const SortArrow = ({ field }) => {
    if (sortField !== field) {
      return <Icon name="unfold_more" size={13} style={{ opacity: 0.3, verticalAlign: 'middle', marginLeft: 2 }} />
    }
    return (
      <Icon
        name={sortDir === 'asc' ? 'arrow_upward' : 'arrow_downward'}
        size={13}
        style={{ verticalAlign: 'middle', marginLeft: 2 }}
      />
    )
  }



  // ═══════════════════════════════════════════════════════════════
  // COLUMN DEFINITIONS
  // ═══════════════════════════════════════════════════════════════

  const columns = [
    { field: 'name',     label: 'Venue' },
    { field: 'chain',    label: 'Chain',    width: 130 },
    { field: 'city',     label: 'City',     width: 140 },
    { field: 'category', label: 'Category', width: 90 },
    { field: 'country',  label: 'Country',  width: 90 },
    { field: 'status',   label: 'Status',   width: 90 },
  ]


  // ═══════════════════════════════════════════════════════════════
  // RENDER — LIST VIEW
  // ═══════════════════════════════════════════════════════════════

  const listContent = (
    <div className="cs-vm">
      {/* ── Toolbar ── */}
      <div className="cs-vm__toolbar">
        <h1 className="cs-vm__title">
          Venue Manager
          <span className="cs-vm__count-badge">{venues.length} venues</span>
        </h1>
        <div className="cs-vm__toolbar-right">
          <button className="cs-vm__btn" onClick={handleImport}>
            <Icon name="upload_file" size={16} /> Import
          </button>
          <button className="cs-vm__btn cs-vm__btn--primary" onClick={handleAdd}>
            <Icon name="add" size={16} /> Add Venue
          </button>
        </div>
      </div>

      {/* ── Stat Cards ── */}
      <div className="cs-vm__stats">
        <div className="cs-vm__stat-card">
          <div className="cs-vm__stat-label">Total Venues</div>
          <div className="cs-vm__stat-value">{stats.total}</div>
          <div className="cs-vm__stat-sub">Master list</div>
        </div>
        <div className="cs-vm__stat-card">
          <div className="cs-vm__stat-label">Chains</div>
          <div className="cs-vm__stat-value">{stats.chains}</div>
          <div className="cs-vm__stat-sub">Cinema groups</div>
        </div>
        <div className="cs-vm__stat-card">
          <div className="cs-vm__stat-label">Open</div>
          <div className="cs-vm__stat-value">{stats.open}</div>
          <div className="cs-vm__stat-sub">Active venues</div>
        </div>
        <div className="cs-vm__stat-card">
          <div className="cs-vm__stat-label">Closed</div>
          <div className="cs-vm__stat-value cs-vm__stat-value--red">{stats.closed}</div>
          <div className="cs-vm__stat-sub">Venues marked closed</div>
        </div>
      </div>

      {/* ── Filter Row ── */}
      <div className="cs-vm__filters">
        <div className="cs-vm__search-wrap">
          <Icon name="search" size={18} />
          <input
            type="text"
            className="cs-vm__search"
            placeholder="Search name, city, or chain..."
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
        </div>

        <div className="cs-vm__status-pills">
          {[
            { key: 'open', label: 'Open', count: statusCounts.open },
            { key: 'closed', label: 'Closed', count: statusCounts.closed },
            { key: 'all', label: 'All', count: statusCounts.all },
          ].map(({ key, label, count }) => (
            <button
              key={key}
              className={`cs-vm__pill ${statusFilter === key ? 'cs-vm__pill--active' : ''}`}
              onClick={() => setStatusFilter(key)}
            >
              {label}
              <span className="cs-vm__pill-count">{count}</span>
            </button>
          ))}
        </div>

        <select
          className="cs-vm__select"
          value={categoryFilter}
          onChange={e => setCategoryFilter(e.target.value)}
        >
          <option value="">All Categories</option>
          {categories.map(c => (
            <option key={c} value={c}>{c}</option>
          ))}
        </select>

        <div className="cs-vm__spacer" />

        {saveMessage && (
          <div className="cs-vm__save-msg">
            <Icon name="check_circle" size={14} /> {saveMessage}
          </div>
        )}
      </div>

      {/* ── Loading ── */}
      {loading && (
        <div className="cs-vm__loading">
          <Icon name="progress_activity" size={20} /> Loading venues...
        </div>
      )}

      {/* ── Error ── */}
      {error && (
        <div className="cs-vm__error">
          <Icon name="error" size={18} /> {error}
          <br />
          <button
            className="cs-vm__btn"
            style={{ margin: '12px auto 0', display: 'inline-flex' }}
            onClick={loadVenues}
          >
            Retry
          </button>
        </div>
      )}

      {/* ── Table ── */}
      {!loading && !error && (
        <div className="cs-vm__table-wrap">
          <div className="cs-vm__table-scroll">
            <table className="cs-vm__table">
              <thead>
                <tr>
                  {columns.map(({ field, label, width }) => (
                    <th
                      key={field}
                      className={field ? 'cs-vm__sortable' : ''}
                      style={width ? { width } : undefined}
                      onClick={() => field && handleSort(field)}
                    >
                      {label}
                      {field && <SortArrow field={field} />}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filtered.length === 0 && (
                  <tr>
                    <td colSpan={columns.length} className="cs-vm__empty">
                      {search || statusFilter !== 'open' || categoryFilter
                        ? 'No venues match your filters'
                        : 'No venues found'}
                    </td>
                  </tr>
                )}
                {filtered.map(venue => {
                  const status = venue.status || 'open'
                  const isChain = venue.chain && venue.chain !== 'Independent'

                  return (
                    <tr
                      key={venue.id}
                      className={status === 'closed' ? 'cs-vm__row--closed' : ''}
                      onClick={() => handleEdit(venue)}
                    >
                      {/* Venue name */}
                      <td>
                        <span className="cs-vm__venue-name">{venue.name}</span>
                        {venue.source === 'manual' && (
                          <span className="cs-vm__source-tag cs-vm__source-tag--manual">Manual</span>
                        )}
                        {venue.source === 'import' && (
                          <span className="cs-vm__source-tag cs-vm__source-tag--import">Import</span>
                        )}
                      </td>

                      {/* Chain */}
                      <td>
                        {isChain ? (
                          <span className="cs-vm__chain-badge">{venue.chain}</span>
                        ) : (
                          <span className="cs-vm__chain-badge cs-vm__chain-badge--indie">Independent</span>
                        )}
                      </td>

                      {/* City */}
                      <td>{venue.city}</td>

                      {/* Category */}
                      <td>
                        <span className="cs-vm__category">
                          {CATEGORY_LABELS[venue.category] || venue.category}
                        </span>
                      </td>

                      {/* Country */}
                      <td>
                        <span className="cs-vm__country">
                          <img
                            src={venue.country === 'Ireland'
                              ? 'https://flagcdn.com/16x12/ie.png'
                              : 'https://flagcdn.com/16x12/gb.png'}
                            alt=""
                            width="16"
                            height="12"
                            className="cs-vm__flag"
                          />
                          {venue.country === 'Ireland' ? ' IRE' : ' UK'}
                        </span>
                      </td>

                      {/* Status */}
                      <td>
                        <span
                          className={`cs-vm__status cs-vm__status--${status}`}
                          onClick={(e) => handleToggleStatus(venue, e)}
                          title={status === 'open' ? 'Click to mark Closed' : 'Click to mark Open'}
                        >
                          {status === 'open' ? 'Open' : 'Closed'}
                        </span>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>

          {/* ── Venue Count ── */}
          <div className="cs-vm__list-footer">
            Showing {filtered.length} of {venues.length} venues
          </div>
        </div>
      )}
    </div>
  )


  // ═══════════════════════════════════════════════════════════════
  // RENDER — ADD / EDIT / IMPORT (sub-views with back nav)
  // ═══════════════════════════════════════════════════════════════

  const subViewHeader = (title) => (
    <div className="cs-vm__sub-header">
      <button className="cs-vm__back-btn" onClick={handleFormCancel} title="Back to list">
        <Icon name="arrow_back" size={18} />
      </button>
      <span className="cs-vm__sub-title">{title}</span>
    </div>
  )

  const bodyContent = (
    <>
      {view === 'list' && listContent}

      {(view === 'add' || view === 'edit') && (
        <div className="cs-vm">
          {subViewHeader(view === 'add' ? 'Add New Venue' : `Edit: ${editVenue?.name || 'Venue'}`)}
          <VenueForm
            venue={editVenue}
            onSave={handleFormSave}
            onCancel={handleFormCancel}
          />
        </div>
      )}

      {view === 'import' && (
        <div className="cs-vm">
          {subViewHeader('Import Venues')}
          <VenueImport
            existingVenues={venues}
            onImportComplete={handleImportComplete}
            onCancel={handleFormCancel}
          />
        </div>
      )}
    </>
  )


  // ═══════════════════════════════════════════════════════════════
  // RENDER — INLINE vs MODAL wrapper
  // ═══════════════════════════════════════════════════════════════

  // ── INLINE MODE: render as a div ──
  if (inline) {
    return (
      <div
        className="d-flex flex-column h-100"
        style={{ background: 'var(--cs-body)', color: 'var(--cs-text)' }}
      >
        {bodyContent}
      </div>
    )
  }

  // ── MODAL MODE: existing behaviour ──
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
        <Modal.Title style={{ color: theme.headerText || '#fff' }}>
          <div className="d-flex align-items-center gap-2">
            <Icon name="storefront" size={22} />
            <span className="fw-bold">Venue Manager</span>
          </div>
        </Modal.Title>
      </Modal.Header>
      <Modal.Body style={{ background: 'var(--cs-body)', color: 'var(--cs-text)', padding: 0 }}>
        {bodyContent}
      </Modal.Body>
    </Modal>
  )
}
