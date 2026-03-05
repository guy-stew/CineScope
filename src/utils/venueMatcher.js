/**
 * CineScope — Venue Matcher (v2.1 cloud + comscore_name)
 *
 * Matches Comscore theater names to geocoded venues using:
 *  - comscore_name as primary match target (falls back to display name)
 *  - Chain-protection rules (cross-chain mismatches blocked)
 *  - Token-based fuzzy matching with city bonuses
 *  - Detailed match metadata for override panel
 *  - Manual override support (loaded from cloud, passed as parameter)
 *
 * v2.1 changes:
 *   - Uses venue.comscore_name as primary match target (from venues table)
 *   - Falls back to venue.name if comscore_name not set
 *   - Exact match on comscore_name scores 100 (highest priority)
 *
 * v2.0 changes:
 *   - Removed localStorage for overrides (now stored in Neon Postgres)
 *   - matchVenues() takes an `overrides` parameter instead of reading localStorage
 *   - Removed loadOverrides() and saveOverrides() exports
 *   - makeOverrideKey() still exported (used by MatchReviewPanel)
 */


// ─── Confidence Thresholds ────────────────────────────────────

export const CONFIDENCE = {
  HIGH:   { key: 'high',   label: 'High',   minScore: 80, color: '#27ae60' },
  MEDIUM: { key: 'medium', label: 'Medium', minScore: 50, color: '#f39c12' },
  LOW:    { key: 'low',    label: 'Low',    minScore: 0,  color: '#e74c3c' },
}

function getConfidence(score, method) {
  if (method === 'manual_override')  return CONFIDENCE.HIGH
  if (method === 'manual_dismiss')   return CONFIDENCE.LOW
  if (method === 'exact_comscore')   return CONFIDENCE.HIGH
  if (method === 'exact_name')       return CONFIDENCE.HIGH
  if (score >= CONFIDENCE.HIGH.minScore)   return CONFIDENCE.HIGH
  if (score >= CONFIDENCE.MEDIUM.minScore) return CONFIDENCE.MEDIUM
  return CONFIDENCE.LOW
}


// ─── Override Key Utility ─────────────────────────────────────

/**
 * Make a stable key for override storage.
 * Uses lowercase theater|city to avoid case-sensitivity issues.
 */
export function makeOverrideKey(theater, city) {
  return `${(theater || '').toLowerCase()}|${(city || '').toLowerCase()}`
}


// ─── Chain Name Normalisation ─────────────────────────────────

const CHAIN_ALIASES = {
  'odeon': ['odeon', 'odeon luxe'],
  'cineworld': ['cineworld', 'cineworld imax'],
  'vue': ['vue'],
  'curzon': ['curzon'],
  'everyman': ['everyman'],
  'picturehouse': ['picturehouse'],
  'showcase': ['showcase', 'showcase cinema de lux'],
  'empire': ['empire'],
  'omniplex': ['omniplex'],
  'imcc': ['imc', 'imcc'],
}

function normaliseChain(name) {
  if (!name) return ''
  const lower = name.toLowerCase().trim()
  for (const [canonical, aliases] of Object.entries(CHAIN_ALIASES)) {
    if (aliases.some(a => lower.startsWith(a))) return canonical
  }
  return lower
}

/**
 * Check if a Comscore circuit and a geocoded venue chain are compatible.
 * Returns true if they match or if we can't determine (independent venues).
 */
function chainsCompatible(comscoreCircuit, venueChain) {
  const csChain = normaliseChain(comscoreCircuit)
  const geoChain = normaliseChain(venueChain)

  // If either is empty/unknown, allow the match (don't block independents)
  if (!csChain || !geoChain) return true

  // Must be the same normalised chain
  return csChain === geoChain
}


// ─── Main Matching Function ───────────────────────────────────

/**
 * Match Comscore venues to geocoded venues.
 *
 * @param {Array} comscoreVenues — Parsed Comscore data [{ theater, city, circuit, revenue, ... }]
 * @param {Array} geocodedVenues — Geocoded venues [{ name, comscore_name, city, chain, ... }]
 * @param {Object} overrides — Override lookup: { "theater|city": { action, venueName?, venueCity? } }
 * @returns {{ matched, unmatched, matchDetails }}
 */
export function matchVenues(comscoreVenues, geocodedVenues, overrides = {}) {
  const matched = []
  const unmatched = []
  const matchDetails = []

  for (const cs of comscoreVenues) {
    const overrideKey = makeOverrideKey(cs.theater, cs.city)

    // Check for manual override first
    const override = overrides[overrideKey]
    if (override) {
      if (override.action === 'dismiss') {
        matchDetails.push({
          comscore: cs,
          venue: null,
          score: 0,
          confidence: getConfidence(0, 'manual_dismiss'),
          method: 'manual_dismiss',
          chainOk: true,
        })
        unmatched.push(cs)
        continue
      }

      const overrideVenue = geocodedVenues.find(v =>
        v.name === override.venueName &&
        (v.city || '').toLowerCase() === (override.venueCity || '').toLowerCase()
      )
      if (overrideVenue) {
        const enriched = {
          ...overrideVenue,
          revenue: cs.revenue,
          comscoreTheater: cs.theater,
          comscoreCity: cs.city,
          comscoreCircuit: cs.circuit,
          wasAggregated: cs.wasAggregated || false,
          screensAggregated: cs.screensAggregated || 1,
        }
        matched.push(enriched)
        matchDetails.push({
          comscore: cs,
          venue: overrideVenue,
          score: 100,
          confidence: getConfidence(100, 'manual_override'),
          method: 'manual_override',
          chainOk: true,
        })
        continue
      }
    }

    // Auto-matching: try each method in priority order
    const result = autoMatch(cs, geocodedVenues)

    if (result) {
      const enriched = {
        ...result.venue,
        revenue: cs.revenue,
        comscoreTheater: cs.theater,
        comscoreCity: cs.city,
        comscoreCircuit: cs.circuit,
        wasAggregated: cs.wasAggregated || false,
        screensAggregated: cs.screensAggregated || 1,
      }
      matched.push(enriched)
      matchDetails.push({
        comscore: cs,
        venue: result.venue,
        score: result.score,
        confidence: getConfidence(result.score, result.method),
        method: result.method,
        chainOk: result.chainOk,
      })
    } else {
      unmatched.push(cs)
      matchDetails.push({
        comscore: cs,
        venue: null,
        score: 0,
        confidence: CONFIDENCE.LOW,
        method: 'none',
        chainOk: true,
      })
    }
  }

  return { matched, unmatched, matchDetails }
}


// ─── Auto-Match Engine ────────────────────────────────────────

function autoMatch(cs, venues) {
  const csName = (cs.theater || '').trim()
  const csCity = (cs.city || '').trim().toLowerCase()
  const csCircuit = cs.circuit || ''

  let bestMatch = null
  let bestScore = 0
  let bestMethod = 'none'
  let bestChainOk = true

  for (const venue of venues) {
    const vName = (venue.name || '').trim()
    const vComscoreName = (venue.comscore_name || vName).trim() // ← NEW: use comscore_name first
    const vCity = (venue.city || '').trim().toLowerCase()
    const vChain = venue.chain || ''

    // ── Chain protection: skip cross-chain mismatches ──
    const chainOk = chainsCompatible(csCircuit, vChain)
    if (!chainOk) continue

    let score = 0
    let method = 'none'

    // Method 0 (NEW): Exact match on comscore_name — highest priority
    if (csName.toLowerCase() === vComscoreName.toLowerCase()) {
      score = 100
      method = vComscoreName !== vName ? 'exact_comscore' : 'exact_name'
    }
    // Method 1: Exact match on display name (if different from comscore_name)
    else if (csName.toLowerCase() === vName.toLowerCase()) {
      score = 100
      method = 'exact_name'
    } else {
      // Method 2: Token-based fuzzy match (try against both comscore_name and name)
      const csTokens = tokenize(csName)

      // Score against comscore_name first, then display name, take best
      const comscoreTokens = tokenize(vComscoreName)
      const nameTokens = tokenize(vName)

      const comscoreTokenScore = tokenOverlapScore(csTokens, comscoreTokens)
      const nameTokenScore = tokenOverlapScore(csTokens, nameTokens)

      // Use whichever gives the better score
      const tokenScore = Math.max(comscoreTokenScore, nameTokenScore)

      if (tokenScore > 0) {
        score = tokenScore
        method = 'fuzzy_token'

        // City bonus: +15 if cities match
        if (csCity && vCity && csCity === vCity) {
          score = Math.min(100, score + 15)
          if (method === 'fuzzy_token' && score >= 50) method = 'name_city'
        }

        // Chain+name bonus: if circuit prefix matches venue name start
        const normCircuit = normaliseChain(csCircuit)
        const normVenueStart = vName.toLowerCase().split(/\s+/)[0]
        if (normCircuit && normVenueStart && normCircuit === normaliseChain(normVenueStart)) {
          score = Math.min(100, score + 10)
          if (score >= 60) method = 'chain_prefix'
        }
      }

      // Method 3: Chain + city (last resort for chains with one venue per city)
      if (score < 50 && csCity && vCity && csCity === vCity) {
        const normCS = normaliseChain(csCircuit)
        const normV = normaliseChain(vChain)
        if (normCS && normV && normCS === normV) {
          score = Math.max(score, 55)
          method = 'chain_city'
        }
      }
    }

    if (score > bestScore) {
      bestScore = score
      bestMatch = venue
      bestMethod = method
      bestChainOk = chainOk
    }
  }

  if (bestMatch && bestScore >= 40) {
    return { venue: bestMatch, score: bestScore, method: bestMethod, chainOk: bestChainOk }
  }

  return null
}


// ─── Token Utilities ──────────────────────────────────────────

function tokenize(name) {
  const stopWords = new Set(['the', 'cinema', 'cinemas', 'theatre', 'theater', 'of', 'at', 'in', 'and', '&'])
  return name
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter(t => t.length > 1 && !stopWords.has(t) && !/^\d+$/.test(t))
}

function tokenOverlapScore(tokensA, tokensB) {
  if (tokensA.length === 0 || tokensB.length === 0) return 0
  const setA = new Set(tokensA)
  const setB = new Set(tokensB)
  let matches = 0
  for (const token of setA) {
    if (setB.has(token)) matches++
  }
  const union = new Set([...setA, ...setB]).size
  return Math.round((matches / union) * 100)
}
