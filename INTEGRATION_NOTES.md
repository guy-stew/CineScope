# CineScope — Stage 4: Map Integration & Polish

## What's in this zip

```
src/
  context/
    AppContext.jsx       ← REPLACE (loads venues from API, adds refreshVenues)
  components/
    MapView.jsx          ← REPLACE (grey markers + Closed badge for closed venues)
    VenuePopup.jsx       ← REPLACE (adds CLOSED badge in popup header)
    VenueManager.jsx     ← REPLACE Stage 3 version (calls refreshVenues after changes)
  utils/
    venueMatcher.js      ← REPLACE (uses comscore_name as primary match target)
```

## What Changed and Why

### AppContext.jsx (task 16 — the big one)

**Before:** Loaded venues from `import venueData from '../data/venues.json'` — a static
file baked into the build. Venues never changed at runtime.

**After:** Loads venues from `GET /api/venues` during the cloud data loading sequence
(alongside settings, films, and overrides). Venues are now mutable via a new
`refreshVenues()` function that VenueManager calls after any add/edit/import/toggle.

Key changes:
- Removed `import venueData from '../data/venues.json'`
- Added `import * as venueApi from '../utils/venueApi'`
- `baseVenues` now loaded from API in `loadCloudData()` (step 2, before films)
- New `normaliseCloudVenue()` helper maps API shape → app shape
- New `activeVenues` memo filters to open-only venues (for matching)
- `matchResult` now matches against `activeVenues`, appends closed venues separately
- `filteredVenues` hides closed venues when a film is selected (unless explicitly filtered)
- New `refreshVenues()` callback exposed in context value
- Closed venues appear as grey markers with null grade

### MapView.jsx (task 17)

- Closed venues render as smaller grey markers (radius 6, opacity 0.45, thin border)
- Uses `venue.status` to determine styling — open venues are unchanged
- Map legend shows a "Closed" entry when closed venues are visible
- Marker key now uses `venue.city` for better uniqueness

### venueMatcher.js (task 18)

- Each venue now has a `comscore_name` field (from the venues table)
- **New Method 0: exact_comscore** — exact match on `venue.comscore_name` scores 100
  and takes highest priority, before falling back to display name matching
- Fuzzy token matching now scores against both `comscore_name` AND `name`, taking
  the better score. This means if Austin sets a venue's comscore_name to exactly
  match the Comscore report, it'll be a guaranteed 100% match with no fuzzy ambiguity.

### VenuePopup.jsx (task 17)

- Adds a red "CLOSED" badge below the subtitle when `venue.status === 'closed'`
- New `closedBadge` style in the styles object

### VenueManager.jsx (task 16/17)

- Now imports `useApp` and calls `refreshVenues()` after form saves, imports,
  and status toggles. This means the map updates immediately when Austin makes
  changes in the Venue Manager — no page refresh needed.


## Integration Steps

### 1. Drop the files in
Drag-and-drop overlay onto your project root.

### 2. Delete the static venue import (if not auto-resolved)
AppContext.jsx no longer imports `../data/venues.json`. The static file can stay in
your project as a fallback reference, but it's no longer loaded at runtime. If your
bundler warns about the unused import, you can safely ignore it.

### 3. The static JSON is still used for...
Nothing at runtime. But you may want to keep `cinescope_venues_compact.json` as a
backup reference. The seed migration script (from Stage 1) already populated the
database from it.

### 4. Test the flow
- Open CineScope — should load normally (venues now from API)
- Open Venue Manager → edit a venue name → save → close modal → map should reflect change
- Mark a venue as Closed → grey marker appears on map
- Import a Comscore file → matching should use comscore_name field
- Check VenuePopup for a closed venue → should show red CLOSED badge


## What's Next

All 4 stages of Venue Management are complete (tasks 1-20). The remaining work is:
- Task 19: End-to-end testing (manual)
- Task 20: Update CineScope_Project.md with version notes

After that, the next feature tracks are:
- **Contacts & Enhanced Popup** (v2.1 feature plan — Stages 1-3)
- **Phase 3 Track 1** demographics bug fixes (Ireland/Scotland/NI)
- **Phase 3 Track 3** TMDB film research (awaiting Austin's API key)
