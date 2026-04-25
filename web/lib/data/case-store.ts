"use client";

// Client-side case register, backed by localStorage so an STR filing or
// a screening-panel escalation shows up on the /cases page (and persists
// across page reloads). Mirrors the pattern used by transaction-monitor
// — no server round-trip, no blob store, no SSR shenanigans.
//
// This replaces the hardcoded-empty `CASES = []` array so the Cases page
// actually reflects filings the operator has made.

import type { CaseRecord, CaseStatus, EvidenceCategory } from "@/lib/types";

const STORAGE_KEY = "hawkeye.cases.v1";

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

export function saveCases(cases: CaseRecord[]): void {
  if (!isBrowser()) return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(cases));
    // Notify other tabs / components listening on this key.
    window.dispatchEvent(new CustomEvent("hawkeye:cases-updated"));
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
  const newEvidence = {
    category: entry.category,
    title: entry.title,
    meta: entry.meta,
    detail: entry.detail,
  };
  // Deduplicate by title+category — guard against double-submits.
  const alreadyExists = existing.evidence.some(
    (e) => e.title === newEvidence.title && e.category === newEvidence.category,
  );
  if (alreadyExists) return;
  const next: CaseRecord = {
    ...existing,
    evidenceCount: String(existing.evidence.length + 1).padStart(2, "0"),
    lastActivity: "just now",
    evidence: [...existing.evidence, newEvidence],
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
}

// Build a CaseRecord from the minimal STR-filing inputs. Fills the
// display-only fields with sensible defaults so the Cases table and the
// right-hand detail panel render without undefineds.
export function buildCaseRecord(input: NewCaseInput): CaseRecord {
  const now = new Date();
  const id = `CASE-${now.getFullYear()}-${String(now.getTime()).slice(-6)}`;
  const opened = now.toLocaleDateString("en-GB");
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
  };
}
