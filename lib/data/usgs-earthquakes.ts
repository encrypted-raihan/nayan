export type NayanEarthquake = {
  id: string;
  magnitude: number;
  place: string;
  time: number;
  updated: number;
  longitude: number;
  latitude: number;
  depthKm: number;
  url: string;
  tsunami: boolean;
  felt: number | null;
  magType: string | null;
};

type USGSFeature = {
  id: string;
  properties?: {
    mag?: number | null;
    place?: string | null;
    time?: number | null;
    updated?: number | null;
    url?: string | null;
    tsunami?: number | null;
    felt?: number | null;
    magType?: string | null;
    type?: string | null;
  };
  geometry?: {
    type?: string;
    coordinates?: number[];
  };
};

type USGSResponse = {
  features?: USGSFeature[];
};

const INDIA_REGION = {
  minLatitude: 0,
  maxLatitude: 40,
  minLongitude: 55,
  maxLongitude: 105,
};

const MIN_MAGNITUDE = 1.0;
const DAYS_BACK = 7;
const MAX_EVENTS = 500;

export async function fetchIndiaEarthquakes(signal?: AbortSignal): Promise<NayanEarthquake[]> {
  const start = new Date(Date.now() - DAYS_BACK * 24 * 60 * 60 * 1000).toISOString();
  const params = new URLSearchParams({
    format: "geojson",
    starttime: start,
    minlatitude: String(INDIA_REGION.minLatitude),
    maxlatitude: String(INDIA_REGION.maxLatitude),
    minlongitude: String(INDIA_REGION.minLongitude),
    maxlongitude: String(INDIA_REGION.maxLongitude),
    minmagnitude: String(MIN_MAGNITUDE),
    eventtype: "earthquake",
    orderby: "time",
    limit: String(MAX_EVENTS),
  });

  const response = await fetch(
    `https://earthquake.usgs.gov/fdsnws/event/1/query?${params.toString()}`,
    {
      signal,
      headers: { Accept: "application/json" },
    },
  );

  if (!response.ok) {
    throw new Error(`USGS earthquake request failed (${response.status})`);
  }

  const data = (await response.json()) as USGSResponse;

  return (data.features ?? [])
    .map((feature): NayanEarthquake | null => {
      const coordinates = feature.geometry?.coordinates ?? [];
      const properties = feature.properties ?? {};
      const [longitude, latitude, depthKm] = coordinates;

      if (
        !feature.id ||
        typeof properties.mag !== "number" ||
        typeof properties.time !== "number" ||
        typeof properties.updated !== "number" ||
        typeof longitude !== "number" ||
        typeof latitude !== "number" ||
        typeof depthKm !== "number"
      ) {
        return null;
      }

      return {
        id: feature.id,
        magnitude: properties.mag,
        place: properties.place ?? "Unknown location",
        time: properties.time,
        updated: properties.updated,
        longitude,
        latitude,
        depthKm,
        url: properties.url ?? `https://earthquake.usgs.gov/earthquakes/eventpage/${feature.id}`,
        tsunami: properties.tsunami === 1,
        felt: typeof properties.felt === "number" ? properties.felt : null,
        magType: properties.magType ?? null,
      };
    })
    .filter((event): event is NayanEarthquake => event !== null);
}
