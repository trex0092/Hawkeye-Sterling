import { NextResponse } from "next/server";
import { adminAuth } from "@/lib/server/admin-auth";
import { WORKSPACE_GIDS } from "@/lib/server/asana-workspace-map";

// Workspace-wide purge of attestation chart attachments (CCL-2026-025/026).
//
// Operator-instructed 2026-06-11: the status-card / summary-grid graphics
// introduced under CCL-2026-023 are removed from EVERY task on EVERY project.
// Deletes ONLY attachments whose filename matches the chart reference pattern
// (HS-ATT-… / HS-MAN-… .png); narrative stories, JSON case-report attachments
// and operator uploads are never candidates.
//
// Story residue (CCL-2026-026, operator screenshot 2026-06-11): deleting the
// PNGs leaves "inline attachment no longer available" placeholders in the
// comments that embedded them, and the inbox "Daily attestation summary …
// (graphic attached)" comments lose their only payload. The sweep therefore
// also — strictly limited to comments AUTHORED BY THIS TOKEN's user —
//   • deletes summary-carrier comments (text starts "📊 Daily attestation
//     summary — "), and
//   • strips dead <img data-asana-gid…> references out of narrative comments,
//     leaving the narrative text byte-for-byte intact.
// Operator comments and all other stories are never candidates.
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
const SUMMARY_STORY_PREFIX = "📊 Daily attestation summary — ";
const INLINE_IMG = /\s*<img[^>]*data-asana-gid[^>]*\/?>/g;
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

// Shared mutate-with-backoff: DELETE an object or PUT a story body.
// 404 counts as success (already gone); other 4xx is a definitive failure.
async function asanaMutate(
  token: string,
  url: string,
  method: "DELETE" | "PUT",
  data?: Record<string, unknown>,
): Promise<boolean> {
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    const res = await fetch(url, {
      method,
      headers: {
        ...authHeaders(token),
        ...(data ? { "content-type": "application/json" } : {}),
      },
      ...(data ? { body: JSON.stringify({ data }) } : {}),
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

function deleteAttachment(token: string, gid: string): Promise<boolean> {
  return asanaMutate(token, `${API}/attachments/${gid}`, "DELETE");
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
  /** Summary-carrier comments found / removed (text starts SUMMARY_STORY_PREFIX). */
  summaryStories: number;
  storiesDeleted: number;
  /** Narrative comments holding a dead inline-image reference / cleaned. */
  inlineImages: number;
  imagesStripped: number;
  failed: number;
  errors: string[];
}

interface AsanaStory {
  gid: string;
  type?: string;
  text?: string;
  html_text?: string;
  created_by?: { gid?: string };
}

// Processes one task's comments: drops summary carriers, strips dead inline
// images from narratives. Only stories authored by the token's own user (uid)
// are ever touched.
async function sweepTaskStories(
  token: string,
  uid: string,
  taskGid: string,
  mode: Mode,
  result: ProjectResult,
): Promise<void> {
  const stories = await listAll<AsanaStory>(
    token,
    `${API}/tasks/${taskGid}/stories?limit=100&opt_fields=type,text,html_text,created_by.gid`,
  );
  if (!stories) {
    result.failed++;
    result.errors.push(`stories_list_failed:${taskGid}`);
    return;
  }
  for (const story of stories) {
    if (story.type !== "comment" || story.created_by?.gid !== uid) continue;
    if ((story.text ?? "").startsWith(SUMMARY_STORY_PREFIX)) {
      result.summaryStories++;
      if (mode !== "purge") continue;
      if (await asanaMutate(token, `${API}/stories/${story.gid}`, "DELETE")) result.storiesDeleted++;
      else {
        result.failed++;
        result.errors.push(`story_delete_failed:${story.gid}`);
      }
      continue;
    }
    const html = story.html_text ?? "";
    if (!html.includes("data-asana-gid")) continue;
    const cleaned = html.replace(INLINE_IMG, "");
    if (cleaned === html) continue;
    result.inlineImages++;
    if (mode !== "purge") continue;
    if (await asanaMutate(token, `${API}/stories/${story.gid}`, "PUT", { html_text: cleaned })) {
      result.imagesStripped++;
    } else {
      result.failed++;
      result.errors.push(`story_update_failed:${story.gid}`);
    }
  }
}

async function sweepProject(token: string, uid: string, project: AsanaProject, mode: Mode): Promise<ProjectResult> {
  const result: ProjectResult = {
    projectGid: project.gid,
    name: project.name,
    tasksScanned: 0,
    matched: 0,
    deleted: 0,
    summaryStories: 0,
    storiesDeleted: 0,
    inlineImages: 0,
    imagesStripped: 0,
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
        if (mode === "purge") {
          for (const match of matches) {
            if (await deleteAttachment(token, match.gid)) result.deleted++;
            else {
              result.failed++;
              result.errors.push(`delete_failed:${match.gid}`);
            }
          }
        }
        await sweepTaskStories(token, uid, task.gid, mode, result);
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

  // Story cleanup may only touch comments this token authored — resolve the
  // token's own user once, fail closed if Asana won't tell us who we are.
  const me = await asanaGet<{ data?: { gid?: string } }>(token, `${API}/users/me`);
  const uid = me?.data?.gid;
  if (!uid) {
    return NextResponse.json({ ok: false, error: "asana_users_me_failed" }, { status: 502 });
  }

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
    results.push(await sweepProject(token, uid, project, mode));
  }

  const totals = results.reduce(
    (acc, r) => ({
      tasksScanned: acc.tasksScanned + r.tasksScanned,
      matched: acc.matched + r.matched,
      deleted: acc.deleted + r.deleted,
      summaryStories: acc.summaryStories + r.summaryStories,
      storiesDeleted: acc.storiesDeleted + r.storiesDeleted,
      inlineImages: acc.inlineImages + r.inlineImages,
      imagesStripped: acc.imagesStripped + r.imagesStripped,
      failed: acc.failed + r.failed,
    }),
    { tasksScanned: 0, matched: 0, deleted: 0, summaryStories: 0, storiesDeleted: 0, inlineImages: 0, imagesStripped: 0, failed: 0 },
  );

  // purge: residue that survived this pass; dryRun/verify: residue present
  // (chart files + summary-carrier comments + dead inline-image references).
  const remaining =
    mode === "purge"
      ? totals.matched - totals.deleted +
        (totals.summaryStories - totals.storiesDeleted) +
        (totals.inlineImages - totals.imagesStripped)
      : totals.matched + totals.summaryStories + totals.inlineImages;

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
