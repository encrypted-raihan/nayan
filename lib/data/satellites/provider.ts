import {
  eciToGeodetic,
  json2satrec,
  propagate,
  gstime,
  type SatRec,
} from "satellite.js";
import type { NayanDataProvider } from "../provider";
import type { NayanSatellite } from "./types";

const CELESTRAK_URL = "https://celestrak.org/NORAD/elements/gp.php?GROUP=active&FORMAT=JSON";
const EARTH_RADIUS_KM = 6378.137;

export type NayanSatelliteRecord = {
  satellite: NayanSatellite;
  satrec: SatRec;
};

type CelestrakOmm = {
  OBJECT_NAME?: string;
  OBJECT_ID?: string;
  EPOCH?: string;
  MEAN_MOTION?: number;
  ECCENTRICITY?: number;
  INCLINATION?: number;
  RA_OF_ASC_NODE?: number;
  ARG_OF_PERICENTER?: number;
  MEAN_ANOMALY?: number;
  NORAD_CAT_ID?: number;
  [key: string]: unknown;
};

function toNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function normalizeOmm(item: CelestrakOmm): NayanSatelliteRecord | null {
  const noradCatalogId = toNumber(item.NORAD_CAT_ID);
  const epoch = typeof item.EPOCH === "string" ? Date.parse(item.EPOCH) : Number.NaN;
  const meanMotion = toNumber(item.MEAN_MOTION);
  const eccentricity = toNumber(item.ECCENTRICITY);
  const inclination = toNumber(item.INCLINATION);
  const rightAscension = toNumber(item.RA_OF_ASC_NODE);
  const argumentOfPerigee = toNumber(item.ARG_OF_PERICENTER);
  const meanAnomaly = toNumber(item.MEAN_ANOMALY);

  if (
    noradCatalogId === null ||
    !Number.isFinite(epoch) ||
    meanMotion === null ||
    eccentricity === null ||
    inclination === null ||
    rightAscension === null ||
    argumentOfPerigee === null ||
    meanAnomaly === null
  ) return null;

  let satrec: SatRec;
  try {
    satrec = json2satrec(item as Parameters<typeof json2satrec>[0]);
  } catch {
    return null;
  }

  const satellite: NayanSatellite = {
    id: String(noradCatalogId),
    name: item.OBJECT_NAME?.trim() || `NORAD ${noradCatalogId}`,
    noradCatalogId,
    objectId: item.OBJECT_ID?.trim() || null,
    epoch,
    meanMotionRevolutionsPerDay: meanMotion,
    eccentricity,
    inclinationDeg: inclination,
    rightAscensionDeg: rightAscension,
    argumentOfPerigeeDeg: argumentOfPerigee,
    meanAnomalyDeg: meanAnomaly,
    altitudeKm: 0,
    speedKmPerSecond: 0,
    latitudeDeg: 0,
    longitudeDeg: 0,
  };

  return { satellite, satrec };
}

export const celestrakActiveSatelliteProvider: NayanDataProvider<NayanSatelliteRecord[]> = {
  key: "satellites.active",
  async fetch(signal) {
    const response = await fetch(CELESTRAK_URL, {
      signal,
      headers: { Accept: "application/json" },
      cache: "no-store",
    });

    if (!response.ok) throw new Error(`CelesTrak satellite request failed (${response.status})`);

    const payload = (await response.json()) as CelestrakOmm[];
    const records = Array.isArray(payload)
      ? payload.map(normalizeOmm).filter((record): record is NayanSatelliteRecord => record !== null)
      : [];

    if (!records.length) throw new Error("CelesTrak returned no usable active satellites");
    return records;
  },
};

export function propagateSatellite(record: NayanSatelliteRecord, date = new Date()): NayanSatellite | null {
  const state = propagate(record.satrec, date, { communityDecayCheckEnabled: true });
  if (!state) return null;

  const gmst = gstime(date);
  const geodetic = eciToGeodetic(state.position, gmst);
  const positionKm = Math.sqrt(
    state.position.x ** 2 + state.position.y ** 2 + state.position.z ** 2,
  );

  return {
    ...record.satellite,
    altitudeKm: Math.max(0, positionKm - EARTH_RADIUS_KM),
    speedKmPerSecond: Math.sqrt(
      state.velocity.x ** 2 + state.velocity.y ** 2 + state.velocity.z ** 2,
    ),
    latitudeDeg: geodetic.latitude * (180 / Math.PI),
    longitudeDeg: geodetic.longitude * (180 / Math.PI),
  };
}
