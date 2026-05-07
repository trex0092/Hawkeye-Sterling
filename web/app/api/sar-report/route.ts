import { NextResponse } from "next/server";
import { withGuard } from "@/lib/server/guard";
import { postWebhook } from "@/lib/server/webhook";
import { getEntity } from "@/lib/config/entities";
import { serialiseGoamlXml } from "../../../../dist/src/integrations/goaml-xml.js";
import { validateGoamlEnvelope } from "../../../../dist/src/brain/goaml-shapes.js";
import type { GoAmlEnvelope, GoAmlPerson, GoAmlEntity, GoAmlReportCode } from "../../../../dist/src/brain/goaml-shapes.js";
import {
  buildHtmlDoc,
  hsCover,
  hsPage,
  hsFinis,
  hsTable,
  hsKvGrid,
  hsNarrative,
  hsSeverityCell,
  type CoverData,
} from "@/lib/reportHtml";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

// Luisa's SAR/STR board — "05 · STR/SAR/CTR/PMR GoAML Filings".
// Overridable via ASANA_SAR_PROJECT_GID / ASANA_ASSIGNEE_GID env vars.
const DEFAULT_SAR_PROJECT_GID = "1214148631336502";
const DEFAULT_WORKSPACE_GID   = "1213645083721316";
const DEFAULT_ASSIGNEE_GID    = "1213645083721304"; // Luisa Fernanda — primary MLRO

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
  /\byour\s+account.{0,40}(?:suspend|block|freez|flag|hold|restrict|escalat)/i,
  /\b(?:suspended|blocked|frozen|flagged|on hold|restricted)\s+(?:due to|because of|pending)\s+(?:AML|compliance|investigation|review|suspicion)/i,
  // Circumvention phrasings — "between you and me", "off the record"
  /\b(?:off\s+the\s+record|between\s+you\s+and\s+me|don'?t\s+tell\s+anyone).{0,80}\b(?:STR|SAR|FIU|investigat|report|fil)/i,
  /\bI\s+shouldn'?t\s+(?:tell|say)\s+you.{0,80}\b(?:STR|SAR|FIU|investigat|report|fil)/i,
];

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
}

async function handleSarReport(req: Request): Promise<Response> {
  const token = process.env["ASANA_TOKEN"];
  const asanaEnabled = !!token;

  let body: Body;
  try {
    body = (await req.json()) as Body;
  } catch {
    return NextResponse.json({ ok: false, error: "invalid JSON" }, { status: 400 });
  }
  if (!body?.subject?.name || !body?.filingType) {
    return NextResponse.json(
      { ok: false, error: "subject and filingType are required" },
      { status: 400 },
    );
  }

  // Server-side tipping-off check — FDL 10/2025 Art.29
  if (body.narrative) {
    const tipOff = checkTippingOff(body.narrative);
    if (tipOff) {
      return NextResponse.json(
        { ok: false, error: "tipping_off_detected", detail: `Narrative contains potential tipping-off language (pattern: ${tipOff}). Remove the disclosure before filing.` },
        { status: 422 },
      );
    }
  }

  // Four-eyes gate — approver must be set and differ from filer
  const mlro = body.mlro ?? "Luisa Fernanda";
  if (!body.approver?.trim()) {
    return NextResponse.json(
      { ok: false, error: "four_eyes_required", detail: "A second approver (four-eyes) is required before this filing can proceed." },
      { status: 422 },
    );
  }
  if (body.approver.trim().toLowerCase() === mlro.trim().toLowerCase()) {
    return NextResponse.json(
      { ok: false, error: "four_eyes_same_person", detail: "The approver must be a different person from the MLRO filing this report." },
      { status: 422 },
    );
  }

  const projectGid =
    process.env["ASANA_SAR_PROJECT_GID"] ?? DEFAULT_SAR_PROJECT_GID;
  const workspaceGid =
    process.env["ASANA_WORKSPACE_GID"] ?? DEFAULT_WORKSPACE_GID;
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
      { status: 422 },
    );
  }

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
      module: `MODULE · ${body.filingType} FILING`,
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
          { k: "Country", v: `${body.superBrain.jurisdiction.name} (${body.superBrain.jurisdiction.iso2})${body.superBrain.jurisdiction.cahra ? " · CAHRA" : ""}` },
          { k: "Active regimes", v: (body.superBrain.jurisdiction.regimes ?? []).join(", ") || "—" },
        ])}
      ` : ""}
      ${body.superBrain?.pep && body.superBrain.pep.salience > 0 ? `
        <h2 class="hs-section-h">PEP</h2>
        ${hsKvGrid([
          { k: "Type", v: body.superBrain.pep.type.replace(/_/g, " ") },
          { k: "Tier", v: body.superBrain.pep.tier },
          { k: "Salience", v: `${Math.round(body.superBrain.pep.salience * 100)}%` },
        ])}
      ` : ""}
      ${body.superBrain?.adverseKeywordGroups?.length ? `
        <h2 class="hs-section-h">Adverse-media groups</h2>
        <ul class="hs-findings">${body.superBrain.adverseKeywordGroups.map((g) => `<li>${g.label} (${g.count})</li>`).join("")}</ul>
      ` : ""}
    `;

    const narrativePage = `
      <h2 class="hs-section-h" style="margin-top:0">Narrative (MLRO review required)</h2>
      <p class="hs-narrative">${narrative.replace(/\n/g, "</p><p class='hs-narrative'>")}</p>
      <h2 class="hs-section-h" style="margin-top:14px">goAML envelope</h2>
      ${hsKvGrid([
        { k: "Internal reference", v: internalRef },
        { k: "Report code", v: body.filingType },
        { k: "Reporting entity ID", v: reportingEntity.goamlRentityId },
        { k: "Validation", v: goamlValidationWarnings.length === 0 ? "PASSED" : `${goamlValidationWarnings.length} warnings` },
      ])}
      ${goamlValidationWarnings.length > 0 ? `
        <p class="hs-narrative" style="color:#b45309"><strong>Validation warnings:</strong></p>
        <ul class="hs-findings">${goamlValidationWarnings.map((w) => `<li>${w}</li>`).join("")}</ul>
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
        "content-type": "text/html; charset=utf-8",
        "content-disposition": `inline; filename="hawkeye-${body.filingType.toLowerCase()}-${body.subject.id}.html"`,
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
    });
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
          assignee: process.env["ASANA_ASSIGNEE_GID"] ?? DEFAULT_ASSIGNEE_GID,
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
    const isAbort = err instanceof Error && (err.name === "AbortError" || asanaCtl.signal.aborted);
    return NextResponse.json({
      ok: true,
      filingType: body.filingType,
      asanaSkipped: true,
      asanaNote: `Asana request ${isAbort ? `timed out after ${ASANA_TIMEOUT_MS}ms` : "failed"}: ${detail}. Report generated successfully.`,
      reportText: lines.join("\n"),
      goaml: {
        internalReference: internalRef,
        validated: goamlValidationWarnings.length === 0,
        validationWarnings: goamlValidationWarnings,
        xmlBase64: goamlXml ? Buffer.from(goamlXml, "utf8").toString("base64") : null,
      },
    });
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
    });
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
  }, { status: 201 });
}

export const POST = withGuard(handleSarReport);

function autoNarrative(body: Body): string {
  const bits: string[] = [];
  bits.push(
    `Hawkeye Sterling flagged ${body.subject.name} (${body.subject.id}) as requiring a ${body.filingType} filing.`,
  );
  if (body.result) {
    bits.push(
      `Brain severity ${body.result.severity.toUpperCase()} · top score ${body.result.topScore}/100 across ${body.result.listsChecked} lists.`,
    );
  }
  if (body.result?.hits?.length) {
    const lists = Array.from(new Set(body.result.hits.map((h) => h.listId))).join(", ");
    bits.push(`Hits on: ${lists}.`);
  }
  if (body.superBrain?.jurisdiction?.cahra) {
    bits.push(`Jurisdiction flagged CAHRA.`);
  }
  if (body.superBrain?.adverseKeywordGroups?.length) {
    bits.push(
      `Adverse-media groups fired: ${body.superBrain.adverseKeywordGroups.map((g) => g.label).join(", ")}.`,
    );
  }
  bits.push(
    `Constructive-knowledge standard (FDL 10/2025 Art.2(3)) assessed; MLRO to confirm before goAML submission.`,
  );
  return bits.join(" ");
}
