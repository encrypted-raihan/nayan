import { NextResponse } from "next/server";

const CELESTRAK_URL = "https://celestrak.org/NORAD/elements/gp.php?GROUP=active&FORMAT=JSON";

export const revalidate = 7200;

export async function GET(request: Request) {
  try {
    const response = await fetch(CELESTRAK_URL, {
      headers: {
        Accept: "application/json",
        "User-Agent": "NAYAN/0.1 (+https://github.com/encrypted-raihan/nayan)",
      },
      next: { revalidate: 7200 },
      signal: request.signal,
    });

    if (!response.ok) {
      const body = await response.text();
      console.error(`CelesTrak returned ${response.status}:`, body.slice(0, 500));
      return NextResponse.json(
        {
          error:
            response.status === 403
              ? "CelesTrak temporarily rejected the satellite request. Their service enforces a two-hour update limit; wait for the next data update rather than retrying repeatedly."
              : `CelesTrak satellite request failed (${response.status})`,
        },
        { status: 502 },
      );
    }

    const payload = await response.json();
    return NextResponse.json(payload, {
      headers: {
        "Cache-Control": "public, s-maxage=7200, stale-while-revalidate=86400",
      },
    });
  } catch (error) {
    if ((error as Error)?.name === "AbortError") {
      return NextResponse.json({ error: "Satellite request aborted" }, { status: 499 });
    }

    console.error("NAYAN satellite API failed:", error);
    return NextResponse.json(
      { error: "Unable to reach the satellite data provider." },
      { status: 502 },
    );
  }
}
