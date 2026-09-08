"use client";

import { useEffect, useState } from "react";
import NayanGlobe from "../../components/nayan-globe";
import type { NayanEarthquake } from "../../lib/data/usgs-earthquakes";
import type { NayanNaturalEvent } from "../../lib/data/eonet-natural-events";
import type { NayanSatellite } from "../../lib/data/satellites";

type Layer = { id: string; label: string; detail: string; status: "demo" | "live"; icon: string };
type EarthquakeSelection = { earthquake: NayanEarthquake; x: number; y: number };
type NaturalEventSelection = { event: NayanNaturalEvent; x: number; y: number };
type SatelliteSelection = { satellite: NayanSatellite; x: number; y: number };

const layers: Layer[] = [
  { id: "earthquakes", label: "Earthquakes", detail: "INDIA + SURROUNDING REGION", status: "live", icon: "🌋" },
  { id: "events", label: "Natural Events", detail: "INDIA + SURROUNDING REGION", status: "live", icon: "🌪️" },
  { id: "satellites", label: "Satellites", detail: "ACTIVE ORBITAL OBJECTS", status: "live", icon: "🛰️" },
  { id: "aircraft", label: "Aircraft", detail: "LIVE FLIGHT TRAFFIC", status: "demo", icon: "✈️" },
  { id: "ships", label: "Ships", detail: "MARITIME TRAFFIC", status: "demo", icon: "🚢" },
];

function formatUtc(timestamp: number) {
  return new Intl.DateTimeFormat("en-IN", { dateStyle: "medium", timeStyle: "short", timeZone: "UTC" }).format(new Date(timestamp)) + " UTC";
}

function formatNaturalCategory(event: NayanNaturalEvent) {
  return event.categoryLabel.toUpperCase();
}

export default function ExplorePage() {
  const [open, setOpen] = useState(false);
  const [activeLayers, setActiveLayers] = useState<string[]>([]);
  const [mapMode, setMapMode] = useState("Satellite");
  const [notice, setNotice] = useState("");
  const [selectedEarthquake, setSelectedEarthquake] = useState<EarthquakeSelection | null>(null);
  const [selectedNaturalEvent, setSelectedNaturalEvent] = useState<NaturalEventSelection | null>(null);
  const [earthquakeCount, setEarthquakeCount] = useState<number | null>(null);
  const [naturalEventCount, setNaturalEventCount] = useState<number | null>(null);
  const [selectedSatellite, setSelectedSatellite] = useState<SatelliteSelection | null>(null);
  const [satelliteCount, setSatelliteCount] = useState<number | null>(null);

  useEffect(() => {
    const onEarthquakeSelected = (event: Event) => { setSelectedNaturalEvent(null); setSelectedSatellite(null); setSelectedEarthquake((event as CustomEvent<EarthquakeSelection>).detail); };
    const onNaturalEventSelected = (event: Event) => { setSelectedEarthquake(null); setSelectedSatellite(null); setSelectedNaturalEvent((event as CustomEvent<NaturalEventSelection>).detail); };
    const onSatelliteSelected = (event: Event) => { setSelectedEarthquake(null); setSelectedNaturalEvent(null); setSelectedSatellite((event as CustomEvent<SatelliteSelection>).detail); };
    const onEarthquakeDeselected = () => setSelectedEarthquake(null);
    const onNaturalEventDeselected = () => setSelectedNaturalEvent(null);
    const onSatelliteDeselected = () => setSelectedSatellite(null);
    const onEarthquakeLoaded = (event: Event) => { setEarthquakeCount((event as CustomEvent<{ count: number }>).detail.count); setNotice("Earthquake layer updated"); };
    const onNaturalEventsLoaded = (event: Event) => { setNaturalEventCount((event as CustomEvent<{ count: number }>).detail.count); setNotice("Natural events layer updated"); };
    const onSatellitesLoaded = (event: Event) => { setSatelliteCount((event as CustomEvent<{ count: number }>).detail.count); setNotice("Satellite layer updated"); };
    const onEarthquakesCleared = () => setSelectedEarthquake(null);
    const onNaturalEventsCleared = () => setSelectedNaturalEvent(null);
    const onSatellitesCleared = () => setSelectedSatellite(null);
    const onError = (event: Event) => setNotice((event as CustomEvent<{ message: string }>).detail.message);

    window.addEventListener("nayan:earthquake-selected", onEarthquakeSelected);
    window.addEventListener("nayan:natural-event-selected", onNaturalEventSelected);
    window.addEventListener("nayan:satellite-selected", onSatelliteSelected);
    window.addEventListener("nayan:earthquake-deselected", onEarthquakeDeselected);
    window.addEventListener("nayan:natural-event-deselected", onNaturalEventDeselected);
    window.addEventListener("nayan:satellite-deselected", onSatelliteDeselected);
    window.addEventListener("nayan:earthquakes-loaded", onEarthquakeLoaded);
    window.addEventListener("nayan:natural-events-loaded", onNaturalEventsLoaded);
    window.addEventListener("nayan:satellites-loaded", onSatellitesLoaded);
    window.addEventListener("nayan:earthquakes-cleared", onEarthquakesCleared);
    window.addEventListener("nayan:natural-events-cleared", onNaturalEventsCleared);
    window.addEventListener("nayan:satellites-cleared", onSatellitesCleared);
    window.addEventListener("nayan:earthquakes-error", onError);
    window.addEventListener("nayan:natural-events-error", onError);
    window.addEventListener("nayan:satellites-error", onError);

    return () => {
      window.removeEventListener("nayan:earthquake-selected", onEarthquakeSelected);
      window.removeEventListener("nayan:natural-event-selected", onNaturalEventSelected);
      window.removeEventListener("nayan:satellite-selected", onSatelliteSelected);
      window.removeEventListener("nayan:earthquake-deselected", onEarthquakeDeselected);
      window.removeEventListener("nayan:natural-event-deselected", onNaturalEventDeselected);
      window.removeEventListener("nayan:satellite-deselected", onSatelliteDeselected);
      window.removeEventListener("nayan:earthquakes-loaded", onEarthquakeLoaded);
      window.removeEventListener("nayan:natural-events-loaded", onNaturalEventsLoaded);
      window.removeEventListener("nayan:satellites-loaded", onSatellitesLoaded);
      window.removeEventListener("nayan:earthquakes-cleared", onEarthquakesCleared);
      window.removeEventListener("nayan:natural-events-cleared", onNaturalEventsCleared);
      window.removeEventListener("nayan:satellites-cleared", onSatellitesCleared);
      window.removeEventListener("nayan:earthquakes-error", onError);
      window.removeEventListener("nayan:natural-events-error", onError);
      window.removeEventListener("nayan:satellites-error", onError);
    };
  }, []);

  const toggleLayer = (id: string) => {
    if (!["earthquakes", "events", "satellites"].includes(id)) {
      setNotice("Demo control — this layer will become live when its data provider is connected.");
      return;
    }
    const enabling = !activeLayers.includes(id);
    setActiveLayers((current) => enabling ? [...current, id] : current.filter((item) => item !== id));
    setSelectedEarthquake(null);
    setSelectedNaturalEvent(null);
    setSelectedSatellite(null);
    window.dispatchEvent(new CustomEvent(id === "earthquakes" ? "nayan:earthquakes-toggle" : id === "events" ? "nayan:natural-events-toggle" : "nayan:satellites-toggle", { detail: enabling }));
  };

  const resetIndia = () => {
    window.dispatchEvent(new CustomEvent("nayan:reset-india"));
    setSelectedEarthquake(null);
    setSelectedNaturalEvent(null);
    setSelectedSatellite(null);
    setNotice("India view reset");
  };

  return (
    <main className="explore-page">
      <NayanGlobe />
      <header className="explore-header"><div className="explore-brand">NAYAN</div><div className="explore-context"><span className="live-dot" /><span>INDIA · FROM ABOVE</span></div></header>
      <div className="explore-corner explore-corner--left"><span>01</span><span className="corner-line" /><span>EXPLORE</span></div>
      <div className="explore-corner explore-corner--right"><span>INDIA REGION</span><span className="corner-line" /><span>3D</span></div>

      {selectedSatellite && <aside className="earthquake-detail earthquake-detail--anchored" style={{ left: selectedSatellite.x > window.innerWidth / 2 ? Math.max(16, selectedSatellite.x - 356) : Math.min(Math.max(16, window.innerWidth - 356), selectedSatellite.x + 18), top: selectedSatellite.y > window.innerHeight / 2 ? Math.max(16, selectedSatellite.y - 292) : Math.min(Math.max(16, window.innerHeight - 292), selectedSatellite.y + 18), right: "auto", bottom: "auto", transform: "none", width: "min(340px, calc(100vw - 32px))" }}>
        <div className="earthquake-detail-top"><div><span className="hub-eyebrow">NAYAN / SATELLITE</span><div className="earthquake-magnitude">🛰️</div></div><button className="earthquake-detail-close" onClick={() => setSelectedSatellite(null)} aria-label="Close satellite details">×</button></div>
        <div className="earthquake-place">{selectedSatellite.satellite.name}</div>
        <div className="earthquake-meta-grid"><div><span>NORAD</span><strong>{selectedSatellite.satellite.noradCatalogId}</strong></div><div><span>ALTITUDE</span><strong>{selectedSatellite.satellite.altitudeKm.toFixed(0)} KM</strong></div><div><span>SPEED</span><strong>{selectedSatellite.satellite.speedKmPerSecond.toFixed(2)} KM/S</strong></div><div><span>INCLINATION</span><strong>{selectedSatellite.satellite.inclinationDeg.toFixed(2)}°</strong></div></div>
        <div className="earthquake-meta-grid"><div><span>LATITUDE</span><strong>{selectedSatellite.satellite.latitudeDeg.toFixed(2)}°</strong></div><div><span>LONGITUDE</span><strong>{selectedSatellite.satellite.longitudeDeg.toFixed(2)}°</strong></div><div><span>PERIOD</span><strong>{(1440 / selectedSatellite.satellite.meanMotionRevolutionsPerDay).toFixed(1)} MIN</strong></div><div><span>EPOCH</span><strong>{formatUtc(selectedSatellite.satellite.epoch)}</strong></div></div>
        <a className="earthquake-source" href={`https://celestrak.org/NORAD/elements/?CATNR=${selectedSatellite.satellite.noradCatalogId}`} target="_blank" rel="noreferrer">OPEN CELESTRAK <span>↗</span></a>
      </aside>}

      {selectedEarthquake && <aside className="earthquake-detail earthquake-detail--anchored" style={{ left: selectedEarthquake.x > window.innerWidth / 2 ? Math.max(16, selectedEarthquake.x - 356) : Math.min(Math.max(16, window.innerWidth - 356), selectedEarthquake.x + 18), top: selectedEarthquake.y > window.innerHeight / 2 ? Math.max(16, selectedEarthquake.y - 292) : Math.min(Math.max(16, window.innerHeight - 292), selectedEarthquake.y + 18), right: "auto", bottom: "auto", transform: "none", width: "min(340px, calc(100vw - 32px))" }}>
        <div className="earthquake-detail-top"><div><span className="hub-eyebrow">NAYAN / EARTHQUAKE</span><div className="earthquake-magnitude">M{selectedEarthquake.earthquake.magnitude.toFixed(1)}</div></div><button className="earthquake-detail-close" onClick={() => setSelectedEarthquake(null)} aria-label="Close earthquake details">×</button></div>
        <div className="earthquake-place">{selectedEarthquake.earthquake.place}</div>
        <div className="earthquake-meta-grid"><div><span>DEPTH</span><strong>{selectedEarthquake.earthquake.depthKm.toFixed(1)} KM</strong></div><div><span>TIME</span><strong>{formatUtc(selectedEarthquake.earthquake.time)}</strong></div><div><span>MAG TYPE</span><strong>{selectedEarthquake.earthquake.magType ?? "—"}</strong></div><div><span>TSUNAMI</span><strong>{selectedEarthquake.earthquake.tsunami ? "YES" : "NO"}</strong></div></div>
        <a className="earthquake-source" href={selectedEarthquake.earthquake.url} target="_blank" rel="noreferrer">OPEN USGS EVENT <span>↗</span></a>
      </aside>}

      {selectedNaturalEvent && <aside className="earthquake-detail earthquake-detail--anchored" style={{ left: selectedNaturalEvent.x > window.innerWidth / 2 ? Math.max(16, selectedNaturalEvent.x - 356) : Math.min(Math.max(16, window.innerWidth - 356), selectedNaturalEvent.x + 18), top: selectedNaturalEvent.y > window.innerHeight / 2 ? Math.max(16, selectedNaturalEvent.y - 292) : Math.min(Math.max(16, window.innerHeight - 292), selectedNaturalEvent.y + 18), right: "auto", bottom: "auto", transform: "none", width: "min(340px, calc(100vw - 32px))" }}>
        <div className="earthquake-detail-top"><div><span className="hub-eyebrow">NAYAN / NATURAL EVENT</span><div className="earthquake-magnitude">{formatNaturalCategory(selectedNaturalEvent.event)}</div></div><button className="earthquake-detail-close" onClick={() => setSelectedNaturalEvent(null)} aria-label="Close natural event details">×</button></div>
        <div className="earthquake-place">{selectedNaturalEvent.event.title}</div>
        <div className="earthquake-meta-grid"><div><span>CATEGORY</span><strong>{selectedNaturalEvent.event.categoryLabel}</strong></div><div><span>DATE</span><strong>{formatUtc(selectedNaturalEvent.event.date)}</strong></div><div><span>STATUS</span><strong>{selectedNaturalEvent.event.closed ? "CLOSED" : "OPEN"}</strong></div><div><span>MAGNITUDE</span><strong>{selectedNaturalEvent.event.magnitude.value !== null ? `${selectedNaturalEvent.event.magnitude.value} ${selectedNaturalEvent.event.magnitude.unit ?? ""}`.trim() : "—"}</strong></div></div>
        {selectedNaturalEvent.event.description && <p className="natural-event-description">{selectedNaturalEvent.event.description}</p>}
        <a className="earthquake-source" href={selectedNaturalEvent.event.sourceUrl} target="_blank" rel="noreferrer">OPEN EONET EVENT <span>↗</span></a>
      </aside>}

      <button className={`hub-trigger ${open ? "is-open" : ""}`} onClick={() => setOpen((value) => !value)} aria-expanded={open}><span className="hub-trigger-mark"><i /><i /><i /></span><span>CONTROL HUB</span></button>
      <aside className={`control-hub ${open ? "is-visible" : ""}`} aria-hidden={!open}>
        <div className="hub-header"><div><span className="hub-eyebrow">NAYAN / SYSTEM</span><h2>Control Hub</h2></div><button className="hub-close" onClick={() => setOpen(false)} aria-label="Close control hub">×</button></div>
        <section className="hub-section"><div className="section-label"><span>LAYERS</span><span>05</span></div><div className="layer-list">
          {layers.map((layer) => { const active = activeLayers.includes(layer.id); return <button key={layer.id} className={`layer-row ${active ? "is-active" : ""}`} onClick={() => toggleLayer(layer.id)}><span className="layer-icon" aria-hidden="true">{layer.icon}</span><span className="layer-copy"><strong>{layer.label}</strong><small>{layer.detail}</small></span><span className="layer-status">{layer.status === "live" ? "LIVE" : "DEMO"}</span></button>; })}
        </div></section>
        <section className="hub-section hub-section--compact"><div className="section-label"><span>MAP</span><span>02</span></div><div className="segmented-control">{["Satellite", "Terrain"].map((mode) => <button key={mode} className={mapMode === mode ? "is-selected" : ""} onClick={() => setMapMode(mode)}>{mode}</button>)}</div></section>
        <section className="hub-section hub-section--compact"><div className="section-label"><span>VIEW</span><span>01</span></div><button className="reset-view" onClick={resetIndia}><span>Reset to India</span><span>↗</span></button></section>
        {earthquakeCount !== null && activeLayers.includes("earthquakes") && <div className="hub-live-summary"><span>INDIA REGION / EARTHQUAKES</span><strong>{earthquakeCount} EVENTS LOADED</strong></div>}
        {naturalEventCount !== null && activeLayers.includes("events") && <div className="hub-live-summary"><span>INDIA REGION / NATURAL EVENTS</span><strong>{naturalEventCount} EVENTS LOADED</strong></div>}
        {satelliteCount !== null && activeLayers.includes("satellites") && <div className="hub-live-summary"><span>ORBITAL CATALOG / ACTIVE</span><strong>{satelliteCount} SATELLITES LOADED</strong></div>}
        <div className="hub-footer"><span>DATA SYSTEM</span><span>FOUNDATION / 01</span></div>
      </aside>
      {notice && <button className="hub-notice" onClick={() => setNotice("")}><span className="notice-dot" />{notice}<b>×</b></button>}
    </main>
  );
}
