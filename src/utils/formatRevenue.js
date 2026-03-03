/**
 * CineScope — Revenue Formatting Utility
 * Provides consistent £ formatting across the entire application.
 * 
 * Two modes (controlled via Settings):
 *   'rounded'  → £346     (round to nearest whole pound)
 *   'decimal'  → £345.67  (always show 2 decimal places)
 */

/**
 * Format a revenue number according to the user's preference.
 * 
 * @param {number} value - The revenue amount
 * @param {string} mode - 'rounded' or 'decimal'
 * @param {boolean} includeSymbol - Whether to prefix with £ (default: true)
 * @returns {string} Formatted revenue string
 */
export function formatRevenue(value, mode = 'decimal', includeSymbol = true) {
  if (value == null || isNaN(value)) return '—'

  const prefix = includeSymbol ? '£' : ''

  if (mode === 'rounded') {
    // Round to nearest whole pound
    const rounded = Math.round(value)
    return `${prefix}${rounded.toLocaleString('en-GB')}`
  }

  // Default: always show 2 decimal places
  return `${prefix}${value.toLocaleString('en-GB', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`
}

/**
 * Format revenue for CSV export (no £ symbol, raw number)
 */
export function formatRevenueCSV(value, mode = 'decimal') {
  if (value == null || isNaN(value)) return ''
  if (mode === 'rounded') return Math.round(value)
  return value.toFixed(2)
}
