import { NextResponse } from "next/server";
import { withGuard } from "@/lib/server/guard";
import { postWebhook } from "@/lib/server/webhook";
import { serialiseGoamlXml } from "../../../../dist/src/integrations/goaml-xml.js";
import { validateGoamlEnvelope } from "../../../../dist/src/brain/goaml-shapes.js";
import type { GoAmlEnvelope, GoAmlPerson, GoAmlEntity, GoAmlReportCode } from "../../../../dist/src/brain/goaml-shapes.js";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

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

// Phrases that constitute tipping-off under FDL 10/2025 Art.29
const TIPPING_OFF_PATTERNS = [
  /\byou\s+are\s+(being\s+)?investigated\b/i,
  /\bSTR\s+has\s+been\s+filed\b/i,
  /\bsuspicious\s+transaction\s+report\b/i,
  /\bwe\s+have\s+reported\s+you\b/i,
  /\bauthorities\s+have\s+been\s+notified\b/i,
  /\bFIU\s+has\s+been\s+informed\b/i,
  /\bgoAML\s+filing\b/i,
  /\banti.?money\s+laundering\s+investigation\b/i,
  /\byour\s+account.{0,30}(suspended|blocked|flagged)\b/i,
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
}

async function handleSarReport(req: Request): Promise<NextResponse> {
  const token = process.env["ASANA_TOKEN"];
  if (!token) {
    return NextResponse.json(
      { ok: false, error: "ASANA_TOKEN not set" },
      { status: 503 },
    );
  }

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

  const rentityId = process.env["GOAML_RENTITY_ID"] ?? "HWK-REPORTING-ENTITY";
  const mlroEmail = process.env["MLRO_EMAIL"] ?? "mlro@hawkeye-sterling.com";
  const mlroPhone = process.env["MLRO_PHONE"] ?? "+971-4-000-0000";

  const envelope: GoAmlEnvelope = {
    reportCode,
    rentityId,
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

  // Validate the envelope before serialising.
  const validationErrors = validateGoamlEnvelope(envelope);
  let goamlXml = "";
  let goamlValidationWarnings: string[] = [];
  try {
    goamlXml = serialiseGoamlXml(envelope);
    goamlValidationWarnings = validationErrors;
  } catch (xmlErr) {
    goamlValidationWarnings = [
      `XML serialisation failed: ${xmlErr instanceof Error ? xmlErr.message : String(xmlErr)}`,
      ...validationErrors,
    ];
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

  // Wrap the Asana call in try-catch so a network failure returns a clean
  // JSON error instead of letting Next.js surface an unformatted 500.
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
    });
    asanaPayload = (await taskRes.json().catch(() => null)) as typeof asanaPayload;
  } catch (err) {
    return NextResponse.json(
      {
        ok: false,
        error: "asana request failed",
        detail: err instanceof Error ? err.message : String(err),
      },
      { status: 502 },
    );
  }
  if (!taskRes.ok || !asanaPayload?.data?.gid) {
    // Asana returns 4xx on validation failures (bad GID, bad token,
    // missing scope) and 5xx on their-side incidents. Mirror that in
    // our status code so monitoring/alerting gets the right signal:
    // 502 Bad Gateway for an upstream outage, 503 for a misconfig on
    // our side. 4xx responses from Asana surface as 422 (we passed a
    // bad payload) so clients know not to retry.
    const upstreamStatus = taskRes.status;
    const mappedStatus =
      upstreamStatus >= 500 ? 502 : upstreamStatus === 401 || upstreamStatus === 403 ? 503 : 422;
    return NextResponse.json(
      {
        ok: false,
        error: "asana rejected the filing",
        detail: asanaPayload?.errors?.[0]?.message ?? `HTTP ${upstreamStatus}`,
      },
      { status: mappedStatus },
    );
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
