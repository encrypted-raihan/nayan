import { NextResponse } from "next/server";
import {
  AIRCRAFT_CACHE_SECONDS,
  AIRCRAFT_QUERY_CENTERS,
  AIRCRAFT_QUERY_RADIUS_NM,
  AIRCRAFT_STALE_SECONDS,
} from "../../../lib/data/aircraft/config";

const ADSB_LOL_BASE = "https://api.adsb.lol/v2/lat";
const RETRY_AFTER_MS = 1_500;

type AircraftPayload = {
  aircraft: unknown[];
  fetchedAt: number;
  source: "adsb.lol";
  queryCenters: number;
  successfulQueries: number;
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

async function fetchRegion(center: { lat: number; lon: number }, signal: AbortSignal) {
  const url = aircraftUrl(center.lat, center.lon);
  let lastStatus = 0;

  for (let attempt = 0; attempt < 2; attempt += 1) {
    const response = await fetch(url, {
      headers: {
        Accept: "application/json",
        "User-Agent": "NAYAN/0.1 (+https://github.com/encrypted-raihan/nayan)",
      },
      cache: "no-store",
      signal,
    });

    if (response.ok) {
      return (await response.json()) as {
        ac?: unknown[];
        now?: number;
        msg?: string;
        total?: number;
      };
    }

    lastStatus = response.status;
    const body = await response.text();
    console.warn(
      `ADSB.lol returned ${response.status} for ${center.lat},${center.lon}:`,
      body.slice(0, 300),
    );

    if ((response.status === 420 || response.status === 429) && attempt === 0) {
      await sleep(RETRY_AFTER_MS);
      continue;
    }

    break;
  }

  throw new Error(`ADSB.lol request failed (${lastStatus})`);
}

async function refreshSnapshot(signal: AbortSignal): Promise<AircraftPayload> {
  const center = AIRCRAFT_QUERY_CENTERS[0];
  const payload = await fetchRegion(center, signal);
  const aircraft = Array.isArray(payload.ac) ? payload.ac : [];
  const fetchedAt = Date.now();

  const snapshot: AircraftPayload = {
    aircraft,
    fetchedAt,
    source: "adsb.lol",
    queryCenters: 1,
    successfulQueries: 1,
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
      console.warn(`Using ADSB.lol snapshot from ${Math.round(ageMs / 1000)}s ago after upstream failure.`);
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
      {
        ...payload,
        ageMs,
      },
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
