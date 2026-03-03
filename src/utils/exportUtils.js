/**
 * CineScope - Export Utilities v1.10
 * CSV download, map screenshot (PNG), and multi-page PDF report
 * All processing runs client-side - no data leaves the browser.
 *
 * PDF page order:
 *   1. Cover page (branding, film title, chain, grade summary, key highlights)
 *   2. AI Insights (optional - if generated and toggled on)
 *   3. Dashboard charts (grade distribution + chain comparison)
 *   4. Map screenshot
 *   5. Venue list (multi-page table with grade dots, page numbers, improved layout)
 *
 * v1.10 changes (Section 3 - venue list):
 *   - Grade colour dots next to grade letter
 *   - Right-aligned revenue column (bold)
 *   - Page numbers on all pages (except cover) via global post-processing
 *   - Footer with rule line on every venue list page
 *   - Better continuation headers showing film title + chain + count
 *   - ASCII-safe truncation (no Unicode ellipsis)
 *   - Multi-screen aggregation indicator [+]
 *   - Summary line below table (venue count + aggregation count)
 *   - Improved column proportions for landscape A4
 *   - Zebra striping with softer colour
 *   - Table bottom border + gold underline on column headers
 */

import { GRADES } from './grades'
import { formatRevenue, formatRevenueCSV } from './formatRevenue'

// --- Lazy loaders ---

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

// --- Brand colours ---

const NAVY = [26, 54, 93]
const GOLD = [212, 175, 55]
const WHITE = [255, 255, 255]
const LIGHT_GREY = [240, 240, 240]
const MID_GREY = [150, 150, 150]
const DARK_TEXT = [50, 50, 50]
const TABLE_HEADER_BG = [235, 238, 245]
const ZEBRA_BG = [248, 249, 252]


// ===================================================================
// CSV Export
// ===================================================================

export function exportCSV(venues, options = {}) {
  const { filmTitle = 'All Venues', includeGrades = true, revenueFormat = 'decimal' } = options
  const hasRevenue = venues.some(v => v.revenue != null)

  const headers = ['Venue', 'City', 'Chain', 'Category', 'Country', 'Latitude', 'Longitude']
  if (hasRevenue && includeGrades) {
    headers.push('Revenue (\u00A3)', 'Grade', 'Screens', 'Aggregated')
  }

  const rows = venues.map(v => {
    const row = [
      csvEscape(v.name), csvEscape(v.city || ''), csvEscape(v.chain || ''),
      csvEscape(v.category || ''), csvEscape(v.country || ''), v.lat, v.lng,
    ]
    if (hasRevenue && includeGrades) {
      row.push(
        v.revenue != null ? formatRevenueCSV(v.revenue, revenueFormat) : '',
        v.grade || '', v.screens || '', v.wasAggregated ? 'Yes' : '',
      )
    }
    return row.join(',')
  })

  const csv = [headers.join(','), ...rows].join('\n')
  downloadBlob(csv, `CineScope_${sanitiseFilename(filmTitle)}_${dateStamp()}.csv`, 'text/csv;charset=utf-8;')
}


// ===================================================================
// Map Screenshot (PNG)
// ===================================================================

export async function exportMapPNG(selector = '.map-wrapper') {
  const mapEl = document.querySelector(selector)
  if (!mapEl) throw new Error('Map element not found')

  const html2canvas = await getHtml2Canvas()
  const canvas = await html2canvas(mapEl, {
    useCORS: true, allowTaint: true, backgroundColor: '#f8f9fa',
    scale: 2, logging: false,
    ignoreElements: (el) =>
      el.classList?.contains('leaflet-control-zoom') ||
      el.classList?.contains('leaflet-control-attribution'),
  })

  const ctx = canvas.getContext('2d')
  ctx.font = '12px sans-serif'
  ctx.fillStyle = 'rgba(0,0,0,0.4)'
  ctx.fillText(`CineScope \u2014 ${new Date().toLocaleDateString()}`, 10, canvas.height - 10)

  downloadDataUrl(canvas.toDataURL('image/png'), `CineScope_Map_${dateStamp()}.png`)
}


// ===================================================================
// PDF - Page Builders
// ===================================================================

// --- 1. Cover Page ---

function addCoverPage(pdf, o) {
  const { selectedFilm, gradeCounts, venues, chainName, revenueFormat } = o
  const W = pdf.internal.pageSize.getWidth()
  const H = pdf.internal.pageSize.getHeight()
  const m = 12

  pdf.setFillColor(...NAVY)
  pdf.rect(0, 0, W, H, 'F')
  pdf.setFillColor(...GOLD)
  pdf.rect(0, 0, W, 3, 'F')

  pdf.setTextColor(...WHITE)
  pdf.setFontSize(32)
  pdf.setFont('helvetica', 'bold')
  pdf.text('CineScope', m, 40)
  pdf.setFontSize(13)
  pdf.setFont('helvetica', 'normal')
  pdf.setTextColor(180, 200, 220)
  pdf.text('Cinema Performance Analytics', m, 50)

  pdf.setDrawColor(...GOLD)
  pdf.setLineWidth(0.8)
  pdf.line(m, 57, W - m, 57)

  let y = 70
  if (selectedFilm) {
    pdf.setTextColor(...WHITE)
    pdf.setFontSize(22)
    pdf.setFont('helvetica', 'bold')
    pdf.text(selectedFilm.filmInfo.title || selectedFilm.filmInfo.fileName, m, y)
    y += 10
    if (chainName) {
      pdf.setFontSize(14)
      pdf.setFont('helvetica', 'normal')
      pdf.setTextColor(...GOLD)
      pdf.text(chainName, m, y)
      y += 10
    }
  } else {
    pdf.setTextColor(...WHITE)
    pdf.setFontSize(22)
    pdf.setFont('helvetica', 'bold')
    pdf.text('All Venues', m, y)
    y += 12
  }

  pdf.setTextColor(180, 200, 220)
  pdf.setFontSize(10)
  pdf.setFont('helvetica', 'normal')
  pdf.text(`Report generated: ${new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })}`, m, y)
  y += 16

  if (gradeCounts) {
    const gl = ['A', 'B', 'C', 'D', 'E']
    const tot = Object.values(gradeCounts).reduce((a, b) => a + b, 0)
    const bW = 42, bH = 28, gap = 6

    gl.forEach((grade, i) => {
      const x = m + i * (bW + gap)
      const info = GRADES[grade]
      const count = gradeCounts[grade] || 0
      const pct = tot > 0 ? Math.round((count / tot) * 100) : 0
      const rgb = hexToRgb(info.color)

      pdf.setFillColor(rgb.r, rgb.g, rgb.b)
      pdf.roundedRect(x, y, bW, bH, 3, 3, 'F')

      pdf.setTextColor(...WHITE)
      pdf.setFontSize(14)
      pdf.setFont('helvetica', 'bold')
      pdf.text(`${grade}`, x + 6, y + 12)
      pdf.setFontSize(16)
      pdf.text(`${count}`, x + bW / 2 + 4, y + 12, { align: 'center' })
      pdf.setFontSize(8)
      pdf.setFont('helvetica', 'normal')
      pdf.text(`${pct}%`, x + bW / 2, y + 22, { align: 'center' })
    })
    y += bH + 14
  }

  if (selectedFilm) {
    pdf.setFillColor(15, 40, 70)
    pdf.roundedRect(m, y, W - m * 2, 52, 4, 4, 'F')

    const px = m + 8
    let py = y + 12

    pdf.setFontSize(10)
    pdf.setFont('helvetica', 'bold')
    pdf.setTextColor(...GOLD)
    pdf.text('Key Highlights', px, py)
    py += 8

    pdf.setFontSize(9)
    pdf.setFont('helvetica', 'normal')
    pdf.setTextColor(220, 220, 220)

    const stats = selectedFilm.stats || {}
    const screened = (gradeCounts.A || 0) + (gradeCounts.B || 0) + (gradeCounts.C || 0) + (gradeCounts.D || 0)
    const targets = (gradeCounts.B || 0) + (gradeCounts.C || 0)
    const topV = [...venues].filter(v => v.revenue != null).sort((a, b) => (b.revenue || 0) - (a.revenue || 0))[0]

    const hl = [
      `Venues screened: ${screened} of ${screened + (gradeCounts.E || 0)} in network`,
      `Total box office: ${formatRevenue(stats.totalRevenue || 0, revenueFormat)}  \u00B7  Average per venue: ${formatRevenue(stats.avgRevenue || 0, revenueFormat)}`,
      `Marketing targets (Grade B + C): ${targets} venues`,
      topV ? `Top performer: ${topV.name} (${topV.city}) \u2014 ${formatRevenue(topV.revenue, revenueFormat)}` : '',
    ].filter(Boolean)

    for (const line of hl) {
      pdf.text(`\u2022  ${line}`, px, py)
      py += 6
    }
  }

  pdf.setTextColor(100, 120, 150)
  pdf.setFontSize(7)
  pdf.text('Liberator Film Services  \u00B7  Confidential', m, H - 8)
  pdf.text('Powered by CineScope v1.10', W - m, H - 8, { align: 'right' })
  pdf.setFillColor(...GOLD)
  pdf.rect(0, H - 3, W, 3, 'F')
}


// --- 2. Dashboard Charts Page ---

function addDashboardChartsPage(pdf, o) {
  const { venues, gradeCounts, revenueFormat, chainName } = o
  const W = pdf.internal.pageSize.getWidth()
  const H = pdf.internal.pageSize.getHeight()
  const m = 12

  pdf.setFillColor(...NAVY)
  pdf.rect(0, 0, W, 16, 'F')
  pdf.setTextColor(...WHITE)
  pdf.setFontSize(13)
  pdf.setFont('helvetica', 'bold')
  pdf.text('Performance Dashboard', m, 11)
  pdf.setFontSize(8)
  pdf.setFont('helvetica', 'normal')
  pdf.text(chainName ? `Chain: ${chainName}` : 'All Chains', W - m, 11, { align: 'right' })

  let y = 24

  pdf.setTextColor(...NAVY)
  pdf.setFontSize(11)
  pdf.setFont('helvetica', 'bold')
  pdf.text('Grade Distribution', m, y)
  y += 3
  pdf.setDrawColor(...GOLD)
  pdf.setLineWidth(0.5)
  pdf.line(m, y, m + 50, y)
  y += 6

  const gl = ['A', 'B', 'C', 'D', 'E']
  const tot = Object.values(gradeCounts).reduce((a, b) => a + b, 0)
  const bmx = W - m * 2 - 60
  const bH = 10, bG = 4, bX = m + 30

  for (const grade of gl) {
    const count = gradeCounts[grade] || 0
    const pct = tot > 0 ? count / tot : 0
    const bW = Math.max(pct * bmx, 1)
    const info = GRADES[grade]
    const rgb = hexToRgb(info.color)

    pdf.setFontSize(9)
    pdf.setFont('helvetica', 'bold')
    pdf.setTextColor(rgb.r, rgb.g, rgb.b)
    pdf.text(`${grade}`, m, y + 7)
    pdf.setFontSize(7.5)
    pdf.setFont('helvetica', 'normal')
    pdf.setTextColor(...DARK_TEXT)
    pdf.text(info.label || '', m + 7, y + 7)

    pdf.setFillColor(230, 230, 230)
    pdf.roundedRect(bX, y, bmx, bH, 2, 2, 'F')

    pdf.setFillColor(rgb.r, rgb.g, rgb.b)
    if (bW > 4) pdf.roundedRect(bX, y, bW, bH, 2, 2, 'F')
    else if (bW > 0) pdf.rect(bX, y, bW, bH, 'F')

    pdf.setFontSize(7.5)
    pdf.setFont('helvetica', 'bold')
    const lbl = `${count}  (${Math.round(pct * 100)}%)`
    if (bW > 40) {
      pdf.setTextColor(...WHITE)
      pdf.text(lbl, bX + 4, y + 7)
    } else {
      pdf.setTextColor(...DARK_TEXT)
      pdf.text(lbl, bX + bW + 3, y + 7)
    }
    y += bH + bG
  }

  y += 10

  pdf.setTextColor(...NAVY)
  pdf.setFontSize(11)
  pdf.setFont('helvetica', 'bold')
  pdf.text('Average Revenue by Chain', m, y)
  y += 3
  pdf.setDrawColor(...GOLD)
  pdf.setLineWidth(0.5)
  pdf.line(m, y, m + 60, y)
  y += 6

  const cMap = new Map()
  for (const v of venues) {
    if (v.revenue == null || !v.chain) continue
    if (!cMap.has(v.chain)) cMap.set(v.chain, { t: 0, n: 0 })
    const s = cMap.get(v.chain)
    s.t += v.revenue
    s.n++
  }

  const cData = Array.from(cMap.entries())
    .map(([chain, s]) => ({ chain, avg: Math.round(s.t / s.n), n: s.n }))
    .sort((a, b) => b.avg - a.avg)

  const topC = cData.slice(0, 15)

  if (topC.length === 0) {
    pdf.setTextColor(...MID_GREY)
    pdf.setFontSize(9)
    pdf.text('No revenue data available for chain comparison.', m, y + 10)
  } else {
    const maxR = topC[0].avg || 1
    const cBmx = W - m * 2 - 80
    const cBH = 7, cBG = 3, cBX = m + 55

    for (const c of topC) {
      if (y + cBH + cBG > H - 15) break
      const p = c.avg / maxR
      const w = Math.max(p * cBmx, 1)

      pdf.setFontSize(7)
      pdf.setFont('helvetica', 'normal')
      pdf.setTextColor(...DARK_TEXT)
      pdf.text(truncate(c.chain, 25), m, y + 5)

      pdf.setFillColor(230, 230, 230)
      pdf.roundedRect(cBX, y, cBmx, cBH, 1.5, 1.5, 'F')

      const rank = topC.indexOf(c)
      const q = topC.length / 4
      const hue = rank < q ? [39, 174, 96] : rank < q * 2 ? [241, 196, 15] : rank < q * 3 ? [230, 126, 34] : [192, 57, 43]
      pdf.setFillColor(hue[0], hue[1], hue[2])
      if (w > 3) pdf.roundedRect(cBX, y, w, cBH, 1.5, 1.5, 'F')

      pdf.setFontSize(6.5)
      pdf.setFont('helvetica', 'bold')
      const rl = `${formatRevenue(c.avg, revenueFormat)}  (${c.n} venues)`
      if (w > 60) {
        pdf.setTextColor(...WHITE)
        pdf.text(rl, cBX + 3, y + 5)
      } else {
        pdf.setTextColor(...DARK_TEXT)
        pdf.text(rl, cBX + w + 3, y + 5)
      }
      y += cBH + cBG
    }

    if (cData.length > 15) {
      pdf.setTextColor(...MID_GREY)
      pdf.setFontSize(7)
      pdf.text(`+ ${cData.length - 15} more chains not shown`, m, y + 5)
    }
  }

  pdf.setTextColor(...MID_GREY)
  pdf.setFontSize(6)
  pdf.text('CineScope v1.10 \u2014 Liberator Film Services \u2014 Confidential', m, H - 5)
}


// --- 3. AI Report Pages ---

function sanitiseForPDF(text) {
  return text
    .replace(/\u2192/g, ' > ')
    .replace(/\u2190/g, ' < ')
    .replace(/\u2194/g, ' <> ')
    .replace(/\u2013/g, '-')
    .replace(/\u2014/g, ' - ')
    .replace(/\u2018/g, "'")
    .replace(/\u2019/g, "'")
    .replace(/\u201C/g, '"')
    .replace(/\u201D/g, '"')
    .replace(/\u2026/g, '...')
    .replace(/\u00B7/g, ' - ')
    .replace(/\u2022/g, '-')
    .replace(/\u2715/g, 'x')
    .replace(/[^\x00-\x7F\u00A0-\u00FF]/g, '')
}

function addAIReportPage(pdf, aiText, selectedFilm, margin) {
  aiText = sanitiseForPDF(aiText)
  const W = pdf.internal.pageSize.getWidth()
  const H = pdf.internal.pageSize.getHeight()

  pdf.setFillColor(...NAVY)
  pdf.rect(0, 0, W, 18, 'F')
  pdf.setTextColor(...WHITE)
  pdf.setFontSize(16)
  pdf.setFont('helvetica', 'bold')
  pdf.text('CineScope \u2014 AI Insights Report', margin, 12)
  pdf.setFontSize(8)
  pdf.setFont('helvetica', 'normal')
  pdf.text(`Generated: ${new Date().toLocaleDateString()} ${new Date().toLocaleTimeString()}`, W - margin, 12, { align: 'right' })

  let yP = 26
  if (selectedFilm) {
    pdf.setTextColor(...NAVY)
    pdf.setFontSize(11)
    pdf.setFont('helvetica', 'bold')
    pdf.text(selectedFilm.filmInfo.title || selectedFilm.filmInfo.fileName, margin, yP)
    yP += 7
  }

  pdf.setDrawColor(...GOLD)
  pdf.setLineWidth(0.6)
  pdf.line(margin, yP, W - margin, yP)
  yP += 6

  const mxW = W - margin * 2

  for (const line of aiText.split('\n')) {
    const t = line.trim()

    if (yP > H - 15) {
      pdf.addPage('landscape')
      pdf.setFillColor(...NAVY)
      pdf.rect(0, 0, W, 14, 'F')
      pdf.setTextColor(...WHITE)
      pdf.setFontSize(11)
      pdf.setFont('helvetica', 'bold')
      pdf.text('AI Insights Report (continued)', margin, 10)
      yP = 20
    }

    if (!t) { yP += 3; continue }

    if (t.startsWith('## ') || (t.startsWith('**') && t.endsWith('**') && t.length < 60)) {
      const h = t.replace(/^##\s*/, '').replace(/^\*\*/, '').replace(/\*\*$/, '')
      pdf.setTextColor(...NAVY)
      pdf.setFontSize(10)
      pdf.setFont('helvetica', 'bold')
      yP += 2
      pdf.text(h, margin, yP)
      yP += 5.5
      continue
    }

    const isList = /^(\d+\.\s|[-*]\s)/.test(t)
    const segs = parseInlineBold(t)
    pdf.setFontSize(8)
    pdf.setTextColor(...DARK_TEXT)

    const lx = isList ? margin + 3 : margin
    const lmx = isList ? mxW - 3 : mxW

    for (const wl of wrapSegments(pdf, segs, lmx)) {
      if (yP > H - 15) {
        pdf.addPage('landscape')
        pdf.setFillColor(...NAVY)
        pdf.rect(0, 0, W, 14, 'F')
        pdf.setTextColor(...WHITE)
        pdf.setFontSize(11)
        pdf.setFont('helvetica', 'bold')
        pdf.text('AI Insights Report (continued)', margin, 10)
        yP = 20
      }
      renderSegmentLine(pdf, wl, lx, yP)
      yP += 4
    }
    yP += 1
  }

  pdf.setTextColor(...MID_GREY)
  pdf.setFontSize(6)
  pdf.text('AI-generated insights \u2014 CineScope v1.10 \u2014 Liberator Film Services \u2014 Confidential', margin, H - 5)
}

function parseInlineBold(text) {
  const segs = []
  const re = /\*\*(.+?)\*\*/g
  let last = 0, m
  while ((m = re.exec(text)) !== null) {
    if (m.index > last) segs.push({ text: text.slice(last, m.index), bold: false })
    segs.push({ text: m[1], bold: true })
    last = re.lastIndex
  }
  if (last < text.length) segs.push({ text: text.slice(last), bold: false })
  return segs.length > 0 ? segs : [{ text, bold: false }]
}

function wrapSegments(pdf, segs, maxW) {
  pdf.setFont('helvetica', 'normal')
  pdf.setFontSize(8)
  if (pdf.getTextWidth(segs.map(s => s.text).join('')) <= maxW) return [segs]

  const words = []
  for (const s of segs) for (const p of s.text.split(/(\s+)/)) if (p) words.push({ text: p, bold: s.bold })

  const lines = []
  let cur = [], cw = 0
  for (const w of words) {
    pdf.setFont('helvetica', w.bold ? 'bold' : 'normal')
    const ww = pdf.getTextWidth(w.text)
    if (cw + ww > maxW && cur.length > 0) {
      lines.push(cur)
      cur = []
      cw = 0
      if (w.text.trim() === '') continue
    }
    cur.push(w)
    cw += ww
  }
  if (cur.length > 0) lines.push(cur)
  return lines
}

function renderSegmentLine(pdf, segs, x, y) {
  let cx = x
  pdf.setFontSize(8)
  pdf.setTextColor(...DARK_TEXT)
  for (const s of segs) {
    pdf.setFont('helvetica', s.bold ? 'bold' : 'normal')
    pdf.text(s.text, cx, y)
    cx += pdf.getTextWidth(s.text)
  }
}


// --- 4. Map Page ---

async function addMapPage(pdf, o) {
  const { selectedFilm, gradeCounts, mapSelector, revenueFormat } = o
  const html2canvas = await getHtml2Canvas()
  const W = pdf.internal.pageSize.getWidth()
  const H = pdf.internal.pageSize.getHeight()
  const m = 12

  pdf.setFillColor(...NAVY)
  pdf.rect(0, 0, W, 18, 'F')
  pdf.setTextColor(...WHITE)
  pdf.setFontSize(16)
  pdf.setFont('helvetica', 'bold')
  pdf.text('CineScope \u2014 Venue Map', m, 12)
  pdf.setFontSize(8)
  pdf.setFont('helvetica', 'normal')
  pdf.text(`Generated: ${new Date().toLocaleDateString()} ${new Date().toLocaleTimeString()}`, W - m, 12, { align: 'right' })

  let yP = 24
  pdf.setTextColor(...DARK_TEXT)

  if (selectedFilm) {
    pdf.setFontSize(11)
    pdf.setFont('helvetica', 'bold')
    pdf.text(selectedFilm.filmInfo.title || selectedFilm.filmInfo.fileName, m, yP)
    pdf.setFontSize(8)
    pdf.setFont('helvetica', 'normal')
    const st = selectedFilm.stats || {}
    pdf.text(`${st.totalVenues || 0} venues \u00B7 ${formatRevenue(st.totalRevenue || 0, revenueFormat)} total \u00B7 ${formatRevenue(st.avgRevenue || 0, revenueFormat)} avg`, m, yP + 5)
    yP += 12
  } else {
    pdf.setFontSize(11)
    pdf.setFont('helvetica', 'bold')
    pdf.text('All Venues (no film selected)', m, yP)
    yP += 8
  }

  if (selectedFilm && gradeCounts) {
    const bW = 30, bH = 14, gap = 4
    const tot = Object.values(gradeCounts).reduce((a, b) => a + b, 0)
    ;['A', 'B', 'C', 'D', 'E'].forEach((g, i) => {
      const x = m + i * (bW + gap)
      const info = GRADES[g]
      const count = gradeCounts[g] || 0
      const pct = tot > 0 ? Math.round((count / tot) * 100) : 0
      const rgb = hexToRgb(info.color)

      pdf.setFillColor(rgb.r, rgb.g, rgb.b)
      pdf.roundedRect(x, yP, bW, bH, 2, 2, 'F')
      pdf.setTextColor(...WHITE)
      pdf.setFontSize(10)
      pdf.setFont('helvetica', 'bold')
      pdf.text(`${g}: ${count}`, x + bW / 2, yP + 7, { align: 'center' })
      pdf.setFontSize(7)
      pdf.setFont('helvetica', 'normal')
      pdf.text(`${pct}%`, x + bW / 2, yP + 12, { align: 'center' })
    })
    yP += bH + 6
  }

  try {
    const el = document.querySelector(mapSelector)
    if (el) {
      const canvas = await html2canvas(el, {
        useCORS: true, allowTaint: true, backgroundColor: '#f8f9fa', scale: 2, logging: false,
        ignoreElements: (e) => e.classList?.contains('leaflet-control-zoom') || e.classList?.contains('leaflet-control-attribution'),
      })
      const ar = canvas.width / canvas.height
      const mmW = W - m * 2, mmH = 90
      let mW, mH
      if (mmW / ar <= mmH) { mW = mmW; mH = mmW / ar } else { mH = mmH; mW = mmH * ar }
      pdf.addImage(canvas.toDataURL('image/png'), 'PNG', m + (mmW - mW) / 2, yP, mW, mH)
    }
  } catch (err) {
    console.warn('Could not capture map for PDF:', err)
    pdf.setTextColor(...MID_GREY)
    pdf.setFontSize(9)
    pdf.text('[Map screenshot could not be captured]', m, yP + 10)
  }
}


// --- 5. Venue List Pages (v1.10 - improved) ---

function addVenueListPages(pdf, o) {
  const { venues, revenueFormat, selectedFilm, chainName } = o
  const W = pdf.internal.pageSize.getWidth()
  const H = pdf.internal.pageSize.getHeight()
  const m = 12
  const hasRev = venues.some(v => v.revenue != null)
  const footerY = H - 10

  const cols = hasRev
    ? [
        { header: 'Venue',    w: 80, align: 'left',   trunc: 40 },
        { header: 'City',     w: 40, align: 'left',   trunc: 20 },
        { header: 'Chain',    w: 44, align: 'left',   trunc: 22 },
        { header: 'Category', w: 34, align: 'left',   trunc: 17 },
        { header: 'Revenue',  w: 34, align: 'right',  trunc: 0  },
        { header: 'Grade',    w: 24, align: 'center', trunc: 0  },
      ]
    : [
        { header: 'Venue',    w: 100, align: 'left',  trunc: 50 },
        { header: 'City',     w: 52,  align: 'left',  trunc: 28 },
        { header: 'Chain',    w: 50,  align: 'left',  trunc: 26 },
        { header: 'Category', w: 40,  align: 'left',  trunc: 20 },
        { header: 'Country',  w: 30,  align: 'left',  trunc: 15 },
      ]

  const tableW = cols.reduce((s, c) => s + c.w, 0)
  const rowH = 5
  const headerRowH = 6

  const sorted = [...venues].sort((a, b) => {
    const go = { A: 0, B: 1, C: 2, D: 3, E: 4 }
    const d = (go[a.grade] ?? 5) - (go[b.grade] ?? 5)
    return d !== 0 ? d : (b.revenue || 0) - (a.revenue || 0)
  })

  const drawPageHeader = (isFirst) => {
    const barH = isFirst ? 16 : 14
    pdf.setFillColor(...NAVY)
    pdf.rect(0, 0, W, barH, 'F')
    pdf.setTextColor(...WHITE)
    pdf.setFontSize(isFirst ? 13 : 11)
    pdf.setFont('helvetica', 'bold')
    pdf.text(isFirst ? 'Venue Performance List' : 'Venue List (continued)', m, isFirst ? 11 : 10)

    pdf.setFontSize(8)
    pdf.setFont('helvetica', 'normal')
    const parts = []
    if (selectedFilm) parts.push(truncate(selectedFilm.filmInfo.title || selectedFilm.filmInfo.fileName, 40))
    if (chainName) parts.push(chainName)
    parts.push(`${venues.length} venues`)
    pdf.text(parts.join('  |  '), W - m, isFirst ? 11 : 10, { align: 'right' })

    return barH + 4
  }

  const drawTableHeader = (y) => {
    pdf.setFillColor(...TABLE_HEADER_BG)
    pdf.rect(m, y, tableW, headerRowH, 'F')

    pdf.setDrawColor(...GOLD)
    pdf.setLineWidth(0.4)
    pdf.line(m, y + headerRowH, m + tableW, y + headerRowH)

    pdf.setTextColor(...NAVY)
    pdf.setFontSize(7)
    pdf.setFont('helvetica', 'bold')

    let x = m
    for (const col of cols) {
      const textY = y + 4.2
      if (col.align === 'right') {
        pdf.text(col.header, x + col.w - 3, textY, { align: 'right' })
      } else if (col.align === 'center') {
        pdf.text(col.header, x + col.w / 2, textY, { align: 'center' })
      } else {
        pdf.text(col.header, x + 2, textY)
      }
      x += col.w
    }

    return y + headerRowH + 2
  }

  const drawPageFooter = () => {
    pdf.setDrawColor(220, 220, 220)
    pdf.setLineWidth(0.3)
    pdf.line(m, footerY - 2, m + tableW, footerY - 2)
    pdf.setTextColor(...MID_GREY)
    pdf.setFontSize(6)
    pdf.setFont('helvetica', 'normal')
    pdf.text('CineScope v1.10 \u2014 Liberator Film Services \u2014 Confidential', m, footerY + 2)
  }

  let yP = drawPageHeader(true)
  yP = drawTableHeader(yP)
  let rowIndex = 0

  for (let i = 0; i < sorted.length; i++) {
    const v = sorted[i]

    if (yP + rowH > footerY - 4) {
      drawPageFooter()
      pdf.addPage('landscape')
      yP = drawPageHeader(false)
      yP = drawTableHeader(yP)
      rowIndex = 0
    }

    if (rowIndex % 2 === 0) {
      pdf.setFillColor(...ZEBRA_BG)
      pdf.rect(m, yP - 1, tableW, rowH, 'F')
    }

    let x = m

    if (hasRev) {
      pdf.setFontSize(6.5)
      pdf.setFont('helvetica', 'normal')
      pdf.setTextColor(...DARK_TEXT)
      const vName = truncate(v.name, cols[0].trunc)
      pdf.text(vName, x + 2, yP + 3)

      if (v.wasAggregated) {
        const nameW = pdf.getTextWidth(vName)
        pdf.setFontSize(5)
        pdf.setTextColor(...MID_GREY)
        pdf.text('[+]', x + 3 + nameW, yP + 3)
      }
      x += cols[0].w

      pdf.setFontSize(6.5)
      pdf.setFont('helvetica', 'normal')
      pdf.setTextColor(...DARK_TEXT)
      pdf.text(truncate(v.city || '', cols[1].trunc), x + 2, yP + 3)
      x += cols[1].w

      pdf.text(truncate(v.chain || '', cols[2].trunc), x + 2, yP + 3)
      x += cols[2].w

      pdf.setTextColor(...MID_GREY)
      pdf.text(truncate(v.category || '', cols[3].trunc), x + 2, yP + 3)
      x += cols[3].w

      if (v.revenue != null) {
        pdf.setTextColor(...DARK_TEXT)
        pdf.setFont('helvetica', 'bold')
        pdf.setFontSize(6.5)
        pdf.text(formatRevenue(v.revenue, revenueFormat), x + cols[4].w - 3, yP + 3, { align: 'right' })
      } else {
        pdf.setTextColor(...MID_GREY)
        pdf.setFont('helvetica', 'normal')
        pdf.setFontSize(6.5)
        pdf.text('-', x + cols[4].w - 3, yP + 3, { align: 'right' })
      }
      x += cols[4].w

      if (v.grade && GRADES[v.grade]) {
        const rgb = hexToRgb(GRADES[v.grade].color)
        const dotX = x + cols[5].w / 2 - 5
        const dotY = yP + 2

        pdf.setFillColor(rgb.r, rgb.g, rgb.b)
        pdf.circle(dotX, dotY, 1.5, 'F')

        pdf.setTextColor(rgb.r, rgb.g, rgb.b)
        pdf.setFontSize(7.5)
        pdf.setFont('helvetica', 'bold')
        pdf.text(v.grade, dotX + 3.5, yP + 3)
      } else {
        pdf.setTextColor(...MID_GREY)
        pdf.setFontSize(6.5)
        pdf.setFont('helvetica', 'normal')
        pdf.text('-', x + cols[5].w / 2, yP + 3, { align: 'center' })
      }

    } else {
      pdf.setFontSize(6.5)
      pdf.setFont('helvetica', 'normal')
      pdf.setTextColor(...DARK_TEXT)
      pdf.text(truncate(v.name, cols[0].trunc), x + 2, yP + 3)
      x += cols[0].w
      pdf.text(truncate(v.city || '', cols[1].trunc), x + 2, yP + 3)
      x += cols[1].w
      pdf.text(truncate(v.chain || '', cols[2].trunc), x + 2, yP + 3)
      x += cols[2].w
      pdf.setTextColor(...MID_GREY)
      pdf.text(truncate(v.category || '', cols[3].trunc), x + 2, yP + 3)
      x += cols[3].w
      pdf.setTextColor(...DARK_TEXT)
      pdf.text(v.country || '', x + 2, yP + 3)
    }

    yP += rowH
    rowIndex++
  }

  pdf.setDrawColor(200, 200, 200)
  pdf.setLineWidth(0.3)
  pdf.line(m, yP, m + tableW, yP)

  yP += 5
  if (yP < footerY - 8) {
    pdf.setFontSize(7)
    pdf.setFont('helvetica', 'italic')
    pdf.setTextColor(...MID_GREY)
    const summaryParts = [`${sorted.length} venues listed`]
    const aggCount = sorted.filter(v => v.wasAggregated).length
    if (aggCount > 0) summaryParts.push(`${aggCount} with multi-screen aggregation [+]`)
    pdf.text(summaryParts.join('  |  '), m, yP)
  }

  drawPageFooter()
}


// --- 6. Page Numbering (global post-processing pass) ---

function addPageNumbers(pdf) {
  const totalPages = pdf.getNumberOfPages()
  const W = pdf.internal.pageSize.getWidth()
  const H = pdf.internal.pageSize.getHeight()

  for (let i = 1; i <= totalPages; i++) {
    pdf.setPage(i)
    if (i === 1) continue

    pdf.setFontSize(6.5)
    pdf.setFont('helvetica', 'normal')
    pdf.setTextColor(...MID_GREY)
    pdf.text(`Page ${i} of ${totalPages}`, W - 12, H - 5, { align: 'right' })
  }
}


// ===================================================================
// Main PDF Export - orchestrator
// ===================================================================

export async function exportPDF({
  venues, gradeCounts, selectedFilm,
  mapSelector = '.map-wrapper', revenueFormat = 'decimal',
  aiReportText = null, chainName = '', theme = 'light',
}) {
  const jsPDF = await getJsPDF()
  const pdf = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' })

  // 1. Cover
  addCoverPage(pdf, { selectedFilm, gradeCounts, venues, chainName, revenueFormat })

  // 2. AI Insights (optional)
  if (aiReportText) {
    pdf.addPage('landscape')
    addAIReportPage(pdf, aiReportText, selectedFilm, 12)
  }

  // 3. Dashboard Charts
  pdf.addPage('landscape')
  addDashboardChartsPage(pdf, { venues, gradeCounts, revenueFormat, chainName })

  // 4. Map
  pdf.addPage('landscape')
  await addMapPage(pdf, { selectedFilm, gradeCounts, mapSelector, revenueFormat })

  // 5. Venue List (now receives film/chain context for better headers)
  pdf.addPage('landscape')
  addVenueListPages(pdf, { venues, revenueFormat, selectedFilm, chainName })

  // 6. Global page numbers (all pages except cover)
  addPageNumbers(pdf)

  // Save
  const fn = selectedFilm?.filmInfo.title || 'All_Venues'
  pdf.save(`CineScope_Report_${sanitiseFilename(fn)}_${dateStamp()}.pdf`)
}


// --- Helpers ---

function csvEscape(v) {
  const s = String(v)
  return (s.includes(',') || s.includes('"') || s.includes('\n')) ? `"${s.replace(/"/g, '""')}"` : s
}
function sanitiseFilename(n) { return n.replace(/[^a-zA-Z0-9_-]/g, '_').substring(0, 40) }
function dateStamp() { return new Date().toISOString().slice(0, 10).replace(/-/g, '') }

function downloadBlob(content, filename, mime) {
  const url = URL.createObjectURL(new Blob([content], { type: mime }))
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
  const r = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex)
  return r ? { r: parseInt(r[1], 16), g: parseInt(r[2], 16), b: parseInt(r[3], 16) } : { r: 0, g: 0, b: 0 }
}

// ASCII-safe truncation - uses '..' instead of Unicode ellipsis for Helvetica compatibility
function truncate(s, n) { return s.length <= n ? s : s.substring(0, n - 2) + '..' }
