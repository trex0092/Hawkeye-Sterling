import { NextResponse } from "next/server";
import { postWebhook } from "@/lib/server/webhook";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Luisa's SAR/STR board — "05 · STR/SAR/CTR/PMR GoAML Filings".
// Overridable via ASANA_SAR_PROJECT_GID.
const DEFAULT_SAR_PROJECT_GID = "1214148631336502";
const DEFAULT_WORKSPACE_GID = "1213645083721316";

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

export async function POST(req: Request): Promise<NextResponse> {
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

  const projectGid =
    process.env["ASANA_SAR_PROJECT_GID"] ?? DEFAULT_SAR_PROJECT_GID;
  const workspaceGid =
    process.env["ASANA_WORKSPACE_GID"] ?? DEFAULT_WORKSPACE_GID;
  const mlro = body.mlro ?? "Luisa Fernanda";
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

  lines.push("");
  lines.push("── goAML envelope (stub) ──");
  lines.push(`report_code           : ${body.filingType}`);
  lines.push(`entity_reference      : HWK-${body.filingType}-${body.subject.id}`);
  lines.push(
    `reason                : ${body.narrative ?? "[auto-drafted — MLRO to review]"}`,
  );
  if (body.subject.entityType === "individual") {
    lines.push(`t_person.name         : ${body.subject.name}`);
    if (body.subject.dob) lines.push(`t_person.dob          : ${body.subject.dob}`);
    if (body.subject.jurisdiction)
      lines.push(`t_person.nationality  : ${body.subject.jurisdiction}`);
  } else {
    lines.push(`t_entity.name         : ${body.subject.name}`);
    if (body.subject.jurisdiction)
      lines.push(`t_entity.incorp_ctry  : ${body.subject.jurisdiction}`);
  }

  lines.push("");
  lines.push(
    "Legal basis: FDL 10/2025 Art.26-27 · Art.29 (tipping-off) · Art.24 (10-yr retention) · Cabinet Res 134/2025 Art.18",
  );
  lines.push("Source: Hawkeye Sterling — https://hawkeye-sterling.netlify.app");

  const taskRes = await fetch("https://app.asana.com/api/1.0/tasks", {
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
      },
    }),
  });
  const asanaPayload = (await taskRes.json().catch(() => null)) as
    | { data?: { gid?: string; permalink_url?: string }; errors?: { message?: string }[] }
    | null;
  if (!taskRes.ok || !asanaPayload?.data?.gid) {
    return NextResponse.json(
      {
        ok: false,
        error: "asana rejected the filing",
        detail: asanaPayload?.errors?.[0]?.message ?? `HTTP ${taskRes.status}`,
      },
      { status: 502 },
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
  });

  return NextResponse.json({
    ok: true,
    filingType: body.filingType,
    taskGid: asanaPayload.data.gid,
    ...(asanaPayload.data.permalink_url
      ? { taskUrl: asanaPayload.data.permalink_url }
      : {}),
  });
}

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
