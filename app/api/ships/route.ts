import { normalizeAisPositionMessage, type NayanShip } from "../../../lib/data/ships/provider";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const AISSTREAM_URL = "wss://stream.aisstream.io/v0/stream";
const SHIP_STALE_MS = 20 * 60 * 1000;
const MAX_SHIPS = 2500;
const RECONNECT_BASE_MS = 2_000;
const RECONNECT_MAX_MS = 30_000;

// Three focused strips give NAYAN broad India + nearby-water coverage while
// avoiding spending the whole subscription on distant Southeast Asian traffic.
// AISStream expects each corner as [latitude, longitude].
const BOUNDING_BOXES = [
  [[0, 55], [30, 75]],
  [[0, 70], [30, 95]],
  [[0, 90], [30, 110]],
];

const INDIA_REGION = {
  minLat: 0,
  maxLat: 30,
  minLon: 55,
  maxLon: 110,
};

const SUBSCRIPTION_SIGNATURE = JSON.stringify(BOUNDING_BOXES);

type ShipStreamState = {
  socket: WebSocket | null;
  ships: Map<string, NayanShip>;
  connected: boolean;
  connecting: boolean;
  lastError: string | null;
  reconnectTimer: ReturnType<typeof setTimeout> | null;
  reconnectAttempt: number;
  fetchedAt: number;
  subscriptionSignature: string;
};

type NayanGlobal = typeof globalThis & {
  __NAYAN_SHIP_STREAM__?: ShipStreamState;
};

const state = ((globalThis as NayanGlobal).__NAYAN_SHIP_STREAM__ ??= {
  socket: null,
  ships: new Map(),
  connected: false,
  connecting: false,
  lastError: null,
  reconnectTimer: null,
  reconnectAttempt: 0,
  fetchedAt: 0,
  subscriptionSignature: "",
});

function resetForSubscriptionChange() {
  if (state.subscriptionSignature === SUBSCRIPTION_SIGNATURE) return;

  if (state.socket) {
    try {
      state.socket.close();
    } catch {
      // Socket may already be closing.
    }
  }

  state.socket = null;
  state.connected = false;
  state.connecting = false;
  state.ships.clear();
  state.fetchedAt = 0;
  state.lastError = null;
  state.reconnectAttempt = 0;
  state.subscriptionSignature = SUBSCRIPTION_SIGNATURE;
}

function isInIndiaRegion(ship: NayanShip) {
  return (
    ship.latitude >= INDIA_REGION.minLat &&
    ship.latitude <= INDIA_REGION.maxLat &&
    ship.longitude >= INDIA_REGION.minLon &&
    ship.longitude <= INDIA_REGION.maxLon
  );
}

function pruneShips() {
  const cutoff = Date.now() - SHIP_STALE_MS;
  for (const [mmsi, ship] of state.ships) {
    if (ship.lastSeen < cutoff || !isInIndiaRegion(ship)) state.ships.delete(mmsi);
  }

  if (state.ships.size <= MAX_SHIPS) return;

  const sorted = [...state.ships.values()].sort((a, b) => b.lastSeen - a.lastSeen);
  state.ships.clear();
  for (const ship of sorted.slice(0, MAX_SHIPS)) state.ships.set(ship.mmsi, ship);
}

async function decodeMessage(data: unknown): Promise<string | null> {
  if (typeof data === "string") return data;
  if (data instanceof ArrayBuffer) return new TextDecoder().decode(data);
  if (ArrayBuffer.isView(data)) {
    return new TextDecoder().decode(new Uint8Array(data.buffer, data.byteOffset, data.byteLength));
  }
  if (typeof Blob !== "undefined" && data instanceof Blob) return data.text();
  return null;
}

function scheduleReconnect() {
  if (state.reconnectTimer || !process.env.AISSTREAM_API_KEY) return;
  const delay = Math.min(RECONNECT_MAX_MS, RECONNECT_BASE_MS * 2 ** state.reconnectAttempt);
  state.reconnectAttempt += 1;
  state.reconnectTimer = setTimeout(() => {
    state.reconnectTimer = null;
    void ensureShipStream();
  }, delay);
}

async function ensureShipStream() {
  const apiKey = process.env.AISSTREAM_API_KEY;
  if (!apiKey || state.connected || state.connecting) return;
  if (typeof WebSocket === "undefined") {
    state.lastError = "This Node.js runtime does not provide WebSocket support.";
    return;
  }

  resetForSubscriptionChange();
  if (state.connected || state.connecting) return;

  state.connecting = true;
  state.lastError = null;

  try {
    const socket = new WebSocket(AISSTREAM_URL);
    state.socket = socket;

    socket.addEventListener("open", () => {
      state.connecting = false;
      state.connected = true;
      state.reconnectAttempt = 0;
      state.lastError = null;

      socket.send(JSON.stringify({
        APIKey: apiKey,
        BoundingBoxes: BOUNDING_BOXES,
        FilterMessageTypes: ["PositionReport"],
      }));
    });

    socket.addEventListener("message", async (event) => {
      try {
        const raw = await decodeMessage(event.data);
        if (!raw) return;
        const payload = JSON.parse(raw);
        const ship = normalizeAisPositionMessage(payload);
        if (!ship || !isInIndiaRegion(ship)) return;
        state.ships.set(ship.mmsi, ship);
        state.fetchedAt = Date.now();
        pruneShips();
      } catch (error) {
        console.warn("NAYAN AIS message decode failed:", error);
      }
    });

    socket.addEventListener("error", () => {
      state.lastError = "AISStream connection error.";
    });

    socket.addEventListener("close", () => {
      state.connected = false;
      state.connecting = false;
      state.socket = null;
      scheduleReconnect();
    });
  } catch (error) {
    state.connected = false;
    state.connecting = false;
    state.socket = null;
    state.lastError = error instanceof Error ? error.message : "AISStream connection failed.";
    scheduleReconnect();
  }
}

export async function GET() {
  if (!process.env.AISSTREAM_API_KEY) {
    return Response.json({
      ships: [],
      fetchedAt: 0,
      source: "aisstream",
      connected: false,
      stale: true,
      error: "AISSTREAM_API_KEY is not configured on the server.",
    }, { status: 503 });
  }

  resetForSubscriptionChange();
  void ensureShipStream();
  pruneShips();

  const ships = [...state.ships.values()].sort((a, b) => b.lastSeen - a.lastSeen);
  const fetchedAt = state.fetchedAt;

  return Response.json({
    ships,
    fetchedAt,
    source: "aisstream",
    connected: state.connected,
    stale: !fetchedAt || Date.now() - fetchedAt > 60_000,
    ...(state.lastError ? { error: state.lastError } : {}),
  }, {
    headers: {
      "Cache-Control": "no-store",
    },
  });
}
