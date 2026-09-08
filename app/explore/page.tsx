"use client";

import { useEffect, useState } from "react";
import NayanGlobe from "../../components/nayan-globe";
import type { NayanEarthquake } from "../../lib/data/usgs-earthquakes";
import type { NayanNaturalEvent } from "../../lib/data/eonet-natural-events";

type Layer = { id: string; label: string; detail: string; status: "demo" | "live"; icon: string };
type EarthquakeSelection = { earthquake: NayanEarthquake; x: number; y: number };
type NaturalEventSelection = { event: NayanNaturalEvent; x: number; y: number };

const layers: Layer[] = [
  { id: "earthquakes", label: "Earthquakes", detail: "INDIA + SURROUNDING REGION", status: "live", icon: "🌋" },
  { id: "events", label: "Natural Events", detail: "INDIA + SURROUNDING REGION", status: "live", icon: "🌪️" },
  { id: "satellites", label: "Satellites", detail: "ORBITAL OBJECTS", status: "demo", icon: "🛰️" },
  { id: "aircraft", label: "Aircraft", detail: "LIVE FLIGHT TRAFFIC", status: "demo", icon: "✈️" },
  { id: "ships", label: "Ships", detail: "MARITIME TRAFFIC", status: "demo", icon: "🚢" },
];

function formatUtc(timestamp: number) { return new Intl.DateTimeFormat("en-IN", { dateStyle: "medium", timeStyle: "short", timeZone: "UTC" }).format(new Date(timestamp)) + " UTC"; }
function formatNaturalCategory(event: NayanNaturalEvent) { return event.categoryLabel.toUpperCase(); }

export default function ExplorePage() {
  const [open, setOpen] = useState(false);
  const [activeLayers, setActiveLayers] = useState<string[]>([]);
  const [mapMode, setMapMode] = useState("Satellite");
  const [notice, setNotice] = useState("");
  const [selectedEarthquake, setSelectedEarthquake] = useState<EarthquakeSelection | null>(null);
  const [selectedNaturalEvent, setSelectedNaturalEvent] = useState<NaturalEventSelection | null>(null);
  const [earthquakeCount, setEarthquakeCount] = useState<number | null>(null);
  const [naturalEventCount, setNaturalEventCount] = useState<number | null>(null);

  useEffect(() => {
    const onEarthquakeSelected = (event: Event) => { setSelectedNaturalEvent(null); setSelectedEarthquake((event as CustomEvent<EarthquakeSelection>).detail); };
    const onNaturalEventSelected = (event: Event) => { setSelectedEarthquake(null); setSelectedNaturalEvent((event as CustomEvent<NaturalEventSelection>).detail); };
    const onEarthquakeDeselected = () => setSelectedEarthquake(null);
    const onNaturalEventDeselected = () => setSelectedNaturalEvent(null);
    const onEarthquakeLoaded = (event: Event) => { setEarthquakeCount((event as CustomEvent<{ count: number }>).detail.count); setNotice("Earthquake layer updated"); };
    const onNaturalEventsLoaded = (event: Event) => { setNaturalEventCount((event as CustomEvent<{ count: number }>).detail.count); setNotice("Natural events layer updated"); };
    const onNaturalEventsCleared = () => setSelectedNaturalEvent(null);
    const onError = (event: Event) => setNotice((event as CustomEvent<{ message: string }>).detail.message);
    window.addEventListener("nayan:earthquake-selected", onEarthquakeSelected); window.addEventListener("nayan:natural-event-selected", onNaturalEventSelected);
    window.addEventListener("nayan:earthquake-deselected", onEarthquakeDeselected); window.addEventListener("nayan:natural-event-deselected", onNaturalEventDeselected);
    window.addEventListener("nayan:earthquakes-loaded", onEarthquakeLoaded); window.addEventListener("nayan:natural-events-loaded", onNaturalEventsLoaded);
    window.addEventListener("nayan:natural-events-cleared", onNaturalEventsCleared); window.addEventListener("nayan:earthquakes-error", onError); window.addEventListener("nayan:natural-events-error", onError);
    return () => {
      window.removeEventListener("nayan:earthquake-selected", onEarthquakeSelected); window.removeEventListener("nayan:natural-event-selected", onNaturalEventSelected);
      window.removeEventListener("nayan:earthquake-deselected", onEarthquakeDeselected); window.removeEventListener("nayan:natural-event-deselected", onNaturalEventDeselected);
      window.removeEventListener("nayan:earthquakes-loaded", onEarthquakeLoaded); window.removeEventListener("nayan:natural-events-loaded", onNaturalEventsLoaded);
      window.removeEventListener("nayan:natural-events-cleared", onNaturalEventsCleared); window.removeEventListener("nayan:earthquakes-error", onError); window.removeEventListener("nayan:natural-events-error", onError);
    };
  }, []);

  const toggleLayer = (id: string) => {
    if (id !== "earthquakes" && id !== "events") { setNotice("Demo control — this layer will become live when its data provider is connected."); return; }
    const enabling = !activeLayers.includes(id);
    setActiveLayers((current) => enabling ? [...current, id] : current.filter((item) => item !== id));
    setSelectedEarthquake(null); setSelectedNaturalEvent(null);
    window.dispatchEvent(new CustomEvent(id === "earthquakes" ? "nayan:earthquakes-toggle" : "nayan:natural-events-toggle", { detail: enabling }));
  };
  const resetIndia = () => { window.dispatchEvent(new CustomEvent("nayan:reset-india")); setSelectedEarthquake(null); setSelectedNaturalEvent(null); setNotice("India view reset"); };
  const selected = selectedNaturalEvent;

  return (
    <main className="explore-page">
      <NayanGlobe />
      <header className="explore-header"><div className="explore-brand">NAYAN</div><div className="explore-context"><span className="live-dot" /><span>INDIA · FROM ABOVE</span></div></header>
      <div className="explore-corner explore-corner--left"><span>01</span><span className="corner-line" /><span>EXPLORE</span></div><div className="explore-corner explore-corner--right"><span>INDIA REGION</span><span className="corner-line" /><span>3D</span></div>

      {selectedEarthquake && <aside className="earthquake-detail earthquake-detail--anchored" style={{ left: selectedEarthquake.x > window.innerWidth / 2 ? Math.max(16, selectedEarthquake.x - 356) : Math.min(Math.max(16, window.innerWidth - 356), selectedEarthquake.x + 18), top: selectedEarthquake.y > window.innerHeight / 2 ? Math.max(16, selectedEarthquake.y - 292) : Math.min(Math.max(16, window.innerHeight - 292), selectedEarthquake.y + 18), right: "auto", bottom: "auto", transform: "none", width: "min(340px, calc(100vw - 32px))" }}>
        <div className="earthquake-detail-top"><div><span className="hub-eyebrow">NAYAN / EARTHQUAKE</span><div className="earthquake-magnitude">M{selectedEarthquake.earthquake.magnitude.toFixed(1)}</div></div><button className="earthquake-detail-close" onClick={() => setSelectedEarthquake(null)} aria-label="Close earthquake details">×</button></div>
        <div className="earthquake-place">{selectedEarthquake.earthquake.place}</div><div className="earthquake-meta-grid"><div><span>DEPTH</span><strong>{selectedEarthquake.earthquake.depthKm.toFixed(1)} KM</strong></div><div><span>TIME</span><strong>{formatUtc(selectedEarthquake.earthquake.time)}</strong></div><div><span>MAG TYPE</span><strong>{selectedEarthquake.earthquake.magType ?? "—"}</strong></div><div><span>TSUNAMI</span><strong>{selectedEarthquake.earthquake.tsunami ? "YES" : "NO"}</strong></div></div>
        <a className="earthquake-source" href={selectedEarthquake.earthquake.url} target="_blank" rel="noreferrer">OPEN USGS EVENT <span>↗</span></a>
      </aside>}

      {selected && <aside className="earthquake-detail earthquake-detail--anchored" style={{ left: selected.x > window.innerWidth / 2 ? Math.max(16, selected.x - 356) : Math.min(Math.max(16, window.innerWidth - 356), selected.x + 18), top: selected.y > window.innerHeight / 2 ? Math.max(16, selected.y - 292) : Math.min(Math.max(16, window.innerHeight - 292), selected.y + 18), right: "auto", bottom: "auto", transform: "none", width: "min(340px, calc(100vw - 32px))" }}>
        <div className="earthquake-detail-top"><div><span className="hub-eyebrow">NAYAN / NATURAL EVENT</span><div className="earthquake-magnitude">{formatNaturalCategory(selected.event)}</div></div><button className="earthquake-detail-close" onClick={() => setSelectedNaturalEvent(null)} aria-label="Close natural event details">×</button></div>
        <div className="earthquake-place">{selected.event.title}</div><div className="earthquake-meta-grid"><div><span>CATEGORY</span><strong>{selected.event.categoryLabel}</strong></div><div><span>DATE</span><strong>{formatUtc(selected.event.date)}</strong></div><div><span>STATUS</span><strong>{selected.event.closed ? "CLOSED" : "OPEN"}</strong></div><div><span>MAGNITUDE</span><strong>{selected.event.magnitude.value !== null ? `${selected.event.magnitude.value} ${selected.event.magnitude.unit ?? ""}`.trim() : "—"}</strong></div></div>
        {selected.event.description && <p className="natural-event-description">{selected.event.description}</p>}<a className="earthquake-source" href={selected.event.sourceUrl} target="_blank" rel="noreferrer">OPEN EONET EVENT <span>↗</span></a>
      </aside>}

      <button className={`hub-trigger ${open ? "is-open" : ""}`} onClick={() => setOpen((value) => !value)} aria-expanded={open}><span className="hub-trigger-mark"><i /><i /><i /></span><span>CONTROL HUB</span></button>
      <aside className={`control-hub ${open ? "is-visible" : ""}`} aria-hidden={!open}>
        <div className="hub-header"><div><span className="hub-eyebrow">NAYAN / SYSTEM</span><h2>Control Hub</h2></div><button className="hub-close" onClick={() => setOpen(false)} aria-label="Close control hub">×</button></div>
        <section className="hub-section"><div className="section-label"><span>LAYERS</span><span>05</span></div><div className="layer-list">
          {layers.map((layer) => { const active = activeLayers.includes(layer.id); return <button key={layer.id} className={`layer-row ${active ? "is-active" : ""}`} onClick={() => toggleLayer(layer.id)}><span className="layer-icon" aria-hidden="true">{layer.icon}</span><span className="layer-copy"><strong>{layer.label}</strong><small>{layer.detail}</small></span><span className="layer-status">{layer.status === "live" ? "LIVE" : "DEMO"}</span></button>; })}
        </div></section>
        <section className="hub-section hub-section--compact"><div className="section-label"><span>MAP</span><span>02</span></div><div className="segmented-control">{["Satellite", "Terrain"].map((mode) => <button key={mode} className={mapMode === mode ? "is-selected" : ""} onClick={() => { setMapMode(mode); setNotice(`${mode} mode selected — demo control for now.`); }}>{mode}</button>)}</div></section>
        <section className="hub-section hub-section--compact"><div className="section-label"><span>VIEW</span><span>01</span></div><button className="reset-view" onClick={resetIndia}><span>Reset to India</span><span>↗</span></button></section>
        {earthquakeCount !== null && activeLayers.includes("earthquakes") && <div className="hub-live-summary"><span>INDIA REGION / EARTHQUAKES</span><strong>{earthquakeCount} EVENTS LOADED</strong></div>}
        {naturalEventCount !== null && activeLayers.includes("events") && <div className="hub-live-summary"><span>INDIA REGION / NATURAL EVENTS</span><strong>{naturalEventCount} EVENTS LOADED</strong></div>}
        <div className="hub-footer"><span>DATA SYSTEM</span><span>FOUNDATION / 01</span></div>
      </aside>
      {notice && <button className="hub-notice" onClick={() => setNotice("")}><span className="notice-dot" />{notice}<b>×</b></button>}
    </main>
  );
}
