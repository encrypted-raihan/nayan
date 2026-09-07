# NAYAN

**India, from above.**

NAYAN is an open-source, non-profit, non-commercial geospatial visualization project focused on building a beautiful 3D view of India and, over time, layering public live data on top.

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

## Cesium ion

NAYAN can use a free Cesium ion account/token for globe imagery and terrain. The token is not required for the Next.js build, but a valid token is required at runtime for Cesium ion assets.

Create `.env.local` from `.env.example`:

```bash
NEXT_PUBLIC_CESIUM_ION_TOKEN=your_token_here
```

For Vercel, add the same variable under Project Settings → Environment Variables. Never commit `.env.local` or a real token.

## Architecture direction

The project keeps visualization, application logic, and external data providers separated. Future live-data adapters will feed canonical NAYAN entities rather than coupling external APIs directly to UI components.

See `docs/ARCHITECTURE.md` and `docs/DATA-SOURCES.md` as the system grows.
