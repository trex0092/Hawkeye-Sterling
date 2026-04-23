import { NextResponse } from "next/server";
import { withGuard } from "@/lib/server/guard";
import { classifyEsg } from "@/lib/data/esg";
import { postWebhook } from "@/lib/server/webhook";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Luisa's Asana project — "01 · Screening - Sanctions & Adverse Media".
// Overridable via ASANA_PROJECT_GID / ASANA_WORKSPACE_GID env vars.
const DEFAULT_PROJECT_GID = "1214148660020527";
const DEFAULT_WORKSPACE_GID = "1213645083721316";

interface ReportHit {
  listId: string;
  listRef: string;
  candidateName: string;
  matchedAlias?: string;
  score: number;            // 0..1
  method: string;
  phoneticAgreement: boolean;
  programs?: string[];
  reason: string;
}

interface ReportBody {
  subject: {
    id: string;
    name: string;
    aliases?: string[];
    entityType?: string;
    jurisdiction?: string;
    group?: string;
    caseId?: string;
    ongoingScreening?: boolean;
  };
  result: {
    hits: ReportHit[];
    topScore: number;
    severity: string;
    listsChecked: number;
    candidatesChecked: number;
    durationMs: number;
    generatedAt: string;
  };
  trigger?: "screen" | "ongoing" | "save";
}

interface ApiResponse {
  ok: boolean;
  taskGid?: string;
  taskUrl?: string;
  error?: string;
  detail?: string;
}

function respond(status: number, body: ApiResponse): NextResponse {
  return NextResponse.json(body, { status });
}

function buildTaskName(b: ReportBody): string {
  const trigger = b.trigger === "ongoing" ? "[ONGOING]" : "[SCREEN]";
  const sev = b.result.severity.toUpperCase();
  const hits = b.result.hits.length;
  return `${trigger} ${sev} · ${b.subject.name} · ${hits} hit${hits === 1 ? "" : "s"} · top ${b.result.topScore}`;
}

function buildTaskNotes(b: ReportBody): string {
  const lines: string[] = [];
  lines.push(`Subject: ${b.subject.name}`);
  if (b.subject.aliases?.length) lines.push(`Aliases: ${b.subject.aliases.join("; ")}`);
  lines.push(`Subject ID: ${b.subject.id}`);
  if (b.subject.caseId) lines.push(`Case ID: ${b.subject.caseId}`);
  if (b.subject.group) lines.push(`Group: ${b.subject.group}`);
  lines.push(`Type: ${b.subject.entityType ?? "—"}`);
  lines.push(`Jurisdiction: ${b.subject.jurisdiction ?? "—"}`);
  lines.push(`Ongoing screening: ${b.subject.ongoingScreening ? "ON" : "OFF"}`);
  lines.push("");
  lines.push("── Brain verdict ──");
  lines.push(`Severity: ${b.result.severity.toUpperCase()}`);
  lines.push(`Top score: ${b.result.topScore} / 100`);
  lines.push(
    `Lists checked: ${b.result.listsChecked} · Candidates: ${b.result.candidatesChecked} · ${b.result.durationMs}ms`,
  );
  lines.push(`Generated: ${b.result.generatedAt}`);
  lines.push("");
  if (b.result.hits.length === 0) {
    lines.push("No matches above the 82% threshold.");
  } else {
    lines.push(`── Hits (${b.result.hits.length}) ──`);
    for (const h of b.result.hits) {
      const pct = Math.round(h.score * 100);
      lines.push(
        `• [${h.listId}] ${h.candidateName} — ${pct}% (${h.method})${h.phoneticAgreement ? " · phonetic" : ""}`,
      );
      lines.push(`    ref: ${h.listRef}`);
      if (h.matchedAlias) lines.push(`    matched alias: ${h.matchedAlias}`);
      if (h.programs?.length) lines.push(`    programs: ${h.programs.join(", ")}`);
      lines.push(`    reason: ${h.reason}`);
    }
  }
  // ── ESG signals (SASB · EU Taxonomy · UN SDGs) ─────────────
  const esgText = [b.subject.name, ...(b.subject.aliases ?? [])].join(" ");
  const esg = classifyEsg(esgText);
  if (esg.length > 0) {
    lines.push("");
    lines.push(`── ESG signals (${esg.length}) ──`);
    for (const e of esg) {
      const frameworks: string[] = [];
      if (e.sasb) frameworks.push(`SASB:${e.sasb}`);
      if (e.euTaxonomy) frameworks.push(`EU-Tax:${e.euTaxonomy}`);
      if (e.sdg?.length) frameworks.push(`SDG:${e.sdg.join(",")}`);
      lines.push(`• [${e.domain}] ${e.label} — "${e.keyword}"`);
      if (frameworks.length) lines.push(`    ${frameworks.join(" · ")}`);
    }
  }

  lines.push("");
  lines.push("Source: Hawkeye Sterling — https://hawkeye-sterling.netlify.app");
  return lines.join("\n");
}

async function handleScreeningReport(req: Request): Promise<NextResponse> {
  const token = process.env["ASANA_TOKEN"];
  if (!token) {
    return respond(503, {
      ok: false,
      error: "asana not configured",
      detail:
        "Set ASANA_TOKEN (Personal Access Token) in Netlify env vars for the hawkeye-sterling site.",
    });
  }

  let body: ReportBody;
  try {
    body = (await req.json()) as ReportBody;
  } catch {
    return respond(400, { ok: false, error: "invalid JSON body" });
  }
  if (!body?.subject?.name || !body?.result) {
    return respond(400, { ok: false, error: "subject.name and result are required" });
  }

  const name = buildTaskName(body);
  const notes = buildTaskNotes(body);

  try {
    const asanaRes = await fetch("https://app.asana.com/api/1.0/tasks", {
      method: "POST",
      headers: {
        authorization: `Bearer ${token}`,
        "content-type": "application/json",
        accept: "application/json",
      },
      body: JSON.stringify({
        data: {
          name,
          notes,
          projects: [process.env["ASANA_PROJECT_GID"] ?? DEFAULT_PROJECT_GID],
          workspace: process.env["ASANA_WORKSPACE_GID"] ?? DEFAULT_WORKSPACE_GID,
        },
      }),
    });
    const payload = (await asanaRes.json().catch(() => null)) as
      | { data?: { gid?: string; permalink_url?: string }; errors?: { message?: string }[] }
      | null;
    if (!asanaRes.ok || !payload?.data?.gid) {
      const msg = payload?.errors?.[0]?.message ?? `HTTP ${asanaRes.status}`;
      return respond(502, {
        ok: false,
        error: "asana rejected the task",
        detail: msg,
      });
    }
    // Fire an outbound webhook in parallel. Delivery is fire-and-forget —
    // the screening UI shouldn't block on external systems.
    void postWebhook({
      type:
        body.trigger === "ongoing"
          ? "screening.delta"
          : "screening.completed",
      subjectId: body.subject.id,
      subjectName: body.subject.name,
      severity: body.result.severity,
      topScore: body.result.topScore,
      newHits: body.result.hits.slice(0, 10).map((h) => ({
        listId: h.listId,
        listRef: h.listRef,
        candidateName: h.candidateName,
      })),
      ...(payload.data.permalink_url ? { asanaTaskUrl: payload.data.permalink_url } : {}),
      generatedAt: body.result.generatedAt,
      source: "hawkeye-sterling",
    });
    return respond(200, {
      ok: true,
      taskGid: payload.data.gid,
      ...(payload.data.permalink_url ? { taskUrl: payload.data.permalink_url } : {}),
    });
  } catch (err) {
    return respond(500, {
      ok: false,
      error: "asana request failed",
      detail: err instanceof Error ? err.message : String(err),
    });
  }
}

export const POST = withGuard(handleScreeningReport);
