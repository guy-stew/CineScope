// api/_lib/db.js
// ─────────────────────────────────────────────
// Neon Postgres connection for Vercel serverless
// ─────────────────────────────────────────────
// Uses @neondatabase/serverless which is optimised
// for serverless environments (HTTP-based queries,
// no persistent connection pool needed).
//
// The DATABASE_URL env var is set in Vercel:
//   Settings → Environment Variables
//   Value: your Neon connection string
//   (e.g. postgresql://user:pass@ep-xxx.eu-central-1.aws.neon.tech/neondb?sslmode=require)
// ─────────────────────────────────────────────

import { neon } from '@neondatabase/serverless';

let _sql = null;

export function getDb() {
  if (!_sql) {
    if (!process.env.DATABASE_URL) {
      throw new Error('DATABASE_URL environment variable is not set');
    }
    _sql = neon(process.env.DATABASE_URL);
  }
  return _sql;
}
