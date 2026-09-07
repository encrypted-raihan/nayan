# NAYAN Architecture

## Core boundaries

1. **UI** renders application state.
2. **Application core** owns camera, layers, selection, tracking, and scene state.
3. **Data engine** fetches, normalizes, validates, and caches external data.
4. **Providers** are replaceable adapters for individual external sources.
5. **Globe engine** is responsible for Cesium rendering and camera primitives.

### Golden rules

- UI does not call external data providers directly.
- Cesium rendering code does not know provider-specific response formats.
- Provider-specific schemas are normalized into canonical NAYAN models.
- API keys and provider credentials never live in client components.
- New data sources should be added as adapters, not embedded into existing layers.

## Planned dependency flow

```text
UI
 │
 ▼
Application Core
 │
 ├── Camera
 ├── Layers
 ├── Selection / Tracking
 └── Scene State
 │
 ▼
Data Engine
 │
 ├── Normalize
 ├── Validate
 └── Cache
 │
 ▼
Provider Adapters
 │
 ├── NASA
 ├── USGS
 ├── CelesTrak
 ├── Aircraft provider
 ├── Maritime provider
 └── Traffic provider
```

Phase 01 deliberately implements only the globe foundation.
