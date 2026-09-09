export const AIRCRAFT_REGION = {
  minLat: 0,
  maxLat: 40,
  minLon: 55,
  maxLon: 105,
} as const;

// Keep the first live aircraft implementation deliberately conservative.
// ADSB.lol applies dynamic rate limits, so NAYAN starts with one 250 NM
// regional snapshot centered over central India. Coverage can be expanded
// later with a collector/cache architecture without changing the UI contract.
export const AIRCRAFT_QUERY_RADIUS_NM = 250;
export const AIRCRAFT_REFRESH_MS = 30_000;
export const AIRCRAFT_CACHE_SECONDS = 30;
export const AIRCRAFT_STALE_SECONDS = 300;

export const AIRCRAFT_QUERY_CENTERS = [
  { lat: 22.5726, lon: 79.0000, label: "india-core" },
] as const;
