type TrafficRuntime = {
  row: HTMLButtonElement | null;
  status: HTMLElement | null;
};

declare global {
  interface Window {
    __NAYAN_TRAFFIC_RUNTIME__?: TrafficRuntime;
  }
}

function runtime(): TrafficRuntime {
  return (window.__NAYAN_TRAFFIC_RUNTIME__ ??= {
    row: null,
    status: null,
  });
}

function ensureTrafficRow() {
  const state = runtime();
  if (state.row?.isConnected) return;

  const list = document.querySelector<HTMLElement>(".layer-list");
  if (!list) return;

  const row = document.createElement("button");
  row.type = "button";
  row.className = "layer-row";
  row.setAttribute("aria-disabled", "true");
  row.title = "Traffic provider is being evaluated for NAYAN.";
  row.innerHTML = `
    <span class="layer-icon">🚦</span>
    <span class="layer-copy">
      <strong>Traffic</strong>
      <small>PROVIDER BEING EVALUATED</small>
    </span>
    <span class="layer-status">HOLD</span>
  `;

  list.appendChild(row);
  state.row = row;
  state.status = row.querySelector<HTMLElement>(".layer-status");
}

function install() {
  if (typeof window === "undefined") return;

  runtime();
  ensureTrafficRow();

  const observer = new MutationObserver(() => ensureTrafficRow());
  observer.observe(document.body, { childList: true, subtree: true });
  window.setTimeout(() => observer.disconnect(), 15_000);
}

if (typeof window !== "undefined") install();

export function showTraffic() {
  ensureTrafficRow();
}

export function clearTraffic() {
  // Intentionally held until a provider with acceptable coverage,
  // licensing, and access requirements is verified.
}
