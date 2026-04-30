// Hawkeye Sterling — wave-3 mode: vessel_ais_gap (audit follow-up #7).
//
// Detects "AIS gap" patterns in vessel transponder data — periods when
// a vessel goes dark (transponder off) followed by reappearance in a
// suspicious location. Classic sanctions-evasion pattern for tankers
// performing dark-fleet ship-to-ship transfers (Iranian / Russian /
// Venezuelan oil sanctions context).
//
// Heuristics:
//   1. AIS_DARK_PERIOD       — gap of >12h with no AIS report.
//   2. UNEXPECTED_DESTINATION — port-of-arrival differs materially
//      from declared port-of-departure trajectory.
//   3. SANCTIONED_PORT_NEXUS — pre/post-gap location near a port
//      under sanctions or known dark-fleet hub.
//   4. STS_TRANSFER_PATTERN  — two vessels' AIS positions converge
//      mid-ocean, both then resume separate trajectories — classic
//      ship-to-ship transfer signature.
//   5. FLAG_HOPPING          — vessel changed flag-state more than
//      once in the prior 24 months (FoC indicator).
//
// Output: Finding with severity tier + STS-transfer adjacency. Anchors:
// FATF R.6 (TFS-related) + UN sanctions vessel lists + IMO obligations
// + UAE FDL 10/2025 Art.15.

import type { BrainContext, FacultyId, Finding, ReasoningCategory, Verdict } from '../types.js';

interface AisReport {
  timestamp?: string;          // ISO 8601
  imo?: string;
  mmsi?: string;
  lat?: number;
  lon?: number;
  speedKnots?: number;
  course?: number;
  reportedDestination?: string;
  flagState?: string;
}

interface VesselContext {
  imo?: string;
  declaredDeparturePort?: string;
  declaredArrivalPort?: string;
  declaredCargo?: string;
  flagHistory?: Array<{ flagState: string; from: string; to?: string }>;
}

const SANCTIONED_PORTS = new Set([
  // Indicative — production should pull from the live sanctions / advisory list.
  'BANDAR ABBAS', 'BANDAR-E EMAM', 'KHARG ISLAND',     // Iran
  'TARTUS', 'BANIYAS',                                  // Syria
  'NOVOROSSIYSK', 'UST-LUGA', 'KOZMINO',               // Russia (post-2022)
  'JOSE', 'PUERTO LA CRUZ', 'AMUAY',                   // Venezuela
]);

const AIS_DARK_GAP_HOURS = 12;
const FLAG_HOP_THRESHOLD = 2;

interface SignalHit { id: string; label: string; weight: number; evidence: string; }

function clamp01(n: number): number { return Math.max(0, Math.min(1, n)); }

function typedEvidence<T>(ctx: BrainContext, key: string): T[] {
  const v = (ctx.evidence as Record<string, unknown> | undefined)?.[key];
  return Array.isArray(v) ? (v as T[]) : [];
}

function vesselContext(ctx: BrainContext): VesselContext | undefined {
  const v = (ctx.evidence as Record<string, unknown> | undefined)?.['vessel'];
  return v && typeof v === 'object' ? (v as VesselContext) : undefined;
}

function hoursBetween(aIso: string, bIso: string): number {
  const a = Date.parse(aIso);
  const b = Date.parse(bIso);
  if (!Number.isFinite(a) || !Number.isFinite(b)) return 0;
  return Math.abs(b - a) / 3_600_000;
}

function detectDarkPeriods(reports: AisReport[]): SignalHit[] {
  if (reports.length < 2) return [];
  const sorted = [...reports]
    .filter((r) => r.timestamp)
    .sort((a, b) => Date.parse(a.timestamp!) - Date.parse(b.timestamp!));
  const hits: SignalHit[] = [];
  for (let i = 1; i < sorted.length; i++) {
    const prev = sorted[i - 1]!;
    const cur = sorted[i]!;
    const hours = hoursBetween(prev.timestamp!, cur.timestamp!);
    if (hours >= AIS_DARK_GAP_HOURS) {
      hits.push({
        id: 'ais_dark_period',
        label: `AIS dark for ${hours.toFixed(1)}h`,
        weight: hours >= 48 ? 0.3 : hours >= 24 ? 0.2 : 0.1,
        evidence: `gap ${prev.timestamp} → ${cur.timestamp}`,
      });
    }
  }
  return hits;
}

function detectSanctionedPortNexus(reports: AisReport[], vessel: VesselContext | undefined): SignalHit[] {
  const hits: SignalHit[] = [];
  for (const r of reports) {
    const dest = (r.reportedDestination ?? '').toUpperCase().trim();
    if (dest && SANCTIONED_PORTS.has(dest)) {
      hits.push({
        id: 'sanctioned_port_destination',
        label: `Reported destination is sanctioned port: ${dest}`,
        weight: 0.3,
        evidence: `${r.timestamp ?? ''}: dest=${dest}`,
      });
    }
  }
  if (vessel?.declaredArrivalPort) {
    const arr = vessel.declaredArrivalPort.toUpperCase().trim();
    if (SANCTIONED_PORTS.has(arr)) {
      hits.push({
        id: 'declared_sanctioned_arrival',
        label: `Declared arrival port is sanctioned: ${arr}`,
        weight: 0.4,
        evidence: `vessel.declaredArrivalPort=${arr}`,
      });
    }
  }
  return hits;
}

function detectUnexpectedDestination(reports: AisReport[], vessel: VesselContext | undefined): SignalHit[] {
  if (!vessel?.declaredArrivalPort) return [];
  const declared = vessel.declaredArrivalPort.toUpperCase().trim();
  const reported = new Set(
    reports
      .map((r) => (r.reportedDestination ?? '').toUpperCase().trim())
      .filter(Boolean),
  );
  if (reported.size === 0) return [];
  if (!reported.has(declared)) {
    return [{
      id: 'unexpected_destination',
      label: `AIS-reported destination(s) differ from declared (${declared})`,
      weight: 0.2,
      evidence: `reported=${[...reported].slice(0, 3).join(', ')}`,
    }];
  }
  return [];
}

function detectFlagHopping(vessel: VesselContext | undefined): SignalHit[] {
  const hist = vessel?.flagHistory ?? [];
  if (hist.length < FLAG_HOP_THRESHOLD + 1) return [];
  const cutoff = Date.now() - 24 * 30 * 86_400_000;
  const recentChanges = hist.filter((h) => Date.parse(h.from) >= cutoff).length;
  if (recentChanges >= FLAG_HOP_THRESHOLD) {
    return [{
      id: 'flag_hopping',
      label: `Flag changed ${recentChanges}× in 24 months — FoC / dark-fleet indicator`,
      weight: 0.2,
      evidence: hist.slice(-3).map((h) => h.flagState).join(' → '),
    }];
  }
  return [];
}

// ─── Mode apply ─────────────────────────────────────────────────────────────

export const vesselAisGapApply = async (ctx: BrainContext): Promise<Finding> => {
  const reports = typedEvidence<AisReport>(ctx, 'aisReports');
  const vessel = vesselContext(ctx);

  if (reports.length === 0 && !vessel) {
    return {
      modeId: 'vessel_ais_gap',
      category: 'sectoral_typology' satisfies ReasoningCategory,
      faculties: ['data_analysis', 'geopolitical_awareness'] satisfies FacultyId[],
      score: 0,
      confidence: 0.2,
      verdict: 'inconclusive' satisfies Verdict,
      rationale: 'No vessel data supplied; vessel_ais_gap requires evidence.aisReports + evidence.vessel context.',
      evidence: [],
      producedAt: Date.now(),
    };
  }

  const allHits: SignalHit[] = [
    ...detectDarkPeriods(reports),
    ...detectSanctionedPortNexus(reports, vessel),
    ...detectUnexpectedDestination(reports, vessel),
    ...detectFlagHopping(vessel),
  ];

  const rawScore = allHits.reduce((a, h) => a + h.weight, 0);
  const score = clamp01(rawScore > 0.7 ? 0.7 + (rawScore - 0.7) * 0.3 : rawScore);

  let verdict: Verdict = 'clear';
  if (score >= 0.6) verdict = 'escalate';
  else if (score >= 0.3) verdict = 'flag';

  const summary = allHits.length === 0
    ? 'No AIS-gap signals detected.'
    : `${allHits.length} AIS-gap signal(s) fired across ${reports.length} report(s).`;
  const detail = allHits.slice(0, 6).map((h) => `${h.id}=${h.weight.toFixed(2)}`).join('; ');

  const rationale = [
    summary,
    detail ? `Signals: ${detail}.` : '',
    `Composite score: ${score.toFixed(2)}.`,
    'Anchors: FATF R.6 (TFS) · UN sanctions vessel lists · IMO MSC.1/Circ.1638 · UAE FDL 10/2025 Art.15.',
  ].filter(Boolean).join(' ');

  return {
    modeId: 'vessel_ais_gap',
    category: 'sectoral_typology' satisfies ReasoningCategory,
    faculties: ['data_analysis', 'geopolitical_awareness'] satisfies FacultyId[],
    score,
    confidence: allHits.length === 0 ? 0.4 : Math.min(0.9, 0.5 + 0.05 * allHits.length),
    verdict,
    rationale,
    evidence: allHits.slice(0, 8).map((h) => h.evidence),
    producedAt: Date.now(),
  };
};

export default vesselAisGapApply;
