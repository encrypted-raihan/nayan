import { nayanDataEngine } from "../engine";
import type { NayanDataProvider } from "../provider";
import { AIRCRAFT_CACHE_SECONDS, AIRCRAFT_REGION } from "./config";
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
const EARTH_RADIUS_METERS = 6_371_000;
const MAX_POSITION_PREDICTION_SECONDS = 20;

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

function normalizeLongitude(longitudeDeg: number): number {
  return ((longitudeDeg + 540) % 360) - 180;
}

function predictPosition(
  latitudeDeg: number,
  longitudeDeg: number,
  altitudeMeters: number | null,
  groundSpeedMetersPerSecond: number | null,
  headingDeg: number | null,
  verticalRateMetersPerSecond: number | null,
  ageSeconds: number,
) {
  if (
    groundSpeedMetersPerSecond === null ||
    headingDeg === null ||
    groundSpeedMetersPerSecond <= 0 ||
    ageSeconds <= 0
  ) {
    return { latitudeDeg, longitudeDeg, altitudeMeters };
  }

  const distanceMeters = groundSpeedMetersPerSecond * ageSeconds;
  const angularDistance = distanceMeters / EARTH_RADIUS_METERS;
  const bearing = (headingDeg * Math.PI) / 180;
  const latitude = (latitudeDeg * Math.PI) / 180;
  const longitude = (longitudeDeg * Math.PI) / 180;

  const sinLatitude = Math.sin(latitude);
  const cosLatitude = Math.cos(latitude);
  const sinAngularDistance = Math.sin(angularDistance);
  const cosAngularDistance = Math.cos(angularDistance);

  const predictedLatitude = Math.asin(
    sinLatitude * cosAngularDistance +
      cosLatitude * sinAngularDistance * Math.cos(bearing),
  );

  const predictedLongitude =
    longitude +
    Math.atan2(
      Math.sin(bearing) * sinAngularDistance * cosLatitude,
      cosAngularDistance - sinLatitude * Math.sin(predictedLatitude),
    );

  const predictedAltitude =
    altitudeMeters !== null && verticalRateMetersPerSecond !== null
      ? Math.max(0, altitudeMeters + verticalRateMetersPerSecond * ageSeconds)
      : altitudeMeters;

  return {
    latitudeDeg: (predictedLatitude * 180) / Math.PI,
    longitudeDeg: normalizeLongitude((predictedLongitude * 180) / Math.PI),
    altitudeMeters: predictedAltitude,
  };
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
  const altitudeRaw = finiteNumber(item.alt_baro);
  const altitudeMeters = item.alt_baro === "ground" || item.on_ground
    ? null
    : altitudeRaw !== null ? altitudeRaw * FEET_TO_METERS : null;
  const groundSpeedRaw = finiteNumber(item.gs);
  const groundSpeedMetersPerSecond = groundSpeedRaw !== null
    ? groundSpeedRaw * KNOTS_TO_METERS_PER_SECOND
    : null;
  const headingDeg = finiteNumber(item.true_heading) ?? finiteNumber(item.track);
  const verticalRateRaw = finiteNumber(item.baro_rate);
  const verticalRateMetersPerSecond = verticalRateRaw !== null
    ? verticalRateRaw * FEET_PER_MINUTE_TO_METERS_PER_SECOND
    : null;
  const seenSeconds = Math.max(0, finiteNumber(item.seen_pos) ?? finiteNumber(item.seen) ?? 0);
  const lastSeen = seenAt - seenSeconds * 1000;
  const rawCategory = textOrNull(item.category);

  // ADS-B gives us a real observation timestamp plus ground speed and track.
  // Project only the short interval since that observation so the globe can
  // show continuous movement without inventing a long-term trajectory.
  const predictionAgeSeconds = Math.min(
    Math.max(0, (Date.now() - lastSeen) / 1000),
    MAX_POSITION_PREDICTION_SECONDS,
  );
  const predicted = predictPosition(
    latitude,
    longitude,
    altitudeMeters,
    groundSpeedMetersPerSecond,
    headingDeg,
    verticalRateMetersPerSecond,
    predictionAgeSeconds,
  );

  return {
    id: icao24,
    icao24,
    callsign,
    registration,
    aircraftType,
    category: normalizeCategory(rawCategory, aircraftType, finiteNumber(item.dbFlags)),
    rawCategory,
    latitude: predicted.latitudeDeg,
    longitude: predicted.longitudeDeg,
    altitudeMeters: predicted.altitudeMeters,
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
