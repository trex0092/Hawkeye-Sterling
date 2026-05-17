// POST /api/four-eyes/expire
//
// Expire one or more pending four-eyes items that have exceeded their
// decision deadline (default 24 h). Can be called by the cron function
// (designation-alert-check) or by an admin who wants to force-expire a
// stale item so it does not block the queue.
//
// Only items with status="pending" can be expired. Items already
// approved, rejected, or expired are ignored (idempotent).
//
// Body: { itemId?: string; expireOverdueAll?: boolean; reason?: string }
//   itemId            — expire this specific item
//   expireOverdueAll  — expire all items pending > thresholdHours
//   thresholdHours    — overdue threshold (default 24 h; min 1 h; max 720 h)
//   reason            — optional operator note written to audit chain
//
// Auth: Bearer ADMIN_TOKEN (withGuard).
// maxDuration: 15 s.

import { NextResponse } from "next/server";
import { withGuard } from "@/lib/server/guard";
import { writeAuditChainEntry } from "@/lib/server/audit-chain";
import { getJson, listKeys, setJson } from "@/lib/server/store";
import type { FourEyesItem } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 15;

const SAFE_ID_RE = /^[a-zA-Z0-9_\-:.]+$/;
const MAX_ID_LENGTH = 96;

function safeId(v: unknown): string | null {
  if (typeof v !== "string" || !v.trim()) return null;
  const s = v.trim();
  if (s.length > MAX_ID_LENGTH || !SAFE_ID_RE.test(s)) return null;
  return s;
}

function str(v: unknown): string | undefined {
  return typeof v === "string" && v.trim() ? v.trim() : undefined;
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

async function expireItem(
  key: string,
  item: FourEyesItem,
  reason: string,
  actor: string,
): Promise<void> {
  const expired: FourEyesItem = {
    ...item,
    status: "expired",
  };
  await setJson(key, expired);
  void writeAuditChainEntry({
    event: "four_eyes.expired",
    actor,
    caseId: item.caseId ?? item.subjectId,
    itemId: item.id,
    subjectName: item.subjectName,
    fourEyesAction: item.action,
    initiatedBy: item.initiatedBy,
    reason,
  });
}

async function handler(req: Request): Promise<NextResponse> {
  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "invalid_json" }, { status: 400 });
  }

  if (!isRecord(raw)) {
    return NextResponse.json(
      { ok: false, error: "body must be a JSON object" },
      { status: 400 },
    );
  }

  const itemId = safeId(raw["itemId"]);
  const expireOverdueAll = raw["expireOverdueAll"] === true;
  const reason = str(raw["reason"]) ?? "expired_by_admin";
  const actor = str(raw["actor"]) ?? "system";
  const rawThreshold = raw["thresholdHours"];
  const thresholdHours = typeof rawThreshold === "number"
    ? Math.max(1, Math.min(720, rawThreshold))
    : 24;

  if (!itemId && !expireOverdueAll) {
    return NextResponse.json(
      {
        ok: false,
        error: "missing_target",
        hint: "Provide itemId (expire one) or expireOverdueAll: true (expire all overdue)",
      },
      { status: 400 },
    );
  }

  // ── Expire a single item ────────────────────────────────────────────────────
  if (itemId) {
    const key = `four-eyes/${itemId}`;
    const item = await getJson<FourEyesItem>(key);
    if (!item) {
      return NextResponse.json({ ok: false, error: "item_not_found" }, { status: 404 });
    }
    if (item.status !== "pending") {
      return NextResponse.json(
        { ok: false, error: "item_not_pending", status: item.status },
        { status: 409 },
      );
    }
    await expireItem(key, item, reason, actor);
    return NextResponse.json({ ok: true, expired: 1, itemIds: [itemId] });
  }

  // ── Expire all overdue pending items ────────────────────────────────────────
  const thresholdMs = thresholdHours * 60 * 60 * 1000;
  const now = Date.now();
  let keys: string[];
  try {
    keys = await listKeys("four-eyes/");
  } catch {
    return NextResponse.json({ ok: true, expired: 0, itemIds: [], note: "store unavailable" });
  }

  const allItems = (
    await Promise.all(
      keys.map(async (k) => ({ key: k, item: await getJson<FourEyesItem>(k).catch(() => null) })),
    )
  ).filter((e): e is { key: string; item: FourEyesItem } => e.item !== null);

  const overdue = allItems.filter(
    ({ item }) =>
      item.status === "pending" &&
      now - new Date(item.initiatedAt).getTime() > thresholdMs,
  );

  if (overdue.length === 0) {
    return NextResponse.json({ ok: true, expired: 0, itemIds: [], thresholdHours });
  }

  await Promise.all(overdue.map(({ key, item }) => expireItem(key, item, reason, actor)));

  const expiredIds = overdue.map(({ item }) => item.id);
  return NextResponse.json({ ok: true, expired: overdue.length, itemIds: expiredIds, thresholdHours });
}

export const POST = withGuard(handler);

export async function OPTIONS(): Promise<NextResponse> {
  return new NextResponse(null, {
    status: 204,
    headers: {
      Allow: "POST, OPTIONS",
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, Authorization",
    },
  });
}
