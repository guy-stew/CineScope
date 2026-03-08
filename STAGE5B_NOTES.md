# CineScope v3.0 — Stage 5b: Venues View Inline

## What this does
Converts the Venue Manager from a full-screen modal overlay to an inline view
that renders inside the main content area. Header and sidebar remain visible
when managing venues — same pattern as Films (Stage 5a).

## Files

| File | Action | Notes |
|------|--------|-------|
| `src/App.jsx` | **REPLACE** | Venues view now renders `<VenueManager inline />` in the main area |
| `src/components/VenueManager.jsx` | **REPLACE** | Added `inline` prop. When true, renders in a div. Modal mode preserved. |

## What changed in VenueManager.jsx
- New `inline` prop (defaults to `false` for backward compat)
- Refactored: extracted `headerContent` and `bodyContent` as JSX variables
- When `inline=true`: wraps in a div with `venue-manager-modal` class (reuses styles)
- When `inline=false`: wraps in `<Modal>` as before
- useEffect triggers on `inline` mount as well as `show` prop
- Header title uses `var(--cs-text)` in inline mode (respects theme)
- All internal views (list, add, edit, import) work in both modes

## What stays the same
- **VenueForm.jsx** — untouched
- **VenueImport.jsx** — untouched
- **All venue list, search, sort, pagination logic** — untouched
- **FilmCatalogue.jsx** — untouched (from Stage 5a)

## What to test
1. Sidebar Venues tab → venue list renders inline with header+sidebar visible ✓
2. Search, filter, sort, pagination all work ✓
3. Click Add Venue → VenueForm renders inline ✓
4. Click Edit → VenueForm pre-fills with venue data ✓
5. Click Import → VenueImport renders inline ✓
6. Back button in sub-views returns to list ✓
7. Light/dark theme works ✓
8. Sidebar highlights Venues tab ✓

## Next: Stage 5c
Convert TrendPanel to inline view (same pattern).
