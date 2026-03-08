# CineScope v3.0 — Stage 1: Layout Shell

## What this does
Adds a collapsible sidebar navigation to the left side of the app with five views:
Films, Venues, Map, Trends, and Promote. The Map view is the default and contains
the existing MapView + AnalyticsPanel layout **exactly as before**. Other views
show placeholder cards. All header buttons still work normally.

## Files

| File | Action | Notes |
|------|--------|-------|
| `src/App.jsx` | **REPLACE** | New layout shell with sidebar + view switching |
| `src/components/Sidebar.jsx` | **NEW** | Collapsible sidebar navigation component |
| `src/index.css` | **REPLACE** | All existing styles preserved + new sidebar CSS added |

## What stays the same
- **Header.jsx** — completely unchanged. All buttons work (Import, Catalogue, Population, Trends, Match Review, Venue Manager, Settings, Theme toggle).
- **AppContext.jsx** — untouched. No state changes needed.
- **MapView.jsx, AnalyticsPanel.jsx, VenuePopup.jsx** — all untouched.
- **All modals** — SettingsPanel, MatchReviewPanel, TrendPanel, FilmNameDialog all still render as overlays.
- **All utils** — no changes to any utility files.

## How it works
- `App.jsx` manages `currentView` state locally (not in AppContext).
- Sidebar items switch views. Map is the default.
- Sidebar collapse button toggles between expanded (200px, icons + labels) and collapsed (56px, icons only). Collapsed state shows tooltips on hover.
- On mobile/tablet (<992px), sidebar auto-collapses to icons-only.
- The placeholder views tell Austin which header button to use in the meantime.

## What to test
1. App loads → Map view with sidebar visible on the left ✓
2. Click sidebar items → views switch ✓
3. Map view looks and works exactly as before ✓
4. All header buttons still work (Import, Catalogue, Trends, etc.) ✓
5. Collapse button → sidebar shrinks to icons ✓
6. Light/dark theme toggle works ✓
7. Modals open correctly (Settings, Match Review, etc.) ✓

## Next: Stage 2
Move film selector, chain/category/grade filters from Header into the Map view's
right panel. Add overlay controls (Population/Politics) to the map area.
