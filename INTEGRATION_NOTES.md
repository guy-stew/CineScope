# CineScope — Stage 3: Import & Template

## What's in this zip

```
public/
  data/
    CineScope_Venue_Import_Template.xlsx   ← NEW — downloadable template
src/
  components/
    VenueManager.jsx    ← REPLACE Stage 2 version (enables Import button + import view)
    VenueImport.jsx     ← NEW — spreadsheet upload, parse, validate, geocode, confirm
  utils/
    venueApi.js         ← REPLACE Stage 2 version (adds importVenues method)
    geocoder.js         ← NEW — batch geocoding utility with rate limiting
```


## Integration Steps

### 1. Drop the files in
Drag-and-drop overlay onto your project root. The folder structure matches.

### 2. Files that REPLACE Stage 2 versions
- **VenueManager.jsx** — now imports VenueImport and adds the 'import' view state.
  The Import button in the toolbar is enabled (was disabled in Stage 2).
- **venueApi.js** — adds the `importVenues()` method for POST /api/venues/import.

### 3. New files
- **CineScope_Venue_Import_Template.xlsx** — goes in `public/data/`. Downloadable
  from within the import flow. Has formatted headers, data validation dropdowns
  (Country, Category, Status), and 2 example rows marked for deletion.
- **VenueImport.jsx** — the import component rendered inside VenueManager.
- **geocoder.js** — batch geocoding with 1-second rate limiting for Nominatim.

### 4. No changes needed to
- Header.jsx (unchanged from Stage 2)
- VenueForm.jsx (unchanged from Stage 2)
- AppContext.jsx (no changes)


## How the Import Flow Works

1. Austin clicks **Import** in the Venue Manager toolbar
2. Sees a drop zone + "Download Template" link
3. Drags in a filled-out .xlsx file
4. SheetJS parses it → preview table shows all rows with validation status
5. Invalid rows (missing required fields, bad values) are flagged red and deselected
6. Duplicate detection: checks both within the file AND against existing venues
7. If any selected venues are missing coordinates but have an address/postcode,
   a "Geocode N venues first" button appears
8. Geocoding runs at 1 request/second with a progress bar and cancel button
9. Austin clicks "Import N venues" to confirm
10. POST /api/venues/import sends the payload → success screen → back to list


## API Endpoint Expected (from Stage 1)

| Method | URL                    | Body                        | Returns                                    |
|--------|------------------------|-----------------------------|--------------------------------------------|
| POST   | /api/venues/import     | `{ venues: [{...}, ...] }`  | `{ imported: N, skipped: N, errors: [] }`  |

Each venue object in the array has the same shape as a single POST /api/venues body,
with `source: 'import'` pre-set by the client.


## Template Spreadsheet Details

The .xlsx has two sheets:
- **Venue Import** — the data entry sheet with 12 columns, frozen header,
  auto-filter, and data validation dropdowns for Country, Category, and Status.
  Two example rows (yellow background, italic) are included for reference and
  should be deleted before importing.
- **Instructions** — a reference guide explaining each column.


## What's Next: Stage 4 (Map Integration & Polish)

Stage 4 connects the managed venue list to the map:
- Task 16: Replace static JSON loading in AppContext with /api/venues
- Task 17: Grey markers + Closed badge for closed venues
- Task 18: Update venueMatcher to use comscore_name field
- Task 19: End-to-end testing
- Task 20: Update CineScope_Project.md
