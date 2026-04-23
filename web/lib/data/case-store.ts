"use client";

// Client-side case register, backed by localStorage so an STR filing or
// a screening-panel escalation shows up on the /cases page (and persists
// across page reloads). Mirrors the pattern used by transaction-monitor
// — no server round-trip, no blob store, no SSR shenanigans.
//
// This replaces the hardcoded-empty `CASES = []` array so the Cases page
// actually reflects filings the operator has made.

import type { CaseRecord, CaseStatus } from "@/lib/types";

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
