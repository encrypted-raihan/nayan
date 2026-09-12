import type { ShipLayerResponse } from "./provider";

export type { NayanShip, ShipLayerResponse } from "./provider";

export async function fetchIndiaShips(signal?: AbortSignal): Promise<ShipLayerResponse> {
  const response = await fetch("/api/ships", {
    cache: "no-store",
    signal,
  });

  const payload = await response.json().catch(() => null);
  if (!response.ok) {
    throw new Error(payload?.message ?? "Unable to load ship data.");
  }

  return payload as ShipLayerResponse;
}
