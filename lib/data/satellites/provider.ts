import {
  eciToGeodetic,
  json2satrec,
  propagate,
  gstime,
  type SatRec,
} from "satellite.js";
import { nayanDataEngine } from "../engine";
import type { NayanDataProvider } from "../provider";
import type { NayanSatellite, NayanSatelliteCategory } from "./types";

const CELESTRAK_URL = "https://celestrak.org/NORAD/elements/gp.php?GROUP=active&FORMAT=JSON";
const EARTH_RADIUS_KM = 6378.137;
const SATELLITE_CACHE_TTL_MS = 2 * 60 * 60 * 1000;

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

const CATEGORY_LABELS: Record<NayanSatelliteCategory, string> = {
  navigation: "Navigation",
  weather: "Weather",
  "earth-observation": "Earth Observation",
  communications: "Communications",
  science: "Science",
  education: "Education / Research",
  defense: "Defense",
  other: "Other",
};

const IMPORTANT_PATTERNS = [
  /ISS \(ZARYA\)|ZARYA|SPACE STATION/i,
  /HST|HUBBLE/i,
  /LANDSAT/i,
  /SENTINEL/i,
  /RESOURCESAT|CARTOSAT|RISAT|EOS/i,
  /INSAT|GSAT|NVS|NAVIC|IRNSS/i,
  /NOAA|GOES|METEOSAT|METOP|JPSS|SUOMI|HIMAWARI/i,
  /GPS BIIR|GPS BIIA|GPS BIII|GPS IIF|GPS III/i,
  /GALILEO/i,
  /GLONASS/i,
  /BEIDOU|COMPASS/i,
  /TERRA|AQUA|AURA|CALIPSO|ICESAT|SMAP|SWOT/i,
  /JWST|JAMES WEBB/i,
];

function classifySatellite(name: string): { category: NayanSatelliteCategory; important: boolean } {
  const value = name.toUpperCase();

  if (/GPS|NAVSTAR|GALILEO|GLONASS|BEIDOU|COMPASS|NAVIC|IRNSS|NVS/.test(value)) {
    return { category: "navigation", important: true };
  }
  if (/NOAA|GOES|METEOSAT|METOP|JPSS|HIMAWARI|FY-|FENGYUN|TIROS|METEOR/.test(value)) {
    return { category: "weather", important: IMPORTANT_PATTERNS.some((pattern) => pattern.test(name)) };
  }
  if (/LANDSAT|SENTINEL|RESOURCESAT|CARTOSAT|RISAT|EOS|TERRA|AQUA|AURA|CALIPSO|ICESAT|SMAP|SWOT|WORLDVIEW|PLEIADES|KOMPSAT|SPOT/.test(value)) {
    return { category: "earth-observation", important: IMPORTANT_PATTERNS.some((pattern) => pattern.test(name)) };
  }
  if (/HST|HUBBLE|JWST|JAMES WEBB|CHANDRA|FERMI|XMM|SWIFT|SOHO|SCIENCE|EXPLORER/.test(value)) {
    return { category: "science", important: true };
  }
  if (/ISS \(ZARYA\)|ZARYA|TIANGONG|SPACE STATION/.test(value)) {
    return { category: "science", important: true };
  }
  if (/INSAT|GSAT|SES-|INTELSAT|INMARSAT|IRIDIUM|ORBCOMM|GLOBALSTAR|EUTELSAT|ASTRA|TELSTAR|TDRS|STARLINK/.test(value)) {
    return { category: "communications", important: /INSAT|GSAT|TDRS|TELSTAR/.test(value) };
  }
  if (/NROL|USA |USSF|SBIRS|AEHF|WGS|MILSTAR|DSP |KH-|USA-[0-9]|NOSS|MUOS|SB-WASS/.test(value)) {
    return { category: "defense", important: true };
  }
  if (/CUBESAT|CUBE SAT|UNISAT|STARS|ESTCUBE|EDUSAT|STUDENT|UNIVERSITY|ACADEMIC/.test(value)) {
    return { category: "education", important: false };
  }

  return { category: "other", important: false };
}

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

  const name = item.OBJECT_NAME?.trim() || `NORAD ${noradCatalogId}`;
  const classification = classifySatellite(name);

  return {
    satellite: {
      id: String(noradCatalogId),
      name,
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
      category: classification.category,
      categoryLabel: CATEGORY_LABELS[classification.category],
      important: classification.important,
    },
    satrec,
  };
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

export async function fetchActiveSatellites(signal?: AbortSignal): Promise<NayanSatelliteRecord[]> {
  const result = await nayanDataEngine.get(celestrakActiveSatelliteProvider, {
    cacheTtlMs: SATELLITE_CACHE_TTL_MS,
    signal,
  });
  return result.data;
}

export function propagateSatellite(record: NayanSatelliteRecord, date = new Date()): NayanSatellite | null {
  const state = propagate(record.satrec, date);
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
