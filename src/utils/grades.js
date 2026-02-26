/**
 * CineScope Grade Definitions
 * A–E grading system based on revenue quartiles
 */

export const GRADES = {
  A: {
    label: 'A',
    name: 'Top Performer',
    color: '#27ae60',       // Green
    bgColor: '#e2efda',
    description: 'Top 25% — Best-performing venues',
    action: 'Maintain current approach',
  },
  B: {
    label: 'B',
    name: 'Good Performer',
    color: '#f1c40f',       // Yellow
    bgColor: '#fff2cc',
    description: '50–75% — Marketing target (push to A)',
    action: 'Target with social media campaigns',
  },
  C: {
    label: 'C',
    name: 'Below Average',
    color: '#e67e22',       // Orange
    bgColor: '#fce4d6',
    description: '25–50% — Most growth potential',
    action: 'Prime marketing target',
  },
  D: {
    label: 'D',
    name: 'Poor Performer',
    color: '#e74c3c',       // Red
    bgColor: '#f4cccc',
    description: 'Bottom 25% — Underperformers',
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

/**
 * Get grade colour for Leaflet markers
 */
export function getGradeColor(grade) {
  return GRADES[grade]?.color || GRADES.E.color
}

/**
 * Calculate grades for an array of venues with revenue data
 * Uses equal 25% quartiles on the revenue field
 * 
 * @param {Array} venues - Venues with a `revenue` property
 * @returns {Array} Same venues with `grade` property added
 */
export function calculateGrades(venues) {
  // Separate venues with and without revenue
  const withRevenue = venues.filter(v => v.revenue != null && v.revenue > 0)
  const withoutRevenue = venues.filter(v => v.revenue == null || v.revenue <= 0)

  if (withRevenue.length === 0) {
    return venues.map(v => ({ ...v, grade: 'E' }))
  }

  // Sort by revenue ascending to find quartile boundaries
  const sorted = [...withRevenue].sort((a, b) => a.revenue - b.revenue)
  const n = sorted.length

  const p25 = sorted[Math.floor(n * 0.25)]?.revenue || 0
  const p50 = sorted[Math.floor(n * 0.50)]?.revenue || 0
  const p75 = sorted[Math.floor(n * 0.75)]?.revenue || 0

  // Assign grades
  const graded = withRevenue.map(v => {
    let grade
    if (v.revenue >= p75) grade = 'A'
    else if (v.revenue >= p50) grade = 'B'
    else if (v.revenue >= p25) grade = 'C'
    else grade = 'D'
    return { ...v, grade }
  })

  // E grade for venues without revenue
  const noData = withoutRevenue.map(v => ({ ...v, grade: 'E' }))

  return [...graded, ...noData]
}
