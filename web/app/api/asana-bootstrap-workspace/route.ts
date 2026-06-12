import { NextResponse } from "next/server";
import { enforce } from "@/lib/server/enforce";
import { writeAuditChainEntry } from "@/lib/server/audit-chain";
import { tenantIdFromGate } from "@/lib/server/tenant";
import {
  MODULE_BOARDS,
  INBOX_BOARD,
  DIGEST_BOARD,
  GROUP_META,
  boardName,
  boardColor,
  boardCharter,
  attestationTaskName,
  digestTaskName,
  WORKSPACE_GIDS,
  type ModuleBoard,
} from "@/lib/server/asana-workspace-map";

// Asana workspace bootstrap — builds the operator-approved 90-board
// topology (00 · Inbox + 88 module boards + HS · Modules digest) from the
// canonical map in lib/server/asana-workspace-map.ts.
//
// Modes (POST body):
//   { mode: "create", offset?, limit? }        — idempotently ensure a slice
//        of the 90 boards exists: project (name/colour/charter), workflow
//        sections, and the board's pinned attestation task. Re-runs skip
//        anything already present. Returns nextOffset until done.
//   { mode: "digest-tasks", offset?, limit? }  — idempotently ensure the
//        digest board carries one task per module board, filed under its
//        group section.
//   { mode: "export" }                          — read the live workspace and
//        return the full GID artifact for asana-workspace-gids.json.
//
// There is deliberately NO deletion capability in this endpoint: legacy
// projects outside the canonical map are unreachable by construction.

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

const API = "https://app.asana.com/api/1.0";
const TEAM_GID = process.env["ASANA_TEAM_GID"] ?? "1213645083721318";

function headers(token: string) {
  return { Authorization: `Bearer ${token}`, "Content-Type": "application/json", Accept: "application/json" };
}

function norm(name: string): string {
  return name.replace(/️/g, "").replace(/\s+/g, " ").trim();
}

async function asanaFetch<T>(
  token: string,
  path: string,
  init?: { method?: string; body?: unknown },
): Promise<T> {
  const MAX_ATTEMPTS = 5;
  for (let attempt = 1; ; attempt++) {
    const res = await fetch(`${API}${path}`, {
      method: init?.method ?? "GET",
      headers: headers(token),
      ...(init?.body !== undefined ? { body: JSON.stringify(init.body) } : {}),
      signal: AbortSignal.timeout(15_000),
    });
    if (res.ok) return (await res.json()) as T;
    const retryable = res.status === 429 || res.status >= 500;
    if (!retryable || attempt >= MAX_ATTEMPTS) {
      const detail = await res.text().catch(() => "");
      throw new Error(`asana ${init?.method ?? "GET"} ${path} → HTTP ${res.status} ${detail.slice(0, 200)}`);
    }
    const retryAfter = Number(res.headers.get("retry-after"));
    const waitMs = Number.isFinite(retryAfter) && retryAfter > 0
      ? retryAfter * 1000
      : Math.min(8000, 500 * 2 ** (attempt - 1));
    await new Promise((r) => setTimeout(r, waitMs));
  }
}

interface Named { gid: string; name: string }

async function listTeamProjects(token: string): Promise<Named[]> {
  const out: Named[] = [];
  let offset: string | undefined;
  do {
    const page = await asanaFetch<{ data: Named[]; next_page?: { offset: string } | null }>(
      token,
      `/teams/${TEAM_GID}/projects?limit=100&opt_fields=name${offset ? `&offset=${offset}` : ""}`,
    );
    out.push(...page.data);
    offset = page.next_page?.offset;
  } while (offset);
  return out;
}

async function listSections(token: string, projectGid: string): Promise<Named[]> {
  const res = await asanaFetch<{ data: Named[] }>(token, `/projects/${projectGid}/sections?limit=100`);
  return res.data;
}

async function listTasks(token: string, projectGid: string): Promise<Named[]> {
  const out: Named[] = [];
  let offset: string | undefined;
  do {
    const page = await asanaFetch<{ data: Named[]; next_page?: { offset: string } | null }>(
      token,
      `/projects/${projectGid}/tasks?limit=100&opt_fields=name${offset ? `&offset=${offset}` : ""}`,
    );
    out.push(...page.data);
    offset = page.next_page?.offset;
  } while (offset);
  return out;
}

async function ensureProject(
  token: string,
  existing: Named[],
  name: string,
  color: string,
  notes: string,
): Promise<{ gid: string; created: boolean }> {
  const found = existing.find((p) => norm(p.name) === norm(name));
  if (found) return { gid: found.gid, created: false };
  const res = await asanaFetch<{ data: { gid: string } }>(token, `/projects`, {
    method: "POST",
    body: { data: { name, color, notes, team: TEAM_GID, default_view: "list" } },
  });
  return { gid: res.data.gid, created: true };
}

async function ensureSections(
  token: string,
  projectGid: string,
  wanted: readonly string[],
): Promise<{ created: number; firstSectionGid: string | null; byName: Map<string, string> }> {
  const existing = await listSections(token, projectGid);
  const byNorm = new Map(existing.map((s) => [norm(s.name), s.gid]));
  let created = 0;
  for (const name of wanted) {
    if (byNorm.has(norm(name))) continue;
    const res = await asanaFetch<{ data: { gid: string } }>(token, `/projects/${projectGid}/sections`, {
      method: "POST",
      body: { data: { name } },
    });
    byNorm.set(norm(name), res.data.gid);
    created++;
  }
  const first = wanted.length > 0 ? byNorm.get(norm(wanted[0]!)) ?? null : null;
  return { created, firstSectionGid: first, byName: byNorm };
}

async function ensureTask(
  token: string,
  projectGid: string,
  existingTasks: Named[],
  name: string,
  notes: string,
  sectionGid: string | null,
): Promise<{ gid: string; created: boolean }> {
  const found = existingTasks.find((t) => norm(t.name) === norm(name));
  if (found) return { gid: found.gid, created: false };
  const res = await asanaFetch<{ data: { gid: string } }>(token, `/tasks`, {
    method: "POST",
    body: { data: { name, notes, projects: [projectGid] } },
  });
  if (sectionGid) {
    await asanaFetch(token, `/sections/${sectionGid}/addTask`, {
      method: "POST",
      body: { data: { task: res.data.gid } },
    }).catch(() => undefined); // placement is cosmetic — never fail the build on it
  }
  return { gid: res.data.gid, created: true };
}

const GOVERNANCE_TASK_NAME = "📌 WORKSPACE GOVERNANCE — READ FIRST";

function governanceTaskNotes(): string {
  return [
    "HAWKEYE STERLING — ASANA WORKSPACE GOVERNANCE",
    "",
    "TAXONOMY: 00 · Hawkeye Inbox (triage/catch-all) · 81 module boards numbered by platform",
    "group (1.xx Onboarding & CDD · 8.xx Screening, Monitoring & Reporting ·",
    "2.xx Risk & AML Ops · 3.xx Governance & Audit · 4.xx KYC Tools ·",
    "5.xx Intelligence; prefixes 6/7 retired) · HS · Modules — Daily Attestation (digest).",
    "",
    "CONVENTIONS: every board carries an audit-ready charter (description), a lifecycle",
    "section workflow, and a pinned 📌 Compliance Attestation task receiving the automated",
    "daily attestation at 06:00 UTC (10:00 Dubai) — FDL No.10/2025 Art.24.",
    "",
    "RETENTION: 5 yrs operational / 10 yrs AI decision records. Archive — never delete.",
    "",
    "CHANGE CONTROL: structural changes (boards, sections, numbering) require MLRO",
    "sign-off and an entry in docs/operations/CHANGE_CONTROL_LOG.md. The canonical",
    "definition lives in version control: web/lib/server/asana-workspace-map.ts.",
  ].join("\n");
}

// Build order: inbox, then the 88 module boards, then the digest project.
interface BoardJob {
  key: string;
  name: string;
  color: string;
  charter: string;
  sections: readonly string[];
  board?: ModuleBoard;
}

function allJobs(): BoardJob[] {
  return [
    { key: INBOX_BOARD.key, name: INBOX_BOARD.name, color: INBOX_BOARD.color, charter: INBOX_BOARD.charter, sections: INBOX_BOARD.sections },
    ...MODULE_BOARDS.map((b) => ({
      key: b.key, name: boardName(b), color: boardColor(b), charter: boardCharter(b), sections: b.sections, board: b,
    })),
    { key: DIGEST_BOARD.key, name: DIGEST_BOARD.name, color: DIGEST_BOARD.color, charter: DIGEST_BOARD.charter, sections: DIGEST_BOARD.sections },
  ];
}

export async function POST(req: Request): Promise<NextResponse> {
  const gate = await enforce(req);
  if (!gate.ok) return gate.response;

  const token = process.env["ASANA_TOKEN"];
  if (!token) {
    return NextResponse.json(
      { ok: false, error: "ASANA_TOKEN environment variable is not set." },
      { status: 503, headers: gate.headers },
    );
  }

  const body = (await req.json().catch(() => ({}))) as {
    mode?: string; offset?: number; limit?: number;
  };
  const mode = body.mode ?? "create";

  void writeAuditChainEntry(
    { event: "asana-bootstrap-workspace_invoked", actor: gate.keyId, mode },
    tenantIdFromGate(gate),
  ).catch(() => undefined);

  try {
    if (mode === "create") {
      const jobs = allJobs();
      const offset = Math.max(0, Number(body.offset) || 0);
      const limit = Math.min(10, Math.max(1, Number(body.limit) || 5));
      const slice = jobs.slice(offset, offset + limit);
      const teamProjects = await listTeamProjects(token);

      const processed: Array<Record<string, unknown>> = [];
      for (const job of slice) {
        const project = await ensureProject(token, teamProjects, job.name, job.color, job.charter);
        const sections = await ensureSections(token, project.gid, job.sections);
        let taskGid: string | undefined;
        let taskCreated = false;
        if (job.board) {
          const tasks = project.created ? [] : await listTasks(token, project.gid);
          const t = await ensureTask(
            token, project.gid, tasks,
            attestationTaskName(job.board),
            boardCharter(job.board),
            sections.firstSectionGid,
          );
          taskGid = t.gid; taskCreated = t.created;
        } else if (job.key === "inbox") {
          const tasks = project.created ? [] : await listTasks(token, project.gid);
          const t = await ensureTask(
            token, project.gid, tasks,
            GOVERNANCE_TASK_NAME,
            governanceTaskNotes(),
            sections.firstSectionGid,
          );
          taskGid = t.gid; taskCreated = t.created;
        }
        processed.push({
          key: job.key, name: job.name, projectGid: project.gid,
          projectCreated: project.created, sectionsCreated: sections.created,
          ...(taskGid ? { taskGid, taskCreated } : {}),
        });
      }
      const nextOffset = offset + limit < jobs.length ? offset + limit : null;
      return NextResponse.json(
        { ok: true, mode, total: jobs.length, offset, processed, nextOffset, done: nextOffset === null },
        { headers: gate.headers },
      );
    }

    if (mode === "digest-tasks") {
      const teamProjects = await listTeamProjects(token);
      const digest = teamProjects.find((p) => norm(p.name) === norm(DIGEST_BOARD.name));
      if (!digest) {
        return NextResponse.json(
          { ok: false, error: "digest_project_missing", detail: "Run mode:create first." },
          { status: 409, headers: gate.headers },
        );
      }
      const sections = await ensureSections(token, digest.gid, DIGEST_BOARD.sections);
      const existingTasks = await listTasks(token, digest.gid);
      const offset = Math.max(0, Number(body.offset) || 0);
      const limit = Math.min(25, Math.max(1, Number(body.limit) || 15));
      const slice = MODULE_BOARDS.slice(offset, offset + limit);
      const processed: Array<Record<string, unknown>> = [];
      for (const b of slice) {
        const sectionGid = sections.byName.get(norm(GROUP_META[b.group].title)) ?? null;
        const t = await ensureTask(token, digest.gid, existingTasks, digestTaskName(b), boardCharter(b), sectionGid);
        processed.push({ key: b.key, taskGid: t.gid, created: t.created });
      }
      const nextOffset = offset + limit < MODULE_BOARDS.length ? offset + limit : null;
      return NextResponse.json(
        { ok: true, mode, digestProjectGid: digest.gid, total: MODULE_BOARDS.length, offset, processed, nextOffset, done: nextOffset === null },
        { headers: gate.headers },
      );
    }

    // Sliced charter refresh (CCL-2026-023): PUTs each live board's
    // name + description from the canonical map so wording changes and
    // board renumbering (e.g. after the 2026-06-11 module retirements)
    // propagate to Asana. Idempotent; no deletions.
    if (mode === "refresh-charters") {
      const jobs = allJobs();
      const offset = Math.max(0, Number(body.offset) || 0);
      const limit = Math.min(20, Math.max(1, Number(body.limit) || 10));
      const slice = jobs.slice(offset, offset + limit);
      const refreshed: string[] = [];
      const failed: string[] = [];
      for (const job of slice) {
        const gid =
          job.key === INBOX_BOARD.key ? WORKSPACE_GIDS.inbox?.projectGid :
          job.key === DIGEST_BOARD.key ? WORKSPACE_GIDS.digest?.projectGid :
          WORKSPACE_GIDS.boards?.[job.key]?.projectGid;
        if (!gid) { failed.push(`${job.key}: no gid in artifact`); continue; }
        try {
          await asanaFetch(token, `/projects/${gid}`, {
            method: "PUT",
            body: { data: { name: job.name, notes: job.charter } },
          });
          // The pinned 📌 Compliance Attestation task carries the same
          // charter (including the NARRATIVE section) as its description —
          // keep it in lockstep so the task view matches the project charter.
          const attestationTaskGid = job.board
            ? WORKSPACE_GIDS.boards?.[job.key]?.attestationTaskGid
            : undefined;
          if (attestationTaskGid) {
            await asanaFetch(token, `/tasks/${attestationTaskGid}`, {
              method: "PUT",
              body: { data: { notes: job.charter } },
            });
          }
          refreshed.push(job.key);
        } catch (err) {
          failed.push(`${job.key}: ${err instanceof Error ? err.message : String(err)}`);
        }
      }
      const nextOffset = offset + limit < jobs.length ? offset + limit : null;
      return NextResponse.json(
        { ok: failed.length === 0, mode, offset, refreshed: refreshed.length, failed, total: jobs.length, nextOffset, done: nextOffset === null },
        { headers: gate.headers },
      );
    }

    if (mode === "export") {
      const teamProjects = await listTeamProjects(token);
      const byName = new Map(teamProjects.map((p) => [norm(p.name), p.gid]));
      const boards: Record<string, { projectGid: string; attestationTaskGid?: string }> = {};
      const missing: string[] = [];
      for (const b of MODULE_BOARDS) {
        const gid = byName.get(norm(boardName(b)));
        if (!gid) { missing.push(b.key); continue; }
        const tasks = await listTasks(token, gid);
        const att = tasks.find((t) => norm(t.name) === norm(attestationTaskName(b)));
        boards[b.key] = { projectGid: gid, ...(att ? { attestationTaskGid: att.gid } : {}) };
      }
      const inboxGid = byName.get(norm(INBOX_BOARD.name));
      let governanceTaskGid: string | undefined;
      if (inboxGid) {
        const tasks = await listTasks(token, inboxGid);
        governanceTaskGid = tasks.find((t) => norm(t.name) === norm(GOVERNANCE_TASK_NAME))?.gid;
      }
      const digestGid = byName.get(norm(DIGEST_BOARD.name));
      const digestTasks: Record<string, string> = {};
      if (digestGid) {
        const tasks = await listTasks(token, digestGid);
        const byTaskName = new Map(tasks.map((t) => [norm(t.name), t.gid]));
        for (const b of MODULE_BOARDS) {
          const gid = byTaskName.get(norm(digestTaskName(b)));
          if (gid) digestTasks[b.key] = gid;
        }
      }
      const artifact = {
        teamGid: TEAM_GID,
        ...(inboxGid ? { inbox: { projectGid: inboxGid, ...(governanceTaskGid ? { governanceTaskGid } : {}) } } : {}),
        ...(digestGid ? { digest: { projectGid: digestGid, tasks: digestTasks } } : {}),
        boards,
      };
      return NextResponse.json(
        { ok: missing.length === 0, missing, artifact },
        { headers: gate.headers },
      );
    }

    return NextResponse.json({ ok: false, error: "unknown_mode", mode }, { status: 400, headers: gate.headers });
  } catch (err) {
    console.error("[asana-bootstrap-workspace] failed:", err);
    return NextResponse.json(
      { ok: false, error: "bootstrap_failed", detail: err instanceof Error ? err.message : String(err) },
      { status: 502, headers: gate.headers },
    );
  }
}
