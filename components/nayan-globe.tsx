"use client";

import { useEffect, useRef } from "react";
import { fetchIndiaEarthquakes, type NayanEarthquake } from "../lib/data/usgs-earthquakes";

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

const INDIA_CAMERA = {
  longitude: 78.9629,
  latitude: 22.5937,
  height: 6500000,
};

export default function NayanGlobe() {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let viewer: any = null;
    let CesiumRef: any = null;
    let cancelled = false;
    let earthquakeEntities: any[] = [];
    let earthquakeAbortController: AbortController | null = null;

    const clearEarthquakes = () => {
      if (!viewer || viewer.isDestroyed()) return;
      for (const entity of earthquakeEntities) {
        viewer.entities.remove(entity);
      }
      earthquakeEntities = [];
      viewer.scene.requestRender();
    };

    const showEarthquakes = async () => {
      if (!viewer || viewer.isDestroyed() || !CesiumRef) return;

      clearEarthquakes();
      earthquakeAbortController?.abort();
      earthquakeAbortController = new AbortController();

      try {
        const earthquakes = await fetchIndiaEarthquakes(earthquakeAbortController.signal);
        if (cancelled || !viewer || viewer.isDestroyed()) return;

        for (const earthquake of earthquakes) {
          const size = Math.max(7, Math.min(16, 4 + earthquake.magnitude * 2));
          const entity = viewer.entities.add({
            id: `nayan-earthquake-${earthquake.id}`,
            name: `Magnitude ${earthquake.magnitude.toFixed(1)} earthquake`,
            position: CesiumRef.Cartesian3.fromDegrees(
              earthquake.longitude,
              earthquake.latitude,
              0,
            ),
            point: {
              pixelSize: size,
              color: CesiumRef.Color.WHITE,
              outlineColor: CesiumRef.Color.fromAlpha(CesiumRef.Color.BLACK, 0.85),
              outlineWidth: 2,
              heightReference: CesiumRef.HeightReference.CLAMP_TO_GROUND,
              disableDepthTestDistance: 0,
              scaleByDistance: new CesiumRef.NearFarScalar(500000, 1.15, 18000000, 0.7),
            },
          });

          entity._nayanEarthquake = earthquake;
          earthquakeEntities.push(entity);
        }

        window.dispatchEvent(
          new CustomEvent("nayan:earthquakes-loaded", {
            detail: { count: earthquakes.length },
          }),
        );
        viewer.scene.requestRender();
      } catch (error) {
        if ((error as Error)?.name === "AbortError") return;
        console.error("NAYAN earthquake layer failed:", error);
        window.dispatchEvent(
          new CustomEvent("nayan:earthquakes-error", {
            detail: { message: "Unable to load earthquake data." },
          }),
        );
      }
    };

    const resetIndia = () => {
      if (!viewer || viewer.isDestroyed() || !CesiumRef) return;
      viewer.camera.setView({
        destination: CesiumRef.Cartesian3.fromDegrees(
          INDIA_CAMERA.longitude,
          INDIA_CAMERA.latitude,
          INDIA_CAMERA.height,
        ),
        orientation: {
          heading: 0,
          pitch: CesiumRef.Math.toRadians(-90),
          roll: 0,
        },
      });
      viewer.camera.lookAtTransform(CesiumRef.Matrix4.IDENTITY);
      viewer.scene.requestRender();
    };

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
      CesiumRef = Cesium;

      const ionToken = process.env.NEXT_PUBLIC_CESIUM_ION_TOKEN;
      if (ionToken && Cesium.Ion) {
        Cesium.Ion.defaultAccessToken = ionToken;
      }

      const [imageryProvider, terrainProvider] = await Promise.all([
        Cesium.createWorldImageryAsync({
          style: Cesium.IonWorldImageryStyle.AERIAL,
        }),
        Cesium.createWorldTerrainAsync({
          requestVertexNormals: true,
          requestWaterMask: true,
        }),
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
      globe.depthTestAgainstTerrain = true;

      controller.enableCollisionDetection = false;
      controller.minimumZoomDistance = 50.0;
      controller.maximumZoomDistance = 4.0e8;
      controller.inertiaSpin = 0.88;
      controller.inertiaTranslate = 0.88;
      controller.inertiaZoom = 0.82;

      resetIndia();

      viewer.screenSpaceEventHandler.setInputAction((movement: any) => {
        if (!viewer || viewer.isDestroyed()) return;

        const picked = viewer.scene.pick(movement.position);
        const earthquake = picked?.id?._nayanEarthquake as NayanEarthquake | undefined;

        if (earthquake) {
          window.dispatchEvent(
            new CustomEvent("nayan:earthquake-selected", {
              detail: {
                earthquake,
                x: movement.position.x,
                y: movement.position.y,
              },
            }),
          );
          return;
        }

        window.dispatchEvent(new CustomEvent("nayan:earthquake-deselected"));
      }, Cesium.ScreenSpaceEventType.LEFT_CLICK);

      const onEarthquakeToggle = (event: Event) => {
        const enabled = (event as CustomEvent<boolean>).detail;
        if (enabled) {
          void showEarthquakes();
        } else {
          earthquakeAbortController?.abort();
          clearEarthquakes();
          window.dispatchEvent(new CustomEvent("nayan:earthquakes-cleared"));
        }
      };

      const onResetIndia = () => resetIndia();

      window.addEventListener("nayan:earthquakes-toggle", onEarthquakeToggle);
      window.addEventListener("nayan:reset-india", onResetIndia);

      viewer.scene.requestRender();

      return () => {
        window.removeEventListener("nayan:earthquakes-toggle", onEarthquakeToggle);
        window.removeEventListener("nayan:reset-india", onResetIndia);
        earthquakeAbortController?.abort();
      };
    };

    let removeListeners: (() => void) | undefined;

    loadCesium()
      .then((cleanup) => {
        removeListeners = cleanup;
      })
      .catch((error) => {
        if (!cancelled) {
          console.error("NAYAN globe failed to initialize:", error);
        }
      });

    return () => {
      cancelled = true;
      removeListeners?.();
      earthquakeAbortController?.abort();
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
