export const AIRCRAFT_REGION = {
  minLat: 0,
  maxLat: 40,
  minLon: 55,
  maxLon: 105,
} as const;

// ADSB.lol exposes geographic snapshots by radius. NAYAN deliberately gives
// southern India and its surrounding airspace more sampling density because
// this is the current focus area. Requests remain sequential to avoid bursts.
export const AIRCRAFT_QUERY_RADIUS_NM = 300;
export const AIRCRAFT_QUERY_DELAY_MS = 4_000;
export const AIRCRAFT_REFRESH_MS = 120_000;
export const AIRCRAFT_CACHE_SECONDS = 120;
export const AIRCRAFT_STALE_SECONDS = 600;

// South-weighted collection grid. The first five cells cover southern India,
// the Arabian Sea, Bay of Bengal and Sri Lanka approaches. The final two cells
// retain broad central/northern coverage without spending the whole request
// budget there.
export const AIRCRAFT_QUERY_CENTERS = [
  { lat: 18.0, lon: 68.0, label: "southwest" },
  { lat: 18.0, lon: 80.0, label: "south-central" },
  { lat: 18.0, lon: 92.0, label: "southeast" },
  { lat: 8.0, lon: 74.0, label: "deep-southwest" },
  { lat: 8.0, lon: 84.0, label: "deep-south" },
  { lat: 27.0, lon: 76.0, label: "north-central" },
  { lat: 30.0, lon: 91.0, label: "northeast" },
] as const;
