import React, { useRef, useState, useMemo } from 'react'
import { Navbar, Nav, Form, Button, Badge, Spinner, OverlayTrigger, Tooltip, Dropdown } from 'react-bootstrap'
import { useApp } from '../context/AppContext'
import { useTheme } from '../context/ThemeContext'
import ExportMenu from './ExportMenu'
import Icon from './Icon'

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
    matchDetails,
    populationMode, updatePopulationMode,
    heatmapIntensity, updateHeatmapIntensity,
  } = useApp()

  const { themeName, toggleTheme } = useTheme()
  const fileInputRef = useRef(null)

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

  const toggleGradeFilter = (grades) => {
    const current = JSON.stringify(gradeFilter)
    const target = JSON.stringify(grades)
    setGradeFilter(current === target ? [] : grades)
  }

  return (
    <Navbar variant="dark" expand="lg" className="px-3 py-2 app-header">
      {/* Brand */}
      <Navbar.Brand className="d-flex align-items-center me-3">
        <span className="me-2" style={{ fontSize: '1.3rem' }}><Icon name="movie" size={24} /></span>
        <span className="fw-bold">CineScope</span>
        <Badge bg="secondary" className="ms-2 fw-normal" style={{ fontSize: '0.6rem' }}>v1.5</Badge>
      </Navbar.Brand>

      <Navbar.Toggle aria-controls="header-nav" />
      <Navbar.Collapse id="header-nav">
        <Nav className="me-auto d-flex align-items-center gap-2 flex-wrap">

          {/* Film selector with search + year grouping */}
          <FilmSelector
            importedFilms={importedFilms}
            selectedFilmId={selectedFilmId}
            onSelect={handleFilmSelect}
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

          {/* Grade quick-filters */}
          {selectedFilm && (
            <div className="d-flex gap-1 ms-1">
              <Button
                size="sm"
                variant={JSON.stringify(gradeFilter) === JSON.stringify(['B', 'C']) ? 'warning' : 'outline-warning'}
                onClick={() => toggleGradeFilter(['B', 'C'])}
                title="Marketing targets (Grade B + C)"
              >
                B+C Targets
              </Button>
              <Button
                size="sm"
                variant={JSON.stringify(gradeFilter) === JSON.stringify(['A']) ? 'success' : 'outline-success'}
                onClick={() => toggleGradeFilter(['A'])}
              >
                A
              </Button>
              <Button
                size="sm"
                variant={JSON.stringify(gradeFilter) === JSON.stringify(['D']) ? 'danger' : 'outline-danger'}
                onClick={() => toggleGradeFilter(['D'])}
              >
                D
              </Button>
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
            <Icon name="upload_file" size={16} className="me-1" /> Import Comscore
          </Button>

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
                      value={heatmapIntensity}
                      onChange={e => updateHeatmapIntensity(parseFloat(e.target.value))}
                    />
                  </div>
                </>
              )}
            </Dropdown.Menu>
          </Dropdown>

          {/* Export menu */}
          <ExportMenu />

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
          <Badge bg="info">{filteredVenues.length} venues</Badge>
        </Nav>
      </Navbar.Collapse>
    </Navbar>
  )
}


/**
 * FilmSelector — searchable dropdown with year grouping and All Films aggregate
 */
function FilmSelector({ importedFilms, selectedFilmId, onSelect }) {
  const [search, setSearch] = useState('')
  const [open, setOpen] = useState(false)

  // Group films by year
  const grouped = useMemo(() => {
    if (importedFilms.length === 0) return {}

    const groups = {}
    for (const film of importedFilms) {
      // Try to extract year from dateRange, fileName, or import timestamp
      const yearMatch = (film.filmInfo.dateRange || film.filmInfo.fileName || '').match(/20\d{2}/)
      const year = yearMatch ? yearMatch[0] : 'Other'

      if (!groups[year]) groups[year] = []
      groups[year].push(film)
    }

    // Sort years descending
    return Object.fromEntries(
      Object.entries(groups).sort(([a], [b]) => b.localeCompare(a))
    )
  }, [importedFilms])

  // Filter by search term
  const filteredFilms = useMemo(() => {
    if (!search.trim()) return importedFilms
    const term = search.toLowerCase()
    return importedFilms.filter(f =>
      (f.filmInfo.title || '').toLowerCase().includes(term) ||
      (f.filmInfo.fileName || '').toLowerCase().includes(term)
    )
  }, [importedFilms, search])

  // Get selected film label
  const selectedLabel = useMemo(() => {
    if (!selectedFilmId) return 'All Venues (no film)'
    if (selectedFilmId === 'all-films') return 'All Films (Combined)'
    const film = importedFilms.find(f => f.id === selectedFilmId)
    return film ? (film.filmInfo.title || film.filmInfo.fileName) : 'Select film...'
  }, [selectedFilmId, importedFilms])

  const handleSelect = (id) => {
    onSelect(id)
    setOpen(false)
    setSearch('')
  }

  // If no films imported yet, show a simple disabled select
  if (importedFilms.length === 0) {
    return (
      <Form.Select
        size="sm"
        disabled
        className="header-select"
        style={{ width: 200 }}
      >
        <option>No films imported</option>
      </Form.Select>
    )
  }

  return (
    <Dropdown show={open} onToggle={setOpen} autoClose="outside">
      <Dropdown.Toggle
        size="sm"
        variant="dark"
        className="header-select text-start d-flex align-items-center justify-content-between"
        style={{ width: 240, backgroundColor: 'rgba(255,255,255,0.1)', borderColor: 'rgba(255,255,255,0.2)' }}
      >
        <span className="text-truncate">{selectedLabel}</span>
      </Dropdown.Toggle>

      <Dropdown.Menu
        style={{
          minWidth: 280,
          maxHeight: 350,
          overflowY: 'auto',
          fontSize: '0.85rem',
        }}
      >
        {/* Search input */}
        {importedFilms.length > 3 && (
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
        >
          All Venues (no film)
        </Dropdown.Item>

        {/* All Films aggregate */}
        {importedFilms.length > 1 && (
          <Dropdown.Item
            active={selectedFilmId === 'all-films'}
            onClick={() => handleSelect('all-films')}
          >
            <Icon name="trending_up" size={16} className="me-1" /> All Films (Combined)
            <span className="text-muted ms-1" style={{ fontSize: '0.75rem' }}>
              {importedFilms.length} films
            </span>
          </Dropdown.Item>
        )}

        <Dropdown.Divider />

        {/* Films grouped by year */}
        {Object.entries(grouped).map(([year, films]) => {
          const visibleFilms = films.filter(f => filteredFilms.includes(f))
          if (visibleFilms.length === 0) return null

          return (
            <React.Fragment key={year}>
              <Dropdown.Header style={{ fontSize: '0.72rem', fontWeight: 700 }}>
                {year}
              </Dropdown.Header>
              {visibleFilms.map(film => (
                <Dropdown.Item
                  key={film.id}
                  active={selectedFilmId === film.id}
                  onClick={() => handleSelect(film.id)}
                >
                  <div>{film.filmInfo.title || film.filmInfo.fileName}</div>
                  <div className="text-muted" style={{ fontSize: '0.72rem' }}>
                    {film.stats.totalVenues} venues · £{film.stats.totalRevenue.toLocaleString()}
                  </div>
                </Dropdown.Item>
              ))}
            </React.Fragment>
          )
        })}

        {filteredFilms.length === 0 && search && (
          <Dropdown.ItemText className="text-muted text-center">
            No films match "{search}"
          </Dropdown.ItemText>
        )}
      </Dropdown.Menu>
    </Dropdown>
  )
}
