# CineScope v3.0.0-alpha — Stage 1: Film Catalogue Backend

## What's in this package

```
api/
  tmdb/index.js          — NEW serverless function (TMDB search + details proxy)
  catalogue/index.js     — NEW serverless function (catalogue CRUD)

004_add_film_catalogue.sql  — Database migration script
apiClient_additions.js      — New methods to add to src/utils/apiClient.js
```

## Deployment Steps

### Step 1: Add TMDB API Key to Vercel

1. Go to **Vercel Dashboard → CineScope → Settings → Environment Variables**
2. Add a new variable:
   - **Name:** `TMDB_API_KEY`
   - **Value:** `2c7b5f9ec599243016b6a5ca84916182` (from Austin's TMDB settings page)
   - **Environments:** Production, Preview, Development
3. Click Save

### Step 2: Run the Database Migration

1. Go to **Neon Console** (console.neon.tech)
2. Open the **SQL Editor** for the CineScope database
3. Paste the contents of `004_add_film_catalogue.sql` and run it
4. Expected output:
   - `film_catalogue` table created
   - `catalogue_id` column added to `films` table
   - Existing films auto-linked to new catalogue entries

### Step 3: Deploy the API Routes

1. Copy the `api/tmdb/` folder into your project's `api/` directory
2. Copy the `api/catalogue/` folder into your project's `api/` directory
3. Your `api/` directory should now look like:
   ```
   api/
     _lib/
       auth.js
       db.js
     ai/
       report/index.js
     catalogue/         ← NEW
       index.js
     contacts/
       index.js
     films/
       index.js
     geocode/
       index.js
     overrides/
       index.js
     settings/
       index.js
     tmdb/               ← NEW
       index.js
     venues/
       index.js
     webhooks/
       clerk/index.js
   ```

### Step 4: Add apiClient Methods

Open `src/utils/apiClient.js` and add the new methods from
`apiClient_additions.js`. These go inside the `createApiClient` function
object, alongside the existing methods (getFilms, saveFilm, etc.).

Also add the `tmdbImageUrl` helper as a named export at the bottom of the file.

### Step 5: Push to GitHub

Commit and push via GitHub Desktop. Vercel will auto-deploy.
The new API routes will appear as functions 9 and 10 (out of 12 max).

## Testing

Once deployed, you can test the TMDB proxy via browser console:

```javascript
// Test TMDB search
const api = createApiClient(getToken);
const results = await api.searchTMDB('Importance of Being Earnest');
console.log(results);

// Test TMDB details (using a known TMDB ID)
const details = await api.getTMDBDetails(1352026);
console.log(details);

// Test catalogue listing
const catalogue = await api.getCatalogue();
console.log(catalogue);

// Test adding a film from TMDB
const entry = await api.addFilmFromTMDB(1352026, { status: 'released' });
console.log(entry);
```

## Serverless Function Count: 10 / 12

| # | Function | Status |
|---|----------|--------|
| 1 | /api/films | Existing |
| 2 | /api/overrides | Existing |
| 3 | /api/settings | Existing |
| 4 | /api/contacts | Existing |
| 5 | /api/venues | Existing |
| 6 | /api/geocode | Existing |
| 7 | /api/ai/report | Existing |
| 8 | /api/webhooks/clerk | Existing |
| **9** | **/api/tmdb** | **NEW** |
| **10** | **/api/catalogue** | **NEW** |
