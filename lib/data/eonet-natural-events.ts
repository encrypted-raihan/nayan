import { nayanDataEngine } from "./engine";
import { eonetNaturalEventsProvider } from "./providers/eonet-natural-events";
export type { NayanNaturalEvent, NaturalEventCategory } from "./types";

export async function fetchIndiaNaturalEvents(signal?: AbortSignal) {
  const result = await nayanDataEngine.get(eonetNaturalEventsProvider, {
    cacheTtlMs: 60_000,
    signal,
  });
  return result.data;
}
