// api/ai/report.js
// ─────────────────────────────────────────────
// POST /api/ai/report  → Proxy to Anthropic Claude API
// ─────────────────────────────────────────────
// Reads the user's Anthropic API key from
// user_settings (server-side), forwards the
// prompt to Claude, and streams the response
// back via Server-Sent Events (SSE).
//
// This eliminates the need for the
// "anthropic-dangerous-direct-browser-access"
// header and keeps the API key off the client.
// ─────────────────────────────────────────────

import { getDb } from '../_lib/db.js';
import { authenticate } from '../_lib/auth.js';

export const config = {
  // Vercel: allow streaming responses
  supportsResponseStreaming: true,
};

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: `Method ${req.method} not allowed` });
  }

  const user = await authenticate(req, res);
  if (!user) return;

  const sql = getDb();

  try {
    // ── Get the user's Anthropic API key from settings ──
    const keyRows = await sql`
      SELECT setting_value
      FROM user_settings
      WHERE user_id = ${user.id} AND setting_key = 'anthropic_api_key'
    `;

    if (keyRows.length === 0 || !keyRows[0].setting_value) {
      return res.status(400).json({
        error: 'No Anthropic API key configured. Add one in Settings.'
      });
    }

    // setting_value is JSONB, so it's stored as a JSON string with quotes
    const apiKey = typeof keyRows[0].setting_value === 'string'
      ? keyRows[0].setting_value
      : JSON.parse(JSON.stringify(keyRows[0].setting_value));

    // ── Forward the request to Anthropic ──
    const { model, system, messages, max_tokens } = req.body;

    const anthropicRes = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: model || 'claude-sonnet-4-20250514',
        max_tokens: max_tokens || 4096,
        system: system || undefined,
        messages: messages || [],
        stream: true,
      }),
    });

    if (!anthropicRes.ok) {
      const errorBody = await anthropicRes.text();
      console.error('Anthropic API error:', anthropicRes.status, errorBody);
      return res.status(anthropicRes.status).json({
        error: 'Anthropic API error',
        details: errorBody,
      });
    }

    // ── Stream the SSE response back to the client ──
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');

    const reader = anthropicRes.body.getReader();
    const decoder = new TextDecoder();

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        const chunk = decoder.decode(value, { stream: true });
        res.write(chunk);
      }
    } catch (streamErr) {
      console.error('Stream error:', streamErr);
    } finally {
      res.end();
    }

  } catch (err) {
    console.error('POST /api/ai/report error:', err);
    if (!res.headersSent) {
      return res.status(500).json({ error: 'Failed to generate AI report' });
    }
    res.end();
  }
}
