# NAYAN

**India, from above.**

NAYAN is an open-source, non-commercial geospatial visualization project focused on building a beautiful 3D view of India and, over time, layering public live data on top.

## Phase 01

The first milestone is intentionally small:

- 3D Earth
- India-focused starting camera
- Interactive rotate / zoom / pan
- Clean NAYAN visual identity
- No backend, database, authentication, or live-data feeds yet

## Local development

Requirements: Node.js 24.x or newer.

```bash
npm install
npm run dev
```

Open `http://localhost:3000`.

## Architecture direction

The project will keep visualization, application logic, and external data providers separated. Future live-data adapters will feed canonical NAYAN entities rather than coupling external APIs directly to UI components.

See `docs/ARCHITECTURE.md` and `docs/DATA-SOURCES.md` as the system grows.
