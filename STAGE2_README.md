# CineScope v3.0.0 — Stage 2: Film Catalogue UI

## What's in this package

```
src/components/
  FilmCatalogue.jsx    — Main overlay (Netflix-style grid, filter/sort, search)
  AddFilmModal.jsx     — TMDB search with auto-complete + manual entry fallback
  FilmDetailView.jsx   — Full film detail view (Overview, Performance, Financials tabs)
```

## Deployment Steps

### Step 1: Drop the component files

Copy the 3 JSX files into `src/components/` alongside your existing components.

### Step 2: Wire into Header.jsx

In your `Header.jsx`, you need to:

1. Import the FilmCatalogue component
2. Add a state variable for showing/hiding it
3. Replace the "Import" button with a "Film Catalogue" button

Here's what to change:

```jsx
// At the top of Header.jsx, add the import:
import FilmCatalogue from './FilmCatalogue';

// Inside the Header component, add state:
const [showCatalogue, setShowCatalogue] = useState(false);

// Replace the existing Import button with:
<Button
  variant="outline-light"
  size="sm"
  className="d-flex align-items-center gap-1"
  onClick={() => setShowCatalogue(true)}
>
  <span className="material-symbols-outlined" style={{ fontSize: '18px' }}>movie</span>
  Film Catalogue
</Button>

// At the end of the Header's JSX (before the closing fragment or div), add:
<FilmCatalogue
  show={showCatalogue}
  onHide={() => setShowCatalogue(false)}
/>
```

**Note:** Keep the existing Comscore import functionality accessible too.
You can either:
- (a) Add an "Import Comscore" button inside the Film Catalogue overlay (planned for Stage 3)
- (b) Keep a separate small "Import" button in the header alongside "Film Catalogue"

For now, **option (b)** is the safest — keep both buttons so Austin can 
still import Comscore files while we build Stage 3.

### Step 3: Ensure apiClient has the new methods

Make sure you've added the methods from Stage 1's `apiClient_additions.js` 
into your `src/utils/apiClient.js`. The components import from:
- `apiClient.getCatalogue()`
- `apiClient.getCatalogueEntry(id)`
- `apiClient.createCatalogueEntry(entry)`
- `apiClient.updateCatalogueEntry(id, updates)`
- `apiClient.deleteCatalogueEntry(id)`
- `apiClient.searchTMDB(query)`
- `apiClient.getTMDBDetails(tmdbId)`
- `apiClient.addFilmFromTMDB(tmdbId, overrides)`
- `tmdbImageUrl(path, size)` (named export)

### Step 4: Check apiClient is accessible from AppContext

The components use `useAppContext()` to access `apiClient`. Make sure your 
AppContext exposes it. In your `AppContext.jsx`, the context value should 
include `apiClient`:

```jsx
// In AppContext.jsx, the value prop should include:
const value = {
  // ... existing values ...
  apiClient,  // Make sure this is included
};
```

If apiClient is created inside AppContext using `createApiClient(getToken)`, 
just ensure it's passed through the context value. If it's not currently 
exposed, add it.

### Step 5: Theme CSS variables

The components use CSS custom properties for theming. If your app already 
has these (which it likely does from the existing dark/light theme system), 
you're all set. The components reference:

- `--cs-bg` (page background)
- `--cs-text` (text colour)
- `--cs-text-muted` (secondary text)
- `--cs-card-bg` (card backgrounds)
- `--cs-border` (border colour)
- `--cs-hover` (hover highlight)

If any of these aren't defined, the components include fallback values.
They also support `[data-theme="light"]` overrides for light mode.

### Step 6: Push & Deploy

Commit via GitHub Desktop → push → Vercel auto-deploys.

## What Austin Will See

1. **Header bar** now has a "Film Catalogue" button with a film icon
2. Clicking it opens a **full-screen overlay** with a Netflix-style poster grid
3. Existing Comscore-imported films appear as cards (auto-migrated in Stage 1)
4. **"+ Add Film" button** opens a search modal:
   - Type a film name → TMDB results appear with poster thumbnails
   - Click a result → full details load (cast, genres, certification, etc.)
   - Review the pre-populated form → edit anything → Save to Catalogue
   - "Can't find it?" → manual entry mode
5. **Clicking any film card** opens the detail view:
   - **Overview tab:** poster, synopsis, cast (with profile photos), crew, keywords
   - **Performance tab:** Comscore import summary, revenue stats, ROI
   - **Financials tab:** editable cost fields, computed ROI, delete option
6. **Filter bar** at the top: search, filter by status, sort by multiple options
7. Cards show: poster image, title, year, certification, genres, status badge, 
   Comscore data indicator (green tick or grey "No data"), and UK revenue

## Component Architecture

```
Header.jsx
  └── FilmCatalogue.jsx (fullscreen Modal)
        ├── FilmCard (inline) — Netflix-style poster card
        ├── AddFilmModal.jsx — Step 1: TMDB search, Step 2: Review form
        └── FilmDetailView.jsx — Tabs: Overview, Performance, Financials
```

## What's Next (Stage 3)

- Modify Comscore import flow to link to catalogue entries (auto-match + manual pick)
- "Import Comscore Data" button inside film detail view
- Wire catalogue_id into existing film selector dropdown
