// POST /api/admin/asana-structure-sync
//
// One-shot live reconciliation of the Asana workspace to the canonical map
// (web/lib/server/asana-workspace-map.ts), built for the 2026-06-12 sidebar
// regroup (new groups 6 · SANCTIONS & NAME MATCH and 7 · FIU REPORTING ·
// GOAML, Ongoing Monitor → Customer/Supplier Monitoring). Modeled on
// /api/admin/purge-bra: Bearer ADMIN_TOKEN auth (fail closed), raw Asana
// fetch with the server's ASANA_TOKEN, one append-only audit-chain entry,
// same response shape conventions.
//
// What it reconciles, idempotently, keyed by the stable board keys in
// asana-workspace-gids.json (gids are unchanged by the restructure):
//   a. every module board project — name (boardName) + color (boardColor);
//      this also heals pre-existing number drift left by the goaml/dpmsr
//      board removals;
//   b. every board's pinned 📌 attestation task name (attestationTaskName);
//   c. every digest task name (digestTaskName);
//   d. digest sections — creates missing group-title sections in sidebar
//      order (insert_after chaining) and moves any digest task sitting in
//      the wrong group section (covers the 5 moved boards).
//
// Body: { confirm: "SYNC-ASANA-STRUCTURE", dryRun?: true }. With dryRun the
// endpoint computes and returns the change plan WITHOUT applying anything.
// Individual Asana failures are collected per item in errors[] — never
// silently swallowed. Safe to re-run: already-correct items are skipped, so
// a timed-out run picks up where it left off.

import { NextResponse } from "next/server";
import { writeAuditChainEntry } from "@/lib/server/audit-chain";
import {
  MODULE_BOARDS,
  GROUP_META,
  DIGEST_BOARD,
  boardName,
  boardColor,
  attestationTaskName,
  digestTaskName,
  WORKSPACE_GIDS,
} from "@/lib/server/asana-workspace-map";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

const API = "https://app.asana.com/api/1.0";
const CONFIRM_PHRASE = "SYNC-ASANA-STRUCTURE";

async function timingSafeTokenCheck(got: string, expected: string): Promise<boolean> {
  const { createHmac, timingSafeEqual } = await import("node:crypto");
  const COMPARE_KEY = Buffer.from("hawkeye-token-compare-v1", "utf8");
  const ha = createHmac("sha256", COMPARE_KEY).update(expected).digest();
  const hb = createHmac("sha256", COMPARE_KEY).update(got).digest();
  return timingSafeEqual(ha, hb);
}

// Same name normalisation the bootstrap endpoint uses — Asana strips/keeps
// emoji variation selectors inconsistently; never rename over that alone.
function norm(name: string): string {
  return name.replace(/️/g, "").replace(/\s+/g, " ").trim();
}

async function asana<T>(
  token: string,
  path: string,
  init?: { method?: string; body?: unknown },
): Promise<T> {
  const MAX_ATTEMPTS = 4;
  for (let attempt = 1; ; attempt++) {
    const res = await fetch(`${API}${path}`, {
      method: init?.method ?? "GET",
      headers: {
        authorization: `Bearer ${token}`,
        "content-type": "application/json",
        accept: "application/json",
      },
      ...(init?.body !== undefined ? { body: JSON.stringify(init.body) } : {}),
      signal: AbortSignal.timeout(15_000),
    });
    if (res.ok) return (await res.json()) as T;
    const retryable = res.status === 429 || res.status >= 500;
    if (!retryable || attempt >= MAX_ATTEMPTS) {
      const detail = await res.text().catch(() => "");
      throw new Error(
        `asana ${init?.method ?? "GET"} ${path} → HTTP ${res.status}${detail ? ` ${detail.slice(0, 160)}` : ""}`,
      );
    }
    const retryAfter = Number(res.headers.get("retry-after"));
    const waitMs = Number.isFinite(retryAfter) && retryAfter > 0
      ? retryAfter * 1000
      : Math.min(8000, 500 * 2 ** (attempt - 1));
    await new Promise((r) => setTimeout(r, waitMs));
  }
}

type ActionKind =
  | "rename-project"
  | "rename-attestation-task"
  | "rename-digest-task"
  | "create-digest-section"
  | "move-digest-task";

interface SyncAction {
  kind: ActionKind;
  key?: string; // board key (absent for create-digest-section)
  gid?: string; // target gid (absent until a planned section is created)
  detail: string;
  apply: () => Promise<void>;
}

export async function POST(req: Request): Promise<NextResponse> {
  // Auth — fail closed (purge-bra pattern).
  const expected = process.env["ADMIN_TOKEN"];
  if (!expected) {
    return NextResponse.json(
      { ok: false, error: "ADMIN_TOKEN not configured" },
      { status: 503 },
    );
  }
  const got = req.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ?? "";
  if (!got || !(await timingSafeTokenCheck(got, expected))) {
    return NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 });
  }

  const body = (await req.json().catch(() => ({}))) as { confirm?: string; dryRun?: boolean };
  if (body.confirm !== CONFIRM_PHRASE) {
    return NextResponse.json(
      { ok: false, error: "confirmation_required", hint: `POST { "confirm": "${CONFIRM_PHRASE}" } to run (add "dryRun": true to preview).` },
      { status: 400 },
    );
  }
  const dryRun = body.dryRun === true;

  // Asana token — fail closed.
  const token = process.env["ASANA_TOKEN"];
  if (!token) {
    return NextResponse.json(
      { ok: false, error: "ASANA_TOKEN not configured" },
      { status: 503 },
    );
  }

  const triggeredAt = new Date().toISOString();
  const actions: SyncAction[] = [];
  const errors: string[] = [];
  let skippedAlreadyCorrect = 0;

  // ── a. + b. Module board projects and their attestation tasks. ──
  for (const b of MODULE_BOARDS) {
    const gids = WORKSPACE_GIDS.boards?.[b.key];
    if (!gids?.projectGid) {
      errors.push(`${b.key}: no projectGid in asana-workspace-gids.json`);
    } else {
      const projectGid = gids.projectGid;
      try {
        const proj = await asana<{ data: { name: string; color: string | null } }>(
          token,
          `/projects/${projectGid}?opt_fields=name,color`,
        );
        const wantName = boardName(b);
        const wantColor = boardColor(b);
        const nameDiff = norm(proj.data.name) !== norm(wantName);
        const colorDiff = (proj.data.color ?? "") !== wantColor;
        if (nameDiff || colorDiff) {
          const parts = [
            ...(nameDiff ? [`name "${proj.data.name}" → "${wantName}"`] : []),
            ...(colorDiff ? [`color "${proj.data.color ?? "none"}" → "${wantColor}"`] : []),
          ];
          actions.push({
            kind: "rename-project",
            key: b.key,
            gid: projectGid,
            detail: parts.join("; "),
            apply: () =>
              asana(token, `/projects/${projectGid}`, {
                method: "PUT",
                body: {
                  data: {
                    ...(nameDiff ? { name: wantName } : {}),
                    ...(colorDiff ? { color: wantColor } : {}),
                  },
                },
              }),
          });
        } else {
          skippedAlreadyCorrect++;
        }
      } catch (err) {
        errors.push(`${b.key} project ${projectGid}: ${err instanceof Error ? err.message : String(err)}`);
      }
    }

    const attGid = gids?.attestationTaskGid;
    if (!attGid) {
      errors.push(`${b.key}: no attestationTaskGid in asana-workspace-gids.json`);
      continue;
    }
    try {
      const task = await asana<{ data: { name: string } }>(token, `/tasks/${attGid}?opt_fields=name`);
      const wantName = attestationTaskName(b);
      if (norm(task.data.name) !== norm(wantName)) {
        actions.push({
          kind: "rename-attestation-task",
          key: b.key,
          gid: attGid,
          detail: `"${task.data.name}" → "${wantName}"`,
          apply: () =>
            asana(token, `/tasks/${attGid}`, { method: "PUT", body: { data: { name: wantName } } }),
        });
      } else {
        skippedAlreadyCorrect++;
      }
    } catch (err) {
      errors.push(`${b.key} attestation task ${attGid}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  // ── d-part-1. Digest sections — ensure one per group title, sidebar order. ──
  // sectionGidByTitle is shared with the move closures below; planned (not yet
  // created) sections register their gid here when their create action runs.
  const digestGid = WORKSPACE_GIDS.digest?.projectGid;
  const sectionGidByTitle = new Map<string, string>();
  if (!digestGid) {
    errors.push("digest: no projectGid in asana-workspace-gids.json — section + digest-task sync skipped");
  } else {
    try {
      const sections = await asana<{ data: Array<{ gid: string; name: string }> }>(
        token,
        `/projects/${digestGid}/sections?limit=100`,
      );
      for (const s of sections.data) sectionGidByTitle.set(norm(s.name), s.gid);
      // Chain in canonical order: each missing section is inserted after its
      // predecessor's gid (known live, or resolved after the previous create).
      let prevTitle: string | null = null;
      for (const title of DIGEST_BOARD.sections) {
        if (sectionGidByTitle.has(norm(title))) {
          skippedAlreadyCorrect++;
          prevTitle = title;
          continue;
        }
        const afterTitle = prevTitle;
        actions.push({
          kind: "create-digest-section",
          detail: `create section "${title}"${afterTitle ? ` after "${afterTitle}"` : ""}`,
          apply: async () => {
            const insertAfter = afterTitle ? sectionGidByTitle.get(norm(afterTitle)) : undefined;
            const res = await asana<{ data: { gid: string } }>(
              token,
              `/projects/${digestGid}/sections`,
              { method: "POST", body: { data: { name: title, ...(insertAfter ? { insert_after: insertAfter } : {}) } } },
            );
            sectionGidByTitle.set(norm(title), res.data.gid);
          },
        });
        prevTitle = title;
      }
    } catch (err) {
      errors.push(`digest sections: ${err instanceof Error ? err.message : String(err)}`);
    }

    // ── c. + d-part-2. Digest task names and group-section placement. ──
    for (const b of MODULE_BOARDS) {
      const taskGid = WORKSPACE_GIDS.digest?.tasks?.[b.key];
      if (!taskGid) {
        errors.push(`${b.key}: no digest task gid in asana-workspace-gids.json`);
        continue;
      }
      try {
        const task = await asana<{
          data: {
            name: string;
            memberships?: Array<{ project?: { gid: string }; section?: { gid: string; name: string } }>;
          };
        }>(
          token,
          `/tasks/${taskGid}?opt_fields=name,memberships.project.gid,memberships.section.gid,memberships.section.name`,
        );
        const wantName = digestTaskName(b);
        if (norm(task.data.name) !== norm(wantName)) {
          actions.push({
            kind: "rename-digest-task",
            key: b.key,
            gid: taskGid,
            detail: `"${task.data.name}" → "${wantName}"`,
            apply: () =>
              asana(token, `/tasks/${taskGid}`, { method: "PUT", body: { data: { name: wantName } } }),
          });
        } else {
          skippedAlreadyCorrect++;
        }

        const wantSection = GROUP_META[b.group].title;
        const current = task.data.memberships?.find((m) => m.project?.gid === digestGid)?.section;
        if (current && norm(current.name) === norm(wantSection)) {
          skippedAlreadyCorrect++;
        } else {
          actions.push({
            kind: "move-digest-task",
            key: b.key,
            gid: taskGid,
            detail: `section "${current?.name ?? "(none)"}" → "${wantSection}"`,
            apply: async () => {
              const sectionGid = sectionGidByTitle.get(norm(wantSection));
              if (!sectionGid) throw new Error(`section "${wantSection}" not found in digest project`);
              await asana(token, `/sections/${sectionGid}/addTask`, {
                method: "POST",
                body: { data: { task: taskGid } },
              });
            },
          });
        }
      } catch (err) {
        errors.push(`${b.key} digest task ${taskGid}: ${err instanceof Error ? err.message : String(err)}`);
      }
    }
  }

  // ── Apply (unless dryRun). Sections are created before task moves —
  //    actions[] already holds create-digest-section entries ahead of
  //    move-digest-task entries, and renames are order-independent. ──
  const applied: Record<ActionKind, number> = {
    "rename-project": 0,
    "rename-attestation-task": 0,
    "rename-digest-task": 0,
    "create-digest-section": 0,
    "move-digest-task": 0,
  };
  const ordered = [...actions].sort(
    (a, z) => Number(z.kind === "create-digest-section") - Number(a.kind === "create-digest-section"),
  );
  if (!dryRun) {
    for (const action of ordered) {
      try {
        await action.apply();
        applied[action.kind]++;
      } catch (err) {
        errors.push(
          `${action.kind}${action.key ? ` ${action.key}` : ""}: ${err instanceof Error ? err.message : String(err)}`,
        );
      }
    }
  }

  const planned: Record<ActionKind, number> = {
    "rename-project": 0,
    "rename-attestation-task": 0,
    "rename-digest-task": 0,
    "create-digest-section": 0,
    "move-digest-task": 0,
  };
  for (const a of actions) planned[a.kind]++;
  const effective = dryRun ? planned : applied;
  const counts = {
    renamedProjects: effective["rename-project"],
    renamedTasks: effective["rename-attestation-task"] + effective["rename-digest-task"],
    sectionsCreated: effective["create-digest-section"],
    tasksMoved: effective["move-digest-task"],
    skippedAlreadyCorrect,
  };
  const ok = errors.length === 0;

  // One audit-chain entry summarising the sync (purge-bra tenant pattern).
  void writeAuditChainEntry(
    {
      event: "asana.structure_synced",
      actor: "admin",
      triggeredAt,
      dryRun,
      ...counts,
      plannedActions: actions.length,
      errorCount: errors.length,
      ok,
    },
    process.env["DEFAULT_TENANT"] ?? "default",
  ).catch((err) =>
    console.warn(
      "[asana-structure-sync] audit chain write failed:",
      err instanceof Error ? err.message : String(err),
    ),
  );

  return NextResponse.json({
    ok,
    dryRun,
    triggeredAt,
    counts,
    plan: actions.map(({ kind, key, gid, detail }) => ({ kind, ...(key ? { key } : {}), ...(gid ? { gid } : {}), detail })),
    errors,
    hint: dryRun
      ? "Dry run — change plan computed, nothing applied. Re-POST without dryRun to apply."
      : ok
        ? "Asana workspace structure reconciled to the canonical map. Idempotent — re-running reports skippedAlreadyCorrect only."
        : "Partial failure — see errors[]; re-run to retry failed items (already-correct items are skipped).",
  });
}
