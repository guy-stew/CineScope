/**
 * CineScope — App Shell (v3.0 Layout Redesign Stage 1)
 *
 * New layout structure:
 *   ┌──────────────────────────────────────┐
 *   │           Header (full width)        │
 *   ├─────────┬────────────────────────────┤
 *   │         │                            │
 *   │ Sidebar │      Main Content Area     │
 *   │         │                            │
 *   └─────────┴────────────────────────────┘
 *
 * Stage 1: Sidebar + view switching added.
 * Map view is default and contains the existing MapView + AnalyticsPanel.
 * Other views (Films, Venues, Trends, Promote) show placeholders.
 * Header remains completely unchanged — all buttons still work.
 */

import React, { useState, useCallback } from 'react'
import { Container, Row, Col } from 'react-bootstrap'
import { AppProvider, useApp } from './context/AppContext'
import { ThemeProvider, useTheme } from './context/ThemeContext'
import Header from './components/Header'
import Sidebar from './components/Sidebar'
import MapView from './components/MapView'
import AnalyticsPanel from './components/AnalyticsPanel'
import SettingsPanel from './components/SettingsPanel'
import MatchReviewPanel from './components/MatchReviewPanel'
import TrendPanel from './components/TrendPanel'
import FilmNameDialog from './components/FilmNameDialog'
import Icon from './components/Icon'

// ── Placeholder views for Stages 2-5 ──
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
  const { theme } = useTheme()

  // ── View switching state ──
  const [currentView, setCurrentView] = useState('map')
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false)

  const handleViewChange = useCallback((viewId) => {
    setCurrentView(viewId)
  }, [])

  const handleSidebarToggle = useCallback(() => {
    setSidebarCollapsed(prev => !prev)
  }, [])

  return (
    <div className="cs-app-shell">
      {/* Header — unchanged, sits on top */}
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
          {/* ══════ MAP VIEW (default — existing layout) ══════ */}
          {currentView === 'map' && (
            <Container fluid className="p-0 h-100 overflow-hidden">
              <Row className="g-0 h-100">
                <Col lg={8} className="h-100">
                  <MapView />
                </Col>
                <Col lg={4} className="h-100 overflow-auto analytics-col">
                  <AnalyticsPanel />
                </Col>
              </Row>
            </Container>
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

      {/* ── Modals / overlays (still rendered globally, same as before) ── */}
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
