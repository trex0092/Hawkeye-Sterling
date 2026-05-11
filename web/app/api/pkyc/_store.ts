// Shared pKYC types and Blobs helpers — imported by route.ts and run/route.ts.
// Underscore prefix keeps Next.js from treating this as a route file.
//
// Uses the shared store.ts wrapper (hawkeye-sterling Blobs store with credential
// passing and in-memory fallback) rather than direct @netlify/blobs calls.
// Key prefix: "pkyc/" — all pKYC data is namespaced within the main store.

import { getJson, setJson, listKeys } from "@/lib/server/store";

export type PKycCadence = "daily" | "weekly" | "monthly" | "quarterly" | "annual";
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

export async function listSubjects(): Promise<PKycSubject[]> {
  try {
    const keys = await listKeys("pkyc/subject/");
    const subjects = await Promise.all(keys.map((k) => getJson<PKycSubject>(k)));
    return subjects.filter((s): s is PKycSubject => s !== null);
  } catch { return []; }
}

export async function getSubject(id: string): Promise<PKycSubject | null> {
  return getJson<PKycSubject>(`pkyc/subject/${id}`).catch(() => null);
}

export async function saveSubject(subject: PKycSubject): Promise<void> {
  await setJson(`pkyc/subject/${subject.id}`, subject);
}

export async function deleteSubject(id: string): Promise<void> {
  // store.ts has no delete — overwrite with tombstone marker
  await setJson(`pkyc/subject/${id}`, null).catch(() => {});
}

export async function saveDelta(delta: PKycDelta): Promise<void> {
  await setJson(`pkyc/delta/${delta.id}`, delta).catch((err) =>
    console.warn("[pkyc] saveDelta failed:", err instanceof Error ? err.message : err)
  );
}
