"use client";

import { useEffect } from "react";
import { fetchIndiaShips, type NayanShip } from "../lib/data/ships";

declare global {
  interface Window {
    Cesium?: any;
    __NAYAN_CESIUM_VIEWER__?: any;
    __NAYAN_CESIUM_VIEWER_BRIDGE__?: boolean;
  }
}

const SHIP_GLYPH = `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(`
<svg xmlns="http://www.w3.org/2000/svg" width="52" height="52" viewBox="0 0 52 52">
  <g fill="white" stroke="#111" stroke-width="2" stroke-linejoin="round">
    <path d="M26 4l5 12 11 7-4 3-6-1 4 14-10-6-10 6 4-14-6 1-4-3 11-7z"/>
  </g>
</svg>`)} `;
const SHIP_GLYPH_URL = SHIP_GLYPH.trim();

const installViewerBridge = () => {
  const Cesium = window.Cesium;
  if (!Cesium || Cesium.__nayanViewerBridgeInstalled) return;

  const OriginalViewer = Cesium.Viewer;
  if (typeof OriginalViewer !== "function") return;

  const ViewerProxy = new Proxy(OriginalViewer, {
    construct(target, args) {
      const viewer = Reflect.construct(target, args, target);
      window.__NAYAN_CESIUM_VIEWER__ = viewer;
      window.dispatchEvent(new CustomEvent("nayan:cesium-viewer-ready", { detail: { viewer } }));
      return viewer;
    },
  });

  Cesium.Viewer = ViewerProxy;
  Cesium.__nayanViewerBridgeInstalled = true;
  window.__NAYAN_CESIUM_VIEWER_BRIDGE__ = true;
};

function decodeStatus(status: number | null) {
  if (status === null) return "UNKNOWN";
  const labels: Record<number, string> = {
    0: "UNDER WAY",
    1: "AT ANCHOR",
    2: "NOT UNDER COMMAND",
    3: "RESTRICTED MANOEUVRABILITY",
    5: "MOORED",
    6: "AGROUND",
    7: "ENGAGED IN FISHING",
    8: "UNDER WAY · SAILING",
  };
  return labels[status] ?? `STATUS ${status}`;
}

export default function NayanShipLayer() {
  useEffect(() => {
    let viewer: any = null;
    let CesiumRef: any = null;
    let shipsBillboards: any = null;
    let ships = new Map<string, NayanShip>();
    let active = false;
    let pollTimer: number | null = null;
    let readyPollTimer: number | null = null;
    let abortController: AbortController | null = null;
    let removeViewerListener: (() => void) | null = null;

    const clear = () => {
      if (shipsBillboards && viewer && !viewer.isDestroyed()) {
        viewer.scene.primitives.remove(shipsBillboards);
      }
      shipsBillboards = null;
      ships.clear();
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
        ships.set(ship.mmsi, ship);
        const existing = collection._billboards?.find?.((item: any) => item?._nayanShip?.mmsi === ship.mmsi);
        if (existing) {
          existing.position = CesiumRef.Cartesian3.fromDegrees(ship.longitude, ship.latitude, 40);
          existing.rotation = ship.courseDeg !== null ? CesiumRef.Math.toRadians(-ship.courseDeg) : 0;
          existing._nayanShip = ship;
          continue;
        }

        const billboard = collection.add({
          id: `nayan-ship-${ship.mmsi}`,
          image: SHIP_GLYPH_URL,
          position: CesiumRef.Cartesian3.fromDegrees(ship.longitude, ship.latitude, 40),
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
      }

      for (const [mmsi, ship] of ships) {
        if (!seen.has(mmsi)) ships.delete(mmsi);
      }

      viewer.scene.requestRender();
      window.dispatchEvent(new CustomEvent("nayan:ships-loaded", {
        detail: { count: shipList.length },
      }));
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
    };

    const onCanvasClick = (event: MouseEvent) => {
      if (!active || !viewer || viewer.isDestroyed()) return;
      const canvas = viewer.scene.canvas;
      const rect = canvas.getBoundingClientRect();
      const position = { x: event.clientX - rect.left, y: event.clientY - rect.top };
      const picked = viewer.scene.pick(position);
      const ship = picked?.primitive?._nayanShip as NayanShip | undefined;
      if (!ship || !CesiumRef) return;

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

    const tryInstall = () => {
      installViewerBridge();
      if (window.__NAYAN_CESIUM_VIEWER__) {
        viewer = window.__NAYAN_CESIUM_VIEWER__;
        CesiumRef = window.Cesium;
      }
    };

    tryInstall();
    readyPollTimer = window.setInterval(tryInstall, 50);

    const canvasPoll = window.setInterval(() => {
      if (!viewer || viewer.isDestroyed() || viewer.scene?.canvas?.dataset.nayanShipsBound === "true") return;
      viewer.scene.canvas.addEventListener("click", onCanvasClick);
      viewer.scene.canvas.dataset.nayanShipsBound = "true";
    }, 100);

    return () => {
      window.removeEventListener("nayan:ships-toggle", onToggle);
      window.removeEventListener("nayan:cesium-viewer-ready", onViewerReady);
      abortController?.abort();
      if (pollTimer !== null) window.clearInterval(pollTimer);
      if (readyPollTimer !== null) window.clearInterval(readyPollTimer);
      window.clearInterval(canvasPoll);
      if (viewer?.scene?.canvas) viewer.scene.canvas.removeEventListener("click", onCanvasClick);
      clear();
      removeViewerListener?.();
    };
  }, []);

  return null;
}
