/**
 * CineScope — App Shell (v3.0 Stage 4)
 *
 * Stage 4 changes:
 *   - Trends sidebar tab opens TrendPanel modal (same pattern as Films/Venues)
 *   - TrendPanel no longer needs showTrends/setShowTrends from AppContext
 *   - Removed Trends button trigger from Header (now sidebar only)
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
  const { pendingImport, confirmImport, cancelImport, importedFilms } = useApp()

  // ── View switching state ──
  const [currentView, setCurrentView] = useState('map')
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false)
  const [mapPanelVisible, setMapPanelVisible] = useState(true)

  const handleViewChange = useCallback((viewId) => {
    setCurrentView(viewId)
  }, [])

  const handleSidebarToggle = useCallback(() => {
    setSidebarCollapsed(prev => !prev)
  }, [])

  const handleMapPanelToggle = useCallback(() => {
    setMapPanelVisible(prev => !prev)
  }, [])

  // When closing a modal view (Films/Venues/Trends), return to Map
  const handleReturnToMap = useCallback(() => {
    setCurrentView('map')
  }, [])

  // Trends requires 2+ films — show a helpful message if not enough
  const hasTrendData = importedFilms.length >= 2

  return (
    <div className="cs-app-shell">
      {/* Header */}
      <div className="cs-header-wrapper">
        <Header />
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
                />
              </div>
              <MapPanel
                visible={mapPanelVisible}
                onToggle={handleMapPanelToggle}
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
        </main>
      </div>

      {/* ── Other modals / overlays (unchanged) ── */}
      <SettingsPanel />
      <MatchReviewPanel />
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
