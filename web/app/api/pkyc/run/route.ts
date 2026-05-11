// POST /api/pkyc/run       — trigger a pKYC run (all due subjects)
// POST /api/pkyc/run?id=X  — force-run a specific subject immediately
//
// For each due subject:
//   1. Run quick_screen via internal /api/quick-screen
//   2. Run super_brain via internal /api/super-brain
//   3. Diff against last known state
//   4. If material change → mark status=pending_review, write delta blob
//   5. Update subject record with new band, composite, nextRunAt
//
// Controls: 3.01 (ongoing monitoring), 3.04 (periodic review trigger), 21.08

import { NextResponse } from "next/server";
import { withGuard } from "@/lib/server/guard";
import {
  listSubjects, getSubject, saveSubject,
  type PKycSubject, type PKycRiskBand, type PKycDelta,
} from "../_store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const BASE_URL =
  process.env.URL ??
  process.env.DEPLOY_PRIME_URL ??
  "http://localhost:3000";

const ADMIN_TOKEN = process.env.ADMIN_TOKEN ?? process.env.NEXT_PUBLIC_ADMIN_TOKEN ?? "";

// ── Internal API helpers ──────────────────────────────────────────────────────

async function callInternal(path: string, body: unknown): Promise<unknown> {
  const headers: Record<string, string> = { "content-type": "application/json" };
  if (ADMIN_TOKEN) headers.authorization = `Bearer ${ADMIN_TOKEN}`;
  try {
    const res = await fetch(`${BASE_URL}${path}`, {
      method: "POST",
      headers,
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(45_000),
    });
    return res.json().catch(() => ({ ok: false }));
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}

// ── Material change detection ─────────────────────────────────────────────────

function isMaterialChange(subject: PKycSubject, newBand: PKycRiskBand, newComposite: number, newHits: number): {
  changed: boolean;
  kind: PKycDelta["kind"];
  detail: string;
} {
  if (!subject.lastBand) {
    return { changed: false, kind: "clear", detail: "First run — baseline established" };
  }

  const ORDER = ["clear", "low", "medium", "high", "critical"];
  const oldRank = ORDER.indexOf(subject.lastBand);
  const newRank = ORDER.indexOf(newBand);

  if (newRank > oldRank) {
    return {
      changed: true,
      kind: "band_change",
      detail: `Risk band escalated from ${subject.lastBand.toUpperCase()} to ${newBand.toUpperCase()} (composite ${subject.lastComposite ?? 0} → ${newComposite})`,
    };
  }

  if (newHits > subject.lastHits) {
    return {
      changed: true,
      kind: "new_hit",
      detail: `New sanctions hit(s) detected: ${subject.lastHits} → ${newHits} hits`,
    };
  }

  if (newRank < oldRank && newRank <= ORDER.indexOf("low")) {
    return {
      changed: true,
      kind: "clear",
      detail: `Risk band improved from ${subject.lastBand.toUpperCase()} to ${newBand.toUpperCase()}`,
    };
  }

  return { changed: false, kind: "clear", detail: "No material change" };
}

// ── Save delta ────────────────────────────────────────────────────────────────

async function saveDelta(delta: PKycDelta): Promise<void> {
  try {
    const mod = await import("@netlify/blobs").catch(() => null);
    if (!mod) return;
    const store = mod.getStore({ name: "pkyc" });
    await store.setJSON(`delta/${delta.id}`, delta);
  } catch { /* non-blocking */ }
}

// ── Run a single subject ──────────────────────────────────────────────────────

interface RunSubjectResult {
  id: string;
  name: string;
  band: PKycRiskBand;
  composite: number;
  hits: number;
  changed: boolean;
  skipped?: boolean;
  error?: string;
}

async function runSubject(subject: PKycSubject, force = false): Promise<RunSubjectResult> {
  const now = new Date();

  if (!force && new Date(subject.nextRunAt) > now) {
    return { id: subject.id, name: subject.name, band: subject.lastBand ?? "clear", composite: subject.lastComposite ?? 0, hits: subject.lastHits, changed: false, skipped: true };
  }

  try {
    const screenResult = await callInternal("/api/quick-screen", {
      name: subject.name,
      entityType: subject.entityType,
      jurisdiction: subject.jurisdiction,
      aliases: subject.aliases,
      dob: subject.dob,
    }) as { ok?: boolean; topScore?: number; severity?: string; hits?: unknown[] } | null;

    const hits = (screenResult as { hits?: unknown[] })?.hits?.length ?? 0;
    const topScore = (screenResult as { topScore?: number })?.topScore ?? 0;

    const sbResult = await callInternal("/api/super-brain", {
      name: subject.name,
      entityType: subject.entityType,
      jurisdiction: subject.jurisdiction,
      quickResult: screenResult,
    }) as { composite?: { score?: number }; pep?: { tier?: string } } | null;

    const composite = sbResult?.composite?.score ?? topScore;
    const ORDER = ["clear", "low", "medium", "high", "critical"];
    let bandIdx = 0;
    if (composite >= 80) bandIdx = 4;
    else if (composite >= 60) bandIdx = 3;
    else if (composite >= 40) bandIdx = 2;
    else if (composite >= 20) bandIdx = 1;
    if (hits > 0 && bandIdx < 3) bandIdx = 3;
    const band = ORDER[bandIdx] as PKycRiskBand;

    const { changed, kind, detail } = isMaterialChange(subject, band, composite, hits);

    // Build cadence-specific next-run date
    const cadenceMs: Record<string, number> = {
      daily: 86_400_000,
      weekly: 7 * 86_400_000,
      monthly: 30 * 86_400_000,
      quarterly: 91 * 86_400_000,
      annual: 365 * 86_400_000,
    };
    const nextMs = cadenceMs[subject.cadence] ?? cadenceMs["monthly"]!;
    const nextRunAt = new Date(now.getTime() + nextMs).toISOString();

    const updatedSubject: PKycSubject = {
      ...subject,
      lastRunAt: now.toISOString(),
      nextRunAt,
      lastBand: band,
      lastComposite: composite,
      lastHits: hits,
      runCount: subject.runCount + 1,
      alertCount: subject.alertCount + (changed ? 1 : 0),
      status: changed && (band === "high" || band === "critical") ? "pending_review" : "active",
    };
    await saveSubject(updatedSubject);

    if (changed) {
      const delta: PKycDelta = {
        id: `delta-${Date.now()}-${subject.id}`,
        subjectId: subject.id,
        subjectName: subject.name,
        detectedAt: now.toISOString(),
        kind,
        from: subject.lastBand ?? undefined,
        to: band,
        detail,
        acknowledged: false,
      };
      await saveDelta(delta);
    }

    return { id: subject.id, name: subject.name, band, composite, hits, changed };
  } catch (err) {
    return {
      id: subject.id,
      name: subject.name,
      band: subject.lastBand ?? "clear",
      composite: subject.lastComposite ?? 0,
      hits: subject.lastHits,
      changed: false,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

// ── Route handler ─────────────────────────────────────────────────────────────

async function handlePost(req: Request): Promise<NextResponse> {
  const url = new URL(req.url);
  const id = url.searchParams.get("id");
  const force = url.searchParams.get("force") === "true";

  if (id) {
    const subject = await getSubject(id);
    if (!subject) return NextResponse.json({ ok: false, error: "Subject not found" }, { status: 404 });
    const result = await runSubject(subject, true);
    return NextResponse.json({ ok: true, ran: 1, results: [result] });
  }

  const subjects = await listSubjects();
  const due = force
    ? subjects.filter((s) => s.status === "active")
    : subjects.filter((s) => s.status === "active" && new Date(s.nextRunAt) <= new Date());

  if (due.length === 0) {
    return NextResponse.json({ ok: true, ran: 0, skipped: subjects.length, results: [] });
  }

  const results = await Promise.all(due.map((s) => runSubject(s, force)));
  const changed = results.filter((r) => r.changed).length;
  const errors = results.filter((r) => r.error).length;

  return NextResponse.json({
    ok: true,
    ran: results.length,
    changed,
    errors,
    skipped: subjects.length - due.length,
    results,
  });
}

export const POST = withGuard(handlePost);
