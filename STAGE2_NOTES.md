# CineScope v3.0 — Stage 2: Map View Redesign

## What this does
Restructures the Map view with a proper control panel on the right side and overlay
controls on the map itself. Film selector, grade cards, chain/category filters, and
venue list now live in the Map's own panel instead of the header.

## Files

| File | Action | Notes |
|------|--------|-------|
| `src/App.jsx` | **REPLACE** | Map view uses MapView + MapPanel side by side (no more AnalyticsPanel) |
| `src/components/Header.jsx` | **REPLACE** | Removed: FilmSelector, chain/category dropdowns, grade buttons, population dropdown. Kept: Import, Catalogue, Export, Trends, Match Review, Venue Manager, Settings, Theme |
| `src/components/MapView.jsx` | **REPLACE** | Added overlay controls (Population toggle + Panel toggle). Accepts panelVisible/onTogglePanel props |
| `src/components/MapPanel.jsx` | **NEW** | Right-side panel: film selector, film banner, grade cards, filters, search, sorted venue list |
| `src/index.css` | **REPLACE** | Added: map layout, MapPanel, overlay controls CSS. All existing styles preserved |

## What stays the same
- **AppContext.jsx** — untouched. All state (selectedFilmId, filters, grades etc.) is the same
- **Sidebar.jsx** — from Stage 1, unchanged
- **VenuePopup.jsx** — unchanged, still renders in map marker popups
- **GradeSummary.jsx** — no longer used in Map view (replaced by inline grade cards in MapPanel), but file stays for potential use elsewhere
- **AnalyticsPanel.jsx** — no longer imported by App.jsx, but file stays (can be removed in cleanup)
- **All modals** — SettingsPanel, MatchReviewPanel, TrendPanel, FilmCatalogue, VenueManager all unchanged
- **All utils** — no changes

## How the Map view now works
```
┌─────────────────────────────────────────────────────────┐
│  Header (Import, Catalogue, Export, Trends, Settings)   │
├──────┬──────────────────────────────┬───────────────────┤
│      │ ┌─────────────────────────┐  │  Film selector    │
│      │ │ [Population] [Panel]    │  │  Film banner      │
│ Side │ │                         │  │  Grade cards      │
│ bar  │ │      Leaflet Map        │  │  Chain/Cat filter │
│      │ │                         │  │  Search           │
│      │ │    (markers + popups)   │  │  ─────────────    │
│      │ │                         │  │  Venue list       │
│      │ └─────────────────────────┘  │  (scrollable)     │
│      │                              │  ─────────────    │
│      │                              │  215 venues       │
└──────┴──────────────────────────────┴───────────────────┘
```

- **Film selector:** Simple dropdown at top of MapPanel. Reads from catalogue + importedFilms
- **Grade cards:** A/B/C/D toggle cards (clickable, multi-select). Same filtering as before
- **Filters:** Chain and Category dropdowns
- **Venue list:** Sorted by revenue (default desc), with sort buttons for Name/Revenue/Grade
- **Panel toggle:** Button in map overlay controls to show/hide the right panel
- **Population toggle:** Dropdown in map overlay controls (Off/Heat Map/Area Zones + intensity slider)

## What to test
1. Map view loads with panel on right ✓
2. Film selector dropdown works (changes film, map updates) ✓  
3. Grade cards filter venues on map + in list ✓
4. Chain/Category filters work ✓
5. Search filters venue list ✓
6. Clicking a venue in the list highlights it (setSelectedVenue) ✓
7. Clicking a marker on map opens VenuePopup ✓
8. Panel toggle button hides/shows the right panel ✓
9. Population toggle works (heatmap/zones/off + intensity) ✓
10. Light/dark theme still works ✓
11. Header buttons still work (Import, Catalogue, etc.) ✓
12. Sidebar view switching still works ✓

## Next: Stage 3
Convert FilmCatalogue from overlay/modal to standalone Films view.
Move Import button from Header into Films view.
