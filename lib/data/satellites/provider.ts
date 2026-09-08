import {
  eciToGeodetic,
  propagate,
  gstime,
  twoline2satrec,
  type SatRec,
} from "satellite.js";
import { nayanDataEngine } from "../engine";
import type { NayanDataProvider } from "../provider";
import type { NayanSatellite, NayanSatelliteCategory } from "./types";

const SATNOGS_PROXY_URL = "/api/satellites";
const EARTH_RADIUS_KM = 6378.137;
const SATELLITE_CACHE_TTL_MS = 2 * 60 * 60 * 1000;
const TWO_PI = Math.PI * 2;

export type NayanSatelliteRecord = {
  satellite: NayanSatellite;
  satrec: SatRec;
};

type SatnogsTle = {
  sat_id?: string;
  norad_cat_id?: number;
  tle0?: string;
  tle1?: string;
  tle2?: string;
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

function julianDateToUnixMs(julianDate: number): number {
  return (julianDate - 2440587.5) * 86400000;
}

function toNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function normalizeTle(item: SatnogsTle): NayanSatelliteRecord | null {
  const tle1 = typeof item.tle1 === "string" ? item.tle1.trimEnd() : "";
  const tle2 = typeof item.tle2 === "string" ? item.tle2.trimEnd() : "";
  if (!tle1 || !tle2) return null;

  let satrec: SatRec;
  try {
    satrec = twoline2satrec(tle1, tle2);
  } catch {
    return null;
  }

  const noradCatalogId = toNumber(item.norad_cat_id ?? satrec.satnum);
  if (noradCatalogId === null) return null;

  const rawName = typeof item.tle0 === "string" ? item.tle0.replace(/^0\s*/, "").trim() : "";
  const name = rawName || `NORAD ${noradCatalogId}`;
  const classification = classifySatellite(name);
  const epoch = julianDateToUnixMs(satrec.jdsatepoch);
  const meanMotionRevolutionsPerDay = satrec.no * 1440 / TWO_PI;

  if (!Number.isFinite(epoch) || !Number.isFinite(meanMotionRevolutionsPerDay)) return null;

  return {
    satellite: {
      id: String(noradCatalogId),
      name,
      noradCatalogId,
      objectId: item.sat_id?.trim() || null,
      epoch,
      meanMotionRevolutionsPerDay,
      eccentricity: satrec.ecco,
      inclinationDeg: satrec.inclo * (180 / Math.PI),
      rightAscensionDeg: satrec.nodeo * (180 / Math.PI),
      argumentOfPerigeeDeg: satrec.argpo * (180 / Math.PI),
      meanAnomalyDeg: satrec.mo * (180 / Math.PI),
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

export const satnogsActiveSatelliteProvider: NayanDataProvider<NayanSatelliteRecord[]> = {
  key: "satellites.satnogs.tle",
  async fetch(signal) {
    const response = await fetch(SATNOGS_PROXY_URL, {
      signal,
      headers: { Accept: "application/json" },
      cache: "no-store",
    });

    if (!response.ok) {
      let message = `Satellite data service failed (${response.status})`;
      try {
        const body = (await response.json()) as { error?: string };
        if (body.error) message = body.error;
      } catch {
        // Keep the status-based message when the API response is not JSON.
      }
      throw new Error(message);
    }

    const payload = (await response.json()) as SatnogsTle[];
    const records = Array.isArray(payload)
      ? payload.map(normalizeTle).filter((record): record is NayanSatelliteRecord => record !== null)
      : [];

    if (!records.length) throw new Error("Satellite provider returned no usable TLEs");
    return records;
  },
};

export async function fetchActiveSatellites(signal?: AbortSignal): Promise<NayanSatelliteRecord[]> {
  const result = await nayanDataEngine.get(satnogsActiveSatelliteProvider, {
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
