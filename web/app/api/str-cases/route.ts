// GET  /api/str-cases               — list all STR cases
// POST /api/str-cases               — create or update an STR case
// PUT  /api/str-cases               — replace all STR cases (bulk import)
//
// STR = Suspicious Transaction Report. Cases are stored in Netlify Blobs
// under the "str-cases" tenant namespace (separate from the general case vault).
// Pattern analysis is available at POST /api/str-cases/pattern-detect.
//
// Regulatory basis: UAE Federal Decree-Law No. 10 of 2025 Art.17 (48-hour STR filing obligation).

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

import { NextResponse } from "next/server";
import { enforce } from "@/lib/server/enforce";
import { tenantIdFromGate } from "@/lib/server/tenant";
import { writeAuditChainEntry } from "@/lib/server/audit-chain";
import { randomBytes } from "node:crypto";
import { getJson, setJson, listKeys } from "@/lib/server/store";

export interface StrCase {
  id: string;
  subject: string;
  amount?: string;
  currency?: string;
  jurisdiction?: string;
  typology?: string;
  status: "draft" | "pending_review" | "filed" | "closed" | "escalated";
  priority?: "low" | "medium" | "high" | "critical";
  reportRef?: string;
  filedAt?: string;
  createdAt: string;
  updatedAt: string;
  notes?: string;
  linkedCaseId?: string;
  assignee?: string;
  fiuDeadline35Day?: string;    // ISO — 35 calendar days from createdAt
  fiuDeadlineDay20Alert?: string; // ISO — day 20 milestone (internal investigation deadline)
}

const STR_KEY_PREFIX = "str-cases/";

function strKey(tenantId: string, id: string): string {
  // Sanitize tenant and id to prevent key-namespace injection
  const t = tenantId.replace(/[^a-zA-Z0-9_-]/g, "_").slice(0, 64);
  const i = id.replace(/[^a-zA-Z0-9_\-.:]/g, "_").slice(0, 128);
  return `${STR_KEY_PREFIX}${t}/${i}.json`;
}

function indexKey(tenantId: string): string {
  const t = tenantId.replace(/[^a-zA-Z0-9_-]/g, "_").slice(0, 64);
  return `${STR_KEY_PREFIX}${t}/_index.json`;
}

async function loadAllStrCases(tenantId: string): Promise<StrCase[]> {
  const prefix = `${STR_KEY_PREFIX}${tenantId.replace(/[^a-zA-Z0-9_-]/g, "_").slice(0, 64)}/`;
  const keys = await listKeys(prefix);
  const dataKeys = keys.filter((k) => !k.endsWith("/_index.json"));
  const items = await Promise.all(dataKeys.map((k) => getJson<StrCase>(k)));
  return items.filter((c): c is StrCase => c !== null);
}

async function saveStrCase(tenantId: string, c: StrCase): Promise<void> {
  await setJson(strKey(tenantId, c.id), c);
  // Update lightweight index
  const idx = (await getJson<{ ids: string[] }>(indexKey(tenantId))) ?? { ids: [] };
  if (!idx.ids.includes(c.id)) {
    idx.ids.push(c.id);
    await setJson(indexKey(tenantId), idx);
  }
}

function generateStrId(): string {
  const now = new Date();
  const stamp = `${now.getUTCFullYear()}${String(now.getUTCMonth() + 1).padStart(2, "0")}${String(now.getUTCDate()).padStart(2, "0")}`;
  const rand = randomBytes(2).toString("hex");
  return `STR-${stamp}-${rand}`;
}

export async function GET(req: Request): Promise<NextResponse> {
  const gate = await enforce(req);
  if (!gate.ok) return gate.response;
  const tenant = tenantIdFromGate(gate);

  const url = new URL(req.url);
  const status = url.searchParams.get("status");
  const limit = Math.min(parseInt(url.searchParams.get("limit") ?? "200", 10) || 200, 500);
  const offset = Math.max(parseInt(url.searchParams.get("offset") ?? "0", 10) || 0, 0);

  try {
    let cases = await loadAllStrCases(tenant);

    if (status) cases = cases.filter((c) => c.status === status);
    cases.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));

    const total = cases.length;
    const page = cases.slice(offset, offset + limit);

    const enrichedPage = page.map((c) => {
      const daysRemaining = c.fiuDeadline35Day
        ? Math.ceil((Date.parse(c.fiuDeadline35Day) - Date.now()) / 86400000)
        : null;
      return { ...c, daysRemaining };
    });

    return NextResponse.json(
      { ok: true, tenant, cases: enrichedPage, total, limit, offset },
      { headers: gate.headers },
    );
  } catch (err) {
    console.error("[str-cases] GET failed:", err instanceof Error ? err.message : err);
    return NextResponse.json({ ok: false, error: "Failed to load STR cases" }, { status: 500, headers: gate.headers });
  }
}

export async function POST(req: Request): Promise<NextResponse> {
  const gate = await enforce(req);
  if (!gate.ok) return gate.response;
  const tenant = tenantIdFromGate(gate);

  const contentLength = Number(req.headers.get("content-length") ?? "0");
  if (contentLength > 5 * 1024 * 1024) {
    return NextResponse.json(
      { ok: false, error: "Request body too large (max 5 MB)" },
      { status: 413, headers: gate.headers },
    );
  }

  let body: Partial<StrCase> & { cases?: StrCase[] };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON" }, { status: 400, headers: gate.headers });
  }

  // Batch upsert
  if (Array.isArray(body.cases)) {
    if (body.cases.length > 500) {
      return NextResponse.json({ ok: false, error: "batch size must not exceed 500 items" }, { status: 413, headers: gate.headers });
    }
    const now = new Date().toISOString();
    const saved: StrCase[] = [];
    for (const c of body.cases) {
      const record: StrCase = {
        ...c,
        id: c.id ?? generateStrId(),
        status: c.status ?? "draft",
        createdAt: c.createdAt ?? now,
        updatedAt: now,
      };
      await saveStrCase(tenant, record);
      saved.push(record);
    }
    return NextResponse.json({ ok: true, tenant, cases: saved }, { headers: gate.headers });
  }

  // Single case upsert
  const now = new Date().toISOString();
  const VALID_STATUSES: StrCase["status"][] = ["draft", "pending_review", "filed", "closed", "escalated"];
  const ALLOWED_TRANSITIONS: Record<StrCase["status"], StrCase["status"][]> = {
    draft:          ["pending_review", "escalated"],
    pending_review: ["draft", "filed", "escalated"],
    filed:          ["closed"],
    escalated:      ["pending_review", "filed", "closed"],
    closed:         [],
  };

  if (body.status && !(VALID_STATUSES as string[]).includes(body.status)) {
    return NextResponse.json({ ok: false, error: `status must be one of: ${VALID_STATUSES.join(", ")}` }, { status: 400, headers: gate.headers });
  }

  // Validate state transition when updating an existing case
  if (body.id && body.status) {
    const existing = await getJson<StrCase>(strKey(tenant, body.id));
    if (existing && existing.status !== body.status) {
      const allowed = ALLOWED_TRANSITIONS[existing.status];
      if (!allowed.includes(body.status)) {
        return NextResponse.json(
          { ok: false, error: `Invalid status transition: ${existing.status} → ${body.status}. Allowed: ${allowed.join(", ") || "none (terminal state)"}` },
          { status: 422, headers: gate.headers },
        );
      }
    }
  }

  const isNewCase = !body.id;
  const caseCreatedAt = body.createdAt ? new Date(body.createdAt) : new Date();
  const fiuDeadline35Day = isNewCase && !body.fiuDeadline35Day
    ? new Date(caseCreatedAt.getTime() + 35 * 24 * 60 * 60 * 1000).toISOString()
    : body.fiuDeadline35Day;
  const fiuDeadlineDay20Alert = isNewCase && !body.fiuDeadlineDay20Alert
    ? new Date(caseCreatedAt.getTime() + 20 * 24 * 60 * 60 * 1000).toISOString()
    : body.fiuDeadlineDay20Alert;

  const record: StrCase = {
    subject: body.subject?.trim() || "Unknown Subject",
    status: body.status ?? "draft",
    ...body,
    id: body.id ?? generateStrId(),
    createdAt: body.createdAt ?? now,
    updatedAt: now,
    ...(fiuDeadline35Day !== undefined ? { fiuDeadline35Day } : {}),
    ...(fiuDeadlineDay20Alert !== undefined ? { fiuDeadlineDay20Alert } : {}),
  };
  await saveStrCase(tenant, record);
  return NextResponse.json({ ok: true, tenant, case: record }, { status: 201, headers: gate.headers });
}

export async function PUT(req: Request): Promise<NextResponse> {
  const gate = await enforce(req);
  if (!gate.ok) return gate.response;
  const tenant = tenantIdFromGate(gate);

  let body: { cases?: StrCase[] };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON" }, { status: 400, headers: gate.headers });
  }
  if (!Array.isArray(body.cases)) {
    return NextResponse.json({ ok: false, error: "body.cases must be an array" }, { status: 400, headers: gate.headers });
  }
  if (body.cases.length > 500) {
    return NextResponse.json({ ok: false, error: "batch size must not exceed 500 items" }, { status: 413, headers: gate.headers });
  }

  const now = new Date().toISOString();
  const saved: StrCase[] = [];
  for (const c of body.cases) {
    const record: StrCase = { ...c, id: c.id ?? generateStrId(), updatedAt: now, createdAt: c.createdAt ?? now };
    await saveStrCase(tenant, record);
    saved.push(record);
  }
  void writeAuditChainEntry(
    { event: "str_cases.bulk_imported", actor: gate.keyId, meta: { count: saved.length } },
    tenant,
  ).catch((e: unknown) => console.warn("[audit] write failed:", e instanceof Error ? e.message : String(e)));

  return NextResponse.json({ ok: true, tenant, cases: saved }, { headers: gate.headers });
}
