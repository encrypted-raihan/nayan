"use client";

import { useState } from "react";
import NayanGlobe from "../../components/nayan-globe";

type Layer = {
  id: string;
  label: string;
  detail: string;
  live: boolean;
};

const layers: Layer[] = [
  { id: "earthquakes", label: "Earthquakes", detail: "SEISMIC ACTIVITY", live: true },
  { id: "events", label: "Natural Events", detail: "GLOBAL EVENTS", live: false },
  { id: "satellites", label: "Satellites", detail: "ORBITAL OBJECTS", live: false },
  { id: "aircraft", label: "Aircraft", detail: "LIVE FLIGHT TRAFFIC", live: false },
  { id: "ships", label: "Ships", detail: "MARITIME TRAFFIC", live: false },
];

export default function ExplorePage() {
  const [open, setOpen] = useState(false);
  const [activeLayers, setActiveLayers] = useState<string[]>([]);
  const [mapMode, setMapMode] = useState("Satellite");
  const [notice, setNotice] = useState("");

  const toggleLayer = (id: string, live: boolean) => {
    const enabled = !activeLayers.includes(id);
    setActiveLayers((current) =>
      enabled ? [...current, id] : current.filter((item) => item !== id),
    );

    window.dispatchEvent(
      new CustomEvent("nayan:layer-toggle", { detail: { id, enabled } }),
    );

    if (!live) {
      setNotice("Demo control — this layer will become live when its data provider is connected.");
    } else {
      setNotice(enabled ? "Earthquake layer loading…" : "Earthquake layer hidden");
    }
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
        <span>01</span><span className="corner-line" /><span>EXPLORE</span>
      </div>
      <div className="explore-corner explore-corner--right">
        <span>GLOBAL VIEW</span><span className="corner-line" /><span>3D</span>
      </div>

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
          <div className="section-label"><span>LAYERS</span><span>05</span></div>
          <div className="layer-list">
            {layers.map((layer) => {
              const active = activeLayers.includes(layer.id);
              return (
                <button
                  key={layer.id}
                  className={`layer-row ${active ? "is-active" : ""}`}
                  onClick={() => toggleLayer(layer.id, layer.live)}
                >
                  <span className="layer-state"><i /></span>
                  <span className="layer-copy">
                    <strong>{layer.label}</strong>
                    <small>{layer.detail}</small>
                  </span>
                  <span className="layer-status">{layer.live ? "LIVE" : "DEMO"}</span>
                </button>
              );
            })}
          </div>
        </section>

        <section className="hub-section hub-section--compact">
          <div className="section-label"><span>MAP</span><span>02</span></div>
          <div className="segmented-control">
            {["Satellite", "Terrain"].map((mode) => (
              <button key={mode} className={mapMode === mode ? "is-selected" : ""} onClick={() => {
                setMapMode(mode);
                setNotice(`${mode} mode selected — demo control for now.`);
              }}>{mode}</button>
            ))}
          </div>
        </section>

        <section className="hub-section hub-section--compact">
          <div className="section-label"><span>VIEW</span><span>01</span></div>
          <button className="reset-view" onClick={resetIndia}>
            <span>Reset to India</span><span>↗</span>
          </button>
        </section>

        <div className="hub-footer">
          <span>DATA SYSTEM</span><span>FOUNDATION / 01</span>
        </div>
      </aside>

      {notice && (
        <button className="hub-notice" onClick={() => setNotice("")}>
          <span className="notice-dot" />{notice}<b>×</b>
        </button>
      )}
    </main>
  );
}
