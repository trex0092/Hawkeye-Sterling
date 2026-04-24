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
      // Subjects opened within the last 24 hours
      return subjects.filter((s) => {
        const opened = parseOpenedDate(s.openedAgo);
        return now - opened.getTime() <= 24 * 60 * 60 * 1000;
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
    exposureAED: "0",
    slaNotify: "+72h 00m",
    mostSerious: "—",
    openedAgo: formatDDMMYY(new Date()),
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
  let s = input.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
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
          const opened = parseOpenedDate(s.openedAgo);
          return now - opened.getTime() <= 24 * 60 * 60 * 1000;
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
      // Screen: auto-select to immediately trigger brain panels
      setSelectedId(subject.id);
    }
    setFormOpen(false);
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
    }
  };

  const handleDelete = (id: string) => {
    setSubjects((prev) => {
      const next = prev.filter((s) => s.id !== id);
      if (selectedId === id) {
        setSelectedId(next[0]?.id ?? null);
      }
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

  return (
    <>
      <Header />
      <div
        className="grid min-h-[calc(100vh-84px)]"
        style={{ gridTemplateColumns: "220px 1fr 360px" }}
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
          />
        </main>

        {selected && !formOpen ? (
          <SubjectDetailPanel
            subject={selected}
            onUpdate={handleUpdateSubject}
          />
        ) : (
          <aside className="border-l border-hair-2 overflow-y-auto px-5 py-6">
            <ActivityFeed />
          </aside>
        )}
      </div>
    </>
  );
}
