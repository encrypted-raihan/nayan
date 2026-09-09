import { nayanDataEngine } from "../engine";
import type { NayanDataProvider } from "../provider";
import {
  AIRCRAFT_CACHE_SECONDS,
  AIRCRAFT_QUERY_CENTERS,
  AIRCRAFT_QUERY_RADIUS_NM,
  AIRCRAFT_REGION,
} from "./config";
import type { AircraftCategory, NayanAircraft } from "./types";

type AdsbAircraft = {
  hex?: string;
  flight?: string | null;
  r?: string | null;
  t?: string | null;
  category?: string | null;
  dbFlags?: number | null;
  lat?: number | null;
  lon?: number | null;
  alt_baro?: number | "ground" | null;
  gs?: number | null;
  track?: number | null;
  true_heading?: number | null;
  baro_rate?: number | null;
  on_ground?: boolean | null;
  squawk?: string | null;
  seen?: number | null;
  seen_pos?: number | null;
};

const AIRCRAFT_PROXY_URL = "/api/aircraft";
const AIRCRAFT_CACHE_TTL_MS = AIRCRAFT_CACHE_SECONDS * 1000;
const KNOTS_TO_METERS_PER_SECOND = 0.514444;
const FEET_TO_METERS = 0.3048;
const FEET_PER_MINUTE_TO_METERS_PER_SECOND = FEET_TO_METERS / 60;

function textOrNull(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const normalized = value.trim();
  return normalized ? normalized : null;
}

function finiteNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function normalizeCategory(raw: string | null, aircraftType: string | null, dbFlags: number | null): AircraftCategory {
  if (dbFlags !== null && (dbFlags & 1) !== 0) return "military";

  const category = raw?.toUpperCase() ?? "";
  if (category === "A5" || category === "A4") return "heavy";
  if (category === "A3") return "airliner";
  if (category === "A7" || /^(H|R)/i.test(aircraftType ?? "")) return "rotorcraft";
  if (["B0", "B1", "B2", "B3", "B6"].includes(category)) return "light";
  if (["A1", "A2", "A6"].includes(category)) return "general-aviation";
  if (category.startsWith("B")) return "special";
  return "unknown";
}

function normalizeAircraft(item: AdsbAircraft, seenAt: number, source = "adsb.lol"): NayanAircraft | null {
  const icao24 = textOrNull(item.hex)?.toLowerCase() ?? null;
  const latitude = finiteNumber(item.lat);
  const longitude = finiteNumber(item.lon);
  if (!icao24 || latitude === null || longitude === null) return null;
  if (latitude < AIRCRAFT_REGION.minLat || latitude > AIRCRAFT_REGION.maxLat) return null;
  if (longitude < AIRCRAFT_REGION.minLon || longitude > AIRCRAFT_REGION.maxLon) return null;

  const aircraftType = textOrNull(item.t);
  const callsign = textOrNull(item.flight);
  const registration = textOrNull(item.r);
  const altitudeMeters = item.alt_baro === "ground" || item.on_ground
    ? null
    : finiteNumber(item.alt_baro) !== null
      ? finiteNumber(item.alt_baro)! * FEET_TO_METERS
      : null;
  const groundSpeedMetersPerSecond = finiteNumber(item.gs) !== null
    ? finiteNumber(item.gs)! * KNOTS_TO_METERS_PER_SECOND
    : null;
  const headingDeg = finiteNumber(item.true_heading) ?? finiteNumber(item.track);
  const verticalRateMetersPerSecond = finiteNumber(item.baro_rate) !== null
    ? finiteNumber(item.baro_rate)! * FEET_PER_MINUTE_TO_METERS_PER_SECOND
    : null;

  const seenSeconds = Math.max(0, finiteNumber(item.seen_pos) ?? finiteNumber(item.seen) ?? 0);
  const lastSeen = seenAt - seenSeconds * 1000;
  const rawCategory = textOrNull(item.category);

  return {
    id: icao24,
    icao24,
    callsign,
    registration,
    aircraftType,
    category: normalizeCategory(rawCategory, aircraftType, finiteNumber(item.dbFlags)),
    rawCategory,
    latitude,
    longitude,
    altitudeMeters,
    groundSpeedMetersPerSecond,
    headingDeg,
    verticalRateMetersPerSecond,
    onGround: Boolean(item.on_ground || item.alt_baro === "ground"),
    lastSeen,
    source,
    squawk: textOrNull(item.squawk),
  };
}

export const adsbLolAircraftProvider: NayanDataProvider<NayanAircraft[]> = {
  key: "aircraft.adsb-lol",
  async fetch(signal) {
    const response = await fetch(AIRCRAFT_PROXY_URL, {
      signal,
      cache: "no-store",
      headers: { Accept: "application/json" },
    });

    if (!response.ok) {
      let message = `Aircraft data service failed (${response.status})`;
      try {
        const body = (await response.json()) as { error?: string };
        if (body.error) message = body.error;
      } catch {
        // Keep the status-based message.
      }
      throw new Error(message);
    }

    const payload = (await response.json()) as {
      aircraft?: AdsbAircraft[];
      fetchedAt?: number;
      source?: string;
    };
    const seenAt = finiteNumber(payload.fetchedAt) ?? Date.now();
    const records = Array.isArray(payload.aircraft)
      ? payload.aircraft
          .map((item) => normalizeAircraft(item, seenAt, payload.source ?? "adsb.lol"))
          .filter((item): item is NayanAircraft => item !== null)
      : [];

    const deduped = new Map<string, NayanAircraft>();
    for (const aircraft of records) {
      const existing = deduped.get(aircraft.icao24);
      if (!existing || aircraft.lastSeen > existing.lastSeen) deduped.set(aircraft.icao24, aircraft);
    }

    return [...deduped.values()].sort((a, b) => b.lastSeen - a.lastSeen);
  },
};

export async function fetchIndiaAircraft(signal?: AbortSignal): Promise<NayanAircraft[]> {
  const result = await nayanDataEngine.get(adsbLolAircraftProvider, {
    cacheTtlMs: AIRCRAFT_CACHE_TTL_MS,
    signal,
  });
  return result.data;
}

export { AIRCRAFT_QUERY_CENTERS, AIRCRAFT_QUERY_RADIUS_NM };
