/**
 * CineScope — Header (v3.0 Stage 2)
 *
 * Simplified header. Map-specific controls removed (now in MapPanel + MapView):
 *   REMOVED: Film selector, Chain filter, Category filter, Grade buttons, Population dropdown
 *   KEPT: Import, Film Catalogue, Export, Trends, Match Review, Venue Manager, Settings, Theme toggle
 *
 * These remaining buttons will migrate to their respective views in later stages:
 *   - Import + Catalogue → Films view (Stage 3)
 *   - Venue Manager → Venues view (Stage 4)
 *   - Export + Trends → Trends view (Stage 5)
 */

import React, { useRef, useState } from 'react'
import { Navbar, Nav, Button, Badge, Spinner, OverlayTrigger, Tooltip } from 'react-bootstrap'
import { useApp } from '../context/AppContext'
import { useTheme } from '../context/ThemeContext'
import ExportMenu from './ExportMenu'
import Icon from './Icon'
import VenueManager from './VenueManager'
import FilmCatalogue from './FilmCatalogue'

export default function Header() {
  const {
    importedFilms,
    importComscoreFile, importStatus,
    selectedFilm,
    showSettings, setShowSettings,
    showMatchReview, setShowMatchReview,
    showTrends, setShowTrends,
    matchDetails,
  } = useApp()

  const { themeName, toggleTheme } = useTheme()
  const fileInputRef = useRef(null)

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

  return (
    <>
      <Navbar variant="dark" expand="lg" className="px-3 py-2 app-header">
        {/* Brand */}
        <Navbar.Brand className="d-flex align-items-center me-3">
          <span className="me-2" style={{ fontSize: '1.3rem' }}><Icon name="movie" size={24} /></span>
          <span className="fw-bold">CineScope</span>
        </Navbar.Brand>

        <Navbar.Toggle aria-controls="header-nav" />
        <Navbar.Collapse id="header-nav">
          {/* Left side — spacer (film selector removed) */}
          <Nav className="me-auto" />

          {/* Right side — action buttons */}
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
            <OverlayTrigger
              placement="bottom"
              overlay={<Tooltip>Import Comscore data file</Tooltip>}
            >
              <Button size="sm" variant="outline-light" onClick={handleFileClick}>
                <Icon name="upload_file" size={16} className="me-1" /> Import
              </Button>
            </OverlayTrigger>

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

            {/* Venue Manager button */}
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
          </Nav>
        </Navbar.Collapse>
      </Navbar>

      {/* Venue Manager modal */}
      <VenueManager
        show={showVenueManager}
        onHide={() => setShowVenueManager(false)}
      />

      {/* Film Catalogue overlay */}
      <FilmCatalogue
        show={showCatalogue}
        onHide={() => setShowCatalogue(false)}
      />
    </>
  )
}
