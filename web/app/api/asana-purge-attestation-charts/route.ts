import { NextResponse } from "next/server";
import { adminAuth } from "@/lib/server/admin-auth";
import { WORKSPACE_GIDS } from "@/lib/server/asana-workspace-map";

// Workspace-wide purge of attestation chart attachments (CCL-2026-025).
//
// Operator-instructed 2026-06-11: the status-card / summary-grid graphics
// introduced under CCL-2026-023 are removed from EVERY task on EVERY project.
// Deletes ONLY attachments whose filename matches the chart reference pattern
// (HS-ATT-… / HS-MAN-… .png); narrative stories, JSON case-report attachments
// and operator uploads are never candidates.
//
// Modes (POST body { mode?: "purge" | "dryRun" | "verify" }):
//   purge  (default) — delete every matching attachment.
//   dryRun           — scan and report matches per project; delete nothing.
//   verify           — same scan, run after the purge as the proof that zero
//                      matches remain anywhere in the workspace.
//
// Coverage: every project in the Asana team (GET /teams/{gid}/projects) — all
// module boards, 00 · Inbox, the digest AND legacy projects — falling back to
// the committed GID artifact only when team listing is unavailable. Optional
// { offset, limit } slice the project list so each invocation stays inside the
// function budget; loop nextOffset until it disappears. Any listing or delete
// failure is reported per project and flips ok:false so the operator re-runs —
// the sweep never silently skips a task. Idempotent and re-runnable.
//
// Auth: adminAuth (ADMIN_TOKEN bearer or admin portal session) — the same gate
// as the other destructive Asana maintenance route, asana-full-reset.

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

const API = "https://app.asana.com/api/1.0";
const CHART_NAME = /^HS-(ATT|MAN)-\d{4}-\d{2}-\d{2}-.+\.png$/i;
const MAX_ATTEMPTS = 5;

type Mode = "purge" | "dryRun" | "verify";

function authHeaders(token: string) {
  return { authorization: `Bearer ${token}`, accept: "application/json" };
}

async function delay(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

// GET with the same 429/5xx retry-and-backoff discipline as the attestation
// poster (Retry-After honoured). Returns null on definitive failure.
async function asanaGet<T>(token: string, url: string): Promise<T | null> {
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    const res = await fetch(url, {
      headers: authHeaders(token),
      signal: AbortSignal.timeout(15_000),
    }).catch(() => null);
    if (res?.ok) return (await res.json()) as T;
    if (res && res.status !== 429 && res.status < 500) return null;
    if (attempt === MAX_ATTEMPTS) return null;
    const retryAfter = Number(res?.headers.get("retry-after")) || 0;
    await delay(Math.max(retryAfter * 1000, 500 * 2 ** (attempt - 1)));
  }
  return null;
}

interface AsanaPage<T> {
  data: T[];
  next_page?: { uri?: string } | null;
}

// Drains an Asana collection across pages. Null (not a partial list) on any
// page failure so callers record the gap instead of under-reporting.
async function listAll<T>(token: string, firstUrl: string): Promise<T[] | null> {
  const out: T[] = [];
  let url: string | null = firstUrl;
  while (url) {
    const page: AsanaPage<T> | null = await asanaGet<AsanaPage<T>>(token, url);
    if (!page) return null;
    out.push(...page.data);
    url = page.next_page?.uri ?? null;
  }
  return out;
}

async function deleteAttachment(token: string, gid: string): Promise<boolean> {
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    const res = await fetch(`${API}/attachments/${gid}`, {
      method: "DELETE",
      headers: authHeaders(token),
      signal: AbortSignal.timeout(10_000),
    }).catch(() => null);
    if (res?.ok || res?.status === 404) return true;
    if (res && res.status !== 429 && res.status < 500) return false;
    if (attempt === MAX_ATTEMPTS) return false;
    const retryAfter = Number(res?.headers.get("retry-after")) || 0;
    await delay(Math.max(retryAfter * 1000, 500 * 2 ** (attempt - 1)));
  }
  return false;
}

interface AsanaProject {
  gid: string;
  name: string;
}

async function listTeamProjects(token: string): Promise<AsanaProject[] | null> {
  const teamGid = WORKSPACE_GIDS.teamGid;
  if (!teamGid) return null;
  return listAll<AsanaProject>(token, `${API}/teams/${teamGid}/projects?limit=100&opt_fields=name`);
}

function fallbackProjects(): AsanaProject[] {
  const out: AsanaProject[] = [];
  const inbox = WORKSPACE_GIDS.inbox?.projectGid;
  if (inbox) out.push({ gid: inbox, name: "00 · Hawkeye Inbox — Master Landing" });
  const digest = WORKSPACE_GIDS.digest?.projectGid;
  if (digest) out.push({ gid: digest, name: "HS · Modules — Daily Attestation" });
  for (const [key, board] of Object.entries(WORKSPACE_GIDS.boards ?? {})) {
    if (board.projectGid) out.push({ gid: board.projectGid, name: key });
  }
  return out;
}

interface ProjectResult {
  projectGid: string;
  name: string;
  tasksScanned: number;
  matched: number;
  deleted: number;
  failed: number;
  errors: string[];
}

async function sweepProject(token: string, project: AsanaProject, mode: Mode): Promise<ProjectResult> {
  const result: ProjectResult = {
    projectGid: project.gid,
    name: project.name,
    tasksScanned: 0,
    matched: 0,
    deleted: 0,
    failed: 0,
    errors: [],
  };

  const tasks = await listAll<{ gid: string }>(
    token,
    `${API}/projects/${project.gid}/tasks?limit=100&opt_fields=gid`,
  );
  if (!tasks) {
    result.failed++;
    result.errors.push("task_list_failed");
    return result;
  }

  const CHUNK = 5;
  for (let i = 0; i < tasks.length; i += CHUNK) {
    const chunk = tasks.slice(i, i + CHUNK);
    await Promise.all(
      chunk.map(async (task) => {
        const attachments = await listAll<{ gid: string; name?: string }>(
          token,
          `${API}/tasks/${task.gid}/attachments?limit=100&opt_fields=name`,
        );
        if (!attachments) {
          result.failed++;
          result.errors.push(`attachments_list_failed:${task.gid}`);
          return;
        }
        result.tasksScanned++;
        const matches = attachments.filter((a) => CHART_NAME.test(a.name ?? ""));
        result.matched += matches.length;
        if (mode !== "purge") return;
        for (const match of matches) {
          if (await deleteAttachment(token, match.gid)) result.deleted++;
          else {
            result.failed++;
            result.errors.push(`delete_failed:${match.gid}`);
          }
        }
      }),
    );
    if (i + CHUNK < tasks.length) await delay(200);
  }
  return result;
}

export async function POST(req: Request): Promise<NextResponse> {
  const deny = adminAuth(req);
  if (deny) return deny;

  const token = process.env["ASANA_TOKEN"];
  if (!token) {
    return NextResponse.json({ ok: false, error: "ASANA_TOKEN not configured." }, { status: 503 });
  }

  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const mode: Mode = body["mode"] === "dryRun" ? "dryRun" : body["mode"] === "verify" ? "verify" : "purge";

  let source = "team";
  let projects = await listTeamProjects(token);
  if (!projects || projects.length === 0) {
    projects = fallbackProjects();
    source = "gid-artifact";
  }
  if (projects.length === 0) {
    return NextResponse.json({ ok: false, error: "no_projects_resolved" }, { status: 500 });
  }

  const offset = Math.max(0, Number(body["offset"]) || 0);
  const limit = Math.min(projects.length, Math.max(1, Number(body["limit"]) || 30));
  const slice = projects.slice(offset, offset + limit);

  const results: ProjectResult[] = [];
  for (const project of slice) {
    results.push(await sweepProject(token, project, mode));
  }

  const totals = results.reduce(
    (acc, r) => ({
      tasksScanned: acc.tasksScanned + r.tasksScanned,
      matched: acc.matched + r.matched,
      deleted: acc.deleted + r.deleted,
      failed: acc.failed + r.failed,
    }),
    { tasksScanned: 0, matched: 0, deleted: 0, failed: 0 },
  );

  // purge: matched-but-undeleted charts; dryRun/verify: charts still present.
  const remaining = mode === "purge" ? totals.matched - totals.deleted : totals.matched;

  return NextResponse.json({
    ok: totals.failed === 0 && (mode === "verify" ? remaining === 0 : true),
    mode,
    source,
    projectsTotal: projects.length,
    projectsScanned: slice.length,
    ...totals,
    remaining,
    results: results.map((r) => ({ ...r, errors: r.errors.slice(0, 10) })),
    ...(offset + limit < projects.length ? { nextOffset: offset + limit } : {}),
  });
}
