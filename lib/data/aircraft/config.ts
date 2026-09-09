export const AIRCRAFT_REGION = {
  minLat: 0,
  maxLat: 40,
  minLon: 55,
  maxLon: 105,
} as const;

// ADSB.lol's regional endpoint accepts a radius in nautical miles.
// These centers cover India and the nearby airspace without relying on a
// huge single query. The server cache keeps repeated viewers polite to the
// upstream service.
export const AIRCRAFT_QUERY_RADIUS_NM = 250;
export const AIRCRAFT_REFRESH_MS = 15_000;

export const AIRCRAFT_QUERY_CENTERS = [
  { lat: 28.6139, lon: 77.2090, label: "north" },
  { lat: 24.5854, lon: 73.7125, label: "northwest" },
  { lat: 23.0225, lon: 72.5714, label: "west" },
  { lat: 19.0760, lon: 72.8777, label: "west-coast" },
  { lat: 22.5726, lon: 88.3639, label: "east" },
  { lat: 17.3850, lon: 78.4867, label: "central-south" },
  { lat: 13.0827, lon: 80.2707, label: "southeast" },
  { lat: 26.1445, lon: 91.7362, label: "northeast" },
] as const;
