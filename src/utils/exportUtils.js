/**
 * CineScope — Export Utilities
 * CSV download, map screenshot (PNG), and PDF report generation
 * All processing runs client-side — no data leaves the browser.
 * 
 * html2canvas and jsPDF are lazy-loaded only when needed (code splitting).
 */

import { GRADES } from './grades'
import { formatRevenue, formatRevenueCSV } from './formatRevenue'

// ─── Lazy loaders for heavy deps ───────────────────────────

let _html2canvas = null
async function getHtml2Canvas() {
  if (!_html2canvas) {
    const mod = await import('html2canvas')
    _html2canvas = mod.default
  }
  return _html2canvas
}

let _jsPDF = null
async function getJsPDF() {
  if (!_jsPDF) {
    const mod = await import('jspdf')
    _jsPDF = mod.default
  }
  return _jsPDF
}

// ─── CSV Export ────────────────────────────────────────────

/**
 * Export venue data as a CSV file.
 * @param {Array} venues - Array of venue objects to export
 * @param {Object} options - { filmTitle, includeGrades }
 */
export function exportCSV(venues, options = {}) {
  const { filmTitle = 'All Venues', includeGrades = true, revenueFormat = 'decimal' } = options

  // Define columns based on whether grades are available
  const hasRevenue = venues.some(v => v.revenue != null)

  const headers = ['Venue', 'City', 'Chain', 'Category', 'Country', 'Latitude', 'Longitude']
  if (hasRevenue && includeGrades) {
    headers.push('Revenue (£)', 'Grade', 'Screens', 'Aggregated')
  }

  const rows = venues.map(v => {
    const row = [
      csvEscape(v.name),
      csvEscape(v.city || ''),
      csvEscape(v.chain || ''),
      csvEscape(v.category || ''),
      csvEscape(v.country || ''),
      v.lat,
      v.lng,
    ]
    if (hasRevenue && includeGrades) {
      row.push(
        v.revenue != null ? formatRevenueCSV(v.revenue, revenueFormat) : '',
        v.grade || '',
        v.screens || '',
        v.wasAggregated ? 'Yes' : '',
      )
    }
    return row.join(',')
  })

  const csv = [headers.join(','), ...rows].join('\n')
  const filename = `CineScope_${sanitiseFilename(filmTitle)}_${dateStamp()}.csv`
  downloadBlob(csv, filename, 'text/csv;charset=utf-8;')
}

// ─── Map Screenshot (PNG) ──────────────────────────────────

/**
 * Capture the map container as a PNG image.
 * Uses html2canvas to render the Leaflet map tiles + markers.
 * 
 * @param {string} selector - CSS selector for the map wrapper (default: '.map-wrapper')
 * @returns {Promise<void>}
 */
export async function exportMapPNG(selector = '.map-wrapper') {
  const mapEl = document.querySelector(selector)
  if (!mapEl) throw new Error('Map element not found')

  const html2canvas = await getHtml2Canvas()

  // html2canvas needs to handle cross-origin tiles
  const canvas = await html2canvas(mapEl, {
    useCORS: true,
    allowTaint: true,
    backgroundColor: '#f8f9fa',
    scale: 2, // Higher resolution
    logging: false,
    // Ignore Leaflet controls that don't render well
    ignoreElements: (el) => {
      return el.classList?.contains('leaflet-control-zoom') ||
             el.classList?.contains('leaflet-control-attribution')
    },
  })

  // Add a small watermark
  const ctx = canvas.getContext('2d')
  ctx.font = '12px sans-serif'
  ctx.fillStyle = 'rgba(0,0,0,0.4)'
  ctx.fillText(`CineScope — ${new Date().toLocaleDateString()}`, 10, canvas.height - 10)

  // Download
  const dataUrl = canvas.toDataURL('image/png')
  const filename = `CineScope_Map_${dateStamp()}.png`
  downloadDataUrl(dataUrl, filename)
}

// ─── PDF Report ────────────────────────────────────────────

/**
 * Generate a PDF report with map screenshot, grade summary, and venue table.
 * 
 * @param {Object} params
 * @param {Array} params.venues - Filtered venue array
 * @param {Object} params.gradeCounts - { A, B, C, D, E }
 * @param {Object} params.selectedFilm - Film info object (or null)
 * @param {string} params.mapSelector - CSS selector for the map
 */
export async function exportPDF({ venues, gradeCounts, selectedFilm, mapSelector = '.map-wrapper', revenueFormat = 'decimal' }) {
  const jsPDF = await getJsPDF()
  const html2canvas = await getHtml2Canvas()

  const pdf = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' })
  const pageWidth = pdf.internal.pageSize.getWidth()
  const pageHeight = pdf.internal.pageSize.getHeight()
  const margin = 12

  // ── Header ──
  pdf.setFillColor(26, 54, 93) // Dark navy header
  pdf.rect(0, 0, pageWidth, 18, 'F')
  pdf.setTextColor(255, 255, 255)
  pdf.setFontSize(16)
  pdf.setFont('helvetica', 'bold')
  pdf.text('CineScope — Cinema Performance Analytics', margin, 12)

  pdf.setFontSize(8)
  pdf.setFont('helvetica', 'normal')
  pdf.text(`Generated: ${new Date().toLocaleDateString()} ${new Date().toLocaleTimeString()}`, pageWidth - margin, 12, { align: 'right' })

  // ── Film info bar ──
  let yPos = 24
  pdf.setTextColor(50, 50, 50)

  if (selectedFilm) {
    pdf.setFontSize(11)
    pdf.setFont('helvetica', 'bold')
    pdf.text(selectedFilm.filmInfo.title || selectedFilm.filmInfo.fileName, margin, yPos)

    pdf.setFontSize(8)
    pdf.setFont('helvetica', 'normal')
    const statsText = `${selectedFilm.stats.totalVenues} venues · ${formatRevenue(selectedFilm.stats.totalRevenue, revenueFormat)} total · ${formatRevenue(selectedFilm.stats.avgRevenue, revenueFormat)} avg`
    pdf.text(statsText, margin, yPos + 5)
    yPos += 12
  } else {
    pdf.setFontSize(11)
    pdf.setFont('helvetica', 'bold')
    pdf.text('All Venues (no film selected)', margin, yPos)
    yPos += 8
  }

  // ── Grade summary boxes ──
  if (selectedFilm && gradeCounts) {
    const boxWidth = 30
    const boxHeight = 14
    const gap = 4
    const startX = margin

    const grades = ['A', 'B', 'C', 'D', 'E']
    const total = Object.values(gradeCounts).reduce((a, b) => a + b, 0)

    grades.forEach((grade, i) => {
      const x = startX + i * (boxWidth + gap)
      const info = GRADES[grade]
      const count = gradeCounts[grade] || 0
      const pct = total > 0 ? Math.round((count / total) * 100) : 0

      // Box with grade colour
      const rgb = hexToRgb(info.color)
      pdf.setFillColor(rgb.r, rgb.g, rgb.b)
      pdf.roundedRect(x, yPos, boxWidth, boxHeight, 2, 2, 'F')

      // Grade letter + count
      pdf.setTextColor(255, 255, 255)
      pdf.setFontSize(10)
      pdf.setFont('helvetica', 'bold')
      pdf.text(`${grade}: ${count}`, x + boxWidth / 2, yPos + 7, { align: 'center' })

      pdf.setFontSize(7)
      pdf.setFont('helvetica', 'normal')
      pdf.text(`${pct}%`, x + boxWidth / 2, yPos + 12, { align: 'center' })
    })

    yPos += boxHeight + 6
  }

  // ── Map screenshot ──
  try {
    const mapEl = document.querySelector(mapSelector)
    if (mapEl) {
      const canvas = await html2canvas(mapEl, {
        useCORS: true,
        allowTaint: true,
        backgroundColor: '#f8f9fa',
        scale: 2,
        logging: false,
        ignoreElements: (el) => {
          return el.classList?.contains('leaflet-control-zoom') ||
                 el.classList?.contains('leaflet-control-attribution')
        },
      })

      const imgData = canvas.toDataURL('image/png')

      // Preserve the actual aspect ratio of the captured map
      const aspectRatio = canvas.width / canvas.height
      const maxMapWidth = pageWidth - margin * 2
      const maxMapHeight = 90 // Max height available on page 1

      let mapWidth, mapHeight

      // Fit within bounds while preserving aspect ratio
      if (maxMapWidth / aspectRatio <= maxMapHeight) {
        // Width-constrained: use full width, calculate height
        mapWidth = maxMapWidth
        mapHeight = maxMapWidth / aspectRatio
      } else {
        // Height-constrained: use max height, calculate width
        mapHeight = maxMapHeight
        mapWidth = maxMapHeight * aspectRatio
      }

      // Centre the map horizontally if it doesn't fill full width
      const mapX = margin + (maxMapWidth - mapWidth) / 2

      pdf.addImage(imgData, 'PNG', mapX, yPos, mapWidth, mapHeight)
      yPos += mapHeight + 6
    }
  } catch (err) {
    console.warn('Could not capture map for PDF:', err)
    pdf.setTextColor(150, 150, 150)
    pdf.setFontSize(9)
    pdf.text('[Map screenshot could not be captured]', margin, yPos + 10)
    yPos += 16
  }

  // ── Venue table (page 2) ──
  pdf.addPage('landscape')
  yPos = margin

  pdf.setFillColor(26, 54, 93)
  pdf.rect(0, 0, pageWidth, 14, 'F')
  pdf.setTextColor(255, 255, 255)
  pdf.setFontSize(11)
  pdf.setFont('helvetica', 'bold')
  pdf.text('Venue List', margin, 10)
  pdf.setFontSize(8)
  pdf.setFont('helvetica', 'normal')
  pdf.text(`${venues.length} venues`, pageWidth - margin, 10, { align: 'right' })

  yPos = 20

  // Table headers
  const hasRevenue = venues.some(v => v.revenue != null)
  const colWidths = hasRevenue
    ? [85, 45, 40, 35, 35, 25]
    : [100, 55, 50, 40, 30]
  const colHeaders = hasRevenue
    ? ['Venue', 'City', 'Chain', 'Category', 'Revenue', 'Grade']
    : ['Venue', 'City', 'Chain', 'Category', 'Country']

  pdf.setFillColor(240, 240, 240)
  pdf.rect(margin, yPos - 4, pageWidth - margin * 2, 6, 'F')
  pdf.setTextColor(80, 80, 80)
  pdf.setFontSize(7)
  pdf.setFont('helvetica', 'bold')

  let xPos = margin
  colHeaders.forEach((header, i) => {
    pdf.text(header, xPos + 1, yPos)
    xPos += colWidths[i]
  })

  yPos += 5
  pdf.setFont('helvetica', 'normal')
  pdf.setTextColor(50, 50, 50)
  pdf.setFontSize(6.5)

  // Sort venues: by grade (A first) then revenue desc
  const sortedVenues = [...venues].sort((a, b) => {
    const gradeOrder = { A: 0, B: 1, C: 2, D: 3, E: 4 }
    const ga = gradeOrder[a.grade] ?? 5
    const gb = gradeOrder[b.grade] ?? 5
    if (ga !== gb) return ga - gb
    return (b.revenue || 0) - (a.revenue || 0)
  })

  for (const venue of sortedVenues) {
    if (yPos > pageHeight - 10) {
      pdf.addPage('landscape')
      yPos = margin + 4
    }

    // Alternate row shading
    const rowIdx = sortedVenues.indexOf(venue)
    if (rowIdx % 2 === 0) {
      pdf.setFillColor(248, 249, 250)
      pdf.rect(margin, yPos - 3, pageWidth - margin * 2, 4.5, 'F')
    }

    xPos = margin
    const cells = hasRevenue
      ? [
          truncate(venue.name, 42),
          truncate(venue.city || '', 22),
          truncate(venue.chain || '', 20),
          truncate(venue.category || '', 17),
          venue.revenue != null ? formatRevenue(venue.revenue, revenueFormat) : '—',
          venue.grade || '—',
        ]
      : [
          truncate(venue.name, 50),
          truncate(venue.city || '', 28),
          truncate(venue.chain || '', 25),
          truncate(venue.category || '', 20),
          venue.country || '',
        ]

    // Grade colour
    cells.forEach((cell, i) => {
      if (hasRevenue && i === 5 && venue.grade && GRADES[venue.grade]) {
        const rgb = hexToRgb(GRADES[venue.grade].color)
        pdf.setTextColor(rgb.r, rgb.g, rgb.b)
        pdf.setFont('helvetica', 'bold')
      } else {
        pdf.setTextColor(50, 50, 50)
        pdf.setFont('helvetica', 'normal')
      }
      pdf.text(String(cell), xPos + 1, yPos)
      xPos += colWidths[i]
    })

    yPos += 4.5
  }

  // ── Footer on last page ──
  pdf.setTextColor(150, 150, 150)
  pdf.setFontSize(6)
  pdf.text('CineScope v1.5 — Liberator Film Services — Confidential', margin, pageHeight - 5)

  // Save
  const filmName = selectedFilm?.filmInfo.title || 'All_Venues'
  const filename = `CineScope_Report_${sanitiseFilename(filmName)}_${dateStamp()}.pdf`
  pdf.save(filename)
}


// ─── Helpers ───────────────────────────────────────────────

function csvEscape(value) {
  const str = String(value)
  if (str.includes(',') || str.includes('"') || str.includes('\n')) {
    return `"${str.replace(/"/g, '""')}"`
  }
  return str
}

function sanitiseFilename(name) {
  return name.replace(/[^a-zA-Z0-9_-]/g, '_').substring(0, 40)
}

function dateStamp() {
  return new Date().toISOString().slice(0, 10).replace(/-/g, '')
}

function downloadBlob(content, filename, mimeType) {
  const blob = new Blob([content], { type: mimeType })
  const url = URL.createObjectURL(blob)
  downloadDataUrl(url, filename)
  URL.revokeObjectURL(url)
}

function downloadDataUrl(url, filename) {
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
}

function hexToRgb(hex) {
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex)
  return result ? {
    r: parseInt(result[1], 16),
    g: parseInt(result[2], 16),
    b: parseInt(result[3], 16),
  } : { r: 0, g: 0, b: 0 }
}

function truncate(str, maxLen) {
  if (str.length <= maxLen) return str
  return str.substring(0, maxLen - 1) + '…'
}
