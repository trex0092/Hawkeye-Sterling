"use client";

// Client-side case register. localStorage is the primary source of
// truth for instant render and cross-reload persistence; an optional
// server-side mirror at /api/cases (Netlify Blobs) provides:
//   - cross-device durability (same operator on a different browser
//     sees the same cases)
//   - regulator audit (the deployment can produce its case register
//     server-side, not just from a browser the operator happens to be
//     on)
//   - localStorage-clear resistance
//
// The sync layer is fire-and-forget: synchronous read/write APIs stay
// unchanged, and an async POST mirrors the latest localStorage state
// to the server after every mutation. On boot, syncFromServer() pulls
// the merged state once and writes it back to localStorage so other
// devices' work shows up. Failures are silent — localStorage stays
// authoritative when the network or backend is unavailable.

import type { CaseRecord, CaseStatus, EvidenceCategory } from "@/lib/types";
import { formatDMY } from "@/lib/utils/dateFormat";

const STORAGE_KEY = "hawkeye.cases.v1";
const SYNC_FLAG_KEY = "hawkeye.cases.serverSyncedOnce";
const SYNC_DEBOUNCE_MS = 600;

export function isBrowser(): boolean {
  return typeof window !== "undefined" && typeof window.localStorage !== "undefined";
}

export function loadCases(): CaseRecord[] {
  if (!isBrowser()) return [];
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed as CaseRecord[];
  } catch {
    return [];
  }
}

// Debounced async push of the latest localStorage state to /api/cases.
// Coalesces rapid mutations (multi-step STR flow that calls appendCase
// then attachEvidenceToSubject) into a single POST.
let syncTimer: ReturnType<typeof setTimeout> | null = null;
function scheduleServerSync(): void {
  if (!isBrowser()) return;
  if (syncTimer) clearTimeout(syncTimer);
  syncTimer = setTimeout(() => {
    syncTimer = null;
    void pushToServer();
  }, SYNC_DEBOUNCE_MS);
}

async function pushToServer(): Promise<void> {
  if (!isBrowser()) return;
  try {
    const cases = loadCases();
    const adminToken = process.env.NEXT_PUBLIC_ADMIN_TOKEN ?? "";
    const r = await fetch("/api/cases", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        accept: "application/json",
        ...(adminToken ? { authorization: `Bearer ${adminToken}` } : {}),
      },
      body: JSON.stringify({ cases }),
    });
    if (!r.ok) return;
    const body = (await r.json()) as { ok?: boolean; cases?: CaseRecord[] };
    if (body.ok && Array.isArray(body.cases)) {
      // Server returned merged state (it may include cases written by
      // another device since our last sync). Mirror it locally without
      // re-triggering scheduleServerSync — that would loop forever.
      try {
        window.localStorage.setItem(STORAGE_KEY, JSON.stringify(body.cases));
        window.dispatchEvent(new CustomEvent("hawkeye:cases-updated"));
      } catch {
        /* quota / disabled */
      }
    }
  } catch {
    /* offline / 4xx — localStorage stays authoritative */
  }
}

// One-shot pull on app boot so cases written from another device or
// the server-side seed show up. Idempotent — re-running just rewrites
// localStorage with the latest merged state.
export async function syncFromServer(): Promise<void> {
  if (!isBrowser()) return;
  try {
    const local = loadCases();
    const adminToken = process.env.NEXT_PUBLIC_ADMIN_TOKEN ?? "";
    // POST not GET so the server merges what we have with what it
    // has and returns the combined state in one round-trip.
    const r = await fetch("/api/cases", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        accept: "application/json",
        ...(adminToken ? { authorization: `Bearer ${adminToken}` } : {}),
      },
      body: JSON.stringify({ cases: local }),
    });
    if (!r.ok) return;
    const body = (await r.json()) as { ok?: boolean; cases?: CaseRecord[] };
    if (body.ok && Array.isArray(body.cases)) {
      try {
        window.localStorage.setItem(STORAGE_KEY, JSON.stringify(body.cases));
        window.localStorage.setItem(SYNC_FLAG_KEY, "1");
        window.dispatchEvent(new CustomEvent("hawkeye:cases-updated"));
      } catch {
        /* quota / disabled */
      }
    }
  } catch {
    /* offline — localStorage is fine */
  }
}

export function saveCases(cases: CaseRecord[]): void {
  if (!isBrowser()) return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(cases));
    // Notify other tabs / components listening on this key.
    window.dispatchEvent(new CustomEvent("hawkeye:cases-updated"));
    // Mirror to server (debounced, fire-and-forget).
    scheduleServerSync();
  } catch {
    /* storage quota exhausted or disabled — no-op */
  }
}

export function appendCase(record: CaseRecord): void {
  const existing = loadCases();
  // Dedupe by id — the caller usually generates a fresh id, but guard
  // against double-submits from an accidental double-click.
  const filtered = existing.filter((c) => c.id !== record.id);
  saveCases([record, ...filtered]);
}

export function deleteCase(id: string): void {
  const existing = loadCases();
  saveCases(existing.filter((c) => c.id !== id));
  // Server-side merge would resurrect the deleted case (it preserves
  // records on either side), so the delete needs an explicit call.
  // Fire-and-forget — the localStorage write is the authoritative
  // source for this client; the server hits eventual consistency on
  // success and stays converged on failure.
  if (isBrowser()) {
    void deleteCaseOnServer(id);
  }
}

async function deleteCaseOnServer(id: string): Promise<void> {
  try {
    const adminToken = process.env.NEXT_PUBLIC_ADMIN_TOKEN ?? "";
    await fetch(`/api/cases/${encodeURIComponent(id)}`, {
      method: "DELETE",
      headers: {
        accept: "application/json",
        ...(adminToken ? { authorization: `Bearer ${adminToken}` } : {}),
      },
    });
  } catch {
    /* offline — server will pick up the deletion on the next merge */
  }
}

/**
 * Records the Asana task permalink against a case after the report POST
 * succeeds. Called from STR/SAR submit handlers, screening auto-report,
 * and TM filing — anywhere /api/{sar,screening,tm,module}-report returns
 * a taskUrl. Surfaces as the persistent green pill in detail panels.
 */
export function attachAsanaTaskUrl(id: string, taskUrl: string): void {
  const existing = loadCases();
  const next = existing.map((c) =>
    c.id === id ? { ...c, asanaTaskUrl: taskUrl } : c,
  );
  saveCases(next);
}

// Evidence-vault helper: attach a new evidence entry + audit-trail
// event to an existing case, or to the most-recent case that matches
// a subject name when the caller doesn't know the case ID yet.
// Silently no-ops when the subject has no case yet — we don't want
// to create cases from screening-side downloads.
export interface EvidenceAttachInput {
  category: EvidenceCategory;
  title: string;
  meta: string;
  detail: string;
  timelineEvent?: string;
}

function findCaseFor(subject: string): CaseRecord | null {
  const all = loadCases();
  const norm = subject.trim().toLowerCase();
  return (
    all.find((c) => c.subject.toLowerCase() === norm) ??
    all.find((c) => c.subject.toLowerCase().includes(norm)) ??
    null
  );
}

export function attachEvidenceToSubject(
  subject: string,
  entry: EvidenceAttachInput,
): void {
  const target = findCaseFor(subject);
  if (!target) return;
  attachEvidenceToCase(target.id, entry);
}

export function attachEvidenceToCase(
  caseId: string,
  entry: EvidenceAttachInput,
): void {
  const all = loadCases();
  const idx = all.findIndex((c) => c.id === caseId);
  if (idx < 0) return;
  const existing = all[idx]!;
  const now = new Date();
  const next: CaseRecord = {
    ...existing,
    evidenceCount: String(existing.evidence.length + 1).padStart(2, "0"),
    lastActivity: "just now",
    evidence: [
      ...existing.evidence,
      {
        category: entry.category,
        title: entry.title,
        meta: entry.meta,
        detail: entry.detail,
      },
    ],
    timeline: [
      ...existing.timeline,
      {
        timestamp: now.toISOString(),
        event: entry.timelineEvent ?? `Evidence attached — ${entry.title}`,
      },
    ],
  };
  const updated = [...all.slice(0, idx), next, ...all.slice(idx + 1)];
  saveCases(updated);
}

export interface NewCaseInput {
  subject: string;
  subjectJurisdiction?: string;
  reportKind: string;
  amountAed?: string;
  status: CaseStatus;
  statusLabel: string;
  statusDetail: string;
  goAMLReference?: string;
  mlroDisposition?: string;
  /** Optional screening + super-brain snapshot captured at case-open.
   *  When present, persisted on the CaseRecord and consumed by the
   *  case-page compliance report so the case-page render reproduces
   *  the screening panel's report verbatim, with real composite
   *  scores / typologies / signatures rather than invented placeholders. */
  screeningSnapshot?: import("@/lib/types").CaseRecord["screeningSnapshot"];
}

// Build a CaseRecord from the minimal STR-filing inputs. Fills the
// display-only fields with sensible defaults so the Cases table and the
// right-hand detail panel render without undefineds.
export function buildCaseRecord(input: NewCaseInput): CaseRecord {
  const now = new Date();
  const id = `CASE-${now.getFullYear()}-${String(now.getTime()).slice(-6)}`;
  const opened = formatDMY(now);
  return {
    id,
    badge: id.split("-").pop() ?? "00",
    badgeTone: input.status === "reported" ? "green" : "violet",
    subject: input.subject,
    meta: [input.reportKind, input.subjectJurisdiction, input.amountAed ? `AED ${input.amountAed}` : null]
      .filter(Boolean)
      .join(" · "),
    status: input.status,
    evidenceCount: "0",
    lastActivity: "just now",
    opened,
    ...(input.goAMLReference ? { goAMLReference: input.goAMLReference } : {}),
    ...(input.mlroDisposition ? { mlroDisposition: input.mlroDisposition } : {}),
    ...(input.status === "reported" ? { reported: opened } : {}),
    statusLabel: input.statusLabel,
    statusDetail: input.statusDetail,
    evidence: [],
    timeline: [
      { timestamp: now.toISOString(), event: `Case opened via ${input.reportKind}` },
    ],
    ...(input.screeningSnapshot
      ? { screeningSnapshot: input.screeningSnapshot }
      : {}),
  };
}
