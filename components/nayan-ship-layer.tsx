"use client";

import { useEffect } from "react";
import { fetchIndiaShips, type NayanShip } from "../lib/data/ships";

declare global {
  interface Window {
    Cesium?: any;
    __NAYAN_CESIUM_VIEWER__?: any;
    __NAYAN_CESIUM_BRIDGE_INSTALLED__?: boolean;
  }
}

const SHIP_GLYPH = `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(`
<svg xmlns="http://www.w3.org/2000/svg" width="52" height="52" viewBox="0 0 52 52">
  <g fill="white" stroke="#111" stroke-width="2" stroke-linejoin="round">
    <path d="M26 3L36 17l4 18c1 5-3 11-9 13H21c-6-2-10-8-9-13l4-18z"/>
    <rect x="21" y="19" width="10" height="11" rx="1"/>
    <path d="M17 35h18" fill="none" stroke-width="3"/>
  </g>
</svg>`)} `;
const SHIP_GLYPH_URL = SHIP_GLYPH.trim();

function bridgeCesiumNamespace(Cesium: any) {
  if (!Cesium || typeof Cesium !== "object") return Cesium;
  if (Cesium.__NAYAN_SHIP_BRIDGED__) return Cesium;

  const OriginalViewer = Cesium.Viewer;
  if (typeof OriginalViewer !== "function") return Cesium;

  const ViewerProxy = new Proxy(OriginalViewer, {
    construct(target, args) {
      const viewer = Reflect.construct(target, args, target);
      window.__NAYAN_CESIUM_VIEWER__ = viewer;
      window.dispatchEvent(new CustomEvent("nayan:cesium-viewer-ready", { detail: { viewer } }));
      return viewer;
    },
  });

  const namespaceProxy = new Proxy(Cesium, {
    get(target, property, receiver) {
      if (property === "Viewer") return ViewerProxy;
      return Reflect.get(target, property, receiver);
    },
  });

  try {
    Object.defineProperty(namespaceProxy, "__NAYAN_SHIP_BRIDGED__", {
      value: true,
      configurable: true,
    });
  } catch {
    // Marker is optional; the proxy itself is sufficient.
  }

  return namespaceProxy;
}

function installCesiumSetterBridge() {
  if (window.__NAYAN_CESIUM_BRIDGE_INSTALLED__) return;

  const descriptor = Object.getOwnPropertyDescriptor(window, "Cesium");
  if (descriptor && descriptor.configurable === false) return;

  let current = window.Cesium;
  let bridged = bridgeCesiumNamespace(current);
  if (bridged !== current) current = bridged;

  Object.defineProperty(window, "Cesium", {
    configurable: true,
    enumerable: descriptor?.enumerable ?? true,
    get() {
      return current;
    },
    set(value) {
      current = bridgeCesiumNamespace(value);
    },
  });

  window.__NAYAN_CESIUM_BRIDGE_INSTALLED__ = true;
}

export default function NayanShipLayer() {
  useEffect(() => {
    let viewer: any = window.__NAYAN_CESIUM_VIEWER__ ?? null;
    let CesiumRef: any = window.Cesium ?? null;
    let shipsBillboards: any = null;
    const shipBillboards = new Map<string, any>();
    let active = false;
    let pollTimer: number | null = null;
    let abortController: AbortController | null = null;

    const clear = () => {
      if (shipsBillboards && viewer && !viewer.isDestroyed()) viewer.scene.primitives.remove(shipsBillboards);
      shipsBillboards = null;
      shipBillboards.clear();
      if (viewer && !viewer.isDestroyed()) viewer.scene.requestRender();
    };

    const ensureCollection = () => {
      if (!viewer || viewer.isDestroyed() || !CesiumRef) return null;
      if (!shipsBillboards) shipsBillboards = viewer.scene.primitives.add(new CesiumRef.BillboardCollection());
      return shipsBillboards;
    };

    const render = (shipList: NayanShip[]) => {
      const collection = ensureCollection();
      if (!collection || !CesiumRef) return;
      const seen = new Set<string>();

      for (const ship of shipList) {
        seen.add(ship.mmsi);
        const existing = shipBillboards.get(ship.mmsi);
        const position = CesiumRef.Cartesian3.fromDegrees(ship.longitude, ship.latitude, 40);

        if (existing) {
          existing.position = position;
          existing.rotation = ship.courseDeg !== null ? CesiumRef.Math.toRadians(-ship.courseDeg) : 0;
          existing._nayanShip = ship;
          continue;
        }

        const billboard = collection.add({
          id: `nayan-ship-${ship.mmsi}`,
          image: SHIP_GLYPH_URL,
          position,
          width: 22,
          height: 22,
          rotation: ship.courseDeg !== null ? CesiumRef.Math.toRadians(-ship.courseDeg) : 0,
          alignedAxis: CesiumRef.Cartesian3.UNIT_Z,
          verticalOrigin: CesiumRef.VerticalOrigin.CENTER,
          horizontalOrigin: CesiumRef.HorizontalOrigin.CENTER,
          disableDepthTestDistance: 0,
          scaleByDistance: new CesiumRef.NearFarScalar(100000, 0.95, 20000000, 0.62),
          translucencyByDistance: new CesiumRef.NearFarScalar(100000, 1.0, 20000000, 0.7),
        });

        billboard._nayanShip = ship;
        shipBillboards.set(ship.mmsi, billboard);
      }

      for (const [mmsi, billboard] of shipBillboards) {
        if (seen.has(mmsi)) continue;
        collection.remove(billboard);
        shipBillboards.delete(mmsi);
      }

      viewer.scene.requestRender();
      window.dispatchEvent(new CustomEvent("nayan:ships-loaded", { detail: { count: shipList.length } }));
    };

    const refresh = async () => {
      if (!active || !viewer || viewer.isDestroyed()) return;
      abortController?.abort();
      abortController = new AbortController();

      try {
        const result = await fetchIndiaShips(abortController.signal);
        if (!active || !viewer || viewer.isDestroyed()) return;
        render(result.ships);

        if (result.error) {
          window.dispatchEvent(new CustomEvent("nayan:ships-error", { detail: { message: result.error } }));
        }
      } catch (error) {
        if ((error as Error)?.name === "AbortError") return;
        window.dispatchEvent(new CustomEvent("nayan:ships-error", {
          detail: { message: error instanceof Error ? error.message : "Unable to load ship data." },
        }));
      }
    };

    const start = () => {
      if (!viewer || viewer.isDestroyed() || !CesiumRef) return;
      active = true;
      clear();
      void refresh();
      if (pollTimer === null) pollTimer = window.setInterval(() => void refresh(), 5_000);
      window.dispatchEvent(new CustomEvent("nayan:ships-loading"));
    };

    const stop = () => {
      active = false;
      abortController?.abort();
      if (pollTimer !== null) {
        window.clearInterval(pollTimer);
        pollTimer = null;
      }
      clear();
      window.dispatchEvent(new CustomEvent("nayan:ships-cleared"));
    };

    const onToggle = (event: Event) => {
      if ((event as CustomEvent<boolean>).detail) start();
      else stop();
    };

    const onViewerReady = (event: Event) => {
      const detail = (event as CustomEvent<{ viewer: any }>).detail;
      viewer = detail.viewer;
      CesiumRef = window.Cesium;
      if (active) void refresh();
    };

    const onCanvasClick = (event: MouseEvent) => {
      if (!active || !viewer || viewer.isDestroyed()) return;
      const canvas = viewer.scene.canvas;
      const rect = canvas.getBoundingClientRect();
      const picked = viewer.scene.pick({
        x: event.clientX - rect.left,
        y: event.clientY - rect.top,
      });
      const ship = picked?.primitive?._nayanShip as NayanShip | undefined;
      if (!ship || !CesiumRef) return;

      event.stopPropagation();
      event.stopImmediatePropagation();

      viewer.camera.flyTo({
        destination: CesiumRef.Cartesian3.fromDegrees(ship.longitude, ship.latitude, 180000),
        orientation: { heading: 0, pitch: CesiumRef.Math.toRadians(-90), roll: 0 },
        duration: 1.2,
        easingFunction: CesiumRef.EasingFunction.CUBIC_IN_OUT,
      });

      window.dispatchEvent(new CustomEvent("nayan:ship-selected", {
        detail: { ship, x: event.clientX, y: event.clientY },
      }));
    };

    window.addEventListener("nayan:ships-toggle", onToggle);
    window.addEventListener("nayan:cesium-viewer-ready", onViewerReady);

    installCesiumSetterBridge();
    viewer = window.__NAYAN_CESIUM_VIEWER__ ?? viewer;
    CesiumRef = window.Cesium ?? CesiumRef;

    const viewerReadyPoll = window.setInterval(() => {
      if (window.__NAYAN_CESIUM_VIEWER__) {
        viewer = window.__NAYAN_CESIUM_VIEWER__;
        CesiumRef = window.Cesium;
      }
    }, 100);

    const canvasPoll = window.setInterval(() => {
      if (!viewer || viewer.isDestroyed() || viewer.scene?.canvas?.dataset.nayanShipsBound === "true") return;
      viewer.scene.canvas.addEventListener("click", onCanvasClick, true);
      viewer.scene.canvas.dataset.nayanShipsBound = "true";
    }, 100);

    return () => {
      window.removeEventListener("nayan:ships-toggle", onToggle);
      window.removeEventListener("nayan:cesium-viewer-ready", onViewerReady);
      abortController?.abort();
      if (pollTimer !== null) window.clearInterval(pollTimer);
      window.clearInterval(viewerReadyPoll);
      window.clearInterval(canvasPoll);
      if (viewer?.scene?.canvas) viewer.scene.canvas.removeEventListener("click", onCanvasClick, true);
      clear();
    };
  }, []);

  return null;
}
