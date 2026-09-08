# NAYAN Data Architecture

NAYAN separates external data acquisition from application state and Cesium rendering.

## Runtime flow

```text
External API
    ↓
Provider adapter
    ↓
Normalize + validate
    ↓
NayanDataEngine
    ├── cache
    └── in-flight request deduplication
    ↓
Stable NAYAN data types
    ↓
Globe / layer presentation
```

## Responsibilities

### Providers — `lib/data/providers/`
Providers are the only place that knows an external API's URL, query parameters, response shape, and normalization rules.

A provider:
- accepts an optional `AbortSignal`;
- fetches its external source;
- validates required fields;
- returns canonical NAYAN data;
- never imports Cesium or UI code.

Providers are replaceable. A future provider can implement the same contract without changing the globe renderer.

### Canonical types — `lib/data/types.ts`
These types are the internal data contract. The visualization layer consumes these types instead of provider-specific response objects.

### Data engine — `lib/data/engine.ts`
The engine is the single runtime boundary for fetching data. It provides:
- short-lived in-memory caching;
- duplicate-request suppression;
- caller-side cancellation;
- cache invalidation.

The engine does not know anything about Cesium, React, or UI state.

### Provider registry — `lib/data/registry.ts`
The registry is the single place that maps stable NAYAN layer names to provider adapters.

### Compatibility entry points
`lib/data/usgs-earthquakes.ts` and `lib/data/eonet-natural-events.ts` remain stable entry points for the current globe implementation. They delegate to the data engine, so existing functionality does not need to know the provider implementation.

## Rules

1. No provider imports Cesium.
2. No provider imports React components.
3. No UI component constructs external API URLs.
4. External response shapes do not cross the provider boundary.
5. Cesium entities are created only by the presentation layer.
6. New data sources must add a provider adapter and canonical type before adding globe rendering.
7. Caching belongs to the data engine, not individual UI components.
8. Provider keys must be stable and unique.

## Current providers

- `earthquakes` → USGS earthquake event service, India + surrounding region.
- `natural-events` → NASA EONET open natural-event feed, India + surrounding region.

The architecture intentionally does **not** add aircraft, ships, satellites, schedulers, persistence, or a backend yet. Those can be added behind the same boundaries when their requirements are ready.
