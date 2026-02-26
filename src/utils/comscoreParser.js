/**
 * CineScope — Comscore File Parser
 * Parses Comscore "Grosses By Theatre" exports (CSV, XLS, XLSX)
 * Runs entirely client-side via SheetJS — no data leaves the browser
 */

import * as XLSX from 'xlsx'

/**
 * Parse a Comscore file and extract venue revenue data
 * 
 * @param {File} file - The uploaded file (CSV, XLS, or XLSX)
 * @returns {Promise<Object>} Parsed result with film info and venue data
 * 
 * Expected Comscore columns:
 *   Theater, Rank in Complex, City, State, Circuit, # Screens, # Titles,
 *   Region, Branch, Date Range £
 * 
 * The file may also have header rows with film title and date range metadata.
 */
export async function parseComscoreFile(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()

    reader.onload = (e) => {
      try {
        const data = new Uint8Array(e.target.result)
        const workbook = XLSX.read(data, { type: 'array' })

        // Use the first sheet
        const sheetName = workbook.SheetNames[0]
        const sheet = workbook.Sheets[sheetName]

        // Convert to array of arrays to inspect header rows
        const rawRows = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '' })

        if (rawRows.length < 2) {
          reject(new Error('File appears to be empty or has too few rows'))
          return
        }

        // Try to extract film metadata from header rows
        const filmInfo = extractFilmInfo(rawRows)

        // Find the header row (contains "Theater" or "Theatre")
        let headerRowIdx = -1
        for (let i = 0; i < Math.min(20, rawRows.length); i++) {
          const row = rawRows[i].map(cell => String(cell).toLowerCase().trim())
          if (row.includes('theater') || row.includes('theatre')) {
            headerRowIdx = i
            break
          }
        }

        if (headerRowIdx === -1) {
          reject(new Error('Could not find header row with "Theater" column. Is this a Comscore Grosses By Theatre export?'))
          return
        }

        // Map header names to column indices
        const headers = rawRows[headerRowIdx].map(h => String(h).trim())
        const colMap = buildColumnMap(headers)

        if (colMap.theater === -1) {
          reject(new Error('Could not find "Theater" column in the header row'))
          return
        }

        // Parse venue rows (raw — may contain multi-screen duplicates)
        const rawVenues = []
        for (let i = headerRowIdx + 1; i < rawRows.length; i++) {
          const row = rawRows[i]
          if (!row || row.length === 0) continue

          const theaterName = String(row[colMap.theater] || '').trim()
          if (!theaterName) continue

          // Parse revenue — handle currency formatting
          let revenue = 0
          if (colMap.revenue !== -1) {
            const rawRevenue = String(row[colMap.revenue] || '0')
            revenue = parseCurrency(rawRevenue)
          }

          const venue = {
            theater: theaterName,
            city: colMap.city !== -1 ? String(row[colMap.city] || '').trim() : '',
            state: colMap.state !== -1 ? String(row[colMap.state] || '').trim() : '',
            circuit: colMap.circuit !== -1 ? String(row[colMap.circuit] || '').trim() : '',
            screens: colMap.screens !== -1 ? parseInt(row[colMap.screens]) || 0 : 0,
            titles: colMap.titles !== -1 ? parseInt(row[colMap.titles]) || 0 : 0,
            region: colMap.region !== -1 ? String(row[colMap.region] || '').trim() : '',
            branch: colMap.branch !== -1 ? String(row[colMap.branch] || '').trim() : '',
            revenue: revenue,
            rankInComplex: colMap.rank !== -1 ? parseInt(row[colMap.rank]) || 0 : 0,
          }

          rawVenues.push(venue)
        }

        // ── Revenue Aggregation ──────────────────────────────
        // Some venues report per-screen (multiple rows for the same cinema).
        // Others report a single combined figure. We group by venue name + city
        // and sum the revenue to ensure every physical venue has one entry.
        const { venues, aggregationLog } = aggregateMultiScreenVenues(rawVenues)

        // Calculate summary stats (on aggregated data)
        const totalRevenue = venues.reduce((sum, v) => sum + v.revenue, 0)
        const avgRevenue = venues.length > 0 ? totalRevenue / venues.length : 0

        resolve({
          filmInfo: {
            ...filmInfo,
            fileName: file.name,
          },
          venues,
          aggregationLog,  // List of venues that were combined (for UI display)
          stats: {
            totalVenues: venues.length,
            totalRevenue,
            avgRevenue: Math.round(avgRevenue),
            maxRevenue: Math.max(...venues.map(v => v.revenue), 0),
            minRevenue: Math.min(...venues.map(v => v.revenue), 0),
            medianRevenue: calculateMedian(venues.map(v => v.revenue)),
            rawRowCount: rawVenues.length,
            aggregatedCount: rawVenues.length - venues.length,
          },
        })
      } catch (err) {
        reject(new Error(`Failed to parse file: ${err.message}`))
      }
    }

    reader.onerror = () => reject(new Error('Failed to read file'))
    reader.readAsArrayBuffer(file)
  })
}


/**
 * Try to extract film title and date range from header rows
 */
function extractFilmInfo(rawRows) {
  const info = { title: 'Unknown Film', dateRange: '' }

  // Comscore exports sometimes have metadata in the first few rows
  // Look for patterns like "Title: NT Live..." or just the film name
  for (let i = 0; i < Math.min(10, rawRows.length); i++) {
    const rowText = rawRows[i].map(c => String(c)).join(' ').trim()

    // Skip empty rows
    if (!rowText || rowText === ' ') continue

    // Look for a row that might be the title (before the data headers)
    if (rowText.toLowerCase().includes('theater') || rowText.toLowerCase().includes('theatre')) break

    // Check if this row has film-like content
    if (rowText.length > 5 && !rowText.toLowerCase().includes('gross') && !rowText.toLowerCase().includes('date')) {
      // Could be a title row
      const cleaned = rawRows[i].filter(c => c && String(c).trim()).map(c => String(c).trim())
      if (cleaned.length > 0 && cleaned.length <= 3) {
        info.title = cleaned[0]
      }
    }

    // Check for date range pattern
    if (rowText.match(/\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4}/)) {
      info.dateRange = rowText
    }
  }

  return info
}


/**
 * Build column index map from header row
 */
function buildColumnMap(headers) {
  const lower = headers.map(h => h.toLowerCase())

  return {
    theater: findColumn(lower, ['theater', 'theatre']),
    rank: findColumn(lower, ['rank in complex', 'rank']),
    city: findColumn(lower, ['city']),
    state: findColumn(lower, ['state']),
    circuit: findColumn(lower, ['circuit']),
    screens: findColumn(lower, ['# screens', 'screens', 'screen count']),
    titles: findColumn(lower, ['# titles', 'titles', 'title count']),
    region: findColumn(lower, ['region']),
    branch: findColumn(lower, ['branch']),
    revenue: findColumn(lower, ['date range £', 'date range', 'gross', 'revenue', 'total gross', '£']),
  }
}


/**
 * Find the first matching column index
 */
function findColumn(headers, candidates) {
  for (const candidate of candidates) {
    const idx = headers.findIndex(h => h.includes(candidate))
    if (idx !== -1) return idx
  }
  return -1
}


/**
 * Parse a currency string into a number
 * Handles: "£1,234.56", "1234.56", "$1,234", "1,234", etc.
 */
function parseCurrency(str) {
  if (typeof str === 'number') return str
  const cleaned = String(str).replace(/[£$€,\s]/g, '')
  const num = parseFloat(cleaned)
  return isNaN(num) ? 0 : num
}


/**
 * Aggregate multi-screen venue entries into single venue records.
 * 
 * Problem: Some cinemas report revenue per-screen (one row per screen),
 * while others report a combined total. This means the same physical venue
 * can appear 2-3 times in a Comscore export.
 * 
 * Solution: Group by normalised venue name + city, sum revenue, and flag
 * the combined entries so Austin can see what happened.
 * 
 * @param {Array} rawVenues - Parsed venue rows (may contain duplicates)
 * @returns {{ venues: Array, aggregationLog: Array }}
 */
function aggregateMultiScreenVenues(rawVenues) {
  // Build groups using compound key: normalised name + city
  const groups = new Map()

  for (const venue of rawVenues) {
    const key = makeVenueKey(venue.theater, venue.city)

    if (!groups.has(key)) {
      groups.set(key, [])
    }
    groups.get(key).push(venue)
  }

  const venues = []
  const aggregationLog = []

  for (const [key, entries] of groups) {
    if (entries.length === 1) {
      // Single entry — pass through unchanged, mark as not aggregated
      venues.push({ ...entries[0], screenEntries: 1, wasAggregated: false })
    } else {
      // Multiple entries for the same venue — aggregate
      const combined = combineVenueEntries(entries)
      venues.push(combined)

      aggregationLog.push({
        theater: combined.theater,
        city: combined.city,
        entriesCount: entries.length,
        individualRevenues: entries.map(e => e.revenue),
        combinedRevenue: combined.revenue,
        individualScreens: entries.map(e => e.screens),
      })
    }
  }

  return { venues, aggregationLog }
}


/**
 * Create a normalised compound key for venue deduplication.
 * Strips common suffixes like screen numbers, normalises whitespace/case.
 * 
 * Examples:
 *   "Vue Edinburgh Omni Centre 12" + "Edinburgh" → "vue edinburgh omni centre|edinburgh"
 *   "Cineworld Brighton Screen 3" + "Brighton"   → "cineworld brighton|brighton"
 *   "Cineworld Brighton Screen 7" + "Brighton"   → "cineworld brighton|brighton"  (same key!)
 */
function makeVenueKey(name, city) {
  let normalised = name
    .toLowerCase()
    .trim()
    // Remove trailing screen/screen numbers: "Screen 3", "Scr 7", "- Screen 2"
    .replace(/[\s\-]*(?:screen|scr)\.?\s*\d+\s*$/i, '')
    // Remove trailing standalone numbers that look like screen counts
    // but be careful not to strip legitimate numbers (e.g. "Vue 12" as a venue name)
    // Only strip if preceded by a space and the number is 1-2 digits
    .replace(/\s+\d{1,2}\s*$/, '')
    // Normalise whitespace
    .replace(/\s+/g, ' ')
    .trim()

  const normCity = (city || '').toLowerCase().trim()

  return `${normalised}|${normCity}`
}


/**
 * Combine multiple entries for the same venue into one aggregated record.
 * 
 * Rules:
 * - Revenue: SUM of all entries
 * - Screens: MAX of all entries (the venue has at least that many screens)
 * - Metadata (circuit, region, branch): take from the first entry
 * - Flag with count so the UI can show a multi-screen indicator
 */
function combineVenueEntries(entries) {
  // Use the first entry as the base (it has the metadata)
  const base = { ...entries[0] }

  // Sum revenue across all screen entries
  base.revenue = entries.reduce((sum, e) => sum + e.revenue, 0)

  // Take the max screen count (gives the best estimate of total screens)
  base.screens = Math.max(...entries.map(e => e.screens))

  // Sum titles if they differ (usually the same, but just in case)
  const uniqueTitles = new Set(entries.map(e => e.titles))
  if (uniqueTitles.size > 1) {
    base.titles = Math.max(...entries.map(e => e.titles))
  }

  // Add aggregation metadata
  base.screenEntries = entries.length
  base.wasAggregated = true

  return base
}


/**
 * Calculate median of an array of numbers
 */
function calculateMedian(numbers) {
  if (numbers.length === 0) return 0
  const sorted = [...numbers].sort((a, b) => a - b)
  const mid = Math.floor(sorted.length / 2)
  return sorted.length % 2 !== 0
    ? sorted[mid]
    : Math.round((sorted[mid - 1] + sorted[mid]) / 2)
}
