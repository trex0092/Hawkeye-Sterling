// GET  /api/shadow-ai  — list shadow AI detection entries
// POST /api/shadow-ai  — report a new shadow AI tool detection
// PATCH /api/shadow-ai — update entry status (approve/reject)

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { enforce } from "@/lib/server/enforce";
import { getJson, setJson } from "@/lib/server/store";
import { writeAuditChainEntry } from "@/lib/server/audit-chain";
import { tenantIdFromGate } from "@/lib/server/tenant";

export type ShadowAIRisk = "critical" | "high" | "medium" | "low";
export type ShadowAIStatus = "detected" | "under_review" | "approved" | "blocked" | "remediated";

export interface ShadowAIEntry {
  id: string;
  tenantId: string;
  toolName: string;
  toolType: "llm" | "ml_api" | "automation" | "analytics" | "image_gen" | "other";
  detectionMethod: "user_report" | "network_scan" | "audit_log" | "browser_ext" | "dns_query" | "other";
  reportedBy: string;
  department?: string;
  useCase?: string;
  dataClassification: "public" | "internal" | "confidential" | "restricted";
  riskLevel: ShadowAIRisk;
  status: ShadowAIStatus;
  vendorDpaExists: boolean;
  approvedInRegistry: boolean;
  detectedAt: string;
  notes?: string;
  remediationAction?: string;
  createdAt: string;
  updatedAt: string;
}

function blobKey(tenantId: string) {
  return `shadow-ai/${tenantId}/all.v1.json`;
}

async function loadEntries(tenantId: string): Promise<ShadowAIEntry[]> {
  const data = await getJson<ShadowAIEntry[]>(blobKey(tenantId));
  return data ?? [];
}

// Risk scoring heuristic
function computeRisk(
  dataClass: ShadowAIEntry["dataClassification"],
  hasVendorDpa: boolean,
  approvedInRegistry: boolean,
): ShadowAIRisk {
  if (dataClass === "restricted" && !approvedInRegistry) return "critical";
  if (dataClass === "confidential" && !hasVendorDpa) return "high";
  if (!approvedInRegistry && dataClass !== "public") return "high";
  if (!hasVendorDpa && dataClass !== "public") return "medium";
  return "low";
}

export async function GET(req: Request): Promise<NextResponse> {
  const gate = await enforce(req);
  if (!gate.ok) return gate.response;
  const tenant = tenantIdFromGate(gate);

  const entries = await loadEntries(tenant);
  entries.sort((a, b) => b.createdAt.localeCompare(a.createdAt));

  const stats = {
    total: entries.length,
    critical: entries.filter((e) => e.riskLevel === "critical").length,
    high: entries.filter((e) => e.riskLevel === "high").length,
    open: entries.filter((e) => ["detected", "under_review"].includes(e.status)).length,
    blocked: entries.filter((e) => e.status === "blocked").length,
  };

  return NextResponse.json({ ok: true, entries, stats }, { headers: gate.headers });
}

interface PostBody {
  toolName: string;
  toolType: ShadowAIEntry["toolType"];
  detectionMethod: ShadowAIEntry["detectionMethod"];
  department?: string;
  useCase?: string;
  dataClassification: ShadowAIEntry["dataClassification"];
  vendorDpaExists?: boolean;
  approvedInRegistry?: boolean;
  notes?: string;
}

export async function POST(req: Request): Promise<NextResponse> {
  const gate = await enforce(req);
  if (!gate.ok) return gate.response;
  const tenant = tenantIdFromGate(gate);

  let body: PostBody;
  try {
    body = (await req.json()) as PostBody;
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON" }, { status: 400, headers: gate.headers });
  }

  const VALID_TOOL_TYPES: ShadowAIEntry["toolType"][] = ["llm", "ml_api", "automation", "analytics", "image_gen", "other"];
  const VALID_DETECTION: ShadowAIEntry["detectionMethod"][] = ["user_report", "network_scan", "audit_log", "browser_ext", "dns_query", "other"];
  const VALID_DATA: ShadowAIEntry["dataClassification"][] = ["public", "internal", "confidential", "restricted"];

  if (!body.toolName?.trim() || body.toolName.length > 100) {
    return NextResponse.json({ ok: false, error: "toolName required (≤100 chars)" }, { status: 400, headers: gate.headers });
  }
  if (!body.toolType || !VALID_TOOL_TYPES.includes(body.toolType)) {
    return NextResponse.json({ ok: false, error: "Invalid toolType" }, { status: 400, headers: gate.headers });
  }
  if (!body.detectionMethod || !VALID_DETECTION.includes(body.detectionMethod)) {
    return NextResponse.json({ ok: false, error: "Invalid detectionMethod" }, { status: 400, headers: gate.headers });
  }
  if (!body.dataClassification || !VALID_DATA.includes(body.dataClassification)) {
    return NextResponse.json({ ok: false, error: "Invalid dataClassification" }, { status: 400, headers: gate.headers });
  }

  const vendorDpaExists = body.vendorDpaExists ?? false;
  const approvedInRegistry = body.approvedInRegistry ?? false;
  const riskLevel = computeRisk(body.dataClassification, vendorDpaExists, approvedInRegistry);

  const now = new Date().toISOString();
  const id = `SAI-${Date.now().toString(36).toUpperCase()}`;
  const entry: ShadowAIEntry = {
    id,
    tenantId: tenant,
    toolName: body.toolName.trim(),
    toolType: body.toolType,
    detectionMethod: body.detectionMethod,
    reportedBy: gate.keyId ?? "system",
    department: body.department?.trim().slice(0, 100),
    useCase: body.useCase?.trim().slice(0, 500),
    dataClassification: body.dataClassification,
    riskLevel,
    status: "detected",
    vendorDpaExists,
    approvedInRegistry,
    detectedAt: now,
    notes: body.notes?.trim().slice(0, 1000),
    createdAt: now,
    updatedAt: now,
  };

  const existing = await loadEntries(tenant);
  await setJson(blobKey(tenant), [entry, ...existing].slice(0, 500));

  void writeAuditChainEntry({
    event: "shadow_ai.detected",
    actor: gate.keyId ?? "system",
    detail: `${riskLevel.toUpperCase()} — ${entry.toolName} (${entry.toolType})`,
    entryId: id,
  }, tenant).catch(() => {});

  return NextResponse.json({ ok: true, entry }, { headers: gate.headers });
}

interface PatchBody {
  id: string;
  status?: ShadowAIStatus;
  remediationAction?: string;
  notes?: string;
  approvedInRegistry?: boolean;
  vendorDpaExists?: boolean;
}

export async function PATCH(req: Request): Promise<NextResponse> {
  const gate = await enforce(req);
  if (!gate.ok) return gate.response;
  const tenant = tenantIdFromGate(gate);

  let body: PatchBody;
  try {
    body = (await req.json()) as PatchBody;
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON" }, { status: 400, headers: gate.headers });
  }

  if (!body.id?.trim()) {
    return NextResponse.json({ ok: false, error: "id required" }, { status: 400, headers: gate.headers });
  }
  const VALID_STATUSES: ShadowAIStatus[] = ["detected", "under_review", "approved", "blocked", "remediated"];
  if (body.status !== undefined && !VALID_STATUSES.includes(body.status)) {
    return NextResponse.json({ ok: false, error: "Invalid status" }, { status: 400, headers: gate.headers });
  }
  if (body.remediationAction !== undefined && body.remediationAction.length > 1000) {
    return NextResponse.json({ ok: false, error: "remediationAction ≤1000 chars" }, { status: 400, headers: gate.headers });
  }
  if (body.notes !== undefined && body.notes.length > 1000) {
    return NextResponse.json({ ok: false, error: "notes ≤1000 chars" }, { status: 400, headers: gate.headers });
  }

  const entries = await loadEntries(tenant);
  const idx = entries.findIndex((e) => e.id === body.id);
  if (idx === -1) {
    return NextResponse.json({ ok: false, error: "Entry not found" }, { status: 404, headers: gate.headers });
  }

  const updated: ShadowAIEntry = {
    ...entries[idx]!,
    ...(body.status !== undefined ? { status: body.status } : {}),
    ...(body.remediationAction !== undefined ? { remediationAction: body.remediationAction } : {}),
    ...(body.notes !== undefined ? { notes: body.notes } : {}),
    ...(body.approvedInRegistry !== undefined ? { approvedInRegistry: body.approvedInRegistry } : {}),
    ...(body.vendorDpaExists !== undefined ? { vendorDpaExists: body.vendorDpaExists } : {}),
    updatedAt: new Date().toISOString(),
  };

  entries[idx] = updated;
  await setJson(blobKey(tenant), entries);

  void writeAuditChainEntry({
    event: "shadow_ai.updated",
    actor: gate.keyId ?? "system",
    detail: `${body.id} → ${body.status ?? "updated"}`,
  }, tenant).catch(() => {});

  return NextResponse.json({ ok: true, entry: updated }, { headers: gate.headers });
}
