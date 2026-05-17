"use client";

import {
  EDD_CHECKLIST_DEFAULTS,
  type EddChecklistItem,
  type EvidenceEntry,
  type HitResolution,
  type HitResolutionVerdict,
  type SubjectDetail,
  type TimelineEvent,
  type UboEntry,
} from "@/lib/types";

const KEY = "hawkeye.subject-details.v1";

function loadAll(): Record<string, SubjectDetail> {
  if (typeof window === "undefined") return {};
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as Record<string, SubjectDetail>) : {};
  } catch {
    return {};
  }
}

function saveAll(map: Record<string, SubjectDetail>): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(KEY, JSON.stringify(map));
  } catch {
    /* quota exhausted */
  }
}

export function loadSubjectDetail(subjectId: string): SubjectDetail {
  return (
    loadAll()[subjectId] ?? {
      subjectId,
      eddChecklist: EDD_CHECKLIST_DEFAULTS.map((d) => ({
        ...d,
        completed: false,
      })),
      uboEntries: [],
      evidenceItems: [],
      timelineEvents: [
        {
          timestamp: new Date().toISOString(),
          event: "Subject opened in screening queue",
        },
      ],
    }
  );
}

export function saveSubjectDetail(detail: SubjectDetail): void {
  const all = loadAll();
  all[detail.subjectId] = detail;
  saveAll(all);
}

export function appendSubjectEvent(subjectId: string, event: string): void {
  const detail = loadSubjectDetail(subjectId);
  const updated: SubjectDetail = {
    ...detail,
    timelineEvents: [
      { timestamp: new Date().toISOString(), event },
      ...detail.timelineEvents,
    ],
  };
  saveSubjectDetail(updated);
}

export function appendSubjectEvidence(
  subjectId: string,
  entry: EvidenceEntry,
): void {
  const detail = loadSubjectDetail(subjectId);
  saveSubjectDetail({
    ...detail,
    evidenceItems: [entry, ...detail.evidenceItems],
  });
}

export function loadHitResolution(subjectId: string, hitRef: string): HitResolution | null {
  const detail = loadSubjectDetail(subjectId);
  return detail.hitResolutions?.find((r) => r.hitRef === hitRef) ?? null;
}

export function saveHitResolution(subjectId: string, resolution: HitResolution): void {
  const detail = loadSubjectDetail(subjectId);
  const existing = detail.hitResolutions ?? [];
  const updated = existing.filter((r) => r.hitRef !== resolution.hitRef);
  saveSubjectDetail({ ...detail, hitResolutions: [...updated, resolution] });
}

export type { EddChecklistItem, EvidenceEntry, HitResolution, HitResolutionVerdict, SubjectDetail, TimelineEvent, UboEntry };
