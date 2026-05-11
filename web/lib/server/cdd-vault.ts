// Server-side CDD review vault — tenant-scoped, per-review Blob storage.
//
// Storage layout:
//   hawkeye-cdd/<tenant>/reviews/<id>.json   full CddReviewRecord
//
// Review cadences (FDL 10/2025 Art.11 + FATF R.10):
//   high risk    → 90 days
//   medium risk  → 180 days
//   standard     → 365 days

import { getJson, setJson, del, listKeys } from "@/lib/server/store";

export interface CddReviewRecord {
  id: string;
  tenantId: string;
  subject: string;
  tier: "high" | "medium" | "standard";
  reviewDate: string;        // ISO date of last completed review
  nextReviewDate: string;    // computed from tier cadence
  daysOverdue: number;       // 0 when not yet due
  status: "due" | "overdue" | "completed" | "in_progress";
  notes: string;
  outcome?: "adequate" | "marginal" | "inadequate";
  adequacyScore?: number;    // 0–100 from cdd-adequacy AI
  enhancedMeasuresRequired?: boolean;
  gaps?: string[];
  recommendedActions?: string[];
  createdAt: string;
  updatedAt: string;
}

const CADENCE_DAYS: Record<CddReviewRecord["tier"], number> = {
  high: 90,
  medium: 180,
  standard: 365,
};

function safeTenant(tenantId: string): string {
  return tenantId.replace(/[^A-Za-z0-9._-]/g, "_").slice(0, 64);
}

function reviewKey(tenantId: string, id: string): string {
  return `hawkeye-cdd/${safeTenant(tenantId)}/reviews/${id}.json`;
}

function reviewPrefix(tenantId: string): string {
  return `hawkeye-cdd/${safeTenant(tenantId)}/reviews/`;
}

export function computeNextReviewDate(tier: CddReviewRecord["tier"], fromDate: string): string {
  const d = new Date(fromDate);
  if (isNaN(d.getTime())) {
    // Corrupt or missing date — default to today + cadence
    const fallback = new Date();
    fallback.setDate(fallback.getDate() + CADENCE_DAYS[tier]);
    return fallback.toISOString().split("T")[0]!;
  }
  d.setDate(d.getDate() + CADENCE_DAYS[tier]);
  return d.toISOString().split("T")[0]!;
}

export function computeDaysOverdue(nextReviewDate: string): number {
  const now = Date.now();
  const due = new Date(nextReviewDate).getTime();
  if (isNaN(due)) return 0;
  return Math.max(0, Math.floor((now - due) / 86_400_000));
}

function deriveStatus(
  nextReviewDate: string,
  explicit: CddReviewRecord["status"] | undefined,
): CddReviewRecord["status"] {
  if (explicit === "completed" || explicit === "in_progress") return explicit;
  return computeDaysOverdue(nextReviewDate) > 0 ? "overdue" : "due";
}

export async function listCddReviews(tenantId: string): Promise<CddReviewRecord[]> {
  const prefix = reviewPrefix(tenantId);
  const keys = await listKeys(prefix);
  const records = await Promise.all(keys.map((k) => getJson<CddReviewRecord>(k)));
  return records
    .filter((r): r is CddReviewRecord => r !== null)
    .map((r) => ({
      ...r,
      daysOverdue: computeDaysOverdue(r.nextReviewDate),
      status: deriveStatus(r.nextReviewDate, r.status),
    }))
    .sort((a, b) => b.daysOverdue - a.daysOverdue);
}

export async function getCddReview(tenantId: string, id: string): Promise<CddReviewRecord | null> {
  const r = await getJson<CddReviewRecord>(reviewKey(tenantId, id));
  if (!r) return null;
  return {
    ...r,
    daysOverdue: computeDaysOverdue(r.nextReviewDate),
    status: deriveStatus(r.nextReviewDate, r.status),
  };
}

export async function saveCddReview(tenantId: string, record: CddReviewRecord): Promise<void> {
  await setJson(reviewKey(tenantId, record.id), {
    ...record,
    updatedAt: new Date().toISOString(),
  });
}

export async function deleteCddReview(tenantId: string, id: string): Promise<void> {
  await del(reviewKey(tenantId, id));
}

export function newCddReviewId(): string {
  return `crr-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
}
