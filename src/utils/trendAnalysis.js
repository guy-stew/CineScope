/**
 * CineScope Trend Analysis Engine
 *
 * Analyses performance trends across multiple imported films at three levels:
 * 1. Venue-level — how each cinema's grade changes across films
 * 2. Chain-level — how chains compare over time
 * 3. Regional-level — performance patterns by geography
 *
 * Requires at least 2 imported films to produce meaningful trends.
 */

import { matchVenues } from './venueMatcher'
import { calculateGrades } from './grades'

// ─── Geographic Region Classification ─────────────────────────────
// Derived from lat/lng since venues don't have an explicit region field.

function classifyRegion(venue) {
  if (venue.country === 'Ireland') return 'Ireland'
  const lat = venue.lat
  if (lat >= 55.8) return 'Scotland'
  if (lat >= 54.5) return 'North East'
  if (lat >= 53.3) return 'North West & Yorkshire'
  if (lat >= 52.2) return 'Midlands'
  if (lat >= 51.8) return 'Wales & West'
  if (lat >= 51.3) return 'London & South East'
  return 'South West'
}

// Grade to numeric score for averaging (A=4, B=3, C=2, D=1, E=0)
const GRADE_SCORE = { A: 4, B: 3, C: 2, D: 1, E: 0 }
const SCORE_GRADE = { 4: 'A', 3: 'B', 2: 'C', 1: 'D', 0: 'E' }

function avgGradeScore(scores) {
  if (scores.length === 0) return 0
  return scores.reduce((s, v) => s + v, 0) / scores.length
}

function scoreToGrade(score) {
  // Round to nearest grade
  const rounded = Math.round(score)
  return SCORE_GRADE[Math.min(4, Math.max(0, rounded))] || 'E'
}

function getTrendDirection(grades) {
  if (grades.length < 2) return 'stable'
  const scores = grades.map(g => GRADE_SCORE[g] ?? 0)
  const first = scores[0]
  const last = scores[scores.length - 1]
  const diff = last - first
  if (diff >= 1) return 'improving'
  if (diff <= -1) return 'declining'
  return 'stable'
}

// ─── Main Analysis Function ──────────────────────────────────────

/**
 * Compute full trend analysis across all imported films.
 *
 * @param {Array} importedFilms — array of film entries from AppContext
 * @param {Array} baseVenues — geocoded venue list
 * @param {Object} gradeSettings — current grade boundary settings
 * @returns {Object} — { venueTrends, chainTrends, regionalTrends, summary }
 */
export function computeTrends(importedFilms, baseVenues, gradeSettings) {
  if (importedFilms.length < 2) {
    return null
  }

  // Sort films chronologically by import order (filmId contains timestamp)
  const sortedFilms = [...importedFilms].sort((a, b) => {
    const tA = parseInt(a.id.replace('film-', '')) || 0
    const tB = parseInt(b.id.replace('film-', '')) || 0
    return tA - tB
  })

  const filmTitles = sortedFilms.map(f => f.filmInfo.title || f.filmInfo.fileName)

  // ── Step 1: Grade each film's venues ─────────────────────────
  // For each film, run matching + grading to get per-venue grades

  const filmGrades = [] // array of Map<venueKey, { grade, revenue, venue }>

  for (const film of sortedFilms) {
    const { matched } = matchVenues(film.comscoreVenues, baseVenues)
    const graded = calculateGrades(matched, gradeSettings)

    const gradeMap = new Map()
    for (const v of graded) {
      const key = `${v.name}|${v.city}`.toLowerCase()
      gradeMap.set(key, {
        grade: v.grade,
        revenue: v.revenue || 0,
        name: v.name,
        city: v.city,
        chain: v.chain,
        category: v.category,
        lat: v.lat,
        lng: v.lng,
        country: v.country,
      })
    }
    filmGrades.push(gradeMap)
  }

  // ── Step 2: Venue-level trends ──────────────────────────────

  // Collect all venue keys that appeared in at least 2 films
  const allVenueKeys = new Set()
  for (const gradeMap of filmGrades) {
    for (const key of gradeMap.keys()) {
      allVenueKeys.add(key)
    }
  }

  const venueTrends = []

  for (const key of allVenueKeys) {
    const appearances = []
    let venueInfo = null

    for (let i = 0; i < sortedFilms.length; i++) {
      const entry = filmGrades[i].get(key)
      if (entry) {
        if (!venueInfo) venueInfo = entry
        appearances.push({
          filmIndex: i,
          filmTitle: filmTitles[i],
          grade: entry.grade,
          revenue: entry.revenue,
        })
      }
    }

    // Only include venues that appeared in at least 2 films
    if (appearances.length >= 2 && venueInfo) {
      const grades = appearances.map(a => a.grade)
      const direction = getTrendDirection(grades)
      const region = classifyRegion(venueInfo)

      venueTrends.push({
        key,
        name: venueInfo.name,
        city: venueInfo.city,
        chain: venueInfo.chain,
        category: venueInfo.category,
        region,
        appearances,
        grades,
        direction,
        filmCount: appearances.length,
        latestGrade: grades[grades.length - 1],
        avgRevenue: Math.round(
          appearances.reduce((s, a) => s + a.revenue, 0) / appearances.length
        ),
      })
    }
  }

  // Sort by name
  venueTrends.sort((a, b) => a.name.localeCompare(b.name))

  // ── Step 3: Chain-level trends ──────────────────────────────

  const chainMap = new Map() // chain → { perFilm: [{ avgRev, avgGrade, count }] }

  const uniqueChains = [...new Set(baseVenues.map(v => v.chain).filter(Boolean))].sort()

  for (const chain of uniqueChains) {
    const perFilm = []

    for (let i = 0; i < sortedFilms.length; i++) {
      const chainVenues = []

      for (const [, entry] of filmGrades[i]) {
        if (entry.chain === chain && entry.grade !== 'E') {
          chainVenues.push(entry)
        }
      }

      if (chainVenues.length > 0) {
        const avgRev = Math.round(
          chainVenues.reduce((s, v) => s + v.revenue, 0) / chainVenues.length
        )
        const avgScore = avgGradeScore(chainVenues.map(v => GRADE_SCORE[v.grade] ?? 0))

        perFilm.push({
          filmIndex: i,
          filmTitle: filmTitles[i],
          venueCount: chainVenues.length,
          totalRevenue: chainVenues.reduce((s, v) => s + v.revenue, 0),
          avgRevenue: avgRev,
          avgGradeScore: avgScore,
          avgGrade: scoreToGrade(avgScore),
          gradeDistribution: {
            A: chainVenues.filter(v => v.grade === 'A').length,
            B: chainVenues.filter(v => v.grade === 'B').length,
            C: chainVenues.filter(v => v.grade === 'C').length,
            D: chainVenues.filter(v => v.grade === 'D').length,
          },
        })
      }
    }

    if (perFilm.length >= 2) {
      const grades = perFilm.map(p => p.avgGrade)
      chainMap.set(chain, {
        chain,
        perFilm,
        direction: getTrendDirection(grades),
        latestAvgRevenue: perFilm[perFilm.length - 1]?.avgRevenue || 0,
        latestAvgGrade: perFilm[perFilm.length - 1]?.avgGrade || 'E',
      })
    }
  }

  const chainTrends = [...chainMap.values()].sort(
    (a, b) => b.latestAvgRevenue - a.latestAvgRevenue
  )

  // ── Step 4: Regional trends ────────────────────────────────

  const regionNames = [
    'London & South East', 'South West', 'Wales & West',
    'Midlands', 'North West & Yorkshire', 'North East',
    'Scotland', 'Ireland',
  ]

  const regionalTrends = []

  for (const region of regionNames) {
    const perFilm = []

    for (let i = 0; i < sortedFilms.length; i++) {
      const regionVenues = []

      for (const [, entry] of filmGrades[i]) {
        if (classifyRegion(entry) === region && entry.grade !== 'E') {
          regionVenues.push(entry)
        }
      }

      if (regionVenues.length > 0) {
        const avgRev = Math.round(
          regionVenues.reduce((s, v) => s + v.revenue, 0) / regionVenues.length
        )
        const avgScore = avgGradeScore(regionVenues.map(v => GRADE_SCORE[v.grade] ?? 0))

        perFilm.push({
          filmIndex: i,
          filmTitle: filmTitles[i],
          venueCount: regionVenues.length,
          totalRevenue: regionVenues.reduce((s, v) => s + v.revenue, 0),
          avgRevenue: avgRev,
          avgGradeScore: avgScore,
          avgGrade: scoreToGrade(avgScore),
        })
      }
    }

    if (perFilm.length >= 1) {
      const grades = perFilm.map(p => p.avgGrade)
      regionalTrends.push({
        region,
        perFilm,
        direction: perFilm.length >= 2 ? getTrendDirection(grades) : 'stable',
        latestAvgRevenue: perFilm[perFilm.length - 1]?.avgRevenue || 0,
        latestAvgGrade: perFilm[perFilm.length - 1]?.avgGrade || 'E',
      })
    }
  }

  // ── Step 5: Summary stats ──────────────────────────────────

  const improving = venueTrends.filter(v => v.direction === 'improving')
  const declining = venueTrends.filter(v => v.direction === 'declining')
  const stable = venueTrends.filter(v => v.direction === 'stable')

  const summary = {
    filmCount: sortedFilms.length,
    filmTitles,
    trackedVenues: venueTrends.length,
    improving: improving.length,
    declining: declining.length,
    stable: stable.length,
    topImprovers: improving
      .sort((a, b) => {
        const aJump = (GRADE_SCORE[a.latestGrade] || 0) - (GRADE_SCORE[a.grades[0]] || 0)
        const bJump = (GRADE_SCORE[b.latestGrade] || 0) - (GRADE_SCORE[b.grades[0]] || 0)
        return bJump - aJump
      })
      .slice(0, 10),
    topDecliners: declining
      .sort((a, b) => {
        const aDrop = (GRADE_SCORE[a.grades[0]] || 0) - (GRADE_SCORE[a.latestGrade] || 0)
        const bDrop = (GRADE_SCORE[b.grades[0]] || 0) - (GRADE_SCORE[b.latestGrade] || 0)
        return bDrop - aDrop
      })
      .slice(0, 10),
  }

  return {
    filmTitles,
    venueTrends,
    chainTrends,
    regionalTrends,
    summary,
  }
}

/**
 * Build a compact text summary of trend data for the AI report prompt.
 * Keeps it concise to minimise token usage.
 */
export function buildTrendSummaryForAI(trendData) {
  if (!trendData) return ''

  const { summary, chainTrends, regionalTrends, venueTrends } = trendData
  const lines = []

  lines.push(`=== CineScope Trend Analysis ===`)
  lines.push(`Films analysed (in order): ${summary.filmTitles.join(' → ')}`)
  lines.push(`Venues tracked across 2+ films: ${summary.trackedVenues}`)
  lines.push(`Improving: ${summary.improving} | Stable: ${summary.stable} | Declining: ${summary.declining}`)
  lines.push('')

  // Top movers
  if (summary.topImprovers.length > 0) {
    lines.push(`TOP IMPROVERS:`)
    for (const v of summary.topImprovers.slice(0, 5)) {
      lines.push(`  ${v.name} (${v.city}, ${v.chain}): ${v.grades.join('→')} | Avg £${v.avgRevenue.toLocaleString()}`)
    }
    lines.push('')
  }

  if (summary.topDecliners.length > 0) {
    lines.push(`TOP DECLINERS:`)
    for (const v of summary.topDecliners.slice(0, 5)) {
      lines.push(`  ${v.name} (${v.city}, ${v.chain}): ${v.grades.join('→')} | Avg £${v.avgRevenue.toLocaleString()}`)
    }
    lines.push('')
  }

  // Chain summary
  lines.push(`CHAIN PERFORMANCE:`)
  for (const c of chainTrends.slice(0, 12)) {
    const latest = c.perFilm[c.perFilm.length - 1]
    lines.push(`  ${c.chain}: Avg Grade ${c.latestAvgGrade}, Avg £${c.latestAvgRevenue.toLocaleString()}, ${latest?.venueCount || 0} venues, Trend: ${c.direction}`)
  }
  lines.push('')

  // Regional summary
  lines.push(`REGIONAL PERFORMANCE:`)
  for (const r of regionalTrends) {
    const latest = r.perFilm[r.perFilm.length - 1]
    lines.push(`  ${r.region}: Avg Grade ${r.latestAvgGrade}, Avg £${r.latestAvgRevenue.toLocaleString()}, ${latest?.venueCount || 0} venues, Trend: ${r.direction}`)
  }
  lines.push('')

  // Notable venue patterns — B/C venues that are consistent marketing targets
  const consistentBC = venueTrends.filter(v => {
    const bcCount = v.grades.filter(g => g === 'B' || g === 'C').length
    return bcCount >= Math.ceil(v.grades.length * 0.6) && v.grades.length >= 2
  })
  if (consistentBC.length > 0) {
    lines.push(`CONSISTENT B/C MARKETING TARGETS (${consistentBC.length} venues):`)
    for (const v of consistentBC.slice(0, 10)) {
      lines.push(`  ${v.name} (${v.city}, ${v.chain}, ${v.region}): ${v.grades.join('→')} | Avg £${v.avgRevenue.toLocaleString()}`)
    }
  }

  return lines.join('\n')
}
