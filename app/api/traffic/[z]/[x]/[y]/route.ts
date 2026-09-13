import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const HERE_TRAFFIC_URL = "https://traffic.maps.hereapi.com/v3/flow/mc";

function isIntegerInRange(value: string, min: number, max: number) {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed >= min && parsed <= max;
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ z: string; x: string; y: string }> },
) {
  const apiKey = process.env.HERE_API_KEY?.trim();
  if (!apiKey) {
    return NextResponse.json(
      { error: "HERE_API_KEY is not configured." },
      { status: 503 },
    );
  }

  const { z, x, y } = await params;
  if (!isIntegerInRange(z, 0, 22)) {
    return NextResponse.json({ error: "Invalid zoom level." }, { status: 400 });
  }

  const zoom = Number(z);
  const maxTile = 2 ** zoom - 1;
  if (!isIntegerInRange(x, 0, maxTile) || !isIntegerInRange(y, 0, maxTile)) {
    return NextResponse.json({ error: "Invalid tile coordinates." }, { status: 400 });
  }

  const upstream = await fetch(
    `${HERE_TRAFFIC_URL}/${zoom}/${Number(x)}/${Number(y)}/png?apiKey=${encodeURIComponent(apiKey)}`,
    {
      headers: {
        Accept: "image/png",
      },
      cache: "no-store",
    },
  );

  if (!upstream.ok) {
    const body = await upstream.text().catch(() => "");
    return new NextResponse(body || "HERE traffic tile unavailable.", {
      status: upstream.status,
      headers: {
        "Content-Type": upstream.headers.get("content-type") ?? "text/plain; charset=utf-8",
        "Cache-Control": "no-store",
      },
    });
  }

  const image = await upstream.arrayBuffer();
  return new NextResponse(image, {
    status: 200,
    headers: {
      "Content-Type": "image/png",
      "Cache-Control": "public, max-age=45, stale-while-revalidate=15",
      "X-Nayan-Traffic-Source": "HERE Traffic Flow",
    },
  });
}
