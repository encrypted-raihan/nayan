export const SHIP_REGION = {
  minLat: 0,
  maxLat: 30,
  minLon: 55,
  maxLon: 110,
} as const;

export type NayanShip = {
  id: string;
  mmsi: string;
  name: string | null;
  latitude: number;
  longitude: number;
  speedKnots: number | null;
  courseDeg: number | null;
  headingDeg: number | null;
  navigationStatus: number | null;
  lastSeen: number;
  source: "aisstream";
};

export type ShipLayerResponse = {
  ships: NayanShip[];
  fetchedAt: number;
  source: "aisstream";
  connected: boolean;
  stale: boolean;
  error?: string;
  diagnostics?: {
    subscribed: boolean;
    compressionEnabled: boolean | null;
    connecting: boolean;
    receivedMessages: number;
    lastMessageType: string | null;
    lastMessageAt: number;
    lastCloseCode: number | null;
    lastCloseReason: string | null;
    implementation: string;
    boundingBoxes: number[][][][];
  };
};

export function isShipInRegion(latitude: number, longitude: number) {
  return (
    latitude >= SHIP_REGION.minLat &&
    latitude <= SHIP_REGION.maxLat &&
    longitude >= SHIP_REGION.minLon &&
    longitude <= SHIP_REGION.maxLon
  );
}

export function normalizeAisPositionMessage(payload: any): NayanShip | null {
  if (payload?.MessageType !== "PositionReport") return null;

  const metadata = payload?.MetaData ?? {};
  const report = payload?.Message?.PositionReport ?? {};
  const latitude = Number.isFinite(Number(metadata.Latitude))
    ? Number(metadata.Latitude)
    : Number(report.Latitude);
  const longitude = Number.isFinite(Number(metadata.Longitude))
    ? Number(metadata.Longitude)
    : Number(report.Longitude);
  const mmsi = String(metadata.MMSI ?? report.UserID ?? "").trim();

  if (!mmsi || !Number.isFinite(latitude) || !Number.isFinite(longitude)) return null;
  if (!isShipInRegion(latitude, longitude)) return null;
  if (latitude < -90 || latitude > 90 || longitude < -180 || longitude > 180) return null;

  const finiteOrNull = (value: unknown) => {
    const number = Number(value);
    return Number.isFinite(number) ? number : null;
  };

  return {
    id: `aisstream-${mmsi}`,
    mmsi,
    name: typeof metadata.ShipName === "string" && metadata.ShipName.trim() ? metadata.ShipName.trim() : null,
    latitude,
    longitude,
    speedKnots: finiteOrNull(report.Sog),
    courseDeg: finiteOrNull(report.Cog),
    headingDeg: finiteOrNull(report.TrueHeading),
    navigationStatus: finiteOrNull(report.NavigationalStatus),
    lastSeen: Date.now(),
    source: "aisstream",
  };
}
