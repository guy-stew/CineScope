/**
 * CineScope — Report Templates (v3.5)
 *
 * Report type metadata (card picker) and default AI prompt templates.
 * Templates become user-editable in Stage 3 (ReportTemplateEditor).
 * For now, the defaults are used directly by ReportsView.
 */

// ─── Report Type Definitions ─────────────────────────────────────
// Used by the card picker in ReportsView.jsx

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
    stage: 'coming',    // Stage 4
  },
  {
    id: 'venue_recs',
    icon: 'recommend',
    label: 'Venue Recommendations',
    description: 'AI-predicted venues for pre-release or missed opportunities',
    requires: '1 film in catalogue',
    stage: 'coming',    // Stage 5
  },
  {
    id: 'csv',
    icon: 'table_chart',
    label: 'CSV Data Export',
    description: 'Raw venue/revenue/grade data as a downloadable spreadsheet',
    requires: '1 film with Comscore data',
    stage: 'coming',    // Stage 6
  },
]


// ─── Default Prompt Templates ────────────────────────────────────
// These are the user-editable templates (Stage 3).
// Placeholders like {{film_title}} are replaced with real data before
// being sent to the Claude API as the user message.
//
// For Stage 2, we use the existing prompt-building functions in
// aiReport.js rather than these templates. These are here ready for
// Stage 3 to wire up the template editor + placeholder substitution.

export const DEFAULT_TEMPLATES = {
  insights: `You are CineScope's analytics assistant, helping a UK film distributor understand cinema box office performance.

FILM: {{film_title}}
Genre: {{film_genres}} | Certification: {{film_certification}} | Cast: {{film_cast}}

DATA SUMMARY:
- {{total_venues}} venues screened this film
- Total revenue: {{total_revenue}} | Average per venue: {{avg_revenue}}
- Grade distribution: A={{grade_a_count}}, B={{grade_b_count}}, C={{grade_c_count}}, D={{grade_d_count}}

CHAIN PERFORMANCE:
{{chain_summary}}

Please provide a report with these sections:
1. EXECUTIVE SUMMARY (2-3 sentences on overall performance)
2. TOP PERFORMERS - What do the Grade A venues have in common? Geographic clusters? Chain patterns? Demographic traits?
3. GROWTH OPPORTUNITIES - Analyse Grade B and C venues. Which ones are closest to upgrading? What marketing actions could help?
4. UNDERPERFORMERS - Are there Grade D venues that are surprising given their demographics or chain? What might explain poor performance?
5. DEMOGRAPHIC INSIGHTS - Using the demographic data, which age groups and regions show the strongest response to this film?
6. MARKETING RECOMMENDATIONS - Specific, actionable suggestions for improving performance. Which venues should Austin focus on? What type of marketing (social media, local press, chain-level negotiations)?

Keep the tone professional but accessible. Use specific venue names and data points. Format with clear headings.`,

  chain: `You are writing a performance report for {{chain_name}} cinema chain about the film {{film_title}}.

This report will be sent to the chain's cinema manager, so write it as an external-facing performance summary -- professional, encouraging where warranted, but honest about underperformance.

CHAIN DATA:
{{chain_data}}

Please cover:
1. CHAIN OVERVIEW (2-3 sentences)
2. TOP PERFORMERS - Celebrate the best venues by name
3. GROWTH OPPORTUNITIES - Constructively highlight underperformers
4. CHAIN VS NETWORK - How does this chain compare to the overall average?
5. RECOMMENDATIONS - 2-3 specific, actionable suggestions

Use GBP for currency. Keep under 500 words.`,

  marketing: `Placeholder — Marketing Targets template (Stage 4)`,

  venue_recs: `Placeholder — Venue Recommendations template (Stage 5)`,
}
