import { NextResponse } from "next/server";
import {
  AIRCRAFT_CACHE_SECONDS,
  AIRCRAFT_QUERY_CENTERS,
  AIRCRAFT_QUERY_DELAY_MS,
  AIRCRAFT_QUERY_RADIUS_NM,
  AIRCRAFT_STALE_SECONDS,
} from "../../../lib/data/aircraft/config";

const ADSB_LOL_BASE = "https://api.adsb.lol/v2/lat";
const RATE_LIMIT_BACKOFF_MS = 10_000;
const EMPTY_RETRY_DELAY_MS = 2_000;

type AdsbAircraft = Record<string, unknown>;
type AdsbResponse = {
  ac?: AdsbAircraft[];
  now?: number;
  msg?: string;
  total?: number;
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
};

let cachedSnapshot: AircraftPayload | null = null;
let cacheExpiresAt = 0;
let refreshInFlight: Promise<AircraftPayload> | null = null;

export const revalidate = AIRCRAFT_CACHE_SECONDS;

function aircraftUrl(lat: number, lon: number) {
  return `${ADSB_LOL_BASE}/${lat.toFixed(4)}/lon/${lon.toFixed(4)}/dist/${AIRCRAFT_QUERY_RADIUS_NM}`;
}

function sleep(ms: number, signal: AbortSignal) {
  if (signal.aborted) return Promise.reject(new DOMException("Aborted", "AbortError"));
  return new Promise<void>((resolve, reject) => {
    const timer = setTimeout(resolve, ms);
    const onAbort = () => {
      clearTimeout(timer);
      reject(new DOMException("Aborted", "AbortError"));
    };
    signal.addEventListener("abort", onAbort, { once: true });
  });
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

async function refreshSnapshot(signal: AbortSignal): Promise<AircraftPayload> {
  const records: AdsbAircraft[] = [];
  let successfulQueries = 0;
  let failedQueries = 0;
  let throttled = false;

  // Walk the grid slowly and stop treating 429 as something to immediately retry.
  // The goal is steady coverage, not request bursts.
  for (let index = 0; index < AIRCRAFT_QUERY_CENTERS.length; index += 1) {
    const center = AIRCRAFT_QUERY_CENTERS[index];
    const result = await fetchRegion(center, signal);

    if (result.payload && Array.isArray(result.payload.ac)) {
      records.push(...result.payload.ac);
      successfulQueries += 1;
    } else {
      failedQueries += 1;
      if (result.status === 420 || result.status === 429) {
        throttled = true;
        await sleep(RATE_LIMIT_BACKOFF_MS, signal);
        break;
      }
    }

    if (index < AIRCRAFT_QUERY_CENTERS.length - 1) {
      await sleep(throttled ? RATE_LIMIT_BACKOFF_MS : AIRCRAFT_QUERY_DELAY_MS, signal);
    }
  }

  if (successfulQueries === 0) {
    throw new Error("No ADSB.lol aircraft grid cells succeeded");
  }

  const deduped = new Map<string, AdsbAircraft>();
  for (const aircraft of records) {
    const hex = typeof aircraft.hex === "string" ? aircraft.hex.trim().toLowerCase() : "";
    if (!hex) continue;
    deduped.set(hex, aircraft);
  }

  const fetchedAt = Date.now();
  const snapshot: AircraftPayload = {
    aircraft: [...deduped.values()],
    fetchedAt,
    source: "adsb.lol",
    queryCenters: AIRCRAFT_QUERY_CENTERS.length,
    successfulQueries,
    failedQueries,
    complete: successfulQueries === AIRCRAFT_QUERY_CENTERS.length,
    stale: false,
  };

  cachedSnapshot = snapshot;
  cacheExpiresAt = fetchedAt + AIRCRAFT_CACHE_SECONDS * 1000;
  return snapshot;
}

async function getSnapshot(signal: AbortSignal): Promise<AircraftPayload> {
  const now = Date.now();

  if (cachedSnapshot && now < cacheExpiresAt) return cachedSnapshot;
  if (refreshInFlight) return refreshInFlight;

  refreshInFlight = refreshSnapshot(signal).finally(() => {
    refreshInFlight = null;
  });

  try {
    return await refreshInFlight;
  } catch (error) {
    const ageMs = cachedSnapshot ? now - cachedSnapshot.fetchedAt : Number.POSITIVE_INFINITY;
    if (cachedSnapshot && ageMs <= AIRCRAFT_STALE_SECONDS * 1000) {
      console.warn(`Using aircraft snapshot from ${Math.round(ageMs / 1000)}s ago after upstream failure.`);
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
          "X-NAYAN-Aircraft-Complete": String(payload.complete),
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
