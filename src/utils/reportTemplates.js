/**
 * CineScope — Report Templates (v3.5 — Stage 3)
 *
 * Report type metadata (card picker), default AI prompt templates,
 * placeholder definitions for the template editor, and substitution helper.
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
    stage: 'coming',
  },
  {
    id: 'venue_recs',
    icon: 'recommend',
    label: 'Venue Recommendations',
    description: 'AI-predicted venues for pre-release or missed opportunities',
    requires: '1 film in catalogue',
    stage: 'coming',
  },
  {
    id: 'csv',
    icon: 'table_chart',
    label: 'CSV Data Export',
    description: 'Raw venue/revenue/grade data as a downloadable spreadsheet',
    requires: '1 film with Comscore data',
    stage: 'coming',
  },
]


// ─── Placeholder Definitions ─────────────────────────────────────
// Each report type has its own set of available placeholders.
// Shown in the template editor's reference panel.

export const PLACEHOLDER_DEFS = {
  insights: [
    { token: '{{film_titles}}',        description: 'Comma-separated list of analysed film titles' },
    { token: '{{film_count}}',         description: 'Number of films in the analysis' },
    { token: '{{total_venues}}',       description: 'Total unique venues tracked across all films' },
    { token: '{{improving_count}}',    description: 'Number of venues with improving grades' },
    { token: '{{declining_count}}',    description: 'Number of venues with declining grades' },
    { token: '{{trend_data}}',         description: 'Full trend summary (auto-generated, includes venue-level detail)' },
    { token: '{{film_profiles}}',      description: 'Film metadata: genres, cast, director, keywords, financials' },
  ],
  chain: [
    { token: '{{chain_name}}',         description: 'Name of the selected cinema chain' },
    { token: '{{film_title}}',         description: 'Title of the selected film' },
    { token: '{{chain_data}}',         description: 'Full chain data summary (auto-generated, includes venue-level detail)' },
    { token: '{{film_profile}}',       description: 'Film metadata: genres, cast, director, keywords, financials' },
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
// Used when Austin hasn't customised a template.
// The template is sent as the user message to Claude.
// Data placeholders ({{trend_data}}, {{chain_data}}) are auto-filled
// with the full dataset. Text placeholders are filled with labels.

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

  marketing: `Placeholder -- Marketing Targets template (Stage 4)`,

  venue_recs: `Placeholder -- Venue Recommendations template (Stage 5)`,
}


// ─── System Prompts ──────────────────────────────────────────────
// These stay fixed (not user-editable). The template above is the
// user message; this system prompt sets Claude's role/behaviour.

export const SYSTEM_PROMPTS = {
  insights: `You are CineScope's AI analyst -- a sharp, commercially-minded cinema distribution analyst helping Austin Shaw at Liberator Film Services make smarter marketing decisions. You receive trend data showing how cinema venues across the UK and Ireland perform across multiple film releases, including grades (A=top quartile, B=above average, C=below average, D=poor, E=not screened). Write concise, actionable analysis. Use GBP for currency.`,

  chain: `You are CineScope's AI analyst writing a chain-specific performance report. This report will be sent to a cinema chain's manager, so it must be professional, constructive, and externally appropriate. Reference specific venue names and data. Use GBP for currency.`,
}


// ─── Template Substitution ───────────────────────────────────────

/**
 * Substitute {{placeholders}} in a template string with real values.
 *
 * @param {string} template — Template text with {{placeholders}}
 * @param {Object} values — Map of placeholder name to value
 * @returns {string} — Substituted text
 */
export function substituteTemplate(template, values) {
  return template.replace(/\{\{(\w+)\}\}/g, (match, key) => {
    if (key in values) return values[key]
    return match // Leave unrecognised placeholders as-is
  })
}
