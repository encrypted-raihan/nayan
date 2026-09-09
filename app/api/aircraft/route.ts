import { NextResponse } from "next/server";
import {
  AIRCRAFT_CACHE_SECONDS,
  AIRCRAFT_QUERY_CENTERS,
  AIRCRAFT_QUERY_DELAY_MS,
  AIRCRAFT_QUERY_RADIUS_NM,
  AIRCRAFT_STALE_SECONDS,
} from "../../../lib/data/aircraft/config";

const ADSB_LOL_BASE = "https://api.adsb.lol/v2/lat";

type AircraftPayload = {
  aircraft: unknown[];
  fetchedAt: number;
  source: "adsb.lol";
  queryCenters: number;
  successfulQueries: number;
  failedQueries: number;
  stale: boolean;
};

let cachedSnapshot: AircraftPayload | null = null;
let cacheExpiresAt = 0;
let refreshInFlight: Promise<AircraftPayload> | null = null;

export const revalidate = AIRCRAFT_CACHE_SECONDS;

function aircraftUrl(lat: number, lon: number) {
  return `${ADSB_LOL_BASE}/${lat.toFixed(4)}/lon/${lon.toFixed(4)}/dist/${AIRCRAFT_QUERY_RADIUS_NM}`;
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

type AdsbResponse = {
  ac?: unknown[];
  now?: number;
  msg?: string;
  total?: number;
};

async function fetchRegion(
  center: { lat: number; lon: number; label: string },
  signal: AbortSignal,
): Promise<AdsbResponse | null> {
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
      console.warn(
        `ADSB.lol ${center.label} returned ${response.status}:`,
        body.slice(0, 300),
      );
      return null;
    }

    return (await response.json()) as AdsbResponse;
  } catch (error) {
    if ((error as Error)?.name === "AbortError") throw error;
    console.warn(`ADSB.lol ${center.label} query failed:`, error);
    return null;
  }
}

async function refreshSnapshot(signal: AbortSignal): Promise<AircraftPayload> {
  const records: unknown[] = [];
  let successfulQueries = 0;
  let failedQueries = 0;

  for (let index = 0; index < AIRCRAFT_QUERY_CENTERS.length; index += 1) {
    const center = AIRCRAFT_QUERY_CENTERS[index];
    const payload = await fetchRegion(center, signal);

    if (payload && Array.isArray(payload.ac)) {
      records.push(...payload.ac);
      successfulQueries += 1;
    } else {
      failedQueries += 1;
    }

    // Keep a deliberate gap between upstream requests. This is a collector,
    // not a fan-out: one region finishes before the next begins.
    if (index < AIRCRAFT_QUERY_CENTERS.length - 1) {
      await sleep(AIRCRAFT_QUERY_DELAY_MS);
    }
  }

  if (successfulQueries === 0) {
    throw new Error("All ADSB.lol aircraft grid queries failed");
  }

  const fetchedAt = Date.now();
  const snapshot: AircraftPayload = {
    aircraft: records,
    fetchedAt,
    source: "adsb.lol",
    queryCenters: AIRCRAFT_QUERY_CENTERS.length,
    successfulQueries,
    failedQueries,
    stale: false,
  };

  cachedSnapshot = snapshot;
  cacheExpiresAt = fetchedAt + AIRCRAFT_CACHE_SECONDS * 1000;
  return snapshot;
}

async function getSnapshot(signal: AbortSignal): Promise<AircraftPayload> {
  const now = Date.now();

  if (cachedSnapshot && now < cacheExpiresAt) {
    return cachedSnapshot;
  }

  if (refreshInFlight) return refreshInFlight;

  refreshInFlight = refreshSnapshot(signal).finally(() => {
    refreshInFlight = null;
  });

  try {
    return await refreshInFlight;
  } catch (error) {
    const ageMs = cachedSnapshot ? now - cachedSnapshot.fetchedAt : Number.POSITIVE_INFINITY;
    if (cachedSnapshot && ageMs <= AIRCRAFT_STALE_SECONDS * 1000) {
      console.warn(`Using aircraft snapshot from ${Math.round(ageMs / 1000)}s ago after grid refresh failure.`);
      return { ...cachedSnapshot, stale: true };
    }
    throw error;
  }
}

export async function GET(request: Request) {
  try {
    const payload = await getSnapshot(request.signal);
    const ageMs = Date.now() - payload.fetchedAt;

    return NextResponse.json(
      { ...payload, ageMs },
      {
        headers: {
          "Cache-Control": `public, s-maxage=${AIRCRAFT_CACHE_SECONDS}, stale-while-revalidate=${AIRCRAFT_STALE_SECONDS}`,
          "X-NAYAN-Aircraft-Source": "ADSB.lol",
          "X-NAYAN-Aircraft-Stale": String(payload.stale),
        },
      },
    );
  } catch (error) {
    if ((error as Error)?.name === "AbortError") {
      return NextResponse.json({ error: "Aircraft request aborted" }, { status: 499 });
    }

    console.warn("NAYAN aircraft API unavailable:", error);
    return NextResponse.json(
      { error: "Unable to reach the ADSB.lol aircraft data provider." },
      { status: 502 },
    );
  }
}
