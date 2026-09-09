export const AIRCRAFT_REGION = {
  minLat: 0,
  maxLat: 40,
  minLon: 55,
  maxLon: 105,
} as const;

// NAYAN focuses aircraft collection on southern India and the major national
// corridors that make the globe feel connected to the rest of India.
// Each browser refresh advances one city/region instead of waiting for a full
// country-wide sweep.
export const AIRCRAFT_QUERY_RADIUS_NM = 250;
export const AIRCRAFT_QUERY_DELAY_MS = 0;
export const AIRCRAFT_REFRESH_MS = 15_000;
export const AIRCRAFT_CACHE_SECONDS = 10;
export const AIRCRAFT_STALE_SECONDS = 300;

// South-first city/corridor coverage. Kerala, Karnataka and Tamil Nadu get the
// strongest practical coverage, while a few major hubs preserve the national
// context without attempting to scan all of India every time.
export const AIRCRAFT_QUERY_CENTERS = [
  { lat: 9.9312, lon: 76.2673, label: "kochi" },
  { lat: 12.9716, lon: 77.5946, label: "bengaluru" },
  { lat: 13.0827, lon: 80.2707, label: "chennai" },
  { lat: 17.3850, lon: 78.4867, label: "hyderabad" },
  { lat: 19.0760, lon: 72.8777, label: "mumbai" },
  { lat: 22.5726, lon: 88.3639, label: "kolkata" },
  { lat: 28.6139, lon: 77.2090, label: "delhi" },
] as const;
