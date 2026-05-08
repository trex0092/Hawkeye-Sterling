"use client";

import { useDeferredValue, useEffect, useMemo, useRef, useState, useCallback } from "react";
import { Header } from "@/components/layout/Header";
import { Sidebar } from "@/components/layout/Sidebar";
import { ScreeningHero } from "@/components/screening/ScreeningHero";
import { ScreeningToolbar } from "@/components/screening/ScreeningToolbar";
import { ScreeningTable } from "@/components/screening/ScreeningTable";
import { SubjectDetailPanel } from "@/components/screening/SubjectDetailPanel";
import { ScreeningReasoningPanel, type ScreeningReasoning } from "@/components/screening/ScreeningReasoningPanel";
import { HitTriagePanel, type TriageHit, type Resolution } from "@/components/screening/HitTriagePanel";
import {
  NewScreeningForm,
  type ScreeningFormData,
} from "@/components/screening/NewScreeningForm";
import { QUEUE_FILTERS, SUBJECTS } from "@/lib/data/subjects";
import { lookupKnownPEP } from "@/lib/data/known-entities";
import type { CDDPosture, FilterKey, QueueFilter, SanctionSource, SavedSearch, SortKey, Subject, TableColumnKey } from "@/lib/types";
import type { NlSearchFilter } from "@/app/api/cases/nl-search/route";
import { fetchJson } from "@/lib/api/fetchWithRetry";
import { ActivityFeed } from "@/components/screening/ActivityFeed";
import { writeAuditEvent } from "@/lib/audit";
import { AsanaReportButton } from "@/components/shared/AsanaReportButton";
import { IsoDateInput } from "@/components/ui/IsoDateInput";
import { BulkImportDialog } from "@/components/screening/BulkImportDialog";
import { BatchTab } from "@/components/screening/BatchTab";
import { SavedSearchBar } from "@/components/screening/SavedSearchBar";
import { BulkActionsBar } from "@/components/screening/BulkActionsBar";
import { AmLanguageBreakdown } from "@/components/screening/AmLanguageBreakdown";
import { ComparePanel } from "@/components/screening/ComparePanel";
import { useKeyboardShortcuts } from "@/lib/hooks/useKeyboardShortcuts";
import { pushBellEvent } from "@/lib/bell-events";
import { loadColumnVisibility, persistColumnVisibility } from "@/components/screening/ColumnChooser";

// ── Bulk Re-Screen types ──────────────────────────────────────────────────────

interface NewHit {
  subjectId: string;
  subjectName: string;
  hitType: string;
  severity: "critical" | "high" | "medium" | "low";
}

interface BulkRescreenResult {
  ok: true;
  rescreened: number;
  newHits: NewHit[];
  cleared: Array<{ subjectId: string; subjectName: string }>;
  summary: string;
}

const RESCREEN_SEV_STYLE: Record<NewHit["severity"], string> = {
  critical: "bg-red-dim text-red border border-red/30",
  high:     "bg-red-dim text-red border border-red/30",
  medium:   "bg-amber-dim text-amber border border-amber/30",
  low:      "bg-amber-dim text-amber border border-amber/30",
};

// ── Adverse Media types ───────────────────────────────────────────────────────

type AdverseRiskTier = "clear" | "low" | "medium" | "high" | "critical" | "unknown";

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
  // Live feed unavailable — explicit degraded state, never treat as clear.
  unknown:  "bg-amber-dim text-amber border border-amber/40",
};

const ADVERSE_SEV_STYLE: Record<string, string> = {
  critical: "bg-red-dim text-red",
  high:     "bg-red-dim text-red",
  medium:   "bg-amber-dim text-amber",
  low:      "bg-amber-dim text-amber",
  clear:    "bg-green-dim text-green",
};

// ─────────────────────────────────────────────────────────────────────────────

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

function applyFilter(subjects: Subject[], filter: FilterKey, operatorName?: string): Subject[] {
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
    case "mine":
      return subjects.filter(
        (s) => s.status !== "cleared" && (operatorName ? s.assignedTo === operatorName : false),
      );
    case "closed":
      return subjects.filter((s) => s.status === "cleared");
    case "all":
    default:
      return subjects.filter((s) => s.status !== "cleared");
  }
}

function applyFilters(subjects: Subject[], filters: FilterKey[], operatorName?: string): Subject[] {
  if (filters.length === 0) return applyFilter(subjects, "all", operatorName);
  if (filters.length === 1) return applyFilter(subjects, filters[0]!, operatorName);
  const seen = new Set<string>();
  const result: Subject[] = [];
  for (const f of filters) {
    for (const s of applyFilter(subjects, f, operatorName)) {
      if (!seen.has(s.id)) { seen.add(s.id); result.push(s); }
    }
  }
  return result;
}

function subjectSeverity(riskScore: number): "clear" | "low" | "medium" | "high" | "critical" {
  if (riskScore === 0) return "clear";
  if (riskScore >= 95) return "critical";
  if (riskScore >= 85) return "high";
  if (riskScore >= 70) return "medium";
  return "low";
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
  // Country derivation widened to vessel + aircraft. Vessels usually carry
  // a flag-state country recorded as registeredCountry; aircraft tail
  // numbers carry their own country prefix but the analyst-entered value
  // wins when present.
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
  if (data.entityType === "vessel" && data.vesselImo) metaBits.push(`IMO ${data.vesselImo}`);
  if (data.entityType === "aircraft" && data.aircraftTail) metaBits.push(`tail ${data.aircraftTail}`);
  if ((data.walletAddresses?.length ?? 0) > 0) {
    metaBits.push(`${data.walletAddresses!.length} wallet${data.walletAddresses!.length === 1 ? "" : "s"}`);
  }

  const entityLabel =
    data.entityType === "individual" ? "Individual" :
    data.entityType === "vessel" ? "Vessel" :
    data.entityType === "aircraft" ? "Aircraft" :
    data.entityType === "other" ? "Entity" :
    "Corporate";
  const relationLabel = data.relationshipType || (data.entityType === "individual" ? "UBO" : "Counterparty");

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
    // Persist the new entity-specific fields and crypto wallets so the
    // brain modules + ongoing-screening have what they need on re-runs.
    ...((data.walletAddresses?.length ?? 0) > 0 ? { walletAddresses: data.walletAddresses } : {}),
    ...(data.vesselImo ? { vesselImo: data.vesselImo } : {}),
    ...(data.vesselMmsi ? { vesselMmsi: data.vesselMmsi } : {}),
    ...(data.aircraftTail ? { aircraftTail: data.aircraftTail } : {}),
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

function isPersistedSubject(v: unknown): v is Subject {
  if (typeof v !== "object" || v === null) return false;
  const r = v as Record<string, unknown>;
  return (
    typeof r["id"] === "string" &&
    typeof r["name"] === "string" &&
    typeof r["riskScore"] === "number" &&
    typeof r["status"] === "string" &&
    typeof r["cddPosture"] === "string" &&
    Array.isArray(r["listCoverage"])
  );
}

function loadSubjects(): Subject[] {
  if (typeof window === "undefined") return SUBJECTS;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return SUBJECTS;
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return SUBJECTS;
    // Keep only entries that match the current Subject shape — anything
    // older / corrupted is dropped silently rather than crashing the
    // detail panel mid-render. If everything is stale we fall back to
    // the seed corpus so the UI always has something to show.
    const valid = parsed.filter(isPersistedSubject);
    return valid.length > 0 ? valid : SUBJECTS;
  } catch (err) {
    console.warn("[hawkeye] screening loadSubjects parse failed — using SUBJECTS seed:", err);
    return SUBJECTS;
  }
}

function computeDynamicFilters(subjects: Subject[], operatorName?: string): QueueFilter[] {
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
      case "mine":
        count = subjects.filter(
          (s) => s.status !== "cleared" && (operatorName ? s.assignedTo === operatorName : false),
        ).length;
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
  const [activeFilters, setActiveFilters] = useState<FilterKey[]>(["all"]);
  const [operatorName, setOperatorName] = useState<string>("");
  const [query, setQuery] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(
    SUBJECTS[0]?.id ?? null,
  );
  const [formOpen, setFormOpen] = useState(false);
  const [sortKey, setSortKey] = useState<SortKey>("riskScore");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  const [statusFilter, setStatusFilter] = useState<Subject["status"] | "all">("all");
  const [severityFilter, setSeverityFilter] = useState<"clear" | "low" | "medium" | "high" | "critical" | "all">("all");
  const [entityTypeFilter, setEntityTypeFilter] = useState<Subject["entityType"] | "all">("all");
  // Subject IDs whose quick-screen API call is in-flight. Drives the
  // "Screening…" badge and pulsing risk bar in the table.
  const [pendingIds, setPendingIds] = useState<ReadonlySet<string>>(new Set());
  // Subject IDs whose quick-screen call returned an error. Cleared on re-screen or delete.
  const [errorIds, setErrorIds] = useState<ReadonlySet<string>>(new Set());


  // ── Bulk Re-Screen state ─────────────────────────────────────────────────────
  const [rescreenLoading, setRescreenLoading] = useState(false);
  const [rescreenResult, setRescreenResult] = useState<BulkRescreenResult | null>(null);
  const [rescreenError, setRescreenError] = useState<string | null>(null);
  // Latest reasoning from the most recent /api/quick-screen call —
  // populated when an auto-screen completes; rendered as a full-width
  // panel above the screening table.
  const [latestReasoning, setLatestReasoning] = useState<{ subjectName: string; reasoning: ScreeningReasoning } | null>(null);
  // Hit-triage state — World-Check-style match list with resolution
  // workflow. Populated from the same auto-screen response.
  const [latestTriage, setLatestTriage] = useState<{ subjectId: string; subjectName: string; hits: TriageHit[]; commonNameExpansion?: boolean } | null>(null);
  const [triageResolutions, setTriageResolutions] = useState<Record<string, Resolution>>({});

  // Adverse Media state
  const [amSubject, setAmSubject] = useState("");
  const [amDateFrom, setAmDateFrom] = useState("");
  const [amLoading, setAmLoading] = useState(false);
  const [amResult, setAmResult] = useState<AdverseMediaApiResponse | null>(null);
  const [amError, setAmError] = useState<string | null>(null);
  const [amExpanded, setAmExpanded] = useState<string | null>(null);

  // Bulk import + saved searches + bulk actions + columns + minRisk
  const [bulkImportOpen, setBulkImportOpen] = useState(false);
  const [appliedSearchId, setAppliedSearchId] = useState<string | null>(null);
  const [minRisk, setMinRisk] = useState<number>(0);
  const [selectedRowIds, setSelectedRowIds] = useState<ReadonlySet<string>>(new Set());

  // AI natural-language search filter
  const [aiFilter, setAiFilter] = useState<NlSearchFilter | null>(null);
  const [aiFilterLabel, setAiFilterLabel] = useState<string | null>(null);
  const handleAiFilter = useCallback((filter: NlSearchFilter | null, label?: string) => {
    setAiFilter(filter);
    setAiFilterLabel(filter ? (label ?? null) : null);
  }, []);
  const [columns, setColumns] = useState<Record<TableColumnKey, boolean>>({
    risk: true, status: true, cdd: true, sla: true, lists: true, snooze: false,
  });
  // Hydrate column visibility from localStorage after mount.
  useEffect(() => { setColumns(loadColumnVisibility()); }, []);

  // Side-by-side compare — up to 2 subject IDs
  const [compareIds, setCompareIds] = useState<ReadonlySet<string>>(new Set());

  // Natural language search
  const [nlSearchActive, setNlSearchActive] = useState(false);
  const [nlSearchLoading, setNlSearchLoading] = useState(false);
  const [nlMatchIds, setNlMatchIds] = useState<ReadonlySet<string> | null>(null);
  const [nlInterpretation, setNlInterpretation] = useState<string>("");
  const [nlConfidence, setNlConfidence] = useState<number>(0);
  const [nlReasoning, setNlReasoning] = useState<string>("");

  const searchInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    const loaded = loadSubjects();
    setSubjects(loaded);
    setSelectedId((prev) => prev ?? loaded[0]?.id ?? null);
    setHydrated(true);
    try { setOperatorName(window.localStorage.getItem("hawkeye.operator") ?? ""); }
    catch (err) { console.warn("[hawkeye] screening operator-name read failed:", err); }
  }, []);

  useEffect(() => {
    const sync = () => {
      try { setOperatorName(window.localStorage.getItem("hawkeye.operator") ?? ""); }
      catch (err) { console.warn("[hawkeye] screening operator-name sync read failed:", err); }
    };
    window.addEventListener("hawkeye:operator-updated", sync);
    return () => window.removeEventListener("hawkeye:operator-updated", sync);
  }, []);

  const handleRefresh = useCallback(() => {
    try {
      const loaded = loadSubjects();
      setSubjects(loaded);
    } catch (err) {
      console.error("[hawkeye] screening handleRefresh failed:", err);
    }
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(subjects));
    } catch (err) {
      console.error("[hawkeye] screening subjects persist failed — subject edits will be lost on reload:", err);
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

  const dynamicFilters = useMemo(() => computeDynamicFilters(subjects, operatorName), [subjects, operatorName]);

  const filtered = useMemo(() => {
    // NL search overrides normal filtering pipeline
    if (nlMatchIds !== null) {
      return subjects.filter((s) => nlMatchIds.has(s.id));
    }
    // Snoozed subjects drop out of the active queue until their `until`
    // timestamp passes. Showing them under "Closed" lets the analyst
    // still find them — that view is intentionally inclusive.
    const now = Date.now();
    const showClosed = activeFilters.includes("closed");
    let list = applyFilters(subjects, activeFilters, operatorName).filter((s) => {
      if (showClosed) return true;
      if (!s.snoozedUntil) return true;
      return Date.parse(s.snoozedUntil) <= now;
    });
    if (statusFilter !== "all") {
      list = list.filter((s) => s.status === statusFilter);
    }
    if (severityFilter !== "all") {
      list = list.filter((s) => subjectSeverity(s.riskScore) === severityFilter);
    }
    if (entityTypeFilter !== "all") {
      list = list.filter((s) => s.entityType === entityTypeFilter);
    }
    if (minRisk > 0) {
      list = list.filter((s) => s.riskScore >= minRisk);
    }
    if (aiFilter) {
      const f = aiFilter;
      list = list.filter((s) => {
        if (f.riskScoreMin != null && s.riskScore < f.riskScoreMin) return false;
        if (f.riskScoreMax != null && s.riskScore > f.riskScoreMax) return false;
        if (f.pepFlag && !s.pep) return false;
        if (f.sanctionsHit && s.listCoverage.length === 0) return false;
        if (f.minListCount != null && s.listCoverage.length < f.minListCount) return false;
        if (f.slaBreach) {
          const h = parseFloat(s.slaNotify);
          if (isNaN(h) || h > 0) return false;
        }
        if (f.statuses?.length && !f.statuses.includes(s.status)) return false;
        if (f.cddPostures?.length && !f.cddPostures.includes(s.cddPosture)) return false;
        if (f.entityTypes?.length && !f.entityTypes.includes(s.entityType)) return false;
        if (f.countries?.length) {
          const country = (s.country + " " + s.jurisdiction).toLowerCase();
          const hit = f.countries.some((c) => country.includes(c.toLowerCase()));
          if (!hit) return false;
        }
        if (f.nameContains?.length) {
          const name = s.name.toLowerCase();
          if (!f.nameContains.every((n) => name.includes(n.toLowerCase()))) return false;
        }
        if (f.metaContains?.length) {
          const meta = (s.meta + " " + (s.notes ?? "")).toLowerCase();
          if (!f.metaContains.every((m) => meta.includes(m.toLowerCase()))) return false;
        }
        return true;
      });
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
  }, [subjects, activeFilters, operatorName, deferredQuery, sortKey, sortDir, statusFilter, severityFilter, entityTypeFilter, minRisk, aiFilter, nlMatchIds]);

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
      prev.map((s) => {
        if (s.id !== id) return s;
        const next: Subject = { ...s, ...update };
        // Sentinel empty-string from SnoozeButton means "clear the field"
        // — exactOptionalPropertyTypes blocks `undefined` assignment, so
        // we strip the keys explicitly here.
        if (update.snoozedUntil === "") delete (next as Partial<Subject>).snoozedUntil;
        if (update.snoozeReason === "") delete (next as Partial<Subject>).snoozeReason;
        return next;
      }),
    );
  }, []);

  const applySavedSearch = useCallback((s: SavedSearch) => {
    setQuery(s.query ?? "");
    setActiveFilters([(s.filter ?? "all") as FilterKey]);
    setStatusFilter((s.statusFilter ?? "all") as Subject["status"] | "all");
    setMinRisk(s.minRisk ?? 0);
    setAppliedSearchId(s.id);
  }, []);

  const handleColumnsChange = useCallback((next: Record<TableColumnKey, boolean>) => {
    setColumns(next);
    persistColumnVisibility(next);
  }, []);

  const toggleRow = useCallback((id: string) => {
    setSelectedRowIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const toggleAllRows = useCallback((allOn: boolean) => {
    setSelectedRowIds(() => allOn ? new Set(filtered.map((s) => s.id)) : new Set());
  }, [filtered]);

  const bulkApplyCdd = useCallback((posture: CDDPosture) => {
    setSubjects((prev) => prev.map((s) => selectedRowIds.has(s.id) ? { ...s, cddPosture: posture } : s));
    writeAuditEvent("analyst", "bulk.cdd", `${selectedRowIds.size} subjects -> ${posture}`);
  }, [selectedRowIds]);

  const bulkMarkCleared = useCallback(() => {
    setSubjects((prev) => prev.map((s) => selectedRowIds.has(s.id) ? { ...s, status: "cleared" } : s));
    writeAuditEvent("analyst", "bulk.cleared", `${selectedRowIds.size} subjects marked cleared`);
    setSelectedRowIds(new Set());
  }, [selectedRowIds]);

  const bulkAssign = useCallback((operator: string) => {
    setSubjects((prev) => prev.map((s) => selectedRowIds.has(s.id) ? { ...s, assignedTo: operator } : s));
    writeAuditEvent("analyst", "bulk.assigned", `${selectedRowIds.size} subjects -> ${operator}`);
  }, [selectedRowIds]);

  const bulkSnooze = useCallback((iso: string, reason: string) => {
    setSubjects((prev) => prev.map((s) => selectedRowIds.has(s.id) ? { ...s, snoozedUntil: iso, snoozeReason: reason } : s));
    writeAuditEvent("analyst", "bulk.snoozed", `${selectedRowIds.size} subjects until ${iso} - ${reason}`);
  }, [selectedRowIds]);

  const bulkDelete = useCallback(() => {
    if (!window.confirm(`Delete ${selectedRowIds.size} subject(s)? This cannot be undone.`)) return;
    setSubjects((prev) => prev.filter((s) => !selectedRowIds.has(s.id)));
    writeAuditEvent("analyst", "bulk.deleted", `${selectedRowIds.size} subjects`);
    setSelectedRowIds(new Set());
  }, [selectedRowIds]);

  const toggleCompare = useCallback((id: string) => {
    setCompareIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else if (next.size < 2) {
        next.add(id);
      } else {
        // Already have 2 — swap out the oldest (first) and add the new one
        const [first] = next;
        if (first !== undefined) next.delete(first);
        next.add(id);
      }
      return next;
    });
  }, []);

  const handleNLSearch = useCallback(async (q: string) => {
    if (!q.trim()) return;
    setNlSearchLoading(true);
    try {
      const slim = subjects.map((s) => ({
        id: s.id,
        name: s.name,
        meta: s.meta,
        country: s.country,
        jurisdiction: s.jurisdiction,
        entityType: s.entityType,
        riskScore: s.riskScore,
        cddPosture: s.cddPosture,
        listCoverage: s.listCoverage,
        status: s.status,
        pep: s.pep ?? null,
        adverseMedia: s.adverseMedia ?? null,
        aliases: s.aliases ?? [],
      }));
      const res = await fetch("/api/cases/nl-search", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ query: q, subjects: slim }),
      });
      if (res.ok) {
        const data = (await res.json()) as { ok: boolean; matchIds?: string[]; interpretation?: string; confidence?: number; reasoning?: string };
        if (data.ok && data.matchIds) {
          setNlMatchIds(new Set(data.matchIds));
          setNlInterpretation(data.interpretation ?? q);
          setNlConfidence(typeof data.confidence === "number" ? data.confidence : 0);
          setNlReasoning(data.reasoning ?? "");
          setNlSearchActive(true);
        }
      }
    } catch { /* keep current state */ }
    finally { setNlSearchLoading(false); }
  }, [subjects]);

  const clearNLSearch = useCallback(() => {
    setNlSearchActive(false);
    setNlMatchIds(null);
    setNlInterpretation("");
    setNlConfidence(0);
    setNlReasoning("");
  }, []);

  // Export the filtered queue as a CSV the user downloads. Lets the
  // weekly MLRO pack go out without a server round-trip.
  const exportFilteredCsv = useCallback(() => {
    const header = ["id", "name", "country", "entityType", "riskScore", "severity", "status", "cddPosture", "lists", "snoozedUntil"];
    const escape = (v: unknown) => `"${String(v ?? "").replace(/"/g, '""')}"`;
    const rows = filtered.map((s) => [
      s.id, s.name, s.country, s.entityType, s.riskScore, s.mostSerious, s.status, s.cddPosture,
      s.listCoverage.join("|"), s.snoozedUntil ?? "",
    ].map(escape).join(","));
    const csv = [header.join(","), ...rows].join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `hawkeye-screening-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    writeAuditEvent("analyst", "queue.exported", `${filtered.length} subjects`);
  }, [filtered]);

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
          // Forward entityType + jurisdiction so the brain's matching
          // layer can apply entity-specific scoring (vessel/aircraft hit
          // distinct candidate sets) and so jurisdiction-rich modes
          // (CAHRA, regimes, FATF tiers) actually fire. Previously only
          // name + aliases were sent, which silently degraded accuracy.
          const jurisdictionField =
            data.entityType === "individual"
              ? (data.citizenship || data.countryLocation || "")
              : (data.registeredCountry || "");
          const subjectPayload: {
            name: string;
            aliases?: string[];
            entityType?: "individual" | "organisation" | "vessel" | "aircraft" | "other";
            jurisdiction?: string;
          } = {
            name: subject.name,
            entityType: data.entityType,
          };
          if (data.alternateNames.length > 0) subjectPayload.aliases = data.alternateNames;
          if (jurisdictionField.trim()) subjectPayload.jurisdiction = jurisdictionField.trim();
          interface AugmentationRecord {
            source?: string;
            name?: string;
            legalName?: string;
            jurisdiction?: string;
            registrationNumber?: string;
            status?: string;
            incorporatedAt?: string;
            incorporationDate?: string;
            url?: string;
          }
          interface QuickScreenAPIResponse {
            ok: boolean;
            topScore?: number;
            severity?: string;
            reasoning?: ScreeningReasoning;
            hits?: Array<{ listId: string; listRef: string; candidateName: string; matchedAlias?: string; score: number; method: string; programs?: string[] }>;
            openSanctionsAugmentation?: AugmentationRecord[];
            commercialAugmentation?: AugmentationRecord[];
            commercialProvider?: string;
            registryAugmentation?: AugmentationRecord[];
            registryProviders?: string[];
            countryRegistryAugmentation?: AugmentationRecord[];
            countryRegistryJurisdictions?: string[];
            countrySanctionsAugmentation?: AugmentationRecord[];
            countrySanctionsLists?: string[];
            freeAdapterAugmentation?: AugmentationRecord[];
            freeAdapterProviders?: string[];
            commonNameExpansion?: boolean;
          }
          // One-shot retry on transient failures (network blip, 5xx, timeout).
          // Many screen-failed states on the queue come from a single
          // hiccup — retrying once recovers cleanly without operator action.
          let res = await fetchJson<QuickScreenAPIResponse>(
            "/api/quick-screen",
            {
              method: "POST",
              headers: { "content-type": "application/json" },
              body: JSON.stringify({ subject: subjectPayload }),
              label: "Auto-screen failed",
            },
          );
          if (!res.ok) {
            await new Promise((resolve) => setTimeout(resolve, 1500));
            res = await fetchJson<QuickScreenAPIResponse>(
              "/api/quick-screen",
              {
                method: "POST",
                headers: { "content-type": "application/json" },
                body: JSON.stringify({ subject: subjectPayload }),
                label: "Auto-screen failed (retry)",
              },
            );
          }
          if (res.ok && res.data?.ok && res.data.reasoning) {
            setLatestReasoning({ subjectName: subject.name, reasoning: res.data.reasoning });
            // Build the unified triage list from every augmentation array
            const triageHits: TriageHit[] = [];
            for (const h of res.data.hits ?? []) {
              triageHits.push({
                id: `local-${h.listId}-${h.listRef}`,
                source: h.listId,
                sourceList: h.listId.toUpperCase(),
                name: h.candidateName,
                matchedAlias: h.matchedAlias,
                matchStrength: h.score,
                programs: h.programs,
                listRef: h.listRef,
                type: "OTHER",
              });
            }
            const augLists: Array<[AugmentationRecord[] | undefined, string, string]> = [
              [res.data.openSanctionsAugmentation, "opensanctions", "OpenSanctions"],
              [res.data.commercialAugmentation, res.data.commercialProvider ?? "commercial", res.data.commercialProvider ?? "Commercial"],
              [res.data.countrySanctionsAugmentation, "country-sanctions", "Country sanctions"],
              [res.data.registryAugmentation, "registry", "Registry"],
              [res.data.countryRegistryAugmentation, "country-registry", "Country registry"],
              [res.data.freeAdapterAugmentation, "free", "Free adapter"],
            ];
            for (const [arr, sourceId, sourceLabel] of augLists) {
              if (!arr) continue;
              for (let i = 0; i < arr.length; i++) {
                const r = arr[i];
                if (!r) continue;
                triageHits.push({
                  id: `${sourceId}-${i}-${r.registrationNumber ?? r.name ?? r.legalName ?? "unknown"}`,
                  source: r.source ?? sourceId,
                  sourceList: sourceLabel,
                  name: (r.legalName ?? r.name ?? "Unknown record"),
                  matchStrength: 75,
                  type: sourceId.includes("sanctions") ? "LE" : sourceId.includes("registry") ? "OB" : "OTHER",
                  citizenship: r.jurisdiction,
                  countryLocation: r.jurisdiction,
                  listRef: r.registrationNumber,
                  enteredDate: r.incorporatedAt ?? r.incorporationDate,
                  url: r.url,
                });
              }
            }
            setLatestTriage({ subjectId: subject.id, subjectName: subject.name, hits: triageHits, commonNameExpansion: res.data.commonNameExpansion });
            setTriageResolutions({});
          }
          if (res.ok && res.data?.ok && res.data.topScore !== undefined) {
            // Derive list coverage from the hits + augmentations so the
            // LISTS column shows what fired instead of staying empty.
            const coverage = new Set<SanctionSource>();
            const mapListId = (raw: string | undefined): SanctionSource | null => {
              if (!raw) return null;
              const v = raw.toLowerCase();
              if (v.includes("ofac") || v.includes("sdn") || v.includes("us_")) return "OFAC";
              if (v.includes("un_") || v.includes("1267") || v.includes("1988") || v.includes("2231") || v.includes("unsc")) return "UN";
              if (v.includes("eu_") || v.includes("cfsp") || v.includes("eu-cons")) return "EU";
              if (v.includes("uk_") || v.includes("ofsi") || v.includes("hmt")) return "UK";
              if (v.includes("eocn") || v.includes("uae_")) return "EOCN";
              if (v.includes("dfat") || v.includes("au_")) return "AU";
              if (v.includes("seco") || v.includes("ch_")) return "CH";
              if (v.includes("seam") || v.includes("ca_") || v.includes("osfi")) return "CA";
              if (v.includes("jp_") || v.includes("meti") || v.includes("japan")) return "JP";
              if (v.includes("fatf")) return "FATF";
              if (v.includes("interpol") || v.includes("red_notice") || v.includes("notice")) return "INTERPOL";
              if (v.includes("world_bank") || v.includes("worldbank") || v.includes("wb_") || v.includes("debar")) return "WB";
              if (v.includes("adb")) return "ADB";
              return null;
            };
            for (const h of res.data.hits ?? []) {
              const src = mapListId(h.listId) ?? mapListId(h.listRef);
              if (src) coverage.add(src);
              for (const p of h.programs ?? []) {
                const ps = mapListId(p);
                if (ps) coverage.add(ps);
              }
            }
            for (const a of res.data.countrySanctionsAugmentation ?? []) {
              const src = mapListId(a.source);
              if (src) coverage.add(src);
            }
            const nextCoverage = Array.from(coverage);
            setSubjects((prev) =>
              prev.map((s) =>
                s.id === subject.id
                  ? {
                      ...s,
                      riskScore: res.data!.topScore ?? 0,
                      mostSerious: res.data!.severity ?? s.mostSerious,
                      listCoverage: nextCoverage.length > 0 ? nextCoverage : s.listCoverage,
                    }
                  : s,
              ),
            );
            writeAuditEvent(
              "system",
              "screening.completed",
              `${subject.name} — score ${res.data.topScore} · ${res.data.severity}`,
            );
            // Push bell notification for any screening hit (score ≥ 40)
            if ((res.data.topScore ?? 0) >= 40) {
              const sev = (res.data.topScore ?? 0) >= 80 ? "critical" : (res.data.topScore ?? 0) >= 60 ? "high" : "medium";
              const listId = sev === "critical" ? "ofac_sdn" : sev === "high" ? "un_1267" : "eu_consolidated";
              pushBellEvent({
                id: `screen-${subject.id}-${Date.now()}`,
                listId,
                listLabel: `Screening hit · ${res.data.severity ?? sev.toUpperCase()}`,
                matchedEntry: subject.name,
                sourceRef: subject.id,
                severity: sev,
                detectedAt: new Date().toISOString(),
                firedRedlineId: sev === "critical" ? "rl_ofac_sdn_confirmed" : undefined,
              });
            }
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

    // Adverse-media auto-run on intake. Fires when the operator left the
    // OPTIONAL CHECKS toggle on (default). Result lands in the subject's
    // local state under `adverseMedia` so the queue badge picks it up
    // without forcing the analyst to click into the dossier panel.
    if (data.checkTypes.adverseMedia) {
      void fetchJson<{ ok: boolean; verdict?: { riskTier?: string; sarRecommended?: boolean } }>(
        "/api/adverse-media",
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ subject: subject.name, limit: 25 }),
          label: "Adverse-media auto-run failed",
          timeoutMs: 45_000,
        },
      ).then((res) => {
        if (!res.ok || !res.data?.ok) return;
        const v = res.data.verdict;
        const tier = v?.riskTier;
        if (!tier) return;
        const sar = v?.sarRecommended === true;
        const score = sar ? 95 : tier === "critical" ? 90 : tier === "high" ? 75 : 50;
        setSubjects((prev) =>
          prev.map((s) =>
            s.id === subject.id
              ? {
                  ...s,
                  adverseMedia: {
                    source: "Taranis AI",
                    score,
                    name: subject.name,
                    reference: tier,
                    date: new Date().toISOString().slice(0, 10),
                  },
                }
              : s,
          ),
        );
        writeAuditEvent(
          "system",
          "adverse-media.auto-run",
          `${subject.name} - ${tier}${sar ? " (SAR R.20)" : ""}`,
        );
      });
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
    // 30s ceiling — Taranis cold-starts can stretch past 15s on Netlify
    // Lambda but anything beyond half a minute is a dead pipeline; fail
    // fast so the operator sees a clear error instead of a perma-spinner.
    const ctl = new AbortController();
    const timer = setTimeout(() => ctl.abort(), 30_000);
    try {
      const body: Record<string, unknown> = { subject: amSubject.trim(), limit: 50 };
      if (amDateFrom) body.dateFrom = amDateFrom;
      const res = await fetch("/api/adverse-media", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
        signal: ctl.signal,
      });
      // Read as text first so a non-JSON 502 / HTML error page doesn't
      // crash the JSON parser and mask the real status code.
      const raw = await res.text().catch((err: unknown) => {
        console.warn("[hawkeye] screening adverse-media res.text() failed:", err);
        return "";
      });
      let data: AdverseMediaApiResponse | null = null;
      if (raw) {
        try { data = JSON.parse(raw) as AdverseMediaApiResponse; }
        catch (err) {
          console.error(`[hawkeye] screening adverse-media non-JSON HTTP ${res.status} — first 200 chars: ${raw.slice(0, 200)}`, err);
        }
      }
      if (!res.ok) {
        setAmError(data?.error ?? `Search failed - server ${res.status}`);
        return;
      }
      if (!data) {
        setAmError("Search failed - empty response");
        return;
      }
      if (!data.ok) {
        setAmError(data.error ?? "Search failed");
      } else {
        setAmResult(data);
      }
    } catch (err) {
      if (err instanceof Error && err.name === "AbortError") {
        setAmError("Search failed - request timed out");
      } else {
        setAmError(err instanceof Error ? err.message : "Request failed");
      }
    } finally {
      clearTimeout(timer);
      setAmLoading(false);
    }
  };

  const handleDelete = (id: string) => {
    // Capture the subject *before* the splice so the audit entry can name
    // it. Falling back to the bare ID lets the audit chain stay intact
    // even if the subject was already evicted from another tab.
    const removed = subjects.find((s) => s.id === id);
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
    // Compliance trail — every removal must land in the local + server
    // HMAC chains so a regulator can prove the subject was screened
    // before being removed (no quiet drops).
    const target = removed ? `${removed.name} (${id})` : id;
    writeAuditEvent("analyst", "subject.removed", target);
    void fetchJson("/api/audit/sign", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        action: "subject_removed",
        target,
        actor: { role: "analyst" },
        body: { id, name: removed?.name ?? null },
      }),
    }).then((r) => { if (!r.ok) console.warn("[audit-sign] subject_removed failed", r.status, r.error); });
  };

  const runBulkRescreen = async () => {
    setRescreenLoading(true);
    setRescreenError(null);
    setRescreenResult(null);
    try {
      const payload = subjects
        .filter((s) => s.status !== "cleared")
        .map((s) => ({ id: s.id, name: s.name, nationality: s.country || undefined }));
      const res = await fetch("/api/screening/bulk-rescreen", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ subjects: payload, listVersion: new Date().toISOString().slice(0, 10) }),
      });
      if (!res.ok) {
        setRescreenError(`Re-screen failed — server ${res.status}`);
        return;
      }
      const data = (await res.json()) as BulkRescreenResult;
      if (data.ok) {
        setRescreenResult(data);
        writeAuditEvent("analyst", "bulk.rescreened", `${data.rescreened} subjects — ${data.newHits.length} new hits, ${data.cleared.length} cleared`);
      }
    } catch (err) {
      setRescreenError(err instanceof Error ? err.message : "Request failed");
    } finally {
      setRescreenLoading(false);
    }
  };

  const criticalCount = subjects.filter((s) => s.riskScore >= CRITICAL_THRESHOLD).length;
  const slaCount = subjects.filter(
    (s) => parseSlaHours(s.slaNotify) <= SLA_BREACH_THRESHOLD_H,
  ).length;
  // Average risk should reflect the *live* book of work — cleared
  // subjects sit at 0 by definition and would drag the queue average
  // down to a misleadingly safe-looking number for the analyst.
  const queueSubjects = subjects.filter((s) => s.status !== "cleared");
  const avgRisk =
    queueSubjects.length > 0
      ? Math.round(queueSubjects.reduce((sum, s) => sum + s.riskScore, 0) / queueSubjects.length)
      : 0;

  const amVerdict = amResult?.verdict;

  // Keyboard shortcuts. Compliance teams live in the keyboard.
  useKeyboardShortcuts({
    onNewScreening: () => setFormOpen((o) => !o),
    onFocusSearch: () => searchInputRef.current?.focus(),
    onEscape: () => { if (formOpen) setFormOpen(false); },
    onNextRow: () => {
      const idx = filtered.findIndex((s) => s.id === selectedId);
      const next = filtered[Math.min(filtered.length - 1, idx + 1)];
      if (next) setSelectedId(next.id);
    },
    onPrevRow: () => {
      const idx = filtered.findIndex((s) => s.id === selectedId);
      const prev = filtered[Math.max(0, idx - 1)];
      if (prev) setSelectedId(prev.id);
    },
    onEscalate: () => {
      // Routes to /api/four-eyes (escalate action) for the currently
      // selected subject. Equivalent to clicking Escalate in the panel.
      if (!selected) return;
      void fetchJson("/api/four-eyes", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          subjectId: selected.id,
          subjectName: selected.name,
          action: "escalate",
          initiatedBy: "analyst",
          reason: `keyboard escalation - composite ${selected.riskScore}/100`,
        }),
        label: "Escalation enqueue failed",
      });
      writeAuditEvent("analyst", "subject.keyboard-escalated", `${selected.name} (${selected.id})`);
    },
  });

  return (
    <>
      <Header />
      <div className="grid min-h-[calc(100vh-84px)] grid-cols-1 md:grid-cols-[220px_1fr] lg:grid-cols-[220px_1fr_480px]">
        <div className="hidden md:block">
          <Sidebar
            filters={dynamicFilters}
            activeFilters={activeFilters}
            onFiltersChange={setActiveFilters}
            onRefresh={handleRefresh}
          />
        </div>

        <main className="px-4 py-4 md:px-10 md:py-8 overflow-y-auto">
          <ScreeningHero
            inQueue={subjects.filter((s) => s.status !== "cleared").length}
            critical={criticalCount}
            slaRisk={slaCount}
            avgRisk={avgRisk}
          />

          {/* ── Bulk Re-Screen Banner ─────────────────────────────────────── */}
          <div className="mb-4 bg-bg-panel border border-hair-2 rounded-xl px-4 py-3">
            <div className="flex items-center gap-3 flex-wrap">
              <span className="text-12 font-semibold text-ink-0">📋 Sanctions List Update</span>
              <span className="text-12 text-ink-2 flex-1">Re-screen portfolio against latest list version</span>
              <button
                type="button"
                onClick={() => { void runBulkRescreen(); }}
                disabled={rescreenLoading}
                className="px-3 py-1.5 rounded bg-brand text-white text-12 font-semibold disabled:opacity-40 disabled:cursor-not-allowed hover:opacity-90 transition-opacity"
              >
                {rescreenLoading ? "Re-screening…" : "🔄 Re-screen portfolio"}
              </button>
              {rescreenResult && (
                <button
                  type="button"
                  onClick={() => setRescreenResult(null)}
                  className="text-11 text-ink-3 hover:text-ink-0"
                >
                  ✕ dismiss
                </button>
              )}
            </div>

            {rescreenLoading && (
              <div className="mt-3 flex items-center gap-2 text-12 text-ink-2">
                <span className="animate-pulse font-mono text-brand">●</span>
                Running portfolio re-screen — checking {subjects.filter((s) => s.status !== "cleared").length} subjects…
              </div>
            )}

            {rescreenError && (
              <div className="mt-3 bg-red-dim border border-red/30 rounded-lg px-3 py-2 text-12 text-red">
                <span className="font-semibold">Error:</span> {rescreenError}
              </div>
            )}

            {rescreenResult && (
              <div className="mt-3 space-y-3">
                {/* Summary pill strip */}
                <div className="flex items-center gap-3 flex-wrap">
                  <span className="text-11 font-mono bg-bg-1 border border-hair-2 rounded px-2 py-1 text-ink-0">
                    {rescreenResult.rescreened} subjects rescreened
                  </span>
                  <span className={`text-11 font-mono rounded px-2 py-1 border font-semibold ${rescreenResult.newHits.length > 0 ? "bg-red-dim text-red border-red/30" : "bg-green-dim text-green border-green/30"}`}>
                    {rescreenResult.newHits.length} new hit{rescreenResult.newHits.length !== 1 ? "s" : ""}
                  </span>
                  <span className="text-11 font-mono bg-green-dim text-green border border-green/30 rounded px-2 py-1 font-semibold">
                    {rescreenResult.cleared.length} cleared
                  </span>
                  <span className="text-11 text-ink-2 flex-1 leading-snug">{rescreenResult.summary}</span>
                </div>

                {/* New hits table */}
                {rescreenResult.newHits.length > 0 && (
                  <div className="bg-bg-1 border border-hair-2 rounded-lg overflow-hidden">
                    <div className="px-3 py-2 border-b border-hair-2 text-10 font-semibold uppercase tracking-wide-3 text-ink-2">
                      New Hits — {rescreenResult.newHits.length}
                    </div>
                    <table className="w-full text-12">
                      <thead className="bg-bg-panel">
                        <tr>
                          <th className="text-left px-3 py-2 text-10 font-semibold uppercase tracking-wide-3 text-ink-3">Subject</th>
                          <th className="text-left px-3 py-2 text-10 font-semibold uppercase tracking-wide-3 text-ink-3">Hit Type</th>
                          <th className="text-left px-3 py-2 text-10 font-semibold uppercase tracking-wide-3 text-ink-3 w-[90px]">Severity</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-hair">
                        {rescreenResult.newHits.map((h) => (
                          <tr key={h.subjectId} className="hover:bg-bg-panel transition-colors">
                            <td className="px-3 py-2 font-medium text-ink-0">{h.subjectName}</td>
                            <td className="px-3 py-2 text-ink-2">{h.hitType}</td>
                            <td className="px-3 py-2">
                              <span className={`inline-flex items-center px-2 py-0.5 rounded text-10 font-bold uppercase border ${RESCREEN_SEV_STYLE[h.severity]}`}>
                                {h.severity}
                              </span>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}

                {/* Cleared subjects */}
                {rescreenResult.cleared.length > 0 && (
                  <div className="flex flex-wrap gap-1.5">
                    <span className="text-10 uppercase tracking-wide-3 text-ink-3 self-center mr-1">Cleared:</span>
                    {rescreenResult.cleared.map((c) => (
                      <span key={c.subjectId} className="text-11 bg-green-dim text-green border border-green/30 rounded px-2 py-0.5 font-mono">
                        {c.subjectName}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
          {/* ─────────────────────────────────────────────────────────────── */}

          {latestReasoning && (
            <div className="mb-4">
              <div className="text-11 text-ink-3 mb-1">Latest reasoning · <span className="text-ink-2 font-medium">{latestReasoning.subjectName}</span></div>
              <ScreeningReasoningPanel reasoning={latestReasoning.reasoning} />
            </div>
          )}
          {latestTriage && latestTriage.hits.length > 0 && (
            <div className="mb-4">
              <HitTriagePanel
                subjectId={latestTriage.subjectId}
                subjectName={latestTriage.subjectName}
                hits={latestTriage.hits}
                commonNameExpansion={latestTriage.commonNameExpansion}
                resolutions={triageResolutions}
                onResolve={async (hitId, resolution, reason) => {
                  // Optimistic UI update
                  setTriageResolutions((p) => ({ ...p, [hitId]: resolution }));
                  // Find hit context for the audit trail
                  const hit = latestTriage.hits.find((h) => h.id === hitId);
                  try {
                    await fetch("/api/screening/resolve", {
                      method: "POST",
                      headers: { "content-type": "application/json" },
                      body: JSON.stringify({
                        subjectId: latestTriage.subjectId,
                        subjectName: latestTriage.subjectName,
                        hitId,
                        resolution,
                        reason,
                        hitContext: hit ? {
                          sourceList: hit.sourceList,
                          matchedName: hit.name,
                          matchStrength: hit.matchStrength,
                          listRef: hit.listRef,
                        } : undefined,
                      }),
                    });
                  } catch (err) {
                    console.warn("[screening] resolve failed:", err);
                  }
                }}
              />
            </div>
          )}

          <ScreeningToolbar
            ref={searchInputRef}
            query={query}
            onQueryChange={(v) => { setQuery(v); if (nlSearchActive && !v) clearNLSearch(); }}
            onNewScreening={() => setFormOpen((o) => !o)}
            sortKey={sortKey}
            sortDir={sortDir}
            onSortChange={handleSortChange}
            statusFilter={statusFilter}
            onStatusFilterChange={setStatusFilter}
            severityFilter={severityFilter}
            onSeverityFilterChange={setSeverityFilter}
            entityTypeFilter={entityTypeFilter}
            onEntityTypeFilterChange={setEntityTypeFilter}
            columns={columns}
            onColumnsChange={handleColumnsChange}
            onBulkImport={() => setBulkImportOpen(true)}
            onExport={exportFilteredCsv}
            onAiFilter={handleAiFilter}
            aiFilterLabel={aiFilterLabel}
            onNLSearch={(q) => { void handleNLSearch(q); }}
            nlSearchActive={nlSearchActive}
            onNLSearchClear={clearNLSearch}
            nlSearchLoading={nlSearchLoading}
          />

          <div className="mb-3">
            <SavedSearchBar
              active={{ query, filter: activeFilters[0] ?? "all", statusFilter, minRisk }}
              appliedId={appliedSearchId}
              onApply={applySavedSearch}
            />
          </div>

          <BulkActionsBar
            selectedIds={[...selectedRowIds]}
            onClear={() => setSelectedRowIds(new Set())}
            onApplyCdd={bulkApplyCdd}
            onMarkCleared={bulkMarkCleared}
            onAssign={bulkAssign}
            onSnoozeUntil={bulkSnooze}
            onDelete={bulkDelete}
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

          {/* NL search result banner */}
          {nlSearchActive && (
            <div className="mb-3 flex flex-wrap items-center gap-2 px-4 py-2.5 bg-amber-dim border border-amber/30 rounded-lg text-12">
              <span className="text-amber font-semibold">✦ AI search</span>
              <span className={`text-11 font-mono px-1.5 rounded ${nlConfidence >= 0.8 ? "bg-green-dim text-green" : nlConfidence >= 0.5 ? "bg-amber-dim text-amber" : "bg-red-dim text-red"}`}>
                {(nlConfidence * 100).toFixed(0)}% confident
              </span>
              <span className="text-ink-1 flex-1">{nlInterpretation}</span>
              {nlReasoning && <span className="text-10 text-ink-3 font-mono w-full">{nlReasoning}</span>}
              <span className="text-ink-2">{filtered.length} result{filtered.length === 1 ? "" : "s"}</span>
              <button type="button" onClick={clearNLSearch} className="text-ink-3 hover:text-ink-0 text-12">✕ clear</button>
            </div>
          )}

          {/* Compare button when 2 subjects selected */}
          {compareIds.size === 2 && (
            <div className="mb-3 flex items-center gap-3 px-4 py-2 bg-bg-panel border border-brand/30 rounded-lg text-12">
              <span className="text-brand font-semibold">⇔ Compare mode</span>
              <span className="text-ink-2">2 subjects selected — side-by-side comparison active</span>
              <button type="button" onClick={() => setCompareIds(new Set())} className="ml-auto text-11 text-ink-3 hover:text-ink-0">✕ clear</button>
            </div>
          )}

          <ScreeningTable
            subjects={filtered}
            columns={columns}
            selectedRowIds={selectedRowIds}
            onToggleRow={toggleRow}
            onToggleAllRows={toggleAllRows}
            selectedId={selectedId}
            onSelect={setSelectedId}
            onDelete={handleDelete}
            sortKey={sortKey}
            sortDir={sortDir}
            onSortChange={handleSortChange}
            pendingIds={pendingIds}
            errorIds={errorIds}
            compareIds={compareIds}
            onToggleCompare={toggleCompare}
          />
        </main>

        <div className="hidden lg:block">
          {(() => {
            if (compareIds.size === 2) {
              const [idA, idB] = [...compareIds];
              const subA = idA !== undefined ? subjects.find((s) => s.id === idA) : undefined;
              const subB = idB !== undefined ? subjects.find((s) => s.id === idB) : undefined;
              if (subA && subB) {
                return (
                  <ComparePanel
                    subjectA={subA}
                    subjectB={subB}
                    onClose={() => setCompareIds(new Set())}
                    onSelect={(id) => { setSelectedId(id); setCompareIds(new Set()); }}
                  />
                );
              }
            }
            if (selected && !formOpen) {
              // Build triage-resolutions payload for the report PDF —
              // only when the latest triage matches the selected subject.
              const triageForReport = latestTriage && latestTriage.subjectId === selected.id
                ? latestTriage.hits.map((h) => ({
                    hitId: h.id,
                    matchedName: h.name,
                    sourceList: h.sourceList,
                    matchStrength: h.matchStrength,
                    type: h.type,
                    citizenship: h.citizenship,
                    dob: h.dob,
                    listRef: h.listRef,
                    resolution: triageResolutions[h.id] ?? "unspecified" as const,
                    resolvedAt: triageResolutions[h.id] ? new Date().toISOString() : undefined,
                  }))
                : undefined;
              return (
                <SubjectDetailPanel
                  subject={selected}
                  onUpdate={handleUpdateSubject}
                  allSubjects={subjects}
                  onSelectSubject={setSelectedId}
                  triageResolutions={triageForReport}
                />
              );
            }
            return (
              <aside className="border-l border-hair-2 overflow-y-auto px-5 py-6">
                <ActivityFeed />
              </aside>
            );
          })()}
        </div>
      </div>

      <BulkImportDialog
        open={bulkImportOpen}
        onClose={() => setBulkImportOpen(false)}
        onImported={(rows) => {
          // Materialise the imported rows into local subjects so they
          // appear in the queue immediately. The brain has already
          // screened them server-side via /api/batch-screen — this is
          // the local-state mirror.
          const created: Subject[] = [];
          let pool = subjects.slice();
          for (const r of rows) {
            const id = nextSubjectId(pool);
            const subj: Subject = {
              id,
              badge: id.replace(/^HS-/, "").slice(-5),
              badgeTone: "violet",
              name: r.name,
              ...(r.aliases && r.aliases.length > 0 ? { aliases: r.aliases } : {}),
              meta: r.entityType === "vessel" ? "vessel" : r.entityType === "aircraft" ? "aircraft" : "bulk import",
              country: (r.jurisdiction ?? "—").toUpperCase().slice(0, 20),
              jurisdiction: (r.jurisdiction ?? "—").toUpperCase().slice(0, 6),
              type: (r.entityType === "individual" ? "Individual · UBO" : "Corporate · Customer") as Subject["type"],
              entityType: (r.entityType ?? "individual") as Subject["entityType"],
              riskScore: 0,
              status: "active",
              cddPosture: "CDD",
              listCoverage: [],
              exposureAED: "0",
              slaNotify: "+72h 00m",
              mostSerious: "—",
              openedAgo: formatDDMMYY(new Date()),
              openedAt: new Date().toISOString(),
            };
            pool = [subj, ...pool];
            created.push(subj);
          }
          setSubjects((prev) => [...created, ...prev]);
          writeAuditEvent("analyst", "bulk.imported", `${created.length} subjects via CSV`);
          setBulkImportOpen(false);
        }}
      />

      {false && (
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
                className="px-4 py-1.5 rounded bg-green-dim text-green text-12 font-semibold border border-green/40 disabled:opacity-40 disabled:cursor-not-allowed hover:bg-green/20 transition-colors"
              >
                {amLoading ? "⌕…" : "⌕"}
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

          {amVerdict && (() => {
            // Defensive defaults — the analyser can return a partial verdict
            // when the upstream feed is degraded (e.g. Taranis returned 0
            // items). Normalise everything so the UI doesn't crash on
            // missing arrays / undefined counters.
            // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
            const v = amVerdict!;
            const findings = v.findings ?? [];
            const fatfRecs = v.fatfRecommendations ?? [];
            const investigations = v.investigationLines ?? [];
            const breakdown = v.categoryBreakdown ?? [];
            const modes = v.modesCited ?? [];
            const tierStyle = ADVERSE_TIER_STYLE[v.riskTier] ?? "bg-bg-2 text-ink-2";
            return (
            <div className="space-y-4">
              <div className={`border-2 rounded-xl p-5 ${v.riskTier === "critical" || v.riskTier === "high" ? "border-red/40" : v.riskTier === "medium" ? "border-amber/40" : "border-hair-2"}`}>
                <div className="flex items-start justify-between mb-3">
                  <div>
                    <h3 className="text-16 font-semibold text-ink-0">{v.subject}</h3>
                    <p className="text-12 text-ink-2 mt-0.5">{v.riskDetail}</p>
                  </div>
                  <span className={`text-11 font-bold px-2.5 py-1 rounded uppercase ${tierStyle}`}>
                    {v.riskTier}
                  </span>
                </div>

                <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mb-4">
                  {[
                    { label: "Total", value: v.totalItems ?? 0 },
                    { label: "Adverse", value: v.adverseItems ?? 0 },
                    { label: "Critical", value: v.criticalCount ?? 0 },
                    { label: "High", value: v.highCount ?? 0 },
                    { label: "Medium", value: v.mediumCount ?? 0 },
                  ].map(({ label, value }) => (
                    <div key={label} className="bg-bg-1 border border-hair-2 rounded p-2 text-center">
                      <div className="text-18 font-mono font-semibold text-ink-0">{value}</div>
                      <div className="text-10 text-ink-3 uppercase tracking-wide-3">{label}</div>
                    </div>
                  ))}
                </div>

                {v.sarRecommended && (
                  <div className="bg-red-dim border border-red/30 rounded-lg p-3 mb-3">
                    <span className="text-12 font-bold text-red uppercase">SAR RECOMMENDED (FATF R.20)</span>
                    <p className="text-11 text-red/80 mt-1 leading-relaxed">{v.sarBasis}</p>
                  </div>
                )}

                {fatfRecs.length > 0 && (
                  <div className="flex flex-wrap gap-1.5 mb-3">
                    {fatfRecs.map((r) => (
                      <span key={r} className="text-11 bg-brand-dim text-brand border border-brand/30 px-2 py-0.5 rounded font-mono">{r}</span>
                    ))}
                  </div>
                )}

                <p className="text-11 text-ink-3">
                  Confidence: <span className="font-semibold text-ink-1">{(v.confidenceTier ?? "low").toUpperCase()}</span> {v.confidenceBasis ? `- ${v.confidenceBasis}` : ""}
                </p>
              </div>

              {investigations.length > 0 && (
                <div className="bg-bg-panel border border-hair-2 rounded-xl p-5">
                  <div className="text-11 font-semibold uppercase tracking-wide-3 text-ink-2 mb-3">Investigation Actions</div>
                  <ol className="space-y-1.5">
                    {investigations.map((line, i) => (
                      <li key={i} className="flex gap-2 text-12 text-ink-1">
                        <span className="text-ink-3 font-mono text-11 flex-shrink-0">{i + 1}.</span>
                        <span>{line}</span>
                      </li>
                    ))}
                  </ol>
                </div>
              )}

              {breakdown.length > 0 && (
                <div className="bg-bg-panel border border-hair-2 rounded-xl p-5">
                  <div className="text-11 font-semibold uppercase tracking-wide-3 text-ink-2 mb-3">Category Breakdown</div>
                  <div className="space-y-2">
                    {breakdown.map((c) => (
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

              {v.counterfactual && (
                <div className="bg-amber-dim border border-amber/30 rounded-xl p-4">
                  <p className="text-11 font-semibold text-amber mb-1">Counterfactual Assessment</p>
                  <p className="text-11 text-amber/80 leading-relaxed">{v.counterfactual}</p>
                </div>
              )}

              {findings.length > 0 && (
                <div className="bg-bg-panel border border-hair-2 rounded-xl overflow-hidden">
                  <div className="px-5 py-3 border-b border-hair-2">
                    <div className="text-11 font-semibold uppercase tracking-wide-3 text-ink-2">
                      Adverse Findings ({findings.length})
                    </div>
                  </div>
                  <div className="divide-y divide-hair">
                    {findings.map((f) => {
                      const fatfPredicates = f.fatfPredicates ?? [];
                      const categories = f.categories ?? [];
                      const fatfRecsItem = f.fatfRecommendations ?? [];
                      const keywords = f.keywords ?? [];
                      const sevStyle = ADVERSE_SEV_STYLE[f.severity] ?? "bg-bg-2 text-ink-2";
                      return (
                      <div key={f.itemId} className="p-4">
                        <button
                          type="button"
                          className="w-full text-left flex items-start gap-3"
                          onClick={() => setAmExpanded(amExpanded === f.itemId ? null : f.itemId)}
                        >
                          <span className={`inline-block w-2 h-2 rounded-full flex-shrink-0 mt-1.5 ${f.severity === "critical" || f.severity === "high" ? "bg-red" : f.severity === "medium" || f.severity === "low" ? "bg-amber" : "bg-green"}`} />
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 flex-wrap mb-1">
                              <span className={`text-10 font-bold px-1.5 py-px rounded ${sevStyle}`}>{(f.severity ?? "low").toUpperCase()}</span>
                              {f.isSarCandidate && <span className="text-10 bg-red-dim text-red border border-red/30 px-1.5 py-px rounded font-bold">SAR</span>}
                              <span className="text-11 text-ink-3">{f.source ?? "—"} · {(f.published ?? "").slice(0, 10) || "—"}</span>
                            </div>
                            <p className="text-12 font-medium text-ink-0 leading-snug">{f.title ?? "(untitled)"}</p>
                            <p className="text-11 text-ink-2 mt-0.5 leading-relaxed">{f.narrative ?? ""}</p>
                          </div>
                          <span className="text-ink-3 text-11 flex-shrink-0">{amExpanded === f.itemId ? "▲" : "▼"}</span>
                        </button>

                        {amExpanded === f.itemId && (
                          <div className="mt-3 pl-5 space-y-2 border-l-2 border-hair-2">
                            {fatfPredicates.length > 0 && (
                              <div>
                                <p className="text-11 text-ink-3 font-semibold mb-1">FATF Predicates</p>
                                <ul className="space-y-0.5">
                                  {fatfPredicates.map((p, i) => <li key={i} className="text-11 text-ink-2">{p}</li>)}
                                </ul>
                              </div>
                            )}
                            <div className="flex flex-wrap gap-1">
                              {categories.map((c) => <span key={c} className="text-10 bg-bg-1 text-ink-2 border border-hair-2 px-1.5 py-px rounded">{c}</span>)}
                              {fatfRecsItem.map((r) => <span key={r} className="text-10 bg-brand-dim text-brand border border-brand/30 px-1.5 py-px rounded font-mono">{r}</span>)}
                            </div>
                            {keywords.length > 0 && (
                              <p className="text-11 text-ink-3">Keywords: {keywords.slice(0, 6).map((k) => `"${k}"`).join(", ")}</p>
                            )}
                            {f.url && /^https?:\/\//i.test(f.url) && (
                              <a href={f.url} target="_blank" rel="noopener noreferrer" className="text-11 text-brand hover:underline break-all">{f.url}</a>
                            )}
                            <p className="text-11 text-ink-3">Relevance: {Math.round((f.relevanceScore ?? 0) * 100)}%</p>
                          </div>
                        )}
                      </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {modes.length > 0 && (
                <p className="text-11 text-ink-3">Modes cited: {modes.join(", ")}</p>
              )}
            </div>
            );
          })()}

          {amResult?.ok && !amVerdict && !amLoading && (
            <div className="border border-hair-2 rounded-xl p-8 text-center text-12 text-ink-3">
              No adverse media found for <span className="font-medium text-ink-1">{amSubject}</span>
            </div>
          )}
        </main>
      )}
    </>
  );
}
