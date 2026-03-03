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

// ─── AI Report Page (Executive Summary) ────────────────────

/**
 * Render the AI-generated insights as the first page of a PDF.
 * Called by exportPDF when the user opts to include insights.
 *
 * The AI report uses Markdown-like formatting (** for bold, ## for headings).
 * This function parses that into styled PDF text.
 *
 * @param {Object} pdf - jsPDF instance
 * @param {string} aiText - Raw AI report text (with Markdown formatting)
 * @param {Object} selectedFilm - Film info object
 * @param {number} margin - Page margin in mm
 */
function addAIReportPage(pdf, aiText, selectedFilm, margin) {
  const pageWidth = pdf.internal.pageSize.getWidth()
  const pageHeight = pdf.internal.pageSize.getHeight()

  // ── Navy header bar ──
  pdf.setFillColor(26, 54, 93)
  pdf.rect(0, 0, pageWidth, 18, 'F')
  pdf.setTextColor(255, 255, 255)
  pdf.setFontSize(16)
  pdf.setFont('helvetica', 'bold')
  pdf.text('CineScope — AI Insights Report', margin, 12)

  pdf.setFontSize(8)
  pdf.setFont('helvetica', 'normal')
  pdf.text(
    `Generated: ${new Date().toLocaleDateString()} ${new Date().toLocaleTimeString()}`,
    pageWidth - margin,
    12,
    { align: 'right' }
  )

  // ── Film title subtitle ──
  let yPos = 26
  if (selectedFilm) {
    pdf.setTextColor(26, 54, 93)
    pdf.setFontSize(11)
    pdf.setFont('helvetica', 'bold')
    pdf.text(selectedFilm.filmInfo.title || selectedFilm.filmInfo.fileName, margin, yPos)
    yPos += 7
  }

  // ── Decorative accent line ──
  pdf.setDrawColor(212, 175, 55) // Gold accent
  pdf.setLineWidth(0.6)
  pdf.line(margin, yPos, pageWidth - margin, yPos)
  yPos += 6

  // ── Render AI report text with basic Markdown parsing ──
  const maxWidth = pageWidth - margin * 2
  const lines = aiText.split('\n')

  for (const line of lines) {
    const trimmed = line.trim()

    // Check if we need a new page (leave room for footer)
    if (yPos > pageHeight - 15) {
      pdf.addPage('landscape')

      // Repeat header on continuation pages
      pdf.setFillColor(26, 54, 93)
      pdf.rect(0, 0, pageWidth, 14, 'F')
      pdf.setTextColor(255, 255, 255)
      pdf.setFontSize(11)
      pdf.setFont('helvetica', 'bold')
      pdf.text('AI Insights Report (continued)', margin, 10)

      yPos = 20
    }

    // Empty line → small gap
    if (!trimmed) {
      yPos += 3
      continue
    }

    // ## Heading → bold, navy, slightly larger
    if (trimmed.startsWith('## ') || trimmed.startsWith('**') && trimmed.endsWith('**') && trimmed.length < 60) {
      const headingText = trimmed.replace(/^##\s*/, '').replace(/^\*\*/, '').replace(/\*\*$/, '')
      pdf.setTextColor(26, 54, 93)
      pdf.setFontSize(10)
      pdf.setFont('helvetica', 'bold')
      yPos += 2 // Extra space before headings
      pdf.text(headingText, margin, yPos)
      yPos += 5.5
      continue
    }

    // Numbered list items (1. 2. 3. etc) or bullet points (- *)
    const isListItem = /^(\d+\.\s|[-*]\s)/.test(trimmed)

    // Parse inline **bold** segments
    const segments = parseInlineBold(trimmed)
    pdf.setFontSize(8)
    pdf.setTextColor(50, 50, 50)

    // Indent list items slightly
    const lineX = isListItem ? margin + 3 : margin
    const lineMaxWidth = isListItem ? maxWidth - 3 : maxWidth

    // Render segments with word wrapping
    const wrappedLines = wrapSegments(pdf, segments, lineMaxWidth)

    for (const wrappedLine of wrappedLines) {
      if (yPos > pageHeight - 15) {
        pdf.addPage('landscape')
        pdf.setFillColor(26, 54, 93)
        pdf.rect(0, 0, pageWidth, 14, 'F')
        pdf.setTextColor(255, 255, 255)
        pdf.setFontSize(11)
        pdf.setFont('helvetica', 'bold')
        pdf.text('AI Insights Report (continued)', margin, 10)
        yPos = 20
      }

      renderSegmentLine(pdf, wrappedLine, lineX, yPos)
      yPos += 4
    }

    yPos += 1 // Small gap between paragraphs
  }

  // ── Footer ──
  pdf.setTextColor(150, 150, 150)
  pdf.setFontSize(6)
  pdf.text(
    'AI-generated insights — CineScope v1.9 — Liberator Film Services — Confidential',
    margin,
    pageHeight - 5
  )
}

/**
 * Parse a text line into segments of { text, bold } for inline **bold** formatting.
 */
function parseInlineBold(text) {
  const segments = []
  const regex = /\*\*(.+?)\*\*/g
  let lastIndex = 0
  let match

  while ((match = regex.exec(text)) !== null) {
    // Text before the bold
    if (match.index > lastIndex) {
      segments.push({ text: text.slice(lastIndex, match.index), bold: false })
    }
    // Bold text
    segments.push({ text: match[1], bold: true })
    lastIndex = regex.lastIndex
  }

  // Remaining text after last bold
  if (lastIndex < text.length) {
    segments.push({ text: text.slice(lastIndex), bold: false })
  }

  return segments.length > 0 ? segments : [{ text, bold: false }]
}

/**
 * Word-wrap segments to fit within maxWidth, returning an array of lines
 * where each line is an array of { text, bold } segments.
 */
function wrapSegments(pdf, segments, maxWidth) {
  // Flatten all segments into one string to measure
  const fullText = segments.map(s => s.text).join('')

  // Quick check: if it fits in one line, return as-is
  pdf.setFont('helvetica', 'normal')
  pdf.setFontSize(8)
  const fullWidth = pdf.getTextWidth(fullText)

  if (fullWidth <= maxWidth) {
    return [segments]
  }

  // Need to wrap — split into words while preserving bold info
  const words = []
  for (const seg of segments) {
    const parts = seg.text.split(/(\s+)/)
    for (const part of parts) {
      if (part) words.push({ text: part, bold: seg.bold })
    }
  }

  const lines = []
  let currentLine = []
  let currentWidth = 0

  for (const word of words) {
    pdf.setFont('helvetica', word.bold ? 'bold' : 'normal')
    const wordWidth = pdf.getTextWidth(word.text)

    if (currentWidth + wordWidth > maxWidth && currentLine.length > 0) {
      lines.push(currentLine)
      currentLine = []
      currentWidth = 0
      // Skip leading whitespace on new line
      if (word.text.trim() === '') continue
    }

    currentLine.push(word)
    currentWidth += wordWidth
  }

  if (currentLine.length > 0) {
    lines.push(currentLine)
  }

  return lines
}

/**
 * Render a single wrapped line of segments at (x, y), switching bold on/off.
 */
function renderSegmentLine(pdf, segments, x, y) {
  let currentX = x
  pdf.setFontSize(8)
  pdf.setTextColor(50, 50, 50)

  for (const seg of segments) {
    pdf.setFont('helvetica', seg.bold ? 'bold' : 'normal')
    pdf.text(seg.text, currentX, y)
    currentX += pdf.getTextWidth(seg.text)
  }
}

// ─── PDF Report ────────────────────────────────────────────

/**
 * Generate a PDF report with map screenshot, grade summary, and venue table.
 * Optionally includes an AI insights executive summary as page 1.
 * 
 * @param {Object} params
 * @param {Array}  params.venues - Filtered venue array
 * @param {Object} params.gradeCounts - { A, B, C, D, E }
 * @param {Object} params.selectedFilm - Film info object (or null)
 * @param {string} params.mapSelector - CSS selector for the map
 * @param {string} params.revenueFormat - 'decimal' or 'whole'
 * @param {string|null} params.aiReportText - AI insights text to include (or null to skip)
 * @param {string} params.chainName - Chain name for cover page ('' = all chains) — used in Section 2
 * @param {string} params.theme - 'light' or 'dark' — used in Section 2
 */
export async function exportPDF({ venues, gradeCounts, selectedFilm, mapSelector = '.map-wrapper', revenueFormat = 'decimal', aiReportText = null, chainName = '', theme = 'light' }) {
  const jsPDF = await getJsPDF()
  const html2canvas = await getHtml2Canvas()

  const pdf = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' })
  const pageWidth = pdf.internal.pageSize.getWidth()
  const pageHeight = pdf.internal.pageSize.getHeight()
  const margin = 12

  // ── AI Insights page (optional, page 1) ──
  if (aiReportText) {
    addAIReportPage(pdf, aiReportText, selectedFilm, margin)
    pdf.addPage('landscape') // Map page follows
  }

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

  // ── Venue table (next page) ──
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
  pdf.text('CineScope v1.9 — Liberator Film Services — Confidential', margin, pageHeight - 5)

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
  return str.substring(0, maxLen - 1) + '\u2026'
}
