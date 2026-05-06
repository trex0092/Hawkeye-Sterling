// Hawkeye Sterling — vessel + aircraft screening (Layers #22-23).
//
// Pure-function evaluators over vessel / aircraft metadata supplied by the
// screening route (IMO + MMSI + AIS history for vessels; tail number + ICAO
// 24-bit + operator for aircraft).

export interface VesselRecord {
  imo?: string | null;
  mmsi?: string | null;
  name?: string | null;
  flag?: string | null;       // ISO2
  operator?: string | null;
  /** AIS gaps — periods of >=24h without transmission, with last-known geography. */
  aisGaps?: Array<{ from: string; to: string; lastKnownIso2?: string; corridor?: string }>;
  /** True when IMO appears on dark-fleet / re-flag registries. */
  darkFleet?: boolean;
  /** Recorded ship-to-ship transfers in the last 12 months. */
  stsTransfers?: Array<{ at: string; counterpartyImo?: string; counterpartyName?: string }>;
}

export interface AircraftRecord {
  tailNumber?: string | null;
  icao24?: string | null;
  operator?: string | null;
  flag?: string | null;       // ISO2
  /** Sanctioned operator flag (set by upstream watchlist). */
  operatorSanctioned?: boolean;
  /** Recent flights to / from sanctioned jurisdictions. */
  sanctionedFlights?: Array<{ at: string; from?: string; to?: string }>;
}

const HIGH_RISK_CORRIDORS = new Set([
  "red_sea", "persian_gulf", "black_sea", "south_china_sea",
  "gulf_of_oman", "strait_of_hormuz", "horn_of_africa",
]);

const SANCTIONED_FLAGS = new Set(["IR", "KP", "SY", "RU", "VE", "MM"]);

export interface VesselReport {
  flagged: boolean;
  redFlags: string[];
  rationale: string;
}

export function screenVessel(v: VesselRecord): VesselReport {
  const flags: string[] = [];
  if (v.flag && SANCTIONED_FLAGS.has(v.flag.toUpperCase())) {
    flags.push(`Sanctioned-jurisdiction flag (${v.flag.toUpperCase()})`);
  }
  if (v.darkFleet) {
    flags.push("Dark-fleet / re-flagged IMO listing");
  }
  for (const g of v.aisGaps ?? []) {
    if (g.corridor && HIGH_RISK_CORRIDORS.has(g.corridor)) {
      flags.push(`AIS gap in high-risk corridor (${g.corridor.replace(/_/g, " ")})`);
    }
  }
  if ((v.stsTransfers ?? []).length > 0) {
    flags.push(`${v.stsTransfers!.length} ship-to-ship transfer(s) in last 12 months`);
  }
  return {
    flagged: flags.length > 0,
    redFlags: flags,
    rationale: flags.length === 0
      ? "Vessel screening clean."
      : `Vessel flagged on: ${flags.join("; ")}.`,
  };
}

export function screenAircraft(a: AircraftRecord): VesselReport {
  const flags: string[] = [];
  if (a.flag && SANCTIONED_FLAGS.has(a.flag.toUpperCase())) {
    flags.push(`Sanctioned-jurisdiction flag (${a.flag.toUpperCase()})`);
  }
  if (a.operatorSanctioned) {
    flags.push(`Sanctioned operator (${a.operator ?? "unknown"})`);
  }
  if ((a.sanctionedFlights ?? []).length > 0) {
    flags.push(`${a.sanctionedFlights!.length} flight(s) to/from sanctioned jurisdictions`);
  }
  return {
    flagged: flags.length > 0,
    redFlags: flags,
    rationale: flags.length === 0
      ? "Aircraft screening clean."
      : `Aircraft flagged on: ${flags.join("; ")}.`,
  };
}
