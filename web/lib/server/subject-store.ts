// Subject profile store for compliance case management (Part 4 of build spec).
// Storage: hs-subjects/<tenant>/<safe-subjectId>.json
//
// Separate from /api/subject-profile (screening snapshot history).
// This store tracks the compliance-law standing of a subject.

import { getJson, setJson, listKeys } from "./store";
import { writeAuditChainEntry } from "./audit-chain";
import type { RiskCategory, DueDiligenceLevel } from "./categorize";

export interface SubjectProfile {
  subjectId:          string;
  subjectName:        string;
  currentRiskCategory: RiskCategory;
  dueDiligence:       DueDiligenceLevel;
  nextReviewDate:     string;
  activeCaseId?:      string;
  lastScreenedAt?:    string;
  isPep:              boolean;
  hasStrSarOnRecord:  boolean;
  createdAt:          string;
  updatedAt:          string;
  notes?:             string;
}

type Tenant = string;

function safeId(s: string): string {
  return s.replace(/[^A-Za-z0-9._-]/g, "_").slice(0, 64);
}

function profileKey(tenant: Tenant, subjectId: string): string {
  return `hs-subjects/${safeId(tenant)}/${safeId(subjectId)}.json`;
}

function listPrefix(tenant: Tenant): string {
  return `hs-subjects/${safeId(tenant)}/`;
}

export async function upsertSubject(
  tenant: Tenant,
  subjectId: string,
  input: Omit<SubjectProfile, "createdAt" | "updatedAt">,
): Promise<SubjectProfile> {
  const key = profileKey(tenant, subjectId);
  const existing = await getJson<SubjectProfile>(key);
  const now = new Date().toISOString();
  const rec: SubjectProfile = {
    ...input,
    createdAt: existing?.createdAt ?? now,
    updatedAt: now,
  };
  await setJson(key, rec);
  void writeAuditChainEntry({
    event: "subject.profile_updated",
    actor: "system",
    subjectId,
    subjectName: input.subjectName,
    currentRiskCategory: input.currentRiskCategory,
    nextReviewDate: input.nextReviewDate,
  }, tenant).catch(() => undefined);
  return rec;
}

export async function loadSubject(
  tenant: Tenant,
  subjectId: string,
): Promise<SubjectProfile | null> {
  return getJson<SubjectProfile>(profileKey(tenant, subjectId));
}

export async function patchSubject(
  tenant: Tenant,
  subjectId: string,
  patch: Partial<SubjectProfile>,
  actor: string,
): Promise<SubjectProfile | null> {
  const key = profileKey(tenant, subjectId);
  const existing = await getJson<SubjectProfile>(key);
  if (!existing) return null;
  const now = new Date().toISOString();
  const updated: SubjectProfile = { ...existing, ...patch, updatedAt: now };
  await setJson(key, updated);
  void writeAuditChainEntry({
    event: "subject.profile_patched",
    actor,
    subjectId,
    patch: JSON.stringify(patch).slice(0, 200),
  }, tenant).catch(() => undefined);
  // Log review.overdue if nextReviewDate is in the past.
  if (updated.nextReviewDate && new Date(updated.nextReviewDate) < new Date()) {
    void writeAuditChainEntry({
      event: "review.overdue",
      actor: "system",
      subjectId,
      subjectName: updated.subjectName,
      nextReviewDate: updated.nextReviewDate,
      overdueByDays: Math.floor((Date.now() - new Date(updated.nextReviewDate).getTime()) / 86_400_000),
    }, tenant).catch(() => undefined);
  }
  return updated;
}

export async function listSubjects(tenant: Tenant): Promise<SubjectProfile[]> {
  const keys = await listKeys(listPrefix(tenant)).catch(() => [] as string[]);
  const items = await Promise.allSettled(
    keys.map((k) => getJson<SubjectProfile>(k)),
  );
  return items
    .filter((r): r is PromiseFulfilledResult<SubjectProfile> => r.status === "fulfilled" && r.value !== null)
    .map((r) => r.value);
}

export function reviewDueSoon(profile: SubjectProfile, withinDays = 7): boolean {
  if (!profile.nextReviewDate) return false;
  const ms = new Date(profile.nextReviewDate).getTime() - Date.now();
  return ms >= 0 && ms < withinDays * 86_400_000;
}
