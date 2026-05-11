// Shared pKYC types and Blobs helpers — imported by route.ts and run/route.ts.
// Underscore prefix keeps Next.js from treating this as a route file.

export type PKycCadence = "daily" | "weekly" | "monthly" | "quarterly" | "annual";
export type PKycStatus = "active" | "pending_review" | "suspended" | "archived";
export type PKycRiskBand = "clear" | "low" | "medium" | "high" | "critical";

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

async function getStore() {
  try {
    const mod = await import("@netlify/blobs").catch(() => null);
    if (!mod) return null;
    return mod.getStore({ name: "pkyc" });
  } catch { return null; }
}

export async function listSubjects(): Promise<PKycSubject[]> {
  const store = await getStore();
  if (!store) return [];
  try {
    const listed = await store.list({ prefix: "subject/" });
    const subjects = await Promise.all(
      listed.blobs.map((b: { key: string }) =>
        store.get(b.key, { type: "json" }).catch(() => null)
      )
    );
    return subjects.filter((s): s is PKycSubject => s !== null);
  } catch { return []; }
}

export async function getSubject(id: string): Promise<PKycSubject | null> {
  const store = await getStore();
  if (!store) return null;
  return store.get(`subject/${id}`, { type: "json" }).catch(() => null) as Promise<PKycSubject | null>;
}

export async function saveSubject(subject: PKycSubject): Promise<void> {
  const store = await getStore();
  if (!store) return;
  await store.setJSON(`subject/${subject.id}`, subject);
}

export async function deleteSubject(id: string): Promise<void> {
  const store = await getStore();
  if (!store) return;
  await store.delete(`subject/${id}`).catch(() => {});
}
