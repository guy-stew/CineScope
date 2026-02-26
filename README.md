# CineScope — Cinema Performance Analytics

A web application for Liberator Film Services that maps and grades ~946 UK/Ireland cinema venues based on Comscore box office revenue data.

## Quick Start

```bash
npm install
npm run dev
```

Opens at [http://localhost:3000](http://localhost:3000)

## Technology Stack

| Layer | Technology |
|-------|-----------|
| Frontend | React 18 (functional components + hooks) |
| UI | Bootstrap 5 (React-Bootstrap) |
| Mapping | Leaflet.js (React-Leaflet) + MarkerCluster |
| Charts | Recharts |
| File Parsing | SheetJS (xlsx) — client-side only |
| State | React Context API |
| Build | Vite |
| Hosting | Vercel or Netlify |

## Project Structure

```
src/
├── App.jsx                  # Main layout (map + analytics split)
├── main.jsx                 # Entry point + CSS imports
├── index.css                # Global styles
├── components/
│   ├── Header.jsx           # Navbar with filters + file upload
│   ├── MapView.jsx          # Leaflet map with graded markers
│   ├── AnalyticsPanel.jsx   # Sidebar with table + stats
│   └── GradeSummary.jsx     # A/B/C/D/E count cards
├── context/
│   └── AppContext.jsx        # Global state management
├── utils/
│   └── grades.js            # Grade calculation + colour config
└── data/
    └── venues-sample.json   # Sample venue data (dev only)
```

## Grading System

| Grade | Percentile | Colour | Purpose |
|-------|-----------|--------|---------|
| A | Top 25% | Green | Top performers |
| B | 50–75% | Yellow | Marketing target |
| C | 25–50% | Orange | Marketing target (most growth) |
| D | Bottom 25% | Red | Deprioritise |
| E | No data | Grey | Hidden when film selected |

## Data Privacy

Comscore revenue data is parsed and processed entirely client-side in the browser using SheetJS. No proprietary data is ever transmitted to or stored on the server.

## Deployment

```bash
npm run build    # Creates optimised build in dist/
```

Deploy the `dist/` folder to Vercel or Netlify. Both support automatic deployments from Git.

---

*CineScope v1.5 — Liberator Film Services — 2026*
