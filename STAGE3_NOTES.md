# CineScope v3.0 — Stage 3: Films & Venues via Sidebar

## What this does
The Films and Venues sidebar tabs now open their existing full-screen modals
(FilmCatalogue and VenueManager). Closing a modal returns to the Map view.
The Catalogue and Venue Manager buttons are removed from the header.

This is the zero-risk approach: both components (FilmCatalogue.jsx, VenueManager.jsx)
are completely unchanged. The only change is WHERE they're triggered from — sidebar
instead of header buttons.

## Files

| File | Action | Notes |
|------|--------|-------|
| `src/App.jsx` | **REPLACE** | Films tab → opens FilmCatalogue modal. Venues tab → opens VenueManager modal. Both close back to Map. |
| `src/components/Header.jsx` | **REPLACE** | Removed: Catalogue button, Venue Manager button, VenueManager/FilmCatalogue imports. Now just a clean bar with Import, Export, Trends, Match Review, Settings, Theme. |

## What stays the same
- **FilmCatalogue.jsx** — UNTOUCHED. Same component, same props, same styling
- **VenueManager.jsx** — UNTOUCHED. Same component, same props, same styling
- **AddFilmModal.jsx, FilmDetailView.jsx** — untouched (sub-modals of FilmCatalogue)
- **VenueForm.jsx, VenueImport.jsx** — untouched (sub-views of VenueManager)
- **AppContext.jsx** — untouched
- **Sidebar.jsx** — untouched (from Stage 1)
- **MapView.jsx, MapPanel.jsx** — untouched (from Stage 2)
- **index.css** — untouched (from Stage 2)
- **All utils** — no changes

## How it works
When Austin clicks **Films** in the sidebar:
1. `currentView` changes to `'films'`
2. Sidebar highlights the Films tab
3. `<FilmCatalogue show={currentView === 'films'} />` opens the existing full-screen modal
4. Austin uses the catalogue as normal (browse, add films, view details, import Comscore)
5. When he closes it (X button), `onHide` calls `setCurrentView('map')` → returns to Map

Same pattern for **Venues**:
1. `currentView` changes to `'venues'`
2. `<VenueManager show={currentView === 'venues'} />` opens
3. Closing returns to Map

## What to test
1. Sidebar Films tab → opens Film Catalogue full-screen ✓
2. Close Catalogue → returns to Map ✓
3. All catalogue features work (search, filter, sort, add film, TMDB, detail view) ✓
4. Sidebar Venues tab → opens Venue Manager full-screen ✓
5. Close Venue Manager → returns to Map ✓
6. All venue features work (list, search, add, edit, import) ✓
7. Header no longer has Catalogue or Venue Manager buttons ✓
8. Header Import button still works ✓
9. Sidebar correctly highlights active tab ✓

## Next: Stage 4 (was Stage 5)
Move TrendPanel, AI Insights, and Export into the Trends view.
Note: We combined the original Stages 3+4 into one since both use the same pattern.
