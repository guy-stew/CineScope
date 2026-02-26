/**
 * CineScope — Venue Matcher
 * Matches Comscore theater names to geocoded Deluxe venues
 * Uses token-based fuzzy matching
 */

/**
 * Match an array of Comscore venues to geocoded venues
 * 
 * @param {Array} comscoreVenues - Parsed Comscore data with { theater, city, circuit, revenue... }
 * @param {Array} geocodedVenues - Geocoded venues with { name, city, chain... }
 * @returns {Array} Geocoded venues enriched with revenue data and grade-ready
 */
export function matchVenues(comscoreVenues, geocodedVenues) {
  // Build lookup index for geocoded venues
  const geoIndex = buildIndex(geocodedVenues)

  const matched = []
  const unmatched = []

  for (const cs of comscoreVenues) {
    const match = findBestMatch(cs, geocodedVenues, geoIndex)

    if (match) {
      matched.push({
        ...match.venue,
        revenue: cs.revenue,
        screens: cs.screens || match.venue.screens,
        revenuePerScreen: cs.screens > 0 ? Math.round(cs.revenue / cs.screens) : null,
        comscoreRegion: cs.region,
        comscoreBranch: cs.branch,
        rankInComplex: cs.rankInComplex,
        matchScore: match.score,
        matchedFrom: cs.theater,
        wasAggregated: cs.wasAggregated || false,
        screenEntries: cs.screenEntries || 1,
      })
    } else {
      unmatched.push(cs)
    }
  }

  return { matched, unmatched }
}


/**
 * Build search index for faster matching
 */
function buildIndex(venues) {
  const index = {
    byExactName: {},      // "Cineworld Brighton" → venue
    byNameCity: {},        // "cineworld brighton|brighton" → venue
    byTokens: {},          // each token → [venue, venue, ...]
  }

  for (const v of venues) {
    const name = v.name.toLowerCase().trim()
    const city = (v.city || '').toLowerCase().trim()

    index.byExactName[name] = v
    index.byNameCity[`${name}|${city}`] = v

    // Token index
    const tokens = tokenize(name)
    for (const token of tokens) {
      if (!index.byTokens[token]) index.byTokens[token] = []
      index.byTokens[token].push(v)
    }
  }

  return index
}


/**
 * Find the best matching geocoded venue for a Comscore entry
 */
function findBestMatch(comscoreVenue, geocodedVenues, index) {
  const csName = comscoreVenue.theater.toLowerCase().trim()
  const csCity = (comscoreVenue.city || '').toLowerCase().trim()

  // Pass 1: Exact name match
  if (index.byExactName[csName]) {
    return { venue: index.byExactName[csName], score: 100 }
  }

  // Pass 2: Name + city compound match
  if (index.byNameCity[`${csName}|${csCity}`]) {
    return { venue: index.byNameCity[`${csName}|${csCity}`], score: 98 }
  }

  // Pass 3: Token-based fuzzy matching
  const csTokens = tokenize(csName)
  let bestMatch = null
  let bestScore = 0

  // Get candidate venues that share at least one token
  const candidates = new Set()
  for (const token of csTokens) {
    const matches = index.byTokens[token] || []
    for (const v of matches) {
      candidates.add(v)
    }
  }

  for (const candidate of candidates) {
    const candTokens = tokenize(candidate.name.toLowerCase())
    const score = tokenOverlapScore(csTokens, candTokens)

    // Bonus for city match
    const cityBonus = csCity && candidate.city?.toLowerCase() === csCity ? 10 : 0
    const totalScore = score + cityBonus

    if (totalScore > bestScore) {
      bestScore = totalScore
      bestMatch = candidate
    }
  }

  // Only accept matches above threshold
  if (bestMatch && bestScore >= 50) {
    return { venue: bestMatch, score: bestScore }
  }

  return null
}


/**
 * Tokenize a venue name into searchable tokens
 * Removes common words, numbers (screen counts), and normalises
 */
function tokenize(name) {
  const stopWords = new Set(['the', 'cinema', 'cinemas', 'theatre', 'theater', 'of', 'at', 'in', 'and', '&'])
  return name
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter(t => t.length > 1 && !stopWords.has(t) && !/^\d+$/.test(t))
}


/**
 * Calculate overlap score between two token arrays (0-100)
 */
function tokenOverlapScore(tokensA, tokensB) {
  if (tokensA.length === 0 || tokensB.length === 0) return 0

  const setA = new Set(tokensA)
  const setB = new Set(tokensB)

  let matches = 0
  for (const token of setA) {
    if (setB.has(token)) matches++
  }

  // Jaccard-like similarity, scaled to 100
  const union = new Set([...setA, ...setB]).size
  return Math.round((matches / union) * 100)
}
