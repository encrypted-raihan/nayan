import { nayanDataEngine } from "./engine";
import { usgsEarthquakeProvider } from "./providers/usgs-earthquakes";
export type { NayanEarthquake } from "./types";

export async function fetchIndiaEarthquakes(signal?: AbortSignal) {
  const result = await nayanDataEngine.get(usgsEarthquakeProvider, {
    cacheTtlMs: 60_000,
    signal,
  });
  return result.data;
}
