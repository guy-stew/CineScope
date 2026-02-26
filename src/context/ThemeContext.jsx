import React, { createContext, useContext, useState, useEffect } from 'react'

const ThemeContext = createContext(null)

const THEMES = {
  light: {
    name: 'Light',
    body: '#f8f9fa',
    surface: '#ffffff',
    surfaceAlt: '#f1f3f5',
    header: '#1a365d',
    headerBorder: '#38b2ac',
    text: '#212529',
    textMuted: '#6c757d',
    border: '#dee2e6',
    tableStripe: '#f8f9fa',
    tableHover: 'rgba(46, 117, 182, 0.06)',
    cardBg: '#f8f9fa',
    inputBg: '#ffffff',
    inputBorder: '#ced4da',
    inputText: '#212529',
    scrollThumb: '#ccc',
    mapTiles: 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',
    mapAttribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
  },
  dark: {
    name: 'Dark',
    body: '#1a1d23',
    surface: '#22262e',
    surfaceAlt: '#2a2f38',
    header: '#0f1318',
    headerBorder: '#38b2ac',
    text: '#e2e8f0',
    textMuted: '#8892a4',
    border: '#333a45',
    tableStripe: '#262b33',
    tableHover: 'rgba(56, 178, 172, 0.1)',
    cardBg: '#2a2f38',
    inputBg: '#2a2f38',
    inputBorder: '#404856',
    inputText: '#e2e8f0',
    scrollThumb: '#555',
    mapTiles: 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png',
    mapAttribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OSM</a> &copy; <a href="https://carto.com/">CARTO</a>',
  },
}

export function ThemeProvider({ children }) {
  const [themeName, setThemeName] = useState(() => {
    return localStorage.getItem('cinescope-theme') || 'light'
  })

  const theme = THEMES[themeName] || THEMES.light

  useEffect(() => {
    localStorage.setItem('cinescope-theme', themeName)
    // Apply CSS variables to document root
    const root = document.documentElement
    Object.entries(theme).forEach(([key, value]) => {
      if (typeof value === 'string' && key !== 'name' && !key.startsWith('map')) {
        root.style.setProperty(`--cs-${camelToKebab(key)}`, value)
      }
    })
    // Set body background
    document.body.style.backgroundColor = theme.body
    document.body.style.color = theme.text
  }, [themeName, theme])

  const toggleTheme = () => {
    setThemeName(prev => prev === 'light' ? 'dark' : 'light')
  }

  return (
    <ThemeContext.Provider value={{ theme, themeName, setThemeName, toggleTheme }}>
      {children}
    </ThemeContext.Provider>
  )
}

export function useTheme() {
  const ctx = useContext(ThemeContext)
  if (!ctx) throw new Error('useTheme must be used within ThemeProvider')
  return ctx
}

function camelToKebab(str) {
  return str.replace(/([a-z0-9])([A-Z])/g, '$1-$2').toLowerCase()
}
