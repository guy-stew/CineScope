import React, { useRef } from 'react'
import { Navbar, Nav, Form, Button, Badge, Spinner, OverlayTrigger, Tooltip } from 'react-bootstrap'
import { useApp } from '../context/AppContext'
import { useTheme } from '../context/ThemeContext'

export default function Header() {
  const {
    filteredVenues,
    importedFilms, selectedFilmId, setSelectedFilmId, clearFilmSelection,
    importComscoreFile, importStatus,
    chainFilter, setChainFilter, availableChains,
    categoryFilter, setCategoryFilter, availableCategories,
    gradeFilter, setGradeFilter,
    selectedFilm,
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
    // Reset input so same file can be re-imported
    e.target.value = ''
  }

  const handleFilmChange = (e) => {
    const value = e.target.value
    if (value === '') {
      clearFilmSelection()
    } else {
      setSelectedFilmId(value)
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
        <span className="me-2" style={{ fontSize: '1.3rem' }}>🎬</span>
        <span className="fw-bold">CineScope</span>
        <Badge bg="secondary" className="ms-2 fw-normal" style={{ fontSize: '0.6rem' }}>v1.5</Badge>
      </Navbar.Brand>

      <Navbar.Toggle aria-controls="header-nav" />
      <Navbar.Collapse id="header-nav">
        <Nav className="me-auto d-flex align-items-center gap-2 flex-wrap">

          {/* Film selector */}
          <Form.Select
            size="sm"
            value={selectedFilmId || ''}
            onChange={handleFilmChange}
            className="header-select"
            style={{ width: 200 }}
          >
            <option value="">All Venues (no film)</option>
            {importedFilms.map(f => (
              <option key={f.id} value={f.id}>
                {f.filmInfo.title || f.filmInfo.fileName} ({f.stats.totalVenues} venues)
              </option>
            ))}
          </Form.Select>

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

          {/* Grade quick-filters (only show when a film is loaded) */}
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
              ✓ {importStatus.success}
            </Badge>
          )}
          {importStatus?.error && (
            <Badge bg="danger" className="text-truncate" style={{ maxWidth: 200 }}>
              ✗ {importStatus.error}
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
            📊 Import Comscore
          </Button>

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
              {themeName === 'light' ? '🌙' : '☀️'}
            </Button>
          </OverlayTrigger>

          {/* Venue count */}
          <Badge bg="info">{filteredVenues.length} venues</Badge>
        </Nav>
      </Navbar.Collapse>
    </Navbar>
  )
}
