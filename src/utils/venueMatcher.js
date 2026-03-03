/**
 * CineScope — Venue Matcher v2
 * Matches Comscore theater names to geocoded Deluxe venues.
 * 
 * Key improvements over v1:
 *  - Chain-name protection (prevents cross-chain mismatches)
 *  - Confidence tiers (high/medium/low) for review UI
 *  - Detailed match metadata for override panel
 *  - Manual override support (saved to localStorage)
 */


// ─── Chain Mapping ─────────────────────────────────────────
// Maps Comscore "Circuit" values to our venue chain names.
// This is the core defence against cross-chain mismatches.

const CIRCUIT_TO_CHAIN = {
  'cineworld cinemas':              'Cineworld',
  'odeon':                          'Odeon',
  'vue entertainment':              'Vue',
  'everyman media group':           'Everyman',
  'curzon cinemas':                 'Curzon',
  'picturehouse':                   'Picturehouse',
  'omniplex gb':                    'Omniplex',
  'light cinemas uk':               ['Light', 'Light Cinema'],
  'national amusement corporation': 'Showcase',
  'gate cinemas ireland':           'IMC',
  'b f i':                          'Independent',
  'indp: uk/ireland':               'Independent',
  'film buyer':                     'Independent',
  'really local group':             ['Reel', 'Independent'],
  'g1':                             'Independent',
}

// Build reverse lookup: venue chain → set of Comscore circuits
function buildChainLookup() {
  const lookup = {}
  for (const [circuit, chains] of Object.entries(CIRCUIT_TO_CHAIN)) {
    const chainList = Array.isArray(chains) ? chains : [chains]
    for (const chain of chainList) {
      const key = chain.toLowerCase().trim()
      if (!lookup[key]) lookup[key] = new Set()
      lookup[key].add(circuit)
    }
  }
  return lookup
}

const CHAIN_LOOKUP = buildChainLookup()

/**
 * Check if a Comscore circuit is compatible with a venue's chain.
 * Returns true if they're from the same chain family OR if either is Independent.
 */
function chainsCompatible(comscoreCircuit, venueChain) {
  if (!comscoreCircuit || !venueChain) return true // Can't verify — allow
  
  const circuit = comscoreCircuit.toLowerCase().trim()
  const chain = venueChain.toLowerCase().trim()
  
  // Independent venues can match any circuit
  if (chain === 'independent') return true
  // Independent circuits can match any venue
  if (circuit === 'indp: uk/ireland' || circuit === 'film buyer' || circuit === 'b f i' || circuit === 'g1') return true
  
  // Check if this circuit maps to this chain
  const mapped = CIRCUIT_TO_CHAIN[circuit]
  if (!mapped) return true // Unknown circuit — allow (conservative)
  
  const mappedList = Array.isArray(mapped) ? mapped : [mapped]
  return mappedList.some(m => m.toLowerCase() === chain)
}


// ─── Confidence Tiers ──────────────────────────────────────

export const CONFIDENCE = {
  HIGH:   { key: 'high',   label: 'High Confidence',   color: '#28a745', minScore: 90 },
  MEDIUM: { key: 'medium', label: 'Needs Review',      color: '#ffc107', minScore: 50 },
  LOW:    { key: 'low',    label: 'Unmatched',          color: '#dc3545', minScore: 0 },
}

function getConfidenceTier(score) {
  if (score >= 90) return CONFIDENCE.HIGH
  if (score >= 50) return CONFIDENCE.MEDIUM
  return CONFIDENCE.LOW
}


// ─── Manual Override Storage ───────────────────────────────

const OVERRIDES_KEY = 'cinescope-match-overrides'

export function loadOverrides() {
  try {
    const saved = localStorage.getItem(OVERRIDES_KEY)
    return saved ? JSON.parse(saved) : {}
  } catch {
    return {}
  }
}

export function saveOverrides(overrides) {
  try {
    localStorage.setItem(OVERRIDES_KEY, JSON.stringify(overrides))
  } catch { /* localStorage might not be available */ }
}

/**
 * Make a stable key for override storage.
 * Uses the Comscore theater + city to identify the source row.
 */
export function makeOverrideKey(theater, city) {
  return `${theater}|${city}`.toLowerCase().trim()
}


// ─── Main Matching Function ────────────────────────────────

/**
 * Match Comscore venues to geocoded venues with confidence tracking.
 * 
 * @param {Array} comscoreVenues - Parsed Comscore data
 * @param {Array} geocodedVenues - Our venue database
 * @returns {{ matched, unmatched, matchDetails }}
 *   matchDetails: Array of { comscore, venue, score, confidence, method, chainOk }
 */
export function matchVenues(comscoreVenues, geocodedVenues) {
  const geoIndex = buildIndex(geocodedVenues)
  const overrides = loadOverrides()

  const matched = []
  const unmatched = []
  const matchDetails = []

  for (const cs of comscoreVenues) {
    const overrideKey = makeOverrideKey(cs.theater, cs.city)
    
    // Check for manual override first
    const override = overrides[overrideKey]
    if (override) {
      if (override.action === 'dismiss') {
        // User explicitly said "ignore this one"
        matchDetails.push({
          comscore: cs,
          venue: null,
          score: 0,
          confidence: CONFIDENCE.LOW,
          method: 'manual_dismiss',
          chainOk: true,
        })
        continue
      }

      const overrideVenue = geocodedVenues.find(v => 
        v.name === override.venueName && 
        (v.city || '').toLowerCase() === (override.venueCity || '').toLowerCase()
      )
      
      if (overrideVenue) {
        const enriched = enrichMatch(overrideVenue, cs, 100)
        matched.push(enriched)
        matchDetails.push({
          comscore: cs,
          venue: overrideVenue,
          score: 100,
          confidence: CONFIDENCE.HIGH,
          method: 'manual_override',
          chainOk: true,
        })
        continue
      }
    }
    
    // Auto-match with chain protection
    const result = findBestMatch(cs, geocodedVenues, geoIndex)

    if (result) {
      const enriched = enrichMatch(result.venue, cs, result.score)
      matched.push(enriched)
      matchDetails.push({
        comscore: cs,
        venue: result.venue,
        score: result.score,
        confidence: getConfidenceTier(result.score),
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


/**
 * Enrich a matched venue with Comscore revenue data
 */
function enrichMatch(venue, cs, score) {
  return {
    ...venue,
    revenue: cs.revenue,
    screens: cs.screens || venue.screens,
    comscoreRegion: cs.region,
    comscoreBranch: cs.branch,
    rankInComplex: cs.rankInComplex,
    matchScore: score,
    matchedFrom: cs.theater,
    wasAggregated: cs.wasAggregated || false,
    screenEntries: cs.screenEntries || 1,
  }
}


// ─── Index Building ────────────────────────────────────────

function buildIndex(venues) {
  const index = {
    byExactName: {},
    byNameCity: {},
    byTokens: {},
  }

  for (const v of venues) {
    const name = v.name.toLowerCase().trim()
    const city = (v.city || '').toLowerCase().trim()

    index.byExactName[name] = v
    index.byNameCity[`${name}|${city}`] = v

    const tokens = tokenize(name)
    for (const token of tokens) {
      if (!index.byTokens[token]) index.byTokens[token] = []
      index.byTokens[token].push(v)
    }
  }

  return index
}


// ─── Matching Logic ────────────────────────────────────────

function findBestMatch(comscoreVenue, geocodedVenues, index) {
  const csName = comscoreVenue.theater.toLowerCase().trim()
  const csCity = (comscoreVenue.city || '').toLowerCase().trim()
  const csCircuit = (comscoreVenue.circuit || '').toLowerCase().trim()

  // Pass 1: Exact name match
  const exactMatch = index.byExactName[csName]
  if (exactMatch) {
    const chainOk = chainsCompatible(csCircuit, exactMatch.chain)
    if (chainOk) {
      return { venue: exactMatch, score: 100, method: 'exact_name', chainOk }
    }
    // Chain mismatch on exact name — demote, fall through
  }

  // Pass 2: Name + city compound match
  const compoundMatch = index.byNameCity[`${csName}|${csCity}`]
  if (compoundMatch) {
    const chainOk = chainsCompatible(csCircuit, compoundMatch.chain)
    if (chainOk) {
      return { venue: compoundMatch, score: 98, method: 'name_city', chainOk }
    }
  }

  // Pass 3: Token-based fuzzy matching with chain filtering
  const csTokens = tokenize(csName)
  let bestMatch = null
  let bestScore = 0
  let bestChainOk = true
  let bestMethod = 'fuzzy_token'

  const candidates = new Set()
  for (const token of csTokens) {
    const matches = index.byTokens[token] || []
    for (const v of matches) candidates.add(v)
  }

  for (const candidate of candidates) {
    const chainOk = chainsCompatible(csCircuit, candidate.chain)
    
    // Cross-chain matches need much higher token overlap to qualify
    const chainPenalty = chainOk ? 0 : 30

    const candTokens = tokenize(candidate.name.toLowerCase())
    let score = tokenOverlapScore(csTokens, candTokens)

    // Bonus for city match
    const cityBonus = csCity && candidate.city?.toLowerCase() === csCity ? 10 : 0
    
    // Bonus for partial city match (e.g., "Edinburgh" in venue name)
    const partialCityBonus = csCity && candidate.name?.toLowerCase().includes(csCity) ? 5 : 0

    const totalScore = score + cityBonus + partialCityBonus - chainPenalty

    if (totalScore > bestScore) {
      bestScore = totalScore
      bestMatch = candidate
      bestChainOk = chainOk
    }
  }

  // Pass 4: Chain name prefix construction
  // Comscore might say "Brighton" with circuit "Cineworld Cinemas"
  // We try "Cineworld Brighton" in our database
  if (bestScore < 70 && csCircuit) {
    const mapped = CIRCUIT_TO_CHAIN[csCircuit]
    if (mapped) {
      const chainNames = Array.isArray(mapped) ? mapped : [mapped]
      for (const chainName of chainNames) {
        // Try chain + theater name
        const try1 = `${chainName} ${comscoreVenue.theater}`.toLowerCase().trim()
        if (index.byExactName[try1]) {
          return { venue: index.byExactName[try1], score: 85, method: 'chain_prefix', chainOk: true }
        }
        
        // Try chain + city
        if (csCity) {
          const try2 = `${chainName} ${csCity}`.toLowerCase().trim()
          if (index.byExactName[try2]) {
            const score = 80
            if (score > bestScore) {
              bestScore = score
              bestMatch = index.byExactName[try2]
              bestChainOk = true
              bestMethod = 'chain_city'
            }
          }
        }
      }
    }
  }

  if (bestMatch && bestScore >= 50) {
    return { venue: bestMatch, score: bestScore, method: bestMethod, chainOk: bestChainOk }
  }

  return null
}


// ─── Token Utilities ───────────────────────────────────────

function tokenize(name) {
  const stopWords = new Set([
    'the', 'cinema', 'cinemas', 'theatre', 'theater', 'theatres',
    'of', 'at', 'in', 'and', '&', 'uk', 'gb',
  ])
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
