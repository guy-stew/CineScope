/**
 * CineScope — Report Templates (v3.5 — Stage 6: All report types active)
 */


// ─── Report Type Definitions ─────────────────────────────────────

export const REPORT_TYPES = [
  {
    id: 'insights',
    icon: 'auto_awesome',
    label: 'AI Insights',
    description: 'Multi-film trend analysis with marketing recommendations',
    requires: 'At least 2 films with Comscore data',
    stage: 'ready',
  },
  {
    id: 'chain',
    icon: 'business',
    label: 'Chain Performance',
    description: 'Single-chain analysis for cinema managers and bookers',
    requires: '1 film with Comscore data + chain selected',
    stage: 'ready',
  },
  {
    id: 'marketing',
    icon: 'campaign',
    label: 'Marketing Targets',
    description: 'Grade B+C venues with AI-generated growth notes',
    requires: '1 film with Comscore data',
    stage: 'ready',
  },
  {
    id: 'venue_recs',
    icon: 'recommend',
    label: 'Venue Recommendations',
    description: 'AI-predicted venues for pre-release or missed opportunities',
    requires: '1 film in catalogue',
    stage: 'ready',
  },
  {
    id: 'csv',
    icon: 'table_chart',
    label: 'CSV Data Export',
    description: 'Raw venue/revenue/grade data as a downloadable spreadsheet',
    requires: '1 film with Comscore data',
    stage: 'ready',
  },
]


// ─── Placeholder Definitions ─────────────────────────────────────

export const PLACEHOLDER_DEFS = {
  insights: [
    { token: '{{film_titles}}',        description: 'Comma-separated list of analysed film titles' },
    { token: '{{film_count}}',         description: 'Number of films in the analysis' },
    { token: '{{total_venues}}',       description: 'Total unique venues tracked across all films' },
    { token: '{{improving_count}}',    description: 'Number of venues with improving grades' },
    { token: '{{declining_count}}',    description: 'Number of venues with declining grades' },
    { token: '{{trend_data}}',         description: 'Full trend summary (auto-generated)' },
    { token: '{{film_profiles}}',      description: 'Film metadata: genres, cast, director, keywords, financials' },
  ],
  chain: [
    { token: '{{chain_name}}',         description: 'Name of the selected cinema chain' },
    { token: '{{film_title}}',         description: 'Title of the selected film' },
    { token: '{{chain_data}}',         description: 'Full chain data summary (auto-generated)' },
    { token: '{{film_profile}}',       description: 'Film metadata' },
  ],
  marketing: [
    { token: '{{film_title}}',         description: 'Title of the selected film' },
    { token: '{{bc_count}}',           description: 'Number of Grade B+C venues' },
    { token: '{{grade_b_count}}',      description: 'Number of Grade B venues' },
    { token: '{{grade_c_count}}',      description: 'Number of Grade C venues' },
    { token: '{{network_avg}}',        description: 'Network average revenue per venue' },
    { token: '{{grade_a_avg}}',        description: 'Grade A average revenue (the benchmark)' },
    { token: '{{venue_data}}',         description: 'Full B+C venue list' },
    { token: '{{film_profile}}',       description: 'Film metadata' },
  ],
  venue_recs: [
    { token: '{{mode}}',               description: 'Analysis mode: "missed_opportunity" or "pre_release"' },
    { token: '{{film_title}}',         description: 'Title of the target film' },
    { token: '{{film_profile}}',       description: 'Film metadata: genres, cast, director, keywords' },
    { token: '{{candidate_venues}}',   description: 'Unscreened venues to evaluate (auto-generated)' },
    { token: '{{top_performers}}',     description: 'Grade A/B venues as context for what "good" looks like' },
    { token: '{{historical_data}}',    description: 'Performance data from other imported films' },
  ],
}


// ─── Settings Keys ───────────────────────────────────────────────

export const TEMPLATE_SETTINGS_KEYS = {
  insights: 'report_template_insights',
  chain: 'report_template_chain',
  marketing: 'report_template_marketing',
  venue_recs: 'report_template_venue_recs',
}


// ─── Default Templates ───────────────────────────────────────────

export const DEFAULT_TEMPLATES = {

  insights: `Analyse the following multi-film trend data from CineScope, a UK cinema distribution analytics tool used by Liberator Film Services.

Films in this analysis: {{film_titles}}

Please provide a report with these sections:

1. EXECUTIVE SUMMARY (2-3 sentences) -- The headline story across these {{film_count}} releases.

2. KEY FINDINGS -- What patterns stand out? Which chains/regions are consistently strong or weak? Any surprises?

3. MARKETING OPPORTUNITIES -- Identify B and C grade venues/regions where targeted marketing could push performance up. Focus on improving venues and those with high local population. When cast or genre data is available, suggest how the film's profile could inform targeting.

4. VENUES TO WATCH -- Highlight the top improvers (momentum to capitalise on) and top decliners (may need investigation).

5. RECOMMENDATIONS -- 3-5 specific, actionable next steps.

Keep the tone professional but conversational. Use GBP for currency. Be specific with venue names, chains, and regions. Keep under 600 words.

--- DATA ---

{{trend_data}}

{{film_profiles}}`,

  chain: `Write a performance report for the {{chain_name}} cinema chain about the film "{{film_title}}".

This report will be sent to the chain's cinema manager, so write it as an external-facing performance summary -- professional, encouraging where warranted, but honest about underperformance.

Please cover:

1. CHAIN OVERVIEW (2-3 sentences) -- How did {{chain_name}} perform overall?

2. TOP PERFORMERS -- Celebrate the best venues by name, with revenue and grade.

3. GROWTH OPPORTUNITIES -- Constructively highlight underperformers. Where population density data suggests untapped audience, mention it.

4. CHAIN VS NETWORK -- How does {{chain_name}} compare to the overall average?

5. RECOMMENDATIONS -- 2-3 specific suggestions for improving performance.

Use GBP for currency. Be specific with venue names and numbers. Keep under 500 words.

--- DATA ---

{{chain_data}}

{{film_profile}}`,

  marketing: `You are analysing Grade B and C cinema venues for the film "{{film_title}}".

These {{bc_count}} venues ({{grade_b_count}} Grade B, {{grade_c_count}} Grade C) screened the film but underperformed relative to Grade A venues. They represent growth opportunities where targeted marketing could lift performance.

Context:
- Network average revenue per venue: {{network_avg}}
- Grade A average revenue (the benchmark): {{grade_a_avg}}

For each venue, write a short (1-2 sentence) marketing note explaining:
- Why this venue is a target (what's the gap vs Grade A performance?)
- What specific marketing action might help (social media, local press, chain negotiation, screening times)
- Reference the chain type or location if relevant

Rate each venue's potential as "High", "Medium", or "Low" based on how likely marketing could close the gap.

Sort from highest potential to lowest.

IMPORTANT: Respond with ONLY a JSON object in this exact format, no other text:
{
  "summary": "2-3 sentence overview of the B+C opportunity for this film",
  "venues": [
    {
      "rank": 1,
      "name": "Venue Name",
      "city": "City",
      "chain": "Chain or Independent",
      "grade": "B",
      "revenue": 1234,
      "screens": 5,
      "potential": "High",
      "note": "Marketing note for this venue"
    }
  ]
}

--- VENUE DATA ---

{{venue_data}}

{{film_profile}}`,

  venue_recs: `You are recommending cinema venues for the film "{{film_title}}".

MODE: {{mode}}

{{film_profile}}

Your task: Analyse the candidate venues below and recommend the best ones for this film. For each venue, predict how it would perform and explain your reasoning.

Consider:
- Chain type (premium/arthouse chains like Picturehouse, Curzon, Everyman tend to suit certain genres)
- Location and city (major cities vs regional towns)
- Screen count (larger venues can dedicate more screens)
- Historical performance at similar films (if available below)
- Category (Independent vs Large Chain vs Small/Premium Chain)

Rank venues from strongest recommendation to weakest. Only include venues you'd actually recommend (minimum confidence of Medium).

IMPORTANT: Respond with ONLY a JSON object in this exact format, no other text:
{
  "summary": "2-3 sentence overview of the recommendation strategy",
  "mode": "{{mode}}",
  "venues": [
    {
      "rank": 1,
      "name": "Venue Name",
      "city": "City",
      "chain": "Chain or Independent",
      "predicted_grade": "A",
      "confidence": "High",
      "reasoning": "1-2 sentence explanation",
      "screens": 5
    }
  ]
}

--- TOP PERFORMERS (what "good" looks like for this type of film) ---

{{top_performers}}

--- CANDIDATE VENUES TO EVALUATE ---

{{candidate_venues}}

--- HISTORICAL PERFORMANCE DATA ---

{{historical_data}}`,
}


// ─── System Prompts ──────────────────────────────────────────────

export const SYSTEM_PROMPTS = {
  insights: `You are CineScope's AI analyst -- a sharp, commercially-minded cinema distribution analyst helping Austin Shaw at Liberator Film Services make smarter marketing decisions. You receive trend data showing how cinema venues across the UK and Ireland perform across multiple film releases, including grades (A=top quartile, B=above average, C=below average, D=poor, E=not screened). Write concise, actionable analysis. Use GBP for currency.`,

  chain: `You are CineScope's AI analyst writing a chain-specific performance report. This report will be sent to a cinema chain's manager, so it must be professional, constructive, and externally appropriate. Reference specific venue names and data. Use GBP for currency.`,

  marketing: `You are CineScope's AI analyst generating structured marketing target data for Grade B and C cinema venues. You MUST respond with valid JSON only -- no markdown, no explanation, no backticks. The JSON must match the schema specified in the user message exactly. Every venue in the input data must appear in your output. Use GBP for currency values (numbers only, no symbols in the JSON).`,

  venue_recs: `You are CineScope's AI venue recommender for UK/Ireland cinema distribution. You predict which cinema venues would perform well for a specific film based on venue characteristics, chain type, location, and historical patterns. You MUST respond with valid JSON only -- no markdown, no explanation, no backticks. The JSON must match the schema specified in the user message exactly. Recommend 20-40 venues maximum, ranked by predicted performance. Use GBP for currency values (numbers only, no symbols in the JSON).`,
}


// ─── Template Substitution ───────────────────────────────────────

export function substituteTemplate(template, values) {
  return template.replace(/\{\{(\w+)\}\}/g, (match, key) => {
    if (key in values) return values[key]
    return match
  })
}
