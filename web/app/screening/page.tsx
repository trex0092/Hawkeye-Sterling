"use client";

import { useDeferredValue, useMemo, useState } from "react";
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
import type { FilterKey, QueueFilter, Subject } from "@/lib/types";
import { fetchJson } from "@/lib/api/fetchWithRetry";

const CRITICAL_THRESHOLD = 85;
const SLA_BREACH_THRESHOLD_H = 24;

function parseSlaHours(sla: string): number {
  const match = sla.match(/\+?(\d+)h\s*(\d+)?m?/);
  if (!match || match[1] === undefined) return 999;
  const hours = Number.parseInt(match[1], 10);
  const minutes = match[2] ? Number.parseInt(match[2], 10) : 0;
  return hours + minutes / 60;
}

const SANCTIONS_KEYWORDS = /ofac|sdn|un\b|eu\b|ofsi|eocn|sanction|cahra/i;

function applyFilter(subjects: Subject[], filter: FilterKey): Subject[] {
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
      return [];
    case "closed":
      return subjects.filter((s) => s.status === "cleared");
    case "all":
    default:
      return subjects;
  }
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
  if (data.alternateNames.length > 0)
    metaBits.push(`aliases: ${data.alternateNames.join(", ")}`);
  if (knownPep) metaBits.push(`PEP · ${prettyPepTier(knownPep.tier)}`);
  if (data.ongoingScreening) metaBits.push("ongoing screening ON");
  return {
    id,
    badge: badgeNum,
    badgeTone: "violet",
    name: data.name.trim(),
    ...(data.alternateNames.length > 0 ? { aliases: data.alternateNames } : {}),
    meta: metaBits.join(" · ") || "new subject",
    country: country.toUpperCase().slice(0, 20),
    jurisdiction: country.toUpperCase().slice(0, 6),
    type: data.entityType === "individual" ? "Individual · UBO" : "Corporate · Supplier",
    entityType: data.entityType,
    riskScore: 0,
    status: "active",
    cddPosture: knownPep ? "EDD" : "CDD",
    listCoverage: [],
    ...(knownPep
      ? { pep: { tier: knownPep.tier, rationale: knownPep.rationale } }
      : {}),
    exposureAED: "0",
    slaNotify: "+72h 00m",
    mostSerious: "—",
    openedAgo: formatDDMMYY(new Date()),
  };
}

function prettyPepTier(tier: string): string {
  return tier.replace(/^tier_/, "tier ").replace(/_/g, " ");
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

  if (meta.includes(q)) return 35;
  return 0;
}

function formatDDMMYY(d: Date): string {
  const dd = String(d.getDate()).padStart(2, "0");
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const yyyy = d.getFullYear();
  return `${dd}/${mm}/${yyyy}`;
}

export default function ScreeningPage() {
  const [subjects, setSubjects] = useState<Subject[]>(SUBJECTS);
  const [activeFilter, setActiveFilter] = useState<FilterKey>("all");
  const [query, setQuery] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(
    SUBJECTS[0]?.id ?? null,
  );
  const [formOpen, setFormOpen] = useState(false);

  const deferredQuery = useDeferredValue(query);

  const filtered = useMemo(() => {
    const filteredByKey = applyFilter(subjects, activeFilter);
    const q = deferredQuery.trim().toLowerCase();
    if (!q) return filteredByKey;
    return filteredByKey
      .map((s) => ({ s, score: searchScore(s, q) }))
      .filter(({ score }) => score > 0)
      .sort((a, b) => b.score - a.score)
      .map(({ s }) => s);
  }, [subjects, activeFilter, deferredQuery]);

  const selected = useMemo(
    () => subjects.find((s) => s.id === selectedId) ?? null,
    [subjects, selectedId],
  );

  const suggestedCaseId = useMemo(
    () => nextSubjectId(subjects).replace(/^HS-/, "CAS-"),
    [subjects],
  );

  const handleSubmit = (data: ScreeningFormData, screen: boolean) => {
    // Build the subject from the current render-phase snapshot. Safe for a
    // user-triggered action: `subjects` is fresh. Moving construction outside
    // the state-updater makes the updater pure and prevents double-invocation
    // side-effects in React 18 Strict Mode (calling setState inside a setState
    // updater is an impurity that React may invoke twice in development).
    const subject = buildSubject(data, subjects);
    setSubjects((prev) => [subject, ...prev]);
    setSelectedId(subject.id);
    setFormOpen(false);
    // If the operator left "Ongoing screening" ON (default), persist the
    // subject server-side so the twice-daily Netlify Scheduled Function
    // reruns the brain and fires delta alerts.
    if (data.ongoingScreening) {
      // Best-effort enrolment — fetchJson handles cold-start 502s with
      // 3 retries × 750ms before giving up. We still don't surface a
      // failure to the operator (the subject is on the queue regardless),
      // but we no longer leak a raw fetch reject into the console.
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
    void screen;
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

  const filtersWithCounts = useMemo<QueueFilter[]>(
    () =>
      QUEUE_FILTERS.map((f) => {
        const count = applyFilter(subjects, f.key).length;
        return { ...f, count: String(count).padStart(2, "0") };
      }),
    [subjects],
  );

  return (
    <>
      <Header />
      <div
        className="grid min-h-[calc(100vh-54px)]"
        style={{ gridTemplateColumns: selected && !formOpen ? "220px 1fr 360px" : "220px 1fr" }}
      >
        <Sidebar
          filters={filtersWithCounts}
          activeFilter={activeFilter}
          onFilterChange={setActiveFilter}
        />

        <main className="bg-bg-0 px-10 py-8 overflow-y-auto">
          <ScreeningHero
            inQueue={subjects.length}
            critical={criticalCount}
            slaRisk={slaCount}
          />
          <ScreeningToolbar
            query={query}
            onQueryChange={setQuery}
            onNewScreening={() => setFormOpen((o) => !o)}
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
          />
        </main>

        {selected && !formOpen && <SubjectDetailPanel subject={selected} />}
      </div>
    </>
  );
}
