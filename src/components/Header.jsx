import React, { useRef, useState, useMemo } from 'react'
import { Navbar, Nav, Form, Button, Badge, Spinner, OverlayTrigger, Tooltip, Dropdown } from 'react-bootstrap'
import { useApp } from '../context/AppContext'
import { useTheme } from '../context/ThemeContext'
import { tmdbImageUrl } from '../utils/apiClient'
import ExportMenu from './ExportMenu'
import Icon from './Icon'
import VenueManager from './VenueManager'
import FilmCatalogue from './FilmCatalogue'

export default function Header() {
  const {
    filteredVenues,
    importedFilms, selectedFilmId, setSelectedFilmId, clearFilmSelection,
    importComscoreFile, importStatus,
    chainFilter, setChainFilter, availableChains,
    categoryFilter, setCategoryFilter, availableCategories,
    gradeFilter, setGradeFilter,
    selectedFilm,
    showSettings, setShowSettings,
    showMatchReview, setShowMatchReview,
    showTrends, setShowTrends,
    matchDetails,
    populationMode, updatePopulationMode,
    heatmapIntensity, updateHeatmapIntensity,
    catalogue,
    analysisSet, toggleAnalysisFilm, selectAllAnalysis, clearAllAnalysis,
  } = useApp()

  const { themeName, toggleTheme } = useTheme()
  const fileInputRef = useRef(null)
  const [localIntensity, setLocalIntensity] = useState(heatmapIntensity)

  // ── Venue Manager state (local to Header) ──
  const [showVenueManager, setShowVenueManager] = useState(false)

  // ── Film Catalogue state (local to Header) ──
  const [showCatalogue, setShowCatalogue] = useState(false)

  const handleFileClick = () => fileInputRef.current?.click()

  const handleFileChange = async (e) => {
    const file = e.target.files?.[0]
    if (!file) return
    try {
      await importComscoreFile(file)
    } catch (err) {
      console.error('Import failed:', err)
    }
    e.target.value = ''
  }

  const handleFilmSelect = (filmId) => {
    if (filmId === '') {
      clearFilmSelection()
    } else {
      setSelectedFilmId(filmId)
    }
  }

  const toggleGradeFilter = (grade) => {
    setGradeFilter(prev => {
      if (prev.includes(grade)) {
        // Deselect this grade
        return prev.filter(g => g !== grade)
      } else {
        // Add this grade
        return [...prev, grade]
      }
    })
  }

  return (
    <>
      <Navbar variant="dark" expand="lg" className="px-3 py-2 app-header">
        {/* Brand */}
        <Navbar.Brand className="d-flex align-items-center me-3">
          <span className="me-2" style={{ fontSize: '1.3rem' }}><Icon name="movie" size={24} /></span>
          <span className="fw-bold">CineScope</span>
          <Badge bg="secondary" className="ms-2 fw-normal" style={{ fontSize: '0.6rem' }}>v1.6</Badge>
        </Navbar.Brand>

        <Navbar.Toggle aria-controls="header-nav" />
        <Navbar.Collapse id="header-nav">
          <Nav className="me-auto d-flex align-items-center gap-2 flex-wrap">

            {/* Film selector with poster thumbnails + analysis checkboxes */}
            <FilmSelector
              catalogue={catalogue}
              importedFilms={importedFilms}
              selectedFilmId={selectedFilmId}
              onSelect={handleFilmSelect}
              analysisSet={analysisSet}
              onToggleAnalysis={toggleAnalysisFilm}
              onSelectAll={selectAllAnalysis}
              onClearAll={clearAllAnalysis}
            />

            {/* Chain filter */}
            <Form.Select
              size="sm"
              value={chainFilter}
              onChange={e => setChainFilter(e.target.value)}
              className="header-select"
              style={{ width: 160 }}
            >
              <option value="">All Chains</option>
              {availableChains.map(c => (
                <option key={c} value={c}>{c}</option>
              ))}
            </Form.Select>

            {/* Category filter */}
            <Form.Select
              size="sm"
              value={categoryFilter}
              onChange={e => setCategoryFilter(e.target.value)}
              className="header-select"
              style={{ width: 150 }}
            >
              <option value="">All Categories</option>
              {availableCategories.map(c => (
                <option key={c} value={c}>{c}</option>
              ))}
            </Form.Select>

            {/* Grade quick-filters — individual toggle buttons, synced with sidebar */}
            {selectedFilm && (
              <div className="d-flex gap-1 ms-1">
                {['A', 'B', 'C', 'D'].map(grade => {
                  const isActive = gradeFilter.includes(grade)
                  const gradeInfo = {
                    A: { color: '#27ae60', variant: 'success' },
                    B: { color: '#f1c40f', variant: 'warning' },
                    C: { color: '#e67e22', variant: 'warning' },
                    D: { color: '#e74c3c', variant: 'danger' },
                  }[grade]

                  return (
                    <Button
                      key={grade}
                      size="sm"
                      style={isActive ? {
                        backgroundColor: gradeInfo.color,
                        borderColor: gradeInfo.color,
                        color: '#fff',
                      } : {
                        backgroundColor: 'transparent',
                        borderColor: gradeInfo.color,
                        color: gradeInfo.color,
                      }}
                      onClick={() => toggleGradeFilter(grade)}
                    >
                      {grade}
                    </Button>
                  )
                })}
              </div>
            )}
          </Nav>

          <Nav className="d-flex align-items-center gap-2">
            {/* Import status */}
            {importStatus?.loading && (
              <Spinner animation="border" size="sm" variant="light" />
            )}
            {importStatus?.success && (
              <Badge bg="success" className="text-truncate" style={{ maxWidth: 200 }}>
                <Icon name="check_circle" size={14} className="me-1" /> {importStatus.success}
              </Badge>
            )}
            {importStatus?.error && (
              <Badge bg="danger" className="text-truncate" style={{ maxWidth: 200 }}>
                <Icon name="error" size={14} className="me-1" /> {importStatus.error}
              </Badge>
            )}

            {/* File upload */}
            <input
              type="file"
              ref={fileInputRef}
              onChange={handleFileChange}
              accept=".csv,.xls,.xlsx"
              className="d-none"
            />
            <Button size="sm" variant="outline-light" onClick={handleFileClick}>
              <Icon name="upload_file" size={16} className="me-1" /> Import
            </Button>

            {/* Film Catalogue */}
            <OverlayTrigger
              placement="bottom"
              overlay={<Tooltip>Browse and manage film catalogue</Tooltip>}
            >
              <Button
                size="sm"
                variant="outline-light"
                onClick={() => setShowCatalogue(true)}
                className="d-flex align-items-center gap-1"
              >
                <Icon name="movie" size={16} />
                <span style={{ fontSize: '0.78rem' }}>Catalogue</span>
              </Button>
            </OverlayTrigger>

            {/* Population layer toggle */}
            <Dropdown>
              <OverlayTrigger
                placement="bottom"
                overlay={<Tooltip>Population density layer</Tooltip>}
              >
                <Dropdown.Toggle
                  size="sm"
                  variant={populationMode !== 'off' ? 'info' : 'outline-light'}
                  id="pop-toggle"
                  className="d-flex align-items-center gap-1"
                >
                  <Icon name="groups" size={16} />
                  <span style={{ fontSize: '0.78rem' }}>
                    {populationMode === 'off' ? 'Population' : populationMode === 'heatmap' ? 'Heat Map' : 'Area Zones'}
                  </span>
                </Dropdown.Toggle>
              </OverlayTrigger>
              <Dropdown.Menu style={{ minWidth: 220, fontSize: '0.85rem' }}>
                <Dropdown.Header style={{ fontSize: '0.72rem', fontWeight: 700 }}>
                  Population Overlay
                </Dropdown.Header>
                {[
                  { key: 'off', label: 'Off', icon: 'visibility_off' },
                  { key: 'heatmap', label: 'Heat Map', icon: 'local_fire_department' },
                  { key: 'zones', label: 'Area Zones', icon: 'map' },
                ].map(({ key, label, icon }) => (
                  <Dropdown.Item
                    key={key}
                    active={populationMode === key}
                    onClick={() => updatePopulationMode(key)}
                  >
                    <Icon name={icon} size={16} className="me-2" />
                    {label}
                  </Dropdown.Item>
                ))}
                {(populationMode === 'heatmap' || populationMode === 'zones') && (
                  <>
                    <Dropdown.Divider />
                    <div className="px-3 py-1">
                      <div style={{ fontSize: '0.72rem', fontWeight: 600, color: '#888', marginBottom: 4 }}>
                        Intensity
                      </div>
                      <Form.Range
                        min={0.1}
                        max={1.0}
                        step={0.05}
                        value={localIntensity}
                        onChange={e => setLocalIntensity(parseFloat(e.target.value))}
                        onPointerUp={e => updateHeatmapIntensity(parseFloat(e.target.value))}
                        onTouchEnd={e => updateHeatmapIntensity(parseFloat(e.target.value))}
                      />
                    </div>
                  </>
                )}
              </Dropdown.Menu>
            </Dropdown>

            {/* Export menu */}
            <ExportMenu />

            {/* Trend analysis button — only when 2+ films imported */}
            {importedFilms.length >= 2 && (
              <OverlayTrigger
                placement="bottom"
                overlay={<Tooltip>Trend analysis across {importedFilms.length} films</Tooltip>}
              >
                <Button
                  size="sm"
                  variant="outline-light"
                  onClick={() => setShowTrends(true)}
                  className="d-flex align-items-center gap-1"
                >
                  <Icon name="insights" size={16} />
                  <span style={{ fontSize: '0.78rem' }}>Trends</span>
                </Button>
              </OverlayTrigger>
            )}

            {/* Match review button — only when film loaded */}
            {selectedFilm && matchDetails.length > 0 && (() => {
              const reviewCount = matchDetails.filter(m => m.confidence.key === 'medium' || m.confidence.key === 'low').length
              return (
                <OverlayTrigger
                  placement="bottom"
                  overlay={<Tooltip>Review venue matching ({reviewCount > 0 ? `${reviewCount} need attention` : 'all good'})</Tooltip>}
                >
                  <Button
                    size="sm"
                    variant={reviewCount > 0 ? 'outline-warning' : 'outline-light'}
                    onClick={() => setShowMatchReview(true)}
                    className="position-relative"
                  >
                    <Icon name="link" size={18} />
                    {reviewCount > 0 && (
                      <Badge
                        bg="danger"
                        pill
                        className="position-absolute"
                        style={{ top: -4, right: -6, fontSize: '0.6rem' }}
                      >
                        {reviewCount}
                      </Badge>
                    )}
                  </Button>
                </OverlayTrigger>
              )
            })()}

            {/* ▼▼▼ NEW: Venue Manager button ▼▼▼ */}
            <OverlayTrigger
              placement="bottom"
              overlay={<Tooltip>Manage venues (add, edit, import)</Tooltip>}
            >
              <Button
                size="sm"
                variant="outline-light"
                onClick={() => setShowVenueManager(true)}
              >
                <Icon name="storefront" size={18} />
              </Button>
            </OverlayTrigger>
            {/* ▲▲▲ END NEW ▲▲▲ */}

            {/* Settings */}
            <OverlayTrigger
              placement="bottom"
              overlay={<Tooltip>Grade boundary settings</Tooltip>}
            >
              <Button
                size="sm"
                variant="outline-light"
                onClick={() => setShowSettings(true)}
              >
                <Icon name="settings" size={18} />
              </Button>
            </OverlayTrigger>

            {/* Theme toggle */}
            <OverlayTrigger
              placement="bottom"
              overlay={<Tooltip>Switch to {themeName === 'light' ? 'dark' : 'light'} theme</Tooltip>}
            >
              <Button
                size="sm"
                variant="outline-light"
                onClick={toggleTheme}
                style={{ minWidth: 36 }}
              >
                {themeName === 'light' ? <Icon name="dark_mode" size={18} /> : <Icon name="light_mode" size={18} />}
              </Button>
            </OverlayTrigger>

            {/* Venue count */}
          </Nav>
        </Navbar.Collapse>
      </Navbar>

      {/* ▼▼▼ NEW: Venue Manager modal (rendered outside Navbar) ▼▼▼ */}
      <VenueManager
        show={showVenueManager}
        onHide={() => setShowVenueManager(false)}
      />
      {/* ▲▲▲ END NEW ▲▲▲ */}

      {/* Film Catalogue overlay */}
      <FilmCatalogue
        show={showCatalogue}
        onHide={() => setShowCatalogue(false)}
      />
    </>
  )
}


/**
 * FilmSelector — redesigned dropdown with poster thumbnails, analysis checkboxes,
 * and unified catalogue-based film list. No delete buttons (deletion via Catalogue only).
 */
function FilmSelector({ catalogue, importedFilms, selectedFilmId, onSelect, analysisSet, onToggleAnalysis, onSelectAll, onClearAll }) {
  const [search, setSearch] = useState('')
  const [open, setOpen] = useState(false)

  // Films with Comscore data (for checkbox eligibility)
  const filmsWithData = useMemo(() =>
    catalogue.filter(f => parseInt(f.import_count) > 0),
    [catalogue]
  )

  // Filter catalogue by search term
  const filteredCatalogue = useMemo(() => {
    if (!search.trim()) return catalogue
    const term = search.toLowerCase()
    return catalogue.filter(f =>
      (f.title || '').toLowerCase().includes(term)
    )
  }, [catalogue, search])

  // Analysis set count
  const analysisCount = analysisSet.length
  const totalWithData = filmsWithData.length

  // Get selected film label
  const selectedLabel = useMemo(() => {
    if (!selectedFilmId) return 'All Venues (no film)'
    if (selectedFilmId === 'all-films') return `Selected Films (${analysisCount})`
    const film = catalogue.find(f => f.id === selectedFilmId)
    if (film) return film.title
    const imp = importedFilms.find(f => f.id === selectedFilmId)
    return imp ? (imp.filmInfo.title || 'Untitled') : 'Select film...'
  }, [selectedFilmId, catalogue, importedFilms, analysisCount])

  const handleSelect = (id) => {
    onSelect(id)
    setOpen(false)
    setSearch('')
  }

  // Map catalogue IDs to importedFilm IDs for selection
  const getImportedFilmId = (catEntry) => {
    const imp = importedFilms.find(f => f.catalogueId === catEntry.id)
    return imp ? imp.id : null
  }

  if (catalogue.length === 0) {
    return (
      <Button size="sm" variant="dark" disabled
        style={{ width: 240, backgroundColor: 'rgba(255,255,255,0.1)', borderColor: 'rgba(255,255,255,0.2)' }}>
        No films yet
      </Button>
    )
  }

  return (
    <Dropdown show={open} onToggle={setOpen} autoClose="outside">
      <Dropdown.Toggle
        size="sm"
        variant="dark"
        className="header-select text-start d-flex align-items-center justify-content-between"
        style={{ width: 260, backgroundColor: 'rgba(255,255,255,0.1)', borderColor: 'rgba(255,255,255,0.2)' }}
      >
        <span className="text-truncate">{selectedLabel}</span>
      </Dropdown.Toggle>

      <Dropdown.Menu
        className="film-selector-menu"
        style={{ minWidth: 360, maxHeight: 480, overflowY: 'auto', fontSize: '0.85rem' }}
      >
        {/* Search */}
        {catalogue.length > 3 && (
          <div className="px-2 pb-2">
            <Form.Control
              size="sm"
              type="text"
              placeholder="Search films..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              autoFocus
            />
          </div>
        )}

        {/* No film option */}
        <Dropdown.Item
          active={!selectedFilmId}
          onClick={() => handleSelect('')}
          className="py-2"
        >
          <Icon name="map" size={16} className="me-2 opacity-50" />
          All Venues (no film)
        </Dropdown.Item>

        {/* Selected Films (Combined) — only if 2+ films in analysis set */}
        {analysisCount >= 2 && (
          <Dropdown.Item
            active={selectedFilmId === 'all-films'}
            onClick={() => handleSelect('all-films')}
            className="py-2"
          >
            <Icon name="trending_up" size={16} className="me-2" />
            Selected Films ({analysisCount} of {totalWithData})
          </Dropdown.Item>
        )}

        <Dropdown.Divider className="my-1" />

        {/* Select All / Deselect All toggles */}
        {totalWithData > 1 && (
          <div className="d-flex gap-2 px-3 py-1 mb-1">
            <button
              className="btn btn-link btn-sm p-0 text-decoration-none"
              style={{ fontSize: '0.72rem', color: '#4ade80' }}
              onClick={(e) => { e.stopPropagation(); onSelectAll(); }}
            >
              <Icon name="check_box" size={14} className="me-1" />Select All
            </button>
            <button
              className="btn btn-link btn-sm p-0 text-decoration-none"
              style={{ fontSize: '0.72rem', color: '#aaa' }}
              onClick={(e) => { e.stopPropagation(); onClearAll(); }}
            >
              <Icon name="check_box_outline_blank" size={14} className="me-1" />Deselect All
            </button>
          </div>
        )}

        {/* Film list */}
        {filteredCatalogue.map(catFilm => {
          const hasData = parseInt(catFilm.import_count) > 0
          const isInAnalysis = analysisSet.includes(catFilm.id)
          const importedFilmId = getImportedFilmId(catFilm)
          const isActive = selectedFilmId === importedFilmId || selectedFilmId === catFilm.id
          const posterUrl = catFilm.poster_path ? tmdbImageUrl(catFilm.poster_path, 'w92') : null

          return (
            <Dropdown.Item
              key={catFilm.id}
              active={isActive}
              onClick={() => {
                if (hasData && importedFilmId) {
                  handleSelect(importedFilmId)
                }
              }}
              className="d-flex align-items-center gap-2 py-2"
              style={{ opacity: hasData ? 1 : 0.5, cursor: hasData ? 'pointer' : 'default' }}
            >
              {/* Poster thumbnail */}
              <div style={{
                width: 32, height: 48, borderRadius: 3, overflow: 'hidden', flexShrink: 0,
                background: posterUrl ? 'transparent' : 'linear-gradient(135deg, #2d1f3d, #1f2d3d)',
              }}>
                {posterUrl ? (
                  <img src={posterUrl} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                ) : (
                  <div className="d-flex align-items-center justify-content-center h-100">
                    <Icon name="movie" size={16} style={{ color: '#555' }} />
                  </div>
                )}
              </div>

              {/* Film info */}
              <div style={{ flex: 1, minWidth: 0 }}>
                <div className="text-truncate fw-semibold" style={{ fontSize: '0.82rem' }}>
                  {catFilm.title}
                </div>
                {hasData ? (
                  <div className="text-muted" style={{ fontSize: '0.7rem' }}>
                    {catFilm.import_count} import{catFilm.import_count > 1 ? 's' : ''} · £{parseInt(catFilm.total_uk_revenue).toLocaleString()}
                  </div>
                ) : (
                  <div style={{ fontSize: '0.7rem', color: '#777' }}>No Comscore data</div>
                )}
              </div>

              {/* Analysis checkbox (only for films with data) */}
              {hasData && (
                <span
                  role="button"
                  title={isInAnalysis ? 'Remove from combined analysis' : 'Add to combined analysis'}
                  onClick={(e) => { e.stopPropagation(); onToggleAnalysis(catFilm.id); }}
                  style={{ flexShrink: 0, cursor: 'pointer', fontSize: '18px' }}
                >
                  <Icon
                    name={isInAnalysis ? 'check_box' : 'check_box_outline_blank'}
                    size={18}
                    style={{ color: isInAnalysis ? '#4ade80' : '#666' }}
                  />
                </span>
              )}
            </Dropdown.Item>
          )
        })}

        {filteredCatalogue.length === 0 && search && (
          <Dropdown.ItemText className="text-muted text-center">
            No films match "{search}"
          </Dropdown.ItemText>
        )}
      </Dropdown.Menu>
    </Dropdown>
  )
}
