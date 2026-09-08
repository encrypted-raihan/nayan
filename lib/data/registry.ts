import { celestrakActiveSatelliteProvider } from "./satellites";
import { eonetNaturalEventsProvider } from "./providers/eonet-natural-events";
import { usgsEarthquakeProvider } from "./providers/usgs-earthquakes";

export const nayanProviders = {
  earthquakes: usgsEarthquakeProvider,
  "natural-events": eonetNaturalEventsProvider,
  satellites: celestrakActiveSatelliteProvider,
} as const;

export type NayanProviderKey = keyof typeof nayanProviders;
