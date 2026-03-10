/**
 * CineScope — App Shell (v3.5 — Reports view shell)
 *
 * All views render inline with persistent header + sidebar.
 * Header is slim (logo + view name + icon buttons).
 * No more modal overlays for main views.
 */

import React, { useState, useCallback } from 'react'
import { AppProvider, useApp } from './context/AppContext'
import { ThemeProvider, useTheme } from './context/ThemeContext'
import Header from './components/Header'
import Sidebar from './components/Sidebar'
import MapView from './components/MapView'
import MapPanel from './components/MapPanel'
import SettingsPanel from './components/SettingsPanel'
import MatchReviewPanel from './components/MatchReviewPanel'
import TrendPanel from './components/TrendPanel'
import FilmNameDialog from './components/FilmNameDialog'
import FilmCatalogue from './components/FilmCatalogue'
import VenueManager from './components/VenueManager'
import Icon from './components/Icon'

// ── Placeholder view ──
function PlaceholderView({ title, icon, description, stage }) {
  const { theme } = useTheme()
  return (
    <div
      className="d-flex align-items-center justify-content-center h-100"
      style={{ background: theme.body }}
    >
      <div
        className="text-center p-5 rounded-4"
        style={{
          background: theme.surface,
          border: `1px solid ${theme.border}`,
          maxWidth: 480,
        }}
      >
        <div
          className="d-inline-flex align-items-center justify-content-center mb-3 rounded-3"
          style={{
            width: 56,
            height: 56,
            background: `${theme.headerBorder}18`,
            color: theme.headerBorder,
          }}
        >
          <Icon name={icon} size={28} />
        </div>
        <h4 className="fw-bold mb-2" style={{ color: theme.text }}>{title}</h4>
        <p className="mb-3" style={{ color: theme.textMuted, fontSize: '0.9rem', lineHeight: 1.6 }}>
          {description}
        </p>
        <span
          className="badge rounded-pill"
          style={{
            background: `${theme.headerBorder}18`,
            color: theme.headerBorder,
            fontSize: '0.75rem',
            padding: '6px 14px',
          }}
        >
          {stage}
        </span>
      </div>
    </div>
  )
}

function AppContent() {
  const { pendingImport, confirmImport, cancelImport, importedFilms, selectedFilm, matchDetails } = useApp()

  // ── View switching state ──
  const [currentView, setCurrentView] = useState('map')
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false)
  const [mapPanelVisible, setMapPanelVisible] = useState(true)
  const [mapFlyTarget, setMapFlyTarget] = useState(null)

  const handleViewChange = useCallback((viewId) => {
    setCurrentView(viewId)
  }, [])

  const handleSidebarToggle = useCallback(() => {
    setSidebarCollapsed(prev => !prev)
  }, [])

  const handleMapPanelToggle = useCallback(() => {
    setMapPanelVisible(prev => !prev)
  }, [])

  // When a venue is clicked in the MapPanel list, fly to it on the map
  const handleVenueFly = useCallback((venue) => {
    // Set a new object each time to ensure useEffect triggers even for same venue
    setMapFlyTarget({ ...venue, _ts: Date.now() })
  }, [])

  const hasTrendData = importedFilms.length >= 2
  const hasMatchData = selectedFilm && matchDetails && matchDetails.length > 0

  return (
    <div className="cs-app-shell">
      {/* Header */}
      <div className="cs-header-wrapper">
        <Header currentView={currentView} />
      </div>

      {/* Body: Sidebar + Main Content */}
      <div className="cs-body">
        <Sidebar
          currentView={currentView}
          onViewChange={handleViewChange}
          collapsed={sidebarCollapsed}
          onToggle={handleSidebarToggle}
        />

        <main
          className={`cs-main ${sidebarCollapsed ? 'cs-main--sidebar-collapsed' : ''}`}
        >
          {/* ══════ MAP VIEW ══════ */}
          {currentView === 'map' && (
            <div className="cs-map-layout">
              <div className="cs-map-area">
                <MapView
                  panelVisible={mapPanelVisible}
                  onTogglePanel={handleMapPanelToggle}
                  flyTarget={mapFlyTarget}
                />
              </div>
              <MapPanel
                visible={mapPanelVisible}
                onToggle={handleMapPanelToggle}
                onVenueFly={handleVenueFly}
              />
            </div>
          )}

          {/* ══════ FILMS VIEW — inline catalogue ══════ */}
          {currentView === 'films' && (
            <FilmCatalogue inline />
          )}

          {/* ══════ VENUES VIEW — inline venue manager ══════ */}
          {currentView === 'venues' && (
            <VenueManager inline />
          )}

          {/* ══════ MATCHING VIEW — inline match review ══════ */}
          {currentView === 'matching' && hasMatchData && (
            <MatchReviewPanel inline />
          )}
          {currentView === 'matching' && !hasMatchData && (
            <PlaceholderView
              title="Venue Matching"
              icon="link"
              description={
                !selectedFilm
                  ? "Select a film from the Film Catalogue and import Comscore data to see venue matching results here."
                  : "No matching data available for the current film. Import a Comscore file to generate matches."
              }
              stage={selectedFilm ? '1 film selected — awaiting Comscore import' : 'No film selected'}
            />
          )}

          {/* ══════ TRENDS VIEW — inline trend panel ══════ */}
          {currentView === 'trends' && !hasTrendData && (
            <PlaceholderView
              title="Performance & Trends"
              icon="insights"
              description={importedFilms.length === 0
                ? "Import Comscore data for at least 2 films to unlock trend analysis. Go to Films in the sidebar to import your first film."
                : "Import Comscore data for one more film to unlock trend analysis. Trends compare performance across multiple releases."
              }
              stage={`${importedFilms.length} of 2 films imported`}
            />
          )}
          {currentView === 'trends' && hasTrendData && (
            <TrendPanel inline />
          )}

          {/* ══════ PROMOTE VIEW (placeholder — future) ══════ */}
          {currentView === 'promote' && (
            <PlaceholderView
              title="Social Media Marketing"
              icon="campaign"
              description="Create and manage targeted Facebook & Instagram ad campaigns powered by CineScope's venue demographics and box office data. AI-assisted targeting and A/B testing."
              stage="Coming Soon"
            />
          )}

          {/* ══════ REPORTS VIEW (placeholder — Stage 1 shell) ══════ */}
          {currentView === 'reports' && (
            <PlaceholderView
              title="Reports & AI Analysis"
              icon="assessment"
              description="Generate AI-powered insights reports, chain performance analysis, marketing target lists, and venue recommendations. Customise prompt templates and export as PDF or spreadsheet."
              stage="Coming Soon — Stage 2"
            />
          )}
        </main>
      </div>

      {/* ── Other modals / overlays (unchanged) ── */}
      <SettingsPanel />
      <FilmNameDialog
        show={!!pendingImport}
        onConfirm={confirmImport}
        onCancel={cancelImport}
        detectedTitle={pendingImport?.result?.filmInfo?.title || ''}
        rawTitle={pendingImport?.result?.filmInfo?.rawTitle || ''}
        dateRange={pendingImport?.result?.filmInfo?.dateRange || ''}
      />
    </div>
  )
}

export default function App() {
  return (
    <ThemeProvider>
      <AppProvider>
        <AppContent />
      </AppProvider>
    </ThemeProvider>
  )
}
