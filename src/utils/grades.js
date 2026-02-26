/**
 * CineScope Grade Definitions
 * A–E grading system with configurable boundaries
 */

export const GRADES = {
  A: {
    label: 'A',
    name: 'Top Performer',
    color: '#27ae60',       // Green
    bgColor: '#e2efda',
    description: 'Top performers — best venues',
    action: 'Maintain current approach',
  },
  B: {
    label: 'B',
    name: 'Good Performer',
    color: '#f1c40f',       // Yellow
    bgColor: '#fff2cc',
    description: 'Above average — marketing target (push to A)',
    action: 'Target with social media campaigns',
  },
  C: {
    label: 'C',
    name: 'Below Average',
    color: '#e67e22',       // Orange
    bgColor: '#fce4d6',
    description: 'Below average — most growth potential',
    action: 'Prime marketing target',
  },
  D: {
    label: 'D',
    name: 'Poor Performer',
    color: '#e74c3c',       // Red
    bgColor: '#f4cccc',
    description: 'Underperformers',
    action: 'Deprioritise — do not invest marketing spend',
  },
  E: {
    label: 'E',
    name: 'Did Not Screen',
    color: '#95a5a6',       // Grey
    bgColor: '#d9d9d9',
    description: 'No screening data for this film',
    action: 'Hidden when film selected',
  },
}

export const GRADE_ORDER = ['A', 'B', 'C', 'D', 'E']

export function getGradeColor(grade) {
  return GRADES[grade]?.color || GRADES.E.color
}

/** Default grade settings — equal 25% quartiles */
export const DEFAULT_GRADE_SETTINGS = {
  mode: 'quartiles',  // 'quartiles' | 'manual_percentile' | 'manual_revenue'
  percentiles: { A: 75, B: 50, C: 25 },
  revenueThresholds: { A: 5000, B: 3000, C: 1000 },
}

/**
 * Calculate grades for venues with revenue data.
 * Supports: percentile modes (quartiles/manual) and fixed revenue thresholds.
 */
export function calculateGrades(venues, settings = DEFAULT_GRADE_SETTINGS) {
  const withRevenue = venues.filter(v => v.revenue != null && v.revenue > 0)
  const withoutRevenue = venues.filter(v => v.revenue == null || v.revenue <= 0)

  if (withRevenue.length === 0) {
    return venues.map(v => ({ ...v, grade: 'E' }))
  }

  let graded

  if (settings.mode === 'manual_revenue') {
    graded = withRevenue.map(v => ({
      ...v,
      grade: assignGradeByRevenue(v.revenue, settings.revenueThresholds),
    }))
  } else {
    // Percentile-based (both 'quartiles' and 'manual_percentile')
    const sorted = [...withRevenue].sort((a, b) => a.revenue - b.revenue)
    const n = sorted.length

    const pA = settings.percentiles?.A ?? 75
    const pB = settings.percentiles?.B ?? 50
    const pC = settings.percentiles?.C ?? 25

    const thresholdA = sorted[Math.floor(n * (pA / 100))]?.revenue || 0
    const thresholdB = sorted[Math.floor(n * (pB / 100))]?.revenue || 0
    const thresholdC = sorted[Math.floor(n * (pC / 100))]?.revenue || 0

    graded = withRevenue.map(v => {
      let grade
      if (v.revenue >= thresholdA) grade = 'A'
      else if (v.revenue >= thresholdB) grade = 'B'
      else if (v.revenue >= thresholdC) grade = 'C'
      else grade = 'D'
      return { ...v, grade }
    })
  }

  const noData = withoutRevenue.map(v => ({ ...v, grade: 'E' }))
  return [...graded, ...noData]
}

function assignGradeByRevenue(revenue, thresholds) {
  if (revenue >= thresholds.A) return 'A'
  if (revenue >= thresholds.B) return 'B'
  if (revenue >= thresholds.C) return 'C'
  return 'D'
}

/**
 * Suggest optimal grade boundaries using natural gaps in the data.
 * Returns percentile + revenue thresholds aligned with data clusters.
 */
export function suggestBoundaries(revenues) {
  if (revenues.length < 4) {
    return {
      percentiles: { A: 75, B: 50, C: 25 },
      revenueValues: { A: 0, B: 0, C: 0 },
      description: 'Too few venues for clustering — using equal quartiles',
    }
  }

  const sorted = [...revenues].sort((a, b) => a - b)
  const n = sorted.length
  const range = sorted[n - 1] - sorted[0]

  if (range === 0) {
    return {
      percentiles: { A: 75, B: 50, C: 25 },
      revenueValues: { A: sorted[0], B: sorted[0], C: sorted[0] },
      description: 'All venues have equal revenue — quartiles are identical',
    }
  }

  // Find biggest gaps between consecutive revenue values
  const gaps = []
  for (let i = 1; i < n; i++) {
    gaps.push({
      index: i,
      gap: (sorted[i] - sorted[i - 1]) / range,
      percentile: Math.round((i / n) * 100),
      revenueAbove: sorted[i],
    })
  }

  gaps.sort((a, b) => b.gap - a.gap)
  const topGaps = gaps.slice(0, 3).sort((a, b) => a.percentile - b.percentile)

  if (topGaps.length < 3 ||
      topGaps[0].percentile >= topGaps[1].percentile ||
      topGaps[1].percentile >= topGaps[2].percentile) {
    return {
      percentiles: { A: 75, B: 50, C: 25 },
      revenueValues: {
        A: sorted[Math.floor(n * 0.75)] || 0,
        B: sorted[Math.floor(n * 0.50)] || 0,
        C: sorted[Math.floor(n * 0.25)] || 0,
      },
      description: 'Revenue distribution is fairly even — equal quartiles recommended',
    }
  }

  return {
    percentiles: {
      C: topGaps[0].percentile,
      B: topGaps[1].percentile,
      A: topGaps[2].percentile,
    },
    revenueValues: {
      C: topGaps[0].revenueAbove,
      B: topGaps[1].revenueAbove,
      A: topGaps[2].revenueAbove,
    },
    description: `Natural clusters at ~£${Math.round(topGaps[0].revenueAbove).toLocaleString()}, £${Math.round(topGaps[1].revenueAbove).toLocaleString()}, and £${Math.round(topGaps[2].revenueAbove).toLocaleString()}`,
  }
}

/**
 * Build histogram buckets for revenue distribution visualisation.
 */
export function buildHistogram(revenues, bucketCount = 20) {
  if (revenues.length === 0) return []

  const min = Math.min(...revenues)
  const max = Math.max(...revenues)
  const range = max - min

  if (range === 0) {
    return [{ min, max, count: revenues.length, midpoint: min }]
  }

  const bucketWidth = range / bucketCount
  const buckets = []

  for (let i = 0; i < bucketCount; i++) {
    const bucketMin = min + i * bucketWidth
    const bucketMax = min + (i + 1) * bucketWidth
    buckets.push({
      min: Math.round(bucketMin),
      max: Math.round(bucketMax),
      midpoint: Math.round(bucketMin + bucketWidth / 2),
      count: 0,
    })
  }

  for (const rev of revenues) {
    let idx = Math.floor((rev - min) / bucketWidth)
    if (idx >= bucketCount) idx = bucketCount - 1
    buckets[idx].count++
  }

  return buckets
}
