"use client";

import { useEffect, useState } from "react";
import NayanGlobe from "../../components/nayan-globe";
import type { NayanEarthquake } from "../../lib/data/usgs-earthquakes";

type DemoLayer = {
  id: string;
  label: string;
  detail: string;
  status: "demo" | "live";
};

const layers: DemoLayer[] = [
  { id: "earthquakes", label: "Earthquakes", detail: "INDIA + SURROUNDING REGION", status: "live" },
  { id: "events", label: "Natural Events", detail: "GLOBAL EVENTS", status: "demo" },
  { id: "satellites", label: "Satellites", detail: "ORBITAL OBJECTS", status: "demo" },
  { id: "aircraft", label: "Aircraft", detail: "LIVE FLIGHT TRAFFIC", status: "demo" },
  { id: "ships", label: "Ships", detail: "MARITIME TRAFFIC", status: "demo" },
];

function formatEarthquakeTime(timestamp: number) {
  return new Intl.DateTimeFormat("en-IN", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "UTC",
  }).format(new Date(timestamp)) + " UTC";
}

export default function ExplorePage() {
  const [open, setOpen] = useState(false);
  const [activeLayers, setActiveLayers] = useState<string[]>([]);
  const [mapMode, setMapMode] = useState("Satellite");
  const [notice, setNotice] = useState("");
  const [selectedEarthquake, setSelectedEarthquake] = useState<NayanEarthquake | null>(null);
  const [earthquakeCount, setEarthquakeCount] = useState<number | null>(null);

  useEffect(() => {
    const onSelected = (event: Event) => {
      setSelectedEarthquake((event as CustomEvent<NayanEarthquake>).detail);
    };

    const onDeselected = () => setSelectedEarthquake(null);
    const onLoaded = (event: Event) => {
      setEarthquakeCount((event as CustomEvent<{ count: number }>).detail.count);
      setNotice("Earthquake layer updated");
    };
    const onCleared = () => setSelectedEarthquake(null);
    const onError = (event: Event) => {
      setNotice((event as CustomEvent<{ message: string }>).detail.message);
    };

    window.addEventListener("nayan:earthquake-selected", onSelected);
    window.addEventListener("nayan:earthquake-deselected", onDeselected);
    window.addEventListener("nayan:earthquakes-loaded", onLoaded);
    window.addEventListener("nayan:earthquakes-cleared", onCleared);
    window.addEventListener("nayan:earthquakes-error", onError);

    return () => {
      window.removeEventListener("nayan:earthquake-selected", onSelected);
      window.removeEventListener("nayan:earthquake-deselected", onDeselected);
      window.removeEventListener("nayan:earthquakes-loaded", onLoaded);
      window.removeEventListener("nayan:earthquakes-cleared", onCleared);
      window.removeEventListener("nayan:earthquakes-error", onError);
    };
  }, []);

  const toggleLayer = (id: string) => {
    if (id !== "earthquakes") {
      setNotice("Demo control — this layer will become live when its data provider is connected.");
      return;
    }

    const enabling = !activeLayers.includes(id);
    setActiveLayers((current) =>
      enabling ? [...current, id] : current.filter((item) => item !== id),
    );
    setSelectedEarthquake(null);
    window.dispatchEvent(new CustomEvent("nayan:earthquakes-toggle", { detail: enabling }));
  };

  const resetIndia = () => {
    window.dispatchEvent(new CustomEvent("nayan:reset-india"));
    setNotice("India view reset");
  };

  return (
    <main className="explore-page">
      <NayanGlobe />

      <header className="explore-header">
        <div className="explore-brand">NAYAN</div>
        <div className="explore-context">
          <span className="live-dot" />
          <span>INDIA · FROM ABOVE</span>
        </div>
      </header>

      <div className="explore-corner explore-corner--left">
        <span>01</span>
        <span className="corner-line" />
        <span>EXPLORE</span>
      </div>

      <div className="explore-corner explore-corner--right">
        <span>INDIA REGION</span>
        <span className="corner-line" />
        <span>3D</span>
      </div>

      {selectedEarthquake && (
        <aside className="earthquake-detail">
          <div className="earthquake-detail-top">
            <div>
              <span className="hub-eyebrow">NAYAN / EARTHQUAKE</span>
              <div className="earthquake-magnitude">
                M{selectedEarthquake.magnitude.toFixed(1)}
              </div>
            </div>
            <button
              className="earthquake-detail-close"
              onClick={() => setSelectedEarthquake(null)}
              aria-label="Close earthquake details"
            >
              ×
            </button>
          </div>
          <div className="earthquake-place">{selectedEarthquake.place}</div>
          <div className="earthquake-meta-grid">
            <div><span>DEPTH</span><strong>{selectedEarthquake.depthKm.toFixed(1)} KM</strong></div>
            <div><span>TIME</span><strong>{formatEarthquakeTime(selectedEarthquake.time)}</strong></div>
            <div><span>MAG TYPE</span><strong>{selectedEarthquake.magType ?? "—"}</strong></div>
            <div><span>TSUNAMI</span><strong>{selectedEarthquake.tsunami ? "YES" : "NO"}</strong></div>
          </div>
          <a
            className="earthquake-source"
            href={selectedEarthquake.url}
            target="_blank"
            rel="noreferrer"
          >
            OPEN USGS EVENT <span>↗</span>
          </a>
        </aside>
      )}

      <button
        className={`hub-trigger ${open ? "is-open" : ""}`}
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
      >
        <span className="hub-trigger-mark"><i /><i /><i /></span>
        <span>CONTROL HUB</span>
      </button>

      <aside className={`control-hub ${open ? "is-visible" : ""}`} aria-hidden={!open}>
        <div className="hub-header">
          <div>
            <span className="hub-eyebrow">NAYAN / SYSTEM</span>
            <h2>Control Hub</h2>
          </div>
          <button className="hub-close" onClick={() => setOpen(false)} aria-label="Close control hub">×</button>
        </div>

        <section className="hub-section">
          <div className="section-label">
            <span>LAYERS</span>
            <span>05</span>
          </div>

          <div className="layer-list">
            {layers.map((layer) => {
              const active = activeLayers.includes(layer.id);
              return (
                <button
                  key={layer.id}
                  className={`layer-row ${active ? "is-active" : ""}`}
                  onClick={() => toggleLayer(layer.id)}
                >
                  <span className="layer-state"><i /></span>
                  <span className="layer-copy">
                    <strong>{layer.label}</strong>
                    <small>{layer.detail}</small>
                  </span>
                  <span className="layer-status">
                    {layer.status === "live" ? "LIVE" : "DEMO"}
                  </span>
                </button>
              );
            })}
          </div>
        </section>

        <section className="hub-section hub-section--compact">
          <div className="section-label"><span>MAP</span><span>02</span></div>
          <div className="segmented-control">
            {["Satellite", "Terrain"].map((mode) => (
              <button
                key={mode}
                className={mapMode === mode ? "is-selected" : ""}
                onClick={() => {
                  setMapMode(mode);
                  setNotice(`${mode} mode selected — demo control for now.`);
                }}
              >
                {mode}
              </button>
            ))}
          </div>
        </section>

        <section className="hub-section hub-section--compact">
          <div className="section-label"><span>VIEW</span><span>01</span></div>
          <button className="reset-view" onClick={resetIndia}>
            <span>Reset to India</span>
            <span>↗</span>
          </button>
        </section>

        {earthquakeCount !== null && activeLayers.includes("earthquakes") && (
          <div className="hub-live-summary">
            <span>INDIA REGION</span>
            <strong>{earthquakeCount} EVENTS LOADED</strong>
          </div>
        )}

        <div className="hub-footer">
          <span>DATA SYSTEM</span>
          <span>FOUNDATION / 01</span>
        </div>
      </aside>

      {notice && (
        <button className="hub-notice" onClick={() => setNotice("")}>
          <span className="notice-dot" />
          {notice}
          <b>×</b>
        </button>
      )}
    </main>
  );
}
