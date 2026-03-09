# CineScope — Project Tracker

**Last updated:** 9 March 2026 (v3.4.0 — Admin Impersonation: user switching, avatar menu, impersonation banner)
**Client:** Austin Shaw, Liberator Film Services
**Developer:** Guy
**Platform:** Web Application (React + Bootstrap, hosted on Vercel)
**Repository:** https://github.com/guy-stew/CineScope
**Live URL:** https://cinescope.pro/ (also accessible via https://cine-scope-omega.vercel.app/)

---

## 1. What Is CineScope?

A cinema performance analytics web application that maps and grades ~1,060 UK/Ireland cinema venues based on box office revenue data from Comscore. Designed for film distributors (starting with Liberator/Deluxe network) to identify high-performing venues, marketing targets, and underperformers on an interactive map when a specific film is selected. Delivered as a cloud-hosted React + Bootstrap single-page application accessible from any modern browser.

---

## 2. Platform Decision

| Decision | Details |
|----------|---------|
| **Original plan** | macOS Desktop App (SwiftUI + MapKit) |
| **Revised plan (v1.5)** | Cloud-hosted Web Application (React + Bootstrap) |
| **Reason for change** | Austin requested web-based delivery for cross-device access |
| **Hosting** | Vercel (live, automatic deployments from GitHub `main` branch) |
| **Mapping** | Leaflet.js (via React-Leaflet) — open-source, no API key |
| **Data privacy** | Comscore data parsed client-side only (raw files never uploaded). Processed revenue data stored in Neon Postgres (encrypted at rest + in transit). Anthropic API key stored server-side only. |
| **Database** | Neon Postgres (serverless, free tier) — schema deployed, 8 tables live |
| **Source control** | GitHub — https://github.com/guy-stew/CineScope |

### Technology Stack
- **Frontend:** React 18 (functional components + hooks)
- **UI Framework:** Bootstrap 5 (via React-Bootstrap)
- **Mapping:** Leaflet.js + React-Leaflet + react-leaflet-cluster (v2.1.0)
- **Charts:** Recharts (Settings panel histogram + venue popup trend chart)
- **Icons:** Google Material Symbols — Rounded, 400 weight, unfilled
- **File Parsing:** SheetJS (xlsx) — client-side Excel/CSV parsing
- **PDF Export:** jsPDF (lazy-loaded, 390KB)
- **Map Screenshot:** html2canvas (lazy-loaded, 202KB)
- **Population Heat Map:** leaflet.heat 0.2.0 (loaded from CDN at runtime — legacy plugin needs global `window.L`)
- **Population Zones:** topojson-client ^3.1.0 (ESM, tree-shakeable — only `feature()` used)
- **State:** React Context API
- **Persistence:** Neon Postgres via Vercel serverless API (all films, settings, overrides, contacts, API key, film catalogue). Theme only in localStorage (instant load before cloud fetch).
- **Backend Database:** Neon Postgres (serverless) — 8 tables: users, films, film_revenues, match_overrides, user_settings, venue_contacts, venues, film_catalogue
- **Backend API:** Vercel Serverless Functions (11 consolidated endpoints in /api directory)
- **Authentication:** Clerk (React SDK, email/password + Google sign-in) — Production instance, custom domain auth via clerk.cinescope.pro
- **Auth packages:** @clerk/clerk-react (frontend), @clerk/backend (API token verification), svix (webhook signature verification)
- **Database driver:** @neondatabase/serverless (HTTP-based, optimised for serverless)
- **AI Integration:** Anthropic Claude API (Sonnet, server-side proxy via /api/ai/report — API key stored in DB, never client-side)
- **Film Data:** TMDB API (The Movie Database) — server-side proxy via /api/tmdb (API key in Vercel env var, never client-side)
- **Build:** Vite
- **Hosting:** Vercel (connected to GitHub, auto-deploys on push)

---

## 3. Grading System (v1.4 → v1.5.2)

| Grade | Band | Default Percentile | Colour | Purpose |
|-------|------|-----------|--------|---------|
| A | Top performers | P75-P100 | Green | Best venues |
| B | Above average | P50-P75 | Yellow | Marketing target |
| C | Below average | P25-P50 | Orange | Marketing target (most growth potential) |
| D | Poor performers | Below P25 | Red | Underperformers |
| E | No screening | N/A | Grey | Auto-hidden on map when film selected |

B + C grades = primary marketing targets for improving distribution reach.

**Grade boundaries are configurable via Settings panel:**
- **Mode 1: Equal Quartiles (default)** — each grade = exactly 25% of venues
- **Mode 2: Custom Percentiles** — adjustable sliders for C/B/A thresholds
- **Mode 3: Fixed Revenue** — grade by specific £ amounts (e.g. A ≥ £5,000)
- **Auto-Suggest** — analyses revenue distribution, finds natural cluster gaps
- **Revenue histogram** — visual display of distribution with grade boundary lines

---

## 4. Data Sources

| Source | Description | Status |
|--------|-------------|--------|
| **Deluxe Venue List** | 946 venues (855 UK, 91 Ireland) — master venue database | ✅ Loaded |
| **Comscore Revenue Data** | 461 venues with ticket sales for NT Live TIOBE film | ✅ Verified |
| **ONS Population Density** | LSOA-level (~65K points) for heat map + MSOA-level (12,750 zones) for choropleth | ✅ Integrated into app |
| **ONS Census 2021 (E&W)** | MSOA-level demographics: Age (TS007A), Sex (TS008), Ethnicity (TS021), Religion (TS030), Tenure (TS054) | ✅ Downloaded & processed |
| **NRS Census 2022 (Scotland)** | OA-level demographics: Age (UV101b), Ethnicity (UV201), Religion (UV205), Tenure (UV403) | ✅ Downloaded & processed |
| **CSO Census 2022 (Ireland)** | SA-level SAPS: Age, Sex, Tenure (793 columns, 18,919 Small Areas). Ethnicity/religion not in SAPS. | ⏳ Age/Sex/Tenure parsed; Ethnicity/Religion pending separate download |
| **NISRA Census 2021 (NI)** | Data Zone level demographics (3,780 DZs). Bulk ZIPs downloaded but not yet parsed. | ⏳ Pending — 31 NI venues affected |
| **Council Politics** | council_politics.json — 961 venues, council name, party, colour, control type | ✅ Track 2 complete |
| **Venue Demographics** | venue_demographics.json — 15-mile catchment profiles for 841/1060 venues | ⏳ E&W + Scotland working; Ireland + NI pending |
| **Geocoding Coordinates** | Lat/lng for all venues | ✅ **COMPLETE** (see Section 5) |

### Comscore File Format
Row 0: `"Grosses By Theatre"` (report title)
Row 1: `"Film Title - Distribution Label Year (Type), The - Producer - Rating"` (film info)
Row 2: `"UK & Ireland, GB Pound £, ... Data from MM/DD/YYYY to MM/DD/YYYY"` (filters)
Row 3: Column headers (Theater, City, State, Circuit, etc.)
Row 4+: Data rows

**Parser extracts film title** from Row 1 by splitting on ` - ` separator and taking the first segment. Handles trailing articles (e.g. `"Sound Of Music, The"` → `"The Sound Of Music"`). User confirms/edits via dialog before import is finalised.

### Known Data Issue
"Phoenix" appears twice in Comscore data — East Finchley (£6,341) and Kirkwall (£836). Requires compound key (name + city) for matching. **FIXED** — now uses compound key throughout.

---

## 5. Venue Database — GEOCODING COMPLETE ✅

### Final Results (Deduplicated)
| Metric | Value |
|--------|-------|
| **Total venues geocoded** | 1,060 (raw) |
| **After deduplication** | **931** (unique physical locations) |
| **UK venues** | 843 |
| **Ireland venues** | 88 |
| **Flagged for review** | 51 (rebrands, name mismatches) |
| **Output file** | `src/data/venues.json` (in app) + `cinescope_venues_compact.json` (project) |

### Chain Breakdown (deduplicated)
| Chain | Count | Category |
|-------|-------|----------|
| Independent | 378 | Independent |
| Odeon | 117 | Large Chain |
| Cineworld | 95 | Large Chain |
| Vue | 92 | Large Chain |
| Everyman | 48 | Small Chain |
| Omniplex | 42 | Small Chain |
| Picturehouse | 27 | Small Chain |
| Merlin / Reel | 19 each | Small Chain |
| Curzon | 18 | Small Chain |
| IMC / Showcase | 16 each | Small Chain |
| Light Cinema | 14 | Small Chain |
| Savoy | 11 | Small Chain |
| Arc / Arc Cinema | 11 | Small Chain |
| Scott | 5 | Small Chain |
| Eclipse | 2 | Small Chain |

**Category totals:** Large Chain 304, Independent 378, Small Chain 249

---

## 6. React App — v3.4.0 (Admin Impersonation + UI Redesign)

### Project Structure
```
cinescope-app/
├── index.html                (+ Google Material Symbols font)
├── package.json
├── vite.config.js
├── README.md
├── api/                      (Vercel serverless functions)
│   ├── _lib/
│   │   ├── auth.js             (Clerk token verification + auto-create user + admin impersonation)
│   │   └── db.js               (Neon Postgres connection)
│   ├── films/
│   │   └── index.js            (GET/POST/DELETE — list, single, create, delete)
│   ├── overrides/
│   │   └── index.js            (GET/PUT/DELETE — list, upsert, delete)
│   ├── settings/
│   │   └── index.js            (GET/PUT — get all, upsert batch)
│   ├── ai/
│   │   └── report.js           (POST — Anthropic proxy with SSE streaming)
│   ├── contacts/
│   │   └── index.js            (GET/PUT/DELETE — resolve contact, upsert, delete override)
│   ├── tmdb/
│   │   └── index.js            (NEW: GET — TMDB search + movie details proxy)
│   ├── admin/
│   │   └── index.js            (NEW: GET — admin user list + current user info for impersonation)
│   ├── catalogue/
│   │   └── index.js            (NEW: GET/POST/PUT/DELETE — film catalogue CRUD)
│   └── webhooks/
│       └── clerk.js            (POST — user provisioning on sign-up/update/delete)
├── public/
│   ├── favicon.svg
│   └── data/
│       ├── population-heatmap.json        (1.82 MB — 64,555 weighted points)
│       ├── england-wales-msoa.json        (5.7 MB — 7,201 MSOA zones)
│       ├── scotland-iz.json              (2.7 MB — 1,279 Intermediate Zones)
│       ├── northern-ireland-sdz.json     (1.4 MB — 850 Super Data Zones)
│       └── ireland-ed.json              (3.2 MB — 3,420 Electoral Divisions)
└── src/
    ├── main.jsx              (ClerkProvider wrapper)
    ├── App.jsx               (SignedIn/SignedOut gate + AppContent wrapper)
    ├── index.css
    ├── components/
    │   ├── Header.jsx           (slim bar: logo, view name, settings, theme, user avatar menu + impersonation)
    │   ├── MapView.jsx          (theme-aware tiles, graded markers, clustering, population legend, VenuePopup)
    │   ├── VenuePopup.jsx       (enhanced popup: grade badge, rankings, per-film breakdown, trend chart, contacts)
    │   ├── PopulationHeatLayer.jsx  (leaflet.heat canvas overlay, CDN-loaded plugin)
    │   ├── PopulationZonesLayer.jsx (TopoJSON choropleth, Canvas renderer, hover tooltips)
    │   ├── AnalyticsPanel.jsx   (sortable table with revenue, film stats banner)
    │   ├── GradeSummary.jsx     (clickable grade cards, multi-select toggle)
    │   ├── SettingsPanel.jsx    (grade config + revenue format + API key)
    │   ├── ExportMenu.jsx       (CSV, PNG, PDF report + chain selector + AI toggle + chain report generation)
    │   ├── MatchReviewPanel.jsx (venue match review: 3 tabs + accept + manual reassignment — cloud overrides)
    │   ├── TrendPanel.jsx       (trend analysis: venue/chain/regional tabs + AI insights — cloud auth)
    │   ├── FilmNameDialog.jsx   (confirm/edit detected film name after Comscore import — v3.0: catalogue auto-match + link)
    │   └── Icon.jsx             (Material Symbols wrapper component)
    │   ├── FilmCatalogue.jsx    (NEW: Netflix-style poster grid overlay, filter/sort/search)
    │   ├── AddFilmModal.jsx     (NEW: TMDB search auto-complete + manual entry, two-step add flow)
    │   └── FilmDetailView.jsx   (NEW: film detail view with Overview/Performance/Financials tabs)
    ├── context/
    │   ├── AppContext.jsx       (cloud-backed: films, overrides, settings via apiClient; Clerk auth; admin impersonation; loading screen)
    │   └── ThemeContext.jsx     (light/dark theme, localStorage persistence — intentionally local for instant load)
    ├── utils/
    │   ├── apiClient.js         (cloud API wrapper — authenticated fetch, impersonation header, admin endpoints)
    │   ├── grades.js            (grade defs, configurable boundaries, histogram, auto-suggest)
    │   ├── comscoreParser.js    (SheetJS file parser + film name extractor + revenue aggregation)
    │   ├── venueMatcher.js      (v2: chain protection, confidence tiers — overrides passed as parameter, no localStorage)
    │   ├── exportUtils.js       (v1.11: CSV, PNG, PDF report — cover + film list, dashboard, AI, map, venue list)
    │   ├── formatRevenue.js     (£ formatting utility — whole pounds or 2 d.p.)
    │   ├── trendAnalysis.js     (venue/chain/regional trend computation across films)
    │   └── aiReport.js          (Claude API via server proxy — general insights + chain-tailored reports)
    └── data/
        └── venues.json          (931 deduplicated venues — full UK + Ireland)
```

### Features — All Working ✅

**Core Map & Grading**
- Interactive Leaflet map with 931 venues (full UK + Ireland coverage)
- OpenStreetMap tiles (light) / CartoDB dark tiles (dark mode)
- Colour-coded CircleMarkers (A green, B yellow, C orange, D red, E grey)
- Neutral blue markers when no film selected (all 931 venues visible)
- Marker clustering at wider zoom levels
- Venue popups on click — enhanced in v2.1.0 with: grade badge circle, national ranking (#X of Y venues), chain ranking (#X of Y [chain] venues, hidden for independents), per-film revenue breakdown with individual grade badges, unscreened films shown as grey E, Recharts mini trend chart (2+ films in combined view), contact management section (chain-default/venue-override model, inline editing)
- Grade E venues auto-hidden when film selected
- Light/dark dashboard theme toggle (saved to localStorage)
- **Venue deduplication (v2.0.2):** matchResult deduplicates by base venue identity after matching, preventing duplicate map pins and table rows when multiple Comscore entries resolve to the same physical cinema

**Grade System**
- Grade summary cards (clickable to toggle filter) — multi-select (e.g. A+C, B+D)
- **Grade card selected state (v2.0.2):** uses full grade colour fill + white text for high contrast in dark mode (previously used pastel bgColor which was invisible on dark backgrounds)
- Header grade buttons: A, B, C, D — individually toggleable, synced with sidebar cards
- Grade badge colours: A green, B yellow, C orange, D red, E grey (white text, bg="" fix for Bootstrap)
- Settings panel with 3 grade boundary modes (quartiles, custom %, fixed £)
- Settings panel grade preview boxes: full grade colour background + white text (v2.0.2 — was hardcoded #333/#666, invisible in dark mode)
- Revenue distribution histogram with grade boundary lines
- Auto-suggest boundaries (finds natural data clusters)
- Grade settings saved to cloud (persist across devices)
- Per-film grade recalculation on film switch

**Film Management**
- Film selector with year grouping, search, and "All Films (Combined)" aggregate
- Individual film delete (× button) and "Clear all saved films" option
- Comscore file import (SheetJS client-side parser for CSV/XLS/XLSX)
- Film name auto-detection from Comscore Row 1 (splits on ` - ` separator)
- Film name confirmation dialog — editable field shown after import
- Multi-screen revenue aggregation (auto-combines per-screen entries)
- **Cloud persistence** — imported films stored in Neon Postgres; accessible from any device after sign-in
- Selected film ID persisted to cloud settings
- Revenue display format toggle: whole pounds (£346) or two decimals (£345.67)

**Filters & Search**
- Chain filter dropdown (all 19 chains populated from live data)
- Category filter dropdown (Large Chain, Small Chain, Independent)
- Searchable, sortable venue table with revenue column
- Search box placeholder text visible in dark mode (v2.0.2 — CSS fix using `--cs-text-muted` variable)
- Film info banner showing title, venue count, total and average revenue
- Removed redundant header venue count badge (v2.0.2) — map overlay counter + sidebar table badge are sufficient

**Export Module** (code-split, lazy-loaded)
- CSV spreadsheet download (all visible columns)
- PNG map screenshot (high-res via html2canvas)
- Full PDF report (v1.11 — see PDF Report section below)
- **ExportMenu UI:** Chain selector dropdown for cover page, AI insights toggle with validation modal. Export button uses `outline-light` variant to match Import/Trends (v2.0.2 — was previously `outline-secondary` grey due to theme object comparison bug).
- **Chain-tailored AI reports (v1.11):** When a chain is selected, "Generate [Chain] Report" button appears in ExportMenu. Opens streaming modal with chain-specific Claude analysis (top performers, growth opportunities, chain vs network comparison). Report replaces general AI insights in PDF. Works with a single film (no trend data dependency). External-facing professional tone for sending to chain managers.
- **AI toggle flow:** Checks `aiReportText` (content), `aiReportFilmId` (matches current film), AND `aiReportChainName` (matches selected chain). If mismatch, shows validation modal with "Export without AI" / "OK, I'll generate first" options
- **Cover page film list (v1.11):** When "All Films (X combined)" is the selected view, individual film titles are listed below the heading on the cover page

**PDF Report (v1.11)** ✅
PDF page order: Cover → AI Insights (optional, general or chain-tailored) → Dashboard Charts → Map → Venue List

- **Cover page:** Navy background (#1A365D) with gold accents (#D4AF37). Film title, chain name, grade summary boxes with counts/percentages, key highlights panel (venues screened, total box office, marketing targets, top performer). Branded footer with version string. **v1.11:** When "All Films (X combined)" is selected, individual film titles listed below heading in 9pt italic.
- **Dashboard charts page:** Grade distribution horizontal bars (colour-coded per grade, percentage labels). Chain comparison ranked bars (top 15 chains by average revenue, colour-coded by performance quartile). All drawn with jsPDF primitives — no external charting dependency.
- **AI Insights pages (optional):** Either general Claude-generated narrative report (from TrendPanel, requires 2+ films) OR chain-tailored report (from ExportMenu, works with 1 film). Bold heading detection, inline bold segments, word-wrapping. Unicode sanitiser (`sanitiseForPDF()`) converts arrows, smart quotes, em dashes to ASCII equivalents for Helvetica compatibility. Multi-page continuation headers.
- **Map page:** Screenshot via html2canvas with compact grade boxes and film stats.
- **Venue list pages (v1.10):** Object-based column system with optimised widths for landscape A4. Grade colour dots (filled circle + coloured letter). Right-aligned bold revenue column. Zebra striping (soft blue-grey). Gold underline on column headers. Table header background. Multi-screen aggregation indicator `[+]`. Summary line below table (venue count + aggregation count). ASCII-safe truncation (`..` not Unicode ellipsis). Footer with rule line + branding on every page.
- **Page numbering:** Global post-processing pass adds "Page X of Y" to all pages except cover. Uses `pdf.setPage(i)` to revisit each page after full PDF is built.

**Venue Match Review Panel**
- Summary stats bar (total, high/medium/low confidence, overrides, chain warnings)
- Three tabs: Needs Review (medium), Unmatched (low), Matched (high)
- **One-click accept button** — confirms auto-matched venue instantly (Needs Review tab)
- **Edit/reassign on all tabs** — including Matched tab for correcting mistakes
- Chain-name protection via CIRCUIT_TO_CHAIN mapping (15 Comscore circuits)
- Cross-chain matches penalized by 30 points
- Manual reassignment: search + assign to different venue
- Dismiss: mark as intentionally unmatched
- Undo: revert to auto-matching
- Override persistence via cloud API (Neon Postgres)
- Auto-opens after Comscore import

**Trend Analysis (Phase 3)** ✅
- **Trends button** appears in header when 2+ films imported
- Four-tab modal: Venues, Chains, Regions, AI Insights
- **Venue Trends** — grade progression per cinema across films (e.g. D→C→B), filterable by direction (improving/stable/declining), searchable
- **Chain Trends** — bar chart + table comparing chains by average revenue/grade, trend direction
- **Regional Trends** — bar chart + table for 8 geographic regions (derived from lat/lng: London & SE, South West, Wales & West, Midlands, NW & Yorkshire, North East, Scotland, Ireland)
- **AI Insights** — Claude API integration (Sonnet model, server-side proxy with SSE streaming)
  - User adds their own Anthropic API key in Settings (stored server-side in user_settings table, never exposed to browser)
  - Requests proxied through /api/ai/report (Clerk-authenticated)
  - Sends compact trend summary to Claude, streams back narrative report
  - Report covers: executive summary, key findings, marketing opportunities, venues to watch, recommendations
  - Copy button to clipboard for pasting into emails/documents
  - `aiReportFilmId` tracked in AppContext to validate AI report matches current film selection
- Error boundary prevents rendering crashes from taking down the whole app

**Venue Contact Management (v2.1.0)** ✅
- Chain-default / venue-override contact model — chain venues (Odeon, Vue, etc.) inherit a shared contact; individual venues can override with their own
- Contact fields: Manager Name, Booking Contact Name, Booking Contact Email, Notes
- Resolution order: venue-specific override → chain default → empty (show "Add Contact")
- Inline editing in venue popup — fields expand into inputs, "Save" persists to cloud
- Chain-broadcast checkbox: "Apply to all [Chain] venues" (hidden for independents)
- "Custom contact" badge (blue) when venue has its own override; "Chain default" badge (grey) when inheriting
- "Reset to Chain Default" button deletes venue override, reverts to shared chain contact
- Contacts lazy-loaded per popup (one API call when marker clicked — no upfront load of 1,060 records)
- Cloud-persisted in Neon Postgres `venue_contacts` table (per-user, Clerk-authenticated)
- API: `/api/contacts` — GET (resolve with fallback), PUT (upsert), DELETE (remove venue override), GET with `?list=true` (list all chain contacts)

**Icons**
- Google Material Symbols — Rounded, 400 weight, unfilled (all site icons)

**Population Density Layer (Phase 2)** ✅
- Header dropdown toggle: Off / Heat Map / Area Zones
- Intensity slider (controls opacity for both modes, persisted to cloud settings, updates on release only — no lag)
- Population density legend (bottom-right, visible when either mode active)
- **Heat Map mode:** 64,555 weighted points rendered via leaflet.heat canvas overlay
  - Purple → blue → green → yellow → orange → red gradient
  - leaflet.heat loaded from CDN at runtime (2014 plugin needs global `window.L`)
  - Data lazy-loaded from `/data/population-heatmap.json` on first toggle, cached in state
- **Area Zones mode:** 12,750 choropleth polygons from 4 TopoJSON boundary files
  - Colour-coded by density: blue (< 500/km²) → green → yellow → orange → red (> 10k/km²)
  - Canvas renderer (`L.canvas()`) for smooth pan/zoom with 12,750 polygons
  - Hover tooltips showing zone name, region, population, density, area
  - Files lazy-loaded sequentially with progress indicator, cached after first load
  - Uses `topojson-client` (modern ESM package) for TopoJSON → GeoJSON conversion

### Bundle Sizes (Production Build — v2.0.0-beta)
| Chunk | Size | Notes |
|-------|------|-------|
| Main bundle (index) | 1,577 KB | All app code + dependencies (includes Clerk SDK) |
| index.es (vendor) | 159 KB | Core vendor libs |
| exportUtils | 18 KB | Lazy-loaded on first export |
| purify.es | 23 KB | DOMPurify |
| html2canvas | 202 KB | Lazy-loaded on first export |
| jsPDF | 390 KB | Lazy-loaded on first PDF export |
| CSS | 252 KB | All styles including Bootstrap |

---

## 7. Venue Matcher v2

### Chain Protection (CIRCUIT_TO_CHAIN)
Maps 15 Comscore circuit names to venue chains:
| Comscore Circuit | Maps To |
|---|---|
| Cineworld Cinemas | Cineworld |
| Odeon/UCI Cinemas | Odeon |
| Vue Entertainment | Vue |
| Everyman Media Group | Everyman |
| Picturehouse | Picturehouse |
| Curzon Cinemas | Curzon |
| National Amusement Corporation | Showcase |
| Light Cinemas | Light Cinema |
| Omniplex Holdings | Omniplex |
| Ward Anderson | Omniplex |
| Indp: UK/Ireland, Film Buyer, B F I, G1 | Independent |

Cross-chain matches (e.g. Vue venue matching to Odeon) are penalized by 30 points. Independent venues are exempt from chain filtering.

### Matching Algorithm (4-pass)
1. **Exact name match** — score 100
2. **Name + city compound** — score 98
3. **Token-based fuzzy** with chain penalty — score 50-90
4. **Chain prefix construction** (e.g. "Brighton" + "Cineworld Cinemas" → "Cineworld Brighton") — score 80-85

### Confidence Tiers
| Tier | Score | Colour | Action |
|------|-------|--------|--------|
| HIGH | ≥ 90 | Green | Auto-matched, no review needed |
| MEDIUM | 50-89 | Yellow | Needs manual review |
| LOW | < 50 | Red | Unmatched, needs assignment or dismissal |

### Override System
- Stored in Neon Postgres `match_overrides` table (per-user, Clerk-authenticated)
- Keyed by compound `comscore_theater + comscore_city` (UNIQUE constraint per user)
- Actions: `assign` (map to specific venue) or `dismiss` (intentionally skip)
- Passed as parameter to `matchVenues()` — no direct storage access in matcher
- Reverts available via undo button (DELETE /api/overrides?id=)
- Overrides persist across devices and sessions

---

## 8. Deployment

| Item | Details |
|------|---------|
| **Platform** | Vercel |
| **Live URL** | https://cine-scope-omega.vercel.app/ |
| **GitHub** | https://github.com/guy-stew/CineScope |
| **Branch** | `main` (auto-deploys on push) |
| **Build command** | `npm run build` (Vite) |
| **Issue resolved** | react-leaflet-markercluster@3.0.0-rc1 incompatible with react-leaflet v4; replaced with react-leaflet-cluster@2.1.0 |

---

## 9. Deliverables

| # | Deliverable | File | Status |
|---|-------------|------|--------|
| 1 | Project Brief v1.5 | CineScope_Project_Brief_v1.5.docx | ✅ |
| 2 | Architecture Diagram v1.5 | CineScope_Architecture_Diagram_v1_5.pdf | ✅ |
| 3 | Venue Matching Spreadsheet | CineScope_Venue_Matching_v2.xlsx | ✅ With Austin |
| 4 | Geocoded Venue Database | cinescope_venues_compact.json + venues.json | ✅ 931 venues |
| 5 | Geocoder Pipeline | cinescope-geocoder/ (zip) | ✅ |
| 6 | React App (live) | https://cinescope.pro/ | ✅ v3.0.0-alpha |
| 7 | Project Tracker | CineScope_Project.md | ✅ This file |
| 8 | Population Heat Map Data | population-heatmap.json (1.82 MB) | ✅ 64,555 points |
| 9 | Software Architecture Doc | — | ⏳ Planned |
| 10 | Comscore Import Module | comscoreParser.js + venueMatcher.js | ✅ v2 |
| 11 | Brief Addendum v1.5.1 | CineScope_Project_Brief_Addendum_v1_5_1.docx | ✅ |
| 12 | Export Module | exportUtils.js + ExportMenu.jsx | ✅ CSV+PNG+PDF (v1.11) |
| 13 | Match Review Panel | MatchReviewPanel.jsx | ✅ 3-tab UI + accept button |
| 14 | Population Choropleth Data | 4× TopoJSON files (13 MB total) | ✅ 12,750 zones |
| 15 | Population Data Status Doc | CineScope_Population_Data_Status.md | ✅ |
| 16 | Population Heat Map Component | PopulationHeatLayer.jsx (leaflet.heat CDN) | ✅ Live |
| 17 | Population Zones Component | PopulationZonesLayer.jsx (Canvas choropleth) | ✅ Live |
| 18 | Revenue Format Utility | formatRevenue.js | ✅ Whole pounds / 2 d.p. toggle |
| 19 | IndexedDB Film Persistence | filmStorage.js | ✅ → Replaced by cloud backend |
| 20 | Trend Analysis Engine | trendAnalysis.js | ✅ Venue/chain/regional trends |
| 21 | AI Report Generator | aiReport.js | ✅ Claude API via server proxy — general insights + chain-tailored reports |
| 22 | Trend Analysis Panel | TrendPanel.jsx | ✅ 4-tab UI + error boundary |
| 23 | Cloud API Client | apiClient.js | ✅ Authenticated API wrapper for all endpoints |
| 24 | Backend Architecture Doc | CineScope_Backend_Architecture_v1.docx | ✅ |
| 25 | Database Schema | 001_create_schema.sql | ✅ 5 tables in Neon Postgres |
| 26 | API Routes | api/ directory (5 serverless functions) | ✅ Films, overrides, settings, AI proxy, webhook |
| 27 | Cloud Migration Guide | MIGRATION_GUIDE.md | ✅ Step-by-step wiring instructions |
| 28 | Venue Contacts Migration | 002_add_contacts.sql | ✅ venue_contacts table (v2.1.0) |
| 29 | Venue Management Migration | 003_add_venues.sql | ✅ venues table + seed data (v2.2.0-alpha) |
| 30 | Film Catalogue Feature Plan | CineScope_Feature_Plan_v3_Film_Catalogue_TMDB.docx | ✅ Full design doc with schema, API, UI, build order |
| 31 | Film Catalogue Migration | 004_add_film_catalogue.sql | ✅ film_catalogue table + films.catalogue_id (v3.0.0-alpha) |
| 32 | TMDB Proxy | api/tmdb/index.js | ✅ Server-side search + details proxy |
| 33 | Catalogue API | api/catalogue/index.js | ✅ Full CRUD with computed metrics |
| 34 | Film Catalogue UI | FilmCatalogue.jsx + AddFilmModal.jsx + FilmDetailView.jsx | ✅ Netflix-style grid, TMDB search, detail view with 3 tabs |
| 35 | Catalogue-linked Import | FilmNameDialog.jsx (v3.0) | ✅ Fuzzy auto-match + manual catalogue linking |
| 36 | Admin Impersonation Migration | 005_add_admin.sql | ✅ is_admin column on users table (v3.4.0) |
| 37 | Admin API | api/admin/index.js | ✅ User list + current user info (v3.4.0) |

---

## 10. Population Density Data (Phase 2) — FULLY INTEGRATED ✅

### Heat Map Layer — `population-heatmap.json` (1.82 MB)
Format: `{ metadata: {...}, points: [[lat, lng, intensity], ...] }` — loaded by PopulationHeatLayer.jsx. 64,555 points, log-normalised intensity.

| Jurisdiction | Source | Zones | Vintage |
|---|---|---|---|
| England & Wales | ONS LSOA Population Density | 35,672 | Mid-2024 |
| Scotland | NRS Data Zone Estimates | 6,974 | Mid-2024 |
| Northern Ireland | NISRA Census 2021 | 3,780 | 2021 |
| Republic of Ireland | CSO Census 2022 SAPS | 18,129 | 2022 |

### Choropleth Layer — 4 TopoJSON files (13 MB total)
Each file contains simplified boundaries with embedded population/density properties (`cd`, `nm`, `pop`, `den`, `area`). Loaded by PopulationZonesLayer.jsx with Canvas renderer.

| File | Jurisdiction | Geography | Zones | Population | Size |
|---|---|---|---|---|---|
| `england-wales-msoa.json` | England & Wales | MSOA 2021 | 7,201 | 59,719,724 | 5.7 MB |
| `scotland-iz.json` | Scotland | Intermediate Zone 2011 | 1,279 | 5,546,900 | 2.7 MB |
| `northern-ireland-sdz.json` | Northern Ireland | Super Data Zone 2021 | 850 | 1,903,181 | 1.4 MB |
| `ireland-ed.json` | Republic of Ireland | Electoral Division 2022 | 3,420 | 5,149,139 | 3.2 MB |

### Implementation Notes
- **leaflet.heat compatibility:** The 2014 plugin expects `window.L` as a global, but Leaflet's ESM build (via Vite) doesn't set it. Solution: set `window.L = L` in the component, then load plugin from CDN via dynamic `<script>` tag. NOT installed via npm.
- **Canvas renderer for zones:** SVG rendering of 12,750 polygons caused severe pan/zoom lag. Switched to `L.canvas()` — renders all polygons to a single `<canvas>` element, dramatically faster.
- **Single shared tooltip:** Instead of binding 12,750 individual tooltips, one `L.tooltip()` instance follows the mouse and updates content on hover.
- **Data served from `/public/data/`:** Static files in Vercel, lazy-loaded on first toggle, cached in React state.

---

## 11. Backend Architecture (v2.0) — LIVE ✅

### Overview
Migration from browser-only storage (IndexedDB + localStorage) to a cloud-backed system. Enables cross-device access, data persistence beyond browser, and secure API key management.

### Architecture
| Component | Technology | Purpose |
|-----------|------------|---------|
| **Database** | Neon Postgres (serverless) | Persistent storage for all user data |
| **API Layer** | Vercel Serverless Functions | 11 consolidated REST endpoints in /api directory |
| **Authentication** | Clerk | Session management, login UI, token verification |
| **Frontend Client** | apiClient.js | Drop-in replacement for filmStorage.js |

### Database Schema (8 tables, deployed to Neon)
| Table | Purpose | Key fields |
|-------|---------|------------|
| `users` | Clerk user linkage + admin flag | clerk_id (unique), email, display_name, **is_admin** (boolean, default false) |
| `films` | Imported film metadata (Comscore) | user_id (FK), title, year, venue_count, total_revenue, catalogue_id (FK nullable) |
| `film_revenues` | Per-venue revenue data | film_id (FK CASCADE), venue_name, venue_city, revenue, match_method |
| `match_overrides` | Manual venue corrections (global per user) | comscore_theater, comscore_city, action (assign/dismiss) |
| `user_settings` | Key-value settings (JSONB) | setting_key, setting_value (replaces all localStorage) |
| `venue_contacts` | Booking contacts (chain + venue level) | user_id (FK), scope (chain/venue), chain_name, venue_name, venue_city, manager_name, booking_contact_name, booking_contact_email, notes |
| `venues` | Managed venue database (replaces static JSON) | user_id (FK), name, comscore_name, city, country, chain, category, lat, lng, status (open/closed), source (seed/manual/import) |
| `film_catalogue` | **NEW** Master film records with TMDB metadata | user_id (FK), title, year, status, tmdb_id, tmdb_data (JSONB), poster_path, certification, runtime, distribution_cost, production_cost |

Migration scripts: `001_create_schema.sql` (original 5 tables) + `002_add_contacts.sql` (venue_contacts) + `003_add_venues.sql` (venues) + `004_add_film_catalogue.sql` (film_catalogue + films.catalogue_id) + `005_add_admin.sql` (is_admin column on users). All safe to re-run (IF NOT EXISTS throughout).

### API Routes (deployed to Vercel — 10 functions)
| Route | Methods | Purpose |
|-------|---------|---------|
| `/api/films` | GET, GET?id=, POST, DELETE, DELETE?id= | List all, single film with revenues, create new (now accepts catalogueId), clear all, delete single |
| `/api/overrides` | GET, PUT, DELETE?id= | List all overrides, upsert override, remove override |
| `/api/settings` | GET, PUT | Get all settings, upsert batch |
| `/api/contacts` | GET, PUT, DELETE?id= | Resolve contact (venue→chain fallback), upsert contact, delete venue override |
| `/api/venues` | GET, GET?id=, GET?search=, POST, POST?bulk=true, PUT?id=, PATCH?id=, DELETE?id= | List all, single, search, add, bulk import, update, toggle status, delete |
| `/api/geocode` | GET?address=&postcode=&country= | OpenStreetMap Nominatim proxy (authenticated, rate-limited) |
| `/api/ai/report` | POST | Anthropic proxy with SSE streaming (API key server-side) |
| `/api/webhooks/clerk` | POST | Auto-provisions user records on Clerk sign-up/update/delete |
| `/api/tmdb` | GET?action=search&query=, GET?action=details&id= | **NEW** TMDB search + movie details proxy (API key server-side) |
| `/api/catalogue` | GET, GET?id=, POST, PUT?id=, DELETE?id= | **NEW** Film catalogue CRUD with TMDB metadata, linked imports, computed revenue |
| `/api/admin` | GET?action=me, GET?action=users | **NEW** Current user info (all users) + user list (admin only) for impersonation |

Note: Originally 7 function files (separate `[id].js` for films and overrides). Consolidated to 5 using query parameters (`?id=`). Contacts added in v2.1.0 (6th). Venues + geocode added in v2.2.0-alpha (7th + 8th). TMDB + catalogue added in v3.0.0-alpha (9th + 10th). Admin added in v3.4.0 (11th). Total: 11 out of 12 allowed on Vercel Hobby plan.

Shared utilities in `api/_lib/`: `db.js` (Neon connection), `auth.js` (Clerk token verification + auto-create user record + admin impersonation via `X-Impersonate-User-Id` header).

### Authentication Flow
1. ClerkProvider wraps entire app in main.jsx
2. SignedIn/SignedOut components gate access (RedirectToSignIn for unauthenticated users)
3. Every API route verifies Clerk session token via @clerk/backend verifyToken()
4. Clerk webhook at /api/webhooks/clerk creates user row on first sign-up
5. Clerk login page: hosted by Clerk (accounts.cinescope.pro), redirects back to app after sign-in

### Environment Variables (set in Vercel — PRODUCTION keys active)
| Variable | Purpose |
|----------|---------|
| `DATABASE_URL` | Neon Postgres connection string |
| `CLERK_SECRET_KEY` | Server-side Clerk token verification (sk_live_*) |
| `CLERK_WEBHOOK_SECRET` | Webhook signature verification (svix) — production endpoint |
| `VITE_CLERK_PUBLISHABLE_KEY` | Frontend Clerk SDK (pk_live_*) |
| `TMDB_API_KEY` | **NEW** TMDB API key for film metadata (server-side only) |

### Build Status
- [x] Database schema created in Neon (5 tables + indexes + constraints)
- [x] API routes deployed to Vercel (5 consolidated endpoints)
- [x] Clerk authentication live (login gate working)
- [x] Environment variables configured
- [x] apiClient.js written (in src/utils/)
- [x] **Wire apiClient into AppContext.jsx** — all films, settings, overrides, AI proxy now cloud-backed
- [x] Remove legacy localStorage/IndexedDB code (filmStorage.js deleted, all localStorage removed except theme)
- [x] Move Anthropic API key to server-side settings (stored in user_settings table, proxied via /api/ai/report)
- [x] Consolidate API routes (7 → 5 functions for Vercel Hobby plan limit)
- [x] Production Clerk keys (pk_live/sk_live deployed, custom domain cinescope.pro)
- [x] Clerk webhook endpoint configured (accounts.cinescope.pro, user.created/updated/deleted)
- [x] Google OAuth custom credentials (Google Cloud project "Webtest", Client ID + Secret in Clerk SSO)
- [x] Apple sign-in disabled (requires $99/year Apple Developer account — not needed for single-user app)
- [x] Venue contacts: venue_contacts table created (002_add_contacts.sql), /api/contacts deployed, apiClient methods added (v2.1.0)
- [x] Venues table: venues created (003_add_venues.sql), 1,060 venues seeded for all users, /api/venues + /api/geocode deployed, geocoder.js + apiClient methods added (v2.2.0-alpha)
- [ ] **Venue Manager UI** — modal with list/search/filter, add/edit form, geocoding, import tab (Stage 2 — next session)
- [x] Film catalogue: film_catalogue table created (004_add_film_catalogue.sql), catalogue_id added to films table, existing films auto-migrated (v3.0.0-alpha)
- [x] TMDB integration: /api/tmdb deployed, TMDB_API_KEY in Vercel env vars, search + details proxy working (v3.0.0-alpha)
- [x] Film Catalogue UI: FilmCatalogue.jsx + AddFilmModal.jsx + FilmDetailView.jsx, Header.jsx updated with Catalogue button (v3.0.0-alpha)
- [x] Comscore-catalogue linking: FilmNameDialog.jsx with auto-match + manual link, AppContext passes catalogueId, /api/films accepts catalogueId (v3.0.0-alpha)
- [x] **Film Catalogue: AI enhancement** — buildFilmProfileForAI() enriches general + chain AI prompts with cast, genres, keywords, cert, financials (v3.2.0-alpha)
- [x] **Film Catalogue: UI contrast polish** — Dark theme text contrast fixed across all catalogue modals (v3.1.0-alpha)
- [x] **Admin impersonation** — `is_admin` column, `auth.js` impersonation support, `/api/admin` endpoint, UserMenu + ImpersonationBanner in Header, apiClient impersonation header (v3.4.0)

### Migration Strategy (COMPLETED)
Cloud-only approach taken (no dual-write period). All data flows through apiClient.js → Vercel serverless → Neon Postgres. IndexedDB (filmStorage.js) deleted. localStorage removed for all except theme (kept local for instant load before cloud fetch). Rollback possible by reverting 7 source files to pre-v2.0.0 versions — old IndexedDB data still exists in users' browsers.

---

## 12. Austin's Confirmed Decisions

### Q1: Grading Metric → Revenue per Venue ✅
Grade on total revenue per venue, not per screen. Multi-screen aggregation built and tested.

### Q2: Grade Boundaries → Quartiles + Adjustable Settings ✅
Settings panel with three modes. Auto-suggest finds natural data clusters.

### Q3: Film Volume → 2–3 now, scaling to ~10/year ✅
Film selector with year grouping, search, and "All Films (Combined)" aggregate view.

### Q4: Review 51 Flagged Venue Rebrands ⏳
Awaiting Austin's review of the rebrand/closure list from geocoding.

---

## 13. Session History

| Date | Session | Summary |
|------|---------|---------|
| 23 Feb 2026 | Brief v1.0–v1.4 | Initial project brief, architecture, A-E grading system |
| 23 Feb 2026 | Data work | Comscore verification, venue matching spreadsheet, ONS research |
| 25 Feb 2026 | Geocoding runs | Cineworld (89), Odeon (partial), Vue (92) |
| 26 Feb 2026 | Platform pivot | Austin requested web app. Brief v1.5, architecture v1.5 |
| 26 Feb 2026 | Geocoding complete | Built geocoder script. 1,060 venues → 931 deduplicated |
| 26 Feb 2026 | React scaffold | Full app: map, import, matcher, film selector, theme, settings panel |
| 26 Feb 2026 | GitHub + deploy prep | Repo created, full 931-venue integration |
| **27 Feb 2026** | **Vercel deployment** | **Connected GitHub → Vercel. Fixed markercluster incompatibility. Live site.** |
| **27 Feb 2026** | **Export module** | **CSV + PNG + PDF with code-split lazy loading.** |
| **27 Feb 2026** | **Match review panel** | **Matcher v2: chain protection, confidence tiers, manual overrides. 3-tab review UI.** |
| **27 Feb 2026** | **v1.5.2 polish** | **Film name detection + confirm dialog. PDF map scaling fix. Material Symbols icons.** |
| **28 Feb 2026** | **Population heat map data** | **Downloaded & processed 64,555 population density points for UK+Ireland. Created population-heatmap.json.** |
| **28 Feb 2026** | **Population choropleth data** | **Downloaded & processed boundary polygons for 4 jurisdictions (12,750 zones). Created 4 TopoJSON files (13 MB total).** |
| **28 Feb 2026** | **Population layer integration** | **Integrated heat map + area zones into live app. leaflet.heat via CDN (ESM compat fix). Canvas-rendered choropleth with hover tooltips. Header dropdown toggle + intensity slider + density legend. Deployed as v1.6.0.** |
| **3 Mar 2026** | **v1.6.1 bug fixes** | **Currency format toggle (whole pounds/2 d.p.). Removed per-screen revenue. Multi-film venue popup aggregation. New formatRevenue.js utility. 8 files modified.** |
| **3 Mar 2026** | **v1.6.2 UI fixes** | **Grade badge colours fixed (Bootstrap bg="" override). Import button shortened. Multi-select grade filtering with synced header buttons + sidebar cards. Match review accept button + edit on Matched tab. 6 files modified.** |
| **3 Mar 2026** | **v1.7.0–v1.8.1 features** | **IndexedDB film persistence. Intensity slider fix. Trend analysis panel (venue/chain/regional + charts). AI Insights via Claude API (streaming). API key in Settings. Error boundary. 10 files (4 new, 6 updated).** |
| **3 Mar 2026** | **v1.9.0 PDF report redesign (Sections 1+2)** | **ExportMenu UI: chain selector for cover page, AI insights toggle with validation modal. AppContext: aiReportFilmId tracking. TrendPanel: wired setAiReportFilmId to shared context. exportUtils v1.9: professional cover page (branding, film title, chain, grade boxes, key highlights), dashboard charts page (grade distribution bars + chain comparison bars), AI insights pages with Unicode sanitiser for jsPDF Helvetica compatibility. PDF page order: Cover > AI (optional) > Dashboard > Map > Venue List. 4 files modified.** |
| **3 Mar 2026** | **v1.10.0 PDF venue list improvements (Section 3)** | **exportUtils v1.10: object-based column system with optimised landscape A4 widths, grade colour dots (filled circle + coloured letter), right-aligned bold revenue, zebra striping, gold underline on column headers, table header background, multi-screen aggregation indicator [+], summary line, ASCII-safe truncation, footer with rule line on every page, global page numbering (all pages except cover). 1 file modified.** |
| **3 Mar 2026** | **v1.11.0 chain AI reports + cover film list** | **Chain-tailored AI report generation in ExportMenu: "Generate [Chain] Report" button, streaming modal, chain-specific Claude prompt (external-facing tone for chain managers), works with single film (no trend dependency). buildChainDataForAI() builds venue breakdown + network comparison. aiReportChainName tracking for film+chain validation. Cover page film list for "All Films (combined)" view. Refactored _callClaude() shared streaming logic. 4 files modified (2 full replacements: aiReport.js, ExportMenu.jsx; 2 updated: AppContext.jsx, exportUtils.js).** |
| **4 Mar 2026** | **v2.0.0-alpha backend architecture** | **Cloud backend: Neon Postgres schema (5 tables) deployed. 12 Vercel serverless API routes (films CRUD, overrides, settings, AI proxy, Clerk webhook). Clerk authentication live — login gate working (email/Google/Apple). apiClient.js written as drop-in replacement for filmStorage.js. Environment variables configured in Vercel. npm packages: @neondatabase/serverless, @clerk/clerk-react, @clerk/backend, svix. Architecture document: CineScope_Backend_Architecture_v1.docx.** |
| **4 Mar 2026** | **v2.0.0-beta cloud wiring + deploy** | **Wired apiClient.js into all frontend code. 7 files replaced: AppContext.jsx (full rewrite — cloud loading, Clerk auth, async data flow, loading screen), venueMatcher.js (overrides as parameter, no localStorage), aiReport.js (server proxy via getToken), MatchReviewPanel.jsx (cloud override actions), TrendPanel.jsx (useAuth + hasApiKey), ExportMenu.jsx (useAuth + hasApiKey), SettingsPanel.jsx (server-side key text). filmStorage.js deleted. API routes consolidated from 7→5 functions (merged [id].js into index.js using ?id= query params) to fix Vercel Hobby plan 12-function limit. apiClient.js updated for query param URLs. Successfully deployed and live.** |
| **4 Mar 2026** | **Phase 3 Track 1 — demographic data pipeline** | **Designed UI split: floating map control bar (ON/OFF, Population, Politics, Intensity slider) replaces header controls; demographic breakdowns in venue popup (age, ethnicity, religion, sex, tenure). Downloaded census data for 3 of 4 jurisdictions: E&W (5 MSOA tables from Nomis + ONS centroids, 7,264 zones), Scotland (5 OA tables from NRS + PWC centroids, 46,363 zones), Ireland (SAPS CSV, 18,919 SAs — age/sex/tenure only, ethnicity/religion need separate CSO download). NI bulk ZIPs downloaded but NISRA URL pattern not yet cracked. Built build_venue_demographics.py — haversine 15-mile catchment, spatial bucket indexing, population-weighted averaging across all zones. Output: venue_demographics.json (566 KB, 841/1060 venues profiled). Known bugs: Ireland parser returned 0 zones (GEOGID filter issue), Scotland age percentages off (UV101b column index issue). NI not yet integrated (31 venues).** |
| **4 Mar 2026** | **Production Clerk + custom domain** | **Registered cinescope.pro (123-Reg). Added domain to Vercel (A record 216.198.79.1 + CNAME www). Created Clerk production instance — 5 DNS CNAME records (clerk, accounts, clkmail, clk._domainkey, clk2._domainkey) all verified at 123-Reg. SSL certificates issued. Updated Vercel env vars: VITE_CLERK_PUBLISHABLE_KEY (pk_live_*), CLERK_SECRET_KEY (sk_live_*), CLERK_WEBHOOK_SECRET (new production endpoint). Webhook configured at www.cinescope.pro/api/webhooks/clerk (user.created/updated/deleted). Google OAuth: custom credentials via Google Cloud project "Webtest" (Client ID + Secret in Clerk SSO connections). Apple sign-in disabled (requires $99/yr Apple Developer account). App live at cinescope.pro — old URL cine-scope-omega.vercel.app still works.** |
| **4 Mar 2026** | **v2.0.1 cloud import bugfix** | **Fixed POST /api/films 500 error — appFilmToCloud() was sending venueName: null / venueCity: null, violating NOT NULL constraint on film_revenues.venue_name in Neon Postgres. Fix: populate with Comscore theatre/city names at save time (venue matching updates later client-side). 1 file modified (AppContext.jsx, 2 lines).** |
| **5 Mar 2026** | **v2.0.2 venue dedup + dark mode polish** | **Austin testing revealed duplicate map pins and table rows when multiple films imported — each Comscore file's slightly different venue naming produced separate entries all matching to the same base venue. Added post-match deduplication step in AppContext.jsx matchResult useMemo (groups by base venue name\|city key, averages revenue in all-films mode, sums in single-film mode). Dark mode contrast fixes: search box placeholder colour via CSS variable, grade filter cards now use full grade colour fill + white text when selected (was pastel bgColor), settings panel grade preview boxes use grade colour background + white text (was hardcoded #333/#666). Removed redundant header venue count badge (map overlay + sidebar count sufficient). Fixed Export button always showing grey — was comparing theme object to string 'dark' (always false); now uses outline-light to match Import/Trends. 7 files modified: AppContext.jsx, GradeSummary.jsx, SettingsPanel.jsx, AnalyticsPanel.jsx, Header.jsx, ExportMenu.jsx, index.css.** |
| **5 Mar 2026** | **v2.1.0 venue contacts + enhanced popup** | **Feature 1: Venue Contact Management — new `venue_contacts` table in Neon Postgres (002_add_contacts.sql migration with unique index using COALESCE for NULL handling, auto-update trigger). New `/api/contacts` Vercel serverless function (GET resolve with venue→chain fallback, PUT upsert, DELETE venue override). 4 new methods in apiClient.js (getContact, saveContact, deleteContact, listChainContacts). Chain-default/venue-override model with inline editing, chain-broadcast checkbox, "Custom contact" badge, "Reset to Chain Default" button. Feature 2: Enhanced VenuePopup component — grade badge circle, national ranking (#X of Y), chain ranking (hidden for independents/single-venue chains), per-film revenue breakdown with individual grade badges (computed via calculateGrades per film), unscreened films shown greyed with E badge, Recharts mini trend chart (2+ films, combined view only), chronological film ordering via dateFrom. AppContext changes: added dateFrom to filmInfo in cloudFilmToApp(), enhanced venueFilmData useMemo with deduplication + per-film grade computation + gradeSettings dependency. MapView simplified to use VenuePopup component. SQL constraint fix: Postgres doesn't support COALESCE in UNIQUE constraints, switched to unique index. API import fix: initial contacts/index.js used wrong import names (verifyAuth/query) — fixed to use actual auth.js (authenticate) and db.js (getDb with tagged template literals). New files: VenuePopup.jsx, api/contacts/index.js, 002_add_contacts.sql. Modified files: MapView.jsx, AppContext.jsx, apiClient.js.** |
| **5 Mar 2026** | **v2.2.0-alpha venue management backend** | **Austin requested ability to add/edit/import venues and mark them as Open/Closed. Feature plan document created (CineScope_Feature_Plan_Venue_Management.docx). Stage 1 (backend) fully built and deployed: New `venues` table in Neon Postgres (003_add_venues.sql — 7th table, SERIAL PK, user_id scoped, comscore_name field, status open/closed, source tracking seed/manual/import, CHECK constraints on status/category/country/source, unique on user_id+name+city, auto-update trigger). Dropped old incompatible venues table from Feb 26 (had 1,062 rows but no user_id column). Seeded 1,060 venues for all 3 user accounts from cinescope_venues_compact.json — fixed Odeon Drumchapel null city (set to Glasgow). New `/api/venues` serverless function (GET all/single/search, POST single/bulk, PUT partial update, PATCH status toggle, DELETE). Bulk import validates per-row, reports duplicates, uses ON CONFLICT DO NOTHING. New `/api/geocode` proxy to OpenStreetMap Nominatim (authenticated, adds User-Agent header, falls back from address+postcode to postcode-only). New `src/utils/geocoder.js` client utility (single geocode + batch with 1.1s rate limiting + progress callback). 8 new methods appended to apiClient.js (getVenues, getVenue, searchVenues, addVenue, updateVenue, setVenueStatus, deleteVenue, importVenues). CineScope_Venue_Import_Template.xlsx created (12 columns, data validation dropdowns for Country/Category/Status, 2 example rows, Instructions sheet). Template placed in public/data/. API verified live — returns auth error correctly when hit without token. Next: Stage 2 (Venue Manager UI — modal with list/search/filter, add/edit form with geocoding + map preview, import tab with drag-and-drop). Files to share at start of next session: Header.jsx, AppContext.jsx, MapView.jsx.** |
| **6 Mar 2026** | **v3.0.0-alpha Film Catalogue & TMDB Integration** | **Major new feature: Film Catalogue with TMDB integration (Phase 3 Track 3). Austin requested ability to add pre-release films (before Comscore data exists) and enrich them with TMDB metadata for social media marketing planning. Feature plan document created (CineScope_Feature_Plan_v3_Film_Catalogue_TMDB.docx). Full 4-stage build completed in one session: Stage 1 (backend): New `film_catalogue` table in Neon Postgres (004_add_film_catalogue.sql — 8th table, UUID PK, 22 columns including tmdb_data JSONB for full API response, financial fields for ROI, unique constraint on user_id+tmdb_id). Added `catalogue_id` FK to existing `films` table (nullable, SET NULL on delete). Auto-migration creates catalogue entries for existing Comscore imports. New `/api/tmdb` serverless function (TMDB search + movie details proxy — API key in Vercel env var TMDB_API_KEY, never client-side). Uses `append_to_response=credits,keywords,release_dates` for single-call data fetch. Extracts UK BBFC certification, top 20 cast, key crew, keywords. New `/api/catalogue` serverless function (full CRUD — GET list/single with computed import_count and total_uk_revenue via subqueries, POST with duplicate TMDB check, PUT with dynamic partial updates via sql.unsafe(), DELETE with SET NULL cascade). Total: 10 serverless functions (of 12 Vercel Hobby limit). 9 new methods in apiClient.js (getCatalogue, getCatalogueEntry, createCatalogueEntry, updateCatalogueEntry, deleteCatalogueEntry, searchTMDB, getTMDBDetails, addFilmFromTMDB, tmdbImageUrl). Stage 2 (UI): FilmCatalogue.jsx — full-screen overlay with Netflix-style responsive poster grid (auto-fill, 180-200px cards), status filter pills with counts, sort dropdown (title/date/revenue/updated), search box. FilmCard inline component with TMDB poster (w342), gradient placeholder for films without posters, status badge, Comscore indicator (green tick/grey "No data"), revenue total, genre tags, certification badge. AddFilmModal.jsx — two-step flow: (1) TMDB search with 500ms debounced auto-complete showing poster thumbnails, year, rating, overview; (2) pre-populated review form with all TMDB fields editable + financial fields + notes. "Can't find it? Add manually" fallback for niche films. FilmDetailView.jsx — hero backdrop banner, poster, cast with circular profile photos from TMDB, crew, keywords as tag pills. Three tabs: Overview (TMDB richness), Performance (Comscore import table, venue count, revenue stats, ROI alert), Financials (editable cost fields, computed profit/loss, ROI percentage, delete with confirmation). Header.jsx updated: "Catalogue" button added alongside Import, FilmCatalogue component wired. AppContext.jsx updated: apiClient wrapper object exposed via useMemo (pre-binds getToken for 8 catalogue/TMDB methods). Stage 3 (Comscore linking): FilmNameDialog.jsx rewritten with "Link to Catalogue" section — loads catalogue entries on open, auto-matches detected Comscore title against catalogue using fuzzy token overlap scoring (strips common prefixes like "NT Live", normalises case, requires >40% overlap). Shows poster thumbnail and match confidence percentage. "Wrong film? Pick another" dropdown for manual selection. "Don't link" option. Button text changes to "Import & Link" when linked. AppContext.jsx: confirmImport() now accepts catalogueId parameter, appFilmToCloud() passes it through. api/films/index.js: POST accepts catalogueId, GET returns catalogue_id. Auth pattern bug: Initial catalogue and TMDB routes used try/catch auth pattern (`authenticate(req)` returning `auth.userId`) which didn't match existing routes (`authenticate(req, res)` returning `user` object). Fixed to match existing pattern. Migration partial failure: Original 004 migration created film_catalogue table but the DO $$ block that adds catalogue_id to films table was skipped (possibly due to the film_catalogue table not existing when first run, or a transaction boundary issue). Fixed manually via ALTER TABLE. Existing films linked to catalogue via manual SQL migration run.** |
| **7–8 Mar 2026** | **v3.1.0-alpha Catalogue CSS Polish + TMDB Linking + Unified Film Selector** | **Major CSS and feature session across two days. (1) Icons fix: 25 instances of `material-symbols-outlined` changed to `material-symbols-rounded` across FilmCatalogue.jsx, FilmDetailView.jsx, AddFilmModal.jsx — the catalogue components were using a different font variant than the one loaded in index.html. (2) Text contrast: comprehensive dark theme overrides for Bootstrap form elements, labels, input groups, tab navigation, close buttons, and dropdown options — scoped to catalogue modal, add-film modal, and film detail view. All with matching light theme overrides. (3) Catalogue header: lightened "Film Catalogue" title to #f0f0f0, replaced invisible Bootstrap closeButton with custom circular white ✕ button next to "+ Add Film". (4) Detail view width: content capped at max-width 890px via .film-detail-inner class for readable text width (hero backdrop stays full-width). (5) Edit button: now switches to Financials tab and includes editable Film Title field. (6) TMDB linking from edit mode: typing in the Film Title field triggers debounced TMDB search with poster+year+rating dropdown. Selecting a result immediately saves TMDB data to database via dedicated `?action=tmdb_link` endpoint, then reloads full film. Uses TMDB title, fills empty fields only (preserves user-entered data). Green "TMDB linked" badge confirms connection. (7) Critical bug discovery — `sql.unsafe()` JSONB failure: Neon's postgres driver silently fails to write JSONB data via `sql.unsafe()` (returns 200 OK but data never persists). Tagged template literals (`sql\`...\``) handle JSONB correctly. Solution: dedicated PUT `?action=tmdb_link` path in api/catalogue/index.js using tagged template for all TMDB fields. Standard field updates (title/status/costs/notes) still use `sql.unsafe()` without JSONB. New `linkCatalogueTMDB()` method in apiClient.js + AppContext wrapper. (8) Detail view layout fix: replaced React fragment with scrollable `div.film-detail-container` (height: 100vh, overflow-y: auto) — fixes tabs disappearing on re-entry. Hero text uses custom `.hero-muted` class instead of Bootstrap's `.text-muted`. (9) Import from detail view: enabled "Import Comscore Data" button in Performance tab — opens file picker, closes catalogue, triggers normal FilmNameDialog flow. (10) Unified film selector (Stage 1 of v4 feature plan): Film Catalogue is now the single source of truth. Header dropdown redesigned with poster thumbnails (32x48px from TMDB w92), green analysis checkboxes per film, "Selected Films (N of M)" combined view, Select All/Deselect All toggles. Films without Comscore data shown greyed out. No delete buttons or "Clear all" in header — deletion only via Catalogue detail Financials tab. AppContext: catalogue state lifted + shared, analysisSet in localStorage, toggleAnalysisFilm/selectAllAnalysis/clearAllAnalysis functions, refreshCatalogue() callable from mutations. FilmCatalogue.jsx: uses shared catalogue from context instead of own local state. Feature plan document created: CineScope_Feature_Plan_v4_Unified_Film_Selection.docx. Files modified: FilmDetailView.jsx, FilmCatalogue.jsx, AddFilmModal.jsx, Header.jsx, AppContext.jsx, apiClient.js, api/catalogue/index.js.** |
| **8 Mar 2026** | **v3.2.0-alpha Unified Film Selector Stages 2–4 + AI Enhancement + Trend Tooltips** | **Completed all remaining stages of the unified film selector feature plan plus AI enhancement. (1) Stage 2 — Catalogue Grid Checkboxes: Added checkbox overlay to FilmCard top-left corner (only for films with Comscore data), green border glow on selected cards (dark + light theme variants), "Analysis: N of M" counter + Select All / Deselect All buttons in catalogue toolbar. analysisSet and toggleAnalysisFilm pulled from AppContext into FilmCatalogue.jsx. Checkbox click uses stopPropagation so it doesn't open detail view. (2) Stage 2 — AnalysisSet Wiring: Combined "all-films" view in AppContext now filters importedFilms by analysisSet (only films whose catalogueId is in the set contribute to grades/map/analytics). Title changed from "All Films (N combined)" to "Selected Films (N combined)". Safety net: empty analysisSet falls back to all films. New Comscore imports auto-added to analysisSet on import. refreshCatalogue() fires after import so grid badges update. (3) Stage 3 — Unified Deletion: DELETE /api/catalogue now explicitly deletes linked films rows first (which cascade-deletes film_revenues), then removes catalogue entry. Returns deleted_imports count. New deleteFilmUnified() in AppContext cleans up all 3 states (importedFilms, catalogue, analysisSet + localStorage) in one call. FilmDetailView wired to unified delete. Confirmation text updated: "permanently remove catalogue entry and all linked Comscore import data. Cannot be undone." Button text: "Yes, delete everything." (4) Stage 4 — AI Enhancement: New buildFilmProfileForAI() in aiReport.js builds compact text from catalogue metadata (title, year, cert, runtime, genres, synopsis, top 5 cast with characters, director, keywords, TMDB rating, financials/ROI). Both system prompts updated to reference film profiles for contextual marketing suggestions. generateAIReport() accepts optional filmProfile parameter. generateChainAIReport() accepts optional catalogueEntry. TrendPanel.jsx fetches full catalogue entries (with tmdb_data) for each imported film before calling AI. ExportMenu.jsx looks up catalogue entry for chain reports. Both wrapped in try/catch so profile failures don't block reports. (5) Import title fix: confirmImport now uses catalogue entry title (not text box content) when catalogueId is provided — fixes "Unknown Film" appearing in popups when Comscore data linked to a catalogue entry. (6) Trend tooltips: All grade badges in TrendPanel (Venues, Chains, Regions tabs) upgraded from native title attributes to Bootstrap OverlayTrigger tooltips showing position number, film name, and revenue (venue tab). Cursor changes to help pointer on hover. Files modified: AppContext.jsx, FilmCatalogue.jsx, FilmDetailView.jsx, api/catalogue/index.js, aiReport.js, TrendPanel.jsx, ExportMenu.jsx. Header.jsx unchanged (already wired from Stage 1).** |
| **8 Mar 2026** | **v3.3.0 UI Redesign** | **Sidebar navigation + inline views. Major restructure of app shell. New components: Sidebar.jsx (collapsible Neon-style with Films/Venues/Map/Trends/Promote tabs, section labels, icon+label mode, tooltips when collapsed), MapPanel.jsx (right-side panel for Map view: film selector, grade cards, chain/category filters, search, venue list, venue count). Header.jsx completely rewritten: slim 48px bar, two-tone "CineScope" logo with v3.0 badge, view name breadcrumb, icon-only buttons (Settings, Theme). Film selector/chain filter/category filter/grade buttons/population dropdown all moved from Header to MapPanel + MapView overlay controls. App.jsx restructured: flex layout (header on top, sidebar left, main content right), view switching via currentView state. FilmCatalogue.jsx, VenueManager.jsx, TrendPanel.jsx refactored with `inline` prop — render as div instead of Modal when inline=true. ExportMenu moved from Header to TrendPanel inline toolbar. MapView.jsx: added MapResizer component, ZoomControl repositioned to bottomright, MapOverlayControls component. index.css: complete new layout system (cs-header, cs-sidebar, cs-main, cs-map-layout, cs-map-panel). AnalyticsPanel.jsx + GradeSummary.jsx superseded by MapPanel (files retained, no longer imported). Staged delivery: 6 stages.** |
| **9 Mar 2026** | **v3.4.0 Admin Impersonation** | **Developer super-admin feature: admins can "view as" any user account to diagnose issues without logging out. Database: `is_admin` boolean column added to `users` table (005_add_admin.sql migration). Server: `auth.js` rewritten to check `X-Impersonate-User-Id` header — if present and caller is admin, all data queries scope to target user (zero changes needed to existing API routes). New `/api/admin` serverless function (11th of 12 Vercel Hobby limit): `?action=me` returns current user info + admin status, `?action=users` returns full user list (admin only). Frontend: `apiClient.js` gains module-level impersonation state (`setImpersonateUserId`, `clearImpersonation`) — `apiFetch()` auto-attaches header when active. New `getMe()` and `getUsers()` methods. `AppContext.jsx`: new state (currentUserInfo, isAdmin, impersonating, allUsers), new actions (startImpersonation, stopImpersonation), `loadCloudData()` extracted as reusable function (called on mount + user switch), filters/selection reset on switch. `Header.jsx`: added UserMenu component (gradient avatar circle with initials, dropdown with Sign Out for all users + Switch User submenu for admins). ImpersonationBanner component (amber bar below header: "Viewing as [Name] — Exit"). Visual indicators: orange ring + pulse animation on avatar during impersonation. CSS: full user menu styles with light/dark theme support. Security: server enforces admin check (non-admins get 403), real caller's Clerk ID preserved for audit trail. 7 files: 005_add_admin.sql, auth.js (REPLACE), api/admin/index.js (NEW), apiClient.js (REPLACE), AppContext.jsx (REPLACE), Header.jsx (REPLACE), user-menu-styles.css (APPEND to index.css).** |

---

## 14. Version History

| Version | Date | Changes |
|---------|------|---------|
| v1.0 | 23 Feb | Project brief, A-E grading concept |
| v1.4 | 23 Feb | RAG replaced with A-E quartile grading |
| v1.5 | 26 Feb | Platform pivot to web (React + Leaflet) |
| v1.5.1 | 26 Feb | Settings panel (3 modes + histogram). Film selector (year groups + All Films). |
| **v1.5.2** | **27 Feb** | **Deployed to Vercel. Export (CSV/PNG/PDF). Match review panel with chain protection. Film name dialog. Material Symbols icons. PDF map scaling fix.** |
| **v1.6.0** | **28 Feb** | **Population density layer: Heat Map (64,555 points via leaflet.heat CDN) + Area Zones (12,750 choropleth polygons, Canvas renderer). Header dropdown toggle, intensity slider, density legend. topojson-client dependency added.** |
| **v1.6.1** | **3 Mar** | **Revenue format toggle (whole pounds/2 d.p.). Removed per-screen revenue. Multi-film venue popup aggregation. formatRevenue.js utility.** |
| **v1.6.2** | **3 Mar** | **Grade badge colours fixed (Bootstrap bg override). Import button shortened. Multi-select grade filtering (synced header buttons + sidebar cards). Match review accept button + edit on Matched tab.** |
| **v1.7.0** | **3 Mar** | **IndexedDB film persistence (filmStorage.js). Films survive browser sessions. Film selector delete buttons (individual + clear all). Selected film persisted to localStorage.** |
| **v1.8.0** | **3 Mar** | **Trend analysis panel (venue/chain/regional tabs + charts). AI Insights via Claude API (Sonnet, client-side streaming). API key management in Settings. trendAnalysis.js + aiReport.js + TrendPanel.jsx.** |
| **v1.8.1** | **3 Mar** | **TrendPanel error boundary + defensive rendering. Intensity slider fix (updates on release, not drag). Crash-safe trend computation.** |
| **v1.9.0** | **3 Mar** | **PDF report redesign. Cover page (navy/gold branding, film title, chain name, grade summary boxes, key highlights panel). Dashboard charts page (grade distribution horizontal bars, chain comparison ranked bars). AI insights Unicode sanitiser (arrows/smart quotes/em dashes safe for Helvetica). ExportMenu chain selector + AI toggle with validation modal. Page order: Cover > AI Insights > Dashboard > Map > Venue List.** |
| **v1.10.0** | **3 Mar** | **PDF venue list improvements (Section 3). Object-based column system with optimised landscape A4 widths. Grade colour dots (filled circle + coloured letter). Right-aligned bold revenue. Zebra striping. Gold underline + table header background. Multi-screen aggregation indicator [+]. Summary line. ASCII-safe truncation. Footer with rule line on every page. Global page numbering (Page X of Y, skips cover).** |
| **v1.11.0** | **3 Mar** | **Chain-tailored AI reports for PDF pitch packs. "Generate [Chain] Report" button in ExportMenu with streaming modal. Chain-specific Claude prompt (professional external tone for chain managers). Works with single film — no trend data dependency. buildChainDataForAI() provides venue breakdown, network comparison, grade distribution. aiReportChainName state for film+chain validation. Cover page film list: individual titles shown below heading for "All Films (combined)" view. Refactored _callClaude() shared streaming logic in aiReport.js.** |
| **v2.0.0-alpha** | **4 Mar** | **Cloud backend architecture. Neon Postgres: 5 tables (users, films, film_revenues, match_overrides, user_settings) with indexes, constraints, CASCADE deletes, auto-update triggers. Vercel serverless API: 12 endpoints (films CRUD, overrides upsert/delete, settings get/put, AI proxy with SSE streaming, Clerk webhook). Clerk authentication: login gate with RedirectToSignIn, hosted sign-in page (email + Google + Apple). apiClient.js: frontend API wrapper replacing filmStorage.js calls. Environment variables in Vercel (DATABASE_URL, CLERK_SECRET_KEY, CLERK_WEBHOOK_SECRET, VITE_CLERK_PUBLISHABLE_KEY). New dependencies: @neondatabase/serverless, @clerk/clerk-react, @clerk/backend, svix.** |
| **v2.0.0-beta** | **4 Mar** | **Cloud backend fully wired. 7 frontend files replaced to use apiClient.js + Clerk auth. All data (films, overrides, settings, API key) persisted to Neon Postgres. filmStorage.js deleted. AI reports proxied via server (/api/ai/report). API routes consolidated 7→5 for Vercel Hobby plan. Theme kept in localStorage for instant load. Deployed and live.** |
| **v2.0.0-beta** | **4 Mar** | **Production deployment. Custom domain cinescope.pro registered (123-Reg). Vercel DNS configured (A + CNAME). Clerk production instance created with 5 DNS CNAME records verified. Production API keys (pk_live/sk_live) deployed to Vercel env vars. Webhook endpoint updated to www.cinescope.pro. Google OAuth custom credentials (Google Cloud "Webtest" project). Apple sign-in disabled. Old URL cine-scope-omega.vercel.app still works as alias.** |
| **v2.0.1** | **4 Mar** | **Bugfix: Comscore imports failing with 500 error. appFilmToCloud() sent null venue_name/venue_city to Postgres (NOT NULL constraint on film_revenues). Now populates with raw Comscore theatre/city names at save time; venue matching updates later client-side. 1 file, 2 lines changed (AppContext.jsx).** |
| **v2.0.2** | **5 Mar** | **Venue deduplication: post-match grouping by base venue identity prevents duplicate map pins/table rows when multiple Comscore entries resolve to same cinema (averages revenue in all-films mode, sums in single-film). Dark mode contrast: search box placeholder uses CSS variable, grade filter cards use full colour fill + white text when selected, settings grade preview boxes theme-aware. Removed redundant header venue count badge. Fixed Export button colour (outline-light to match Import/Trends — was broken by theme object vs string comparison). 7 files modified.** |
| **v2.1.0** | **5 Mar** | **Venue contacts + enhanced popup. New venue_contacts table (6th table in Neon). /api/contacts serverless function. Contact management in popup: chain-default/venue-override model, inline editing, chain-broadcast checkbox, "Custom contact" badge, "Reset to Chain Default". Enhanced VenuePopup component: grade badge, national + chain rankings, per-film breakdown with individual grade badges, unscreened films, Recharts trend chart, contacts section. AppContext: dateFrom on filmInfo, enhanced venueFilmData with per-film grades + chronological sorting. 3 new files (VenuePopup.jsx, api/contacts/index.js, 002_add_contacts.sql), 3 modified (MapView.jsx, AppContext.jsx, apiClient.js).** |
| **v2.2.0-alpha** | **5 Mar** | **Venue management backend (Stage 1). New `venues` table (7th table in Neon) with user_id scoping, comscore_name, status (open/closed), source tracking. Migration 003_add_venues.sql with CHECK constraints (status, category, country, source), unique constraint on (user_id, name, city), auto-update trigger. 1,060 venues seeded for all users from cinescope_venues_compact.json. New /api/venues serverless function (GET/POST/PUT/PATCH/DELETE with search and bulk import). New /api/geocode proxy to OpenStreetMap Nominatim (rate-limited, User-Agent compliant). New src/utils/geocoder.js client utility with batch geocoding + progress callback. 8 new apiClient methods (getVenues, getVenue, searchVenues, addVenue, updateVenue, setVenueStatus, deleteVenue, importVenues). CineScope_Venue_Import_Template.xlsx created with data validation dropdowns + instructions sheet. Total: 8 serverless functions (of 12 Vercel Hobby limit). Feature plan document: CineScope_Feature_Plan_Venue_Management.docx.** |
| **v3.0.0-alpha** | **6 Mar** | **Film Catalogue & TMDB Integration (Phase 3 Track 3). New `film_catalogue` table (8th table in Neon, 004_add_film_catalogue.sql — 22 columns incl. tmdb_data JSONB, financial fields, unique on user_id+tmdb_id). `catalogue_id` FK added to `films` table. New /api/tmdb serverless function (search + details proxy, TMDB_API_KEY in Vercel env). New /api/catalogue serverless function (CRUD with computed import_count + total_uk_revenue). 9 new apiClient methods + tmdbImageUrl helper. Netflix-style FilmCatalogue.jsx overlay (responsive poster grid, status filters, sort, search). AddFilmModal.jsx (TMDB search with debounced auto-complete + manual fallback). FilmDetailView.jsx (hero backdrop, cast photos, 3 tabs: Overview/Performance/Financials with ROI calculator). FilmNameDialog.jsx rewritten with catalogue auto-match (fuzzy token overlap) + manual link dropdown. AppContext.jsx: apiClient wrapper exposed, confirmImport accepts catalogueId. Header.jsx: Catalogue button added. Total: 10 serverless functions (of 12 limit). Feature plan document: CineScope_Feature_Plan_v3_Film_Catalogue_TMDB.docx.** |
| **v3.1.0-alpha** | **7–8 Mar** | **Catalogue CSS polish + TMDB linking + unified film selector. Icons fix (25 × outlined→rounded). Dark theme text contrast across all catalogue modals. Catalogue header redesigned (lighter title, circular close button). Detail view 890px max-width. TMDB linking from edit mode (search-as-you-type in title field, immediate save). Critical fix: sql.unsafe() JSONB bug — dedicated `?action=tmdb_link` endpoint using tagged templates. Detail view scrollable container (fixes missing tabs). Import Comscore from Performance tab. Unified film selector: catalogue as single source of truth, poster thumbnails, analysis set checkboxes, Select All/Deselect All, no delete buttons in header. Feature plan: CineScope_Feature_Plan_v4_Unified_Film_Selection.docx.** |
| **v3.2.0-alpha** | **8 Mar** | **Unified Film Selector Stages 2–4 + AI Enhancement. Stage 2: Catalogue grid checkboxes (top-left overlay, green glow on selected, Select All/Deselect All in toolbar). AnalysisSet wired into combined view (only ticked films contribute to map/grades). Auto-add on import. Stage 3: Unified deletion — DELETE /api/catalogue now removes linked Comscore imports first. deleteFilmUnified() in AppContext cleans all states. Updated confirmation text + "Yes, delete everything" button. Stage 4: AI enhancement — buildFilmProfileForAI() enriches prompts with cast, genres, keywords, cert, financials. Both system prompts updated. TrendPanel + ExportMenu fetch catalogue entries for AI context. Bonus: Import title fix (uses catalogue title when linked). Trend panel tooltips (Bootstrap OverlayTrigger on all grade badges across Venues/Chains/Regions tabs showing film name + position + revenue).** |
| **v3.3.0** | **8 Mar** | **UI Redesign. Sidebar navigation (5 tabs: Films, Venues, Map, Trends, Promote). Films/Venues/Trends render inline (not modals). Header slimmed to logo + view name + icons. MapPanel replaces AnalyticsPanel. Map overlay controls (Population + Panel toggle). Two-tone logo. ExportMenu moved to Trends view.** |
| **v3.4.0** | **9 Mar** | **Admin Impersonation. `is_admin` column on users table (005_add_admin.sql). `auth.js` checks `X-Impersonate-User-Id` header (admin only). New `/api/admin` endpoint (user list + current user info). apiClient module-level impersonation header. AppContext: `startImpersonation`/`stopImpersonation` actions with full data reload. Header: UserMenu avatar + dropdown (Sign Out, Switch User for admins). ImpersonationBanner (amber bar + exit button). Orange ring + pulse on avatar when impersonating. 11 of 12 Vercel functions used.** |

---

## 15. Next Steps (Priority Order)

1. ~~Revenue aggregation~~ ✅
2. ~~Settings panel~~ ✅
3. ~~Full venue JSON (931)~~ ✅
4. ~~Film selector improvements~~ ✅
5. ~~Deploy to Vercel~~ ✅
6. ~~Export module (CSV+PNG+PDF)~~ ✅
7. ~~Match review panel~~ ✅
8. ~~Film name detection + dialog~~ ✅
9. ~~Material Symbols icons~~ ✅
10. ~~Download ONS population data~~ ✅ All 4 jurisdictions complete
11. ~~Population density data~~ ✅ Heat map + choropleth data ready
12. ~~Integrate population layer into app~~ ✅ Heat Map + Area Zones live (v1.6.0)
13. **⏳ Review flagged venues** — 51 rebrands (awaiting Austin)
14. ~~User testing with Austin~~ ✅ End-to-end import flow confirmed working
15. **📋 Population legend refinement** — Austin may want different density breakpoints after testing
16. ~~IndexedDB persistence (Phase 2)~~ ✅ → replaced by cloud backend (v2.0.0-beta)
17. ~~Trend analysis (Phase 3)~~ ✅ Venue/chain/regional trends + AI Insights (v1.8.0)
18. ~~Authentication~~ ✅ Clerk authentication live (login gate, hosted sign-in page)
19. ~~AI report in PDF export~~ ✅ Complete — cover page, dashboard charts, AI pages (v1.9.0), venue list (v1.10.0)
20. **📋 Software architecture document** — Deliverable #9
21. ~~Chain-tailored AI reports~~ ✅ Generates in ExportMenu, chain-specific prompt, works with single film (v1.11.0)
22. ~~Film list on cover page~~ ✅ Shows individual titles for "All Films (combined)" view (v1.11.0)
23. ~~Wire apiClient.js into AppContext.jsx~~ ✅ All data flows through cloud API (v2.0.0-beta)
24. ~~Move Anthropic API key server-side~~ ✅ Stored in user_settings, proxied via /api/ai/report (v2.0.0-beta)
25. ~~Production Clerk keys~~ ✅ Switched to production (pk_live/sk_live). Custom domain cinescope.pro. Google OAuth with custom credentials. Apple disabled.
26. ~~Phase 3 Track 3 (TMDB film research)~~ ✅ Film Catalogue with TMDB integration live (v3.0.0-alpha). Netflix-style UI, search, poster cards, cast, keywords, ROI calculator.
27. **⏳ Phase 3 Track 1 (demographic catchment profiles)** — Data pipeline built. venue_demographics.json has 841/1060 venues (E&W + Scotland). **Bugs to fix:** (a) Ireland SAPS parser returned 0 zones — GEOGID filter issue, (b) Scotland UV101b age column indexing off (Peterhead shows 85.6% under-25), (c) NI not yet integrated (31 venues, NISRA DZ data). **After data fix:** build floating map control bar + venue popup enrichment.
28. **📋 Phase 3 Track 2 COMPLETE** — council_politics.json (961 venues, 100% coverage)
29. **📋 Adjustable grade boundaries UI** — planned refinement
30. **📋 AI report PDF export** — export AI reports directly as standalone PDFs
31. **📋 Floating map control bar** — ON/OFF + Population + Politics + Intensity dropdown. Replaces header population controls. (Follows Track 1 data fix)
32. **📋 Political choropleth layer** — Wire council_politics.json into party-coloured zone overlay (needs boundary polygons)
33. **📋 Venue popup demographic panels** — Display catchment age/ethnicity/religion/sex/tenure + council info in venue popups
34. ~~Venue contacts + enhanced popup~~ ✅ Chain-default/venue-override contacts, grade badges, rankings, per-film breakdown, trend chart (v2.1.0)
35. **📋 Contacts management screen** — Dedicated page to view/edit all contacts by chain (API already supports `?list=true`)
36. **⏳ Venue Management UI (Stage 2)** — Venue Manager modal (cinema icon in header, searchable/filterable list, add/edit form with geocoding + Leaflet map preview, import tab with drag-and-drop + SheetJS parsing, download template link). Backend is live (v2.2.0-alpha). Files needed for next session: Header.jsx, AppContext.jsx, MapView.jsx.
37. **📋 Venue Management: Map Integration (Stage 4)** — Replace static JSON venue loading with /api/venues in AppContext. Grey markers + "CLOSED" badge for closed venues. Update venueMatcher to use comscore_name field.
38. **📋 Film Catalogue: AI Enhancement (Stage 4)** ~~Feed catalogue metadata into AI report prompt~~ ✅ buildFilmProfileForAI() enriches both general and chain AI reports with cast, genres, keywords, certification, financials. System prompts updated. TrendPanel + ExportMenu fetch full catalogue entries (v3.2.0-alpha).
39. ~~Film Catalogue: UI Polish~~ ✅ Text contrast fixed across all catalogue modals (v3.1.0-alpha). Icons fixed (material-symbols-rounded). Detail view 890px max-width. Hero contrast with custom `.hero-muted` class. Scrollable container.
40. ~~Film Catalogue: Comscore Import from Detail View~~ ✅ "Import Comscore Data" button live in Performance tab. Opens file picker, closes catalogue, triggers FilmNameDialog (v3.1.0-alpha).
41. **📋 Social Media Marketing (Phase 2)** — AI-generated Instagram/Facebook post suggestions using film metadata + cast images + keyword hashtags. Targeted audience profiles based on venue demographics. Campaign calendar suggestions. (Depends on catalogue + demographics being complete)
42. ~~Film Catalogue: TMDB Linking from Edit Mode~~ ✅ Search-as-you-type in title field, immediate save via `?action=tmdb_link`, poster/cast/synopsis auto-populated (v3.1.0-alpha).
43. ~~Unified Film Selector: Stage 2 (Catalogue Grid Checkboxes)~~ ✅ Checkbox overlay on FilmCard (top-left, green glow on selected). Select All / Deselect All in catalogue toolbar. "Analysis: N of M" counter. AnalysisSet wired into combined view — only ticked films contribute to map/grades/analytics. Auto-add on import. refreshCatalogue() after import (v3.2.0-alpha).
44. ~~Unified Film Selector: Stage 3 (Unified Deletion)~~ ✅ DELETE /api/catalogue removes linked Comscore imports first. deleteFilmUnified() cleans catalogue + importedFilms + analysisSet. Confirmation: "permanently remove... cannot be undone." Film deletion policy unchanged: Financials tab only (v3.2.0-alpha).
45. ~~Wire analysisSet into combined "All Films" view~~ ✅ Combined view filters by analysisSet. Title now "Selected Films (N combined)". Empty set falls back to all films as safety net (v3.2.0-alpha).
46. ~~Import title fix~~ ✅ confirmImport uses catalogue entry title when catalogueId is provided, not whatever was in the text box (v3.2.0-alpha).
47. ~~Trend panel grade tooltips~~ ✅ Bootstrap OverlayTrigger on all grade badges (Venues/Chains/Regions tabs) showing position number + film name + revenue. Cursor: help (v3.2.0-alpha).
48. ~~UI Redesign: Sidebar navigation~~ ✅ Collapsible sidebar with Films, Venues, Map, Trends, Promote tabs. Slim header. All views inline (v3.3.0).
49. **📋 UI Polish: VenueManager restyle** — Match mockup design: stat cards row (Total Venues, Chains, Closed, Avg Screens), reorganised toolbar (search left, Import+Add Venue right), clean table with chain badges + grade dots, pagination polish, light/dark theme consistency.
50. **📋 UI Polish: FilmCatalogue restyle** — Match mockup design: cleaner card grid, toolbar layout, better spacing and typography. Consistent with overall v3.0 design language.
51. **📋 UI Polish: TrendPanel restyle** — Match mockup design: summary stat cards (not bordered boxes), chart area, cleaner tab styling, consistent spacing.
52. **📋 Import button relocation** — Add Import Comscore functionality to Films view (currently removed from header; accessible via Film Catalogue > Add Film but direct Comscore import shortcut needed).
53. **📋 Promote view placeholder** — Rich placeholder content for future Social Media Marketing module (Facebook/Instagram campaigns, AI targeting, A/B testing).
54. **📋 Dead code cleanup** — Remove AnalyticsPanel.jsx, GradeSummary.jsx (superseded by MapPanel). Remove unused showTrends/setShowTrends from AppContext if no longer referenced.
55. ~~Admin Impersonation~~ ✅ Super-admin "view as" user switching. UserMenu avatar + dropdown, ImpersonationBanner, `auth.js` header check, `/api/admin` endpoint (v3.4.0).
56. **📋 Display names in Neon** — Populate `display_name` for all user rows so avatar initials and Switch User list show proper names (not just email).

---

## 16. Key Technical Notes

### PDF Export (jsPDF)
- **Page order:** Cover → AI Insights (optional, general or chain-tailored) → Dashboard Charts → Map → Venue List
- **jsPDF limitation:** Built-in Helvetica only supports Latin-1 characters. The `sanitiseForPDF()` function converts Unicode arrows (→), smart quotes, em dashes etc. to ASCII equivalents before rendering.
- **Cover page:** Navy background (#1A365D) with gold accents (#D4AF37). Grade boxes use `GRADES[x].color` via `hexToRgb()`. Key highlights panel uses slightly lighter navy (#0F2846). **v1.11:** When "All Films (combined)" selected, `filmTitlesList` array renders individual titles in 9pt italic below heading.
- **Dashboard charts:** All drawn with jsPDF primitives (roundedRect, text). No external charting dependency. Chain bars colour-coded by performance quartile (green > yellow > orange > red). Limited to top 15 chains.
- **AI toggle flow:** ExportMenu checks `aiReportText` (content), `aiReportFilmId` (matches current film), AND `aiReportChainName` (matches selected chain). If any mismatch, shows validation modal with "Export without AI" / "OK, I'll generate first" options.
- **Chain AI reports (v1.11):** Generated directly from ExportMenu (not TrendPanel). Uses `generateChainAIReport()` which calls `buildChainDataForAI()` to construct venue breakdown, network comparison, and grade distribution. Chain-specific Claude prompt uses professional external tone (suitable for sending to chain managers). Works with a single film — no dependency on trend data or 2+ films. Streaming modal shows report generation in real-time.
- **Venue list (v1.10):** Object-based column definitions (`{ header, w, align, trunc }`). Grade colour dots rendered via `pdf.circle()` + coloured text. Revenue column right-aligned and bold. Zebra striping on even rows (`[248,249,252]`). Gold underline on column headers. ASCII-safe truncation uses `..` instead of Unicode ellipsis for Helvetica compatibility. `[+]` marker after aggregated venue names.
- **Page numbering:** Global post-processing pass runs after entire PDF is built. Loops through all pages using `pdf.setPage(i)`, adds "Page X of Y" in bottom-right. Skips cover page (has bespoke footer).

### Population Layer
- **leaflet.heat:** Must be loaded from CDN (`https://unpkg.com/leaflet.heat@0.2.0/dist/leaflet-heat.js`) — NOT via npm. The 2014 plugin expects `window.L` as a global, which Vite's ESM bundling doesn't provide. Set `window.L = L` before loading.
- **Canvas renderer:** Essential for 12,750 choropleth polygons. SVG rendering causes severe pan/zoom lag. `L.canvas()` renders all polygons to a single `<canvas>` element.
- **TopoJSON:** Uses `topojson-client` (modern ESM package, tree-shakeable). Only `feature()` function imported (~3 KB contribution to bundle).

### Phase 3 Track 1 — Demographic Catchment Profiles

**UI Architecture (Austin-confirmed decisions):**
- **Floating control bar** (top-centre map overlay, replaces current header population controls):
  - ON/OFF toggle — kills all overlays
  - Population button — existing heat map
  - Politics button — choropleth coloured by council party
  - Intensity — dropdown/popover with slider inside
- **Venue popup** (click-to-view, all from 15-mile catchment):
  - Age breakdown (Under 25 / 25-44 / 45-64 / 65+)
  - Ethnicity breakdown (White / Asian / Black / Mixed / Other)
  - Religion breakdown (Christian / Muslim / Hindu / No religion / Other)
  - Sex breakdown (Male / Female)
  - Tenure breakdown (Owned / Rented)
  - Council name + political party (from council_politics.json)

**Data pipeline (build_venue_demographics.py):**
- Loads census zone data from all jurisdictions (MSOA centroids + demographic tables for E&W, OA centroids + tables for Scotland, SA centroids + SAPS for Ireland)
- For each venue, finds all zones within 15-mile (24.14 km) haversine radius
- Uses lat-band spatial bucketing (0.25° bands) for fast neighbour lookup
- Computes population-weighted percentage averages across all dimensions
- Outputs venue_demographics.json keyed by `"venue_name|lat,lng"`

**Census data sources used:**

| Jurisdiction | Geography | Zone Count | Tables | Source |
|---|---|---|---|---|
| England & Wales | MSOA 2021 | 7,264 | TS007A (age), TS008 (sex), TS021 (ethnicity), TS030 (religion), TS054 (tenure) | Nomis bulk CSV |
| Scotland | OA 2022 | 46,363 | UV101b (age+sex), UV201 (ethnicity), UV205 (religion), UV403 (tenure) | NRS OA data ZIP |
| Ireland | SA 2022 | 18,919 | SAPS (age, sex, tenure only — 793 columns per SA) | CSO Census 2022 |
| Northern Ireland | DZ 2021 | 3,780 | Pending — bulk ZIPs downloaded, DZ-level parsing not yet done | NISRA |

**Known bugs to fix next session:**
1. Ireland parser returned 0 zones — the SAPS GEOGID column starts with "A" for Small Areas but the filter `geogid.startswith('A')` may be failing due to CSV quoting or the first row being national-level ("IE0"). Need to debug.
2. Scotland UV101b age column indexing produces implausible results (e.g. 85.6% under-25 for Peterhead). The column order in the NRS CSV needs verification — metadata header rows may be throwing off the index.
3. Northern Ireland: NISRA Flexible Table Builder API returned 404s. The main statistics bulk ZIPs were downloaded (Phase 1 = 27 MB, Phase 2 = 8 MB) but contain Excel files at LGD level, not DZ level. Need to find DZ-level data (possibly via NISRA's Census Area Explorer or direct download links from the Data Zones geography page).
4. Ireland ethnicity + religion: Not included in the SAPS file. Need separate CSO downloads (likely from data.cso.ie or PxStat API).


### Domain & Clerk Production Setup
- **Domain:** cinescope.pro registered at 123-Reg (123-reg.co.uk)
- **DNS at 123-Reg:** A record `@` → `216.198.79.1` (Vercel), CNAME `www` → Vercel DNS, plus 5 Clerk CNAMEs: `clerk` → `frontend-api.clerk.services`, `accounts` → `accounts.clerk.services`, `clkmail` → `mail.cj59s7nuvv0t.clerk.services`, `clk._domainkey` → `dkim1.cj59s7nuvv0t.clerk.services`, `clk2._domainkey` → `dkim2.cj59s7nuvv0t.clerk.services`
- **Vercel domains:** `cinescope.pro` (307 redirect to www), `www.cinescope.pro` (primary production), `cine-scope-omega.vercel.app` (legacy alias, still works)
- **Clerk instances:** Development (frank-squid-70.accounts.dev — retained for local dev) and Production (accounts.cinescope.pro — live). Keys are environment-specific: `pk_test_`/`sk_test_` for dev, `pk_live_`/`sk_live_` for production.
- **Google OAuth:** Custom credentials via Google Cloud project "Webtest" (project ID: webtest-277417). Client ID + Client Secret configured in Clerk SSO connections. Authorized JS origin: `https://www.cinescope.pro`. Redirect URI: `https://clerk.cinescope.pro/v1/oauth_callback`. Consent screen app name: "CineScope".
- **Apple sign-in:** Disabled in production (requires $99/year Apple Developer Program membership). Can be re-enabled if needed.
- **Webhook:** Production endpoint at `https://www.cinescope.pro/api/webhooks/clerk` subscribed to `user.created`, `user.updated`, `user.deleted`. Signing secret updated in Vercel `CLERK_WEBHOOK_SECRET`.

### Cloud Data Flow (v2.0.0-beta)
- AppContext.jsx loads all data from cloud on mount (films, settings, overrides) via apiClient.js
- Loading screen shown while cloud fetch completes
- Film IDs are server-generated Postgres integers (replaced client-side `film-${Date.now()}`)
- Data transformations: `cloudFilmToApp()` and `appFilmToCloud()` convert between API format and app format
- Override changes in MatchReviewPanel trigger immediate re-matching via React state dependency
- Settings persist to cloud on every change (debounced where appropriate)
- Theme stays in localStorage (intentional — instant load before cloud fetch avoids flash of wrong theme)
- **Venue deduplication (v2.0.2):** After `matchVenues()` returns, a dedup step groups results by `name|city` key. Multiple Comscore entries matching the same base venue (due to naming variations across files) are merged: "All Films" mode averages revenue, single-film mode sums. Prevents duplicate map pins, table rows, and inflated grade counts. `selectedFilmId` added to matchResult dependency array.

### Dark Mode Pitfalls (v2.0.2)
- **ExportMenu theme bug:** `variant={theme === 'dark' ? ... : ...}` compared the theme *object* (from `useTheme()`) to a string — always evaluated to `false`. Fix: use `themeName` for string comparisons, or use a fixed variant since the header is always dark navy.
- **Search placeholder text:** Bootstrap's default light-grey placeholder was invisible on `#2a2f38` dark input background. Fixed via CSS: `.analytics-panel .form-control::placeholder { color: var(--cs-text-muted); }`
- **Grade card selected state:** `GRADES[x].bgColor` is a light pastel (designed for light mode backgrounds). In dark mode, pastel-on-dark is nearly invisible. Fix: use the full `GRADES[x].color` as background with white text when selected.
- **Settings grade preview:** Hardcoded `color: '#333'` and `color: '#666'` are invisible on dark surfaces. Fix: use white text on full-colour grade backgrounds.

### Backend / Cloud Architecture
- **Neon serverless driver:** Uses `@neondatabase/serverless` which makes HTTP-based queries — no persistent connection pool needed. Ideal for Vercel's ephemeral serverless functions.
- **Clerk token flow:** Frontend gets session token via `useAuth().getToken()` → sends as `Authorization: Bearer <token>` header → API routes verify with `@clerk/backend` `verifyToken()` → maps `clerk_id` to internal `users.id`.
- **Auto-create users:** If a Clerk user hits an API route before the webhook has fired (race condition), `auth.js` auto-creates the user record via INSERT ON CONFLICT DO NOTHING.
- **Batch revenue inserts:** POST /api/films uses PostgreSQL `unnest()` for efficient batch inserts of revenue rows (100 per batch) rather than individual INSERTs.
- **AI proxy streaming:** `/api/ai/report` reads the user's Anthropic API key from `user_settings` table (never exposed to browser), forwards to Anthropic API with `stream: true`, and pipes SSE chunks back via `res.write()`. Eliminates the `anthropic-dangerous-direct-browser-access` header.
- **Webhook security:** Clerk webhook at `/api/webhooks/clerk` verifies signatures using `svix` library. Raw body parsing required (bodyParser disabled via `export const config = { api: { bodyParser: false } }`).
- **Environment variables:** `VITE_` prefix required for any env var that needs to be visible to the frontend (Vite build). Only `VITE_CLERK_PUBLISHABLE_KEY` has this prefix. All others (DATABASE_URL, CLERK_SECRET_KEY, CLERK_WEBHOOK_SECRET) are server-side only.
- **@clerk/clerk-react vs @clerk/react:** The newer `@clerk/react` package has different exports and caused build failures. Stick with `@clerk/clerk-react` — it shows a deprecation warning but works correctly. Imports: `ClerkProvider`, `SignedIn`, `SignedOut`, `RedirectToSignIn` from `@clerk/clerk-react`.

### Venue Management Backend (v2.2.0-alpha)
- **Venues table:** 7th table in Neon Postgres. SERIAL primary key (not UUID — venues are simpler entities). user_id scoping means each user gets their own venue list (Austin and Guy both have 1,060 seeded). `comscore_name` field is the dedicated Comscore matching target — defaults to display name for seeded venues, but can be set independently for new venues where Comscore uses a different name.
- **Status field:** `open` or `closed` (CHECK constraint). Closing a venue is purely visual — historical Comscore data still matches and grades correctly. Re-opening is simply setting status back to `open`.
- **Source tracking:** `seed` (original 1,060 from JSON), `manual` (added via form), `import` (added via spreadsheet upload). Useful for auditing and for the cleanup command that clears seed data without touching manually-added venues.
- **Bulk import endpoint:** POST `/api/venues?bulk=true` validates per-row (reports specific errors per row number), deduplicates via ON CONFLICT DO NOTHING, and returns a structured response with inserted count, duplicates list, and validation errors. Batch inserts use PostgreSQL `unnest()` (same pattern as film_revenues).
- **Geocode proxy:** `/api/geocode` wraps OpenStreetMap Nominatim. Requires auth (prevents abuse). Adds `User-Agent: CineScope/2.0` header (Nominatim ToS requirement). Falls back from address+postcode to postcode-only if combined query fails. Returns structured results with address components.
- **Nominatim rate limiting:** 1 request/second enforced client-side in `geocoder.js` (1.1s delay between batch requests). For single venue additions this is invisible. For a 50-venue bulk import, geocoding takes ~55 seconds — UI should show a progress bar.
- **Old venues table:** An incompatible `venues` table existed from the Feb 26 geocoding session (1,062 rows, no user_id column). Had to be DROPped before creating the new schema. The old data was stale seed data only — no user modifications were lost.
- **Odeon Drumchapel:** The only venue in cinescope_venues_compact.json with a null city field. Fixed to "Glasgow" in the seed SQL. The JSON file itself should also be updated.
- **API route consolidation (Vercel Hobby plan):** Max 12 serverless functions on Hobby tier. Merged `films/[id].js` into `films/index.js` and `overrides/[id].js` into `overrides/index.js` using `?id=` query params instead of path params. Reduced from 7 to 5 function files. Contacts added as 6th function in v2.1.0. apiClient.js updated accordingly.
- **Contacts unique constraint:** Postgres does not support function expressions (COALESCE) inside a regular UNIQUE constraint — only inside a unique INDEX. Migration 002 uses `CREATE UNIQUE INDEX uq_contacts_scope ON venue_contacts (user_id, scope, chain_name, COALESCE(venue_name, ''), COALESCE(venue_city, ''))` to handle NULL venue_name/city for chain-level records.
- **Contacts upsert pattern:** Uses find-then-update-or-insert (SELECT existing → UPDATE or INSERT) rather than ON CONFLICT, because ON CONFLICT with COALESCE in the unique index is unreliable. The COALESCE in the WHERE clause mirrors the index definition.
- **VenuePopup Recharts in Leaflet:** react-leaflet's `<Popup>` component renders React children natively (unlike raw Leaflet popups which use DOM manipulation). No portal or createRoot hack needed — Recharts renders directly inside the popup JSX.
### Film Catalogue & TMDB Integration (v3.0.0-alpha)
- **film_catalogue table design:** Separates the concept of a "film" (master catalogue record with TMDB metadata, costs, status) from a "film import" (Comscore data snapshot in `films` table). Think of catalogue as the folder, Comscore imports as documents filed inside it. One catalogue entry can have multiple Comscore imports linked via `films.catalogue_id`.
- **tmdb_data JSONB column:** Stores the full TMDB API response (cast, crew, keywords, images, raw data). Future-proofs against needing new fields — no schema changes needed. At ~50-100KB per film, 1,000 films = ~100MB (well within Neon 0.5GB free tier).
- **TMDB API key security:** Stored as Vercel environment variable `TMDB_API_KEY`. Never reaches the browser. All TMDB calls proxied through `/api/tmdb` serverless function (authenticated via Clerk).
- **TMDB append_to_response:** Single API call to `/movie/{id}?append_to_response=credits,keywords,release_dates` returns everything needed (avoids multiple round-trips). UK certification extracted from `release_dates` array (finds GB entry, prefers theatrical type 3).
- **Catalogue GET list performance:** Returns lightweight records (no tmdb_data blob) with computed `import_count` and `total_uk_revenue` via correlated subqueries. Full tmdb_data only fetched for single-entry GET.
- **PUT dynamic updates:** Standard field updates (title, status, costs, notes) use `sql.unsafe()` with parameterised query building. **CRITICAL: `sql.unsafe()` silently fails to write JSONB data** — it returns 200 OK but data never persists. All TMDB/JSONB updates must use tagged template literals (`sql\`...\``). The dedicated `PUT ?action=tmdb_link` path handles this correctly.
- **TMDB linking from edit mode:** `handleTmdbSelect` in FilmDetailView calls `linkCatalogueTMDB()` which hits `PUT /api/catalogue?id=xxx&action=tmdb_link`. This immediately saves to DB (doesn't wait for Save button) and reloads the full film. Uses TMDB title, fills empty fields only (COALESCE in SQL for synopsis, genres, certification, runtime).
- **Cascade rule:** `films.catalogue_id` uses `ON DELETE SET NULL` — if a catalogue entry is deleted, Comscore imports survive (just lose their catalogue link). Protects against accidental data loss. **Planned change (v4):** unified deletion will explicitly delete linked imports before catalogue entry.
- **Film deletion policy:** Deletion only available from Film Catalogue → Film Detail → Financials tab. No delete buttons or "Clear all films" in the header dropdown. Prevents accidental data loss.
- **Unified film selector (v3.1.0):** Film Catalogue is the single source of truth. Header dropdown reads from shared `catalogue` state in AppContext (loaded on app startup). Analysis set (which films contribute to combined view) stored in localStorage as array of catalogue UUIDs. Default: all films with import_count > 0. Stale IDs cleaned on load.
- **Unique TMDB constraint:** `CREATE UNIQUE INDEX uq_catalogue_tmdb ON film_catalogue(user_id, tmdb_id) WHERE tmdb_id IS NOT NULL` — partial index prevents duplicate TMDB entries while allowing multiple manual entries (tmdb_id = NULL).
- **Auth pattern consistency:** All API routes must use `authenticate(req, res)` returning a `user` object with `user.id`. The alternative try/catch pattern (`authenticate(req)` returning `auth.userId`) does not match the existing `auth.js` helper and will cause 500 errors.
- **apiClient pattern:** CineScope uses standalone exported functions (`export async function getCatalogue(getToken)`) with a shared `apiFetch(path, options, getToken)` helper. NOT an object/class pattern. The AppContext exposes an `apiClient` wrapper object via `useMemo` that pre-binds `getTokenRef.current` so components can call `apiClient.getCatalogue()` without auth token plumbing.
- **Unified deletion (v3.2.0):** DELETE /api/catalogue now performs a two-step process: (1) delete all `films` rows where `catalogue_id = id` (which cascade-deletes their `film_revenues`), then (2) delete the catalogue entry itself. Both scoped by `user_id`. `deleteFilmUnified()` in AppContext handles the client-side cleanup: removes from `importedFilms`, `catalogue` state, and `analysisSet` (including localStorage). The `selectedFilm` useMemo naturally returns null when the underlying film is gone.
- **AnalysisSet wiring (v3.2.0):** The `selectedFilm` useMemo for `'all-films'` mode now filters `importedFilms` to only those whose `catalogueId` is in the `analysisSet`. Safety net: if `analysisSet` is empty, all films are included (prevents blank map). New imports are auto-added to the set via `confirmImport`. The combined view title reads "Selected Films (N combined)" to reflect selective inclusion.
- **Import title override (v3.2.0):** When `confirmImport` receives a `catalogueId`, it looks up the catalogue entry's title and uses that instead of whatever was in the FilmNameDialog text box. Prevents "Unknown Film" appearing in popups when the user forgot to edit the detected title before linking.
- **AI film profiles (v3.2.0):** `buildFilmProfileForAI()` in aiReport.js builds a compact text block from catalogue metadata: title, year, cert, runtime, genres, truncated synopsis (200 chars), top 5 cast with character names, director, keywords (up to 10), TMDB rating/popularity, and financial ROI data. Both system prompts tell Claude to use film profiles for contextual marketing suggestions (e.g. cast demographics for social media targeting). Profile lookup is wrapped in try/catch so failures don't block report generation.
- **Trend tooltips (v3.2.0):** Grade badges in TrendPanel use `OverlayTrigger` + `Tooltip` (aliased as `BTooltip` to avoid Recharts collision) instead of native `title` attributes. Venue tab shows "1. Film Name — £Revenue", chain/regional tabs show "1. Film Name". Position number confirms chronological order. `cursor: help` signals interactivity.
- **FilmNameDialog catalogue matching:** Uses fuzzy token overlap scoring (normalise → strip common prefixes like "NT Live" → split to tokens → count matching tokens / max tokens). Threshold: 40% overlap required for auto-match suggestion. Always shows match to user for confirmation.
- **Migration 004 partial failure:** The DO $$ block that adds `catalogue_id` to the films table may not run if the preceding CREATE TABLE has issues. Always verify with `SELECT column_name FROM information_schema.columns WHERE table_name = 'films' AND column_name = 'catalogue_id'` after running. Manual fix: `ALTER TABLE films ADD COLUMN IF NOT EXISTS catalogue_id UUID REFERENCES film_catalogue(id) ON DELETE SET NULL`.
- **TMDB image URLs:** Built via `https://image.tmdb.org/t/p/{size}{path}`. Common sizes: w92 (thumbnail), w185 (small card), w342 (catalogue grid), w500 (detail view), w780 (hero backdrop). `tmdbImageUrl()` helper exported from apiClient.js.
- **Catalogue status values:** `pre_release` (default for new films), `released` (TMDB status = Released), `screening` (currently in cinemas), `completed` (finished distribution run). CHECK constraint enforces valid values.
- **UI contrast (FIXED v3.1.0):** Dark theme modal backgrounds (#1a1a2e) required explicit CSS overrides for all Bootstrap form elements, labels, input groups, tab navigation, and close buttons. Scoped via `.add-film-modal`, `.film-catalogue-modal`, `.film-detail-body` class prefixes. Hero text uses custom `.hero-muted` class (rgba(255,255,255,0.65)) instead of Bootstrap's `.text-muted` which overrides to near-black. Detail view body pinned to `background: var(--cs-bg, #1a1a2e)`. Form controls use solid dark backgrounds (#1e2a45) not rgba() transparency. All with matching `[data-theme="light"]` overrides.

### UI Redesign Architecture (v3.3.0)
- **Layout model:** `cs-app-shell` is a flex column (header + body). `cs-body` is a flex row (sidebar + main). `cs-main` renders one view at a time based on `currentView` state in App.jsx.
- **View switching:** `currentView` is local React state in AppContent (not in AppContext). Values: 'map', 'films', 'venues', 'trends', 'promote'. Sidebar.jsx receives it as prop plus a callback.
- **Inline prop pattern:** FilmCatalogue, VenueManager, and TrendPanel all accept `inline` prop. When `inline=true`, they render content in a `<div>` instead of a `<Modal>`. This preserves the persistent header + sidebar. Sub-modals (FilmDetailView, AddFilmModal, VenueForm) still open as overlays on top.
- **MapPanel vs AnalyticsPanel:** MapPanel.jsx is the new right-side panel for the Map view. It contains the film selector, grade cards, filters, search, and venue list. AnalyticsPanel.jsx is no longer imported but the file remains in the project.
- **CSS namespacing:** New styles use `cs-` prefix (cs-header, cs-sidebar, cs-main, cs-map-panel, cs-map-ctrl-btn, etc.) to avoid collisions with existing Bootstrap classes. All v2.x styles preserved unchanged.
- **Sidebar collapse:** CSS transition on width (200px → 56px). Labels fade via opacity. Collapsed items show tooltips via CSS `::after` pseudo-element with `attr(title)`.
- **Map resize:** `MapResizer` component inside `<MapContainer>` watches `panelVisible` prop and calls `map.invalidateSize()` after 300ms delay, ensuring the map fills available space when the panel is toggled.
- **Header evolution:** v1.x had Bootstrap Navbar with all controls (film selector, filters, grades, population, import, export, trends, match review, settings, theme). v3.3.0 header has only: two-tone logo, view name, settings, theme toggle. v3.4.0 adds user avatar menu. Everything else moved to its relevant view.

### Admin Impersonation Architecture (v3.4.0)
- **Single-point auth swap:** `auth.js` is the only server-side file that needed changes. Because every API route calls `authenticate(req, res)` to get the user ID, adding impersonation support there means all 10 existing routes (films, venues, settings, overrides, catalogue, contacts, tmdb, geocode, ai/report, webhooks) automatically work with user switching — zero changes to those route files.
- **Header: `X-Impersonate-User-Id`:** When active, this custom header is attached to every API request by `apiClient.js`. The server-side `auth.js` checks: (1) is the header present? (2) is the real caller an admin (`is_admin = true` in users table)? (3) does the target user exist? If all pass, the returned `user.id` is swapped to the target — all data queries scope accordingly.
- **Security model:** Only users with `is_admin = true` in the Postgres `users` table can impersonate. The server enforces this — frontend cannot bypass. Non-admins sending the header get a 403 Forbidden. The real caller's `clerkId` is always preserved in the returned user object (useful for audit logging). The `/api/admin?action=users` endpoint is also admin-gated.
- **Module-level state in apiClient.js:** Impersonation uses a module-scoped variable (`let _impersonateUserId = null`) rather than React state. This ensures every API call — including those made outside React components (e.g. `apiFetch` in utility functions) — includes the header. The `setImpersonateUserId()` / `clearImpersonation()` exports control it.
- **Data reload on switch:** `startImpersonation()` in AppContext sets the apiClient header, then calls `loadCloudData()` (the same function used on initial mount). This reloads settings, venues, films, catalogue, overrides — the entire app re-renders with the target user's data. `stopImpersonation()` clears the header and reloads own data. Filters and selection are reset on switch to avoid stale state.
- **Visual indicators:** Three layers of warning during impersonation: (1) Avatar circle gets an orange `border-color` with a gentle CSS pulse animation (`cs-impersonate-pulse`). (2) Amber banner below the header reads "Viewing as [Name] — all data shown belongs to this account" with an Exit button. (3) Loading screen during switch says "Loading [Name]'s data... Switching user account".
- **Clerk hooks in Header:** v3.4 adds `useUser` (for display name/email) and `useClerk` (for `signOut()`) from `@clerk/clerk-react`. These were already available as dependencies — no new packages needed.
- **`/api/admin` is the 11th serverless function** out of 12 allowed on Vercel Hobby plan. One slot remains.
- **Display names:** The avatar shows initials extracted from `display_name` (preferred) or `email` (fallback). If user rows don't have `display_name` populated, run: `UPDATE users SET display_name = 'Austin Shaw' WHERE email = '...';`

---

*This file should be updated at the end of each session to maintain continuity.*
