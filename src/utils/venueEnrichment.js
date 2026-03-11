/**
 * CineScope — Venue Enrichment Data (v3.6)
 *
 * Lazy-loads council_politics.json and venue_demographics.json from
 * public/data/ on first access. Builds fast lookup maps for the
 * VenuePopup to query by venue name + coordinates.
 *
 * Both files are static assets (~240 KB + ~560 KB), fetched once and
 * cached in module scope. No Neon/API call — purely client-side.
 *
 * Usage:
 *   import { getVenueEnrichment } from '../utils/venueEnrichment'
 *   const { council, demographics } = await getVenueEnrichment('Odeon Bath', 51.38, -2.36)
 */

// ── Module-level caches ──────────────────────────────────────────

let councilData = null       // { metadata, byName: Map }
let demographicsData = null  // { metadata, byKey: Map, byName: Map }
let loadingPromise = null    // Prevents duplicate fetches

// ── Load & index ─────────────────────────────────────────────────

async function loadAll() {
  if (councilData && demographicsData) return

  const [councilResp, demoResp] = await Promise.all([
    fetch('/data/council_politics.json'),
    fetch('/data/venue_demographics.json'),
  ])

  // ── Council politics ──
  if (councilResp.ok) {
    const raw = await councilResp.json()
    const byName = new Map()

    if (raw.venues && Array.isArray(raw.venues)) {
      for (const v of raw.venues) {
        const key = v.venue_name?.toLowerCase()
        if (key) byName.set(key, v)
      }
    }

    councilData = { metadata: raw.metadata || {}, byName }
  } else {
    console.warn('Failed to load council_politics.json:', councilResp.status)
    councilData = { metadata: {}, byName: new Map() }
  }

  // ── Demographics ──
  if (demoResp.ok) {
    const raw = await demoResp.json()
    const byKey = new Map()  // "name|lat,lng" → profile
    const byName = new Map() // lowercase name → profile (fallback)

    if (raw.venues && typeof raw.venues === 'object') {
      for (const [compositeKey, profile] of Object.entries(raw.venues)) {
        byKey.set(compositeKey, profile)

        // Also index by lowercase name for fallback matching
        const namePart = compositeKey.split('|')[0]?.toLowerCase()
        if (namePart && !byName.has(namePart)) {
          byName.set(namePart, profile)
        }
      }
    }

    demographicsData = { metadata: raw.metadata || {}, byKey, byName }
  } else {
    console.warn('Failed to load venue_demographics.json:', demoResp.status)
    demographicsData = { metadata: {}, byKey: new Map(), byName: new Map() }
  }
}

/**
 * Ensures data is loaded exactly once, even if called concurrently.
 */
function ensureLoaded() {
  if (councilData && demographicsData) return Promise.resolve()
  if (!loadingPromise) {
    loadingPromise = loadAll().finally(() => { loadingPromise = null })
  }
  return loadingPromise
}


// ── Public API ───────────────────────────────────────────────────

/**
 * Look up council + demographics for a venue.
 *
 * @param {string} venueName  — e.g. "Odeon Bath"
 * @param {number} lat        — venue latitude
 * @param {number} lng        — venue longitude
 * @returns {Promise<{ council: object|null, demographics: object|null }>}
 */
export async function getVenueEnrichment(venueName, lat, lng) {
  await ensureLoaded()

  const nameLower = (venueName || '').toLowerCase()

  // Council: simple name lookup
  const council = councilData.byName.get(nameLower) || null

  // Demographics: try composite key first (exact match), then name fallback
  let demographics = null
  if (lat != null && lng != null) {
    const compositeKey = `${venueName}|${lat},${lng}`
    demographics = demographicsData.byKey.get(compositeKey) || null
  }
  if (!demographics) {
    demographics = demographicsData.byName.get(nameLower) || null
  }

  return { council, demographics }
}


/**
 * Get the party colours map from council metadata.
 * Useful if you need to look up a colour by party code.
 */
export async function getPartyColours() {
  await ensureLoaded()
  return councilData.metadata?.party_colours || {}
}


/**
 * Pre-warm the cache (call from AppContext on mount if desired).
 * Not required — getVenueEnrichment() will lazy-load automatically.
 */
export function preloadEnrichmentData() {
  return ensureLoaded()
}


// ── AI Report Summary Builders ──────────────────────────────────

/**
 * Build a compact text summary of demographic + political data for
 * a set of venues. Designed to be injected into AI report prompts
 * via the {{demographic_summary}} and {{political_summary}} placeholders.
 *
 * @param {Array} venues — Array of venue objects (need name, lat, lng, grade, revenue, city, chain)
 * @returns {Promise<{ demographicSummary: string, politicalSummary: string }>}
 */
export async function buildEnrichmentSummariesForAI(venues) {
  await ensureLoaded()

  if (!venues || venues.length === 0) {
    return { demographicSummary: '', politicalSummary: '' }
  }

  const demographicSummary = _buildDemographicSummary(venues)
  const politicalSummary = _buildPoliticalSummary(venues)

  return { demographicSummary, politicalSummary }
}


// ── Internal: Demographic Summary ────────────────────────────────

function _lookupDemographics(venueName, lat, lng) {
  const nameLower = (venueName || '').toLowerCase()
  if (lat != null && lng != null) {
    const compositeKey = `${venueName}|${lat},${lng}`
    const exact = demographicsData.byKey.get(compositeKey)
    if (exact) return exact
  }
  return demographicsData.byName.get(nameLower) || null
}

function _lookupCouncil(venueName) {
  return councilData.byName.get((venueName || '').toLowerCase()) || null
}

function _buildDemographicSummary(venues) {
  // Collect demographic profiles for all venues that have them
  const profiles = []
  let missingCount = 0

  for (const v of venues) {
    const demo = _lookupDemographics(v.name, v.lat, v.lng)
    if (demo) {
      profiles.push({ venue: v, demo })
    } else {
      missingCount++
    }
  }

  if (profiles.length === 0) {
    return 'Demographic data not yet available for these venues.'
  }

  const lines = ['=== CATCHMENT DEMOGRAPHICS (15-mile radius) ===', '']

  // Aggregate: population-weighted average across all venue catchments
  let totalPop = 0
  const agg = {
    age: { under_25: 0, age_25_44: 0, age_45_64: 0, age_65_plus: 0 },
    ethnicity: { white: 0, asian: 0, black: 0, mixed: 0, other: 0 },
    religion: { christian: 0, muslim: 0, hindu: 0, no_religion: 0, other: 0 },
    tenure: { owned: 0, rented: 0 },
  }

  let ethCount = 0, relCount = 0 // Track how many have ethnicity/religion

  for (const { demo } of profiles) {
    const pop = demo.catchment_population || 1
    totalPop += pop

    // Age (always present for E&W + Scotland)
    if (demo.age) {
      for (const k of Object.keys(agg.age)) {
        agg.age[k] += (demo.age[k] || 0) * pop
      }
    }

    // Ethnicity (missing for Ireland)
    if (demo.ethnicity) {
      ethCount++
      for (const k of Object.keys(agg.ethnicity)) {
        agg.ethnicity[k] += (demo.ethnicity[k] || 0) * pop
      }
    }

    // Religion (missing for Ireland)
    if (demo.religion) {
      relCount++
      for (const k of Object.keys(agg.religion)) {
        agg.religion[k] += (demo.religion[k] || 0) * pop
      }
    }

    // Tenure
    if (demo.tenure) {
      for (const k of Object.keys(agg.tenure)) {
        agg.tenure[k] += (demo.tenure[k] || 0) * pop
      }
    }
  }

  // Normalise to percentages
  if (totalPop > 0) {
    for (const dim of Object.keys(agg)) {
      for (const k of Object.keys(agg[dim])) {
        agg[dim][k] = Math.round((agg[dim][k] / totalPop) * 10) / 10
      }
    }
  }

  lines.push(`Coverage: ${profiles.length} of ${venues.length} venues have demographic profiles (15-mile catchment radius).`)
  if (missingCount > 0) {
    lines.push(`Note: ${missingCount} venues (mainly Ireland/NI) do not yet have demographic data.`)
  }
  lines.push('')

  lines.push(`AGGREGATE AUDIENCE PROFILE (population-weighted average across all venue catchments):`)
  lines.push(`  Age: Under 25: ${agg.age.under_25}%, 25-44: ${agg.age.age_25_44}%, 45-64: ${agg.age.age_45_64}%, 65+: ${agg.age.age_65_plus}%`)
  if (ethCount > 0) {
    lines.push(`  Ethnicity: White: ${agg.ethnicity.white}%, Asian: ${agg.ethnicity.asian}%, Black: ${agg.ethnicity.black}%, Mixed: ${agg.ethnicity.mixed}%, Other: ${agg.ethnicity.other}%`)
  }
  if (relCount > 0) {
    lines.push(`  Religion: Christian: ${agg.religion.christian}%, Muslim: ${agg.religion.muslim}%, Hindu: ${agg.religion.hindu}%, No religion: ${agg.religion.no_religion}%, Other: ${agg.religion.other}%`)
  }
  lines.push(`  Housing: Owned: ${agg.tenure.owned}%, Rented: ${agg.tenure.rented}%`)
  lines.push('')

  // Per-grade demographic breakdown (the really useful bit for marketing)
  const byGrade = {}
  for (const { venue, demo } of profiles) {
    const g = venue.grade || 'E'
    if (!byGrade[g]) byGrade[g] = []
    byGrade[g].push({ venue, demo })
  }

  const gradeLabels = { A: 'Top performers', B: 'Above average', C: 'Below average', D: 'Poor performers' }

  for (const grade of ['A', 'B', 'C', 'D']) {
    const gradeVenues = byGrade[grade]
    if (!gradeVenues || gradeVenues.length === 0) continue

    let gPop = 0
    const gAge = { under_25: 0, age_25_44: 0, age_45_64: 0, age_65_plus: 0 }

    for (const { demo } of gradeVenues) {
      const p = demo.catchment_population || 1
      gPop += p
      if (demo.age) {
        for (const k of Object.keys(gAge)) {
          gAge[k] += (demo.age[k] || 0) * p
        }
      }
    }

    if (gPop > 0) {
      for (const k of Object.keys(gAge)) gAge[k] = Math.round((gAge[k] / gPop) * 10) / 10
    }

    lines.push(`Grade ${grade} venues (${gradeLabels[grade]}, ${gradeVenues.length} venues):`)
    lines.push(`  Age profile: <25: ${gAge.under_25}%, 25-44: ${gAge.age_25_44}%, 45-64: ${gAge.age_45_64}%, 65+: ${gAge.age_65_plus}%`)
    lines.push(`  Total catchment population: ${(gPop / 1000).toFixed(0)}k`)
    lines.push('')
  }

  // Top 10 venues with most distinctive demographics (highest under-25 or highest 65+)
  const withAge = profiles.filter(p => p.demo.age)
  if (withAge.length > 0) {
    const youngSkewed = [...withAge].sort((a, b) => b.demo.age.under_25 - a.demo.age.under_25).slice(0, 5)
    const olderSkewed = [...withAge].sort((a, b) => b.demo.age.age_65_plus - a.demo.age.age_65_plus).slice(0, 5)

    lines.push(`VENUES WITH YOUNGEST CATCHMENTS (highest under-25 %):`)
    for (const { venue, demo } of youngSkewed) {
      lines.push(`  ${venue.name} (${venue.city}): ${demo.age.under_25}% under 25, Grade ${venue.grade || '-'}, ${venue.revenue ? '£' + venue.revenue.toLocaleString() : 'No revenue data'}`)
    }
    lines.push('')

    lines.push(`VENUES WITH OLDEST CATCHMENTS (highest 65+ %):`)
    for (const { venue, demo } of olderSkewed) {
      lines.push(`  ${venue.name} (${venue.city}): ${demo.age.age_65_plus}% aged 65+, Grade ${venue.grade || '-'}, ${venue.revenue ? '£' + venue.revenue.toLocaleString() : 'No revenue data'}`)
    }
    lines.push('')
  }

  return lines.join('\n')
}


// ── Internal: Political Summary ──────────────────────────────────

function _buildPoliticalSummary(venues) {
  const matched = []
  let missingCount = 0

  for (const v of venues) {
    const council = _lookupCouncil(v.name)
    if (council) {
      matched.push({ venue: v, council })
    } else {
      missingCount++
    }
  }

  if (matched.length === 0) {
    return 'Council political data not yet available for these venues.'
  }

  const lines = ['=== COUNCIL POLITICAL CONTEXT ===', '']

  lines.push(`Coverage: ${matched.length} of ${venues.length} venues matched to local councils.`)
  lines.push('')

  // Party breakdown across venues
  const partyCount = {}
  const partyRevenue = {}
  const partyGrades = {}

  for (const { venue, council } of matched) {
    const party = council.party_name || 'Unknown'
    partyCount[party] = (partyCount[party] || 0) + 1

    if (venue.revenue != null) {
      if (!partyRevenue[party]) partyRevenue[party] = { total: 0, count: 0 }
      partyRevenue[party].total += venue.revenue
      partyRevenue[party].count++
    }

    const g = venue.grade
    if (g && g !== 'E') {
      if (!partyGrades[party]) partyGrades[party] = { A: 0, B: 0, C: 0, D: 0 }
      partyGrades[party][g] = (partyGrades[party][g] || 0) + 1
    }
  }

  // Sort parties by venue count descending
  const sortedParties = Object.entries(partyCount)
    .sort((a, b) => b[1] - a[1])

  lines.push(`PARTY BREAKDOWN (venues by controlling council party):`)
  for (const [party, count] of sortedParties) {
    const rev = partyRevenue[party]
    const avg = rev && rev.count > 0 ? Math.round(rev.total / rev.count) : null
    const grades = partyGrades[party]

    let line = `  ${party}: ${count} venues`
    if (avg != null) line += `, avg revenue £${avg.toLocaleString()}`
    if (grades) {
      const gradeParts = []
      for (const g of ['A', 'B', 'C', 'D']) {
        if (grades[g]) gradeParts.push(`${g}:${grades[g]}`)
      }
      if (gradeParts.length > 0) line += ` (grades: ${gradeParts.join(', ')})`
    }
    lines.push(line)
  }
  lines.push('')

  // Identify councils with multiple venues (useful for targeted campaigns)
  const councilVenues = {}
  for (const { venue, council } of matched) {
    const key = council.la_name
    if (!councilVenues[key]) councilVenues[key] = { council, venues: [] }
    councilVenues[key].venues.push(venue)
  }

  const multiVenueCouncils = Object.entries(councilVenues)
    .filter(([, data]) => data.venues.length >= 3)
    .sort((a, b) => b[1].venues.length - a[1].venues.length)
    .slice(0, 10)

  if (multiVenueCouncils.length > 0) {
    lines.push(`COUNCILS WITH MOST VENUES (3+ venues — useful for local authority partnerships):`)
    for (const [name, data] of multiVenueCouncils) {
      const party = data.council.party_name
      const screened = data.venues.filter(v => v.grade && v.grade !== 'E')
      const avgRev = screened.length > 0
        ? Math.round(screened.reduce((s, v) => s + (v.revenue || 0), 0) / screened.length)
        : null
      let line = `  ${name} (${party}): ${data.venues.length} venues`
      if (avgRev != null) line += `, avg £${avgRev.toLocaleString()}`
      lines.push(line)
    }
    lines.push('')
  }

  lines.push(`NOTE: Political context can inform marketing strategy — e.g. councils with arts/culture funding priorities may be receptive to screening partnerships. Labour and Lib Dem councils tend to have stronger arts funding commitments.`)

  return lines.join('\n')
}

