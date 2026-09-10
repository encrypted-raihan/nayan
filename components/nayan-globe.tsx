"use client";

import { useEffect, useRef } from "react";
import { fetchIndiaAircraft, type NayanAircraft } from "../lib/data/aircraft";
import { fetchIndiaEarthquakes, type NayanEarthquake } from "../lib/data/usgs-earthquakes";
import { fetchIndiaNaturalEvents, type NayanNaturalEvent } from "../lib/data/eonet-natural-events";
import { fetchActiveSatellites, type NayanSatelliteRecord, propagateSatellite } from "../lib/data/satellites";
import type { NayanSatellite, NayanSatelliteCategory } from "../lib/data/satellites";

const AIRCRAFT_GLYPH = `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(`
<svg xmlns="http://www.w3.org/2000/svg" width="48" height="48" viewBox="0 0 48 48">
  <g fill="white" stroke="#111" stroke-width="2" stroke-linejoin="round">
    <path d="M23 3h2l3 17 13 5v3l-13-2-2 10 7 5v3l-9-3-9 3v-3l7-5-2-10-13 2v-3l13-5z"/>
  </g>
</svg>`)} `;
const AIRCRAFT_GLYPH_URL = AIRCRAFT_GLYPH.trim();

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

const NATURAL_EVENT_EMOJI: Record<NayanNaturalEvent["category"], string> = {
  storm: "🌪️",
  wildfire: "🔥",
  volcano: "🌋",
  flood: "🌧️",
  landslide: "🏔️",
  dust: "💨",
  ice: "❄️",
  other: "⚠️",
};

const getNaturalEventEmoji = (event: NayanNaturalEvent) =>
  NATURAL_EVENT_EMOJI[event.category] ?? NATURAL_EVENT_EMOJI.other;

type SatelliteFilterMode = "important" | "all" | "category";
type SatelliteFilter = { mode: SatelliteFilterMode; category?: NayanSatelliteCategory };

type AircraftVisual = {
  aircraft: NayanAircraft;
  billboard: any;
  position: any;
  observationPosition: any;
  observationAltitudeMeters: number | null;
  observationAt: number;
  transitionOffset: any;
  transitionStart: number;
  transitionDuration: number;
};

const AIRCRAFT_EARTH_RADIUS_METERS = 6_371_000;
const AIRCRAFT_MAX_PREDICTION_SECONDS = 90;
const AIRCRAFT_CORRECTION_SECONDS = 1.5;

function normalizeLongitude(longitudeDeg: number): number {
  return ((longitudeDeg + 540) % 360) - 180;
}

function predictAircraftPosition(aircraft: NayanAircraft, nowMs: number) {
  const ageSeconds = Math.min(
    AIRCRAFT_MAX_PREDICTION_SECONDS,
    Math.max(0, (nowMs - aircraft.lastSeen) / 1000),
  );

  if (
    aircraft.groundSpeedMetersPerSecond === null ||
    aircraft.headingDeg === null ||
    aircraft.groundSpeedMetersPerSecond <= 0 ||
    ageSeconds <= 0
  ) {
    return {
      latitude: aircraft.latitude,
      longitude: aircraft.longitude,
      altitudeMeters: aircraft.altitudeMeters,
    };
  }

  const distanceMeters = aircraft.groundSpeedMetersPerSecond * ageSeconds;
  const angularDistance = distanceMeters / AIRCRAFT_EARTH_RADIUS_METERS;
  const bearing = (aircraft.headingDeg * Math.PI) / 180;
  const latitude = (aircraft.latitude * Math.PI) / 180;
  const longitude = (aircraft.longitude * Math.PI) / 180;
  const sinLatitude = Math.sin(latitude);
  const cosLatitude = Math.cos(latitude);
  const sinAngularDistance = Math.sin(angularDistance);
  const cosAngularDistance = Math.cos(angularDistance);

  const predictedLatitude = Math.asin(
    sinLatitude * cosAngularDistance +
      cosLatitude * sinAngularDistance * Math.cos(bearing),
  );
  const predictedLongitude = longitude + Math.atan2(
    Math.sin(bearing) * sinAngularDistance * cosLatitude,
    cosAngularDistance - sinLatitude * Math.sin(predictedLatitude),
  );

  return {
    latitude: (predictedLatitude * 180) / Math.PI,
    longitude: normalizeLongitude((predictedLongitude * 180) / Math.PI),
    altitudeMeters: aircraft.altitudeMeters !== null && aircraft.verticalRateMetersPerSecond !== null
      ? Math.max(0, aircraft.altitudeMeters + aircraft.verticalRateMetersPerSecond * ageSeconds)
      : aircraft.altitudeMeters,
  };
}

export default function NayanGlobe() {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let viewer: any = null;
    let CesiumRef: any = null;
    let cancelled = false;
    let earthquakeEntities: any[] = [];
    let naturalEventEntities: any[] = [];
    let satellitePoints: any = null;
    let satelliteRecords = new Map<number, NayanSatelliteRecord>();
    let satellitePointByNorad = new Map<number, any>();
    let satelliteRefreshTimer: number | null = null;
    let satelliteAbortController: AbortController | null = null;
    let earthquakeAbortController: AbortController | null = null;
    let naturalEventAbortController: AbortController | null = null;
    let aircraftAbortController: AbortController | null = null;
    let aircraftPoints: any = null;
    let aircraftVisuals = new Map<string, AircraftVisual>();
    let aircraftAnimationFrame: number | null = null;
    let aircraftPollTimer: number | null = null;
    let satelliteFilter: SatelliteFilter = { mode: "important" };

    const clearEarthquakes = () => {
      if (!viewer || viewer.isDestroyed()) return;
      for (const entity of earthquakeEntities) viewer.entities.remove(entity);
      earthquakeEntities = [];
      viewer.scene.requestRender();
    };

    const clearSatellites = () => {
      if (!viewer || viewer.isDestroyed()) return;
      if (satelliteRefreshTimer !== null) {
        window.clearInterval(satelliteRefreshTimer);
        satelliteRefreshTimer = null;
      }
      if (satellitePoints) {
        viewer.scene.primitives.remove(satellitePoints);
        satellitePoints = null;
      }
      satelliteRecords.clear();
      satellitePointByNorad.clear();
      viewer.scene.requestRender();
    };

    const clearNaturalEvents = () => {
      if (!viewer || viewer.isDestroyed()) return;
      for (const entity of naturalEventEntities) viewer.entities.remove(entity);
      naturalEventEntities = [];
      viewer.scene.requestRender();
    };

    const clearAircraft = () => {
      if (!viewer || viewer.isDestroyed()) return;
      if (aircraftPollTimer !== null) {
        window.clearInterval(aircraftPollTimer);
        aircraftPollTimer = null;
      }
      aircraftAbortController?.abort();
      if (aircraftAnimationFrame !== null) {
        window.cancelAnimationFrame(aircraftAnimationFrame);
        aircraftAnimationFrame = null;
      }
      if (aircraftPoints) {
        viewer.scene.primitives.remove(aircraftPoints);
        aircraftPoints = null;
      }
      aircraftVisuals.clear();
      viewer.scene.requestRender();
    };

    const addNaturalEventPoint = (event: NayanNaturalEvent) => {
      const entity = viewer.entities.add({
        id: `nayan-natural-event-${event.id}-point`,
        name: event.title,
        position: CesiumRef.Cartesian3.fromDegrees(event.longitude, event.latitude, 0),
        label: {
          text: getNaturalEventEmoji(event),
          font: '30px "Apple Color Emoji", "Segoe UI Emoji", "Noto Color Emoji", sans-serif',
          style: CesiumRef.LabelStyle.FILL,
          verticalOrigin: CesiumRef.VerticalOrigin.CENTER,
          horizontalOrigin: CesiumRef.HorizontalOrigin.CENTER,
          heightReference: CesiumRef.HeightReference.CLAMP_TO_GROUND,
          disableDepthTestDistance: 0,
          scaleByDistance: new CesiumRef.NearFarScalar(500000, 1.15, 18000000, 0.7),
          translucencyByDistance: new CesiumRef.NearFarScalar(500000, 1.0, 18000000, 0.82),
          showBackground: false,
        },
      });
      entity._nayanNaturalEvent = event;
      naturalEventEntities.push(entity);
    };

    const addNaturalEventGeometry = (event: NayanNaturalEvent) => {
      if (event.geometryType === "Point") {
        addNaturalEventPoint(event);
        return;
      }

      if (event.geometryType === "LineString") {
        const coordinates = event.coordinates as number[][];
        const positions = coordinates.map(([longitude, latitude]) =>
          CesiumRef.Cartesian3.fromDegrees(longitude, latitude, 250),
        );
        const entity = viewer.entities.add({
          id: `nayan-natural-event-${event.id}-line`,
          name: event.title,
          polyline: {
            positions,
            width: 3,
            material: CesiumRef.Color.WHITE.withAlpha(0.72),
            clampToGround: true,
          },
        });
        entity._nayanNaturalEvent = event;
        naturalEventEntities.push(entity);
        addNaturalEventPoint(event);
        return;
      }

      const rings = event.coordinates as number[][][];
      const outerRing = rings[0] ?? [];
      if (!outerRing.length) {
        addNaturalEventPoint(event);
        return;
      }

      const hierarchy = outerRing.map(([longitude, latitude]) =>
        CesiumRef.Cartesian3.fromDegrees(longitude, latitude, 100),
      );
      const entity = viewer.entities.add({
        id: `nayan-natural-event-${event.id}-polygon`,
        name: event.title,
        polygon: {
          hierarchy: new CesiumRef.PolygonHierarchy(hierarchy),
          material: CesiumRef.Color.WHITE.withAlpha(0.12),
          outline: true,
          outlineColor: CesiumRef.Color.WHITE.withAlpha(0.78),
          outlineWidth: 2,
          height: 100,
        },
      });
      entity._nayanNaturalEvent = event;
      naturalEventEntities.push(entity);
      addNaturalEventPoint(event);
    };

    const showNaturalEvents = async () => {
      if (!viewer || viewer.isDestroyed() || !CesiumRef) return;
      clearNaturalEvents();
      naturalEventAbortController?.abort();
      naturalEventAbortController = new AbortController();
      try {
        const events = await fetchIndiaNaturalEvents(naturalEventAbortController.signal);
        if (cancelled || !viewer || viewer.isDestroyed()) return;
        for (const event of events) addNaturalEventGeometry(event);
        window.dispatchEvent(new CustomEvent("nayan:natural-events-loaded", { detail: { count: events.length } }));
        viewer.scene.requestRender();
      } catch (error) {
        if ((error as Error)?.name === "AbortError") return;
        console.warn("NAYAN natural events layer unavailable:", error);
        window.dispatchEvent(new CustomEvent("nayan:natural-events-error", { detail: { message: "Unable to load natural event data." } }));
      }
    };

    const satelliteMatchesFilter = (satellite: NayanSatellite) => {
      if (satelliteFilter.mode === "all") return true;
      if (satelliteFilter.mode === "category") return satellite.category === satelliteFilter.category;
      return satellite.important;
    };

    const renderSatellites = () => {
      if (!viewer || viewer.isDestroyed() || !CesiumRef || !satelliteRecords.size) return;
      if (satellitePoints) viewer.scene.primitives.remove(satellitePoints);
      satellitePoints = viewer.scene.primitives.add(new CesiumRef.PointPrimitiveCollection());
      satellitePointByNorad.clear();

      const now = new Date();
      let displayedCount = 0;
      for (const record of satelliteRecords.values()) {
        const satellite = propagateSatellite(record, now);
        if (!satellite || !satelliteMatchesFilter(satellite)) continue;
        const point = satellitePoints.add({
          id: `nayan-satellite-${satellite.noradCatalogId}`,
          position: CesiumRef.Cartesian3.fromDegrees(
            satellite.longitudeDeg,
            satellite.latitudeDeg,
            satellite.altitudeKm * 1000,
          ),
          pixelSize: satellite.important ? 7 : 5,
          color: CesiumRef.Color.WHITE,
          outlineColor: CesiumRef.Color.BLACK,
          outlineWidth: 1,
          disableDepthTestDistance: 0,
        });
        point._nayanSatellite = satellite;
        satellitePointByNorad.set(satellite.noradCatalogId, point);
        displayedCount += 1;
      }

      window.dispatchEvent(new CustomEvent("nayan:satellites-filtered", {
        detail: { count: displayedCount, catalogCount: satelliteRecords.size, filter: satelliteFilter },
      }));
      viewer.scene.requestRender();
    };

    const showSatellites = async () => {
      if (!viewer || viewer.isDestroyed() || !CesiumRef) return;
      clearSatellites();
      satelliteAbortController?.abort();
      satelliteAbortController = new AbortController();
      try {
        const records = await fetchActiveSatellites(satelliteAbortController.signal);
        if (cancelled || !viewer || viewer.isDestroyed()) return;
        satelliteRecords = new Map(records.map((record) => [record.satellite.noradCatalogId, record]));
        renderSatellites();

        const refresh = () => {
          if (!satellitePoints || !viewer || viewer.isDestroyed()) return;
          const date = new Date();
          for (const record of satelliteRecords.values()) {
            const satellite = propagateSatellite(record, date);
            const point = satellitePointByNorad.get(record.satellite.noradCatalogId);
            if (!satellite || !point || !satelliteMatchesFilter(satellite)) continue;
            point.position = CesiumRef.Cartesian3.fromDegrees(
              satellite.longitudeDeg,
              satellite.latitudeDeg,
              satellite.altitudeKm * 1000,
            );
            point._nayanSatellite = satellite;
          }
          viewer.scene.requestRender();
        };

        satelliteRefreshTimer = window.setInterval(refresh, 1000);
      } catch (error) {
        if ((error as Error)?.name === "AbortError") return;
        console.warn("NAYAN satellite layer unavailable:", error);
        window.dispatchEvent(new CustomEvent("nayan:satellites-error", { detail: { message: "Unable to load satellite data." } }));
      }
    };

    const applySatelliteFilter = (filter: SatelliteFilter) => {
      satelliteFilter = filter;
      if (satelliteRecords.size) renderSatellites();
    };

    const runAircraftAnimation = (time: number) => {
      if (cancelled || !viewer || viewer.isDestroyed() || !aircraftPoints || !CesiumRef) {
        aircraftAnimationFrame = null;
        return;
      }

      const nowMs = Date.now();
      for (const visual of aircraftVisuals.values()) {
        const aircraft = visual.aircraft;
        const predicted = predictAircraftPosition(aircraft, nowMs);
        const desired = CesiumRef.Cartesian3.fromDegrees(
          predicted.longitude,
          predicted.latitude,
          Math.max(80, predicted.altitudeMeters ?? 80),
        );

        const correctionElapsed = Math.max(0, time - visual.transitionStart);
        const correctionProgress = Math.min(1, correctionElapsed / visual.transitionDuration);
        const eased = correctionProgress < 0.5
          ? 4 * correctionProgress * correctionProgress * correctionProgress
          : 1 - Math.pow(-2 * correctionProgress + 2, 3) / 2;

        if (correctionProgress < 1) {
          CesiumRef.Cartesian3.lerp(visual.position, desired, eased, visual.position);
        } else {
          visual.position = desired;
        }
        visual.billboard.position = visual.position;
      }

      viewer.scene.requestRender();
      aircraftAnimationFrame = window.requestAnimationFrame(runAircraftAnimation);
    };

    const ensureAircraftAnimation = () => {
      if (aircraftAnimationFrame === null) {
        aircraftAnimationFrame = window.requestAnimationFrame(runAircraftAnimation);
      }
    };

    const addOrUpdateAircraft = (aircraft: NayanAircraft, durationMs: number, seenIds: Set<string>) => {
      if (!aircraftPoints || !CesiumRef) return;
      const target = CesiumRef.Cartesian3.fromDegrees(
        aircraft.longitude,
        aircraft.latitude,
        Math.max(80, aircraft.altitudeMeters ?? 80),
      );
      const existing = aircraftVisuals.get(aircraft.icao24);

      if (!existing) {
        const billboard = aircraftPoints.add({
          id: `nayan-aircraft-${aircraft.icao24}`,
          image: AIRCRAFT_GLYPH_URL,
          position: target,
          width: 22,
          height: 22,
          rotation: aircraft.headingDeg !== null ? CesiumRef.Math.toRadians(-aircraft.headingDeg) : 0,
          alignedAxis: CesiumRef.Cartesian3.UNIT_Z,
          verticalOrigin: CesiumRef.VerticalOrigin.CENTER,
          horizontalOrigin: CesiumRef.HorizontalOrigin.CENTER,
          disableDepthTestDistance: 0,
          translucencyByDistance: new CesiumRef.NearFarScalar(100000, 1.0, 12000000, 0.58),
          scaleByDistance: new CesiumRef.NearFarScalar(100000, 0.95, 20000000, 0.65),
        });
        billboard._nayanAircraft = aircraft;
        aircraftVisuals.set(aircraft.icao24, {
          aircraft,
          billboard,
          position: CesiumRef.Cartesian3.clone(target),
          observationPosition: CesiumRef.Cartesian3.clone(target),
          observationAltitudeMeters: aircraft.altitudeMeters,
          observationAt: aircraft.lastSeen,
          transitionOffset: new CesiumRef.Cartesian3(0, 0, 0),
          transitionStart: performance.now(),
          transitionDuration: durationMs,
        });
        seenIds.add(aircraft.icao24);
        return;
      }

      existing.aircraft = aircraft;
      existing.billboard._nayanAircraft = aircraft;
      existing.billboard.rotation = aircraft.headingDeg !== null
        ? CesiumRef.Math.toRadians(-aircraft.headingDeg)
        : existing.billboard.rotation;
      existing.observationPosition = target;
      existing.observationAltitudeMeters = aircraft.altitudeMeters;
      existing.observationAt = aircraft.lastSeen;
      existing.transitionStart = performance.now();
      existing.transitionDuration = durationMs;
      seenIds.add(aircraft.icao24);
    };

    const renderAircraftSnapshot = (aircraftList: NayanAircraft[]) => {
      if (!viewer || viewer.isDestroyed() || !CesiumRef) return;
      if (!aircraftPoints) aircraftPoints = viewer.scene.primitives.add(new CesiumRef.BillboardCollection());

      const seenIds = new Set<string>();
      for (const aircraft of aircraftList) addOrUpdateAircraft(aircraft, AIRCRAFT_CORRECTION_SECONDS * 1000, seenIds);

      for (const [icao24, visual] of aircraftVisuals) {
        if (seenIds.has(icao24)) continue;
        aircraftPoints.remove(visual.billboard);
        aircraftVisuals.delete(icao24);
      }

      window.dispatchEvent(new CustomEvent("nayan:aircraft-loaded", { detail: { count: aircraftVisuals.size } }));
      ensureAircraftAnimation();
      viewer.scene.requestRender();
    };

    const showAircraft = async () => {
      if (!viewer || viewer.isDestroyed() || !CesiumRef) return;
      clearAircraft();
      aircraftAbortController = new AbortController();
      aircraftPoints = viewer.scene.primitives.add(new CesiumRef.BillboardCollection());
      viewer.scene.requestRender();
      window.dispatchEvent(new CustomEvent("nayan:aircraft-loading"));

      const refresh = async () => {
        if (cancelled || !viewer || viewer.isDestroyed()) return;
        try {
          const aircraft = await fetchIndiaAircraft(aircraftAbortController?.signal);
          if (cancelled || !viewer || viewer.isDestroyed()) return;
          renderAircraftSnapshot(aircraft);
        } catch (error) {
          if ((error as Error)?.name === "AbortError") return;
          console.warn("NAYAN aircraft layer unavailable:", error);
          window.dispatchEvent(new CustomEvent("nayan:aircraft-error", { detail: { message: "Unable to load aircraft data." } }));
        }
      };

      void refresh();
      aircraftPollTimer = window.setInterval(() => void refresh(), 10_000);
    };

    const flyToEarthquake = (earthquake: NayanEarthquake) => {
      if (!viewer || viewer.isDestroyed() || !CesiumRef) return;
      viewer.camera.flyTo({
        destination: CesiumRef.Cartesian3.fromDegrees(earthquake.longitude, earthquake.latitude, 260000),
        orientation: { heading: 0, pitch: CesiumRef.Math.toRadians(-90), roll: 0 },
        duration: 1.35,
        easingFunction: CesiumRef.EasingFunction.CUBIC_IN_OUT,
      });
    };

    const flyToNaturalEvent = (event: NayanNaturalEvent) => {
      if (!viewer || viewer.isDestroyed() || !CesiumRef) return;
      viewer.camera.flyTo({
        destination: CesiumRef.Cartesian3.fromDegrees(event.longitude, event.latitude, 320000),
        orientation: { heading: 0, pitch: CesiumRef.Math.toRadians(-90), roll: 0 },
        duration: 1.35,
        easingFunction: CesiumRef.EasingFunction.CUBIC_IN_OUT,
      });
    };

    const flyToSatellite = (satellite: NayanSatellite, x: number, y: number) => {
      if (!viewer || viewer.isDestroyed() || !CesiumRef) return;
      viewer.camera.flyTo({
        destination: CesiumRef.Cartesian3.fromDegrees(
          satellite.longitudeDeg,
          satellite.latitudeDeg,
          Math.max(120000, satellite.altitudeKm * 1000 + 80000),
        ),
        orientation: { heading: 0, pitch: CesiumRef.Math.toRadians(-90), roll: 0 },
        duration: 1.35,
        easingFunction: CesiumRef.EasingFunction.CUBIC_IN_OUT,
      });
      window.dispatchEvent(new CustomEvent("nayan:satellite-selected", { detail: { satellite, x, y } }));
    };

    const resetIndia = () => {
      if (!viewer || viewer.isDestroyed() || !CesiumRef) return;
      viewer.camera.flyTo({
        destination: CesiumRef.Cartesian3.fromDegrees(INDIA_CAMERA.longitude, INDIA_CAMERA.latitude, INDIA_CAMERA.height),
        orientation: { heading: 0, pitch: CesiumRef.Math.toRadians(-90), roll: 0 },
        duration: 1.1,
        easingFunction: CesiumRef.EasingFunction.CUBIC_IN_OUT,
      });
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
            position: CesiumRef.Cartesian3.fromDegrees(earthquake.longitude, earthquake.latitude, 0),
            label: {
              text: "💥",
              font: `30px "Apple Color Emoji", "Segoe UI Emoji", "Noto Color Emoji", sans-serif`,
              style: CesiumRef.LabelStyle.FILL,
              verticalOrigin: CesiumRef.VerticalOrigin.CENTER,
              horizontalOrigin: CesiumRef.HorizontalOrigin.CENTER,
              heightReference: CesiumRef.HeightReference.CLAMP_TO_GROUND,
              disableDepthTestDistance: 0,
              scale: Math.max(0.72, Math.min(1.25, size / 12)),
              scaleByDistance: new CesiumRef.NearFarScalar(500000, 1.05, 18000000, 0.68),
              showBackground: false,
            },
          });
          entity._nayanEarthquake = earthquake;
          earthquakeEntities.push(entity);
        }
        window.dispatchEvent(new CustomEvent("nayan:earthquakes-loaded", { detail: { count: earthquakes.length } }));
        viewer.scene.requestRender();
      } catch (error) {
        if ((error as Error)?.name === "AbortError") return;
        console.warn("NAYAN earthquake layer unavailable:", error);
        window.dispatchEvent(new CustomEvent("nayan:earthquakes-error", { detail: { message: "Unable to load earthquake data." } }));
      }
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
          const existing = document.querySelector<HTMLScriptElement>('script[data-nayan-cesium="true"]');
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
      CesiumRef = Cesium;
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
        scene3DOnly: true,
        requestRenderMode: true,
        maximumRenderTimeChange: Number.POSITIVE_INFINITY,
        terrainProvider,
      });

      const scene = viewer.scene;
      const globe = scene.globe;
      const controller = scene.screenSpaceCameraController;
      scene.backgroundColor = Cesium.Color.BLACK;
      scene.skyBox.show = true;
      scene.skyAtmosphere.show = true;
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
        const satellite = picked?.primitive?._nayanSatellite as NayanSatellite | undefined;
        const aircraft = picked?.primitive?._nayanAircraft as NayanAircraft | undefined;
        const earthquake = picked?.id?._nayanEarthquake as NayanEarthquake | undefined;
        const naturalEvent = picked?.id?._nayanNaturalEvent as NayanNaturalEvent | undefined;
        if (aircraft) {
          const visual = aircraftVisuals.get(aircraft.icao24);
          if (visual && CesiumRef) {
            viewer.camera.flyTo({
              destination: CesiumRef.Cartesian3.fromDegrees(
                aircraft.longitude,
                aircraft.latitude,
                Math.max(50000, aircraft.altitudeMeters ?? 50000),
              ),
              orientation: { heading: 0, pitch: CesiumRef.Math.toRadians(-90), roll: 0 },
              duration: 1.15,
              easingFunction: CesiumRef.EasingFunction.CUBIC_IN_OUT,
            });
          }
          window.dispatchEvent(new CustomEvent("nayan:aircraft-selected", { detail: { aircraft, x: movement.position.x, y: movement.position.y } }));
          return;
        }
        if (satellite) {
          flyToSatellite(satellite, movement.position.x, movement.position.y);
          return;
        }
        if (earthquake) {
          flyToEarthquake(earthquake);
          window.dispatchEvent(new CustomEvent("nayan:earthquake-selected", { detail: { earthquake, x: movement.position.x, y: movement.position.y } }));
          return;
        }
        if (naturalEvent) {
          flyToNaturalEvent(naturalEvent);
          window.dispatchEvent(new CustomEvent("nayan:natural-event-selected", { detail: { event: naturalEvent, x: movement.position.x, y: movement.position.y } }));
          return;
        }
        window.dispatchEvent(new CustomEvent("nayan:aircraft-deselected"));
        window.dispatchEvent(new CustomEvent("nayan:earthquake-deselected"));
        window.dispatchEvent(new CustomEvent("nayan:natural-event-deselected"));
        window.dispatchEvent(new CustomEvent("nayan:satellite-deselected"));
      }, Cesium.ScreenSpaceEventType.LEFT_CLICK);

      const onAircraftToggle = (event: Event) => {
        const enabled = (event as CustomEvent<boolean>).detail;
        if (enabled) void showAircraft();
        else {
          aircraftAbortController?.abort();
          clearAircraft();
          window.dispatchEvent(new CustomEvent("nayan:aircraft-cleared"));
        }
      };

      const onEarthquakeToggle = (event: Event) => {
        const enabled = (event as CustomEvent<boolean>).detail;
        if (enabled) void showEarthquakes();
        else {
          earthquakeAbortController?.abort();
          clearEarthquakes();
          window.dispatchEvent(new CustomEvent("nayan:earthquakes-cleared"));
        }
      };

      const onNaturalEventsToggle = (event: Event) => {
        const enabled = (event as CustomEvent<boolean>).detail;
        if (enabled) void showNaturalEvents();
        else {
          naturalEventAbortController?.abort();
          clearNaturalEvents();
          window.dispatchEvent(new CustomEvent("nayan:natural-events-cleared"));
        }
      };

      const onSatellitesToggle = (event: Event) => {
        const enabled = (event as CustomEvent<boolean>).detail;
        if (enabled) {
          satelliteFilter = { mode: "important" };
          void showSatellites();
        } else {
          satelliteAbortController?.abort();
          clearSatellites();
          window.dispatchEvent(new CustomEvent("nayan:satellites-cleared"));
        }
      };

      const onSatelliteFilter = (event: Event) => applySatelliteFilter((event as CustomEvent<SatelliteFilter>).detail);
      const onResetIndia = () => resetIndia();
      window.addEventListener("nayan:aircraft-toggle", onAircraftToggle);
      window.addEventListener("nayan:earthquakes-toggle", onEarthquakeToggle);
      window.addEventListener("nayan:natural-events-toggle", onNaturalEventsToggle);
      window.addEventListener("nayan:satellites-toggle", onSatellitesToggle);
      window.addEventListener("nayan:satellite-filter", onSatelliteFilter);
      window.addEventListener("nayan:reset-india", onResetIndia);
      viewer.scene.requestRender();

      return () => {
        window.removeEventListener("nayan:aircraft-toggle", onAircraftToggle);
        window.removeEventListener("nayan:earthquakes-toggle", onEarthquakeToggle);
        window.removeEventListener("nayan:natural-events-toggle", onNaturalEventsToggle);
        window.removeEventListener("nayan:satellites-toggle", onSatellitesToggle);
        window.removeEventListener("nayan:satellite-filter", onSatelliteFilter);
        window.removeEventListener("nayan:reset-india", onResetIndia);
        earthquakeAbortController?.abort();
        naturalEventAbortController?.abort();
        satelliteAbortController?.abort();
        clearAircraft();
        clearSatellites();
      };
    };

    let removeListeners: (() => void) | undefined;
    loadCesium().then((cleanup) => { removeListeners = cleanup; }).catch((error) => {
      if (!cancelled) console.warn("NAYAN globe failed to initialize:", error);
    });

    return () => {
      cancelled = true;
      removeListeners?.();
      if (viewer && !viewer.isDestroyed()) viewer.destroy();
      viewer = null;
      CesiumRef = null;
    };
  }, []);

  return <div ref={containerRef} className="nayan-globe" aria-label="NAYAN 3D Earth visualization" />;
}
