"use client";

import { useDeferredValue, useEffect, useMemo, useState, useCallback } from "react";
import { Header } from "@/components/layout/Header";
import { Sidebar } from "@/components/layout/Sidebar";
import { ScreeningHero } from "@/components/screening/ScreeningHero";
import { ScreeningToolbar } from "@/components/screening/ScreeningToolbar";
import { ScreeningTable } from "@/components/screening/ScreeningTable";
import { SubjectDetailPanel } from "@/components/screening/SubjectDetailPanel";
import {
  NewScreeningForm,
  type ScreeningFormData,
} from "@/components/screening/NewScreeningForm";
import { QUEUE_FILTERS, SUBJECTS } from "@/lib/data/subjects";
import { lookupKnownPEP } from "@/lib/data/known-entities";
import type { CDDPosture, FilterKey, QueueFilter, SortKey, Subject } from "@/lib/types";
import { fetchJson } from "@/lib/api/fetchWithRetry";
import { ActivityFeed } from "@/components/screening/ActivityFeed";
import { writeAuditEvent } from "@/lib/audit";
import { AsanaReportButton } from "@/components/shared/AsanaReportButton";
import { IsoDateInput } from "@/components/ui/IsoDateInput";

// ── Adverse Media types ───────────────────────────────────────────────────────

type AdverseRiskTier = "clear" | "low" | "medium" | "high" | "critical";

interface AdverseMediaFinding {
  itemId: string;
  title: string;
  source: string;
  published: string;
  url?: string;
  severity: "critical" | "high" | "medium" | "low" | "clear";
  categories: string[];
  keywords: string[];
  fatfRecommendations: string[];
  fatfPredicates: string[];
  reasoningModes: string[];
  narrative: string;
  relevanceScore: number;
  isSarCandidate: boolean;
}

interface AdverseMediaVerdict {
  subject: string;
  riskTier: AdverseRiskTier;
  riskDetail: string;
  totalItems: number;
  adverseItems: number;
  criticalCount: number;
  highCount: number;
  mediumCount: number;
  lowCount: number;
  sarRecommended: boolean;
  sarBasis: string;
  confidenceTier: "high" | "medium" | "low";
  confidenceBasis: string;
  counterfactual: string;
  investigationLines: string[];
  findings: AdverseMediaFinding[];
  fatfRecommendations: string[];
  categoryBreakdown: Array<{ categoryId: string; displayName: string; count: number; severity: string }>;
  analysedAt: string;
  modesCited: string[];
}

interface AdverseMediaApiResponse {
  ok: boolean;
  totalCount?: number;
  adverseCount?: number;
  highRelevanceCount?: number;
  verdict?: AdverseMediaVerdict;
  error?: string;
}

const ADVERSE_TIER_STYLE: Record<AdverseRiskTier, string> = {
  critical: "bg-red-dim text-red border border-red/30",
  high:     "bg-red-dim text-red border border-red/30",
  medium:   "bg-amber-dim text-amber border border-amber/30",
  low:      "bg-amber-dim text-amber border border-amber/30",
  clear:    "bg-green-dim text-green border border-green/30",
};

const ADVERSE_SEV_STYLE: Record<string, string> = {
  critical: "bg-red-dim text-red",
  high:     "bg-red-dim text-red",
  medium:   "bg-amber-dim text-amber",
  low:      "bg-amber-dim text-amber",
  clear:    "bg-green-dim text-green",
};

// ─────────────────────────────────────────────────────────────────────────────

const CRITICAL_THRESHOLD = 85;
const SLA_BREACH_THRESHOLD_H = 24;

function parseSlaHours(sla: string): number {
  const match = sla.match(/\+?(\d+)h\s*(\d+)?m?/);
  if (!match || match[1] === undefined) return 999;
  const hours = Number.parseInt(match[1], 10);
  const minutes = match[2] ? Number.parseInt(match[2], 10) : 0;
  return hours + minutes / 60;
}

// Parse DD/MM/YYYY → Date
function parseOpenedDate(s: string): Date {
  const parts = s.split("/");
  if (parts.length !== 3) return new Date(0);
  const [dd, mm, yyyy] = parts;
  return new Date(
    Number(yyyy),
    Number(mm) - 1,
    Number(dd),
  );
}

const SANCTIONS_KEYWORDS = /ofac|sdn|un\b|eu\b|ofsi|eocn|sanction|cahra/i;

function applyFilter(subjects: Subject[], filter: FilterKey): Subject[] {
  const now = Date.now();
  switch (filter) {
    case "critical":
      return subjects.filter((s) => s.riskScore >= CRITICAL_THRESHOLD);
    case "sanctions":
      return subjects.filter(
        (s) => SANCTIONS_KEYWORDS.test(s.meta) || s.listCoverage.length >= 4,
      );
    case "edd":
      return subjects.filter((s) => s.cddPosture === "EDD");
    case "pep":
      return subjects.filter((s) => s.pep != null || /PEP/i.test(s.meta));
    case "sla":
      return subjects.filter((s) => parseSlaHours(s.slaNotify) <= SLA_BREACH_THRESHOLD_H);
    case "a24":
      // Subjects opened within the last 24 hours. Prefer the precise ISO
      // timestamp (openedAt) set on new subjects; fall back to the
      // day-precision dd/mm/yyyy value for legacy/seed entries.
      return subjects.filter((s) => {
        const ms = s.openedAt
          ? Date.parse(s.openedAt)
          : parseOpenedDate(s.openedAgo).getTime();
        return now - ms <= 24 * 60 * 60 * 1000;
      });
    case "closed":
      return subjects.filter((s) => s.status === "cleared");
    case "all":
    default:
      return subjects.filter((s) => s.status !== "cleared");
  }
}

function sortSubjects(
  subjects: Subject[],
  key: SortKey,
  dir: "asc" | "desc",
): Subject[] {
  const sign = dir === "asc" ? 1 : -1;
  return [...subjects].sort((a, b) => {
    switch (key) {
      case "riskScore":
        return sign * (a.riskScore - b.riskScore);
      case "slaNotify":
        return sign * (parseSlaHours(a.slaNotify) - parseSlaHours(b.slaNotify));
      case "status":
        return sign * a.status.localeCompare(b.status);
      case "cddPosture":
        return sign * a.cddPosture.localeCompare(b.cddPosture);
      case "name":
      default:
        return sign * a.name.localeCompare(b.name);
    }
  });
}

function nextSubjectId(existing: Subject[]): string {
  const used = new Set(
    existing
      .map((s) => Number.parseInt(s.id.replace(/^HS-/, ""), 10))
      .filter((n) => Number.isFinite(n)),
  );
  let n = 10001;
  while (used.has(n)) n += 1;
  return `HS-${n}`;
}

function buildSubject(data: ScreeningFormData, existing: Subject[]): Subject {
  const id = nextSubjectId(existing);
  const badgeNum = id.replace(/^HS-/, "").slice(-5);
  const knownPep = data.entityType === "individual" ? lookupKnownPEP(data.name) : null;
  const rawCountry =
    data.entityType === "individual"
      ? (data.countryLocation ?? data.citizenship ?? "")
      : (data.registeredCountry ?? "");
  const country = rawCountry || knownPep?.jurisdiction || "—";
  const metaBits: string[] = [];
  if (data.group) metaBits.push(data.group);
  if (data.riskCategory) metaBits.push(data.riskCategory);
  if (data.alternateNames.length > 0)
    metaBits.push(`aliases: ${data.alternateNames.join(", ")}`);
  if (knownPep) metaBits.push(`PEP · ${prettyPepTier(knownPep.tier)}`);
  if (data.ongoingScreening) metaBits.push("ongoing screening ON");

  const entityLabel = data.entityType === "individual" ? "Individual" : "Corporate";
  const relationLabel = data.relationshipType || (data.entityType === "individual" ? "UBO" : "Supplier");

  return {
    id,
    badge: badgeNum,
    badgeTone: "violet",
    name: data.name.trim(),
    ...(data.alternateNames.length > 0 ? { aliases: data.alternateNames } : {}),
    meta: metaBits.join(" · ") || "new subject",
    country: country.toUpperCase().slice(0, 20),
    jurisdiction: country.toUpperCase().slice(0, 6),
    type: `${entityLabel} · ${relationLabel}` as Subject["type"],
    entityType: data.entityType,
    riskScore: 0,
    status: "active",
    // Known PEPs auto-bump to EDD unless the analyst explicitly picks
    // a weaker posture on the form. Anything else honours the form
    // selection (defaulting to standard CDD).
    cddPosture: (knownPep
      ? (data.cddPosture ?? "EDD")
      : (data.cddPosture ?? "CDD")) as CDDPosture,
    listCoverage: [],
    ...(knownPep
      ? { pep: { tier: knownPep.tier, rationale: knownPep.rationale } }
      : {}),
    rca: { screened: data.checkTypes.rca },
    exposureAED: "0",
    slaNotify: "+72h 00m",
    mostSerious: "—",
    openedAgo: formatDDMMYY(new Date()),
    openedAt: new Date().toISOString(),
    ...(data.notes ? { notes: data.notes } : {}),
    ...(data.riskCategory ? { riskCategory: data.riskCategory } : {}),
  };
}

function prettyPepTier(tier: string): string {
  return tier.replace(/^tier_/, "tier ").replace(/_/g, " ");
}

// Inline transliteration map — Arabic + Cyrillic letters to their common
// Latin equivalents. Kept on the client so we can match the subject
// queue without a server round-trip. Covers the ~80% that drives
// sanctions false-negatives: ﻣﺤﻤﺪ → muhammad, Дмитрий → dmitrij, etc.
const ARABIC_TO_LATIN: Record<string, string> = {
  "ا": "a", "أ": "a", "إ": "i", "آ": "a", "ب": "b", "ت": "t", "ث": "th",
  "ج": "j", "ح": "h", "خ": "kh", "د": "d", "ذ": "dh", "ر": "r", "ز": "z",
  "س": "s", "ش": "sh", "ص": "s", "ض": "d", "ط": "t", "ظ": "z", "ع": "a",
  "غ": "gh", "ف": "f", "ق": "q", "ك": "k", "ل": "l", "م": "m", "ن": "n",
  "ه": "h", "و": "w", "ي": "y", "ى": "a", "ة": "h", "ء": "", "ؤ": "w", "ئ": "y",
};
const CYRILLIC_TO_LATIN: Record<string, string> = {
  "а": "a", "б": "b", "в": "v", "г": "g", "д": "d", "е": "e", "ё": "e",
  "ж": "zh", "з": "z", "и": "i", "й": "j", "к": "k", "л": "l", "м": "m",
  "н": "n", "о": "o", "п": "p", "р": "r", "с": "s", "т": "t", "у": "u",
  "ф": "f", "х": "kh", "ц": "ts", "ч": "ch", "ш": "sh", "щ": "sch",
  "ъ": "", "ы": "y", "ь": "", "э": "e", "ю": "yu", "я": "ya",
};
// Arabic-name romanisation families — the brain has the full list; we inline
// the most common to keep the client bundle small.
const ROMAN_FAMILIES: Record<string, string> = {
  mohamed: "muhammad", mohammed: "muhammad", mohammad: "muhammad",
  mohamad: "muhammad", mohd: "muhammad",
  ahmed: "ahmad", ahmet: "ahmad",
  husain: "hussein", husayn: "hussein", hussain: "hussein",
  yousef: "yusuf", youssef: "yusuf", yousuf: "yusuf",
  abdulla: "abdullah", abdallah: "abdullah",
  abdulaziz: "abdul aziz", abdelaziz: "abdul aziz",
  abdulrahman: "abdul rahman", abdurrahman: "abdul rahman",
  khaled: "khalid", khaleed: "khalid",
  fatimah: "fatima", fatma: "fatima",
  ayesha: "aisha", aicha: "aisha",
  omar: "umar", omer: "umar",
  said: "saeed", sayed: "saeed",
};
const PARTICLES = new Set(["al", "el", "bin", "ben", "bint", "abu", "ibn"]);

// Full native-script + variant normalisation. Runs on both the query and
// the subject name before scoring so "محمد" and "Mohamed" both collapse to
// the same "muhammad" token.
function normaliseForSearch(input: string): string {
  if (!input) return "";
  let s = input.toLowerCase().normalize("NFD").replace(/[\u0300-\u036F]/g, "");
  // Transliterate Arabic
  s = s.replace(/./gu, (ch) => ARABIC_TO_LATIN[ch] ?? ch);
  // Transliterate Cyrillic
  s = s.replace(/./gu, (ch) => CYRILLIC_TO_LATIN[ch] ?? ch);
  // Drop anything that isn't letter / space / dash
  s = s.replace(/[^a-z\s-]/g, " ").replace(/-/g, " ").replace(/\s+/g, " ").trim();
  // Canonicalise Arabic-name families and drop particles
  const tokens = s.split(" ").filter(Boolean);
  const out: string[] = [];
  for (const t of tokens) {
    if (PARTICLES.has(t)) continue;
    out.push(ROMAN_FAMILIES[t] ?? t);
  }
  return out.join(" ").trim();
}

// Simple soundex-style phonetic key — enough to catch "Volkov" ↔ "Volkof"
// without pulling in the full brain double-metaphone.
function phoneticKey(word: string): string {
  if (!word) return "";
  const s = word.toLowerCase().replace(/[^a-z]/g, "");
  if (!s) return "";
  const first = s[0]!;
  const map: Record<string, string> = {
    b: "1", f: "1", p: "1", v: "1",
    c: "2", g: "2", j: "2", k: "2", q: "2", s: "2", x: "2", z: "2",
    d: "3", t: "3",
    l: "4",
    m: "5", n: "5",
    r: "6",
  };
  let out = first.toUpperCase();
  let prev = map[first] ?? "";
  for (const ch of s.slice(1)) {
    const code = map[ch] ?? "";
    if (code && code !== prev) out += code;
    prev = code;
  }
  return (out + "000").slice(0, 4);
}

// Scored search: returns a relevance score [0..100] for a subject against query q.
// Higher score = better match. Returns 0 when the subject should not appear.
function searchScore(s: Subject, q: string): number {
  const name = s.name.toLowerCase();
  const id = s.id.toLowerCase();
  const country = s.country.toLowerCase();
  const meta = s.meta.toLowerCase();
  const aliasText = (s.aliases ?? []).join(" ").toLowerCase();

  if (name === q) return 100;
  if (id === q) return 98;
  if (name.startsWith(q)) return 92;
  if (name.includes(q)) return 82;
  if (aliasText.includes(q)) return 80;
  if (id.includes(q)) return 78;
  if (country.includes(q)) return 68;

  // Token-level partial match on name + aliases: score by fraction of query
  // tokens that prefix-match a name token (catches "moh" → "Mohammed").
  const qTokens = q.split(/\s+/).filter(Boolean);
  const nameTokens = `${name} ${aliasText}`.split(/\s+/).filter(Boolean);
  if (qTokens.length > 0 && nameTokens.length > 0) {
    const matched = qTokens.filter((qt) =>
      nameTokens.some((nt) => nt.startsWith(qt) || qt.startsWith(nt)),
    ).length;
    if (matched > 0) return 40 + Math.round((matched / qTokens.length) * 40);
  }

  // Native-script / transliteration match. Catches "محمد" → "Mohamed",
  // "Дмитрий" → "Dmitrij", "Mohamed" → "Muhammad" alias collapse.
  const qNorm = normaliseForSearch(q);
  const nameNorm = normaliseForSearch(s.name);
  const aliasNorm = (s.aliases ?? []).map(normaliseForSearch).join(" ");
  if (qNorm && nameNorm) {
    if (qNorm === nameNorm) return 95;
    if (nameNorm.includes(qNorm) || qNorm.includes(nameNorm)) return 76;
    if (aliasNorm && aliasNorm.includes(qNorm)) return 72;
  }

  // Phonetic soundex-style match — survives spelling variants the
  // transliteration layer didn't canonicalise ("Volkov" ↔ "Volkoff",
  // "Assad" ↔ "Asad"). Compare the first token as a cheap proxy.
  const qPhon = phoneticKey(qNorm.split(" ")[0] ?? q);
  const namePhon = phoneticKey(nameNorm.split(" ")[0] ?? name);
  if (qPhon && namePhon && qPhon === namePhon) return 55;

  if (meta.includes(q)) return 35;
  return 0;
}

function formatDDMMYY(d: Date): string {
  const dd = String(d.getDate()).padStart(2, "0");
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const yyyy = d.getFullYear();
  return `${dd}/${mm}/${yyyy}`;
}

const STORAGE_KEY = "hawkeye.screening-subjects.v1";

function loadSubjects(): Subject[] {
  if (typeof window === "undefined") return SUBJECTS;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return SUBJECTS;
    const parsed = JSON.parse(raw) as unknown;
    return Array.isArray(parsed) ? (parsed as Subject[]) : SUBJECTS;
  } catch {
    return SUBJECTS;
  }
}

function computeDynamicFilters(subjects: Subject[]): QueueFilter[] {
  const now = Date.now();
  return QUEUE_FILTERS.map((f) => {
    let count: number;
    switch (f.key) {
      case "all":
        count = subjects.filter((s) => s.status !== "cleared").length;
        break;
      case "critical":
        count = subjects.filter((s) => s.riskScore >= CRITICAL_THRESHOLD).length;
        break;
      case "sanctions":
        count = subjects.filter(
          (s) => SANCTIONS_KEYWORDS.test(s.meta) || s.listCoverage.length >= 4,
        ).length;
        break;
      case "edd":
        count = subjects.filter((s) => s.cddPosture === "EDD").length;
        break;
      case "pep":
        // Match both the structured pep flag (set on enrolment via
        // lookupKnownPEP) and the legacy meta-regex so subjects added
        // before the pep field existed still count.
        count = subjects.filter(
          (s) => s.pep != null || /PEP/i.test(s.meta),
        ).length;
        break;
      case "sla":
        count = subjects.filter(
          (s) => parseSlaHours(s.slaNotify) <= SLA_BREACH_THRESHOLD_H,
        ).length;
        break;
      case "a24":
        count = subjects.filter((s) => {
          const ms = s.openedAt
            ? Date.parse(s.openedAt)
            : parseOpenedDate(s.openedAgo).getTime();
          return now - ms <= 24 * 60 * 60 * 1000;
        }).length;
        break;
      case "closed":
        count = subjects.filter((s) => s.status === "cleared").length;
        break;
      default:
        count = 0;
    }
    return { ...f, count: String(count).padStart(2, "0") };
  });
}

export default function ScreeningPage() {
  const [subjects, setSubjects] = useState<Subject[]>(SUBJECTS);
  const [hydrated, setHydrated] = useState(false);
  const [activeFilter, setActiveFilter] = useState<FilterKey>("all");
  const [query, setQuery] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(
    SUBJECTS[0]?.id ?? null,
  );
  const [formOpen, setFormOpen] = useState(false);
  const [sortKey, setSortKey] = useState<SortKey>("riskScore");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  const [statusFilter, setStatusFilter] = useState<Subject["status"] | "all">("all");
  // Subject IDs whose quick-screen API call is in-flight. Drives the
  // "Screening…" badge and pulsing risk bar in the table.
  const [pendingIds, setPendingIds] = useState<ReadonlySet<string>>(new Set());
  // Subject IDs whose quick-screen call returned an error. Cleared on re-screen or delete.
  const [errorIds, setErrorIds] = useState<ReadonlySet<string>>(new Set());

  // Page-level tab: "queue" shows the normal screening queue; "adverse-media" shows the media intel search
  const [pageTab, setPageTab] = useState<"queue" | "adverse-media">("queue");

  // Adverse Media state
  const [amSubject, setAmSubject] = useState("");
  const [amDateFrom, setAmDateFrom] = useState("");
  const [amLoading, setAmLoading] = useState(false);
  const [amResult, setAmResult] = useState<AdverseMediaApiResponse | null>(null);
  const [amError, setAmError] = useState<string | null>(null);
  const [amExpanded, setAmExpanded] = useState<string | null>(null);

  useEffect(() => {
    const loaded = loadSubjects();
    setSubjects(loaded);
    setSelectedId((prev) => prev ?? loaded[0]?.id ?? null);
    setHydrated(true);
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(subjects));
    } catch {
      /* quota / disabled storage — skip */
    }
  }, [subjects, hydrated]);

  // After a deletion leaves selectedId null, fall back to the first visible
  // subject so the detail panel doesn't go blank unnecessarily.
  useEffect(() => {
    if (hydrated && selectedId === null && subjects.length > 0) {
      setSelectedId(subjects[0]!.id);
    }
  }, [hydrated, selectedId, subjects]);

  const deferredQuery = useDeferredValue(query);

  const dynamicFilters = useMemo(() => computeDynamicFilters(subjects), [subjects]);

  const filtered = useMemo(() => {
    let list = applyFilter(subjects, activeFilter);
    if (statusFilter !== "all") {
      list = list.filter((s) => s.status === statusFilter);
    }
    const q = deferredQuery.trim().toLowerCase();
    if (q) {
      return list
        .map((s) => ({ s, score: searchScore(s, q) }))
        .filter(({ score }) => score > 0)
        .sort((a, b) => b.score - a.score)
        .map(({ s }) => s);
    }
    return sortSubjects(list, sortKey, sortDir);
  }, [subjects, activeFilter, deferredQuery, sortKey, sortDir, statusFilter]);

  const selected = useMemo(
    () => subjects.find((s) => s.id === selectedId) ?? null,
    [subjects, selectedId],
  );

  const suggestedCaseId = useMemo(
    () => nextSubjectId(subjects).replace(/^HS-/, "CAS-"),
    [subjects],
  );

  const handleSortChange = useCallback((key: SortKey) => {
    setSortKey((prev) => {
      if (prev === key) {
        setSortDir((d) => (d === "asc" ? "desc" : "asc"));
        return prev;
      }
      setSortDir("desc");
      return key;
    });
  }, []);

  const handleUpdateSubject = useCallback((id: string, update: Partial<Subject>) => {
    setSubjects((prev) =>
      prev.map((s) => (s.id === id ? { ...s, ...update } : s)),
    );
  }, []);

  const handleSubmit = (data: ScreeningFormData, screen: boolean) => {
    const subject = buildSubject(data, subjects);
    setSubjects((prev) => [subject, ...prev]);
    if (screen) {
      setSelectedId(subject.id);
    }
    setFormOpen(false);

    // Write audit event for every new subject added
    writeAuditEvent(
      data.caseId ? `analyst (${data.caseId})` : "analyst",
      "subject.added",
      `${subject.name} (${subject.id})`,
    );
    // Mirror into server-side HMAC chain (fire-and-forget).
    void fetchJson("/api/audit/sign", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        action: "subject_added",
        target: `${subject.name} (${subject.id})`,
        actor: { role: "analyst", name: data.caseId || undefined },
        body: { id: subject.id, name: subject.name, entityType: data.entityType, caseId: data.caseId },
      }),
    }).then((r) => { if (!r.ok) console.warn("[audit-sign] subject_added failed", r.status, r.error); });

    // Auto-screen: call quick-screen and update risk score in background.
    // Mark the subject as pending so the table shows a "Screening…" badge.
    if (screen) {
      setPendingIds((prev) => new Set([...prev, subject.id]));
      void (async () => {
        try {
          const res = await fetchJson<{ ok: boolean; topScore?: number; severity?: string }>(
            "/api/quick-screen",
            {
              method: "POST",
              headers: { "content-type": "application/json" },
              body: JSON.stringify({ subject: { name: subject.name, aliases: data.alternateNames } }),
              label: "Auto-screen failed",
            },
          );
          if (res.ok && res.data?.ok && res.data.topScore !== undefined) {
            setSubjects((prev) =>
              prev.map((s) =>
                s.id === subject.id
                  ? { ...s, riskScore: res.data!.topScore ?? 0, mostSerious: res.data!.severity ?? s.mostSerious }
                  : s,
              ),
            );
            writeAuditEvent(
              "system",
              "screening.completed",
              `${subject.name} — score ${res.data.topScore} · ${res.data.severity}`,
            );
            // Mirror into server-side HMAC chain (fire-and-forget).
            void fetchJson("/api/audit/sign", {
              method: "POST",
              headers: { "content-type": "application/json" },
              body: JSON.stringify({
                action: "screening_completed",
                target: `${subject.name} (${subject.id})`,
                actor: { role: "analyst" },
                body: { topScore: res.data.topScore, severity: res.data.severity },
              }),
            }).then((r) => { if (!r.ok) console.warn("[audit-sign] screening_completed failed", r.status, r.error); });
          } else if (!res.ok) {
            // Surface API failures: mark the subject with a sentinel flag and
            // add to errorIds so the table can show an error badge.
            setSubjects((prev) =>
              prev.map((s) =>
                s.id === subject.id
                  ? { ...s, mostSerious: "screening-error" }
                  : s,
              ),
            );
            setErrorIds((prev) => new Set([...prev, subject.id]));
          }
        } finally {
          // Always clear the pending indicator regardless of success/failure.
          setPendingIds((prev) => {
            const next = new Set(prev);
            next.delete(subject.id);
            return next;
          });
        }
      })();
    }

    if (data.ongoingScreening) {
      void fetchJson("/api/ongoing", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          id: subject.id,
          name: subject.name,
          aliases: data.alternateNames,
          entityType: data.entityType,
          jurisdiction: data.citizenship || data.countryLocation || data.registeredCountry || "",
          group: data.group,
          caseId: data.caseId,
        }),
        label: "Ongoing enrolment failed",
      });
      writeAuditEvent(
        data.caseId ? `analyst (${data.caseId})` : "analyst",
        "ongoing.enrolled",
        `${subject.name} (${subject.id}) — ${data.ongoingScreening ? "ongoing" : "once"}`,
      );
      // Mirror into server-side HMAC chain (fire-and-forget).
      void fetchJson("/api/audit/sign", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          action: "ongoing_enrolled",
          target: `${subject.name} (${subject.id})`,
          actor: { role: "analyst" },
          body: { id: subject.id, name: subject.name },
        }),
      }).then((r) => { if (!r.ok) console.warn("[audit-sign] ongoing_enrolled failed", r.status, r.error); });
    }
  };

  const searchAdverseMedia = async () => {
    if (!amSubject.trim()) return;
    setAmLoading(true); setAmError(null); setAmResult(null);
    try {
      const body: Record<string, unknown> = { subject: amSubject.trim(), limit: 50 };
      if (amDateFrom) body.dateFrom = amDateFrom;
      const res = await fetch("/api/adverse-media", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json() as AdverseMediaApiResponse;
      if (!data.ok) setAmError(data.error ?? "Search failed");
      else setAmResult(data);
    } catch { setAmError("Request failed"); }
    finally { setAmLoading(false); }
  };

  const handleDelete = (id: string) => {
    setSubjects((prev) => prev.filter((s) => s.id !== id));
    // Update selection outside the setSubjects callback so it reads the
    // freshest selectedId state rather than a potentially-stale closure value.
    setSelectedId((prev) => (prev === id ? null : prev));
    // Also clear pending/error indicators if the subject is deleted mid-flight.
    setPendingIds((prev) => {
      if (!prev.has(id)) return prev;
      const next = new Set(prev);
      next.delete(id);
      return next;
    });
    setErrorIds((prev) => {
      if (!prev.has(id)) return prev;
      const next = new Set(prev);
      next.delete(id);
      return next;
    });
  };

  const criticalCount = subjects.filter((s) => s.riskScore >= CRITICAL_THRESHOLD).length;
  const slaCount = subjects.filter(
    (s) => parseSlaHours(s.slaNotify) <= SLA_BREACH_THRESHOLD_H,
  ).length;
  const avgRisk =
    subjects.length > 0
      ? Math.round(subjects.reduce((sum, s) => sum + s.riskScore, 0) / subjects.length)
      : 0;

  const amVerdict = amResult?.verdict;
  const amTabCls = (active: boolean) =>
    `px-3 py-2 text-12 font-medium border-b-2 transition-colors ${
      active ? "border-brand text-brand" : "border-transparent text-ink-3 hover:text-ink-1"
    }`;

  return (
    <>
      <Header />
      <div className="flex items-center gap-1 px-6 bg-bg-panel border-b border-hair-2">
        <button type="button" onClick={() => setPageTab("queue")} className={amTabCls(pageTab === "queue")}>
          Screening Queue
        </button>
        <button type="button" onClick={() => setPageTab("adverse-media")} className={amTabCls(pageTab === "adverse-media")}>
          Adverse Media Intelligence
        </button>
        <div className="ml-auto py-2">
          <AsanaReportButton payload={{ module: "screening", label: "Screening Queue", summary: "Screening queue status report from Hawkeye Sterling — sanctions, PEP and adverse media vectors reviewed." }} />
        </div>
      </div>

      {pageTab === "queue" && <div
        className="grid min-h-[calc(100vh-84px)]"
        style={{ gridTemplateColumns: "220px 1fr 480px" }}
      >
        <Sidebar
          filters={dynamicFilters}
          activeFilter={activeFilter}
          onFilterChange={setActiveFilter}
        />

        <main className="px-10 py-8 overflow-y-auto">
          <ScreeningHero
            inQueue={subjects.filter((s) => s.status !== "cleared").length}
            critical={criticalCount}
            slaRisk={slaCount}
            avgRisk={avgRisk}
          />
          <ScreeningToolbar
            query={query}
            onQueryChange={setQuery}
            onNewScreening={() => setFormOpen((o) => !o)}
            sortKey={sortKey}
            sortDir={sortDir}
            onSortChange={handleSortChange}
            statusFilter={statusFilter}
            onStatusFilterChange={setStatusFilter}
          />
          {formOpen && (
            <div className="mb-6">
              <NewScreeningForm
                suggestedCaseId={suggestedCaseId}
                onScreen={(data) => handleSubmit(data, true)}
                onSave={(data) => handleSubmit(data, false)}
                onCancel={() => setFormOpen(false)}
              />
            </div>
          )}
          <ScreeningTable
            subjects={filtered}
            selectedId={selectedId}
            onSelect={setSelectedId}
            onDelete={handleDelete}
            sortKey={sortKey}
            sortDir={sortDir}
            onSortChange={handleSortChange}
            pendingIds={pendingIds}
            errorIds={errorIds}
          />
        </main>

        {selected && !formOpen ? (
          <SubjectDetailPanel
            subject={selected}
            onUpdate={handleUpdateSubject}
          />
        ) : (
          <aside className="border-l border-[#ec4899] overflow-y-auto px-5 py-6">
            <ActivityFeed />
          </aside>
        )}
      </div>}

      {pageTab === "adverse-media" && (
        <main className="max-w-5xl mx-auto px-10 py-8">
          <div className="mb-6">
            <h2 className="text-32 font-display font-normal text-ink-0 leading-tight">
              Adverse Media <em className="italic text-brand">intelligence.</em>
            </h2>
            <p className="text-13 text-ink-2 mt-1">
              Weaponized MLRO pipeline — Taranis AI feed → 1 066-keyword taxonomy → FATF predicate mapping → SAR trigger (R.20)
            </p>
          </div>

          <div className="bg-bg-panel border border-hair-2 rounded-xl p-5 mb-6">
            <div className="flex gap-3 flex-wrap">
              <input
                className="flex-1 min-w-48 px-3 py-2 border border-hair-2 rounded text-13 bg-bg-1 focus:outline-none focus:border-brand text-ink-0"
                placeholder="Subject name — individual, company, or vessel"
                value={amSubject}
                onChange={(e) => setAmSubject(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && void searchAdverseMedia()}
              />
              <IsoDateInput
                className="px-3 py-2 border border-hair-2 rounded text-13 bg-bg-1 text-ink-2 focus:outline-none focus:border-brand"
                value={amDateFrom}
                onChange={setAmDateFrom}
                title="From date (optional)"
              />
              <button
                type="button"
                onClick={() => { void searchAdverseMedia(); }}
                disabled={amLoading || !amSubject.trim()}
                className="px-4 py-1.5 rounded bg-brand text-white text-12 font-semibold disabled:opacity-40 disabled:cursor-not-allowed hover:opacity-90 transition-opacity"
              >
                {amLoading ? "Searching…" : "Search"}
              </button>
            </div>
          </div>

          {amLoading && (
            <div className="flex items-center gap-2 text-13 text-ink-2 py-6 justify-center">
              <span className="animate-pulse font-mono text-brand">●</span>
              Adverse media pipeline running…
            </div>
          )}

          {amError && (
            <div className="bg-red-dim border border-red/30 rounded-lg p-3 text-12 text-red mb-4">
              <span className="font-semibold">Error:</span> {amError}
            </div>
          )}

          {amVerdict && (
            <div className="space-y-4">
              <div className={`border-2 rounded-xl p-5 ${amVerdict.riskTier === "critical" || amVerdict.riskTier === "high" ? "border-red/40" : amVerdict.riskTier === "medium" ? "border-amber/40" : "border-hair-2"}`}>
                <div className="flex items-start justify-between mb-3">
                  <div>
                    <h3 className="text-16 font-semibold text-ink-0">{amVerdict.subject}</h3>
                    <p className="text-12 text-ink-2 mt-0.5">{amVerdict.riskDetail}</p>
                  </div>
                  <span className={`text-11 font-bold px-2.5 py-1 rounded uppercase ${ADVERSE_TIER_STYLE[amVerdict.riskTier]}`}>
                    {amVerdict.riskTier}
                  </span>
                </div>

                <div className="grid grid-cols-5 gap-3 mb-4">
                  {[
                    { label: "Total", value: amVerdict.totalItems },
                    { label: "Adverse", value: amVerdict.adverseItems },
                    { label: "Critical", value: amVerdict.criticalCount },
                    { label: "High", value: amVerdict.highCount },
                    { label: "Medium", value: amVerdict.mediumCount },
                  ].map(({ label, value }) => (
                    <div key={label} className="bg-bg-1 border border-hair-2 rounded p-2 text-center">
                      <div className="text-18 font-mono font-semibold text-ink-0">{value}</div>
                      <div className="text-10 text-ink-3 uppercase tracking-wide-3">{label}</div>
                    </div>
                  ))}
                </div>

                {amVerdict.sarRecommended && (
                  <div className="bg-red-dim border border-red/30 rounded-lg p-3 mb-3">
                    <span className="text-12 font-bold text-red uppercase">SAR RECOMMENDED (FATF R.20)</span>
                    <p className="text-11 text-red/80 mt-1 leading-relaxed">{amVerdict.sarBasis}</p>
                  </div>
                )}

                {amVerdict.fatfRecommendations.length > 0 && (
                  <div className="flex flex-wrap gap-1.5 mb-3">
                    {amVerdict.fatfRecommendations.map((r) => (
                      <span key={r} className="text-11 bg-brand-dim text-brand border border-brand/30 px-2 py-0.5 rounded font-mono">{r}</span>
                    ))}
                  </div>
                )}

                <p className="text-11 text-ink-3">
                  Confidence: <span className="font-semibold text-ink-1">{amVerdict.confidenceTier.toUpperCase()}</span> — {amVerdict.confidenceBasis}
                </p>
              </div>

              {amVerdict.investigationLines.length > 0 && (
                <div className="bg-bg-panel border border-hair-2 rounded-xl p-5">
                  <div className="text-11 font-semibold uppercase tracking-wide-3 text-ink-2 mb-3">Investigation Actions</div>
                  <ol className="space-y-1.5">
                    {amVerdict.investigationLines.map((line, i) => (
                      <li key={i} className="flex gap-2 text-12 text-ink-1">
                        <span className="text-ink-3 font-mono text-11 flex-shrink-0">{i + 1}.</span>
                        <span>{line}</span>
                      </li>
                    ))}
                  </ol>
                </div>
              )}

              {amVerdict.categoryBreakdown.length > 0 && (
                <div className="bg-bg-panel border border-hair-2 rounded-xl p-5">
                  <div className="text-11 font-semibold uppercase tracking-wide-3 text-ink-2 mb-3">Category Breakdown</div>
                  <div className="space-y-2">
                    {amVerdict.categoryBreakdown.map((c) => (
                      <div key={c.categoryId} className="flex items-center justify-between text-12">
                        <span className="text-ink-1">{c.displayName}</span>
                        <div className="flex items-center gap-2">
                          <span className={`text-10 px-1.5 py-0.5 rounded font-semibold ${ADVERSE_SEV_STYLE[c.severity] ?? "bg-bg-2 text-ink-3"}`}>{c.severity}</span>
                          <span className="text-11 font-bold text-ink-2 w-4 text-right">{c.count}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <div className="bg-amber-dim border border-amber/30 rounded-xl p-4">
                <p className="text-11 font-semibold text-amber mb-1">Counterfactual Assessment</p>
                <p className="text-11 text-amber/80 leading-relaxed">{amVerdict.counterfactual}</p>
              </div>

              {amVerdict.findings.length > 0 && (
                <div className="bg-bg-panel border border-hair-2 rounded-xl overflow-hidden">
                  <div className="px-5 py-3 border-b border-hair-2">
                    <div className="text-11 font-semibold uppercase tracking-wide-3 text-ink-2">
                      Adverse Findings ({amVerdict.findings.length})
                    </div>
                  </div>
                  <div className="divide-y divide-hair">
                    {amVerdict.findings.map((f) => (
                      <div key={f.itemId} className="p-4">
                        <button
                          type="button"
                          className="w-full text-left flex items-start gap-3"
                          onClick={() => setAmExpanded(amExpanded === f.itemId ? null : f.itemId)}
                        >
                          <span className={`inline-block w-2 h-2 rounded-full flex-shrink-0 mt-1.5 ${f.severity === "critical" || f.severity === "high" ? "bg-red" : f.severity === "medium" || f.severity === "low" ? "bg-amber" : "bg-green"}`} />
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 flex-wrap mb-1">
                              <span className={`text-10 font-bold px-1.5 py-px rounded ${ADVERSE_SEV_STYLE[f.severity]}`}>{f.severity.toUpperCase()}</span>
                              {f.isSarCandidate && <span className="text-10 bg-red-dim text-red border border-red/30 px-1.5 py-px rounded font-bold">SAR</span>}
                              <span className="text-11 text-ink-3">{f.source} · {f.published.slice(0, 10)}</span>
                            </div>
                            <p className="text-12 font-medium text-ink-0 leading-snug">{f.title}</p>
                            <p className="text-11 text-ink-2 mt-0.5 leading-relaxed">{f.narrative}</p>
                          </div>
                          <span className="text-ink-3 text-11 flex-shrink-0">{amExpanded === f.itemId ? "▲" : "▼"}</span>
                        </button>

                        {amExpanded === f.itemId && (
                          <div className="mt-3 pl-5 space-y-2 border-l-2 border-hair-2">
                            {f.fatfPredicates.length > 0 && (
                              <div>
                                <p className="text-11 text-ink-3 font-semibold mb-1">FATF Predicates</p>
                                <ul className="space-y-0.5">
                                  {f.fatfPredicates.map((p, i) => <li key={i} className="text-11 text-ink-2">{p}</li>)}
                                </ul>
                              </div>
                            )}
                            <div className="flex flex-wrap gap-1">
                              {f.categories.map((c) => <span key={c} className="text-10 bg-bg-1 text-ink-2 border border-hair-2 px-1.5 py-px rounded">{c}</span>)}
                              {f.fatfRecommendations.map((r) => <span key={r} className="text-10 bg-brand-dim text-brand border border-brand/30 px-1.5 py-px rounded font-mono">{r}</span>)}
                            </div>
                            {f.keywords.length > 0 && (
                              <p className="text-11 text-ink-3">Keywords: {f.keywords.slice(0, 6).map((k) => `"${k}"`).join(", ")}</p>
                            )}
                            {f.url && (
                              <a href={f.url} target="_blank" rel="noopener noreferrer" className="text-11 text-brand hover:underline break-all">{f.url}</a>
                            )}
                            <p className="text-11 text-ink-3">Relevance: {(f.relevanceScore * 100).toFixed(0)}%</p>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {amVerdict.modesCited.length > 0 && (
                <p className="text-11 text-ink-3">Modes cited: {amVerdict.modesCited.join(", ")}</p>
              )}
            </div>
          )}

          {amResult?.ok && !amVerdict?.findings.length && !amLoading && (
            <div className="border border-hair-2 rounded-xl p-8 text-center text-12 text-ink-3">
              No adverse media found for <span className="font-medium text-ink-1">{amSubject}</span>
            </div>
          )}
        </main>
      )}
    </>
  );
}
