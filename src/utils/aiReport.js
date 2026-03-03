/**
 * CineScope AI Report Generator
 *
 * Sends trend analysis data to the Claude API (client-side) and returns
 * a narrative insights report. Uses streaming for responsive UI.
 *
 * The API key is stored locally by the user — never sent anywhere except
 * directly to Anthropic's API.
 */

const API_URL = 'https://api.anthropic.com/v1/messages'
const MODEL = 'claude-sonnet-4-20250514'

const SYSTEM_PROMPT = `You are CineScope's AI analyst — a sharp, commercially-minded cinema distribution analyst helping Austin Shaw at Liberator Film Services make smarter marketing decisions.

You will receive trend data from CineScope showing how cinema venues across the UK and Ireland perform across multiple film releases. The data includes venue-level grades (A=top, B=above average, C=below average, D=poor), chain-level averages, and regional patterns.

Write a concise, actionable analysis report covering:

1. **Executive Summary** (2-3 sentences) — The big picture. What's the headline story across these releases?

2. **Key Findings** — What patterns stand out? Which chains/regions are consistently strong or weak? Are there any surprises?

3. **Marketing Opportunities** — Specifically identify B and C grade venues/regions where targeted social media marketing could push performance up. Focus on venues that are improving or have high local population.

4. **Venues to Watch** — Highlight the top improvers (momentum worth capitalising on) and top decliners (may need investigation or deprioritisation).

5. **Recommendations** — 3-5 specific, actionable next steps Austin should take.

Keep the tone professional but conversational — this is a working tool for a busy distributor, not an academic paper. Use £ for currency. Be specific with venue names, chains, and regions where possible. Keep the total report under 600 words.`

/**
 * Generate an AI insights report from trend data.
 *
 * @param {string} apiKey — Anthropic API key
 * @param {string} trendSummary — Compact text summary from buildTrendSummaryForAI()
 * @param {function} onChunk — Called with each text chunk as it streams in
 * @returns {Promise<string>} — Complete report text
 */
export async function generateAIReport(apiKey, trendSummary, onChunk) {
  if (!apiKey) {
    throw new Error('No API key provided. Add your Anthropic API key in Settings.')
  }

  const response = await fetch(API_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
      'anthropic-dangerous-direct-browser-access': 'true',
    },
    body: JSON.stringify({
      model: MODEL,
      max_tokens: 1500,
      system: SYSTEM_PROMPT,
      stream: true,
      messages: [
        {
          role: 'user',
          content: `Here is the CineScope trend data for analysis. Please write the insights report.\n\n${trendSummary}`,
        },
      ],
    }),
  })

  if (!response.ok) {
    const errorBody = await response.text()
    if (response.status === 401) {
      throw new Error('Invalid API key. Please check your Anthropic API key in Settings.')
    }
    if (response.status === 429) {
      throw new Error('Rate limit exceeded. Please wait a moment and try again.')
    }
    throw new Error(`API error (${response.status}): ${errorBody.slice(0, 200)}`)
  }

  // Parse the SSE stream
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
