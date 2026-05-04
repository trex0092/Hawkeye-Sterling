"use client";

import Papa from "papaparse";
import { useEffect, useMemo, useRef, useState } from "react";
import { ModuleHero, ModuleLayout } from "@/components/layout/ModuleLayout";
import { RowActions } from "@/components/shared/RowActions";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  Cell,
} from "recharts";
import { exportToPdf } from "@/lib/pdf/exportPdf";

interface RowResult {
  name: string;
  entityType?: string;
  aliases?: string[];
  dob?: string;
  gender?: string;
  jurisdiction?: string;
  idNumber?: string;
  topScore: number;
  severity: string;
  hitCount: number;
  listCoverage: string[];
  keywordGroups: string[];
  esgCategories: string[];
  durationMs: number;
  error?: string;
  checkpoints?: string[];
  isDuplicate?: boolean;
  topHitReason?: string;
  topHitMethod?: string;
  crossRef?: {
    watchmanHits?: number;
    marbleStatus?: string;
    jubeRisk?: number;
  };
}

interface Summary {
  total: number;
  critical: number;
  high: number;
  medium: number;
  low: number;
  clear: number;
  errors: number;
  duplicates: number;
  totalDurationMs: number;
}

interface ParsedRow {
  name: string;
  entityType?: "individual" | "organisation";
  aliases?: string[];
  dob?: string;
  gender?: "male" | "female" | "n/a";
  jurisdiction?: string;
  idNumber?: string;
}

type PapaRow = Record<string, string>;

function resolveField(row: PapaRow, ...keys: string[]): string {
  for (const key of keys) {
    const val = row[key];
    if (val) return val.trim();
  }
  return "";
}

function parseCsv(text: string): ParsedRow[] {
  const clean = text.replace(/^﻿/, "");
  const { data } = Papa.parse<PapaRow>(clean, {
    header: true,
    skipEmptyLines: true,
    transformHeader: (h: string) => h.toLowerCase().trim(),
  });
  return data
    .map((row) => {
      const name = resolveField(row, "name", "name/entity", "entity");
      if (!name) return null;
      const out: ParsedRow = { name };
      const typeRaw = resolveField(row, "type", "entity type", "entitytype");
      if (typeRaw) {
        const t = typeRaw.toLowerCase();
        if (t.startsWith("ind")) out.entityType = "individual";
        else if (t.startsWith("org")) out.entityType = "organisation";
      }
      const aliasRaw = resolveField(row, "alias", "aliases", "alternate names");
      if (aliasRaw) out.aliases = aliasRaw.split(/;|\|/).map((a) => a.trim()).filter(Boolean);
      const dob = resolveField(row, "dob", "date of birth", "date of registration", "dob/date of registration");
      if (dob) out.dob = dob;
      const genderRaw = resolveField(row, "gender");
      if (genderRaw) {
        const g = genderRaw.toLowerCase();
        out.gender = g.startsWith("m") ? "male" : g.startsWith("f") ? "female" : "n/a";
      }
      const jur = resolveField(row, "jurisdiction", "nationality", "nationality/jurisdiction", "country");
      if (jur) out.jurisdiction = jur;
      const idNum = resolveField(row, "id", "id/register", "register", "identification number");
      if (idNum) out.idNumber = idNum;
      return out;
    })
    .filter((r): r is ParsedRow => r !== null && !!r.name);
}

function csvEscape(value: string | number | null | undefined): string {
  if (value == null || value === "") return "";
  const str = String(value);
  return /[",\r\n]/.test(str) ? `"${str.replace(/"/g, '""')}"` : str;
}

function toCsv(results: RowResult[]): string {
  const header = [
    "Name","Entity Type","Alias","DOB/Date of Registration","Gender",
    "Nationality/Jurisdiction","ID/Register","Severity","Top score",
    "Hit count","List coverage","Keyword groups","ESG categories",
    "KYC checkpoints","Duplicate","Top hit reason","Top hit method",
    "Watchman hits","Marble status","Jube risk","Duration ms","Error",
  ].join(",");
  const rows = results.map((r) =>
    [
      csvEscape(r.name), csvEscape(r.entityType),
      csvEscape(r.aliases ? r.aliases.join(";") : ""), csvEscape(r.dob),
      csvEscape(r.gender), csvEscape(r.jurisdiction), csvEscape(r.idNumber),
      csvEscape(r.severity), csvEscape(r.topScore), csvEscape(r.hitCount),
      csvEscape(r.listCoverage.join("|")), csvEscape(r.keywordGroups.join("|")),
      csvEscape(r.esgCategories.join("|")), csvEscape((r.checkpoints ?? []).join("|")),
      csvEscape(r.isDuplicate ? "yes" : ""), csvEscape(r.topHitReason),
      csvEscape(r.topHitMethod), csvEscape(r.crossRef?.watchmanHits),
      csvEscape(r.crossRef?.marbleStatus), csvEscape(r.crossRef?.jubeRisk),
      csvEscape(r.durationMs), csvEscape(r.error),
    ].join(","),
  );
  return [header, ...rows].join("\r\n");
}

function exportPdf(results: RowResult[], summary: Summary) {
  const now = new Date();
  const reportId = `HWK-BATCH-${now.getUTCFullYear()}${String(now.getUTCMonth()+1).padStart(2,"0")}${String(now.getUTCDate()).padStart(2,"0")}-${String(now.getUTCHours()).padStart(2,"0")}${String(now.getUTCMinutes()).padStart(2,"0")}`;

  exportToPdf({
    title: "Batch Screening Audit Report",
    moduleName: "Batch Screening · FDL 10/2025 Art.9",
    reportRef: reportId,
    institution: "Hawkeye Sterling DPMS",
    regulatoryBasis: "UAE FDL 10/2025 · Cabinet Res 134/2025 · MoE Resolution 3/2025",
    confidential: true,
    sections: [
      { type: "header", content: "Population Summary" },
      {
        type: "keyvalue",
        pairs: [
          { label: "Total Subjects", value: String(summary.total) },
          { label: "Duration", value: `${(summary.totalDurationMs / 1000).toFixed(1)}s` },
          { label: "Critical", value: String(summary.critical), tone: summary.critical > 0 ? "red" : "green" },
          { label: "High", value: String(summary.high), tone: summary.high > 0 ? "red" : "green" },
          { label: "Medium", value: String(summary.medium), tone: summary.medium > 0 ? "amber" : "green" },
          { label: "Low / Clear", value: `${summary.low} / ${summary.clear}`, tone: "green" },
          { label: "Errors", value: String(summary.errors), tone: summary.errors > 0 ? "red" : "neutral" },
          { label: "Duplicates", value: String(summary.duplicates) },
        ],
      },
      { type: "divider" },
      { type: "header", content: "Screening Results" },
      {
        type: "table",
        columns: ["Name", "Type", "Jurisdiction", "Severity", "Score", "Hits", "Lists", "Keywords", "Error"],
        rows: results.map((r) => [
          r.name + (r.isDuplicate ? " [DUP]" : ""),
          r.entityType ?? "—",
          r.jurisdiction ?? "—",
          r.severity.toUpperCase(),
          String(r.topScore),
          String(r.hitCount),
          r.listCoverage.slice(0, 3).join(", ") || "—",
          r.keywordGroups.slice(0, 3).join(", ") || "—",
          r.error ?? "—",
        ]),
      },
      { type: "divider" },
      {
        type: "badge",
        content: summary.critical > 0 || summary.high > 0 ? "ESCALATION REQUIRED" : "CLEAR",
        tone: summary.critical > 0 || summary.high > 0 ? "red" : "green",
      },
    ],
  });
}

const SEVERITY_CLS: Record<string, string> = {
  critical: "bg-red-dim text-red",
  high: "bg-orange-dim text-orange",
  medium: "bg-amber-dim text-amber",
  low: "bg-blue-dim text-blue",
  clear: "bg-green-dim text-green",
  error: "bg-red text-white",
};

const CHART_COLORS: Record<string, string> = {
  critical: "#ef4444", high: "#f97316", medium: "#f59e0b", low: "#3b82f6", clear: "#22c55e",
};

type SortKey = "name" | "severity" | "topScore" | "hitCount";
type SortDir = "asc" | "desc";
const SEV_ORDER: Record<string, number> = { critical:5, high:4, medium:3, low:2, clear:1, error:0 };
const PAGE_SIZE = 50;

export default function BatchPage() {
  const [rows, setRows] = useState<ParsedRow[]>([]);
  const [results, setResults] = useState<RowResult[]>([]);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [sortKey, setSortKey] = useState<SortKey>("severity");
  const [sortDir, setSortDir] = useState<SortDir>("desc");
  const [filterSev, setFilterSev] = useState<string>("all");
  const [page, setPage] = useState(0);
  const fileInput = useRef<HTMLInputElement>(null);

  // Pre-populate the row set when ?names=foo,bar,baz is in the URL —
  // EOCN announcement detail panels link into /batch with the
  // designated names already in hand. ?source=eocn-announcement-id
  // is preserved as `caseId` per row for audit traceability.
  useEffect(() => {
    if (typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);
    const namesRaw = params.get("names");
    if (!namesRaw) return;
    const source = params.get("source") ?? undefined;
    const split = namesRaw
      .split(/[\n;|,]+/)
      .map((s) => s.trim())
      .filter((s) => s.length > 0)
      .slice(0, 200);
    if (split.length === 0) return;
    setRows(
      split.map((name) =>
        source ? { name, caseId: source } : { name },
      ),
    );
    setResults([]);
    setSummary(null);
    setProgress(null);
    setError(null);
    setPage(0);
    // Clean the URL so a refresh doesn't keep re-injecting the same
    // names.
    window.history.replaceState(
      {},
      "",
      window.location.pathname,
    );
  }, []);

  const running = progress !== null && (summary === null);

  const handleFile = async (file: File) => {
    const text = await file.text();
    setRows(parseCsv(text));
    setResults([]);
    setSummary(null);
    setProgress(null);
    setError(null);
    setPage(0);
  };

  const runBatch = async () => {
    if (rows.length === 0 || running) return;
    setResults([]);
    setSummary(null);
    setProgress({ done: 0, total: rows.length });
    setError(null);
    setPage(0);

    try {
      const res = await fetch("/api/batch-screen-stream", {
        method: "POST",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify({ rows }),
      });
      if (!res.ok || !res.body) {
        setError(`Batch failed server ${res.status}`);
        setProgress(null);
        return;
      }
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buf = "";
      const accumulated: RowResult[] = [];
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += decoder.decode(value, { stream: true });
        const lines = buf.split("\n");
        buf = lines.pop() ?? "";
        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed.startsWith("data:")) continue;
          try {
            const evt = JSON.parse(trimmed.slice(5).trim()) as {
              type: string;
              index?: number;
              total?: number;
              result?: RowResult;
              summary?: Summary;
              error?: string;
            };
            if (evt.type === "progress" && evt.result) {
              accumulated.push(evt.result);
              setResults([...accumulated]);
              setProgress({ done: (evt.index ?? 0) + 1, total: evt.total ?? rows.length });
            } else if (evt.type === "complete" && evt.summary) {
              setSummary(evt.summary);
              setProgress(null);
            } else if (evt.type === "error") {
              setError(evt.error ?? "Batch failed");
              setProgress(null);
            }
          } catch { /* malformed SSE line — skip */ }
        }
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Batch failed");
      setProgress(null);
    }
  };

  const sortedFiltered = useMemo(() => {
    let list = [...results];
    if (filterSev !== "all") list = list.filter((r) => r.severity === filterSev);
    list.sort((a, b) => {
      let cmp = 0;
      if (sortKey === "name") cmp = a.name.localeCompare(b.name);
      else if (sortKey === "severity") cmp = (SEV_ORDER[a.severity] ?? 0) - (SEV_ORDER[b.severity] ?? 0);
      else if (sortKey === "topScore") cmp = a.topScore - b.topScore;
      else if (sortKey === "hitCount") cmp = a.hitCount - b.hitCount;
      return sortDir === "asc" ? cmp : -cmp;
    });
    return list;
  }, [results, sortKey, sortDir, filterSev]);

  const pageSlice = sortedFiltered.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);
  const totalPages = Math.ceil(sortedFiltered.length / PAGE_SIZE);

  const chartData = summary
    ? [
        { name: "Critical", value: summary.critical, fill: CHART_COLORS.critical },
        { name: "High", value: summary.high, fill: CHART_COLORS.high },
        { name: "Medium", value: summary.medium, fill: CHART_COLORS.medium },
        { name: "Low", value: summary.low, fill: CHART_COLORS.low },
        { name: "Clear", value: summary.clear, fill: CHART_COLORS.clear },
      ].filter((d) => d.value > 0)
    : [];

  const toggleSort = (key: SortKey) => {
    if (sortKey === key) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else { setSortKey(key); setSortDir("desc"); }
  };

  const sampleCsv = [
    "Name,Entity Type,Alias,DOB/Date of Registration,Gender,Nationality/Jurisdiction,ID/Register",
    'Wagner Group,Organisation,"PMC Wagner;ЧВК Вагнер",2014-05-01,N/A,RU,OGRN-1027700000000',
    'Dmitri Volkov,Individual,"Volkov D.;Дмитрий Волков",1968-03-14,Male,RU,P-4567890',
    "Kim Jong Un,Individual,Kim Jung Un,1984-01-08,Male,KP,",
    "Tornado Cash,Organisation,tornado.cash,2019-08-15,N/A,,",
  ].join("\r\n");

  const downloadSample = () => {
    const blob = new Blob(["﻿" + sampleCsv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = "hawkeye-batch-template.csv"; a.click();
    URL.revokeObjectURL(url);
  };

  const downloadCsv = () => {
    if (!results.length) return;
    const blob = new Blob(["﻿" + toCsv(results)], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = `hawkeye-batch-${Date.now()}.csv`; a.click();
    URL.revokeObjectURL(url);
  };

  const downloadPdf = async () => {
    if (!results.length || !summary) return;
    await exportPdf(results, summary);
  };

  return (
    <ModuleLayout asanaModule="batch" asanaLabel="Batch Screen">
      <div>
        <ModuleHero
          eyebrow="Module 07 · Bulk Screening"
          title="Batch"
          titleEm="screening."
          intro={
            <>
              <strong>Drop a CSV · screen up to 500 subjects at once.</strong>{" "}
              Live streaming progress, severity chart, sortable/filterable results table.
              Export as CSV or PDF audit report signed per FDL 10/2025 Art.24.
            </>
          }
          kpis={
            summary
              ? [
                  {
                    value: String(summary.critical + summary.high),
                    label: "high / critical",
                    tone: summary.critical + summary.high > 0 ? "red" : undefined,
                  },
                  {
                    value: String(summary.medium),
                    label: "medium",
                    tone: summary.medium > 0 ? "amber" : undefined,
                  },
                  { value: String(summary.clear + summary.low), label: "clear / low" },
                  { value: String(summary.errors), label: "errors", tone: summary.errors > 0 ? "red" : undefined },
                  { value: String(summary.total), label: "screened" },
                ]
              : rows.length > 0
                ? [{ value: String(rows.length), label: "subjects ready" }]
                : undefined
          }
        />

        {/* Drop zone */}
        <div
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => { e.preventDefault(); const f = e.dataTransfer.files[0]; if (f) void handleFile(f); }}
          className="border-2 border-dashed border-hair-3 rounded-xl p-8 bg-bg-panel text-center mb-6"
        >
          <div className="text-12 text-ink-2 mb-3">
            Drop a CSV here, or choose a file. Columns:{" "}
            <span className="font-mono">Name · Entity Type · Alias · DOB · Gender · Jurisdiction · ID</span>
          </div>
          <input ref={fileInput} type="file" accept=".csv,text/csv" className="hidden"
            onChange={(e) => { const f = e.target.files?.[0]; if (f) void handleFile(f); }} />
          <div className="flex gap-2 justify-center">
            <button onClick={() => fileInput.current?.click()}
              className="px-4 py-2 bg-brand text-white rounded text-12.5 font-semibold hover:bg-brand-hover">
              Choose CSV
            </button>
            <button onClick={downloadSample}
              className="px-4 py-2 bg-bg-2 text-ink-0 rounded text-12.5 font-medium hover:bg-hair-2">
              Download template
            </button>
          </div>
        </div>

        {/* Rows ready + run */}
        {rows.length > 0 && (
          <div className="bg-bg-panel border border-hair-2 rounded-lg p-4 mb-4">
            <div className="flex items-center gap-4 flex-wrap mb-3">
              <div className="text-13 text-ink-0 font-semibold">
                {rows.length} row{rows.length === 1 ? "" : "s"} ready
              </div>
              <button onClick={runBatch} disabled={running}
                className="px-4 py-1.5 bg-brand text-white rounded font-semibold text-12.5 hover:bg-brand-hover disabled:opacity-50">
                {running ? "Streaming…" : "Run batch"}
              </button>
              <button onClick={() => { setRows([]); setResults([]); setSummary(null); setProgress(null); setError(null); }}
                className="px-3 py-1.5 text-ink-2 text-12 hover:text-ink-0">
                Clear
              </button>
            </div>
            <div className="max-h-[120px] overflow-y-auto text-11 text-ink-2 font-mono">
              {rows.slice(0, 20).map((r, i) => (
                <div key={r.name ?? i}>
                  {r.name}{r.entityType ? ` · ${r.entityType}` : ""}{r.jurisdiction ? ` · ${r.jurisdiction}` : ""}
                </div>
              ))}
              {rows.length > 20 && <div>…and {rows.length - 20} more</div>}
            </div>
          </div>
        )}

        {/* Error */}
        {error && (
          <div className="bg-red-dim text-red rounded px-3 py-2 text-12 mb-4">{error}</div>
        )}

        {/* Progress bar */}
        {progress && (
          <div className="mb-4">
            <div className="flex justify-between text-11 text-ink-2 mb-1">
              <span>Screening {progress.done} / {progress.total}</span>
              <span className="font-mono">{Math.round((progress.done / progress.total) * 100)}%</span>
            </div>
            <div className="h-2 bg-bg-2 rounded-full overflow-hidden">
              <div
                className="h-full bg-brand transition-all duration-200 rounded-full"
                style={{ width: `${(progress.done / progress.total) * 100}%` }}
              />
            </div>
          </div>
        )}

        {/* Summary + chart */}
        {summary && (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-6">
            <div className="bg-ink-0 text-bg-0 rounded-xl p-4 flex flex-wrap gap-5 items-end">
              <SummaryStat label="Total" value={summary.total} />
              <SummaryStat label="Critical" value={summary.critical} tone="text-red" />
              <SummaryStat label="High" value={summary.high} tone="text-orange" />
              <SummaryStat label="Medium" value={summary.medium} tone="text-amber" />
              <SummaryStat label="Low" value={summary.low} tone="text-blue" />
              <SummaryStat label="Clear" value={summary.clear} tone="text-green" />
              {summary.errors > 0 && <SummaryStat label="Errors" value={summary.errors} tone="text-red" />}
              {summary.duplicates > 0 && <SummaryStat label="Duplicates" value={summary.duplicates} tone="text-amber" />}
              <div className="ml-auto flex gap-2 items-end">
                <button onClick={downloadCsv}
                  className="px-3 py-1.5 bg-brand text-white rounded text-11 font-semibold hover:bg-brand-hover">
                  CSV
                </button>
                <button onClick={downloadPdf}
                  className="px-3 py-1.5 bg-bg-0/20 text-bg-0 border border-bg-0/30 rounded text-11 font-semibold hover:bg-bg-0/30">
                  PDF audit
                </button>
              </div>
            </div>
            {chartData.length > 0 && (
              <div className="bg-bg-panel border border-hair-2 rounded-xl p-4">
                <div className="text-10 uppercase tracking-wide-4 text-ink-3 mb-2">Severity distribution</div>
                <ResponsiveContainer width="100%" height={120}>
                  <BarChart data={chartData} margin={{ top: 0, right: 0, left: -20, bottom: 0 }}>
                    <XAxis dataKey="name" tick={{ fontSize: 10, fill: "#888894" }} axisLine={false} tickLine={false} />
                    <YAxis tick={{ fontSize: 10, fill: "#888894" }} axisLine={false} tickLine={false} />
                    <Tooltip
                      contentStyle={{ background: "#121215", border: "1px solid #1e1e24", borderRadius: 4, fontSize: 11 }}
                      cursor={{ fill: "rgba(255,255,255,0.04)" }}
                    />
                    <Bar dataKey="value" radius={[3,3,0,0]}>
                      {chartData.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={entry.fill} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )}
          </div>
        )}

        {/* Filter + sort toolbar */}
        {results.length > 0 && (
          <div className="flex items-center gap-3 mb-3 flex-wrap">
            <span className="text-11 text-ink-3">Filter:</span>
            {["all","critical","high","medium","low","clear","error"].map((s) => (
              <button key={s} onClick={() => { setFilterSev(s); setPage(0); }}
                className={`px-2 py-0.5 rounded-sm text-10 font-mono font-semibold uppercase transition-colors ${
                  filterSev === s ? "bg-brand text-white" : "bg-bg-2 text-ink-2 hover:text-ink-0"
                }`}>
                {s}
              </button>
            ))}
            <span className="ml-auto text-11 text-ink-3">
              {sortedFiltered.length} row{sortedFiltered.length === 1 ? "" : "s"}
            </span>
          </div>
        )}

        {/* Results table */}
        {results.length > 0 && (
          <div className="bg-bg-panel border border-hair-2 rounded-xl overflow-hidden mb-4">
            <table className="w-full text-12">
              <thead className="bg-bg-1 border-b border-hair-2">
                <tr>
                  {(["Name","Severity","Score","Hits"] as const).map((label, i) => {
                    const key = (["name","severity","topScore","hitCount"] as SortKey[])[i]!;
                    const active = sortKey === key;
                    return (
                      <th key={label} onClick={() => toggleSort(key)}
                        className={`text-left px-3 py-2 text-10 uppercase tracking-wide-3 cursor-pointer select-none ${active ? "text-brand" : "text-ink-2 hover:text-ink-0"}`}>
                        {label} {active ? (sortDir === "asc" ? "↑" : "↓") : ""}
                      </th>
                    );
                  })}
                  <th className="text-left px-3 py-2 text-10 uppercase tracking-wide-3 text-ink-2">Lists</th>
                  <th className="text-left px-3 py-2 text-10 uppercase tracking-wide-3 text-ink-2">Keywords</th>
                  <th className="text-left px-3 py-2 text-10 uppercase tracking-wide-3 text-ink-2">Signals</th>
                  <th className="w-[44px]" aria-label="Actions" />
                </tr>
              </thead>
              <tbody>
                {pageSlice.map((r, i) => (
                  <tr key={`${r.name}-${i}`} className="border-b border-hair last:border-0 hover:bg-bg-1">
                    <td className="px-3 py-2 text-ink-0 font-medium">
                      {r.name}
                      {r.isDuplicate && (
                        <span className="ml-1.5 px-1 py-px rounded-sm font-mono text-10 bg-amber-dim text-amber">dup</span>
                      )}
                    </td>
                    <td className="px-3 py-2">
                      <span className={`inline-flex items-center px-1.5 py-px rounded-sm font-mono text-10 ${SEVERITY_CLS[r.severity] ?? "bg-bg-2 text-ink-1"}`}>
                        {r.severity}
                      </span>
                    </td>
                    <td className="px-3 py-2 text-right font-mono">{r.topScore}</td>
                    <td className="px-3 py-2 text-right font-mono">{r.hitCount}</td>
                    <td className="px-3 py-2">
                      <div className="flex flex-wrap gap-0.5">
                        {r.listCoverage.map((l) => (
                          <span key={l} className="px-1 py-px rounded-sm font-mono text-10 bg-violet-dim text-violet">{l}</span>
                        ))}
                      </div>
                    </td>
                    <td className="px-3 py-2">
                      <div className="flex flex-wrap gap-0.5">
                        {r.keywordGroups.map((k) => (
                          <span key={k} className="px-1 py-px rounded-sm font-mono text-10 bg-red-dim text-red">{k.replace(/-/g," ")}</span>
                        ))}
                      </div>
                    </td>
                    <td className="px-3 py-2">
                      <div className="flex flex-wrap gap-0.5">
                        {(r.checkpoints ?? []).map((cp) => (
                          <span key={cp} className="px-1 py-px rounded-sm font-mono text-10 bg-amber-dim text-amber">{cp.replace(/-/g," ")}</span>
                        ))}
                        {r.topHitMethod && (
                          <span className="px-1 py-px rounded-sm font-mono text-10 bg-bg-2 text-ink-2" title={r.topHitReason}>{r.topHitMethod}</span>
                        )}
                        {(r.crossRef?.watchmanHits ?? 0) > 0 && (
                          <span className="px-1 py-px rounded-sm font-mono text-10 bg-red-dim text-red">watchman·{r.crossRef!.watchmanHits}</span>
                        )}
                      </div>
                    </td>
                    <td className="px-2 py-2 text-right">
                      <RowActions
                        label={`batch row ${r.name}`}
                        onDelete={() => {
                          setResults((prev) => prev.filter((x) => x.name !== r.name));
                        }}
                        confirmDelete={false}
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="flex items-center gap-2 justify-center">
            <button onClick={() => setPage((p) => Math.max(0, p - 1))} disabled={page === 0}
              className="px-3 py-1 text-12 bg-bg-2 rounded disabled:opacity-40 hover:bg-hair-2">← Prev</button>
            <span className="text-11 text-ink-2">Page {page + 1} / {totalPages}</span>
            <button onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))} disabled={page >= totalPages - 1}
              className="px-3 py-1 text-12 bg-bg-2 rounded disabled:opacity-40 hover:bg-hair-2">Next →</button>
          </div>
        )}
      </div>
    </ModuleLayout>
  );
}

function SummaryStat({ label, value, tone }: { label: string; value: number; tone?: string }) {
  return (
    <div>
      <div className="text-10 uppercase tracking-wide-4 text-bg-0/50">{label}</div>
      <div className={`text-18 font-mono font-semibold ${tone ?? "text-bg-0"}`}>{value}</div>
    </div>
  );
}
