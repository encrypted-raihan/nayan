type TrafficRuntime = {
  viewer: any | null;
  layer: any | null;
  refreshTimer: number | null;
  attached: boolean;
  enabled: boolean;
  row: HTMLButtonElement | null;
  status: HTMLElement | null;
};

declare global {
  interface Window {
    __NAYAN_CESIUM_VIEWER__?: any;
    __NAYAN_TRAFFIC_RUNTIME__?: TrafficRuntime;
    Cesium?: any;
  }
}

const INDIA_TRAFFIC_RECTANGLE = {
  west: 55,
  south: 0,
  east: 110,
  north: 30,
};

const TRAFFIC_REFRESH_MS = 60_000;
const TRAFFIC_MINIMUM_LEVEL = 3;
const TRAFFIC_MAXIMUM_LEVEL = 18;

function runtime(): TrafficRuntime {
  return (window.__NAYAN_TRAFFIC_RUNTIME__ ??= {
    viewer: null,
    layer: null,
    refreshTimer: null,
    attached: false,
    enabled: false,
    row: null,
    status: null,
  });
}

function setStatus(status: string) {
  const state = runtime();
  if (state.status) state.status.textContent = status;
  state.row?.classList.toggle("is-active", state.enabled);
  state.row?.setAttribute("aria-pressed", String(state.enabled));
}

function ensureTrafficRow() {
  const state = runtime();
  if (state.row?.isConnected) return;

  const list = document.querySelector<HTMLElement>(".layer-list");
  if (!list) return;

  const row = document.createElement("button");
  row.type = "button";
  row.className = "layer-row";
  row.setAttribute("aria-pressed", "false");
  row.innerHTML = `
    <span class="layer-icon">🚦</span>
    <span class="layer-copy">
      <strong>Traffic</strong>
      <small>LIVE ROAD CONDITIONS</small>
    </span>
    <span class="layer-status">OFF</span>
  `;
  row.addEventListener("click", () => {
    if (runtime().enabled) clearTraffic();
    else void showTraffic();
  });
  list.appendChild(row);
  state.row = row;
  state.status = row.querySelector<HTMLElement>(".layer-status");
  setStatus(state.enabled ? "LIVE" : "OFF");
}

function createTrafficProvider(Cesium: any) {
  const minuteVersion = () => String(Math.floor(Date.now() / TRAFFIC_REFRESH_MS));

  return new Cesium.UrlTemplateImageryProvider({
    url: "/api/traffic/{z}/{x}/{y}?v={TrafficVersion}",
    customTags: {
      TrafficVersion: minuteVersion,
    },
    rectangle: Cesium.Rectangle.fromDegrees(
      INDIA_TRAFFIC_RECTANGLE.west,
      INDIA_TRAFFIC_RECTANGLE.south,
      INDIA_TRAFFIC_RECTANGLE.east,
      INDIA_TRAFFIC_RECTANGLE.north,
    ),
    minimumLevel: TRAFFIC_MINIMUM_LEVEL,
    maximumLevel: TRAFFIC_MAXIMUM_LEVEL,
    tilingScheme: new Cesium.WebMercatorTilingScheme(),
    tileWidth: 256,
    tileHeight: 256,
    hasAlphaChannel: true,
    enablePickFeatures: false,
    credit: new Cesium.Credit("Traffic © TomTom"),
  });
}

function addTrafficLayer() {
  const state = runtime();
  const viewer = state.viewer;
  const Cesium = window.Cesium;
  if (!viewer || viewer.isDestroyed?.() || !Cesium) return false;

  if (state.layer) viewer.imageryLayers.remove(state.layer, true);

  const provider = createTrafficProvider(Cesium);
  provider.errorEvent.addEventListener(() => {
    if (!runtime().enabled) return;
    setStatus("ERROR");
    window.dispatchEvent(new CustomEvent("nayan:traffic-error", {
      detail: { message: "TomTom traffic tiles could not be loaded." },
    }));
  });

  state.layer = viewer.imageryLayers.addImageryProvider(provider);
  state.layer.alpha = 0.9;
  state.enabled = true;
  setStatus("LIVE");
  viewer.scene.requestRender();
  return true;
}

function scheduleTrafficRefresh() {
  const state = runtime();
  if (state.refreshTimer !== null) window.clearInterval(state.refreshTimer);
  state.refreshTimer = window.setInterval(() => {
    if (!runtime().enabled) return;
    addTrafficLayer();
  }, TRAFFIC_REFRESH_MS);
}

async function showTraffic() {
  const state = runtime();
  ensureTrafficRow();
  if (!state.viewer) {
    setStatus("WAITING");
    return;
  }

  setStatus("LOADING");
  if (!addTrafficLayer()) {
    setStatus("ERROR");
    return;
  }

  scheduleTrafficRefresh();
  window.dispatchEvent(new CustomEvent("nayan:traffic-loaded", {
    detail: { source: "tomtom", region: "india" },
  }));
}

function clearTraffic() {
  const state = runtime();
  if (state.refreshTimer !== null) {
    window.clearInterval(state.refreshTimer);
    state.refreshTimer = null;
  }
  if (state.layer && state.viewer && !state.viewer.isDestroyed?.()) {
    state.viewer.imageryLayers.remove(state.layer, true);
    state.viewer.scene.requestRender();
  }
  state.layer = null;
  state.enabled = false;
  setStatus("OFF");
  window.dispatchEvent(new CustomEvent("nayan:traffic-cleared"));
}

function attachViewer(viewer: any) {
  const state = runtime();
  if (!viewer || viewer.isDestroyed?.()) return;
  state.viewer = viewer;
  state.attached = true;
  ensureTrafficRow();
}

function install() {
  if (typeof window === "undefined") return;

  runtime();
  ensureTrafficRow();

  if (window.__NAYAN_CESIUM_VIEWER__) attachViewer(window.__NAYAN_CESIUM_VIEWER__);
  window.addEventListener("nayan:cesium-viewer-ready", (event) => {
    const viewer = (event as CustomEvent<{ viewer?: any }>).detail?.viewer ?? window.__NAYAN_CESIUM_VIEWER__;
    attachViewer(viewer);
  });

  const observer = new MutationObserver(() => ensureTrafficRow());
  observer.observe(document.body, { childList: true, subtree: true });
  window.setTimeout(() => observer.disconnect(), 15_000);
}

if (typeof window !== "undefined") install();

export { showTraffic, clearTraffic };
