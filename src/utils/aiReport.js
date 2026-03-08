/**
 * CineScope AI Report Generator (v2.0 cloud)
 *
 * Sends trend analysis data to Claude via the server-side proxy at
 * /api/ai/report. The user's Anthropic API key is stored in the
 * database and never exposed to the browser.
 *
 * v2.0 changes:
 *   - Removed direct Anthropic API calls (no more x-api-key header)
 *   - Removed anthropic-dangerous-direct-browser-access header
 *   - Functions now take `getToken` (Clerk auth) instead of `apiKey`
 *   - Calls go through /api/ai/report server proxy
 *   - SSE stream parsing logic unchanged
 *
 * v1.11 features preserved:
 *   - generateChainAIReport() — chain-tailored analysis for PDF pitch packs
 *   - buildChainDataForAI() — builds chain-specific data summary
 *   - Refactored shared streaming logic into _callProxy()
 *   - Chain reports work with a single film (no trend data dependency)
 */

import { generateAIReport as apiGenerateAIReport } from './apiClient'

const MODEL = 'claude-sonnet-4-20250514'


// ─── Film Profile Builder ───────────────────────────────────────

/**
 * Build a compact text block describing the film(s) from catalogue metadata.
 * This enriches the AI prompt with genre, cast, keywords, financials etc.
 *
 * @param {Array} catalogueEntries — Array of catalogue objects (with tmdb_data)
 * @returns {string} — Formatted film profile text, or empty string if no data
 */
export function buildFilmProfileForAI(catalogueEntries) {
  if (!catalogueEntries || catalogueEntries.length === 0) return ''

  const lines = ['=== FILM PROFILES ===', '']

  for (const entry of catalogueEntries) {
    if (!entry) continue

    const tmdb = entry.tmdb_data
      ? (typeof entry.tmdb_data === 'string' ? JSON.parse(entry.tmdb_data) : entry.tmdb_data)
      : null

    lines.push(`FILM: ${entry.title || 'Unknown'}`)

    // Basic metadata
    const meta = []
    if (entry.year) meta.push(`Year: ${entry.year}`)
    if (entry.certification) meta.push(`Certificate: ${entry.certification}`)
    if (entry.runtime) meta.push(`Runtime: ${entry.runtime} mins`)
    if (entry.genres) meta.push(`Genres: ${entry.genres}`)
    if (meta.length > 0) lines.push(`  ${meta.join(' | ')}`)

    // Synopsis
    if (entry.synopsis) {
      const shortSynopsis = entry.synopsis.length > 200
        ? entry.synopsis.substring(0, 200) + '...'
        : entry.synopsis
      lines.push(`  Synopsis: ${shortSynopsis}`)
    }

    // Cast (top 5)
    const cast = tmdb?.cast || []
    if (cast.length > 0) {
      const topCast = cast.slice(0, 5).map(c =>
        `${c.name}${c.character ? ` (as ${c.character})` : ''}`
      )
      lines.push(`  Top cast: ${topCast.join(', ')}`)
    }

    // Director + key crew
    const crew = tmdb?.crew || []
    const director = crew.find(c => c.job === 'Director')
    if (director) lines.push(`  Director: ${director.name}`)

    // Keywords
    const keywords = tmdb?.keywords || []
    if (keywords.length > 0) {
      const kwNames = keywords.slice(0, 10).map(k => k.name || k)
      lines.push(`  Keywords: ${kwNames.join(', ')}`)
    }

    // TMDB popularity/rating
    if (entry.tmdb_vote_average) {
      lines.push(`  TMDB rating: ${entry.tmdb_vote_average}/10${entry.tmdb_popularity ? ` (popularity: ${Math.round(entry.tmdb_popularity)})` : ''}`)
    }

    // Financial data
    const distCost = parseFloat(entry.distribution_cost) || 0
    const prodCost = parseFloat(entry.production_cost) || 0
    const totalRevenue = parseFloat(entry.total_uk_revenue) || 0
    if (distCost > 0 || prodCost > 0) {
      const totalCost = distCost + prodCost
      const roi = totalCost > 0 ? ((totalRevenue - totalCost) / totalCost * 100).toFixed(0) : null
      lines.push(`  Financials: Distribution cost £${distCost.toLocaleString()}, Production cost £${prodCost.toLocaleString()}, UK revenue £${totalRevenue.toLocaleString()}${roi ? `, ROI ${roi}%` : ''}`)
    }

    lines.push('')
  }

  return lines.join('\n')
}

// ─── General Report ─────────────────────────────────────────────

const SYSTEM_PROMPT = `You are CineScope's AI analyst — a sharp, commercially-minded cinema distribution analyst helping Austin Shaw at Liberator Film Services make smarter marketing decisions.

You will receive trend data from CineScope showing how cinema venues across the UK and Ireland perform across multiple film releases. The data includes venue-level grades (A=top, B=above average, C=below average, D=poor), chain-level averages, and regional patterns.

You may also receive FILM PROFILES with metadata about the films being analysed — including genres, cast, director, keywords, certification, and financial data. When film profiles are provided, use them to make your analysis more contextual and targeted. For example: reference the cast's audience demographics when suggesting marketing targets, use genre and keywords to identify which venue types are the best fit, and reference financial ROI data when making investment recommendations.

Write a concise, actionable analysis report covering:

1. **Executive Summary** (2-3 sentences) — The big picture. What's the headline story across these releases?

2. **Key Findings** — What patterns stand out? Which chains/regions are consistently strong or weak? Are there any surprises?

3. **Marketing Opportunities** — Specifically identify B and C grade venues/regions where targeted social media marketing could push performance up. Focus on venues that are improving or have high local population. When cast or genre data is available, suggest how the film's profile could inform targeting (e.g. younger cast = Instagram/TikTok targeting for 18-34 demographic).

4. **Venues to Watch** — Highlight the top improvers (momentum worth capitalising on) and top decliners (may need investigation or deprioritisation).

5. **Recommendations** — 3-5 specific, actionable next steps Austin should take.

Keep the tone professional but conversational — this is a working tool for a busy distributor, not an academic paper. Use £ for currency. Be specific with venue names, chains, and regions where possible. Keep the total report under 600 words.`


// ─── Chain-Tailored Report ──────────────────────────────────────

const CHAIN_SYSTEM_PROMPT = `You are CineScope's AI analyst — a sharp, commercially-minded cinema distribution analyst working for Liberator Film Services.

You will receive performance data for a SPECIFIC cinema chain. This report will be sent to the chain's cinema manager, so write it as an external-facing performance summary — professional, encouraging where warranted, but honest about underperformance.

You may also receive a FILM PROFILE with metadata about the film — including genres, cast, director, keywords, and certification. When a film profile is provided, reference it naturally in your analysis. For example: mention how the film's genre or cast appeals to specific audience demographics, and suggest targeted marketing approaches based on the film's profile.

Write a concise, tailored performance report covering:

1. **Chain Overview** (2-3 sentences) — How did this chain perform overall? Set the context: number of venues, total and average revenue, overall grade.

2. **Top Performers** — Which venues in this chain did best? Celebrate specific locations by name, with revenue and grade. If a venue outperformed the network average, highlight it.

3. **Growth Opportunities** — Which venues in this chain underperformed? For each, note the grade and revenue. Where population density data is available and relevant, reference it (e.g. "Your Leeds venue sits in a densely populated area but earned only £X — there may be untapped audience here"). Frame these constructively — as opportunities, not failures.

4. **Chain vs Network** — How does this chain compare to the overall network average? Is it above or below? By how much?

5. **Recommendations** — 2-3 specific, actionable suggestions for improving performance at their weaker venues. Think marketing activity, screening times, local partnerships. When film profile data is available, tailor suggestions to the film's audience (e.g. social media targeting based on cast demographics).

Tone: Professional and respectful — this is going to someone outside the company. Use £ for currency. Be specific with venue names, cities, and numbers. Keep the total report under 500 words.`


/**
 * Generate a general AI insights report from trend data.
 *
 * @param {Function} getToken — Clerk getToken() function for auth
 * @param {string} trendSummary — Pre-built text summary of trend data
 * @param {Function} onChunk — Called with each text chunk as it streams in
 * @param {string} [filmProfile] — Optional film profile text from buildFilmProfileForAI()
 * @returns {Promise<string>} — Complete report text
 */
export async function generateAIReport(getToken, trendSummary, onChunk, filmProfile) {
  let userMessage = `Here is the CineScope trend data for analysis. Please write the insights report.\n\n${trendSummary}`

  if (filmProfile) {
    userMessage += `\n\n${filmProfile}`
  }

  return _callProxy(getToken, SYSTEM_PROMPT, userMessage, onChunk)
}


/**
 * Generate a chain-tailored AI report for a specific cinema chain.
 * Works with a single film — does NOT require trend data.
 *
 * @param {Function} getToken — Clerk getToken() function for auth
 * @param {string} chainName — Name of the selected chain (e.g. "Everyman")
 * @param {Array} chainVenues — Venues in this chain (with grade, revenue, city etc.)
 * @param {Array} allVenues — All venues (for network-wide comparison)
 * @param {Object} selectedFilm — Current film object (filmInfo, stats)
 * @param {Function} onChunk — Called with each text chunk as it streams in
 * @param {Object} [catalogueEntry] — Optional catalogue entry with TMDB metadata
 * @returns {Promise<string>} — Complete report text
 */
export async function generateChainAIReport(getToken, chainName, chainVenues, allVenues, selectedFilm, onChunk, catalogueEntry) {
  let dataSummary = buildChainDataForAI(chainName, chainVenues, allVenues, selectedFilm)

  if (catalogueEntry) {
    const filmProfile = buildFilmProfileForAI([catalogueEntry])
    if (filmProfile) {
      dataSummary += `\n\n${filmProfile}`
    }
  }

  return _callProxy(getToken, CHAIN_SYSTEM_PROMPT, dataSummary, onChunk)
}


/**
 * Build a compact text summary of chain performance data for the AI prompt.
 * Includes venue-level detail, network comparison, and population context.
 */
export function buildChainDataForAI(chainName, chainVenues, allVenues, selectedFilm) {
  const lines = []

  const filmTitle = selectedFilm?.filmInfo?.title || 'Unknown Film'
  lines.push(`=== CineScope Chain Performance Report ===`)
  lines.push(`Chain: ${chainName}`)
  lines.push(`Film: ${filmTitle}`)
  lines.push('')

  // Chain stats
  const screenedVenues = chainVenues.filter(v => v.grade && v.grade !== 'E')
  const notScreened = chainVenues.filter(v => v.grade === 'E' || !v.grade)
  const totalChainRevenue = screenedVenues.reduce((s, v) => s + (v.revenue || 0), 0)
  const avgChainRevenue = screenedVenues.length > 0 ? Math.round(totalChainRevenue / screenedVenues.length) : 0

  lines.push(`CHAIN SUMMARY:`)
  lines.push(`  Total venues in chain: ${chainVenues.length}`)
  lines.push(`  Screened this film: ${screenedVenues.length}`)
  if (notScreened.length > 0) {
    lines.push(`  Did not screen: ${notScreened.length}`)
  }
  lines.push(`  Total chain revenue: £${totalChainRevenue.toLocaleString()}`)
  lines.push(`  Average revenue per venue: £${avgChainRevenue.toLocaleString()}`)
  lines.push('')

  // Network comparison
  const allScreened = allVenues.filter(v => v.grade && v.grade !== 'E' && v.revenue != null)
  const networkTotalRevenue = allScreened.reduce((s, v) => s + (v.revenue || 0), 0)
  const networkAvgRevenue = allScreened.length > 0 ? Math.round(networkTotalRevenue / allScreened.length) : 0

  lines.push(`NETWORK COMPARISON:`)
  lines.push(`  Network average revenue per venue: £${networkAvgRevenue.toLocaleString()}`)
  lines.push(`  Chain average vs network: ${avgChainRevenue >= networkAvgRevenue ? '+' : ''}£${(avgChainRevenue - networkAvgRevenue).toLocaleString()} (${avgChainRevenue >= networkAvgRevenue ? 'above' : 'below'} average)`)
  lines.push('')

  // Grade distribution for this chain
  const gradeDist = { A: 0, B: 0, C: 0, D: 0, E: 0 }
  chainVenues.forEach(v => { if (v.grade) gradeDist[v.grade] = (gradeDist[v.grade] || 0) + 1 })
  lines.push(`CHAIN GRADE DISTRIBUTION:`)
  lines.push(`  A (Top): ${gradeDist.A} | B (Above avg): ${gradeDist.B} | C (Below avg): ${gradeDist.C} | D (Poor): ${gradeDist.D} | E (No screening): ${gradeDist.E}`)
  lines.push('')

  // Individual venue breakdown (sorted by revenue desc)
  const venuesSorted = [...screenedVenues].sort((a, b) => (b.revenue || 0) - (a.revenue || 0))

  lines.push(`VENUE BREAKDOWN (${screenedVenues.length} venues, ranked by revenue):`)
  for (const v of venuesSorted) {
    const vsNetwork = (v.revenue || 0) >= networkAvgRevenue ? 'above network avg' : 'below network avg'
    let line = `  ${v.name} (${v.city || 'Unknown'}): Grade ${v.grade}, £${(v.revenue || 0).toLocaleString()} — ${vsNetwork}`

    if (v.wasAggregated) {
      line += ' [multi-screen combined]'
    }

    lines.push(line)
  }
  lines.push('')

  // Venues that didn't screen
  if (notScreened.length > 0) {
    lines.push(`VENUES THAT DID NOT SCREEN:`)
    for (const v of notScreened) {
      lines.push(`  ${v.name} (${v.city || 'Unknown'})`)
    }
    lines.push('')
  }

  // Population context hint
  lines.push(`NOTES:`)
  lines.push(`  Population density data is available in CineScope. When venues in densely populated areas underperform, this may indicate untapped audience potential worth investigating with targeted local marketing.`)

  return lines.join('\n')
}


// ─── Shared streaming proxy call ────────────────────────────────

/**
 * Call the server-side AI proxy and parse the SSE stream.
 * Replaces the old _callClaude() that hit Anthropic directly.
 */
async function _callProxy(getToken, systemPrompt, userMessage, onChunk) {
  // Call the server proxy via apiClient
  const response = await apiGenerateAIReport({
    model: MODEL,
    system: systemPrompt,
    messages: [{ role: 'user', content: userMessage }],
    max_tokens: 1500,
  }, getToken)

  // The proxy returns the raw SSE stream from Anthropic,
  // so the parsing logic is identical to before.
  const reader = response.body.getReader()
  const decoder = new TextDecoder()
  let fullText = ''
  let buffer = ''

  while (true) {
    const { done, value } = await reader.read()
    if (done) break

    buffer += decoder.decode(value, { stream: true })

    // Process complete SSE events
    const lines = buffer.split('\n')
    buffer = lines.pop() || '' // Keep incomplete line in buffer

    for (const line of lines) {
      if (!line.startsWith('data: ')) continue
      const data = line.slice(6).trim()
      if (data === '[DONE]') continue

      try {
        const event = JSON.parse(data)

        if (event.type === 'content_block_delta' && event.delta?.type === 'text_delta') {
          const text = event.delta.text
          fullText += text
          if (onChunk) onChunk(text)
        }
      } catch {
        // Skip unparseable events
      }
    }
  }

  return fullText
}
