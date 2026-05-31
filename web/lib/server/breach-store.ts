// Breach Register (Part 5 of the build spec).
//
// Storage:
//   hs-breach-register/counter.json      → { next: number }
//   hs-breach-register/<breachId>.json   → BreachRecord

import { getJson, setJson, listKeys } from "./store";
import { writeAuditChainEntry } from "./audit-chain";

export type BreachCategory = "minor" | "moderate" | "significant" | "critical";
export type BreachStatus   = "open" | "remediation_in_progress" | "closed";

export interface BreachRecord {
  breachId:         string;     // HS-BREACH-NNN
  loggedAt:         string;
  loggedBy:         string;
  category:         BreachCategory;
  description:      string;
  regulatoryBasis:  string;
  linkedCaseId?:    string;
  linkedAuditSeq?:  number;
  status:           BreachStatus;
  owner:            string;
  dueDate:          string;     // ISO date
  closedAt?:        string;
  closureEvidence?: string;
}

const COUNTER_KEY = "hs-breach-register/counter.json";

function safeBreachId(id: string): string {
  return id.replace(/[^A-Za-z0-9._\-:]/g, "_").slice(0, 64);
}

function breachKey(breachId: string): string {
  return `hs-breach-register/${safeBreachId(breachId)}.json`;
}

function dueDays(category: BreachCategory): number {
  switch (category) {
    case "critical":     return 5;
    case "significant":  return 10;
    case "moderate":     return 20;
    case "minor":        return 30;
  }
}

async function nextBreachNumber(): Promise<number> {
  const counter = await getJson<{ next: number }>(COUNTER_KEY);
  const next = (counter?.next ?? 0) + 1;
  await setJson(COUNTER_KEY, { next });
  return next;
}

export function formatBreachId(n: number): string {
  return `HS-BREACH-${String(n).padStart(3, "0")}`;
}

export async function createBreach(
  input: Omit<BreachRecord, "breachId" | "loggedAt" | "dueDate" | "status">,
): Promise<BreachRecord> {
  const n = await nextBreachNumber();
  const breachId = formatBreachId(n);
  const loggedAt = new Date().toISOString();
  const due = new Date(loggedAt);
  due.setDate(due.getDate() + dueDays(input.category));
  const rec: BreachRecord = {
    ...input,
    breachId,
    loggedAt,
    status: "open",
    dueDate: due.toISOString().slice(0, 10),
  };
  await setJson(breachKey(breachId), rec);
  void writeAuditChainEntry({
    event: "breach.logged",
    actor: input.loggedBy,
    breachId,
    category: input.category,
    description: input.description.slice(0, 200),
    regulatoryBasis: input.regulatoryBasis,
  }).catch(() => undefined);
  return rec;
}

export async function loadBreach(breachId: string): Promise<BreachRecord | null> {
  return getJson<BreachRecord>(breachKey(breachId));
}

export async function updateBreach(
  breachId: string,
  patch: Partial<Pick<BreachRecord, "status" | "closedAt" | "closureEvidence" | "owner" | "dueDate">>,
  actor?: string,
): Promise<BreachRecord | null> {
  const existing = await loadBreach(breachId);
  if (!existing) return null;
  const updated: BreachRecord = { ...existing, ...patch };
  await setJson(breachKey(breachId), updated);
  void writeAuditChainEntry({
    event: "breach.updated",
    actor: actor ?? "system",
    breachId,
    status: updated.status,
  }).catch(() => undefined);
  return updated;
}

export async function listBreaches(filters?: {
  status?: BreachStatus;
  category?: BreachCategory;
}): Promise<BreachRecord[]> {
  const keys = await listKeys("hs-breach-register/").catch(() => [] as string[]);
  const dataKeys = keys.filter((k) => k !== COUNTER_KEY && !k.endsWith("counter.json"));
  const loaded = await Promise.all(
    dataKeys.map((k) => getJson<BreachRecord>(k).catch(() => null)),
  );
  let breaches = loaded.filter((b): b is BreachRecord => b !== null);
  if (filters?.status) breaches = breaches.filter((b) => b.status === filters.status);
  if (filters?.category) breaches = breaches.filter((b) => b.category === filters.category);
  breaches.sort((a, b) => b.loggedAt.localeCompare(a.loggedAt));
  return breaches;
}

// ── Pre-populate 7 confirmed breaches from live system data ──────────────────
// Called once on first deploy (idempotent — skips if counter > 0).

const SEED_BREACHES: Omit<BreachRecord, "breachId" | "loggedAt" | "dueDate" | "status">[] = [
  {
    loggedBy: "system",
    category: "moderate",
    description: "UAE EOCN list stale by 165.7 hours (~7 days). Multiple screenings completed while list was degraded. Results are unreliable.",
    regulatoryBasis: "Cabinet Resolution 74 of 2020 — mandatory UAE EOCN list refresh required within 24h",
    owner: "MLRO",
  },
  {
    loggedBy: "system",
    category: "moderate",
    description: "UAE Local Terrorist List (LTL) stale by 165.7 hours (~7 days). Multiple screenings completed while list was degraded.",
    regulatoryBasis: "Cabinet Resolution 74 of 2020 — mandatory UAE LTL refresh required within 24h",
    owner: "MLRO",
  },
  {
    loggedBy: "system",
    category: "significant",
    description: "OZCAN HALAC — CRITICAL severity alert (17-18 hits across OFAC SDN and EU FSF) raised 19 May 2026. System has been alerting daily. No case opened, no disposition recorded, no four-eyes initiated.",
    regulatoryBasis: "FDL No.10/2025 Art.18 — MLRO must investigate and decide within 5 days of alert",
    owner: "MLRO",
  },
  {
    loggedBy: "system",
    category: "significant",
    description: "Viktor Bout — four-eyes approval items enqueued (audit seq 0 and 1) but never completed. Case never opened. Subject remains on OFAC SDN / UN 1267 lists with HIGH severity.",
    regulatoryBasis: "FDL No.10/2025 Art.16 — four-eyes dual-approval process must be completed for all STR/freeze actions",
    owner: "MLRO",
  },
  {
    loggedBy: "system",
    category: "significant",
    description: "Khaled Abdullah — CRITICAL severity screening (70 hits). No case opened, no enrichment run, no disposition. enrichmentPending remains true.",
    regulatoryBasis: "FDL No.10/2025 Art.18 — MLRO must investigate and decide within 5 days of screening.completed event",
    owner: "MLRO",
  },
  {
    loggedBy: "system",
    category: "moderate",
    description: "Multiple screenings completed with listsDegraded > 0 (UAE EOCN and LTL stale). All screening results from approximately 13 May to 20 May 2026 are marked provisional and require re-screening once lists are refreshed.",
    regulatoryBasis: "FG/RDG — Guidance on Sanctions Screening Obligations: screenings performed with degraded list coverage must be flagged and repeated",
    owner: "MLRO",
  },
  {
    loggedBy: "system",
    category: "moderate",
    description: "All screenings in the audit trail show enrichmentPending: true with no corresponding resolution. PEP lookup, adverse media analysis, and country-risk enrichment were never completed for any screened subject.",
    regulatoryBasis: "FG/RDG — Enhanced Due Diligence requires complete enrichment before final disposition",
    owner: "MLRO",
  },
];

export async function seedBreachesIfEmpty(): Promise<void> {
  const counter = await getJson<{ next: number }>(COUNTER_KEY);
  if (counter && counter.next > 0) return; // already seeded
  for (const seed of SEED_BREACHES) {
    await createBreach(seed).catch((err) =>
      console.warn("[breach-store] seed failed:", err instanceof Error ? err.message : String(err)),
    );
  }
}
