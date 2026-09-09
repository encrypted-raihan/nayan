import { NextResponse } from "next/server";
import {
  AIRCRAFT_QUERY_CENTERS,
  AIRCRAFT_QUERY_RADIUS_NM,
} from "../../../lib/data/aircraft/config";

const ADSB_LOL_BASE = "https://api.adsb.lol/v2/lat";
const CACHE_SECONDS = 15;
const STALE_SECONDS = 60;

export const revalidate = CACHE_SECONDS;

function aircraftUrl(lat: number, lon: number) {
  return `${ADSB_LOL_BASE}/${lat.toFixed(4)}/lon/${lon.toFixed(4)}/dist/${AIRCRAFT_QUERY_RADIUS_NM}`;
}

async function fetchRegion(center: { lat: number; lon: number }, signal: AbortSignal) {
  const response = await fetch(aircraftUrl(center.lat, center.lon), {
    headers: {
      Accept: "application/json",
      "User-Agent": "NAYAN/0.1 (+https://github.com/encrypted-raihan/nayan)",
    },
    next: { revalidate: CACHE_SECONDS },
    signal,
  });

  if (!response.ok) {
    const body = await response.text();
    console.warn(`ADSB.lol returned ${response.status} for ${center.lat},${center.lon}:`, body.slice(0, 300));
    throw new Error(`ADSB.lol request failed (${response.status})`);
  }

  return (await response.json()) as {
    ac?: unknown[];
    now?: number;
    msg?: string;
    total?: number;
  };
}

export async function GET(request: Request) {
  try {
    const results = await Promise.allSettled(
      AIRCRAFT_QUERY_CENTERS.map((center) => fetchRegion(center, request.signal)),
    );

    if (results.every((result) => result.status === "rejected")) {
      throw new Error("All ADSB.lol region queries failed");
    }

    const aircraft = results.flatMap((result) =>
      result.status === "fulfilled" && Array.isArray(result.value.ac) ? result.value.ac : [],
    );

    return NextResponse.json(
      {
        aircraft,
        fetchedAt: Date.now(),
        source: "adsb.lol",
        queryCenters: AIRCRAFT_QUERY_CENTERS.length,
        successfulQueries: results.filter((result) => result.status === "fulfilled").length,
      },
      {
        headers: {
          "Cache-Control": `public, s-maxage=${CACHE_SECONDS}, stale-while-revalidate=${STALE_SECONDS}`,
          "X-NAYAN-Aircraft-Source": "ADSB.lol",
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
