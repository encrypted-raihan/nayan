"use client";

import { useEffect, useRef } from "react";

const INDIA = { longitude: 78.9629, latitude: 20.5937, height: 18_000_000 };

export default function Home() {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let viewer: import("cesium").Viewer | undefined;
    let cancelled = false;

    async function boot() {
      try {
        const Cesium = await import("cesium");
        if (cancelled || !containerRef.current) return;

        const token = process.env.NEXT_PUBLIC_CESIUM_ION_TOKEN?.trim();
        if (token) Cesium.Ion.defaultAccessToken = token;

        // Cesium 1.134+ uses `baseLayer`, not the old `imageryProvider`
        // Viewer option. Disable the default ion/Bing layer first so a
        // missing or invalid ion token cannot stop the renderer.
        viewer = new Cesium.Viewer(containerRef.current, {
          animation: false,
          baseLayerPicker: false,
          baseLayer: false,
          fullscreenButton: false,
          geocoder: false,
          homeButton: false,
          infoBox: false,
          navigationHelpButton: false,
          sceneModePicker: false,
          selectionIndicator: false,
          timeline: false,
          vrButton: false,
          terrainProvider: new Cesium.EllipsoidTerrainProvider(),
        });

        let imageryProvider: import("cesium").ImageryProvider;

        if (token) {
          try {
            imageryProvider = await Cesium.IonImageryProvider.fromAssetId(2);
          } catch (ionError) {
            console.warn(
              "NAYAN: Cesium ion imagery unavailable; using OpenStreetMap fallback.",
              ionError,
            );
            imageryProvider = new Cesium.OpenStreetMapImageryProvider({
              url: "https://tile.openstreetmap.org/",
              credit: "© OpenStreetMap contributors",
            });
          }
        } else {
          imageryProvider = new Cesium.OpenStreetMapImageryProvider({
            url: "https://tile.openstreetmap.org/",
            credit: "© OpenStreetMap contributors",
          });
        }

        if (!cancelled && viewer && !viewer.isDestroyed()) {
          viewer.imageryLayers.addImageryProvider(imageryProvider);

          viewer.scene.globe.enableLighting = true;
          viewer.scene.skyAtmosphere.show = true;
          viewer.scene.globe.showGroundAtmosphere = true;
          viewer.scene.backgroundColor = Cesium.Color.BLACK;

          viewer.camera.flyTo({
            destination: Cesium.Cartesian3.fromDegrees(
              INDIA.longitude,
              INDIA.latitude,
              INDIA.height,
            ),
            orientation: {
              heading: Cesium.Math.toRadians(0),
              pitch: Cesium.Math.toRadians(-90),
              roll: 0,
            },
            duration: 2.8,
          });
        }
      } catch (error) {
        console.error("NAYAN globe failed to initialize", error);
      }
    }

    boot();
    return () => {
      cancelled = true;
      viewer?.destroy();
    };
  }, []);

  return (
    <main className="nayan-shell">
      <div ref={containerRef} className="globe" />
      <header className="brand">
        <div className="brand-mark">N</div>
        <div>
          <div className="brand-name">NAYAN</div>
          <div className="brand-subtitle">INDIA FROM ABOVE</div>
        </div>
      </header>
      <div className="coordinates">20.5937° N&nbsp;&nbsp; 78.9629° E</div>
      <div className="hint">DRAG TO ROTATE · SCROLL TO ZOOM</div>
    </main>
  );
}
