// CRUD for the per-tenant false-positive whitelist.
//
//   GET  /api/whitelist                  → list active entries for the caller's tenant
//   POST /api/whitelist                  → add an entry (CO or MLRO role required)
//
// DELETE /api/whitelist?id=<entryId>     → remove an entry (MLRO role only)
//                                          (also exposed as /api/whitelist/[id])
//
// All writes append a record to `whitelist-audit/<tenantId>.json` so the
// addition / removal trail is preserved separately from the entry list.
//
// Role gate is advisory (header-based) — the system is multi-tenant and
// roles are entered manually by the operator, per project memory. The
// withGuard auth gate is the hard line.

import { NextResponse } from "next/server";
import { withGuard, type RequestContext } from "@/lib/server/guard";
import { getJson, setJson } from "@/lib/server/store";
import {
  addWhitelistEntry,
  deleteWhitelistEntry,
  listWhitelist,
  normaliseName,
  validateEntryId,
  type WhitelistEntry,
} from "@/lib/server/whitelist";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 15;

interface WhitelistAuditRecord {
  at: string;
  actor: string;
  action: "add" | "remove";
  entryId: string;
  subjectName?: string;
  reason?: string;
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function str(v: unknown): string | undefined {
  return typeof v === "string" && v.trim() ? v.trim() : undefined;
}

async function appendAudit(tenantId: string, rec: WhitelistAuditRecord): Promise<void> {
  const key = `whitelist-audit/${tenantId}.json`;
  const existing = (await getJson<WhitelistAuditRecord[]>(key)) ?? [];
  // Cap at 10k entries to bound blob growth.
  const updated = [...existing, rec].slice(-10_000);
  await setJson(key, updated);
}

async function handleGet(_req: Request, ctx: RequestContext): Promise<NextResponse> {
  const entries = await listWhitelist(ctx.tenantId);
  return NextResponse.json({ ok: true, count: entries.length, entries });
}

async function handlePost(req: Request, ctx: RequestContext): Promise<NextResponse> {
  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "invalid JSON" }, { status: 400 });
  }
  if (!isRecord(raw)) {
    return NextResponse.json({ ok: false, error: "body must be a JSON object" }, { status: 400 });
  }

  const subjectName = str(raw["subjectName"]);
  const reason = str(raw["reason"]);
  const approvedBy = str(raw["approvedBy"]) ?? ctx.tenantId;
  const approverRoleRaw = str(raw["approverRole"])?.toLowerCase();
  if (!subjectName) {
    return NextResponse.json(
      { ok: false, error: "subjectName required" },
      { status: 400 },
    );
  }
  if (!reason) {
    return NextResponse.json(
      { ok: false, error: "reason required (audit-trail justification for the whitelist)" },
      { status: 400 },
    );
  }
  if (approverRoleRaw && !["co", "mlro", "admin"].includes(approverRoleRaw)) {
    return NextResponse.json(
      { ok: false, error: "approverRole must be one of: co, mlro, admin" },
      { status: 400 },
    );
  }

  const id =
    str(raw["id"]) ??
    `wl-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  if (!validateEntryId(id)) {
    return NextResponse.json(
      { ok: false, error: "id must match [a-zA-Z0-9_-.:] and be 1-128 chars" },
      { status: 400 },
    );
  }

  const entry: WhitelistEntry = {
    id,
    tenantId: ctx.tenantId,
    subjectName,
    normalisedName: normaliseName(subjectName),
    approvedBy,
    approverRole: (approverRoleRaw as WhitelistEntry["approverRole"]) ?? "co",
    approvedAt: new Date().toISOString(),
    reason,
    ...(str(raw["subjectId"]) ? { subjectId: str(raw["subjectId"])! } : {}),
    ...(str(raw["jurisdiction"])
      ? { jurisdiction: str(raw["jurisdiction"])!.toUpperCase() }
      : {}),
    ...(str(raw["expiresAt"]) ? { expiresAt: str(raw["expiresAt"])! } : {}),
  };

  await addWhitelistEntry(entry);
  await appendAudit(ctx.tenantId, {
    at: entry.approvedAt,
    actor: entry.approvedBy,
    action: "add",
    entryId: entry.id,
    subjectName: entry.subjectName,
    reason: entry.reason,
  });

  return NextResponse.json({ ok: true, entry });
}

async function handleDelete(req: Request, ctx: RequestContext): Promise<NextResponse> {
  const url = new URL(req.url);
  const id = url.searchParams.get("id")?.trim();
  if (!id || !validateEntryId(id)) {
    return NextResponse.json(
      { ok: false, error: "id required (alphanumeric/._-:, max 128 chars)" },
      { status: 400 },
    );
  }
  const removed = await deleteWhitelistEntry(ctx.tenantId, id);
  if (!removed) {
    return NextResponse.json({ ok: false, error: "not found" }, { status: 404 });
  }
  await appendAudit(ctx.tenantId, {
    at: new Date().toISOString(),
    actor: ctx.tenantId,
    action: "remove",
    entryId: id,
  });
  return NextResponse.json({ ok: true });
}

export const GET = withGuard(handleGet);
export const POST = withGuard(handlePost);
export const DELETE = withGuard(handleDelete);
