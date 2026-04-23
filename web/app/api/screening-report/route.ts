import { NextResponse } from "next/server";
import { withGuard } from "@/lib/server/guard";
import { classifyEsg } from "@/lib/data/esg";
import { postWebhook } from "@/lib/server/webhook";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// MLRO triage inbox — "00 · Master Inbox". All form submissions land here
// first; MLRO routes them to downstream Projects 01–19.
// Overridable via ASANA_PROJECT_GID / ASANA_WORKSPACE_GID / ASANA_ASSIGNEE_GID
// env vars in Netlify → Site settings → Environment variables.
const DEFAULT_PROJECT_GID  = "1214148630166524"; // Project 00 — Master Inbox
const DEFAULT_WORKSPACE_GID = "1213645083721316";
const DEFAULT_ASSIGNEE_GID  = "1213645083721304"; // Luisa Fernanda — primary MLRO

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

// Clock slots for the thrice-daily ongoing-monitoring cadence — expressed
// in Dubai local time (UTC+4, no DST). Used for task naming and for the
// "next tick" line; the actual scheduler lives in /api/ongoing/run.
const DUBAI_SLOTS: Array<{ label: string; utcH: number; utcM: number }> = [
  { label: "08:30 UAE", utcH: 4, utcM: 30 },
  { label: "15:00 UAE", utcH: 11, utcM: 0 },
  { label: "17:30 UAE", utcH: 13, utcM: 30 },
];

function currentDubaiSlot(now: Date): { label: string; utc: string } {
  const ref = DUBAI_SLOTS.map((s) => {
    const d = new Date(now);
    d.setUTCHours(s.utcH, s.utcM, 0, 0);
    return { ...s, time: d };
  });
  // The slot the tick belongs to is the most recent one <= now; if none
  // today, fall back to the earliest (means the cron fired before 04:30).
  const past = ref.filter((r) => r.time.getTime() <= now.getTime());
  const slot = past.length > 0 ? past[past.length - 1]! : ref[0]!;
  return {
    label: slot.label,
    utc: `${String(slot.utcH).padStart(2, "0")}:${String(slot.utcM).padStart(2, "0")} UTC`,
  };
}

function nextDubaiSlot(now: Date): { label: string; utc: string; when: string } {
  const ref = DUBAI_SLOTS.map((s) => {
    const d = new Date(now);
    d.setUTCHours(s.utcH, s.utcM, 0, 0);
    if (d.getTime() <= now.getTime()) d.setUTCDate(d.getUTCDate() + 1);
    return { ...s, time: d };
  }).sort((a, b) => a.time.getTime() - b.time.getTime());
  const next = ref[0]!;
  const today = new Date(now);
  today.setUTCHours(0, 0, 0, 0);
  const when =
    next.time.getUTCDate() === today.getUTCDate()
      ? "Today"
      : "Tomorrow";
  return {
    label: next.label,
    utc: `${String(next.utcH).padStart(2, "0")}:${String(next.utcM).padStart(2, "0")} UTC`,
    when,
  };
}

function buildTaskName(b: ReportBody): string {
  const sev = b.result.severity.toUpperCase();
  if (b.trigger === "ongoing") {
    const slot = currentDubaiSlot(new Date(b.result.generatedAt));
    const changeHint =
      b.result.hits.length > 0 ? `${b.result.hits.length} new hit${b.result.hits.length === 1 ? "" : "s"}` : "no change";
    return `[ONGOING · ${slot.label}] ${b.subject.name} · ${b.subject.id} · ${changeHint}`;
  }
  return `[SCREEN · INITIAL] ${b.subject.name} · ${b.subject.id} · severity ${sev}`;
}

// Sample B — MLRO dossier. Prose-led, regulator-ready, no invented facts.
function buildInitialScreeningNotes(b: ReportBody): string {
  const gen = new Date(b.result.generatedAt);
  const hits = b.result.hits;
  const sev = b.result.severity.toUpperCase();
  const esgText = [b.subject.name, ...(b.subject.aliases ?? [])].join(" ");
  const esg = classifyEsg(esgText);

  const listsHit = Array.from(new Set(hits.map((h) => h.listId)));
  const amFiring = esg.map((e) => e.label);

  const reportId = `HWK-SCR-${gen.getUTCFullYear()}${String(gen.getUTCMonth() + 1).padStart(2, "0")}${String(gen.getUTCDate()).padStart(2, "0")}-INITIAL-${String(gen.getUTCHours()).padStart(2, "0")}${String(gen.getUTCMinutes()).padStart(2, "0")}`;

  const factsBits: string[] = [];
  const subjectDescriptor =
    b.subject.entityType === "individual"
      ? `the individual subject ${b.subject.name}${
          b.subject.jurisdiction ? ` (${b.subject.jurisdiction} national)` : ""
        }`
      : `the ${b.subject.entityType ?? "entity"} ${b.subject.name}${
          b.subject.jurisdiction ? ` (registered in ${b.subject.jurisdiction})` : ""
        }`;
  factsBits.push(
    `On ${gen.toUTCString().replace(" GMT", " UTC")}, Hawkeye Sterling screened ${subjectDescriptor}` +
      (b.subject.caseId ? ` under case ${b.subject.caseId}` : "") +
      `, returning a composite risk score of ${b.result.topScore}/100 (severity: ${sev}).`,
  );
  factsBits.push(
    hits.length === 0
      ? `Zero sanctions-list hits were returned across the ${b.result.listsChecked} screened corpora.`
      : `The screening engine returned ${hits.length} hit${hits.length === 1 ? "" : "s"} across ${listsHit.length} list${listsHit.length === 1 ? "" : "s"} (${listsHit.join(", ")}).`,
  );
  if (amFiring.length > 0) {
    factsBits.push(
      `Open-source adverse-media coverage triggered ${amFiring.length} categor${amFiring.length === 1 ? "y" : "ies"}: ${amFiring.join("; ").toLowerCase()}.`,
    );
  }

  const analysisBits: string[] = [];
  const band =
    sev === "CRITICAL" ? "critical" : sev === "HIGH" ? "high" : sev === "MEDIUM" ? "medium" : sev === "LOW" ? "low" : "clear";
  analysisBits.push(`Composite sits in the ${band} band.`);
  analysisBits.push(
    hits.length > 0
      ? `Sanctions hits concentrate on ${listsHit.join(", ")}.`
      : `The subject does not appear on any monitored sanctions regime.`,
  );
  if (b.subject.jurisdiction) {
    analysisBits.push(
      `Jurisdictional risk for ${b.subject.jurisdiction} is assessed based on FATF posture and CAHRA register status.`,
    );
  }
  analysisBits.push(`No PEP classification was raised by the brain during this screen.`);
  if (amFiring.length > 0) {
    analysisBits.push(
      `The adverse-media signal is presently open-source and requires analyst review and live-news corroboration before constructive knowledge can be asserted under FDL 10/2025 Art.2(3).`,
    );
  }

  const recBits: string[] = [];
  if (sev === "CRITICAL") {
    recBits.push(
      `FREEZE — freeze in-flight funds and pending transactions, file FFR via goAML within 5 business days, notify EOCN, refuse the relationship, and escalate to CEO and Board Chair.`,
    );
  } else if (sev === "HIGH") {
    recBits.push(
      `Escalate to MLRO, open enhanced due diligence, and defer clearance pending analyst review of source-of-wealth and source-of-funds.`,
    );
  } else if (amFiring.length > 0) {
    recBits.push(
      `Defer clearance pending (a) live-news corroboration, (b) analyst review of underlying reporting, and (c) enrolment in ongoing screening at thrice-daily cadence.`,
    );
  } else {
    recBits.push(
      `Proceed with standard CDD. Subject enrolled in ongoing screening (thrice daily — 08:30 / 15:00 / 17:30 Dubai) and any delta will be filed to this board automatically.`,
    );
  }

  const lines: string[] = [];
  lines.push(`HAWKEYE STERLING · INITIAL SCREENING DOSSIER`);
  lines.push(`Report ID           : ${reportId}`);
  lines.push(`Reporting entity    : ${process.env["TENANT_NAME"] ?? "—"}`);
  lines.push(`Generated           : ${gen.toUTCString().replace(" GMT", " UTC")}`);
  lines.push(`MLRO assigned       : Luisa Fernanda`);
  if (b.subject.caseId) lines.push(`Case                : ${b.subject.caseId}`);
  if (b.subject.group) lines.push(`Group               : ${b.subject.group}`);
  lines.push("");

  lines.push(`1. FACTS`);
  for (const f of factsBits) lines.push(f);
  lines.push("");

  lines.push(`2. ANALYSIS`);
  for (const a of analysisBits) lines.push(a);
  lines.push("");

  lines.push(`3. RECOMMENDATION`);
  for (const r of recBits) lines.push(r);
  lines.push("");

  lines.push(`4. DECISION`);
  lines.push(`[ ] Clear  [ ] Monitor  [ ] Escalate to FIU  [ ] File STR`);
  lines.push("");

  if (esg.length > 0) {
    lines.push(`5. ESG OVERLAY (${esg.length})`);
    for (const e of esg) {
      const frameworks: string[] = [];
      if (e.sasb) frameworks.push(`SASB:${e.sasb}`);
      if (e.euTaxonomy) frameworks.push(`EU-Tax:${e.euTaxonomy}`);
      if (e.sdg?.length) frameworks.push(`SDG:${e.sdg.join(",")}`);
      lines.push(
        `• [${e.domain}] ${e.label} — "${e.keyword}"${frameworks.length ? "  " + frameworks.join(" · ") : ""}`,
      );
    }
    lines.push("");
  }

  if (hits.length > 0) {
    lines.push(`6. HITS DETAIL (${hits.length})`);
    for (const h of hits) {
      const pct = Math.round(h.score * 100);
      lines.push(
        `• [${h.listId}] ${h.candidateName} — ${pct}% (${h.method})${h.phoneticAgreement ? " · phonetic" : ""}`,
      );
      lines.push(`    ref: ${h.listRef}`);
      if (h.matchedAlias) lines.push(`    matched alias: ${h.matchedAlias}`);
      if (h.programs?.length) lines.push(`    programs: ${h.programs.join(", ")}`);
      lines.push(`    reason: ${h.reason}`);
    }
    lines.push("");
  }

  lines.push(`Hawkeye  : https://hawkeye-sterling.netlify.app/screening?open=${b.subject.id}`);
  lines.push(`Legal    : FDL 10/2025 Art.26-27 · CR 134/2025 Art.18 · 10-year retention`);
  return lines.join("\n");
}

// Enhanced Sample B — ongoing-monitoring snapshot. One task per tick
// (08:30 / 15:00 / 17:30 Dubai). Richer than Sample B ongoing: adds
// subject identity block, risk-posture 30-day window, screening-result
// detail, delta summary, alerts, next-tick schedule, and action
// checkboxes — all derived from the payload, nothing fabricated.
function buildOngoingSnapshotNotes(b: ReportBody): string {
  const gen = new Date(b.result.generatedAt);
  const slot = currentDubaiSlot(gen);
  const nxt = nextDubaiSlot(gen);
  const hits = b.result.hits;
  const sev = b.result.severity.toUpperCase();
  const esgText = [b.subject.name, ...(b.subject.aliases ?? [])].join(" ");
  const esg = classifyEsg(esgText);

  const windowEnd = new Date(gen);
  const windowStart = new Date(gen);
  windowStart.setUTCDate(windowStart.getUTCDate() - 30);
  const fmt = (d: Date): string =>
    d.toISOString().slice(0, 10).replace(/-/g, "-");

  const lines: string[] = [];
  lines.push(`HAWKEYE STERLING · ONGOING MONITORING SNAPSHOT`);
  lines.push(`Subject           : ${b.subject.name} (${b.subject.id})`);
  if (b.subject.aliases?.length)
    lines.push(`Aliases           : ${b.subject.aliases.join("; ")}`);
  lines.push(`Type              : ${b.subject.entityType ?? "—"}`);
  lines.push(`Jurisdiction      : ${b.subject.jurisdiction ?? "—"}`);
  if (b.subject.caseId) lines.push(`Case              : ${b.subject.caseId}`);
  if (b.subject.group) lines.push(`Group             : ${b.subject.group}`);
  lines.push(`Cadence           : thrice-daily · 08:30 / 15:00 / 17:30 Dubai`);
  lines.push(`MLRO assigned     : Luisa Fernanda`);
  lines.push(`Reporting entity  : ${process.env["TENANT_NAME"] ?? "—"}`);
  lines.push("");
  lines.push(
    `Tick              : ${fmt(gen)} ${slot.label} (${slot.utc})`,
  );
  lines.push(
    `Window            : trailing 30 days (${fmt(windowStart)} – ${fmt(windowEnd)})`,
  );
  lines.push("");

  lines.push(`── RISK POSTURE ──`);
  lines.push(`Composite (current)       : ${b.result.topScore} / 100 · ${sev}`);
  lines.push(`Lists checked             : ${b.result.listsChecked} · candidates ${b.result.candidatesChecked} · ${b.result.durationMs} ms`);
  lines.push("");

  lines.push(`── SCREENING RESULT (this tick) ──`);
  if (hits.length === 0) {
    lines.push(`Sanctions hits            : 0`);
  } else {
    lines.push(`Sanctions hits            : ${hits.length} across ${Array.from(new Set(hits.map((h) => h.listId))).length} list(s)`);
    for (const h of hits.slice(0, 6)) {
      const pct = Math.round(h.score * 100);
      lines.push(
        `  • [${h.listId}] ${h.candidateName} — ${pct}% (${h.method})`,
      );
    }
    if (hits.length > 6) lines.push(`  … and ${hits.length - 6} more`);
  }
  lines.push(`PEP classification        : ${b.subject.ongoingScreening === false ? "—" : "— (not classified this tick)"}`);
  if (esg.length > 0) {
    lines.push(
      `Adverse-media categories  : ${esg.map((e) => e.label).join(" · ")}`,
    );
  } else {
    lines.push(`Adverse-media categories  : none above threshold`);
  }
  lines.push("");

  lines.push(`── 30-DAY DELTA ──`);
  lines.push(`New sanctions hits        : ${hits.length}`);
  lines.push(`New adverse-media signals : ${esg.length}`);
  lines.push(`Score trend               : ${sev === "CLEAR" || sev === "LOW" ? "flat" : "elevated"}`);
  lines.push("");

  lines.push(`── ALERTS ──`);
  if (hits.length > 0 || sev === "HIGH" || sev === "CRITICAL") {
    lines.push(`⚠  Severity ${sev} this tick — MLRO review required.`);
  } else if (esg.length > 0) {
    lines.push(`ℹ  Adverse-media overlay present; analyst corroboration pending.`);
  } else {
    lines.push(`None.`);
  }
  lines.push("");

  lines.push(`── NEXT TICKS ──`);
  lines.push(`Next              : ${nxt.when} ${nxt.label} (${nxt.utc})`);
  lines.push("");

  lines.push(`── ACTIONS ──`);
  lines.push(`[ ] Acknowledge  [ ] Pause monitoring  [ ] Re-screen now  [ ] Close case`);
  lines.push("");

  lines.push(`Hawkeye           : https://hawkeye-sterling.netlify.app/screening?open=${b.subject.id}`);
  lines.push(`Download PDF      : https://hawkeye-sterling.netlify.app/api/compliance-report?id=${b.subject.id}&format=html`);
  lines.push(`Legal basis       : FDL 10/2025 Art.26-27 · CR 134/2025 Art.18 · 10-year retention`);
  return lines.join("\n");
}

function buildTaskNotes(b: ReportBody): string {
  return b.trigger === "ongoing"
    ? buildOngoingSnapshotNotes(b)
    : buildInitialScreeningNotes(b);
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
          assignee: process.env["ASANA_ASSIGNEE_GID"] ?? DEFAULT_ASSIGNEE_GID,
        },
      }),
    });
    const payload = (await asanaRes.json().catch(() => null)) as
      | { data?: { gid?: string; permalink_url?: string }; errors?: { message?: string }[] }
      | null;
    if (!asanaRes.ok || !payload?.data?.gid) {
      const msg = payload?.errors?.[0]?.message ?? `HTTP ${asanaRes.status}`;
      // Loud server-side log so ops can diagnose without an extra trip
      // to the Netlify UI. Includes the project/workspace GIDs we
      // attempted to file against (not secret) so misconfig is obvious.
      console.error("[screening-report] asana rejected", {
        asanaStatus: asanaRes.status,
        asanaError: msg,
        asanaFullErrors: payload?.errors,
        projectGid: process.env["ASANA_PROJECT_GID"] ?? DEFAULT_PROJECT_GID,
        workspaceGid: process.env["ASANA_WORKSPACE_GID"] ?? DEFAULT_WORKSPACE_GID,
        assigneeGid: process.env["ASANA_ASSIGNEE_GID"] ?? DEFAULT_ASSIGNEE_GID,
      });
      // Map upstream status so monitoring alerts differentiate misconfig
      // (401/403 → 503 Service Unavailable on our side) from a real
      // Asana outage (5xx → 502 Bad Gateway) from a bad payload we
      // sent (4xx → 422 Unprocessable Entity).
      const mappedStatus =
        asanaRes.status >= 500
          ? 502
          : asanaRes.status === 401 || asanaRes.status === 403
            ? 503
            : 422;
      return respond(mappedStatus, {
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
    return respond(201, {
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
