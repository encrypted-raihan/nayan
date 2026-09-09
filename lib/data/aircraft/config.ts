export const AIRCRAFT_REGION = {
  minLat: 0,
  maxLat: 40,
  minLon: 55,
  maxLon: 105,
} as const;

// ADSB.lol exposes geographic snapshots by radius. NAYAN uses an overlapping
// grid and queries it sequentially so coverage grows without creating a burst
// of concurrent requests.
export const AIRCRAFT_QUERY_RADIUS_NM = 300;
export const AIRCRAFT_QUERY_DELAY_MS = 1_500;
export const AIRCRAFT_REFRESH_MS = 60_000;
export const AIRCRAFT_CACHE_SECONDS = 60;
export const AIRCRAFT_STALE_SECONDS = 300;

export const AIRCRAFT_QUERY_CENTERS = [
  { lat: 33.0, lon: 68.0, label: "northwest" },
  { lat: 33.0, lon: 80.0, label: "north" },
  { lat: 33.0, lon: 92.0, label: "northeast" },
  { lat: 24.0, lon: 68.0, label: "west" },
  { lat: 24.0, lon: 80.0, label: "north-central" },
  { lat: 24.0, lon: 92.0, label: "east" },
  { lat: 14.0, lon: 68.0, label: "southwest" },
  { lat: 14.0, lon: 80.0, label: "south" },
  { lat: 14.0, lon: 92.0, label: "southeast" },
] as const;
