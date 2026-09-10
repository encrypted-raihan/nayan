import { NextResponse } from "next/server";

const SATNOGS_TLE_URL = "https://db.satnogs.org/api/tle/?format=json&limit=1000";
const CACHE_SECONDS = 60 * 60 * 2;
const MAX_PAGES = 12;

type SatnogsTle = {
  sat_id?: string;
  norad_cat_id?: number;
  tle0?: string;
  tle1?: string;
  tle2?: string;
  [key: string]: unknown;
};

type SatnogsPage = SatnogsTle[] | { results?: SatnogsTle[]; next?: string | null };

// Next.js requires route config values such as revalidate to be statically
// analyzable literals. Keep the runtime cache constant separate from this export.
export const revalidate = 7200;

async function fetchSatnogsPage(url: string, signal: AbortSignal) {
  const response = await fetch(url, {
    headers: {
      Accept: "application/json",
      "User-Agent": "NAYAN/0.1 (+https://github.com/encrypted-raihan/nayan)",
    },
    next: { revalidate: CACHE_SECONDS },
    signal,
  });

  if (!response.ok) {
    const body = await response.text();
    console.warn(`SatNOGS DB returned ${response.status}:`, body.slice(0, 500));
    throw new Error(`SatNOGS satellite request failed (${response.status})`);
  }

  return (await response.json()) as SatnogsPage;
}

export async function GET(request: Request) {
  try {
    const records: SatnogsTle[] = [];
    let nextUrl: string | null = SATNOGS_TLE_URL;

    for (let page = 0; page < MAX_PAGES && nextUrl; page += 1) {
      const payload = await fetchSatnogsPage(nextUrl, request.signal);
      const pageRecords = Array.isArray(payload) ? payload : payload.results ?? [];
      records.push(...pageRecords);
      nextUrl = Array.isArray(payload)
        ? null
        : payload.next
          ? new URL(payload.next, SATNOGS_TLE_URL).toString()
          : null;
    }

    if (!records.length) {
      return NextResponse.json(
        { error: "SatNOGS returned no usable satellite TLE data." },
        { status: 502 },
      );
    }

    return NextResponse.json(records, {
      headers: {
        "Cache-Control": `public, s-maxage=${CACHE_SECONDS}, stale-while-revalidate=86400`,
        "X-NAYAN-Satellite-Source": "SatNOGS DB",
      },
    });
  } catch (error) {
    if ((error as Error)?.name === "AbortError") {
      return NextResponse.json({ error: "Satellite request aborted" }, { status: 499 });
    }

    console.warn("NAYAN satellite API unavailable:", error);
    return NextResponse.json(
      { error: "Unable to reach the SatNOGS satellite data provider." },
      { status: 502 },
    );
  }
}
