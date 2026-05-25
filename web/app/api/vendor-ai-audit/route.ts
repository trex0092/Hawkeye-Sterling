// GET  /api/vendor-ai-audit  — list AI vendor assessments
// POST /api/vendor-ai-audit  — create a new vendor AI assessment
// PATCH /api/vendor-ai-audit — update assessment

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { enforce } from "@/lib/server/enforce";
import { getJson, setJson } from "@/lib/server/store";
import { writeAuditChainEntry } from "@/lib/server/audit-chain";
import { tenantIdFromGate } from "@/lib/server/tenant";

export type VendorRiskTier = "critical" | "high" | "medium" | "low";
export type VendorAuditStatus = "draft" | "in_review" | "approved" | "failed" | "expired";

export interface VendorAIChecklist {
  dpaInPlace: boolean;
  dataResidencyConfirmed: boolean;
  subprocessorListObtained: boolean;
  penetrationTestReport: boolean;
  iso27001OrSoc2: boolean;
  modelCardProvided: boolean;
  biasAuditCompleted: boolean;
  hallucIndicationLogEnabled: boolean;
  incidentNotificationSla: boolean;
  rightToAuditClause: boolean;
  dataRetentionTermsAgreed: boolean;
  gdprOrAdgmDpaClause: boolean;
}

export interface VendorAIAssessment {
  id: string;
  tenantId: string;
  vendorName: string;
  vendorType: "llm_provider" | "ml_platform" | "data_broker" | "analytics" | "other";
  contractReference?: string;
  assessedBy: string;
  riskTier: VendorRiskTier;
  status: VendorAuditStatus;
  checklist: VendorAIChecklist;
  checklistScore: number;
  overallFindings: string;
  criticalGaps: string[];
  nextReviewDate: string;
  regulatoryBasis: string[];
  createdAt: string;
  updatedAt: string;
}

const UAE_REGULATORY_BASIS = [
  "CBUAE AI Governance Guidelines 2025",
  "UAE FDL 10/2025 Art.18 (Third-party AI oversight)",
  "ADGM Data Protection Regulations 2021",
  "DIFC Data Protection Law 2020",
  "FATF R.18 (Third-party reliance controls)",
];

function scoreChecklist(c: VendorAIChecklist): number {
  const vals = Object.values(c) as boolean[];
  const passed = vals.filter(Boolean).length;
  return Math.round((passed / vals.length) * 100);
}

function computeRiskTier(score: number, criticalGaps: string[]): VendorRiskTier {
  if (score < 40 || criticalGaps.length >= 3) return "critical";
  if (score < 60 || criticalGaps.length >= 2) return "high";
  if (score < 80 || criticalGaps.length >= 1) return "medium";
  return "low";
}

function blobKey(tenantId: string) {
  return `vendor-ai-audits/${tenantId}/all.v1.json`;
}

async function loadAssessments(tenantId: string): Promise<VendorAIAssessment[]> {
  const data = await getJson<VendorAIAssessment[]>(blobKey(tenantId));
  return data ?? [];
}

function nextReview(status: VendorAuditStatus, riskTier: VendorRiskTier): string {
  const months = status === "failed" ? 1 : riskTier === "critical" ? 3 : riskTier === "high" ? 6 : 12;
  const d = new Date();
  d.setMonth(d.getMonth() + months);
  return d.toISOString().slice(0, 10);
}

export async function GET(req: Request): Promise<NextResponse> {
  const gate = await enforce(req);
  if (!gate.ok) return gate.response;
  const tenant = tenantIdFromGate(gate);

  const assessments = await loadAssessments(tenant);
  assessments.sort((a, b) => b.createdAt.localeCompare(a.createdAt));

  // Seed Anthropic entry if empty (default vendor for Hawkeye Sterling)
  const seeded = assessments.length === 0 ? [buildAnthropicSeed(tenant)] : assessments;

  return NextResponse.json({ ok: true, assessments: seeded }, { headers: gate.headers });
}

function buildAnthropicSeed(tenant: string): VendorAIAssessment {
  const checklist: VendorAIChecklist = {
    dpaInPlace: true,
    dataResidencyConfirmed: true,
    subprocessorListObtained: true,
    penetrationTestReport: true,
    iso27001OrSoc2: true,
    modelCardProvided: true,
    biasAuditCompleted: false,
    hallucIndicationLogEnabled: false,
    incidentNotificationSla: true,
    rightToAuditClause: false,
    dataRetentionTermsAgreed: true,
    gdprOrAdgmDpaClause: true,
  };
  const score = scoreChecklist(checklist);
  const gaps = ["biasAuditCompleted", "rightToAuditClause", "hallucIndicationLogEnabled"];
  const tier = computeRiskTier(score, gaps);
  const now = new Date().toISOString();
  return {
    id: "VAA-ANTHROPIC-SEED",
    tenantId: tenant,
    vendorName: "Anthropic",
    vendorType: "llm_provider",
    contractReference: "Anthropic API ToS + DPA (2024)",
    assessedBy: "system",
    riskTier: tier,
    status: "in_review",
    checklist,
    checklistScore: score,
    overallFindings:
      "Anthropic provides strong data protection (DPA, SOC 2 Type II, ISO 27001). Outstanding gaps: formal bias audit report, explicit right-to-audit clause, and hallucination-indication log disclosure.",
    criticalGaps: gaps,
    nextReviewDate: nextReview("in_review", tier),
    regulatoryBasis: UAE_REGULATORY_BASIS,
    createdAt: now,
    updatedAt: now,
  };
}

interface PostBody {
  vendorName: string;
  vendorType: VendorAIAssessment["vendorType"];
  contractReference?: string;
  checklist: VendorAIChecklist;
  overallFindings: string;
  criticalGaps?: string[];
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

  if (!body.vendorName?.trim() || body.vendorName.length > 100) {
    return NextResponse.json({ ok: false, error: "vendorName required (≤100 chars)" }, { status: 400 });
  }
  if (!body.checklist || typeof body.checklist !== "object") {
    return NextResponse.json({ ok: false, error: "checklist required" }, { status: 400 });
  }
  if (!body.overallFindings?.trim() || body.overallFindings.length > 2000) {
    return NextResponse.json({ ok: false, error: "overallFindings required (≤2000 chars)" }, { status: 400 });
  }

  const score = scoreChecklist(body.checklist);
  const criticalGaps = body.criticalGaps?.slice(0, 20) ?? [];
  const riskTier = computeRiskTier(score, criticalGaps);
  const status: VendorAuditStatus = score >= 80 ? "approved" : score < 40 ? "failed" : "in_review";

  const now = new Date().toISOString();
  const id = `VAA-${Date.now().toString(36).toUpperCase()}`;
  const assessment: VendorAIAssessment = {
    id,
    tenantId: tenant,
    vendorName: body.vendorName.trim(),
    vendorType: body.vendorType ?? "other",
    contractReference: body.contractReference?.trim().slice(0, 200),
    assessedBy: gate.keyId ?? "system",
    riskTier,
    status,
    checklist: body.checklist,
    checklistScore: score,
    overallFindings: body.overallFindings.trim(),
    criticalGaps,
    nextReviewDate: nextReview(status, riskTier),
    regulatoryBasis: UAE_REGULATORY_BASIS,
    createdAt: now,
    updatedAt: now,
  };

  const existing = await loadAssessments(tenant);
  await setJson(blobKey(tenant), [assessment, ...existing].slice(0, 200));

  void writeAuditChainEntry({
    event: "vendor_ai_audit.created",
    actor: gate.keyId ?? "system",
    detail: `${assessment.vendorName} — score ${score}% (${riskTier})`,
    assessmentId: id,
  }).catch(() => {});

  return NextResponse.json({ ok: true, assessment }, { headers: gate.headers });
}

interface PatchBody {
  id: string;
  checklist?: Partial<VendorAIChecklist>;
  overallFindings?: string;
  criticalGaps?: string[];
  status?: VendorAuditStatus;
  contractReference?: string;
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

  const assessments = await loadAssessments(tenant);
  const idx = assessments.findIndex((a) => a.id === body.id);
  if (idx === -1) {
    return NextResponse.json({ ok: false, error: "Assessment not found" }, { status: 404 });
  }

  const existing = assessments[idx]!;
  const mergedChecklist = body.checklist
    ? { ...existing.checklist, ...body.checklist }
    : existing.checklist;
  const newScore = scoreChecklist(mergedChecklist);
  const newGaps = body.criticalGaps ?? existing.criticalGaps;
  const newRisk = computeRiskTier(newScore, newGaps);
  const newStatus = body.status ?? existing.status;

  const updated: VendorAIAssessment = {
    ...existing,
    checklist: mergedChecklist,
    checklistScore: newScore,
    riskTier: newRisk,
    criticalGaps: newGaps,
    status: newStatus,
    ...(body.overallFindings !== undefined ? { overallFindings: body.overallFindings } : {}),
    ...(body.contractReference !== undefined ? { contractReference: body.contractReference } : {}),
    nextReviewDate: nextReview(newStatus, newRisk),
    updatedAt: new Date().toISOString(),
  };

  assessments[idx] = updated;
  await setJson(blobKey(tenant), assessments);

  void writeAuditChainEntry({
    event: "vendor_ai_audit.updated",
    actor: gate.keyId ?? "system",
    detail: `${body.id} — score ${newScore}% (${newRisk})`,
  }).catch(() => {});

  return NextResponse.json({ ok: true, assessment: updated }, { headers: gate.headers });
}
