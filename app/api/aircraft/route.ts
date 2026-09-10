import { NextResponse } from "next/server";
import {
  AIRCRAFT_CACHE_SECONDS,
  AIRCRAFT_MAX_DISPLAY,
  AIRCRAFT_QUERY_CENTERS,
  AIRCRAFT_QUERY_RADIUS_NM,
  AIRCRAFT_STALE_SECONDS,
} from "../../../lib/data/aircraft/config";

const ADSB_LOL_BASE = "https://api.adsb.lol/v2/lat";
const RATE_LIMIT_BACKOFF_MS = 10_000;

type AdsbAircraft = Record<string, unknown>;
type AdsbResponse = {
  ac?: AdsbAircraft[];
  now?: number;
  msg?: string;
  total?: number;
};

type RegionalSnapshot = {
  aircraft: AdsbAircraft[];
  fetchedAt: number;
};

type AircraftPayload = {
  aircraft: AdsbAircraft[];
  fetchedAt: number;
  source: "adsb.lol";
  queryCenters: number;
  successfulQueries: number;
  failedQueries: number;
  complete: boolean;
  stale: boolean;
  updatedCenter: string | null;
};

// Instead of waiting 30–60 seconds to scan the whole country, NAYAN collects
// one priority region per request and accumulates the successful snapshots.
// This keeps activation responsive while building broad national coverage.
const regionalSnapshots = new Map<string, RegionalSnapshot>();
let nextCenterIndex = 0;
let refreshInFlight: Promise<AircraftPayload> | null = null;
let lastRateLimitedAt = 0;

// Next.js requires route config values to be statically analyzable literals.
export const revalidate = 10;

function aircraftUrl(lat: number, lon: number) {
  return `${ADSB_LOL_BASE}/${lat.toFixed(4)}/lon/${lon.toFixed(4)}/dist/${AIRCRAFT_QUERY_RADIUS_NM}`;
}

async function fetchRegion(
  center: { lat: number; lon: number; label: string },
  signal: AbortSignal,
): Promise<{ payload: AdsbResponse | null; status: number | null }> {
  try {
    const response = await fetch(aircraftUrl(center.lat, center.lon), {
      headers: {
        Accept: "application/json",
        "User-Agent": "NAYAN/0.1 (+https://github.com/encrypted-raihan/nayan)",
      },
      cache: "no-store",
      signal,
    });

    if (!response.ok) {
      const body = await response.text();
      console.warn(`ADSB.lol ${center.label} returned ${response.status}:`, body.slice(0, 300));
      return { payload: null, status: response.status };
    }

    return { payload: (await response.json()) as AdsbResponse, status: response.status };
  } catch (error) {
    if ((error as Error)?.name === "AbortError") throw error;
    console.warn(`ADSB.lol ${center.label} query failed:`, error);
    return { payload: null, status: null };
  }
}

function buildMergedSnapshot(updatedCenter: string | null, stale = false): AircraftPayload {
  const deduped = new Map<string, AdsbAircraft>();
  let latestFetchedAt = 0;

  for (const snapshot of regionalSnapshots.values()) {
    latestFetchedAt = Math.max(latestFetchedAt, snapshot.fetchedAt);
    for (const aircraft of snapshot.aircraft) {
      const hex = typeof aircraft.hex === "string" ? aircraft.hex.trim().toLowerCase() : "";
      if (!hex) continue;
      deduped.set(hex, aircraft);
    }
  }

  // Keep the freshest positions when the accumulated regional snapshots become
  // large. This protects Cesium from thousands of billboards while preserving
  // the visual impression of traffic across the whole country.
  const aircraft = [...deduped.values()]
    .sort((a, b) => {
      const aSeen = typeof a.seen_pos === "number" ? a.seen_pos : typeof a.seen === "number" ? a.seen : 9999;
      const bSeen = typeof b.seen_pos === "number" ? b.seen_pos : typeof b.seen === "number" ? b.seen : 9999;
      return aSeen - bSeen;
    })
    .slice(0, AIRCRAFT_MAX_DISPLAY);

  return {
    aircraft,
    fetchedAt: latestFetchedAt || Date.now(),
    source: "adsb.lol",
    queryCenters: AIRCRAFT_QUERY_CENTERS.length,
    successfulQueries: regionalSnapshots.size,
    failedQueries: Math.max(0, AIRCRAFT_QUERY_CENTERS.length - regionalSnapshots.size),
    complete: regionalSnapshots.size === AIRCRAFT_QUERY_CENTERS.length,
    stale,
    updatedCenter,
  };
}

async function refreshOneRegion(signal: AbortSignal): Promise<AircraftPayload> {
  const center = AIRCRAFT_QUERY_CENTERS[nextCenterIndex];
  nextCenterIndex = (nextCenterIndex + 1) % AIRCRAFT_QUERY_CENTERS.length;

  const result = await fetchRegion(center, signal);

  if (result.payload && Array.isArray(result.payload.ac)) {
    regionalSnapshots.set(center.label, {
      aircraft: result.payload.ac,
      fetchedAt: Date.now(),
    });
    lastRateLimitedAt = 0;
    return buildMergedSnapshot(center.label, false);
  }

  if (result.status === 420 || result.status === 429) {
    lastRateLimitedAt = Date.now();
    console.warn(`ADSB.lol throttled the ${center.label} region; keeping accumulated aircraft data.`);
  }

  if (regionalSnapshots.size > 0) {
    return buildMergedSnapshot(center.label, true);
  }

  throw new Error(`ADSB.lol ${center.label} region unavailable (${result.status ?? "network error"})`);
}

async function getSnapshot(signal: AbortSignal): Promise<AircraftPayload> {
  if (refreshInFlight) return refreshInFlight;

  const now = Date.now();
  if (lastRateLimitedAt && now - lastRateLimitedAt < RATE_LIMIT_BACKOFF_MS) {
    if (regionalSnapshots.size > 0) return buildMergedSnapshot(null, true);
  }

  refreshInFlight = refreshOneRegion(signal).finally(() => {
    refreshInFlight = null;
  });

  try {
    return await refreshInFlight;
  } catch (error) {
    const snapshot = buildMergedSnapshot(null, true);
    if (regionalSnapshots.size > 0 && Date.now() - snapshot.fetchedAt <= AIRCRAFT_STALE_SECONDS * 1000) {
      return snapshot;
    }
    throw error;
  }
}

export async function GET(request: Request) {
  try {
    const payload = await getSnapshot(request.signal);
    const ageMs = Math.max(0, Date.now() - payload.fetchedAt);

    return NextResponse.json(
      { ...payload, ageMs },
      {
        headers: {
          "Cache-Control": `public, s-maxage=${AIRCRAFT_CACHE_SECONDS}, stale-while-revalidate=${AIRCRAFT_STALE_SECONDS}`,
          "X-NAYAN-Aircraft-Source": "ADSB.lol",
          "X-NAYAN-Aircraft-Stale": String(payload.stale),
          "X-NAYAN-Aircraft-Complete": String(payload.complete),
          "X-NAYAN-Aircraft-Updated-Center": payload.updatedCenter ?? "none",
        },
      },
    );
  } catch (error) {
    if ((error as Error)?.name === "AbortError") {
      return NextResponse.json({ error: "Aircraft request aborted" }, { status: 499 });
    }

    console.warn("NAYAN aircraft API unavailable:", error);
    return NextResponse.json(
      { error: "Unable to reach the ADSB.lol aircraft data provider yet." },
      { status: 502 },
    );
  }
}
