import type { NayanNaturalEvent, NaturalEventCategory } from "../types";
import type { NayanDataProvider } from "../provider";

const EONET_GEOJSON_URL = "https://eonet.gsfc.nasa.gov/api/v3/events/geojson";
const INDIA_REGION_BBOX = "55,40,105,0";

type EonetCategory = { id: string; title: string };
type EonetGeometry = {
  type: "Point" | "Polygon" | "LineString";
  coordinates: number[] | number[][] | number[][][];
};
type EonetFeature = {
  id: string;
  properties?: {
    id?: string;
    title?: string;
    description?: string | null;
    link?: string;
    closed?: string | null;
    date?: string;
    magnitudeValue?: number | null;
    magnitudeUnit?: string | null;
    magnitudeDescription?: string | null;
    categories?: EonetCategory[];
  };
  geometry?: EonetGeometry | null;
};
type EonetGeoJsonResponse = { features?: EonetFeature[] };

function classifyCategory(categories: EonetCategory[] = []): NaturalEventCategory {
  const value = categories.map((category) => `${category.id} ${category.title}`.toLowerCase()).join(" ");
  if (value.includes("wildfire") || value.includes("fire")) return "wildfire";
  if (value.includes("storm") || value.includes("hurricane") || value.includes("tropical")) return "storm";
  if (value.includes("volcano")) return "volcano";
  if (value.includes("flood")) return "flood";
  if (value.includes("landslide") || value.includes("land slide")) return "landslide";
  if (value.includes("dust") || value.includes("smoke")) return "dust";
  if (value.includes("ice") || value.includes("snow") || value.includes("sea and lake ice")) return "ice";
  return "other";
}

function getCenter(geometry: EonetGeometry): [number, number] | null {
  if (geometry.type === "Point") {
    const [longitude, latitude] = geometry.coordinates as number[];
    return typeof longitude === "number" && typeof latitude === "number" ? [longitude, latitude] : null;
  }
  if (geometry.type === "LineString") {
    const coordinates = geometry.coordinates as number[][];
    if (!coordinates.length) return null;
    const middle = coordinates[Math.floor(coordinates.length / 2)];
    return middle && typeof middle[0] === "number" && typeof middle[1] === "number" ? [middle[0], middle[1]] : null;
  }
  const ring = (geometry.coordinates as number[][][])[0];
  if (!ring?.length) return null;
  let longitude = 0;
  let latitude = 0;
  for (const coordinate of ring) {
    longitude += coordinate[0];
    latitude += coordinate[1];
  }
  return [longitude / ring.length, latitude / ring.length];
}

function normalize(feature: EonetFeature): NayanNaturalEvent | null {
  if (!feature.geometry) return null;
  const properties = feature.properties ?? {};
  const center = getCenter(feature.geometry);
  if (!center) return null;
  const category = properties.categories?.[0];
  const date = properties.date ? Date.parse(properties.date) : Date.now();
  const closed = properties.closed ? Date.parse(properties.closed) : null;

  return {
    id: properties.id ?? feature.id,
    title: properties.title ?? "Natural event",
    category: classifyCategory(properties.categories),
    categoryLabel: category?.title ?? "Natural event",
    latitude: center[1],
    longitude: center[0],
    geometryType: feature.geometry.type,
    coordinates: feature.geometry.coordinates,
    description: properties.description ?? null,
    date: Number.isNaN(date) ? Date.now() : date,
    closed: closed !== null && !Number.isNaN(closed) ? closed : null,
    magnitude: {
      value: properties.magnitudeValue ?? null,
      unit: properties.magnitudeUnit ?? null,
      description: properties.magnitudeDescription ?? null,
    },
    sourceUrl: properties.link ?? "https://eonet.gsfc.nasa.gov/",
  };
}

export const eonetNaturalEventsProvider: NayanDataProvider<NayanNaturalEvent[]> = {
  key: "natural-events.india-region",
  async fetch(signal) {
    const url = new URL(EONET_GEOJSON_URL);
    url.searchParams.set("status", "open");
    url.searchParams.set("limit", "500");
    url.searchParams.set("bbox", INDIA_REGION_BBOX);

    const response = await fetch(url, {
      signal,
      headers: { Accept: "application/geo+json, application/json" },
      cache: "no-store",
    });
    if (!response.ok) throw new Error(`EONET request failed with ${response.status}`);

    const payload = (await response.json()) as EonetGeoJsonResponse;
    return (payload.features ?? [])
      .map(normalize)
      .filter((event): event is NayanNaturalEvent => Boolean(event));
  },
};
