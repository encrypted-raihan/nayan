import { satnogsActiveSatelliteProvider } from "./satellites";
import { eonetNaturalEventsProvider } from "./providers/eonet-natural-events";
import { usgsEarthquakeProvider } from "./providers/providers/usgs-earthquakes";

export const nayanProviders = {
  earthquakes: usgsEarthquakeProvider,
  "natural-events": eonetNaturalEventsProvider,
  satellites: satnogsActiveSatelliteProvider,
} as const;

export type NayanProviderKey = keyof typeof nayanProviders;
