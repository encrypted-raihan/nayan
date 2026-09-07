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

// Keep the whole planet lightweight, while giving India the high-detail aerial
// layer. The regional overlay is deliberately a rectangle for now; a precise
// India boundary mask can be added later without changing the architecture.
const INDIA_IMAGERY_RECTANGLE = {
  west: 68.0,
  south: 6.0,
  east: 98.0,
  north: 37.5,
};

export default function NayanGlobe() {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let viewer: any = null;
    let cancelled = false;

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
            existing.addEventListener(
              "error",
              () => reject(new Error("Cesium failed to load")),
              { once: true },
            );
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
      if (ionToken && Cesium.Ion) {
        Cesium.Ion.defaultAccessToken = ionToken;
      }

      // Global foundation: Sentinel-2 cloudless imagery at roughly 10–60 m.
      // It keeps distant parts of the planet much lighter than the aerial layer.
      const globalImagery = await Cesium.IonImageryProvider.fromAssetId(3954);

      // India: high-detail aerial imagery, loaded only inside this regional
      // rectangle so we don't request expensive high-resolution tiles globally.
      const indiaImagery = await Cesium.IonImageryProvider.fromAssetId(2);

      const terrainProvider = await Cesium.createWorldTerrainAsync({
        requestVertexNormals: true,
        requestWaterMask: true,
      });

      if (cancelled || !containerRef.current) return;

      const indiaRectangle = Cesium.Rectangle.fromDegrees(
        INDIA_IMAGERY_RECTANGLE.west,
        INDIA_IMAGERY_RECTANGLE.south,
        INDIA_IMAGERY_RECTANGLE.east,
        INDIA_IMAGERY_RECTANGLE.north,
      );

      viewer = new Cesium.Viewer(containerRef.current, {
        animation: false,
        baseLayer: new Cesium.ImageryLayer(globalImagery),
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

      const indiaLayer = viewer.imageryLayers.add(
        new Cesium.ImageryLayer(indiaImagery, {
          rectangle: indiaRectangle,
          maximumAnisotropy: 4,
          minimumTerrainLevel: 1,
        }),
      );
      indiaLayer.brightness = 1.02;
      indiaLayer.contrast = 1.02;
      indiaLayer.saturation = 1.03;

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

      scene.screenSpaceCameraController.enableCollisionDetection = false;
      scene.screenSpaceCameraController.minimumZoomDistance = 50.0;
      scene.screenSpaceCameraController.maximumZoomDistance = 4.0e8;

      // NAYAN opens on India by default.
      viewer.camera.setView({
        destination: Cesium.Cartesian3.fromDegrees(78.9629, 22.5937, 6500000),
        orientation: {
          heading: 0,
          pitch: Cesium.Math.toRadians(-90),
          roll: 0,
        },
      });

      viewer.camera.lookAtTransform(Cesium.Matrix4.IDENTITY);
      viewer.scene.requestRender();
    };

    loadCesium().catch((error) => {
      if (!cancelled) {
        console.error("NAYAN globe failed to initialize:", error);
      }
    });

    return () => {
      cancelled = true;
      if (viewer && !viewer.isDestroyed()) viewer.destroy();
    };
  }, []);

  return (
    <div
      ref={containerRef}
      className="nayan-globe"
      aria-label="NAYAN 3D globe"
    />
  );
}
