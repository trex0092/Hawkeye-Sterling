// GET  /api/ai-incident-playbook  — list all AI incident records
// POST /api/ai-incident-playbook  — log a new AI incident
// PATCH /api/ai-incident-playbook — update incident status/notes

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { enforce } from "@/lib/server/enforce";
import { getJson, setJson } from "@/lib/server/store";
import { writeAuditChainEntry } from "@/lib/server/audit-chain";
import { tenantIdFromGate } from "@/lib/server/tenant";

export type IncidentType =
  | "hallucination"
  | "bias_spike"
  | "data_poisoning"
  | "model_unavailability"
  | "prompt_injection"
  | "data_leakage"
  | "shadow_ai"
  | "drift"
  | "other";

export type IncidentSeverity = "critical" | "high" | "medium" | "low";
export type IncidentStatus = "open" | "investigating" | "mitigated" | "closed";

export interface AIIncidentRecord {
  id: string;
  tenantId: string;
  type: IncidentType;
  severity: IncidentSeverity;
  status: IncidentStatus;
  title: string;
  description: string;
  affectedModel: string;
  detectedAt: string;
  resolvedAt?: string;
  reportedBy: string;
  containmentSteps: string[];
  rootCause?: string;
  lessonsLearned?: string;
  regulatoryNotificationRequired: boolean;
  regulatoryNotificationSent?: boolean;
  createdAt: string;
  updatedAt: string;
}

function blobKey(tenantId: string) {
  return `ai-incidents/${tenantId}/all.v1.json`;
}

async function loadIncidents(tenantId: string): Promise<AIIncidentRecord[]> {
  const data = await getJson<AIIncidentRecord[]>(blobKey(tenantId));
  return data ?? [];
}

export async function GET(req: Request): Promise<NextResponse> {
  const gate = await enforce(req);
  if (!gate.ok) return gate.response;
  const tenant = tenantIdFromGate(gate);

  const incidents = await loadIncidents(tenant);
  incidents.sort((a, b) => b.createdAt.localeCompare(a.createdAt));

  return NextResponse.json({ ok: true, incidents }, { headers: gate.headers });
}

interface PostBody {
  type: IncidentType;
  severity: IncidentSeverity;
  title: string;
  description: string;
  affectedModel: string;
  containmentSteps?: string[];
  regulatoryNotificationRequired?: boolean;
}

export async function POST(req: Request): Promise<NextResponse> {
  const gate = await enforce(req);
  if (!gate.ok) return gate.response;
  const tenant = tenantIdFromGate(gate);

  let body: PostBody;
  try {
    body = (await req.json()) as PostBody;
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON" }, { status: 400 });
  }

  const VALID_TYPES: IncidentType[] = [
    "hallucination", "bias_spike", "data_poisoning", "model_unavailability",
    "prompt_injection", "data_leakage", "shadow_ai", "drift", "other",
  ];
  const VALID_SEVERITIES: IncidentSeverity[] = ["critical", "high", "medium", "low"];

  if (!body.type || !VALID_TYPES.includes(body.type)) {
    return NextResponse.json({ ok: false, error: "Invalid incident type" }, { status: 400 });
  }
  if (!body.severity || !VALID_SEVERITIES.includes(body.severity)) {
    return NextResponse.json({ ok: false, error: "Invalid severity" }, { status: 400 });
  }
  if (!body.title?.trim() || body.title.length > 200) {
    return NextResponse.json({ ok: false, error: "title required (≤200 chars)" }, { status: 400 });
  }
  if (!body.description?.trim() || body.description.length > 2000) {
    return NextResponse.json({ ok: false, error: "description required (≤2000 chars)" }, { status: 400 });
  }
  if (!body.affectedModel?.trim() || body.affectedModel.length > 100) {
    return NextResponse.json({ ok: false, error: "affectedModel required (≤100 chars)" }, { status: 400 });
  }

  const now = new Date().toISOString();
  const id = `AI-INC-${Date.now().toString(36).toUpperCase()}`;
  const record: AIIncidentRecord = {
    id,
    tenantId: tenant,
    type: body.type,
    severity: body.severity,
    status: "open",
    title: body.title.trim(),
    description: body.description.trim(),
    affectedModel: body.affectedModel.trim(),
    detectedAt: now,
    reportedBy: gate.keyId ?? "system",
    containmentSteps: body.containmentSteps?.slice(0, 20) ?? [],
    regulatoryNotificationRequired: body.regulatoryNotificationRequired ?? (body.severity === "critical"),
    createdAt: now,
    updatedAt: now,
  };

  const existing = await loadIncidents(tenant);
  await setJson(blobKey(tenant), [record, ...existing].slice(0, 1000));

  void writeAuditChainEntry({
    event: "ai_incident.created",
    actor: gate.keyId ?? "system",
    detail: `${record.severity.toUpperCase()} ${record.type}: ${record.title}`,
    incidentId: id,
  }).catch(() => {});

  return NextResponse.json({ ok: true, incident: record }, { headers: gate.headers });
}

interface PatchBody {
  id: string;
  status?: IncidentStatus;
  rootCause?: string;
  lessonsLearned?: string;
  containmentSteps?: string[];
  regulatoryNotificationSent?: boolean;
  resolvedAt?: string;
}

export async function PATCH(req: Request): Promise<NextResponse> {
  const gate = await enforce(req);
  if (!gate.ok) return gate.response;
  const tenant = tenantIdFromGate(gate);

  let body: PatchBody;
  try {
    body = (await req.json()) as PatchBody;
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON" }, { status: 400 });
  }

  if (!body.id?.trim()) {
    return NextResponse.json({ ok: false, error: "id required" }, { status: 400 });
  }
  const VALID_STATUSES: IncidentStatus[] = ["open", "investigating", "mitigated", "closed"];
  if (body.status !== undefined && !VALID_STATUSES.includes(body.status)) {
    return NextResponse.json({ ok: false, error: "Invalid status" }, { status: 400 });
  }
  if (body.rootCause !== undefined && body.rootCause.length > 2000) {
    return NextResponse.json({ ok: false, error: "rootCause ≤2000 chars" }, { status: 400 });
  }
  if (body.lessonsLearned !== undefined && body.lessonsLearned.length > 2000) {
    return NextResponse.json({ ok: false, error: "lessonsLearned ≤2000 chars" }, { status: 400 });
  }
  if (body.containmentSteps !== undefined) {
    if (!Array.isArray(body.containmentSteps) || body.containmentSteps.some((s) => typeof s !== "string" || s.length > 500)) {
      return NextResponse.json({ ok: false, error: "containmentSteps must be array of strings ≤500 chars each" }, { status: 400 });
    }
    body.containmentSteps = body.containmentSteps.slice(0, 20);
  }

  const incidents = await loadIncidents(tenant);
  const idx = incidents.findIndex((i) => i.id === body.id);
  if (idx === -1) {
    return NextResponse.json({ ok: false, error: "Incident not found" }, { status: 404 });
  }

  const updated: AIIncidentRecord = {
    ...incidents[idx]!,
    ...(body.status !== undefined ? { status: body.status } : {}),
    ...(body.rootCause !== undefined ? { rootCause: body.rootCause } : {}),
    ...(body.lessonsLearned !== undefined ? { lessonsLearned: body.lessonsLearned } : {}),
    ...(body.containmentSteps !== undefined ? { containmentSteps: body.containmentSteps } : {}),
    ...(body.regulatoryNotificationSent !== undefined ? { regulatoryNotificationSent: body.regulatoryNotificationSent } : {}),
    ...(body.resolvedAt !== undefined ? { resolvedAt: body.resolvedAt } : {}),
    updatedAt: new Date().toISOString(),
  };

  incidents[idx] = updated;
  await setJson(blobKey(tenant), incidents);

  void writeAuditChainEntry({
    event: "ai_incident.updated",
    actor: gate.keyId ?? "system",
    detail: `${body.id} → status:${body.status ?? "unchanged"}`,
  }).catch(() => {});

  return NextResponse.json({ ok: true, incident: updated }, { headers: gate.headers });
}
