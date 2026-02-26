import React from 'react'
import { Container, Row, Col } from 'react-bootstrap'
import { AppProvider } from './context/AppContext'
import { ThemeProvider } from './context/ThemeContext'
import Header from './components/Header'
import MapView from './components/MapView'
import AnalyticsPanel from './components/AnalyticsPanel'

export default function App() {
  return (
    <ThemeProvider>
      <AppProvider>
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
        </div>
      </AppProvider>
    </ThemeProvider>
  )
}
