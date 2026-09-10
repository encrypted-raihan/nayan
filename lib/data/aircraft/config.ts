export const AIRCRAFT_REGION = {
  minLat: 0,
  maxLat: 40,
  minLon: 55,
  maxLon: 105,
} as const;

// NAYAN uses a south-first, all-India hub network so the globe feels populated
// without requesting the entire country on every refresh.
export const AIRCRAFT_QUERY_RADIUS_NM = 220;
export const AIRCRAFT_QUERY_DELAY_MS = 0;
export const AIRCRAFT_REFRESH_MS = 10_000;
export const AIRCRAFT_CACHE_SECONDS = 10;
export const AIRCRAFT_STALE_SECONDS = 300;

// Coverage priorities: Kerala, Karnataka, Tamil Nadu and Goa are dense first,
// then western, central, northern and eastern/northeastern corridors fill in.
// One region is collected per refresh and successful snapshots are accumulated.
export const AIRCRAFT_QUERY_CENTERS = [
  { lat: 9.9312, lon: 76.2673, label: "kochi" },
  { lat: 12.9716, lon: 77.5946, label: "bengaluru" },
  { lat: 13.0827, lon: 80.2707, label: "chennai" },
  { lat: 11.0168, lon: 76.9558, label: "coimbatore" },
  { lat: 15.4909, lon: 73.8278, label: "goa" },
  { lat: 23.0225, lon: 72.5714, label: "ahmedabad" },
  { lat: 19.0760, lon: 72.8777, label: "mumbai" },
  { lat: 17.3850, lon: 78.4867, label: "hyderabad" },
  { lat: 28.6139, lon: 77.2090, label: "delhi" },
  { lat: 25.5941, lon: 85.1376, label: "patna" },
  { lat: 20.2961, lon: 85.8245, label: "bhubaneswar" },
  { lat: 22.5726, lon: 88.3639, label: "kolkata" },
  { lat: 26.1445, lon: 91.7362, label: "guwahati" },
] as const;
