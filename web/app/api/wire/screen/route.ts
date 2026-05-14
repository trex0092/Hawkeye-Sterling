// POST /api/wire/screen — FATF R.16 SWIFT MT103 wire-transfer screening.
//
// UAE FDL 10/2025 and FATF Recommendation 16 require originator + beneficiary
// + intermediary information on every cross-border wire and that the
// reporting entity screen all parties against sanctions / PEP / adverse-
// media lists at submission time. A MT103 parser exists at
// web/lib/server/mt103.ts but no route consumed it — every wire transfer
// went through the system unscreened against MT103 metadata. This route
// closes the gap.
//
// Body (one of):
//   { mt103Text: string }     — raw MT103 SWIFT message
//   { mt103: Mt103 }          — already-parsed object (for tests / programmatic callers)
//
// Response:
//   { ok, reference, valueDate, currency, amount,
//     ordering: { ...party screening result },
//     beneficiary: { ...party screening result },
//     circularFlow: boolean,
//     fatfR16Compliant: boolean,
//     riskTier: 'clear'|'elevated'|'high'|'blocked',
//     reasonCodes: string[] }

import { NextResponse } from "next/server";
import { enforce } from "@/lib/server/enforce";
import { parseMt103, type Mt103 } from "@/lib/server/mt103";
import { loadCandidates } from "@/lib/server/candidates-loader";
import { quickScreen } from "../../../../../dist/src/brain/quick-screen.js";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

interface WireScreenBody {
  mt103Text?: string;
  mt103?: Mt103;
}

interface PartyResult {
  name?: string;
  account?: string;
  hits: Array<{ listId: string; reference?: string; program?: string; score: number }>;
  riskTier: "clear" | "elevated" | "high" | "blocked";
}

function partyToScreen(
  party: { name?: string; account?: string },
  candidates: unknown[],
): PartyResult {
  if (!party.name) {
    return { hits: [], riskTier: "clear", ...(party.account ? { account: party.account } : {}) };
  }
  // quickScreen returns { hits: Array<{ listId, listRef, name, score, ... }> }
  // — see web/lib/api/quickScreen.types.ts for shape.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const screened = (quickScreen as any)({ name: party.name }, candidates, { maxHits: 12 });
  const rawHits = Array.isArray(screened?.hits) ? screened.hits : [];
  interface NormalizedHit { listId: string; reference?: string; program?: string; score: number }
  const hits: NormalizedHit[] = rawHits.map((h: Record<string, unknown>) => ({
    listId: String(h["listId"] ?? "unknown"),
    ...(typeof h["listRef"] === "string" ? { reference: h["listRef"] as string } : {}),
    ...(Array.isArray(h["programs"]) && h["programs"].length > 0 ? { program: String(h["programs"][0]) } : {}),
    score: typeof h["score"] === "number" ? (h["score"] as number) : 0,
  }));
  // Risk tier from top hit + list type.
  const topHits = hits.filter((h: NormalizedHit) => h.score >= 80);
  const blockingLists = ["ofac_sdn", "un_consolidated", "lseg_ofac_sdn", "lseg_un_consolidated", "uae_eocn", "lseg_uae_eocn"];
  const isBlocked = topHits.some((h: NormalizedHit) => blockingLists.includes(h.listId));
  const riskTier: PartyResult["riskTier"] =
    isBlocked ? "blocked"
      : topHits.length > 0 ? "high"
      : hits.some((h: NormalizedHit) => h.score >= 60) ? "elevated"
      : "clear";
  return {
    name: party.name,
    ...(party.account ? { account: party.account } : {}),
    hits,
    riskTier,
  };
}

function detectCircularFlow(mt103: Mt103): boolean {
  // Same account or near-identical name on both sides is a structuring /
  // layering signal under FATF Recommendation 16 commentary.
  const a = (mt103.ordering?.account ?? "").trim();
  const b = (mt103.beneficiary?.account ?? "").trim();
  if (a && b && a === b) return true;
  const an = (mt103.ordering?.name ?? "").trim().toLowerCase();
  const bn = (mt103.beneficiary?.name ?? "").trim().toLowerCase();
  if (an && bn && (an === bn || an.includes(bn) || bn.includes(an))) return true;
  return false;
}

export async function POST(req: Request): Promise<NextResponse> {
  const gate = await enforce(req);
  if (!gate.ok) return gate.response;

  let body: WireScreenBody;
  try {
    body = (await req.json()) as WireScreenBody;
  } catch {
    return NextResponse.json({ ok: false, error: "invalid JSON body" }, { status: 400, headers: gate.headers });
  }

  let mt103: Mt103;
  if (body.mt103) {
    mt103 = body.mt103;
  } else if (typeof body.mt103Text === "string" && body.mt103Text.trim().length > 0) {
    mt103 = parseMt103(body.mt103Text);
  } else {
    return NextResponse.json(
      { ok: false, error: "mt103Text or mt103 required" },
      { status: 400, headers: gate.headers },
    );
  }

  const candidates = await loadCandidates();
  const ordering = partyToScreen(mt103.ordering ?? {}, candidates);
  const beneficiary = partyToScreen(mt103.beneficiary ?? {}, candidates);
  const circular = detectCircularFlow(mt103);

  // Overall wire risk: highest-tier party + circular bump.
  const tiers: PartyResult["riskTier"][] = ["clear", "elevated", "high", "blocked"];
  const baseIdx = Math.max(tiers.indexOf(ordering.riskTier), tiers.indexOf(beneficiary.riskTier));
  const circularBump = circular && baseIdx < 2 ? 1 : 0;
  const overall = tiers[Math.min(tiers.length - 1, baseIdx + circularBump)] ?? "clear";

  const reasonCodes: string[] = [];
  if (ordering.riskTier === "blocked") reasonCodes.push("ordering-party-on-blocking-list");
  if (beneficiary.riskTier === "blocked") reasonCodes.push("beneficiary-on-blocking-list");
  if (ordering.riskTier === "high") reasonCodes.push("ordering-party-high-risk-hit");
  if (beneficiary.riskTier === "high") reasonCodes.push("beneficiary-high-risk-hit");
  if (circular) reasonCodes.push("circular-flow-detected");
  // FATF R.16 information-completeness check.
  const missingInfo: string[] = [];
  if (!mt103.ordering?.name && !mt103.ordering?.account) missingInfo.push("ordering-party");
  if (!mt103.beneficiary?.name && !mt103.beneficiary?.account) missingInfo.push("beneficiary");
  if (!mt103.amount || !mt103.currency) missingInfo.push("amount-or-currency");
  if (missingInfo.length > 0) reasonCodes.push(`fatf-r16-information-missing:${missingInfo.join(",")}`);
  const fatfR16Compliant = missingInfo.length === 0;

  return NextResponse.json(
    {
      ok: true,
      reference: mt103.reference,
      valueDate: mt103.valueDate,
      currency: mt103.currency,
      amount: mt103.amount,
      remittance: mt103.remittance,
      ordering,
      beneficiary,
      circularFlow: circular,
      fatfR16Compliant,
      missingInformation: missingInfo,
      riskTier: overall,
      reasonCodes,
      regulationBasis: [
        "FATF Recommendation 16 (Wire Transfers)",
        "UAE Cabinet Resolution 74/2020 (originator information)",
        "UAE FDL 10/2025 Art.18 (cross-border wire screening)",
      ],
    },
    { headers: gate.headers },
  );
}
