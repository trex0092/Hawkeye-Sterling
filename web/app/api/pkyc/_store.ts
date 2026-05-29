// Shared pKYC types and Blobs helpers — imported by route.ts and run/route.ts.
// Underscore prefix keeps Next.js from treating this as a route file.
//
// Uses the shared store.ts wrapper (hawkeye-sterling Blobs store with credential
// passing and in-memory fallback) rather than direct @netlify/blobs calls.
// Key prefix: "pkyc/" — all pKYC data is namespaced within the main store.

import { del, getJson, setJson, listKeys } from "@/lib/server/store";

function safeId(s: string): string {
  return s.replace(/[^A-Za-z0-9._-]/g, "_").slice(0, 128);
}

export type PKycCadence = "daily" | "weekly" | "monthly" | "quarterly" | "annual";

export function nextRunAt(cadence: PKycCadence, from = new Date()): string {
  const d = new Date(from);
  switch (cadence) {
    case "daily":   d.setUTCDate(d.getUTCDate() + 1); break;
    case "weekly":  d.setUTCDate(d.getUTCDate() + 7); break;
    case "monthly":
    case "quarterly":
    case "annual": {
      const monthsToAdd = cadence === "monthly" ? 1 : cadence === "quarterly" ? 3 : 12;
      const srcDay = from.getUTCDate();
      const targetTotalMonths = d.getUTCFullYear() * 12 + d.getUTCMonth() + monthsToAdd;
      const targetYear = Math.floor(targetTotalMonths / 12);
      const targetMonth = targetTotalMonths % 12;
      const lastDayOfTarget = new Date(Date.UTC(targetYear, targetMonth + 1, 0)).getUTCDate();
      d.setUTCFullYear(targetYear, targetMonth, Math.min(srcDay, lastDayOfTarget));
      break;
    }
  }
  return d.toISOString();
}
export type PKycStatus = "active" | "pending_review" | "suspended" | "archived";
export type PKycRiskBand = "clear" | "low" | "medium" | "high" | "critical";

export interface BehavioralBaseline {
  capturedAt: string;
  expectedTransactionFrequency: string;
  expectedCounterpartyCount: string;
  expectedCashUsage: string;
  expectedCrossJurisdictional: string;
  anomalyScore: number;
  deviations: string[];
}

export interface PKycSubject {
  id: string;
  name: string;
  entityType?: string;
  jurisdiction?: string;
  nationality?: string;
  dob?: string;
  aliases?: string[];
  caseId?: string;
  cadence: PKycCadence;
  status: PKycStatus;
  enrolledAt: string;
  lastRunAt: string | null;
  nextRunAt: string;
  lastBand: PKycRiskBand | null;
  lastComposite: number | null;
  lastHits: number;
  runCount: number;
  alertCount: number;
  notes?: string;
  mlro?: string;
  behavioralBaseline?: BehavioralBaseline;
  behavioralDrift?: string[];
}

export interface PKycDelta {
  id: string;
  subjectId: string;
  subjectName: string;
  detectedAt: string;
  kind: "new_hit" | "band_change" | "pep_reclassified" | "adverse_media" | "clear";
  from?: string;
  to?: string;
  detail: string;
  acknowledged: boolean;
}

export async function listSubjects(tenantId: string): Promise<PKycSubject[]> {
  try {
    const keys = await listKeys(`pkyc/${safeId(tenantId)}/subject/`);
    const subjects = await Promise.all(keys.map((k) => getJson<PKycSubject>(k)));
    return subjects.filter((s): s is PKycSubject => s !== null);
  } catch (err) {
    console.error("[pkyc] listSubjects failed:", err instanceof Error ? err.message : err);
    return [];
  }
}

export async function getSubject(id: string, tenantId: string): Promise<PKycSubject | null> {
  return getJson<PKycSubject>(`pkyc/${safeId(tenantId)}/subject/${safeId(id)}`).catch((err) => {
    console.error("[pkyc] getSubject failed:", err instanceof Error ? err.message : err);
    return null;
  });
}

export async function saveSubject(subject: PKycSubject, tenantId: string): Promise<void> {
  await setJson(`pkyc/${safeId(tenantId)}/subject/${safeId(subject.id)}`, subject);
}

export async function deleteSubject(id: string, tenantId: string): Promise<void> {
  await del(`pkyc/${safeId(tenantId)}/subject/${safeId(id)}`);
}

export async function saveDelta(delta: PKycDelta, tenantId: string): Promise<void> {
  await setJson(`pkyc/${safeId(tenantId)}/delta/${safeId(delta.id)}`, delta).catch((err) =>
    console.warn("[pkyc] saveDelta failed:", err instanceof Error ? err.message : err)
  );
}
