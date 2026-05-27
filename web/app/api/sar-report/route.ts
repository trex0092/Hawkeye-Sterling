import { NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import { enforce } from "@/lib/server/enforce";
import { postWebhook } from "@/lib/server/webhook";
import { getEntity } from "@/lib/config/entities";
import { writeAuditChainEntry } from "@/lib/server/audit-chain";
import { tenantIdFromGate } from "@/lib/server/tenant";
import { listKeys, getJson } from "@/lib/server/store";
import { serialiseGoamlXml } from "../../../../src/integrations/goaml-xml.js";
import { validateGoamlEnvelope, type GoAmlEnvelope, type GoAmlPerson, type GoAmlEntity, type GoAmlReportCode } from "../../../../src/brain/goaml-shapes.js";
import {
  buildHtmlDoc,
  hsCover,
  hsPage,
  hsFinis,
  hsTable,
  hsKvGrid,
  hsNarrative,
  hsSeverityCell,
  escHtml,
  type CoverData,
} from "@/lib/reportHtml";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

import { asanaGids } from "@/lib/server/asanaConfig";
import { runEgressCheck } from "@/lib/server/egress-check";

type FilingType =
  | "STR"
  | "SAR"
  | "CTR"
  | "DPMSR"
  | "FFR"
  | "PNMR"
  | "HRCR"
  | "AIF"
  | "PEPR"
  | "FTFR";

interface FourEyesItemPartial {
  status: string;
  subjectId?: string;
  caseId?: string;
  filingBlocked?: boolean;
  initiatedAt?: string;
}

// Returns the first blocking four-eyes item for the given subject/case, or null.
// A filing is blocked when any pending item for the subject has been marked
// filingBlocked=true by the stale-alert cron (age > 72h). ADD-5.
async function findBlockingFourEyesItem(
  subjectId: string | undefined,
  caseId: string | undefined,
): Promise<FourEyesItemPartial | null> {
  if (!subjectId && !caseId) return null;
  try {
    const keys = await listKeys("four-eyes/");
    const items = (await Promise.all(
      keys.map((k) => getJson<FourEyesItemPartial>(k).catch(() => null)),
    )).filter((i): i is FourEyesItemPartial => i !== null);
    return items.find(
      (i) =>
        i.status === "pending" &&
        i.filingBlocked === true &&
        (i.subjectId === subjectId || i.caseId === caseId),
    ) ?? null;
  } catch {
    return null;
  }
}

// Phrases that constitute tipping-off under FDL 10/2025 Art.29.
// The list is broad on purpose: false-positive flagging an MLRO draft is
// a recoverable inconvenience; a true-positive that slipped through is a
// criminal disclosure. Patterns cover synonyms, abbreviations, and
// common circumvention phrasings.
const TIPPING_OFF_PATTERNS = [
  // Direct STR/SAR/CTR references and synonyms
  /\bSTR\s+(?:has\s+been|was|is being)\s+(?:filed|raised|submitted|lodged)\b/i,
  /\bSAR\s+(?:has\s+been|was|is being)\s+(?:filed|raised|submitted|lodged)\b/i,
  /\bSIR\s+(?:has\s+been|was|is being)\s+(?:filed|raised|submitted|lodged)\b/i,
  /\bCTR\s+(?:has\s+been|was|is being)\s+(?:filed|raised|submitted|lodged)\b/i,
  /\bsuspicious\s+(?:transaction|activity)\s+report\b/i,
  /\bsuspicion\s+report\b/i,
  /\bgoAML\s+(?:filing|report|submission|lodgement)\b/i,
  // Investigation / reporting language
  /\byou\s+are\s+(?:being\s+)?(?:investigat|examin|review|scrutiniz|scrutinis)/i,
  /\b(?:we|the\s+bank|the\s+firm|compliance)\s+(?:have|has)\s+reported\s+you\b/i,
  /\bauthorities\s+(?:have\s+been|are\s+being)\s+(?:notified|informed|alerted|told)\b/i,
  /\b(?:FIU|EOCN|CBUAE|FATF|regulator)\s+(?:has\s+been|have\s+been|is\s+being|are\s+being)\s+(?:notified|informed|alerted|told)\b/i,
  /\banti.?money\s+laundering\s+(?:investigation|inquiry|review|case)\b/i,
  /\bAML\s+(?:investigation|inquiry|review|case|alert|flag)\b/i,
  /\bcompliance\s+(?:investigation|inquiry|alert|flag|hold)\b/i,
  // Account-status disclosures that imply a suspicion was raised
  /\byour\s+account.{0,40}(?:suspend|block|freez|flag|hold|restrict|escalat)/is,
  /\b(?:suspended|blocked|frozen|flagged|on hold|restricted)\s+(?:due to|because of|pending)\s+(?:AML|compliance|investigation|review|suspicion)/i,
  // Circumvention phrasings — "between you and me", "off the record"
  // `s` flag: dotAll so .{0,80} can't be bypassed by embedding a newline mid-phrase
  /\b(?:off\s+the\s+record|between\s+you\s+and\s+me|don'?t\s+tell\s+anyone).{0,80}\b(?:STR|SAR|FIU|investigat|report|fil)/is,
  /\bI\s+shouldn'?t\s+(?:tell|say)\s+you.{0,80}\b(?:STR|SAR|FIU|investigat|report|fil)/is,
];

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function safeFilenameSegment(s: string | undefined | null): string {
  if (!s) return "unknown";
  return s.replace(/[^A-Za-z0-9._-]/g, "_").slice(0, 64) || "unknown";
}

function checkTippingOff(text: string): string | null {
  for (const pat of TIPPING_OFF_PATTERNS) {
    if (pat.test(text)) return pat.source;
  }
  return null;
}

interface Body {
  subject: {
    id: string;
    name: string;
    aliases?: string[];
    entityType?: "individual" | "organisation" | "vessel" | "aircraft" | "other";
    jurisdiction?: string;
    dob?: string;
    caseId?: string;
    group?: string;
  };
  filingType: FilingType;
  narrative?: string;   // Optional MLRO draft; otherwise auto-drafted.
  approver?: string;    // Four-eyes: second officer name
  result?: {
    topScore: number;
    severity: string;
    listsChecked: number;
    candidatesChecked: number;
    durationMs: number;
    generatedAt: string;
    hits: Array<{
      listId: string;
      listRef: string;
      candidateName: string;
      score: number;
      method: string;
      programs?: string[];
    }>;
  };
  superBrain?: {
    pep?: { tier: string; type: string; salience: number } | null;
    jurisdiction?: {
      iso2: string;
      name: string;
      cahra: boolean;
      regimes: string[];
    } | null;
    adverseKeywordGroups?: Array<{ group: string; label: string; count: number }>;
  } | null;
  mlro?: string;
  /** Slug of the reporting entity from HAWKEYE_ENTITIES. When omitted,
   *  resolves to HAWKEYE_DEFAULT_ENTITY_ID, then to the first entity. */
  entityId?: string;
  /** FATF money laundering typology detected by brain/typology analysis. */
  typologyName?: string;
  /** Subject occupation / business relationship to the reporting institution. */
  subjectOccupation?: string;
  /** Relationship of subject to the reporting institution (e.g. customer, counterparty). */
  subjectRelationship?: string;
  /** Transaction details: amounts, dates, counterparties, accounts. */
  transactionDetails?: {
    amounts?: string[];
    dates?: string[];
    counterparties?: string[];
    accounts?: string[];
    instruments?: string[];
  };
  /** Steps taken by the institution to determine legitimacy (e.g. EDD, source-of-funds request). */
  dueDiligenceStepsTaken?: string[];
}

async function handleSarReport(req: Request, gateHeaders: Record<string, string>, tenant: string = "default", actorKeyId?: string): Promise<Response> {
  const _handlerStart = Date.now();
  try {
  const token = process.env["ASANA_TOKEN"];
  const asanaEnabled = !!token;

  let body: Body;
  try {
    body = (await req.json()) as Body;
  } catch {
    return NextResponse.json({ ok: false, error: "invalid JSON" }, { status: 400 , headers: gateHeaders });
  }
  if (!body?.subject?.name || !body?.filingType) {
    return NextResponse.json(
      { ok: false, error: "subject and filingType are required" },
      { status: 400, headers: gateHeaders }
    );
  }

  // ADD-5: block filing when a four-eyes item for this subject is overdue > 72h.
  const blockedItem = await findBlockingFourEyesItem(body.subject?.id, body.subject?.caseId);
  if (blockedItem) {
    return NextResponse.json(
      {
        ok: false,
        error: "four_eyes_overdue_blocked",
        detail: "A four-eyes approval for this subject has been pending > 72h and is now blocking STR/SAR filings. Resolve the overdue four-eyes item first (UAE FDL 10/2025 Art.16).",
      },
      { status: 422, headers: gateHeaders },
    );
  }

  // Server-side tipping-off check — FDL 10/2025 Art.29
  if (body.narrative) {
    const tipOff = checkTippingOff(body.narrative);
    if (tipOff) {
      return NextResponse.json(
        { ok: false, error: "tipping_off_detected", detail: `Narrative contains potential tipping-off language (pattern: ${tipOff}). Remove the disclosure before filing.` },
        { status: 422, headers: gateHeaders }
      );
    }
  }

  // Four-eyes gate — approver must be set and differ from filer
  const mlro = body.mlro ?? "[MLRO NAME NOT CONFIGURED]";
  if (!body.approver?.trim()) {
    return NextResponse.json(
      { ok: false, error: "four_eyes_required", detail: "A second approver (four-eyes) is required before this filing can proceed." },
      { status: 422, headers: gateHeaders }
    );
  }
  if (body.approver.trim().toLowerCase() === mlro.trim().toLowerCase()) {
    return NextResponse.json(
      { ok: false, error: "four_eyes_same_person", detail: "The approver must be a different person from the MLRO filing this report." },
      { status: 422, headers: gateHeaders }
    );
  }
  // ENH-04: persist both approvals to the canonical four-eyes ledger so
  // post-facto regulator audit can reconstruct who attested what + when.
  // The synchronous body-field check above guards this single submission;
  // the ledger preserves dual-attestation history per case (UAE FDL
  // 10/2025 Art.16 + FATF R.26).
  try {
    const { recordApproval } = await import("@/lib/server/four-eyes-gate");
    const caseRef = `sar:${body.subject?.name ?? "unknown"}:${Date.now()}`;
    // Actor is the authenticated API key identity (gate.keyId), not the
    // user-supplied body.mlro string. body.mlro is a display name only;
    // recording it in the four-eyes ledger as the actor would allow any
    // authenticated caller to impersonate arbitrary identities in the
    // regulatory artefact (FDL 10/2025 Art.16 compliance control bypass).
    const filerActor = actorKeyId ?? `mlro:${mlro}`;
    // The second approver is still user-supplied since the route is single-
    // session. Include the filer's API key as a prefix so the ledger entry
    // distinguishes "approver declared by <keyId>" from a self-attestation.
    const approverActor = `approver:${body.approver}:attested-by:${filerActor}`;
    await recordApproval({
      caseId: caseRef,
      actor: filerActor,
      decision: "approve",
      rationale: `${body.filingType} filer attestation (authenticated as ${filerActor})`,
    });
    await recordApproval({
      caseId: caseRef,
      actor: approverActor,
      decision: "approve",
      rationale: `${body.filingType} second-approver (four-eyes) attestation — declared by ${filerActor}`,
    });
  } catch (err) {
    // Audit-ledger write failures must NOT block the filing — the
    // synchronous gate above already enforced the rule. Surface to ops.
    console.warn(
      `[sar-report] four-eyes ledger persist failed: ${err instanceof Error ? err.message : String(err)} — synchronous gate still enforced.`,
    );
  }

  const projectGid = asanaGids.sar();
  const workspaceGid = asanaGids.workspace();
  const now = new Date().toISOString();

  const name = `[${body.filingType}] DRAFT · ${body.subject.name}${
    body.result ? ` · top ${body.result.topScore}` : ""
  }`;

  const lines: string[] = [];
  lines.push(`FILING TYPE         : ${body.filingType}`);
  lines.push(`Subject             : ${body.subject.name}`);
  if (body.subject.aliases?.length)
    lines.push(`Aliases             : ${body.subject.aliases.join("; ")}`);
  lines.push(`Subject ID          : ${body.subject.id}`);
  if (body.subject.caseId) lines.push(`Case ID             : ${body.subject.caseId}`);
  if (body.subject.group) lines.push(`Group               : ${body.subject.group}`);
  lines.push(`Type                : ${body.subject.entityType ?? "—"}`);
  if (body.subject.jurisdiction)
    lines.push(`Jurisdiction        : ${body.subject.jurisdiction}`);
  if (body.subject.dob) lines.push(`DOB / Registration  : ${body.subject.dob}`);
  lines.push(`MLRO                : ${mlro}`);
  lines.push(`Four-eyes approver  : ${body.approver ?? "—"}`);
  lines.push(`Generated           : ${now}`);
  lines.push("");

  if (body.result) {
    lines.push("── Brain verdict ──");
    lines.push(`Severity            : ${body.result.severity.toUpperCase()}`);
    lines.push(`Top score           : ${body.result.topScore} / 100`);
    lines.push(
      `Lists checked       : ${body.result.listsChecked} · Candidates: ${body.result.candidatesChecked} · ${body.result.durationMs}ms`,
    );
    if (body.result.hits.length) {
      lines.push("");
      lines.push(`── Hits (${body.result.hits.length}) ──`);
      for (const h of body.result.hits) {
        const pct = Math.round(h.score * 100);
        lines.push(
          `• [${h.listId}] ${h.candidateName} — ${pct}% (${h.method})`,
        );
        lines.push(`    ref: ${h.listRef}`);
        if (h.programs?.length) lines.push(`    programs: ${h.programs.join(", ")}`);
      }
    }
  }

  if (body.superBrain?.jurisdiction) {
    const j = body.superBrain.jurisdiction;
    lines.push("");
    lines.push("── Jurisdiction risk ──");
    lines.push(`Country             : ${j.name} (${j.iso2})${j.cahra ? " · CAHRA" : ""}`);
    if (j.regimes?.length) lines.push(`Regimes             : ${j.regimes.join(", ")}`);
  }

  if (body.superBrain?.pep && body.superBrain.pep.salience > 0) {
    const p = body.superBrain.pep;
    lines.push("");
    lines.push("── PEP ──");
    lines.push(
      `${p.type.replace(/_/g, " ")} · tier ${p.tier} · salience ${Math.round(p.salience * 100)}%`,
    );
  }

  if (body.superBrain?.adverseKeywordGroups?.length) {
    lines.push("");
    lines.push("── Adverse-media groups ──");
    for (const g of body.superBrain.adverseKeywordGroups) {
      lines.push(`• ${g.label} (${g.count})`);
    }
  }

  lines.push("");
  lines.push("── Narrative (MLRO draft — review before submission) ──");
  lines.push(body.narrative ?? autoNarrative(body));

  // ── Build real goAML XML envelope ────────────────────────────────────────
  const narrative = body.narrative ?? autoNarrative(body);
  const internalRef = `HWK-${body.filingType}-${body.subject.id}`;
  const reportCode = body.filingType as GoAmlReportCode;

  let involvedPersons: GoAmlPerson[] | undefined;
  let involvedEntities: GoAmlEntity[] | undefined;

  if (body.subject.entityType === "individual" || !body.subject.entityType) {
    const nameParts = body.subject.name.trim().split(/\s+/);
    const firstName = nameParts.slice(0, -1).join(" ") || nameParts[0] || body.subject.name;
    const lastName = nameParts.length > 1 ? nameParts[nameParts.length - 1]! : "";
    const person: GoAmlPerson = {
      firstName,
      ...(lastName ? { lastName } : { lastName: "" }),
      ...(body.subject.dob ? { dateOfBirth: body.subject.dob } : {}),
      ...(body.subject.jurisdiction ? { nationality1: body.subject.jurisdiction } : {}),
    };
    involvedPersons = [person];
  } else {
    const entity: GoAmlEntity = {
      legalName: body.subject.name,
      incorporationCountryIso2: body.subject.jurisdiction ?? "AE",
      addresses: [],
    };
    involvedEntities = [entity];
  }

  // Resolve which legal entity is filing this STR. Falls back to the
  // single-entity legacy GOAML_RENTITY_ID when HAWKEYE_ENTITIES is unset.
  const reportingEntity = getEntity(body.entityId);
  const mlroEmail = process.env["MLRO_EMAIL"] ?? "mlro@hawkeye-sterling.com";
  const mlroPhone = process.env["MLRO_PHONE"] ?? "+971-4-000-0000";

  const envelope: GoAmlEnvelope = {
    reportCode,
    rentityId: reportingEntity.goamlRentityId,
    ...(reportingEntity.goamlBranch
      ? { rentityBranch: reportingEntity.goamlBranch }
      : {}),
    reportingPerson: {
      fullName: mlro,
      occupation: "MLRO",
      email: mlroEmail,
      phoneNumber: mlroPhone,
    },
    submissionCode: "E",
    currencyCodeLocal: "AED",
    reason: narrative,
    ...(involvedPersons !== undefined ? { involvedPersons } : {}),
    ...(involvedEntities !== undefined ? { involvedEntities } : {}),
    internalReference: internalRef,
    generatedAt: now,
    charterIntegrityHash: process.env["CHARTER_HASH"] ?? "hawkeye-sterling-v1",
  };

  // Validate the envelope before serialising. If validation produces ANY
  // errors we refuse the filing — pushing a broken envelope to the FIU
  // is worse than refusing to file: the FIU rejects it silently and the
  // MLRO believes the STR was lodged when it wasn't.
  const validationErrors = validateGoamlEnvelope(envelope);
  let goamlXml = "";
  let goamlValidationWarnings: string[] = [];
  let goamlSerialiseError: string | null = null;
  try {
    goamlXml = serialiseGoamlXml(envelope);
    goamlValidationWarnings = validationErrors;
  } catch (xmlErr) {
    goamlSerialiseError = xmlErr instanceof Error ? xmlErr.message : String(xmlErr);
    goamlValidationWarnings = [
      `XML serialisation failed: ${goamlSerialiseError}`,
      ...validationErrors,
    ];
  }
  // Hard refusal: serialisation failure or validator returned errors.
  // The MLRO sees the warnings and must fix them before the filing can
  // proceed — the goAML XML never leaves the building unsigned.
  if (goamlSerialiseError || validationErrors.length > 0) {
    console.error("[sar-report] refusing to file invalid goAML envelope", {
      subject: body.subject.id,
      filingType: body.filingType,
      validationErrors,
      goamlSerialiseError,
    });
    return NextResponse.json(
      {
        ok: false,
        error: "goaml_envelope_invalid",
        detail: "goAML envelope failed validation — fix the listed warnings and re-submit. The FIU rejects malformed XML; filing was NOT created.",
        validationWarnings: goamlValidationWarnings,
      },
      { status: 422, headers: gateHeaders }
    );
  }

  // FDL 10/2025 Art.17 + Art.24 — every SAR/STR report generation must be
  // permanently logged on the tamper-evident server-side chain.
  void writeAuditChainEntry(
    {
      event: "sar.report.generated",
      actor: actorKeyId ?? mlro,
      subjectName: body.subject.name,
      subjectId: body.subject.id,
      filingType: body.filingType,
      caseId: body.subject.caseId,
      internalRef,
      fourEyesApprover: body.approver,
      goamlValidated: goamlValidationWarnings.length === 0,
    },
    tenant,
  ).catch((err) =>
    console.warn("[sar-report] audit chain write failed:", err instanceof Error ? err.message : String(err)),
  );

  lines.push("");
  lines.push("── goAML XML (serialised — MLRO to review before FIU submission) ──");
  if (goamlValidationWarnings.length > 0) {
    lines.push(`VALIDATION WARNINGS (${goamlValidationWarnings.length}):`);
    for (const w of goamlValidationWarnings) lines.push(`  ⚠ ${w}`);
    lines.push("");
  }
  if (goamlXml) {
    lines.push(goamlXml);
  } else {
    lines.push("[XML generation failed — see validation warnings above]");
  }

  lines.push("");
  lines.push(
    "Legal basis: FDL 10/2025 Art.26-27 · Art.29 (tipping-off) · Art.24 (10-yr retention) · Cabinet Res 134/2025 Art.18",
  );
  lines.push("Source: Hawkeye Sterling — https://hawkeye-sterling.netlify.app");

  // ── Branded HTML PDF — when caller requests ?format=html ────────────────
  const url = new URL(req.url);
  if ((url.searchParams.get("format") ?? "").toLowerCase() === "html") {
    const ts = new Date();
    const dd = String(ts.getUTCDate()).padStart(2, "0");
    const mm = String(ts.getUTCMonth() + 1).padStart(2, "0");
    const yyyy = ts.getUTCFullYear();
    const hh = String(ts.getUTCHours()).padStart(2, "0");
    const mi = String(ts.getUTCMinutes()).padStart(2, "0");
    const reportId = `HWK-${body.filingType}-${dd}-${mm}-${yyyy}-${hh}${mi}`;
    const regs = "FDL 10/2025 Art.26-27 · Art.29 · Art.24 (10-yr retention) · Cabinet Res 134/2025 Art.18";
    const label = `${body.filingType} FILING — goAML`;
    const sev = (body.result?.severity ?? "review").toLowerCase();
    const verdictBand = sev === "critical" ? "ember" : sev === "high" ? "ember" : sev === "medium" ? "amber" : "sage";

    const coverData: CoverData = {
      reportId, regs,
      module: `${body.filingType} FILING`,
      title: `${body.filingType} Filing Dossier`,
      subtitle: `${body.filingType} draft prepared for goAML submission. MLRO review required before lodgement.`,
      subjectLabel: "SUBJECT",
      subjectName: body.subject.name,
      subjectMeta: [
        body.subject.id,
        body.subject.entityType ?? "individual",
        body.subject.jurisdiction ?? null,
        body.subject.dob ? `DOB ${body.subject.dob}` : null,
      ].filter(Boolean).join(" · "),
      verdictLabel: body.filingType,
      verdictBand,
      verdictNote: `Brain severity ${(body.result?.severity ?? "—").toUpperCase()}; top score ${body.result?.topScore ?? "—"}/100`,
      meta: [
        { label: "Filing type", value: body.filingType },
        { label: "MLRO", value: mlro },
        { label: "Four-eyes approver", value: body.approver ?? "—" },
        { label: "Generated", value: ts.toUTCString().replace(" GMT", " UTC") },
        { label: "Internal reference", value: internalRef },
        { label: "Reporting entity", value: reportingEntity.goamlRentityId },
      ],
    };

    const hitsTable = body.result && body.result.hits.length > 0
      ? hsTable(
          ["List", "Match", "Score", "Method", "Programs"],
          body.result.hits.slice(0, 20).map((h) => [
            h.listId,
            h.candidateName,
            `${Math.round(h.score * 100)}%`,
            h.method,
            (h.programs ?? []).join(", ") || "—",
          ]),
        )
      : "<p class='hs-narrative'>No sanctions hits returned.</p>";

    const facts = `
      <div class="hs-rule"></div>
      <h2 class="hs-section-h">Facts</h2>
      ${hsNarrative(
        `Hawkeye Sterling has flagged ${body.subject.name} (${body.subject.id}) as requiring a <strong>${body.filingType}</strong> filing. Brain severity ${(body.result?.severity ?? "—").toUpperCase()}; top score ${body.result?.topScore ?? "—"}/100 across ${body.result?.listsChecked ?? 0} lists.`,
        true,
      )}
      <h2 class="hs-section-h" style="margin-top:14px">Brain verdict</h2>
      ${hsKvGrid([
        { k: "Severity", v: hsSeverityCell((body.result?.severity ?? "review").toUpperCase()) },
        { k: "Top score", v: `${body.result?.topScore ?? "—"} / 100` },
        { k: "Lists checked", v: String(body.result?.listsChecked ?? "—") },
        { k: "Candidates", v: String(body.result?.candidatesChecked ?? "—") },
        { k: "Duration", v: `${body.result?.durationMs ?? 0} ms` },
      ])}
      <h2 class="hs-section-h" style="margin-top:14px">Hits (${body.result?.hits.length ?? 0})</h2>
      ${hitsTable}
      ${body.superBrain?.jurisdiction ? `
        <h2 class="hs-section-h">Jurisdiction risk</h2>
        ${hsKvGrid([
          { k: "Country", v: `${escapeHtml(body.superBrain.jurisdiction.name)} (${escapeHtml(body.superBrain.jurisdiction.iso2)})${body.superBrain.jurisdiction.cahra ? " · CAHRA" : ""}` },
          { k: "Active regimes", v: escapeHtml((body.superBrain.jurisdiction.regimes ?? []).join(", ") || "—") },
        ])}
      ` : ""}
      ${body.superBrain?.pep && body.superBrain.pep.salience > 0 ? `
        <h2 class="hs-section-h">PEP</h2>
        ${hsKvGrid([
          { k: "Type", v: escapeHtml(body.superBrain.pep.type.replace(/_/g, " ")) },
          { k: "Tier", v: escapeHtml(body.superBrain.pep.tier) },
          { k: "Salience", v: `${Math.round(body.superBrain.pep.salience * 100)}%` },
        ])}
      ` : ""}
      ${body.superBrain?.adverseKeywordGroups?.length ? `
        <h2 class="hs-section-h">Adverse-media groups</h2>
        <ul class="hs-findings">${body.superBrain.adverseKeywordGroups.map((g) => `<li>${escapeHtml(g.label)} (${g.count})</li>`).join("")}</ul>
      ` : ""}
    `;

    const narrativePage = `
      <h2 class="hs-section-h" style="margin-top:0">Narrative (MLRO review required)</h2>
      <p class="hs-narrative">${escapeHtml(narrative).replace(/\n/g, "</p><p class='hs-narrative'>")}</p>
      <h2 class="hs-section-h" style="margin-top:14px">goAML envelope</h2>
      ${hsKvGrid([
        // internalRef contains body.subject.id which is user-controlled —
        // escape it since hsKvGrid treats v as trusted HTML.
        { k: "Internal reference", v: escHtml(internalRef) },
        { k: "Report code", v: escHtml(body.filingType) },
        { k: "Reporting entity ID", v: escHtml(reportingEntity.goamlRentityId) },
        { k: "Validation", v: goamlValidationWarnings.length === 0 ? "PASSED" : `${goamlValidationWarnings.length} warnings` },
      ])}
      ${goamlValidationWarnings.length > 0 ? `
        <p class="hs-narrative" style="color:#b45309"><strong>Validation warnings:</strong></p>
        <ul class="hs-findings">${goamlValidationWarnings.map((w) => `<li>${escapeHtml(w)}</li>`).join("")}</ul>
      ` : ""}
      ${hsFinis(reportId, 2, 2)}
    `;

    const html = buildHtmlDoc({
      title: `Hawkeye Sterling — ${body.filingType} Filing ${reportId}`,
      autoprint: true,
      pages: [
        hsCover(coverData),
        hsPage({ reportId, pageNum: 1, pageTotal: 2, regs, label, content: facts }),
        hsPage({ reportId, pageNum: 2, pageTotal: 2, regs, label, content: narrativePage }),
      ],
    });
    return new Response(html, {
      status: 200,
      headers: {
        ...gateHeaders,
        "content-type": "text/html; charset=utf-8",
        "content-disposition": `inline; filename="hawkeye-${safeFilenameSegment(body.filingType)}-${safeFilenameSegment(body.subject.id)}.html"`,
        "cache-control": "no-store",
      },
    });
  }

  // Asana filing — if ASANA_TOKEN not set, return the report without filing
  if (!asanaEnabled) {
    return NextResponse.json({
      ok: true,
      filingType: body.filingType,
      asanaSkipped: true,
      asanaNote: "ASANA_TOKEN not configured — report generated but not filed to MLRO inbox. Set ASANA_TOKEN in Netlify env to enable automatic filing.",
      reportText: lines.join("\n"),
      goaml: {
        internalReference: internalRef,
        validated: goamlValidationWarnings.length === 0,
        validationWarnings: goamlValidationWarnings,
        xmlBase64: goamlXml ? Buffer.from(goamlXml, "utf8").toString("base64") : null,
      },
    }, { headers: gateHeaders });
  }

  // Egress gate: compliance pre-check before MLRO inbox delivery.
  // Gate is off by default; enable with EGRESS_GATE_ENABLED=true after MLRO
  // confirms mandate (FDL 10/2025 Art.16, charter P3).
  const egressResult = await runEgressCheck(lines.join("\n"), `${body.filingType} filing`);
  if (!egressResult.allowed) {
    return NextResponse.json({
      ok: false,
      asanaSkipped: true,
      asanaNote: `Artefact held by egress gate (${egressResult.verdict}): ${egressResult.reason ?? "compliance pre-check failed"}`,
    }, { status: 451, headers: gateHeaders });
  }

  // Wrap the Asana call in try-catch so a network failure returns a clean
  // JSON error instead of letting Next.js surface an unformatted 500.
  // 10s timeout matches screening-report so a hung api.asana.com can't burn
  // the whole 60s function budget.
  const ASANA_TIMEOUT_MS = 10_000;
  const asanaCtl = new AbortController();
  const asanaTimer = setTimeout(() => asanaCtl.abort(), ASANA_TIMEOUT_MS);
  let taskRes: Response;
  let asanaPayload: {
    data?: { gid?: string; permalink_url?: string };
    errors?: { message?: string }[];
  } | null;
  try {
    taskRes = await fetch("https://app.asana.com/api/1.0/tasks", {
      method: "POST",
      headers: {
        authorization: `Bearer ${token}`,
        "content-type": "application/json",
        accept: "application/json",
      },
      body: JSON.stringify({
        data: {
          name,
          notes: lines.join("\n"),
          projects: [projectGid],
          workspace: workspaceGid,
          assignee: asanaGids.assignee(),
          // UAE FDL 10/2025 Art.22 — STR/SAR must be submitted within 30 days
          // of forming suspicion. Set due_on so the MLRO inbox shows the
          // regulatory deadline and automated overdue alerts fire in time.
          due_on: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10),
        },
      }),
      signal: asanaCtl.signal,
    });
    asanaPayload = (await taskRes.json().catch((err: unknown) => {
      console.warn("[hawkeye] sar-report Asana response parse failed:", err);
      return null;
    })) as typeof asanaPayload;
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err);
    const _isAbort = err instanceof Error && (err.name === "AbortError" || asanaCtl.signal.aborted);
    console.error("[sar-report] Asana request failed:", detail);
    return NextResponse.json({
      ok: true,
      filingType: body.filingType,
      asanaSkipped: true,
      asanaNote: "Asana filing task creation failed — report generated successfully",
      reportText: lines.join("\n"),
      goaml: {
        internalReference: internalRef,
        validated: goamlValidationWarnings.length === 0,
        validationWarnings: goamlValidationWarnings,
        xmlBase64: goamlXml ? Buffer.from(goamlXml, "utf8").toString("base64") : null,
      },
    }, { headers: gateHeaders });
  } finally {
    clearTimeout(asanaTimer);
  }
  if (!taskRes.ok || !asanaPayload?.data?.gid) {
    return NextResponse.json({
      ok: true,
      filingType: body.filingType,
      asanaSkipped: true,
      asanaNote: `Asana rejected the filing (HTTP ${taskRes.status}): ${asanaPayload?.errors?.[0]?.message ?? "unknown error"}. Report generated successfully.`,
      reportText: lines.join("\n"),
      goaml: {
        internalReference: internalRef,
        validated: goamlValidationWarnings.length === 0,
        validationWarnings: goamlValidationWarnings,
        xmlBase64: goamlXml ? Buffer.from(goamlXml, "utf8").toString("base64") : null,
      },
    }, { headers: gateHeaders });
  }

  void postWebhook({
    type: "str.raised",
    subjectId: body.subject.id,
    subjectName: body.subject.name,
    ...(body.result?.severity ? { severity: body.result.severity } : {}),
    ...(body.result?.topScore != null ? { topScore: body.result.topScore } : {}),
    newHits: [],
    ...(asanaPayload.data.permalink_url
      ? { asanaTaskUrl: asanaPayload.data.permalink_url }
      : {}),
    generatedAt: now,
    source: "hawkeye-sterling",
  }).catch((err) => console.error("[sar-report] webhook failed", err));

  const latencyMs = Date.now() - _handlerStart;
  if (latencyMs > 5000) console.warn(`[generate_sar_report] latencyMs=${latencyMs} exceeds 5000ms`);
  return NextResponse.json({
    ok: true,
    filingType: body.filingType,
    taskGid: asanaPayload.data.gid,
    ...(asanaPayload.data.permalink_url
      ? { taskUrl: asanaPayload.data.permalink_url }
      : {}),
    goaml: {
      internalReference: internalRef,
      validated: goamlValidationWarnings.length === 0,
      validationWarnings: goamlValidationWarnings,
      // Base64-encode XML so JSON serialisation is safe regardless of content.
      xmlBase64: goamlXml ? Buffer.from(goamlXml, "utf8").toString("base64") : null,
    },
    latencyMs,
  }, { status: 201 , headers: gateHeaders });
  } catch (err) {
    console.error("[sar-report] unhandled exception:", err);
    return NextResponse.json({
      ok: false,
      errorCode: "HANDLER_EXCEPTION",
      errorType: "internal",
      tool: "generate_sar_report",
      message: "SAR generation failed — please retry or contact support",
      retryAfterSeconds: null,
      requestId: randomUUID(),
      latencyMs: Date.now() - _handlerStart,
    }, { status: 500 , headers: gateHeaders });
  }
}

export async function POST(req: Request) {
  const gate = await enforce(req);
  if (!gate.ok) return gate.response;
  const tenant = tenantIdFromGate(gate);
  return handleSarReport(req, gate.headers, tenant, gate.keyId);
}

function autoNarrative(body: Body): string {
  // UAE FIU requires SAR narratives to cover all 6 mandatory elements:
  // 1. What happened (suspicious transaction/behaviour)
  // 2. Why it is suspicious (specific indicators / typology links)
  // 3. Subject details (full name, ID, occupation, relationship to institution)
  // 4. Transaction details (amounts, dates, counterparties, accounts)
  // 5. Why the institution could not determine legitimacy (steps taken)
  // 6. Regulatory basis — FDL 10/2025 Art. 15 (reporting obligation)

  const parts: string[] = [];

  // ── 1. Subject details ─────────────────────────────────────────────────────
  const entityDesc = body.subject.entityType === "organisation"
    ? "legal entity"
    : (body.subject.entityType ?? "individual");
  const occupation = body.subjectOccupation ? ` (${body.subjectOccupation})` : "";
  const relationship = body.subjectRelationship
    ? ` The subject's relationship to the reporting institution is: ${body.subjectRelationship}.`
    : "";
  const aliases = body.subject.aliases?.length
    ? ` Known aliases: ${body.subject.aliases.join("; ")}.`
    : "";
  const dob = body.subject.dob ? ` Date of birth/registration: ${body.subject.dob}.` : "";
  const jurisdiction = body.subject.jurisdiction
    ? ` Jurisdiction: ${body.subject.jurisdiction}.`
    : "";
  parts.push(
    `SUBJECT DETAILS: ${body.subject.name}${occupation}, ${entityDesc}, ID: ${body.subject.id}.${aliases}${dob}${jurisdiction}${relationship}`,
  );

  // ── 2. What happened ───────────────────────────────────────────────────────
  const txDetails = body.transactionDetails;
  const amounts = txDetails?.amounts?.length
    ? `Amounts involved: ${txDetails.amounts.join(", ")}.`
    : "";
  const dates = txDetails?.dates?.length
    ? `Transaction date(s): ${txDetails.dates.join(", ")}.`
    : "";
  const counterparties = txDetails?.counterparties?.length
    ? `Counterparties: ${txDetails.counterparties.join(", ")}.`
    : "";
  const accounts = txDetails?.accounts?.length
    ? `Accounts/instruments involved: ${txDetails.accounts.join(", ")}.`
    : "";
  const instruments = txDetails?.instruments?.length
    ? `Payment instruments: ${txDetails.instruments.join(", ")}.`
    : "";

  if (amounts || dates || counterparties || accounts || instruments) {
    parts.push(
      `TRANSACTION DETAILS: ${[amounts, dates, counterparties, accounts, instruments].filter(Boolean).join(" ")}`,
    );
  } else if (body.result) {
    parts.push(
      `TRANSACTION DETAILS: Hawkeye Sterling automated screening flagged this subject with brain severity ${body.result.severity.toUpperCase()} (top score ${body.result.topScore}/100 across ${body.result.listsChecked} lists). Specific transaction amounts and dates are to be confirmed by the MLRO from case records.`,
    );
  }

  // ── 3. Why it is suspicious ────────────────────────────────────────────────
  const suspicionBits: string[] = [];
  if (body.result?.hits?.length) {
    const lists = Array.from(new Set(body.result.hits.map((h) => h.listId))).join(", ");
    const topHit = body.result.hits[0];
    suspicionBits.push(
      `The subject returned hits on the following sanctions/watchlist(s): ${lists}. Highest-scoring match: ${topHit?.candidateName ?? "—"} at ${Math.round((topHit?.score ?? 0) * 100)}% via ${topHit?.method ?? "—"}.`,
    );
  }
  if (body.superBrain?.pep && body.superBrain.pep.salience > 0) {
    const p = body.superBrain.pep;
    suspicionBits.push(
      `Subject identified as a Politically Exposed Person (PEP): ${p.type.replace(/_/g, " ")}, tier ${p.tier}, salience ${Math.round(p.salience * 100)}%.`,
    );
  }
  if (body.superBrain?.jurisdiction?.cahra) {
    suspicionBits.push(
      `Subject's jurisdiction (${body.superBrain.jurisdiction.name}, ${body.superBrain.jurisdiction.iso2}) is designated a Conflict-Affected and High-Risk Area (CAHRA).`,
    );
  }
  if (body.superBrain?.jurisdiction?.regimes?.length) {
    suspicionBits.push(
      `Active sanctions/regulatory regimes applicable: ${body.superBrain.jurisdiction.regimes.join(", ")}.`,
    );
  }
  if (body.superBrain?.adverseKeywordGroups?.length) {
    suspicionBits.push(
      `Adverse-media keyword groups fired: ${body.superBrain.adverseKeywordGroups.map((g) => g.label).join(", ")}.`,
    );
  }
  if (suspicionBits.length > 0) {
    parts.push(`BASIS FOR SUSPICION: ${suspicionBits.join(" ")}`);
  }

  // ── 4. FATF typology cross-reference ──────────────────────────────────────
  if (body.typologyName) {
    parts.push(
      `TYPOLOGY: This activity pattern is consistent with the FATF typology: ${body.typologyName}.`,
    );
  }

  // ── 5. Due diligence steps taken / why legitimacy could not be determined ──
  if (body.dueDiligenceStepsTaken?.length) {
    parts.push(
      `DUE DILIGENCE STEPS TAKEN: The reporting institution undertook the following steps to determine whether the activity had a legitimate explanation, without success: ${body.dueDiligenceStepsTaken.join("; ")}. The institution was unable to satisfy itself as to the legitimacy of the activity.`,
    );
  } else {
    parts.push(
      `DUE DILIGENCE STEPS TAKEN: The reporting institution applied its standard KYC/CDD procedures and constructive-knowledge standard (FDL 10/2025 Art. 2(3)). Despite these steps, the institution was unable to determine a legitimate basis for the activity described above.`,
    );
  }

  // ── 6. Regulatory basis ────────────────────────────────────────────────────
  parts.push(
    `REGULATORY BASIS: This report is filed pursuant to the obligation imposed on reporting entities under UAE Federal Decree-Law No. 10 of 2025 (FDL 10/2025) Art. 15 (reporting obligation). The reporting institution has reasonable grounds to suspect that the transactions constitute, or may constitute, money laundering, terrorist financing, or financing of illegal organisations. MLRO to review and confirm all details before goAML submission.`,
  );

  return parts.join("\n\n");
}
