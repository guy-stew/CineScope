# CineScope — Project Tracker

**Last updated:** 4 March 2026 (v2.0.0-beta — Production Clerk + custom domain cinescope.pro)
**Client:** Austin Shaw, Liberator Film Services
**Developer:** Guy
**Platform:** Web Application (React + Bootstrap, hosted on Vercel)
**Repository:** https://github.com/guy-stew/CineScope
**Live URL:** https://cinescope.pro/ (also accessible via https://cine-scope-omega.vercel.app/)

---

## 1. What Is CineScope?

A cinema performance analytics web application that maps and grades ~946 UK/Ireland cinema venues based on box office revenue data from Comscore. Designed for film distributors (starting with Liberator/Deluxe network) to identify high-performing venues, marketing targets, and underperformers on an interactive map when a specific film is selected. Delivered as a cloud-hosted React + Bootstrap single-page application accessible from any modern browser.

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
| **Database** | Neon Postgres (serverless, free tier) — schema deployed, 5 tables live |
| **Source control** | GitHub — https://github.com/guy-stew/CineScope |

### Technology Stack
- **Frontend:** React 18 (functional components + hooks)
- **UI Framework:** Bootstrap 5 (via React-Bootstrap)
- **Mapping:** Leaflet.js + React-Leaflet + react-leaflet-cluster (v2.1.0)
- **Charts:** Recharts (Settings panel histogram)
- **Icons:** Google Material Symbols — Rounded, 400 weight, unfilled
- **File Parsing:** SheetJS (xlsx) — client-side Excel/CSV parsing
- **PDF Export:** jsPDF (lazy-loaded, 390KB)
- **Map Screenshot:** html2canvas (lazy-loaded, 202KB)
- **Population Heat Map:** leaflet.heat 0.2.0 (loaded from CDN at runtime — legacy plugin needs global `window.L`)
- **Population Zones:** topojson-client ^3.1.0 (ESM, tree-shakeable — only `feature()` used)
- **State:** React Context API
- **Persistence:** Neon Postgres via Vercel serverless API (all films, settings, overrides, API key). Theme only in localStorage (instant load before cloud fetch).
- **Backend Database:** Neon Postgres (serverless) — 5 tables: users, films, film_revenues, match_overrides, user_settings
- **Backend API:** Vercel Serverless Functions (5 consolidated endpoints in /api directory)
- **Authentication:** Clerk (React SDK, email/password + Google sign-in) — Production instance, custom domain auth via clerk.cinescope.pro
- **Auth packages:** @clerk/clerk-react (frontend), @clerk/backend (API token verification), svix (webhook signature verification)
- **Database driver:** @neondatabase/serverless (HTTP-based, optimised for serverless)
- **AI Integration:** Anthropic Claude API (Sonnet, server-side proxy via /api/ai/report — API key stored in DB, never client-side)
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

## 6. React App — v2.0.0-beta (Cloud Backend Live)

### Project Structure
```
cinescope-app/
├── index.html                (+ Google Material Symbols font)
├── package.json
├── vite.config.js
├── README.md
├── api/                      (Vercel serverless functions)
│   ├── _lib/
│   │   ├── auth.js             (Clerk token verification + auto-create user)
│   │   └── db.js               (Neon Postgres connection)
│   ├── films/
│   │   └── index.js            (GET/POST/DELETE — list, single, create, delete)
│   ├── overrides/
│   │   └── index.js            (GET/PUT/DELETE — list, upsert, delete)
│   ├── settings/
│   │   └── index.js            (GET/PUT — get all, upsert batch)
│   ├── ai/
│   │   └── report.js           (POST — Anthropic proxy with SSE streaming)
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
    │   ├── Header.jsx           (film selector w/ delete, grade buttons, population toggle, trends button)
    │   ├── MapView.jsx          (theme-aware tiles, graded markers, clustering, population legend)
    │   ├── PopulationHeatLayer.jsx  (leaflet.heat canvas overlay, CDN-loaded plugin)
    │   ├── PopulationZonesLayer.jsx (TopoJSON choropleth, Canvas renderer, hover tooltips)
    │   ├── AnalyticsPanel.jsx   (sortable table with revenue, film stats banner)
    │   ├── GradeSummary.jsx     (clickable grade cards, multi-select toggle)
    │   ├── SettingsPanel.jsx    (grade config + revenue format + API key)
    │   ├── ExportMenu.jsx       (CSV, PNG, PDF report + chain selector + AI toggle + chain report generation)
    │   ├── MatchReviewPanel.jsx (venue match review: 3 tabs + accept + manual reassignment — cloud overrides)
    │   ├── TrendPanel.jsx       (trend analysis: venue/chain/regional tabs + AI insights — cloud auth)
    │   ├── FilmNameDialog.jsx   (confirm/edit detected film name after Comscore import)
    │   └── Icon.jsx             (Material Symbols wrapper component)
    ├── context/
    │   ├── AppContext.jsx       (cloud-backed: films, overrides, settings via apiClient; Clerk auth; loading screen)
    │   └── ThemeContext.jsx     (light/dark theme, localStorage persistence — intentionally local for instant load)
    ├── utils/
    │   ├── apiClient.js         (cloud API wrapper — authenticated fetch to all /api endpoints)
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
- Venue popups on click (name, city, chain, grade, revenue, revenue per screen)
- Grade E venues auto-hidden when film selected
- Light/dark dashboard theme toggle (saved to localStorage)

**Grade System**
- Grade summary cards (clickable to toggle filter) — multi-select (e.g. A+C, B+D)
- Header grade buttons: A, B, C, D — individually toggleable, synced with sidebar cards
- Grade badge colours: A green, B yellow, C orange, D red, E grey (white text, bg="" fix for Bootstrap)
- Settings panel with 3 grade boundary modes (quartiles, custom %, fixed £)
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
- Film info banner showing title, venue count, total and average revenue

**Export Module** (code-split, lazy-loaded)
- CSV spreadsheet download (all visible columns)
- PNG map screenshot (high-res via html2canvas)
- Full PDF report (v1.11 — see PDF Report section below)
- **ExportMenu UI:** Chain selector dropdown for cover page, AI insights toggle with validation modal
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
| 6 | React App (live) | https://cine-scope-omega.vercel.app/ | ✅ v2.0.0-beta |
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
| **API Layer** | Vercel Serverless Functions | 5 consolidated REST endpoints in /api directory |
| **Authentication** | Clerk | Session management, login UI, token verification |
| **Frontend Client** | apiClient.js | Drop-in replacement for filmStorage.js |

### Database Schema (5 tables, deployed to Neon)
| Table | Purpose | Key fields |
|-------|---------|------------|
| `users` | Clerk user linkage | clerk_id (unique), email, display_name |
| `films` | Imported film metadata | user_id (FK), title, year, venue_count, total_revenue |
| `film_revenues` | Per-venue revenue data | film_id (FK CASCADE), venue_name, venue_city, revenue, match_method |
| `match_overrides` | Manual venue corrections (global per user) | comscore_theater, comscore_city, action (assign/dismiss) |
| `user_settings` | Key-value settings (JSONB) | setting_key, setting_value (replaces all localStorage) |

Migration script: `001_create_schema.sql` — safe to re-run (IF NOT EXISTS throughout). Includes verification check, auto-update trigger on user_settings.updated_at, and CASCADE deletes.

### API Routes (deployed to Vercel — 5 functions)
| Route | Methods | Purpose |
|-------|---------|---------|
| `/api/films` | GET, GET?id=, POST, DELETE, DELETE?id= | List all, single film with revenues, create new, clear all, delete single |
| `/api/overrides` | GET, PUT, DELETE?id= | List all overrides, upsert override, remove override |
| `/api/settings` | GET, PUT | Get all settings, upsert batch |
| `/api/ai/report` | POST | Anthropic proxy with SSE streaming (API key server-side) |
| `/api/webhooks/clerk` | POST | Auto-provisions user records on Clerk sign-up/update/delete |

Note: Originally 7 function files (separate `[id].js` for films and overrides). Consolidated to 5 using query parameters (`?id=`) to stay within Vercel Hobby plan's 12-function limit.

Shared utilities in `api/_lib/`: `db.js` (Neon connection), `auth.js` (Clerk token verification + auto-create user record).

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
26. **📋 Phase 3 Track 3 (TMDB film research)** — Pending API key from Austin (themoviedb.org)
27. **⏳ Phase 3 Track 1 (demographic catchment profiles)** — Data pipeline built. venue_demographics.json has 841/1060 venues (E&W + Scotland). **Bugs to fix:** (a) Ireland SAPS parser returned 0 zones — GEOGID filter issue, (b) Scotland UV101b age column indexing off (Peterhead shows 85.6% under-25), (c) NI not yet integrated (31 venues, NISRA DZ data). **After data fix:** build floating map control bar + venue popup enrichment.
28. **📋 Phase 3 Track 2 COMPLETE** — council_politics.json (961 venues, 100% coverage)
29. **📋 Adjustable grade boundaries UI** — planned refinement
30. **📋 AI report PDF export** — export AI reports directly as standalone PDFs
31. **📋 Floating map control bar** — ON/OFF + Population + Politics + Intensity dropdown. Replaces header population controls. (Follows Track 1 data fix)
32. **📋 Political choropleth layer** — Wire council_politics.json into party-coloured zone overlay (needs boundary polygons)
33. **📋 Venue popup demographic panels** — Display catchment age/ethnicity/religion/sex/tenure + council info in venue popups

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

### Backend / Cloud Architecture
- **Neon serverless driver:** Uses `@neondatabase/serverless` which makes HTTP-based queries — no persistent connection pool needed. Ideal for Vercel's ephemeral serverless functions.
- **Clerk token flow:** Frontend gets session token via `useAuth().getToken()` → sends as `Authorization: Bearer <token>` header → API routes verify with `@clerk/backend` `verifyToken()` → maps `clerk_id` to internal `users.id`.
- **Auto-create users:** If a Clerk user hits an API route before the webhook has fired (race condition), `auth.js` auto-creates the user record via INSERT ON CONFLICT DO NOTHING.
- **Batch revenue inserts:** POST /api/films uses PostgreSQL `unnest()` for efficient batch inserts of revenue rows (100 per batch) rather than individual INSERTs.
- **AI proxy streaming:** `/api/ai/report` reads the user's Anthropic API key from `user_settings` table (never exposed to browser), forwards to Anthropic API with `stream: true`, and pipes SSE chunks back via `res.write()`. Eliminates the `anthropic-dangerous-direct-browser-access` header.
- **Webhook security:** Clerk webhook at `/api/webhooks/clerk` verifies signatures using `svix` library. Raw body parsing required (bodyParser disabled via `export const config = { api: { bodyParser: false } }`).
- **Environment variables:** `VITE_` prefix required for any env var that needs to be visible to the frontend (Vite build). Only `VITE_CLERK_PUBLISHABLE_KEY` has this prefix. All others (DATABASE_URL, CLERK_SECRET_KEY, CLERK_WEBHOOK_SECRET) are server-side only.
- **@clerk/clerk-react vs @clerk/react:** The newer `@clerk/react` package has different exports and caused build failures. Stick with `@clerk/clerk-react` — it shows a deprecation warning but works correctly. Imports: `ClerkProvider`, `SignedIn`, `SignedOut`, `RedirectToSignIn` from `@clerk/clerk-react`.
- **API route consolidation (Vercel Hobby plan):** Max 12 serverless functions on Hobby tier. Merged `films/[id].js` into `films/index.js` and `overrides/[id].js` into `overrides/index.js` using `?id=` query params instead of path params. Reduced from 7 to 5 function files. apiClient.js updated accordingly.
- **Windows PowerShell npm fix:** `Set-ExecutionPolicy -Scope CurrentUser -ExecutionPolicy RemoteSigned` required before npm commands work on Windows.

---

*This file should be updated at the end of each session to maintain continuity.*
