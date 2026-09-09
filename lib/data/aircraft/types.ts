export type AircraftCategory =
  | "airliner"
  | "heavy"
  | "general-aviation"
  | "rotorcraft"
  | "light"
  | "special"
  | "military"
  | "unknown";

export type NayanAircraft = {
  id: string;
  icao24: string;
  callsign: string | null;
  registration: string | null;
  aircraftType: string | null;
  category: AircraftCategory;
  rawCategory: string | null;
  latitude: number;
  longitude: number;
  altitudeMeters: number | null;
  groundSpeedMetersPerSecond: number | null;
  headingDeg: number | null;
  verticalRateMetersPerSecond: number | null;
  onGround: boolean;
  lastSeen: number;
  source: string;
  squawk: string | null;
};
