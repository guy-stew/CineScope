# CineScope v3.0 — Stage 5a: Films View Inline

## What this does
Converts the Film Catalogue from a full-screen modal overlay to an inline view
that renders inside the main content area. The header and sidebar remain visible
when browsing films — matching the mockup design.

## Files

| File | Action | Notes |
|------|--------|-------|
| `src/App.jsx` | **REPLACE** | Films view now renders `<FilmCatalogue inline />` in the main area |
| `src/components/FilmCatalogue.jsx` | **REPLACE** | Added `inline` prop. When true, renders in a div instead of Modal. All styles preserved. |

## What changed in FilmCatalogue.jsx
- New `inline` prop (defaults to `false` for backward compat)
- Refactored into sub-components: `CatalogueShell`, `CatalogueBody`, `CatalogueStyles`
- `CatalogueShell`: when `inline=true`, wraps content in a div with class `film-catalogue-modal`
  (reuses all existing CSS selectors). When `inline=false`, wraps in a `<Modal>` as before.
- Close button hidden in inline mode (no need — sidebar switches views)
- Title colour uses `var(--cs-text)` instead of hardcoded `#f0f0f0` (respects theme)
- FilmDetailView sub-view still opens as a modal overlay (drill-down from clicking a card)
- useEffect triggers on `inline` mount as well as `show` prop

## What stays the same
- **FilmCard component** — untouched
- **AddFilmModal** — untouched (still a sub-modal)
- **FilmDetailView** — untouched (still opens as modal overlay from card click)
- **All catalogue styling** — preserved. Uses same `.film-catalogue-modal` class
- **All other components** — untouched

## What to test
1. Sidebar Films tab → catalogue renders inline with header+sidebar visible ✓
2. Film cards display correctly (posters, badges, checkboxes) ✓
3. Search, filter, sort all work ✓
4. Click a film card → FilmDetailView opens as modal overlay ✓
5. Back/close from FilmDetailView → returns to catalogue grid ✓
6. Add Film button → AddFilmModal opens ✓
7. Analysis set checkboxes work ✓
8. Light/dark theme works correctly ✓
9. Sidebar highlights Films tab ✓

## Next: Stage 5b
Convert VenueManager to inline view (same pattern).
