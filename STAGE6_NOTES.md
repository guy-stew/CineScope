# CineScope v3.0 — Stage 6: Visual Polish

## What this does
Brings the UI closer to the mockup design with a slim header, polished sidebar,
and consistent styling across all views.

## Files

| File | Action | Notes |
|------|--------|-------|
| `src/App.jsx` | **REPLACE** | Passes currentView to Header, removed dead code |
| `src/components/Header.jsx` | **REPLACE** | Complete rewrite: slim bar with logo + view name + icon buttons. No Bootstrap Navbar. |
| `src/components/Sidebar.jsx` | **REPLACE** | Uses CSS classes for active state instead of inline styles |
| `src/index.css` | **REPLACE** | New `.cs-header` styles, polished sidebar active states |

## Key visual changes
- **Header**: Now a slim 48px bar with custom CSS (no more Bootstrap Navbar). CineScope logo + view name on left. Icon-only buttons on right (Import, Export, Match Review, Settings, Theme). Much cleaner.
- **Sidebar active state**: Uses dedicated `.cs-sidebar__item--active` CSS class with teal highlight.
- **View name breadcrumb**: Header shows current view (e.g. "Film Catalogue", "Map", "Venue Manager").
- **Import status**: Shows as small coloured icon (spinning, green tick, red error) instead of large Bootstrap badges.

## What stays the same
- **FilmCatalogue.jsx** — untouched (from Stage 5a)
- **VenueManager.jsx** — untouched (from Stage 5b)
- **TrendPanel.jsx** — untouched (from Stage 5c)
- **MapView.jsx, MapPanel.jsx** — untouched
- **ExportMenu.jsx** — untouched (now renders inside slim header)
- **AppContext.jsx** — untouched
- **All utils** — no changes

## What to test
1. Header is slim with logo + "Map" view name ✓
2. Switch views → view name updates in header ✓
3. Import icon works (file picker opens, status shows) ✓
4. Export dropdown works in new header ✓
5. Settings gear icon works ✓
6. Theme toggle icon works ✓
7. Match Review icon shows (with badge) when film loaded ✓
8. Sidebar active state shows teal highlight ✓
9. Sidebar hover state works ✓
10. All five views still work (Map, Films, Venues, Trends, Promote) ✓
