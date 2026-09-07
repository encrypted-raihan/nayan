"use client";

import { useEffect, useRef } from "react";

declare global {
  interface Window {
    Cesium?: any;
    CESIUM_BASE_URL?: string;
  }
}

const CESIUM_VERSION = "1.145";
const CESIUM_BASE_URL = `https://cesium.com/downloads/cesiumjs/releases/${CESIUM_VERSION}/Build/Cesium/`;
const CESIUM_SCRIPT_URL = `${CESIUM_BASE_URL}Cesium.js`;
const CESIUM_CSS_URL = `${CESIUM_BASE_URL}Widgets/widgets.css`;
const EARTHQUAKE_FEED = "https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/2.5_day.geojson";

export default function NayanGlobe() {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let viewer: any = null;
    let cancelled = false;
    let earthquakeEntities: any = null;

    const loadCesium = async () => {
      if (!document.querySelector('link[data-nayan-cesium="true"]')) {
        const link = document.createElement("link");
        link.rel = "stylesheet";
        link.href = CESIUM_CSS_URL;
        link.dataset.nayanCesium = "true";
        document.head.appendChild(link);
      }

      window.CESIUM_BASE_URL = CESIUM_BASE_URL;

      if (!window.Cesium) {
        await new Promise<void>((resolve, reject) => {
          const existing = document.querySelector<HTMLScriptElement>(
            'script[data-nayan-cesium="true"]',
          );
          if (existing) {
            existing.addEventListener("load", () => resolve(), { once: true });
            existing.addEventListener("error", () => reject(new Error("Cesium failed to load")), { once: true });
            return;
          }
          const script = document.createElement("script");
          script.src = CESIUM_SCRIPT_URL;
          script.async = true;
          script.dataset.nayanCesium = "true";
          script.onload = () => resolve();
          script.onerror = () => reject(new Error("Cesium failed to load"));
          document.head.appendChild(script);
        });
      }

      if (cancelled || !containerRef.current || !window.Cesium) return;

      const Cesium = window.Cesium;
      const ionToken = process.env.NEXT_PUBLIC_CESIUM_ION_TOKEN;
      if (ionToken && Cesium.Ion) Cesium.Ion.defaultAccessToken = ionToken;

      const [imageryProvider, terrainProvider] = await Promise.all([
        Cesium.createWorldImageryAsync({ style: Cesium.IonWorldImageryStyle.AERIAL }),
        Cesium.createWorldTerrainAsync({ requestVertexNormals: true, requestWaterMask: true }),
      ]);

      if (cancelled || !containerRef.current) return;

      viewer = new Cesium.Viewer(containerRef.current, {
        animation: false,
        baseLayer: new Cesium.ImageryLayer(imageryProvider),
        baseLayerPicker: false,
        fullscreenButton: false,
        geocoder: false,
        homeButton: false,
        infoBox: false,
        navigationHelpButton: false,
        sceneModePicker: false,
        selectionIndicator: false,
        timeline: false,
        shouldAnimate: false,
        terrainProvider,
      });

      const scene = viewer.scene;
      const globe = scene.globe;
      const controller = scene.screenSpaceCameraController;

      scene.backgroundColor = Cesium.Color.BLACK;
      scene.skyBox.show = true;
      scene.skyAtmosphere.show = true;
      scene.skyAtmosphere.brightnessShift = 0.02;
      scene.skyAtmosphere.saturationShift = 0.02;
      scene.skyAtmosphere.hueShift = 0.0;

      globe.enableLighting = true;
      globe.showGroundAtmosphere = true;
      globe.dynamicAtmosphereLighting = true;
      globe.dynamicAtmosphereLightingFromSun = true;
      globe.lightingFadeInDistance = 3.0e6;
      globe.lightingFadeOutDistance = 6.0e7;
      globe.terrainExaggeration = 1.0;

      controller.enableCollisionDetection = false;
      controller.minimumZoomDistance = 50.0;
      controller.maximumZoomDistance = 4.0e8;
      controller.inertiaSpin = 0.88;
      controller.inertiaTranslate = 0.88;
      controller.inertiaZoom = 0.82;

      viewer.camera.setView({
        destination: Cesium.Cartesian3.fromDegrees(78.9629, 22.5937, 6500000),
        orientation: {
          heading: 0,
          pitch: Cesium.Math.toRadians(-90),
          roll: 0,
        },
      });
      viewer.camera.lookAtTransform(Cesium.Matrix4.IDENTITY);

      // NAYAN's first live data layer: USGS earthquakes.
      const loadEarthquakes = async () => {
        if (earthquakeEntities || cancelled) return;

        const response = await fetch(EARTHQUAKE_FEED, { cache: "no-store" });
        if (!response.ok) throw new Error(`USGS earthquake feed returned ${response.status}`);
        const feed = await response.json();

        const collection = viewer.entities;
        const entities = [];

        for (const feature of feed.features ?? []) {
          const coordinates = feature.geometry?.coordinates;
          const properties = feature.properties ?? {};
          if (!coordinates || coordinates.length < 2 || properties.mag == null) continue;

          const longitude = Number(coordinates[0]);
          const latitude = Number(coordinates[1]);
          const depthKm = Number(coordinates[2] ?? 0);
          const magnitude = Number(properties.mag);
          if (!Number.isFinite(longitude) || !Number.isFinite(latitude) || !Number.isFinite(magnitude)) continue;

          const size = Math.max(7, Math.min(22, 5 + magnitude * 3));
          const entity = collection.add({
            id: `nayan-earthquake-${feature.id}`,
            position: Cesium.Cartesian3.fromDegrees(longitude, latitude, Math.max(0, -depthKm * 1000)),
            point: {
              pixelSize: size,
              color: Cesium.Color.WHITE.withAlpha(0.92),
              outlineColor: Cesium.Color.BLACK.withAlpha(0.85),
              outlineWidth: 1,
              heightReference: Cesium.HeightReference.NONE,
              disableDepthTestDistance: 1.0e7,
            },
            label: {
              text: `M ${magnitude.toFixed(1)}`,
              font: "10px DM Mono, monospace",
              fillColor: Cesium.Color.WHITE,
              outlineColor: Cesium.Color.BLACK,
              outlineWidth: 3,
              style: Cesium.LabelStyle.FILL_AND_OUTLINE,
              verticalOrigin: Cesium.VerticalOrigin.BOTTOM,
              pixelOffset: new Cesium.Cartesian2(0, -size - 4),
              show: false,
              disableDepthTestDistance: 1.0e7,
            },
            description: `
              <div style="font-family: monospace; line-height: 1.6">
                <strong>M ${magnitude.toFixed(1)}</strong><br/>
                ${properties.place ?? "Unknown location"}<br/>
                Depth: ${depthKm.toFixed(1)} km<br/>
                ${properties.time ? new Date(properties.time).toUTCString() : "Time unavailable"}
              </div>
            `,
          });
          entities.push(entity);
        }

        earthquakeEntities = entities;
        viewer.scene.requestRender();
      };

      const removeEarthquakes = () => {
        if (!earthquakeEntities) return;
        for (const entity of earthquakeEntities) viewer.entities.remove(entity);
        earthquakeEntities = null;
        viewer.selectedEntity = undefined;
        viewer.scene.requestRender();
      };

      const onLayerToggle = async (event: Event) => {
        const customEvent = event as CustomEvent<{ id?: string; enabled?: boolean }>;
        if (customEvent.detail?.id !== "earthquakes") return;

        try {
          if (customEvent.detail.enabled) {
            await loadEarthquakes();
          } else {
            removeEarthquakes();
          }
        } catch (error) {
          console.error("NAYAN earthquake layer failed:", error);
          window.dispatchEvent(new CustomEvent("nayan:layer-error", {
            detail: { id: "earthquakes", message: "Earthquake data could not be loaded." },
          }));
        }
      };

      window.addEventListener("nayan:layer-toggle", onLayerToggle);
      window.addEventListener("nayan:reset-india", () => {
        viewer.camera.flyTo({
          destination: Cesium.Cartesian3.fromDegrees(78.9629, 22.5937, 6500000),
          orientation: { heading: 0, pitch: Cesium.Math.toRadians(-90), roll: 0 },
          duration: 1.15,
        });
      });

      (viewer as any).__nayanCleanup = () => {
        window.removeEventListener("nayan:layer-toggle", onLayerToggle);
      };
      viewer.scene.requestRender();
    };

    loadCesium().catch((error) => {
      if (!cancelled) console.error("NAYAN globe failed to initialize:", error);
    });

    return () => {
      cancelled = true;
      if (viewer && !viewer.isDestroyed()) {
        viewer.__nayanCleanup?.();
        viewer.destroy();
      }
    };
  }, []);

  return <div ref={containerRef} className="nayan-globe" aria-label="NAYAN 3D globe" />;
}
