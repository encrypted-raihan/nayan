import WebSocket from "ws";
import { normalizeAisPositionMessage, type NayanShip } from "../../../lib/data/ships/provider";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const AISSTREAM_URL = "wss://stream.aisstream.io/v0/stream";
const SHIP_STALE_MS = 20 * 60 * 1000;
const MAX_SHIPS = 2500;
const RECONNECT_BASE_MS = 2_000;
const RECONNECT_MAX_MS = 30_000;
const SUBSCRIPTION_TIMEOUT_MS = 5_000;
const STREAM_IMPLEMENTATION = "ws-permessage-deflate-v2";

// Three non-overlapping strips cover India plus nearby Arabian Sea, Bay of Bengal,
// Sri Lanka and the eastern approaches without multiplying the same AIS traffic.
// AISStream expects each corner as [latitude, longitude].
const BOUNDING_BOXES = [
  [[0, 55], [30, 75]],
  [[0, 75], [30, 92]],
  [[0, 92], [30, 110]],
];

const INDIA_REGION = {
  minLat: 0,
  maxLat: 30,
  minLon: 55,
  maxLon: 110,
};

const SUBSCRIPTION_SIGNATURE = JSON.stringify({
  version: STREAM_IMPLEMENTATION,
  boxes: BOUNDING_BOXES,
});

type ShipStreamState = {
  socket: WebSocket | null;
  ships: Map<string, NayanShip>;
  connected: boolean;
  connecting: boolean;
  subscribed: boolean;
  compressionEnabled: boolean | null;
  lastError: string | null;
  lastMessageType: string | null;
  lastMessageAt: number;
  receivedMessages: number;
  reconnectTimer: ReturnType<typeof setTimeout> | null;
  subscriptionTimer: ReturnType<typeof setTimeout> | null;
  reconnectAttempt: number;
  fetchedAt: number;
  subscriptionSignature: string;
  lastCloseCode: number | null;
  lastCloseReason: string | null;
};

type NayanGlobal = typeof globalThis & {
  __NAYAN_SHIP_STREAM__?: ShipStreamState;
};

const state = ((globalThis as NayanGlobal).__NAYAN_SHIP_STREAM__ ??= {
  socket: null,
  ships: new Map(),
  connected: false,
  connecting: false,
  subscribed: false,
  compressionEnabled: null,
  lastError: null,
  lastMessageType: null,
  lastMessageAt: 0,
  receivedMessages: 0,
  reconnectTimer: null,
  subscriptionTimer: null,
  reconnectAttempt: 0,
  fetchedAt: 0,
  subscriptionSignature: "",
  lastCloseCode: null,
  lastCloseReason: null,
});

function resetForSubscriptionChange() {
  if (state.subscriptionSignature === SUBSCRIPTION_SIGNATURE) return;

  if (state.reconnectTimer) {
    clearTimeout(state.reconnectTimer);
    state.reconnectTimer = null;
  }
  if (state.subscriptionTimer) {
    clearTimeout(state.subscriptionTimer);
    state.subscriptionTimer = null;
  }
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
  state.subscribed = false;
  state.compressionEnabled = null;
  state.ships.clear();
  state.fetchedAt = 0;
  state.lastError = null;
  state.lastMessageType = null;
  state.lastMessageAt = 0;
  state.receivedMessages = 0;
  state.reconnectAttempt = 0;
  state.lastCloseCode = null;
  state.lastCloseReason = null;
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

function scheduleReconnect() {
  if (state.reconnectTimer || state.connecting || state.connected || !process.env.AISSTREAM_API_KEY) return;
  const jitter = Math.floor(Math.random() * 750);
  const delay = Math.min(RECONNECT_MAX_MS, RECONNECT_BASE_MS * 2 ** state.reconnectAttempt) + jitter;
  state.reconnectAttempt += 1;
  state.reconnectTimer = setTimeout(() => {
    state.reconnectTimer = null;
    void ensureShipStream();
  }, delay);
}

async function ensureShipStream() {
  const apiKey = process.env.AISSTREAM_API_KEY;
  if (!apiKey || state.connected || state.connecting) return;

  resetForSubscriptionChange();
  if (state.connected || state.connecting) return;

  state.connecting = true;
  state.lastError = null;

  try {
    const socket = new WebSocket(AISSTREAM_URL, {
      perMessageDeflate: true,
      handshakeTimeout: 15_000,
    });
    state.socket = socket;

    socket.on("open", () => {
      if (state.socket !== socket) return;
      state.connecting = false;
      state.lastError = null;
      state.subscribed = false;
      state.compressionEnabled = null;

      socket.send(JSON.stringify({
        APIKey: apiKey,
        BoundingBoxes: BOUNDING_BOXES,
        FilterMessageTypes: ["PositionReport"],
      }));

      if (state.subscriptionTimer) clearTimeout(state.subscriptionTimer);
      state.subscriptionTimer = setTimeout(() => {
        if (state.socket !== socket || state.subscribed) return;
        state.lastError = "AISStream subscription confirmation timed out.";
        try {
          socket.close(4000, "Subscription confirmation timeout");
        } catch {
          // Socket may already be closing.
        }
      }, SUBSCRIPTION_TIMEOUT_MS);
    });

    socket.on("message", (data) => {
      if (state.socket !== socket) return;

      try {
        const raw = data.toString("utf8");
        const payload = JSON.parse(raw);
        state.receivedMessages += 1;
        state.lastMessageAt = Date.now();
        state.lastMessageType = typeof payload?.MessageType === "string" ? payload.MessageType : null;

        if (payload?.MessageType === "SubscriptionConfirmation") {
          state.subscribed = true;
          state.connected = true;
          state.compressionEnabled = payload?.Message?.SubscriptionConfirmation?.CompressionEnabled === true;
          if (state.subscriptionTimer) {
            clearTimeout(state.subscriptionTimer);
            state.subscriptionTimer = null;
          }
          return;
        }

        const ship = normalizeAisPositionMessage(payload);
        if (!ship || !isInIndiaRegion(ship)) return;
        state.ships.set(ship.mmsi, ship);
        state.fetchedAt = Date.now();
        pruneShips();
      } catch (error) {
        state.lastError = error instanceof Error ? `AISStream message decode failed: ${error.message}` : "AISStream message decode failed.";
      }
    });

    socket.on("error", (error) => {
      if (state.socket !== socket) return;
      state.lastError = error instanceof Error ? `AISStream socket error: ${error.message}` : "AISStream socket error.";
    });

    socket.on("close", (code, reason) => {
      if (state.socket !== socket) return;

      if (state.subscriptionTimer) {
        clearTimeout(state.subscriptionTimer);
        state.subscriptionTimer = null;
      }

      state.connected = false;
      state.connecting = false;
      state.subscribed = false;
      state.socket = null;
      state.lastCloseCode = code;
      state.lastCloseReason = reason.toString("utf8");

      if (!state.lastError) {
        state.lastError = `AISStream closed (${code}${state.lastCloseReason ? `: ${state.lastCloseReason}` : ""}).`;
      }

      scheduleReconnect();
    });
  } catch (error) {
    state.connected = false;
    state.connecting = false;
    state.subscribed = false;
    state.socket = null;
    state.lastError = error instanceof Error ? `AISStream connection failed: ${error.message}` : "AISStream connection failed.";
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

  return Response.json({
    ships,
    fetchedAt: state.fetchedAt,
    source: "aisstream",
    connected: state.connected,
    stale: !state.fetchedAt || Date.now() - state.fetchedAt > 60_000,
    diagnostics: {
      subscribed: state.subscribed,
      compressionEnabled: state.compressionEnabled,
      connecting: state.connecting,
      receivedMessages: state.receivedMessages,
      lastMessageType: state.lastMessageType,
      lastMessageAt: state.lastMessageAt,
      lastCloseCode: state.lastCloseCode,
      lastCloseReason: state.lastCloseReason,
      implementation: STREAM_IMPLEMENTATION,
      boundingBoxes: BOUNDING_BOXES,
    },
    ...(state.lastError ? { error: state.lastError } : {}),
  }, {
    headers: {
      "Cache-Control": "no-store",
    },
  });
}
