import { NextResponse } from "next/server";
import { withGuard } from "@/lib/server/guard";
import { del, getJson, listKeys, setJson } from "@/lib/server/store";
import type { SavedSearch } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 15;

const SAFE_ID_RE = /^[a-zA-Z0-9_\-]+$/;
const MAX_ID_LENGTH = 64;

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function stringField(v: unknown): string | undefined {
  return typeof v === "string" && v.trim() ? v.trim() : undefined;
}

function stringArray(v: unknown): string[] | undefined {
  if (!Array.isArray(v)) return undefined;
  const cleaned = v.filter((x): x is string => typeof x === "string" && x.trim().length > 0);
  return cleaned.length > 0 ? cleaned : undefined;
}

function numberField(v: unknown): number | undefined {
  if (typeof v !== "number" || !Number.isFinite(v)) return undefined;
  return v;
}

async function handleGet(): Promise<NextResponse> {
  const keys = await listKeys("saved-searches/");
  const loaded = await Promise.all(keys.map((k) => getJson<SavedSearch>(k)));
  const searches = loaded.filter((s): s is SavedSearch => s !== null);
  // Newest first so the toolbar pills feel current.
  searches.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  return NextResponse.json({ ok: true, count: searches.length, searches });
}

async function handlePost(req: Request): Promise<NextResponse> {
  let raw: unknown;
  try { raw = await req.json(); } catch {
    return NextResponse.json({ ok: false, error: "invalid JSON" }, { status: 400 });
  }
  if (!isRecord(raw)) {
    return NextResponse.json({ ok: false, error: "body must be a JSON object" }, { status: 400 });
  }
  const label = stringField(raw["label"]);
  if (!label) {
    return NextResponse.json({ ok: false, error: "label required" }, { status: 400 });
  }
  // Generate or honour caller-supplied id.
  let id = stringField(raw["id"]) ?? "";
  if (!id) id = `ss-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
  if (id.length > MAX_ID_LENGTH || !SAFE_ID_RE.test(id)) {
    return NextResponse.json({ ok: false, error: "id must be alphanumeric/_- and max 64 chars" }, { status: 400 });
  }
  const search: SavedSearch = {
    id,
    label,
    createdAt: new Date().toISOString(),
    ...(stringField(raw["query"]) ? { query: stringField(raw["query"])! } : {}),
    ...(stringField(raw["filter"]) ? { filter: stringField(raw["filter"]) as SavedSearch["filter"] } : {}),
    ...(stringField(raw["statusFilter"]) ? { statusFilter: stringField(raw["statusFilter"]) as SavedSearch["statusFilter"] } : {}),
    ...(numberField(raw["minRisk"]) !== undefined ? { minRisk: numberField(raw["minRisk"])! } : {}),
    ...(stringArray(raw["pepTiers"]) ? { pepTiers: stringArray(raw["pepTiers"])! } : {}),
    ...(stringArray(raw["jurisdictions"]) ? { jurisdictions: stringArray(raw["jurisdictions"])! } : {}),
    ...(numberField(raw["openedWithinH"]) !== undefined ? { openedWithinH: numberField(raw["openedWithinH"])! } : {}),
    ...(stringField(raw["createdBy"]) ? { createdBy: stringField(raw["createdBy"])! } : {}),
  };
  await setJson(`saved-searches/${id}`, search);
  return NextResponse.json({ ok: true, search });
}

async function handleDelete(req: Request): Promise<NextResponse> {
  const url = new URL(req.url);
  const id = url.searchParams.get("id")?.trim();
  if (!id || id.length > MAX_ID_LENGTH || !SAFE_ID_RE.test(id)) {
    return NextResponse.json({ ok: false, error: "id required" }, { status: 400 });
  }
  await del(`saved-searches/${id}`);
  return NextResponse.json({ ok: true });
}

export const GET = withGuard(handleGet);
export const POST = withGuard(handlePost);
export const DELETE = withGuard(handleDelete);
