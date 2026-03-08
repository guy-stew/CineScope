/**
 * CineScope — App Shell (v3.0 Stage 2)
 *
 * Stage 2 changes:
 *   - Map view now uses MapView + MapPanel side by side (replaces Col 8/4 + AnalyticsPanel)
 *   - MapPanel state (visible/hidden) managed here
 *   - MapView receives panelVisible + onTogglePanel props for overlay controls
 *   - AnalyticsPanel import removed (replaced by MapPanel)
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
import Icon from './components/Icon'

// ── Placeholder views for Stages 3-5 ──
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
          Coming in Stage {stage}
        </span>
      </div>
    </div>
  )
}

function AppContent() {
  const { pendingImport, confirmImport, cancelImport, showTrends, setShowTrends } = useApp()

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

          {/* ══════ FILMS VIEW (placeholder — Stage 3) ══════ */}
          {currentView === 'films' && (
            <PlaceholderView
              title="Film Catalogue"
              icon="movie"
              description="The Film Catalogue will move here from its current overlay. You'll be able to browse, add, import Comscore data, and manage all your films in a dedicated full-screen view. For now, use the Catalogue button in the header."
              stage={3}
            />
          )}

          {/* ══════ VENUES VIEW (placeholder — Stage 4) ══════ */}
          {currentView === 'venues' && (
            <PlaceholderView
              title="Venue Manager"
              icon="storefront"
              description="The Venue Manager will move here from its current overlay. Add, edit, import, and manage all 943 venues in a dedicated view with stats cards and a full data table. For now, use the venue icon in the header."
              stage={4}
            />
          )}

          {/* ══════ TRENDS VIEW (placeholder — Stage 5) ══════ */}
          {currentView === 'trends' && (
            <PlaceholderView
              title="Performance & Trends"
              icon="insights"
              description="Trend analysis, AI Insights, and the Export menu will move here. Full performance analytics with charts, grade distributions, and PDF/CSV reports — all in one dedicated view. For now, use the Trends button in the header."
              stage={5}
            />
          )}

          {/* ══════ PROMOTE VIEW (placeholder — future) ══════ */}
          {currentView === 'promote' && (
            <PlaceholderView
              title="Social Media Marketing"
              icon="campaign"
              description="Create and manage targeted Facebook & Instagram ad campaigns powered by CineScope's venue demographics and box office data. AI-assisted targeting and A/B testing."
              stage="Future"
            />
          )}
        </main>
      </div>

      {/* ── Modals / overlays (unchanged) ── */}
      <SettingsPanel />
      <MatchReviewPanel />
      <TrendPanel show={showTrends} onHide={() => setShowTrends(false)} />
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
