"use client";

import { useEffect, useMemo, useState } from "react";
import { Header } from "@/components/layout/Header";
import { fetchJson } from "@/lib/api/fetchWithRetry";
import { loadCases } from "@/lib/data/case-store";
import type { CaseRecord } from "@/lib/types";

interface Analytics {
  ok: true;
  generatedAt: string;
  commercial: {
    totalApiKeys: number;
    tierBreakdown: Record<string, number>;
    totalScreeningsThisMonth: number;
  };
  monitoring: {
    enrolledSubjects: number;
    scheduledSubjects: number;
    cadenceBreakdown: Record<string, number>;
  };
  quality: {
    falsePositiveCount: number;
    trueMatchCount: number;
    falsePositiveRate: number;
    verdictsLast24h: number;
    totalVerdicts: number;
  };
  kpis: { defined: number; sample: Array<Record<string, unknown>> };
}

interface TxRow {
  id: string;
  ref: string;
  counterparty: string;
  amount: string;
  currency: string;
  channel: string;
  direction: string;
  counterpartyCountry: string;
  behaviouralFlags: string[];
  loggedAt: string;
}

const TX_STORAGE_KEY = "hawkeye.transaction-monitor.v1";

const DATE_RANGES = [
  { key: "24h", label: "Last 24h", ms: 24 * 60 * 60 * 1_000 },
  { key: "7d", label: "Last 7 days", ms: 7 * 24 * 60 * 60 * 1_000 },
  { key: "30d", label: "Last 30 days", ms: 30 * 24 * 60 * 60 * 1_000 },
  { key: "mtd", label: "Month to date", ms: -1 },
  { key: "ytd", label: "Year to date", ms: -2 },
  { key: "all", label: "All time", ms: Infinity },
] as const;

type DateRangeKey = (typeof DATE_RANGES)[number]["key"];
type TabKey = "overview" | "subjects" | "hits" | "typologies" | "sla";

const TABS: Array<{ key: TabKey; label: string }> = [
  { key: "overview", label: "Overview" },
  { key: "subjects", label: "Subjects" },
  { key: "hits", label: "Hits" },
  { key: "typologies", label: "Typologies" },
  { key: "sla", label: "SLA" },
];

const SEVERITIES = ["clear", "low", "medium", "high", "critical"] as const;
const SOURCE_LISTS = ["OFAC", "UN", "EU", "UK", "EOCN"] as const;
const ENTITY_TYPES = ["individual", "organisation", "vessel"] as const;

interface Filters {
  dateRange: DateRangeKey;
  entityTypes: Set<string>;
  jurisdiction: string;
  severities: Set<string>;
  sourceLists: Set<string>;
}

function defaultFilters(): Filters {
  return {
    dateRange: "mtd",
    entityTypes: new Set(ENTITY_TYPES),
    jurisdiction: "all",
    severities: new Set(SEVERITIES),
    sourceLists: new Set(SOURCE_LISTS),
  };
}

function loadTxs(): TxRow[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(TX_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    return Array.isArray(parsed) ? (parsed as TxRow[]) : [];
  } catch {
    return [];
  }
}

function dateRangeCutoff(key: DateRangeKey): number {
  const now = Date.now();
  if (key === "all") return 0;
  if (key === "mtd") {
    const d = new Date();
    return new Date(d.getFullYear(), d.getMonth(), 1).getTime();
  }
  if (key === "ytd") {
    const d = new Date();
    return new Date(d.getFullYear(), 0, 1).getTime();
  }
  const entry = DATE_RANGES.find((r) => r.key === key);
  return entry ? now - entry.ms : 0;
}

function toCsv(rows: Array<Record<string, unknown>>): string {
  if (rows.length === 0) return "";
  const headers = Array.from(
    rows.reduce<Set<string>>((acc, r) => {
      for (const k of Object.keys(r)) acc.add(k);
      return acc;
    }, new Set()),
  );
  const esc = (v: unknown): string => {
    const s = v == null ? "" : String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return [
    headers.join(","),
    ...rows.map((r) => headers.map((h) => esc(r[h])).join(",")),
  ].join("\n");
}

export default function AnalyticsPage() {
  const [data, setData] = useState<Analytics | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [cases, setCases] = useState<CaseRecord[]>([]);
  const [txs, setTxs] = useState<TxRow[]>([]);
  const [filters, setFilters] = useState<Filters>(defaultFilters);
  const [activeTab, setActiveTab] = useState<TabKey>("overview");

  useEffect(() => {
    setCases(loadCases());
    setTxs(loadTxs());
    let active = true;
    (async () => {
      const result = await fetchJson<Analytics>("/api/analytics", {
        cache: "no-store",
        label: "Analytics load failed",
      });
      if (!active) return;
      if (!result.ok || !result.data) {
        setErr(result.error ?? `status ${result.status}`);
        return;
      }
      setData(result.data);
    })();
    return () => {
      active = false;
    };
  }, []);

  const cutoff = useMemo(() => dateRangeCutoff(filters.dateRange), [filters.dateRange]);

  const filteredTxs = useMemo(
    () =>
      txs.filter((t) => {
        const logged = Date.parse(t.loggedAt);
        if (Number.isFinite(logged) && logged < cutoff) return false;
        if (
          filters.jurisdiction !== "all" &&
          t.counterpartyCountry.toUpperCase() !== filters.jurisdiction.toUpperCase()
        ) {
          return false;
        }
        return true;
      }),
    [txs, cutoff, filters.jurisdiction],
  );

  const filteredCases = useMemo(
    () =>
      cases.filter((c) => {
        const opened = Date.parse(c.timeline?.[0]?.timestamp ?? "");
        if (Number.isFinite(opened) && opened < cutoff) return false;
        if (
          filters.jurisdiction !== "all" &&
          !c.meta.toUpperCase().includes(filters.jurisdiction.toUpperCase())
        ) {
          return false;
        }
        return true;
      }),
    [cases, cutoff, filters.jurisdiction],
  );

  const jurisdictionOptions = useMemo(() => {
    const set = new Set<string>();
    for (const t of txs) {
      if (t.counterpartyCountry) set.add(t.counterpartyCountry.toUpperCase());
    }
    return ["all", ...Array.from(set).sort()];
  }, [txs]);

  const exportCsv = () => {
    const rows: Array<Record<string, unknown>> = [];
    for (const c of filteredCases) {
      rows.push({
        type: "case",
        id: c.id,
        subject: c.subject,
        status: c.status,
        opened: c.opened,
        meta: c.meta,
      });
    }
    for (const t of filteredTxs) {
      rows.push({
        type: "transaction",
        id: t.id,
        ref: t.ref,
        counterparty: t.counterparty,
        amount: `${t.currency} ${t.amount}`,
        channel: t.channel,
        direction: t.direction,
        flags: t.behaviouralFlags.join("|"),
        logged: t.loggedAt,
      });
    }
    const csv = toCsv(rows);
    if (!csv) {
      window.alert("Nothing to export for the current filter selection.");
      return;
    }
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `hawkeye-analytics-${filters.dateRange}-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <>
      <Header />
      <main
        className="grid min-h-[calc(100vh-54px)] bg-bg-0"
        style={{ gridTemplateColumns: "260px 1fr" }}
      >
        <FilterSidebar
          filters={filters}
          onChange={setFilters}
          jurisdictionOptions={jurisdictionOptions}
          onReset={() => setFilters(defaultFilters())}
          onExport={exportCsv}
        />

        <div className="p-8 overflow-y-auto">
          <div className="max-w-6xl">
            <div className="flex items-baseline justify-between mb-1">
              <h1 className="font-display text-36 text-ink-0 m-0">Analytics</h1>
              {data && (
                <span className="text-10.5 font-mono text-ink-3">
                  generated {new Date(data.generatedAt).toLocaleString()}
                </span>
              )}
            </div>
            <p className="text-12 text-ink-2 mb-6">
              Analyst workstation — filter by date range, jurisdiction, severity, or
              source list, then pivot across overview, subjects, hits, typologies,
              and SLA tabs. Every number is derived from the current filter
              selection.
            </p>

            {err && (
              <div className="mb-4 bg-red-dim text-red rounded px-3 py-2 text-12">
                {err}
              </div>
            )}

            <div className="flex gap-1 mb-4 border-b border-hair">
              {TABS.map((tab) => (
                <button
                  key={tab.key}
                  onClick={() => setActiveTab(tab.key)}
                  className={`px-4 py-2 text-12 font-medium bg-transparent border-none border-b-2 cursor-pointer ${
                    activeTab === tab.key
                      ? "text-ink-0 border-brand"
                      : "text-ink-2 border-transparent hover:text-ink-0"
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>

            {activeTab === "overview" && (
              <OverviewTab
                data={data}
                cases={filteredCases}
                txs={filteredTxs}
                rangeLabel={
                  DATE_RANGES.find((r) => r.key === filters.dateRange)?.label ??
                  filters.dateRange
                }
              />
            )}
            {activeTab === "subjects" && (
              <SubjectsTab cases={filteredCases} data={data} />
            )}
            {activeTab === "hits" && <HitsTab data={data} />}
            {activeTab === "typologies" && <TypologiesTab txs={filteredTxs} />}
            {activeTab === "sla" && (
              <SlaTab data={data} cases={filteredCases} />
            )}

            {data && (
              <div className="mt-8 bg-white border border-hair-2 rounded-lg p-4">
                <div className="text-10.5 font-semibold uppercase tracking-wide-4 text-ink-2 mb-3">
                  DPMS KPI catalogue ({data.kpis.defined})
                </div>
                <ul className="text-11 text-ink-1 space-y-0.5 list-none p-0 font-mono">
                  {data.kpis.sample.map((k, i) => (
                    <li key={i} className="truncate">
                      {String(
                        (k as { name?: unknown; id?: unknown }).name ??
                          (k as { id?: unknown }).id ??
                          JSON.stringify(k),
                      )}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {!data && !err && (
              <div className="text-12 text-ink-2">Loading…</div>
            )}
          </div>
        </div>
      </main>
    </>
  );
}

function FilterSidebar({
  filters,
  onChange,
  jurisdictionOptions,
  onReset,
  onExport,
}: {
  filters: Filters;
  onChange: (f: Filters) => void;
  jurisdictionOptions: string[];
  onReset: () => void;
  onExport: () => void;
}) {
  const toggle = (setKey: "entityTypes" | "severities" | "sourceLists", value: string) => {
    const next = new Set(filters[setKey]);
    if (next.has(value)) next.delete(value);
    else next.add(value);
    onChange({ ...filters, [setKey]: next });
  };
  return (
    <aside className="bg-white border-r border-hair-2 p-5 overflow-y-auto">
      <div className="text-10.5 font-semibold uppercase tracking-wide-4 text-ink-2 mb-3">
        Filters
      </div>

      <FilterGroup label="Date range">
        <select
          value={filters.dateRange}
          onChange={(e) =>
            onChange({ ...filters, dateRange: e.target.value as DateRangeKey })
          }
          className="w-full text-12 border border-hair-2 rounded px-2 py-1.5 bg-white text-ink-0"
        >
          {DATE_RANGES.map((r) => (
            <option key={r.key} value={r.key}>
              {r.label}
            </option>
          ))}
        </select>
      </FilterGroup>

      <FilterGroup label="Entity type">
        {ENTITY_TYPES.map((et) => (
          <Checkbox
            key={et}
            label={et}
            checked={filters.entityTypes.has(et)}
            onChange={() => toggle("entityTypes", et)}
          />
        ))}
      </FilterGroup>

      <FilterGroup label="Jurisdiction">
        <select
          value={filters.jurisdiction}
          onChange={(e) => onChange({ ...filters, jurisdiction: e.target.value })}
          className="w-full text-12 border border-hair-2 rounded px-2 py-1.5 bg-white text-ink-0"
        >
          {jurisdictionOptions.map((j) => (
            <option key={j} value={j}>
              {j === "all" ? "All" : j}
            </option>
          ))}
        </select>
      </FilterGroup>

      <FilterGroup label="Severity">
        {SEVERITIES.map((s) => (
          <Checkbox
            key={s}
            label={s}
            checked={filters.severities.has(s)}
            onChange={() => toggle("severities", s)}
          />
        ))}
      </FilterGroup>

      <FilterGroup label="Source list">
        {SOURCE_LISTS.map((l) => (
          <Checkbox
            key={l}
            label={l}
            checked={filters.sourceLists.has(l)}
            onChange={() => toggle("sourceLists", l)}
          />
        ))}
      </FilterGroup>

      <div className="flex gap-2 mt-4 pt-4 border-t border-hair">
        <button
          type="button"
          onClick={onReset}
          className="flex-1 text-11 font-medium px-3 py-1.5 rounded border border-hair-2 bg-white text-ink-0 hover:bg-bg-1"
        >
          Reset
        </button>
        <button
          type="button"
          onClick={onExport}
          className="flex-1 text-11 font-semibold px-3 py-1.5 rounded bg-ink-0 text-white hover:bg-ink-1"
        >
          Export CSV
        </button>
      </div>
    </aside>
  );
}

function FilterGroup({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="mb-4">
      <div className="text-10 font-semibold uppercase tracking-wide-3 text-ink-3 mb-1.5">
        {label}
      </div>
      <div className="flex flex-col gap-1">{children}</div>
    </div>
  );
}

function Checkbox({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: () => void;
}) {
  return (
    <label className="flex items-center gap-2 text-12 text-ink-1 cursor-pointer capitalize">
      <input
        type="checkbox"
        checked={checked}
        onChange={onChange}
        className="accent-brand"
      />
      {label}
    </label>
  );
}

function OverviewTab({
  data,
  cases,
  txs,
  rangeLabel,
}: {
  data: Analytics | null;
  cases: CaseRecord[];
  txs: TxRow[];
  rangeLabel: string;
}) {
  const casesByStatus = cases.reduce<Record<string, number>>((acc, c) => {
    acc[c.status] = (acc[c.status] ?? 0) + 1;
    return acc;
  }, {});
  const flaggedTxs = txs.filter((t) => t.behaviouralFlags.length > 0).length;
  return (
    <div className="flex flex-col gap-4">
      <Panel title={`Key metrics · ${rangeLabel}`}>
        <div className="grid grid-cols-4 gap-4">
          <Metric
            label="Screenings"
            value={data?.commercial.totalScreeningsThisMonth.toLocaleString() ?? "—"}
          />
          <Metric
            label="FP rate"
            value={
              data
                ? `${(data.quality.falsePositiveRate * 100).toFixed(1)}%`
                : "—"
            }
          />
          <Metric label="Cases" value={String(cases.length)} />
          <Metric
            label="Flagged txns"
            value={`${flaggedTxs} / ${txs.length}`}
          />
        </div>
      </Panel>

      <Panel title="Case disposition mix">
        {cases.length === 0 ? (
          <Empty>No cases in the current range.</Empty>
        ) : (
          <BarRows
            rows={Object.entries(casesByStatus).map(([k, v]) => ({
              label: k,
              value: v,
            }))}
            total={cases.length}
          />
        )}
      </Panel>

      <Panel title="Monitoring coverage">
        {data ? (
          <div className="grid grid-cols-3 gap-4">
            <Metric
              label="Enrolled in ongoing screening"
              value={String(data.monitoring.enrolledSubjects)}
            />
            <Metric
              label="Scheduled for rerun"
              value={String(data.monitoring.scheduledSubjects)}
            />
            <Metric
              label="Verdicts (last 24h)"
              value={String(data.quality.verdictsLast24h)}
            />
          </div>
        ) : (
          <Empty>Loading…</Empty>
        )}
      </Panel>
    </div>
  );
}

function SubjectsTab({
  cases,
  data,
}: {
  cases: CaseRecord[];
  data: Analytics | null;
}) {
  return (
    <div className="flex flex-col gap-4">
      <Panel title="Cohort · cases by status">
        {cases.length === 0 ? (
          <Empty>No cases in the current range.</Empty>
        ) : (
          <table className="w-full text-12">
            <thead className="text-ink-2">
              <tr className="border-b border-hair">
                <th className="text-left py-1.5 font-mono text-10 uppercase tracking-wide-3">
                  Case
                </th>
                <th className="text-left py-1.5 font-mono text-10 uppercase tracking-wide-3">
                  Subject
                </th>
                <th className="text-left py-1.5 font-mono text-10 uppercase tracking-wide-3">
                  Status
                </th>
                <th className="text-left py-1.5 font-mono text-10 uppercase tracking-wide-3">
                  Opened
                </th>
              </tr>
            </thead>
            <tbody>
              {cases.slice(0, 40).map((c) => (
                <tr key={c.id} className="border-b border-hair/60">
                  <td className="py-1.5 font-mono text-ink-2">{c.id}</td>
                  <td className="py-1.5 text-ink-0">{c.subject}</td>
                  <td className="py-1.5 text-ink-1 capitalize">
                    {c.statusLabel ?? c.status}
                  </td>
                  <td className="py-1.5 font-mono text-10 text-ink-3">
                    {c.opened}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Panel>

      <Panel title="Commercial tiers (API keys)">
        {data && Object.keys(data.commercial.tierBreakdown).length > 0 ? (
          <BarRows
            rows={Object.entries(data.commercial.tierBreakdown).map(
              ([k, v]) => ({ label: k, value: v }),
            )}
            total={data.commercial.totalApiKeys}
          />
        ) : (
          <Empty>No API keys issued yet.</Empty>
        )}
      </Panel>
    </div>
  );
}

function HitsTab({ data }: { data: Analytics | null }) {
  if (!data) return <Empty>Loading…</Empty>;
  const total = data.quality.falsePositiveCount + data.quality.trueMatchCount;
  return (
    <div className="flex flex-col gap-4">
      <Panel title="Match quality feedback">
        <div className="grid grid-cols-3 gap-4">
          <Metric
            label="Confirmed matches"
            value={String(data.quality.trueMatchCount)}
          />
          <Metric
            label="False positives"
            value={String(data.quality.falsePositiveCount)}
          />
          <Metric
            label="FP rate"
            value={`${(data.quality.falsePositiveRate * 100).toFixed(1)}%`}
          />
        </div>
      </Panel>
      <Panel title="Feedback volume">
        {total === 0 ? (
          <Empty>No analyst verdicts submitted yet.</Empty>
        ) : (
          <BarRows
            rows={[
              { label: "Confirmed", value: data.quality.trueMatchCount },
              { label: "False positive", value: data.quality.falsePositiveCount },
            ]}
            total={total}
          />
        )}
      </Panel>
    </div>
  );
}

function TypologiesTab({ txs }: { txs: TxRow[] }) {
  const flagCounts = txs.reduce<Record<string, number>>((acc, t) => {
    for (const f of t.behaviouralFlags) acc[f] = (acc[f] ?? 0) + 1;
    return acc;
  }, {});
  const rows = Object.entries(flagCounts)
    .map(([k, v]) => ({ label: k, value: v }))
    .sort((a, b) => b.value - a.value);
  const channelCounts = txs.reduce<Record<string, number>>((acc, t) => {
    acc[t.channel] = (acc[t.channel] ?? 0) + 1;
    return acc;
  }, {});
  const channelRows = Object.entries(channelCounts).map(([k, v]) => ({
    label: k,
    value: v,
  }));
  return (
    <div className="flex flex-col gap-4">
      <Panel title="Behavioural flags (transactions)">
        {rows.length === 0 ? (
          <Empty>No flagged transactions in range.</Empty>
        ) : (
          <BarRows rows={rows} total={rows.reduce((a, r) => a + r.value, 0)} />
        )}
      </Panel>
      <Panel title="Channel mix">
        {channelRows.length === 0 ? (
          <Empty>No transactions in range.</Empty>
        ) : (
          <BarRows rows={channelRows} total={txs.length} />
        )}
      </Panel>
    </div>
  );
}

function SlaTab({
  data,
  cases,
}: {
  data: Analytics | null;
  cases: CaseRecord[];
}) {
  const openCases = cases.filter((c) => c.status !== "closed").length;
  const reportedCases = cases.filter((c) => c.status === "reported").length;
  return (
    <div className="flex flex-col gap-4">
      <Panel title="Queue health">
        <div className="grid grid-cols-3 gap-4">
          <Metric label="Open cases" value={String(openCases)} />
          <Metric label="Reported (filed)" value={String(reportedCases)} />
          <Metric
            label="Verdicts (24h)"
            value={data ? String(data.quality.verdictsLast24h) : "—"}
          />
        </div>
      </Panel>
      <Panel title="Disposition velocity">
        {cases.length === 0 ? (
          <Empty>
            No cases yet — disposition velocity will populate once escalations or
            STRs are filed.
          </Empty>
        ) : (
          <div className="text-11 text-ink-2">
            Velocity windows populate once an MLRO disposition closes each case.
          </div>
        )}
      </Panel>
    </div>
  );
}

function Panel({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="bg-white border border-hair-2 rounded-lg p-4">
      <div className="text-10.5 font-semibold uppercase tracking-wide-4 text-ink-2 mb-3">
        {title}
      </div>
      {children}
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-10.5 font-semibold uppercase tracking-wide-3 text-ink-3 mb-1">
        {label}
      </div>
      <div className="font-display text-24 text-ink-0 leading-none">{value}</div>
    </div>
  );
}

function BarRows({
  rows,
  total,
}: {
  rows: Array<{ label: string; value: number }>;
  total: number;
}) {
  const max = Math.max(total, 1);
  return (
    <div className="flex flex-col gap-2">
      {rows.map((r) => {
        const pct = Math.round((r.value / max) * 100);
        return (
          <div key={r.label} className="text-12">
            <div className="flex justify-between items-baseline">
              <span className="text-ink-1 capitalize">{r.label}</span>
              <span className="font-mono text-ink-0 font-semibold">
                {r.value}
                <span className="text-ink-3 font-normal">
                  {" "}
                  · {pct}%
                </span>
              </span>
            </div>
            <div className="h-1.5 bg-bg-2 rounded-sm overflow-hidden mt-0.5">
              <div
                className="h-full bg-brand"
                style={{ width: `${pct}%` }}
              />
            </div>
          </div>
        );
      })}
    </div>
  );
}

function Empty({ children }: { children: React.ReactNode }) {
  return <div className="text-12 text-ink-2">{children}</div>;
}
