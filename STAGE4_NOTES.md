# CineScope v3.0 — Stage 4: Trends via Sidebar

## What this does
The Trends sidebar tab now opens the existing TrendPanel full-screen modal
(same pattern as Films and Venues). If fewer than 2 films are imported,
a helpful placeholder message is shown instead.

## Files

| File | Action | Notes |
|------|--------|-------|
| `src/App.jsx` | **REPLACE** | Trends tab opens TrendPanel modal when 2+ films loaded; shows placeholder otherwise |
| `src/components/Header.jsx` | **REPLACE** | Removed Trends button (now sidebar). Remaining: Import, Export, Match Review, Settings, Theme |

## What stays the same
- **TrendPanel.jsx** — UNTOUCHED. Same component, same props
- **ExportMenu.jsx** — UNTOUCHED. Stays in header for now (map-dependent)
- **FilmCatalogue.jsx, VenueManager.jsx** — untouched (from Stage 3)
- **MapView.jsx, MapPanel.jsx** — untouched (from Stage 2 + hotfix)
- **Sidebar.jsx** — untouched (from Stage 1)
- **AppContext.jsx** — untouched
- **All utils** — no changes

## How it works
When Austin clicks **Trends** in the sidebar:

**If 2+ films imported:**
1. `currentView` changes to `'trends'`
2. `<TrendPanel show={currentView === 'trends' && hasTrendData} />` opens
3. Austin uses the trend panel as normal (venue/chain/regional tabs, AI insights, charts)
4. Closing returns to Map

**If 0-1 films imported:**
1. Shows a placeholder explaining how many films are needed
2. "0 of 2 films imported" or "1 of 2 films imported" badge

## What to test
1. With 2+ films: Sidebar Trends tab → opens TrendPanel full-screen ✓
2. With 0-1 films: Sidebar Trends tab → shows helpful placeholder ✓
3. Close TrendPanel → returns to Map ✓
4. All trend features work (venue/chain/regional tabs, charts, AI report) ✓
5. Header no longer has Trends button ✓
6. Header Export still works ✓

## What's left in the header
- **Import** — quick access for Comscore files
- **Export** — map/report exports (depends on current map state)
- **Match Review** — venue matching review (map-specific)
- **Settings** — grade boundaries
- **Theme toggle** — light/dark

## Next: Stage 5 — Final Cleanup
- Move Import, Export, Match Review from Header into their relevant views
- Add Promote placeholder content
- CSS polish + remove dead code (AnalyticsPanel, GradeSummary)
- Update CineScope_Project.md
