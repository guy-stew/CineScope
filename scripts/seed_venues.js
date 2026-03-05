// scripts/seed_venues.js
// ─────────────────────────────────────────────
// One-time script: populates the venues table
// from cinescope_venues_compact.json for a
// specific user.
//
// Usage:
//   node scripts/seed_venues.js <clerk_user_id>
//
// Example:
//   node scripts/seed_venues.js user_2abc123
//
// Requires DATABASE_URL environment variable.
// ─────────────────────────────────────────────
// NOTE: Run 003_add_venues.sql first to create
// the table, then run this script to populate it.
// ─────────────────────────────────────────────

import fs from 'fs';
import path from 'path';
import postgres from 'postgres';

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
  console.error('ERROR: DATABASE_URL environment variable is required');
  process.exit(1);
}

const clerkId = process.argv[2];
if (!clerkId) {
  console.error('Usage: node scripts/seed_venues.js <clerk_user_id>');
  console.error('Example: node scripts/seed_venues.js user_2abc123');
  process.exit(1);
}

const sql = postgres(DATABASE_URL, { ssl: 'require' });

async function main() {
  try {
    // 1. Look up the internal user ID from the Clerk ID
    const userRows = await sql`
      SELECT id FROM users WHERE clerk_id = ${clerkId}
    `;

    if (userRows.length === 0) {
      console.error(`ERROR: No user found with clerk_id = ${clerkId}`);
      console.error('Make sure the user has logged in at least once (Clerk webhook must have fired).');
      process.exit(1);
    }

    const userId = userRows[0].id;
    console.log(`Found user: ${clerkId} → internal ID: ${userId}`);

    // 2. Check if venues already seeded
    const existingCount = await sql`
      SELECT COUNT(*) AS count FROM venues WHERE user_id = ${userId}
    `;

    if (parseInt(existingCount[0].count) > 0) {
      console.log(`WARNING: User already has ${existingCount[0].count} venues.`);
      console.log('To re-seed, first run: DELETE FROM venues WHERE user_id = \'<uuid>\' AND source = \'seed\';');
      process.exit(1);
    }

    // 3. Load the venue JSON
    const jsonPath = path.resolve('public/data/cinescope_venues_compact.json');
    if (!fs.existsSync(jsonPath)) {
      console.error(`ERROR: Venue JSON not found at ${jsonPath}`);
      console.error('Run this script from the project root directory.');
      process.exit(1);
    }

    const data = JSON.parse(fs.readFileSync(jsonPath, 'utf-8'));
    const venues = data.venues;
    console.log(`Loaded ${venues.length} venues from JSON`);

    // 4. Insert in batches of 100
    const batchSize = 100;
    let inserted = 0;

    for (let i = 0; i < venues.length; i += batchSize) {
      const batch = venues.slice(i, i + batchSize);

      const names = batch.map(v => v.name);
      const comscoreNames = batch.map(v => v.name); // Default: comscore_name = display name
      const cities = batch.map(v => v.city);
      const countries = batch.map(v => v.country || 'United Kingdom');
      const chains = batch.map(v => v.chain?.trim() || null);
      const categories = batch.map(v => v.category || 'Independent');
      const lats = batch.map(v => v.lat || null);
      const lngs = batch.map(v => v.lng || null);
      const addresses = batch.map(v => v.address || null);
      const placeIds = batch.map(v => v.placeId || null);
      const notesList = batch.map(v => v.notes || null);

      await sql`
        INSERT INTO venues (
          user_id, name, comscore_name, city, country,
          chain, category, lat, lng, address,
          place_id, status, source, notes
        )
        SELECT
          ${userId},
          unnest(${names}::text[]),
          unnest(${comscoreNames}::text[]),
          unnest(${cities}::text[]),
          unnest(${countries}::text[]),
          unnest(${chains}::text[]),
          unnest(${categories}::text[]),
          unnest(${lats}::numeric[]),
          unnest(${lngs}::numeric[]),
          unnest(${addresses}::text[]),
          unnest(${placeIds}::text[]),
          'open',
          'seed',
          unnest(${notesList}::text[])
        ON CONFLICT (user_id, name, city) DO NOTHING
      `;

      inserted += batch.length;
      process.stdout.write(`\r  Inserted: ${inserted}/${venues.length}`);
    }

    console.log('\n');

    // 5. Verify
    const finalCount = await sql`
      SELECT COUNT(*) AS count FROM venues WHERE user_id = ${userId}
    `;
    console.log(`Done! ${finalCount[0].count} venues in database for user ${clerkId}`);

    // Show breakdown by category
    const breakdown = await sql`
      SELECT category, COUNT(*) AS count
      FROM venues
      WHERE user_id = ${userId}
      GROUP BY category
      ORDER BY count DESC
    `;
    console.log('\nBreakdown by category:');
    for (const row of breakdown) {
      console.log(`  ${row.category}: ${row.count}`);
    }

    // Show breakdown by country
    const byCountry = await sql`
      SELECT country, COUNT(*) AS count
      FROM venues
      WHERE user_id = ${userId}
      GROUP BY country
      ORDER BY count DESC
    `;
    console.log('\nBreakdown by country:');
    for (const row of byCountry) {
      console.log(`  ${row.country}: ${row.count}`);
    }

  } catch (err) {
    console.error('Seed error:', err);
    process.exit(1);
  } finally {
    await sql.end();
  }
}

main();
