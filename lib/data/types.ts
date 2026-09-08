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

export type NaturalEventCategory =
  | "storm"
  | "wildfire"
  | "volcano"
  | "flood"
  | "landslide"
  | "dust"
  | "ice"
  | "other";

export type NayanNaturalEvent = {
  id: string;
  title: string;
  category: NaturalEventCategory;
  categoryLabel: string;
  latitude: number;
  longitude: number;
  geometryType: "Point" | "Polygon" | "LineString";
  coordinates: number[] | number[][] | number[][][];
  description: string | null;
  date: number;
  closed: number | null;
  magnitude: {
    value: number | null;
    unit: string | null;
    description: string | null;
  };
  sourceUrl: string;
};

export type NayanDataKey = "earthquakes" | "natural-events";
