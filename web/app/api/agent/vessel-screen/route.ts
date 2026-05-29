// POST /api/agent/vessel-screen
//
// Vessel / aircraft / cargo screening (audit follow-up #47). Composes
// the wave-3 vessel_ais_gap mode with quickScreen against the IMO /
// MMSI / tail-number axis + HS-code high-risk catalogue + UN sanctions
// vessel list. Returns a verdict-shaped response identical to
// /api/super-brain so the existing UI components render it.
//
// Enhanced (v2):
//   • MMSI / IMO format validation (400 on invalid)
//   • Flag-of-convenience (FoC) registry — +15 score
//   • Dark-fleet vessel fingerprint list — +40 score
//   • Sanctioned-port screening — +20 per hit, max +40
//   • AIS gap >24 h scoring — +20
//   • Weighted risk-score composition capped at 100

import { NextResponse } from "next/server";
import { enforce } from "@/lib/server/enforce";
import { vesselAisGapApply } from "../../../../../src/brain/modes/wave3-vessel-ais-gap.js";
import type { BrainContext } from "../../../../../src/brain/types.js";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

// ─── Identifier-format validation ───────────────────────────────────────────

/** MMSI must be exactly 9 decimal digits. */
const MMSI_RE = /^\d{9}$/;
/** IMO must be "IMO" prefix (optional) followed by exactly 7 digits. */
const IMO_RE = /^(?:IMO)?(\d{7})$/i;

function validateIdentifiers(imo?: string, mmsi?: string): string | null {
  if (!imo && !mmsi) return "vessel.imo or vessel.mmsi is required";
  if (mmsi && !MMSI_RE.test(mmsi.trim())) return `invalid MMSI "${mmsi}" — must be exactly 9 digits`;
  if (imo && !IMO_RE.test(imo.trim())) return `invalid IMO "${imo}" — must be 7 digits (optionally prefixed with "IMO")`;
  return null;
}

// ─── Flag-of-convenience registry ────────────────────────────────────────────
// Source: ITF / UNCTAD FoC list + Paris MoU supplementary high-risk flags.

const FOC_FLAGS = new Set([
  "PA",  // Panama
  "LR",  // Liberia
  "MH",  // Marshall Islands
  "BS",  // Bahamas
  "BZ",  // Belize
  "KH",  // Cambodia
  "KM",  // Comoros
  "PW",  // Palau
  "MD",  // Moldova
  "ST",  // São Tomé & Príncipe
  "TV",  // Tuvalu
  "VU",  // Vanuatu
  "SL",  // Sierra Leone
  "MN",  // Mongolia
  "TZ",  // Tanzania
  "CM",  // Cameroon
]);

/** Full country names accepted as alternatives to ISO-2 codes. */
const FOC_NAMES: Record<string, string> = {
  PANAMA: "PA",
  LIBERIA: "LR",
  "MARSHALL ISLANDS": "MH",
  BAHAMAS: "BS",
  BELIZE: "BZ",
  CAMBODIA: "KH",
  COMOROS: "KM",
  PALAU: "PW",
  MOLDOVA: "MD",
  "SAO TOME": "ST",
  "SÃO TOMÉ": "ST",
  TUVALU: "TV",
  VANUATU: "VU",
  "SIERRA LEONE": "SL",
  MONGOLIA: "MN",
  TANZANIA: "TZ",
  CAMEROON: "CM",
};

function isFocFlag(flagState: string | undefined): boolean {
  if (!flagState) return false;
  const upper = flagState.trim().toUpperCase();
  return FOC_FLAGS.has(upper) || upper in FOC_NAMES;
}

// ─── Dark-fleet fingerprints ─────────────────────────────────────────────────
// Known vessels in the sanctioned dark/shadow fleet operating AIS spoofing,
// STS transfers, or documented sanctions evasion (as at 2025-Q1 advisories).
// Matched against IMO or vessel name (case-insensitive contains).

const DARK_FLEET_IMOS = new Set([
  "9175567",  // LANA (ex-Pegas) — Iranian oil / OFAC SDN
  "9256647",  // PABLO — Venezuelan crude evasion
  "9259026",  // WISDOM (shadow tanker network)
  "9231027",  // EVENTIN — Russian crude, EU listed
  "9289526",  // TURBA — Russian dark tanker
  "9192629",  // CAPTAIN MORPHEAS — STS Greek waters
  "9318195",  // NAVIGATOR ARIES — OFAC February 2024
  "9221902",  // SOTHYS — Russian oil convoy
  "9207351",  // JAGUAR — Iranian naphtha
  "9235545",  // SUEZ RAJAN — Iranian crude
  "9327577",  // ANDROMEDA — Ukraine war oil evasion
  "9167345",  // SEA PIONEER — NK coal/oil transfers
  "9156497",  // COURAGEOUS ACE — DPRK arms
  "9403571",  // OCEAN TRADER — Venezuelan PDVSA
  "9180270",  // OLYMPIC SPIRIT — Russian LPG
  "9118023",  // GAIA — Iranian condensate
  "9273250",  // SILVER — Russian Urals, Baltic STS
  "9225318",  // CYGNUS — Comoros flag, Russian crude
  "9254449",  // AZOV SEA — dual-use Russian port calls
  "9264965",  // STAR ANITA — Syrian port nexus
]);

const DARK_FLEET_NAME_FRAGMENTS = [
  "shadow", "dark fleet", "suez rajan", "captain morpheas",
  "navigator aries", "ocean trader", "olympic spirit",
];

function isDarkFleet(imo?: string, name?: string): boolean {
  if (imo) {
    const normalised = imo.trim().toUpperCase().replace(/^IMO/i, "");
    if (DARK_FLEET_IMOS.has(normalised)) return true;
  }
  if (name) {
    const lower = name.trim().toLowerCase();
    for (const frag of DARK_FLEET_NAME_FRAGMENTS) {
      if (lower.includes(frag)) return true;
    }
  }
  return false;
}

// ─── Sanctioned / high-risk port list ────────────────────────────────────────
// Ports under primary sanctions or documented as dark-fleet hubs.
// Keys are canonical port names; values are the ISO country code and reason.

interface SanctionedPort {
  country: string;    // ISO 3166-1 alpha-2
  reason: string;
}

const SANCTIONED_PORTS_ENHANCED: Record<string, SanctionedPort> = {
  "BANDAR ABBAS":     { country: "IR", reason: "Iran primary sanctions — OFAC/EU" },
  "BANDAR EMAM":      { country: "IR", reason: "Iran primary sanctions" },
  "ASSALUYEH":        { country: "IR", reason: "Iran — LNG export terminal, sanctions" },
  "KHARG ISLAND":     { country: "IR", reason: "Iran — crude oil terminal, OFAC" },
  "KAVKAZ":           { country: "RU", reason: "Russia — STS hub (post-2022 price cap evasion)" },
  "NOVOROSSIYSK":     { country: "RU", reason: "Russia — Black Sea crude export, EU sanctions" },
  "VLADIVOSTOK":      { country: "RU", reason: "Russia — Far East LNG / dark-fleet hub" },
  "UST-LUGA":         { country: "RU", reason: "Russia — Baltic crude, EU sanctions" },
  "KOZMINO":          { country: "RU", reason: "Russia — Pacific crude, OFAC price-cap evasion" },
  "DALIAN":           { country: "CN", reason: "China — documented Russia-crude transshipment hub" },
  "LATAKIA":          { country: "SY", reason: "Syria — OFAC/EU comprehensive sanctions" },
  "TARTUS":           { country: "SY", reason: "Syria — Russian naval base, OFAC/EU" },
  "BANIYAS":          { country: "SY", reason: "Syria — crude terminal, sanctions" },
  "WONSAN":           { country: "KP", reason: "North Korea — UNSC sanctions" },
  "NAMPO":            { country: "KP", reason: "North Korea — UNSC sanctions, coal exports" },
  "JOSE":             { country: "VE", reason: "Venezuela — PDVSA OFAC" },
  "AMUAY":            { country: "VE", reason: "Venezuela — PDVSA OFAC" },
  "PUERTO LA CRUZ":   { country: "VE", reason: "Venezuela — OFAC SDN" },
  "HAVANA":           { country: "CU", reason: "Cuba — OFAC comprehensive sanctions" },
  "CIENFUEGOS":       { country: "CU", reason: "Cuba — OFAC" },
};

interface SanctionedPortHit {
  port: string;
  country: string;
  reason: string;
  source: "declaredArrival" | "declaredDeparture" | "aisReport";
}

function checkSanctionedPorts(
  vessel: Body["vessel"],
  aisReports: Body["aisReports"],
): SanctionedPortHit[] {
  const hits: SanctionedPortHit[] = [];

  function test(portRaw: string | undefined, source: SanctionedPortHit["source"]): void {
    if (!portRaw) return;
    const key = portRaw.trim().toUpperCase();
    const entry = SANCTIONED_PORTS_ENHANCED[key];
    if (entry) hits.push({ port: portRaw, country: entry.country, reason: entry.reason, source });
  }

  test(vessel.declaredArrivalPort, "declaredArrival");
  test(vessel.declaredDeparturePort, "declaredDeparture");
  for (const r of (aisReports ?? [])) {
    test(r.reportedDestination, "aisReport");
  }
  return hits;
}

// ─── AIS gap detection (>24 h) ───────────────────────────────────────────────

function hasLongAisGap(aisReports: Body["aisReports"]): boolean {
  if (!aisReports || aisReports.length < 2) return false;
  const sorted = [...aisReports]
    .filter((r) => r.timestamp)
    .sort((a, b) => Date.parse(a.timestamp ?? "") - Date.parse(b.timestamp ?? ""));
  for (let i = 1; i < sorted.length; i++) {
    const prev = sorted[i - 1];
    const cur = sorted[i];
    if (!prev?.timestamp || !cur?.timestamp) continue;
    const hours = Math.abs(Date.parse(cur.timestamp) - Date.parse(prev.timestamp)) / 3_600_000;
    if (hours > 24) return true;
  }
  return false;
}

// ─── Request body ─────────────────────────────────────────────────────────────

interface Body {
  vessel: {
    name?: string;
    imo?: string;
    mmsi?: string;
    flagState?: string;
    declaredDeparturePort?: string;
    declaredArrivalPort?: string;
    declaredCargo?: string;
    flagHistory?: Array<{ flagState: string; from: string; to?: string }>;
  };
  aisReports?: Array<{
    timestamp?: string;
    imo?: string;
    mmsi?: string;
    lat?: number;
    lon?: number;
    speedKnots?: number;
    course?: number;
    reportedDestination?: string;
    flagState?: string;
  }>;
  hsCodes?: string[];
}

const HIGH_RISK_HS_PREFIXES = ["27", "84", "85", "88", "89", "93"];

// ─── Risk score composition ──────────────────────────────────────────────────
// Weighted composite: base sanctions (0-100) + FoC (+15) + sanctioned ports
// (+20 each, max +40) + AIS gap >24h (+20) + dark fleet (+40). Capped at 100.

const SCORE_FOC         = 15;
const SCORE_PORT_HIT    = 20;
const SCORE_PORT_MAX    = 40;
const SCORE_AIS_GAP     = 20;
const SCORE_DARK_FLEET  = 40;

interface RiskScoreComponents {
  baseSanctions: number;   // 0-100 from vesselAisGapApply (score × 100)
  foc: number;
  sanctionedPorts: number;
  aisGap: number;
  darkFleet: number;
  total: number;           // capped at 100
}

function composeRiskScore(
  baseScore: number,    // vesselAisGapApply finding.score (0-1)
  focHit: boolean,
  portHits: SanctionedPortHit[],
  aisGapHit: boolean,
  darkFleetHit: boolean,
): RiskScoreComponents {
  const baseSanctions = Math.round(baseScore * 100);
  const foc = focHit ? SCORE_FOC : 0;
  const sanctionedPorts = Math.min(portHits.length * SCORE_PORT_HIT, SCORE_PORT_MAX);
  const aisGap = aisGapHit ? SCORE_AIS_GAP : 0;
  const darkFleet = darkFleetHit ? SCORE_DARK_FLEET : 0;
  const total = Math.min(100, baseSanctions + foc + sanctionedPorts + aisGap + darkFleet);
  return { baseSanctions, foc, sanctionedPorts, aisGap, darkFleet, total };
}

// ─── Handler ──────────────────────────────────────────────────────────────────

async function handlePost(req: Request): Promise<NextResponse> {
  const gate = await enforce(req);
  if (!gate.ok) return gate.response;
  const gateHeaders: Record<string, string> = gate.ok ? gate.headers : {};

  let body: Body;
  try {
    body = (await req.json()) as Body;
  } catch {
    return NextResponse.json({ ok: false, error: "invalid JSON" }, { status: 400, headers: gateHeaders });
  }

  if (!body?.vessel) {
    return NextResponse.json(
      { ok: false, error: "vessel object is required" },
      { status: 400, headers: gateHeaders },
    );
  }

  // ── MMSI / IMO format validation ─────────────────────────────────────────
  // At least one identifier must be present, and must pass format checks.
  // Vessel name alone is accepted only when neither imo nor mmsi is provided
  // by checking the validation function first.
  if (body.vessel.imo || body.vessel.mmsi) {
    const validationError = validateIdentifiers(body.vessel.imo, body.vessel.mmsi);
    if (validationError) {
      return NextResponse.json({ ok: false, error: validationError }, { status: 400, headers: gateHeaders });
    }
  } else if (!body.vessel.name) {
    return NextResponse.json(
      { ok: false, error: "vessel.imo / vessel.mmsi / vessel.name required" },
      { status: 400, headers: gateHeaders },
    );
  }

  // ── Augmented overlay checks ──────────────────────────────────────────────
  const focHit = isFocFlag(body.vessel.flagState);
  const darkFleetHit = isDarkFleet(body.vessel.imo, body.vessel.name);
  const portHits = checkSanctionedPorts(body.vessel, body.aisReports);
  const aisGapHit = hasLongAisGap(body.aisReports);

  // ── Brain context ─────────────────────────────────────────────────────────
  const ctx: BrainContext = {
    run: { id: `vss_${Date.now().toString(36)}`, startedAt: Date.now() },
    subject: {
      name: body.vessel.name ?? body.vessel.imo ?? body.vessel.mmsi ?? "vessel",
      type: "vessel",
      identifiers: {
        ...(body.vessel.imo ? { imo: body.vessel.imo } : {}),
        ...(body.vessel.mmsi ? { mmsi: body.vessel.mmsi } : {}),
      },
    },
    evidence: {
      vessel: body.vessel as never,
      aisReports: Array.isArray(body.aisReports) ? body.aisReports : [],
    },
    priorFindings: [],
    domains: ["sanctions", "tf"],
  };

  let finding: Awaited<ReturnType<typeof vesselAisGapApply>>;
  try {
    finding = await vesselAisGapApply(ctx);
  } catch (err) {
    console.error("[vessel-screen] vesselAisGapApply failed:", err);
    return NextResponse.json(
      { ok: false, error: "Vessel analysis failed — please retry." },
      { status: 500, headers: gateHeaders },
    );
  }

  // ── HS-code dual-use overlay ──────────────────────────────────────────────
  const dualUseFlags: string[] = [];
  for (const code of Array.isArray(body.hsCodes) ? body.hsCodes : []) {
    const prefix = code.slice(0, 2);
    if (HIGH_RISK_HS_PREFIXES.includes(prefix)) {
      dualUseFlags.push(`HS ${code} — dual-use / proliferation-sensitive prefix`);
    }
  }

  // ── Composite risk score ──────────────────────────────────────────────────
  const riskScore = composeRiskScore(finding.score, focHit, portHits, aisGapHit, darkFleetHit);

  // ── Overlay flags for response ────────────────────────────────────────────
  const overlayFlags: string[] = [];
  if (focHit) {
    overlayFlags.push(
      `Flag-of-convenience registry match: ${body.vessel.flagState} (+${SCORE_FOC} risk score)`,
    );
  }
  if (darkFleetHit) {
    overlayFlags.push(
      `Dark-fleet fingerprint match: IMO ${body.vessel.imo ?? "n/a"} / ${body.vessel.name ?? "n/a"} (+${SCORE_DARK_FLEET} risk score)`,
    );
  }
  if (aisGapHit) {
    overlayFlags.push(`AIS gap >24 h detected (+${SCORE_AIS_GAP} risk score)`);
  }
  for (const ph of portHits) {
    overlayFlags.push(
      `Sanctioned-port call [${ph.source}]: ${ph.port} (${ph.country}) — ${ph.reason} (+${SCORE_PORT_HIT} risk score, max contribution +${SCORE_PORT_MAX})`,
    );
  }

  return NextResponse.json(
    {
      ok: true,
      runId: ctx.run.id,
      vessel: body.vessel,
      finding,
      riskScore,
      overlayFlags,
      dualUseFlags,
      sanctionedPortHits: portHits,
      anchors: [
        "FATF R.6 (TFS)",
        "UN Sanctions Vessel Lists",
        "IMO MSC.1/Circ.1638",
        "UAE FDL 10/2025 Art.15",
        "Cabinet Resolution 156/2025 (goods control)",
        "ITF FoC Registry 2024",
        "OFAC March 2024 Shadow Fleet Advisory",
        "EU Sanctions Vessel Alert (2025)",
      ],
    },
    { headers: gateHeaders },
  );
}

export const POST = handlePost;
