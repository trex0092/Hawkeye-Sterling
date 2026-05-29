// POST /api/sar-report/prefill — ENH-07 auto-completion.
//
// MLROs filing a SAR/STR currently copy-paste from screening results
// into the goAML form: 30-60 min of transcription per filing, plus
// transcription-error risk that the audit specifically flagged.
//
// This route takes a screening context (subjectId OR subject object plus
// optional screeningResult + transactions) and returns a pre-populated
// GoAmlXmlInput-shape payload that the operator can review + override
// before invoking /api/goaml-xml. Every auto-filled field is marked in
// `autoFilled` so the UI can highlight "operator confirmation needed".
//
// Auth: standard enforce() — MLRO session OR ADMIN_TOKEN.
// Does NOT submit anything; this is a draft helper.

import { NextResponse } from "next/server";
import { enforce } from "@/lib/server/enforce";
import { getJson, listKeys } from "@/lib/server/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

interface PrefillTransaction {
  date: string;
  amount: number;
  currency: string;
  type: string;
  description: string;
}

interface PrefillSubject {
  name?: string;
  dob?: string;
  nationality?: string;
  passport?: string;
  passportCountry?: string;
  country?: string;
  accountNumber?: string;
  email?: string;
  pep?: { tier?: string; role?: string };
  riskScore?: number;
  cddPosture?: string;
}

interface ScreeningHit {
  listId?: string;
  listRef?: string;
  programs?: string[];
  name?: string;
  score?: number;
}

interface PrefillBody {
  subjectId?: string;
  subject?: PrefillSubject;
  hits?: ScreeningHit[];                      // sanctions / PEP / adverse-media hits
  adverseMediaSnippets?: string[];
  transactions?: PrefillTransaction[];
  filingType?: "STR" | "SAR" | "CTR" | "FFR"; // default "STR"
  suspectedOffence?: string;                  // operator override; defaults inferred from hits
  reportingEntityId?: string;                 // override; defaults from HAWKEYE_DEFAULT_ENTITY_ID
  mlroName?: string;                          // override; default "Luisa Fernanda"
  mlroEmail?: string;
  mlroPhone?: string;
}

interface PrefillResponse {
  ok: true;
  filingType: "STR" | "SAR" | "CTR" | "FFR";
  prefilled: {
    mlroName: string;
    mlroEmail: string;
    mlroPhone: string;
    reportingEntityId: string;
    subjectName: string;
    subjectDob: string;
    subjectNationality: string;
    subjectPassport: string;
    subjectPassportCountry: string;
    subjectCountry: string;
    accountNumber: string;
    narrativeText: string;
    transactions: PrefillTransaction[];
    suspectedOffence: string;
  };
  /** True for any field the route filled from screening context. UI highlights these. */
  autoFilled: Record<string, boolean>;
  /** Fields the operator MUST review before submission — usually means low confidence
   *  on the auto-fill or no source signal at all (placeholder used). */
  reviewRequired: string[];
  summary: {
    sanctionsHitsUsed: number;
    pepSignalsUsed: number;
    adverseSnippetsUsed: number;
    transactionsCount: number;
  };
  hint: string;
}

function inferSuspectedOffence(hits: ScreeningHit[], adverse: string[]): string {
  // Highest-priority OFAC/UN/EU sanctions → trade-finance offence.
  const blockingHit = hits.find((h) => {
    const id = (h.listId ?? "").toLowerCase();
    return id.includes("ofac") || id.includes("un_") || id.includes("uae_eocn") || id.includes("ltl");
  });
  if (blockingHit) return "Money laundering (sanctions evasion via the screened entity)";
  if (hits.some((h) => (h.listId ?? "").toLowerCase().includes("pep"))) {
    return "Money laundering (potential bribery/PEP exposure)";
  }
  const adverseJoined = adverse.join(" ").toLowerCase();
  if (/terror|tf\b/i.test(adverseJoined)) return "Terrorism financing";
  if (/drug|narcotic|cocain|heroin/i.test(adverseJoined)) return "Drug trafficking (predicate)";
  if (/human trafficking|forced labor/i.test(adverseJoined)) return "Human trafficking (predicate)";
  if (/fraud|forgery|embezzlement/i.test(adverseJoined)) return "Fraud (predicate)";
  if (/corruption|brib/i.test(adverseJoined)) return "Corruption / bribery (predicate)";
  if (/tax evasion/i.test(adverseJoined)) return "Tax evasion (predicate)";
  return "Money laundering (suspicious activity — predicate offence to be confirmed)";
}

function buildNarrative(
  subject: PrefillSubject,
  hits: ScreeningHit[],
  adverse: string[],
  transactions: PrefillTransaction[],
  filingType: string,
): string {
  const lines: string[] = [];
  const fullName = subject.name ?? "[SUBJECT_NAME]";
  lines.push(`This ${filingType} relates to ${fullName}${subject.nationality ? ` (${subject.nationality} national)` : ""}${subject.dob ? `, DOB ${subject.dob}` : ""}.`);
  if (subject.pep?.tier || subject.pep?.role) {
    lines.push(`Subject is classified as a Politically Exposed Person — tier ${subject.pep.tier ?? "unknown"}${subject.pep.role ? ` (${subject.pep.role})` : ""}.`);
  }
  if (hits.length > 0) {
    lines.push(`\nScreening produced ${hits.length} match(es) against compliance lists:`);
    for (const h of hits.slice(0, 8)) {
      const programs = (h.programs ?? []).join(", ");
      lines.push(`  - ${h.listId ?? "list:unknown"}${h.listRef ? ` ref:${h.listRef}` : ""}${h.score !== undefined ? ` score:${h.score}` : ""}${programs ? ` (${programs})` : ""}`);
    }
  }
  if (adverse.length > 0) {
    lines.push(`\nRelevant adverse-media findings:`);
    for (const a of adverse.slice(0, 6)) {
      lines.push(`  - ${a.slice(0, 240)}`);
    }
  }
  if (transactions.length > 0) {
    const total = transactions.reduce((s, t) => s + (Number.isFinite(t.amount) ? t.amount : 0), 0);
    const currencies = Array.from(new Set(transactions.map((t) => t.currency).filter(Boolean)));
    lines.push(`\nTransaction summary: ${transactions.length} transaction(s) totalling ${total.toLocaleString("en-US")} ${currencies.join("/") || "AED"}. Detail in the goAML transaction block.`);
  }
  lines.push(`\nBased on the above signals the MLRO has elected to file this ${filingType} under UAE FDL 10/2025 Art.17 (48-hour STR obligation) for review by the UAE FIU.`);
  lines.push(`\n[MLRO REVIEW REQUIRED — confirm or override every auto-filled field before submission. The screening signals above are an automated draft, not a final regulatory disposition.]`);
  return lines.join("\n");
}

export async function POST(req: Request): Promise<NextResponse> {
  const gate = await enforce(req);
  if (!gate.ok) return gate.response;

  let body: PrefillBody;
  try {
    body = (await req.json()) as PrefillBody;
  } catch {
    return NextResponse.json({ ok: false, error: "invalid JSON body" }, { status: 400, headers: gate.headers });
  }

  const filingType = body.filingType ?? "STR";
  const autoFilled: Record<string, boolean> = {};
  const reviewRequired: string[] = [];

  // ── Resolve subject from subjectId if provided, otherwise use body.subject ──
  let subject: PrefillSubject = body.subject ?? {};
  if (body.subjectId && !body.subject) {
    const persisted = await getJson<PrefillSubject>(`ongoing/subject/${body.subjectId}`);
    if (persisted) {
      subject = persisted;
      autoFilled["subjectFromStore"] = true;
    } else {
      reviewRequired.push("subject — subjectId not found in store");
    }
  }

  // ── Sanctions/PEP hits + adverse media ──
  const hits = body.hits ?? [];
  const adverseSnippets = body.adverseMediaSnippets ?? [];

  // If hits not supplied, try to pull recent screening-history for this subject.
  let derivedHits = hits;
  if (derivedHits.length === 0 && body.subjectId) {
    try {
      const histKeys = await listKeys(`screening-history/${body.subjectId}/`);
      // Use only the most recent screening record's hits to avoid stale signals.
      const last = histKeys.length > 0 ? histKeys[histKeys.length - 1]! : null;
      if (last) {
        const h = await getJson<{ hits?: ScreeningHit[] }>(last);
        if (h?.hits?.length) {
          derivedHits = h.hits;
          autoFilled["hitsFromHistory"] = true;
        }
      }
    } catch { /* non-fatal */ }
  }

  // ── Pre-fill scalar fields ──
  const subjectName = subject.name?.trim() || "[REPLACE: subject full legal name]";
  if (subject.name) autoFilled["subjectName"] = true; else reviewRequired.push("subjectName");
  const subjectDob = subject.dob?.trim() || "1970-01-01";
  if (subject.dob) autoFilled["subjectDob"] = true; else reviewRequired.push("subjectDob (placeholder used)");
  const subjectNationality = subject.nationality?.trim() || "";
  if (subject.nationality) autoFilled["subjectNationality"] = true; else reviewRequired.push("subjectNationality");
  const subjectPassport = subject.passport?.trim() || "";
  if (subject.passport) autoFilled["subjectPassport"] = true; else reviewRequired.push("subjectPassport");
  const subjectPassportCountry = subject.passportCountry?.trim() || subjectNationality;
  if (subjectPassportCountry) autoFilled["subjectPassportCountry"] = true;
  const subjectCountry = subject.country?.trim() || subjectNationality;
  if (subjectCountry) autoFilled["subjectCountry"] = true;
  const accountNumber = subject.accountNumber?.trim() || "";
  if (subject.accountNumber) autoFilled["accountNumber"] = true; else reviewRequired.push("accountNumber");

  const reportingEntityId =
    body.reportingEntityId?.trim() ||
    process.env["HAWKEYE_DEFAULT_ENTITY_ID"] ||
    process.env["HAWKEYE_ENTITIES"]?.split(",")[0]?.trim() ||
    "";
  if (reportingEntityId) autoFilled["reportingEntityId"] = true;
  else reviewRequired.push("reportingEntityId — set HAWKEYE_DEFAULT_ENTITY_ID or pass explicitly");

  const mlroName = body.mlroName?.trim() || "Luisa Fernanda";
  const mlroEmail = body.mlroEmail?.trim() || "";
  const mlroPhone = body.mlroPhone?.trim() || "";
  if (!body.mlroEmail) reviewRequired.push("mlroEmail");
  if (!body.mlroPhone) reviewRequired.push("mlroPhone");

  const suspectedOffence = body.suspectedOffence?.trim() || inferSuspectedOffence(derivedHits, adverseSnippets);
  if (!body.suspectedOffence) autoFilled["suspectedOffence"] = true;

  const transactions = body.transactions ?? [];
  if (transactions.length === 0) reviewRequired.push("transactions — none supplied; add at least one before submitting");

  const narrativeText = buildNarrative(subject, derivedHits, adverseSnippets, transactions, filingType);
  autoFilled["narrativeText"] = true;

  const response: PrefillResponse = {
    ok: true,
    filingType,
    prefilled: {
      mlroName,
      mlroEmail,
      mlroPhone,
      reportingEntityId,
      subjectName,
      subjectDob,
      subjectNationality,
      subjectPassport,
      subjectPassportCountry,
      subjectCountry,
      accountNumber,
      narrativeText,
      transactions,
      suspectedOffence,
    },
    autoFilled,
    reviewRequired,
    summary: {
      sanctionsHitsUsed: derivedHits.filter((h) => /ofac|un_|eu_|uk_|ca_|au_|jp_|ch_|uae_/i.test(h.listId ?? "")).length,
      pepSignalsUsed: derivedHits.filter((h) => /pep/i.test(h.listId ?? "")).length + (subject.pep ? 1 : 0),
      adverseSnippetsUsed: adverseSnippets.length,
      transactionsCount: transactions.length,
    },
    hint:
      reviewRequired.length === 0
        ? "Draft complete. Operator MUST still review the narrative before invoking /api/goaml-xml to generate the final XML."
        : `Draft has ${reviewRequired.length} field(s) requiring operator review: ${reviewRequired.slice(0, 5).join(", ")}${reviewRequired.length > 5 ? "..." : ""}`,
  };

  return NextResponse.json(response, { headers: gate.headers });
}
