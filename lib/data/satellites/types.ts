export type NayanSatelliteCategory =
  | "navigation"
  | "weather"
  | "earth-observation"
  | "communications"
  | "science"
  | "education"
  | "defense"
  | "other";

export type NayanSatellite = {
  id: string;
  name: string;
  noradCatalogId: number;
  objectId: string | null;
  epoch: number;
  meanMotionRevolutionsPerDay: number;
  eccentricity: number;
  inclinationDeg: number;
  rightAscensionDeg: number;
  argumentOfPerigeeDeg: number;
  meanAnomalyDeg: number;
  altitudeKm: number;
  speedKmPerSecond: number;
  latitudeDeg: number;
  longitudeDeg: number;
  category: NayanSatelliteCategory;
  categoryLabel: string;
  important: boolean;
};
