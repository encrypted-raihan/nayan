import type { NayanEarthquake } from "../types";
import type { NayanDataProvider } from "../provider";

const USGS_QUERY_URL = "https://earthquake.usgs.gov/fdsnws/event/1/query";

const INDIA_REGION = {
  minLatitude: 0,
  maxLatitude: 40,
  minLongitude: 55,
  maxLongitude: 105,
};

const MIN_MAGNITUDE = 1.0;
const DAYS_BACK = 7;
const MAX_EVENTS = 500;

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
  };
  geometry?: { coordinates?: number[] };
};

type USGSResponse = { features?: USGSFeature[] };

function normalize(feature: USGSFeature): NayanEarthquake | null {
  const properties = feature.properties ?? {};
  const [longitude, latitude, depthKm] = feature.geometry?.coordinates ?? [];

  if (
    !feature.id ||
    typeof properties.mag !== "number" ||
    typeof properties.time !== "number" ||
    typeof properties.updated !== "number" ||
    typeof longitude !== "number" ||
    typeof latitude !== "number" ||
    typeof depthKm !== "number"
  ) return null;

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
}

export const usgsEarthquakeProvider: NayanDataProvider<NayanEarthquake[]> = {
  key: "earthquakes.india-region",
  async fetch(signal) {
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

    const response = await fetch(`${USGS_QUERY_URL}?${params.toString()}`, {
      signal,
      headers: { Accept: "application/json" },
      cache: "no-store",
    });

    if (!response.ok) throw new Error(`USGS earthquake request failed (${response.status})`);

    const data = (await response.json()) as USGSResponse;
    return (data.features ?? [])
      .map(normalize)
      .filter((event): event is NayanEarthquake => event !== null);
  },
};
