# CineScope Venue Management — Stage 1: Backend & Utilities

**Date:** 5 March 2026
**Version:** v2.2.0 (Venue Management)

---

## What's in this package

```
api/
  migrations/
    003_add_venues.sql        ← Run this against Neon Postgres
  venues/
    index.js                  ← NEW serverless function (drop into api/venues/)
  geocode/
    index.js                  ← NEW serverless function (drop into api/geocode/)

scripts/
  seed_venues.js              ← One-time: populates venues table from JSON

src/utils/
  geocoder.js                 ← NEW client-side geocoding utility
  apiClient_VENUE_ADDITIONS.js ← Append these methods to your existing apiClient.js

public/data/
  CineScope_Venue_Import_Template.xlsx ← Template spreadsheet for bulk import
```

---

## Deployment Steps

### Step 1: Run the migration

Run `003_add_venues.sql` against your Neon Postgres database. This creates the
`venues` table with all indexes, constraints, and the auto-update trigger.

```
psql $DATABASE_URL -f api/migrations/003_add_venues.sql
```

Or paste the SQL into the Neon Console SQL editor and run it there.

### Step 2: Drop in the API routes

Copy these two new folders into your project's `api/` directory:

- `api/venues/index.js` → alongside your existing `api/films/`, `api/contacts/`, etc.
- `api/geocode/index.js` → new folder

Your `api/` folder should now look like:

```
api/
  _lib/           (existing — auth.js, db.js)
  ai/             (existing)
  contacts/       (existing)
  films/          (existing)
  geocode/        ← NEW
  overrides/      (existing)
  settings/       (existing)
  venues/         ← NEW
  webhooks/       (existing)
```

### Step 3: Seed existing venues

From your project root, run the seed script to populate the venues table
with the existing 1,060 venues from `cinescope_venues_compact.json`:

```
node scripts/seed_venues.js <your_clerk_user_id>
```

You can find your Clerk user ID in the Clerk Dashboard → Users.
The script will show a breakdown by category and country when done.

### Step 4: Add client utilities

1. **Drop** `src/utils/geocoder.js` into your `src/utils/` folder (new file).

2. **Append** the contents of `src/utils/apiClient_VENUE_ADDITIONS.js` to the
   bottom of your existing `src/utils/apiClient.js`. These are the 8 new
   exported functions: `getVenues`, `getVenue`, `searchVenues`, `addVenue`,
   `updateVenue`, `setVenueStatus`, `deleteVenue`, `importVenues`.

### Step 5: Place the import template

Copy `public/data/CineScope_Venue_Import_Template.xlsx` into your
`public/data/` folder. This is the template Austin will download from
the app to fill in new venues for bulk import.

### Step 6: Push & deploy

Commit everything via GitHub Desktop and push. Vercel will auto-deploy
the two new serverless functions.

---

## Testing the API

After deployment, you can test with curl or Postman:

```bash
# List all venues
curl -H "Authorization: Bearer <clerk_token>" https://cinescope.pro/api/venues

# Search
curl -H "Authorization: Bearer <clerk_token>" "https://cinescope.pro/api/venues?search=odeon"

# Add a venue
curl -X POST -H "Authorization: Bearer <clerk_token>" \
  -H "Content-Type: application/json" \
  -d '{"name":"Test Cinema","comscoreName":"TEST CINEMA","city":"London","country":"United Kingdom","category":"Independent"}' \
  https://cinescope.pro/api/venues

# Geocode an address
curl -H "Authorization: Bearer <clerk_token>" \
  "https://cinescope.pro/api/geocode?postcode=SW1A+1AA&country=United+Kingdom"
```

---

## What's next (Stage 2)

The Venue Manager UI — the modal with the searchable list, add/edit form,
import tab, and map preview. That's the next session.

---

## Serverless function count

After this deployment: **8 functions** (films, overrides, settings,
ai/report, webhooks/clerk, contacts, venues, geocode) out of 12 allowed
on the Vercel Hobby plan.
