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

// Cache auto-match results: keyed by Comscore venue identity, invalidated when venue list changes.
// Override changes don't affect auto-match results, so we skip re-running the expensive
// fuzzy matcher when only overrides have changed.
let _autoMatchCache = new Map()
let _autoMatchVenueListId = null // fingerprint of the venue list used to build the cache

function getVenueListId(venues) {
  // Simple fingerprint: count + first/last name. If venues change, this changes.
  if (!venues || venues.length === 0) return 'empty'
  return `${venues.length}|${venues[0]?.name}|${venues[venues.length - 1]?.name}`
}

/**
 * Build pre-computed indexes for fast venue matching.
 * Called once per venue list, reused across all Comscore entries.
 */
function buildVenueIndex(venues) {
  const byExactComscoreName = new Map() // lowercase comscore_name → venue
  const byExactName = new Map()          // lowercase name → venue
  const byCityChain = new Map()          // "city|normChain" → [venues]
  const preTokenized = new Map()         // venue → { nameTokens, comscoreTokens, normChain, lowerCity }

  for (const venue of venues) {
    const vName = (venue.name || '').trim()
    const vComscoreName = (venue.comscore_name || vName).trim()
    const vCity = (venue.city || '').trim().toLowerCase()
    const vChain = venue.chain || ''
    const normChain = normaliseChain(vChain)

    // Exact-match lookup by comscore_name (first writer wins — duplicates rare)
    const lowerCsName = vComscoreName.toLowerCase()
    if (!byExactComscoreName.has(lowerCsName)) {
      byExactComscoreName.set(lowerCsName, venue)
    }

    // Exact-match lookup by display name
    const lowerName = vName.toLowerCase()
    if (!byExactName.has(lowerName)) {
      byExactName.set(lowerName, venue)
    }

    // City+chain bucket for chain_city fallback
    if (vCity && normChain) {
      const ccKey = `${vCity}|${normChain}`
      if (!byCityChain.has(ccKey)) byCityChain.set(ccKey, [])
      byCityChain.get(ccKey).push(venue)
    }

    // Pre-tokenize names (avoids re-tokenizing in the hot loop)
    preTokenized.set(venue, {
      nameTokens: tokenize(vName),
      comscoreTokens: lowerCsName !== lowerName ? tokenize(vComscoreName) : null, // null = same as name
      normChain,
      lowerCity: vCity,
      lowerName,
      lowerComscoreName: lowerCsName,
      normVenueStart: vName.toLowerCase().split(/\s+/)[0] || '',
    })
  }

  return { byExactComscoreName, byExactName, byCityChain, preTokenized }
}


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

  // Build or reuse venue index
  const venueListId = getVenueListId(geocodedVenues)
  let index
  if (venueListId !== _autoMatchVenueListId) {
    // Venue list changed — rebuild everything
    index = buildVenueIndex(geocodedVenues)
    _autoMatchCache = new Map()
    _autoMatchVenueListId = venueListId
    // Store index on the cache object for reuse
    _autoMatchCache._index = index
  } else {
    index = _autoMatchCache._index || buildVenueIndex(geocodedVenues)
  }

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

    // Auto-matching: use cached result if available
    const cacheKey = `${cs.theater}|${cs.city}|${cs.circuit}`
    let result = _autoMatchCache.get(cacheKey)
    if (result === undefined) {
      result = autoMatch(cs, geocodedVenues, index)
      _autoMatchCache.set(cacheKey, result)
    }

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


// ─── Auto-Match Engine (indexed) ────────────────────────────────

function autoMatch(cs, venues, index) {
  const csName = (cs.theater || '').trim()
  const csNameLower = csName.toLowerCase()
  const csCity = (cs.city || '').trim().toLowerCase()
  const csCircuit = cs.circuit || ''
  const normCSCircuit = normaliseChain(csCircuit)

  // ── Fast path: exact match on comscore_name (O(1) lookup) ──
  const exactCsVenue = index.byExactComscoreName.get(csNameLower)
  if (exactCsVenue && chainsCompatible(csCircuit, exactCsVenue.chain)) {
    const vName = (exactCsVenue.name || '').trim()
    const vComscoreName = (exactCsVenue.comscore_name || vName).trim()
    return {
      venue: exactCsVenue,
      score: 100,
      method: vComscoreName.toLowerCase() !== vName.toLowerCase() ? 'exact_comscore' : 'exact_name',
      chainOk: true,
    }
  }

  // ── Fast path: exact match on display name (O(1) lookup) ──
  const exactNameVenue = index.byExactName.get(csNameLower)
  if (exactNameVenue && exactNameVenue !== exactCsVenue && chainsCompatible(csCircuit, exactNameVenue.chain)) {
    return {
      venue: exactNameVenue,
      score: 100,
      method: 'exact_name',
      chainOk: true,
    }
  }

  // ── Slow path: fuzzy matching (only for non-exact matches) ──
  const csTokens = tokenize(csName)
  let bestMatch = null
  let bestScore = 0
  let bestMethod = 'none'
  let bestChainOk = true

  for (const venue of venues) {
    const vData = index.preTokenized.get(venue)
    if (!vData) continue

    // Chain protection: skip cross-chain mismatches
    if (normCSCircuit && vData.normChain && normCSCircuit !== vData.normChain) continue

    let score = 0
    let method = 'none'

    // Token-based fuzzy match (using pre-tokenized names)
    const comscoreTokenScore = vData.comscoreTokens
      ? tokenOverlapScore(csTokens, vData.comscoreTokens)
      : 0
    const nameTokenScore = tokenOverlapScore(csTokens, vData.nameTokens)
    const tokenScore = Math.max(comscoreTokenScore, nameTokenScore)

    if (tokenScore > 0) {
      score = tokenScore
      method = 'fuzzy_token'

      // City bonus: +15 if cities match
      if (csCity && vData.lowerCity && csCity === vData.lowerCity) {
        score = Math.min(100, score + 15)
        if (method === 'fuzzy_token' && score >= 50) method = 'name_city'
      }

      // Chain+name bonus
      if (normCSCircuit && vData.normVenueStart && normCSCircuit === normaliseChain(vData.normVenueStart)) {
        score = Math.min(100, score + 10)
        if (score >= 60) method = 'chain_prefix'
      }
    }

    // Chain + city fallback
    if (score < 50 && csCity && vData.lowerCity && csCity === vData.lowerCity) {
      if (normCSCircuit && vData.normChain && normCSCircuit === vData.normChain) {
        score = Math.max(score, 55)
        method = 'chain_city'
      }
    }

    if (score > bestScore) {
      bestScore = score
      bestMatch = venue
      bestMethod = method
      bestChainOk = true

      // Early exit: can't beat 100
      if (bestScore >= 100) break
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
