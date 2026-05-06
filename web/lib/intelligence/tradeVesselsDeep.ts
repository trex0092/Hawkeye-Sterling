// Hawkeye Sterling — trade & vessels deep checks (Layers 211-218).

export interface PortCall { port: string; iso2: string; arrivalAt: string; departureAt?: string }
export interface VesselTrack {
  imo?: string; mmsi?: string; flag?: string;
  positions: Array<{ at: string; lat: number; lon: number; speedKnots?: number }>;
  portCalls?: PortCall[];
}

// 211. AIS spoofing — impossible-speed test (>40 knots = spoof)
export function aisImpossibleSpeed(t: VesselTrack): { spoofed: boolean; rationale: string } {
  const ps = t.positions;
  for (let i = 1; i < ps.length; i += 1) {
    const dt = (Date.parse(ps[i]!.at) - Date.parse(ps[i - 1]!.at)) / 3_600_000; // hours
    if (dt <= 0) continue;
    const dlat = ps[i]!.lat - ps[i - 1]!.lat; const dlon = ps[i]!.lon - ps[i - 1]!.lon;
    const km = Math.sqrt(dlat * dlat + dlon * dlon) * 111;
    const knots = (km / 1.852) / dt;
    if (knots > 40) return { spoofed: true, rationale: `Impossible speed ${knots.toFixed(0)} knots between fixes — AIS spoof.` };
  }
  return { spoofed: false, rationale: "speeds plausible" };
}
// 212. Dark-fleet IMO tracking (registry lookup stub)
export function darkFleetImo(imo: string | undefined, registry: Set<string>): boolean { return Boolean(imo) && registry.has(imo!); }
// 213. STS-transfer pair detection (two vessels co-located + low-speed for >1h)
export function stsPairDetect(a: VesselTrack, b: VesselTrack, distanceKmThreshold = 1): { detected: boolean; rationale: string } {
  for (const pa of a.positions) {
    const pb = b.positions.find((p) => Math.abs(Date.parse(p.at) - Date.parse(pa.at)) < 3600000);
    if (!pb) continue;
    const dlat = pa.lat - pb.lat; const dlon = pa.lon - pb.lon;
    const km = Math.sqrt(dlat * dlat + dlon * dlon) * 111;
    if (km < distanceKmThreshold && (pa.speedKnots ?? 0) < 2 && (pb.speedKnots ?? 0) < 2) {
      return { detected: true, rationale: `Vessels within ${km.toFixed(2)}km at ${pa.at} both at <2 knots — possible STS transfer.` };
    }
  }
  return { detected: false, rationale: "No co-location detected." };
}
// 214. Port-call sequence anomaly (skipping declared route)
export function portCallSequence(t: VesselTrack, expectedRoute: string[]): { followed: boolean; rationale: string } {
  const visited = (t.portCalls ?? []).map((c) => c.port);
  const followed = expectedRoute.every((p) => visited.includes(p));
  return { followed, rationale: followed ? "Route followed." : `Missing port calls: ${expectedRoute.filter((p) => !visited.includes(p)).join(", ")}.` };
}
// 215. Cargo-manifest discrepancy
export function manifestDiscrepancy(declared: { hsCode: string; weightKg: number }, actual: { hsCode: string; weightKg: number }): string[] {
  const out: string[] = [];
  if (declared.hsCode !== actual.hsCode) out.push(`HS code declared ${declared.hsCode} vs actual ${actual.hsCode}`);
  if (Math.abs(declared.weightKg - actual.weightKg) / declared.weightKg > 0.1) out.push(`Weight mismatch >10%`);
  return out;
}
// 216. Container-number checksum (ISO 6346)
export function containerChecksum(num: string): boolean {
  if (!/^[A-Z]{4}\d{7}$/.test(num)) return false;
  const map: Record<string, number> = { A: 10, B: 12, C: 13, D: 14, E: 15, F: 16, G: 17, H: 18, I: 19, J: 20, K: 21, L: 23, M: 24, N: 25, O: 26, P: 27, Q: 28, R: 29, S: 30, T: 31, U: 32, V: 34, W: 35, X: 36, Y: 37, Z: 38 };
  let total = 0;
  for (let i = 0; i < 10; i += 1) {
    const ch = num[i]!;
    const v = i < 4 ? map[ch]! : Number(ch);
    total += v * 2 ** i;
  }
  return total % 11 % 10 === Number(num[10]);
}
// 217. Bill-of-lading consignor verify (consignor exists in counterparty registry)
export function blConsignorVerify(consignor: string, registry: Set<string>): boolean { return registry.has(consignor.toLowerCase().trim()); }
// 218. ETA-vs-distance check (declared ETA achievable at max-speed)
export function etaFeasibility(currentLat: number, currentLon: number, destLat: number, destLon: number, etaIso: string, maxKnots = 25): boolean {
  const km = Math.sqrt((destLat - currentLat) ** 2 + (destLon - currentLon) ** 2) * 111;
  const hoursAvailable = (Date.parse(etaIso) - Date.now()) / 3_600_000;
  const knotsRequired = (km / 1.852) / Math.max(0.1, hoursAvailable);
  return knotsRequired <= maxKnots;
}
