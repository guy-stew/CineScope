import React from 'react'
import { Container, Row, Col } from 'react-bootstrap'
import { AppProvider, useApp } from './context/AppContext'
import { ThemeProvider } from './context/ThemeContext'
import Header from './components/Header'
import MapView from './components/MapView'
import AnalyticsPanel from './components/AnalyticsPanel'
import SettingsPanel from './components/SettingsPanel'
import MatchReviewPanel from './components/MatchReviewPanel'
import FilmNameDialog from './components/FilmNameDialog'

function AppContent() {
  const { pendingImport, confirmImport, cancelImport } = useApp()

  return (
    <div className="app-container d-flex flex-column vh-100">
      <Header />
      <Container fluid className="flex-grow-1 p-0 overflow-hidden">
        <Row className="g-0 h-100">
          <Col lg={8} className="h-100">
            <MapView />
          </Col>
          <Col lg={4} className="h-100 overflow-auto analytics-col">
            <AnalyticsPanel />
          </Col>
        </Row>
      </Container>
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
