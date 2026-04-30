// Persistent per-subject screening history. Powers re-screen diff + replay.
//
// Storage: `screening-history/<subjectId>/<isoTimestamp>` → ScreeningHistoryEntry.
// Newest 50 are kept per subject; older entries are pruned on POST so the
// blob count doesn't grow without bound.

import { NextResponse } from "next/server";
import { withGuard } from "@/lib/server/guard";
import { del, getJson, listKeys, setJson } from "@/lib/server/store";
import type { ScreeningHistoryEntry } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 15;

const SAFE_ID_RE = /^[a-zA-Z0-9_\-:.]+$/;
const MAX_ID_LENGTH = 96;
const MAX_ENTRIES_PER_SUBJECT = 50;

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function stringField(v: unknown): string | undefined {
  return typeof v === "string" && v.trim() ? v.trim() : undefined;
}

function stringArray(v: unknown): string[] {
  if (!Array.isArray(v)) return [];
  return v.filter((x): x is string => typeof x === "string");
}

function safeId(v: string | null): string | null {
  if (!v || v.length > MAX_ID_LENGTH || !SAFE_ID_RE.test(v)) return null;
  return v;
}

async function handleGet(req: Request): Promise<NextResponse> {
  const url = new URL(req.url);
  const subjectId = safeId(url.searchParams.get("subjectId")?.trim() ?? null);
  if (!subjectId) {
    return NextResponse.json({ ok: false, error: "subjectId required" }, { status: 400 });
  }
  const prefix = `screening-history/${subjectId}/`;
  const keys = await listKeys(prefix);
  const loaded = await Promise.all(keys.map((k) => getJson<ScreeningHistoryEntry>(k)));
  const entries = loaded.filter((e): e is ScreeningHistoryEntry => e !== null);
  // Newest first.
  entries.sort((a, b) => b.at.localeCompare(a.at));
  return NextResponse.json({ ok: true, count: entries.length, entries });
}

async function handlePost(req: Request): Promise<NextResponse> {
  let raw: unknown;
  try { raw = await req.json(); } catch {
    return NextResponse.json({ ok: false, error: "invalid JSON" }, { status: 400 });
  }
  if (!isRecord(raw)) {
    return NextResponse.json({ ok: false, error: "body must be a JSON object" }, { status: 400 });
  }
  const subjectId = safeId(stringField(raw["subjectId"]) ?? null);
  if (!subjectId) {
    return NextResponse.json({ ok: false, error: "subjectId required" }, { status: 400 });
  }
  const topScore = typeof raw["topScore"] === "number" ? raw["topScore"] : 0;
  const severityRaw = stringField(raw["severity"]) ?? "clear";
  const allowedSev = new Set(["clear", "low", "medium", "high", "critical"]);
  const severity = (allowedSev.has(severityRaw) ? severityRaw : "clear") as ScreeningHistoryEntry["severity"];
  const lists = stringArray(raw["lists"]);
  const hits = stringArray(raw["hits"]);
  const at = new Date().toISOString();
  const entry: ScreeningHistoryEntry = {
    at,
    topScore,
    severity,
    lists,
    hits,
    ...(typeof raw["confidenceBand"] === "number" ? { confidenceBand: raw["confidenceBand"] as number } : {}),
  };
  // Use the timestamp as the key suffix so listing is naturally sortable.
  await setJson(`screening-history/${subjectId}/${at}`, entry);

  // Prune to MAX_ENTRIES_PER_SUBJECT — drop oldest beyond the cap so the
  // blob namespace doesn't grow unbounded for ongoing-screened subjects.
  const allKeys = await listKeys(`screening-history/${subjectId}/`);
  if (allKeys.length > MAX_ENTRIES_PER_SUBJECT) {
    const sorted = [...allKeys].sort(); // ISO 8601 sorts lexicographically
    const toDelete = sorted.slice(0, allKeys.length - MAX_ENTRIES_PER_SUBJECT);
    await Promise.all(toDelete.map((k) => del(k)));
  }

  return NextResponse.json({ ok: true, entry });
}

export const GET = withGuard(handleGet);
export const POST = withGuard(handlePost);
