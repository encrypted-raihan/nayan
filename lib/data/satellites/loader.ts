import { nayanDataEngine } from "../engine";
import { celestrakActiveSatelliteProvider } from "./provider";
import type { NayanSatelliteRecord } from "./provider";

export async function fetchActiveSatellites(signal?: AbortSignal): Promise<NayanSatelliteRecord[]> {
  const result = await nayanDataEngine.get(celestrakActiveSatelliteProvider, {
    cacheTtlMs: 2 * 60 * 60 * 1000,
    signal,
  });
  return result.data;
}
