"use client";

import { useMemo, useRef, useState } from "react";
import { ModuleLayout } from "@/components/layout/ModuleLayout";
import { fetchJson } from "@/lib/api/fetchWithRetry";

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
}

interface BatchResponse {
  ok: boolean;
  summary?: {
    total: number;
    critical: number;
    high: number;
    medium: number;
    low: number;
    clear: number;
    errors: number;
    totalDurationMs: number;
  };
  results?: RowResult[];
  error?: string;
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

// Parse a single CSV row with RFC-4180-style quoted fields.
function splitCsvRow(line: string): string[] {
  const out: string[] = [];
  let cur = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inQuotes) {
      if (ch === '"' && line[i + 1] === '"') {
        cur += '"';
        i++;
      } else if (ch === '"') {
        inQuotes = false;
      } else {
        cur += ch;
      }
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === ",") {
      out.push(cur);
      cur = "";
    } else {
      cur += ch;
    }
  }
  out.push(cur);
  return out.map((c) => c.trim());
}

function parseCsv(text: string): ParsedRow[] {
  // Strip UTF-8 BOM if present so header detection doesn't miss "name".
  const clean = text.replace(/^﻿/, "");
  const lines = clean.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  if (lines.length === 0) return [];
  const firstLine = lines[0] ?? "";
  const looksHeader = /name/i.test(firstLine);
  const rows = looksHeader ? lines.slice(1) : lines;
  const header = looksHeader
    ? splitCsvRow(firstLine).map((h) => h.toLowerCase())
    : null;
  const idx = (...hs: string[]): number => {
    if (!header) return -1;
    for (const h of hs) {
      const i = header.indexOf(h);
      if (i >= 0) return i;
    }
    return -1;
  };
  const iName = Math.max(idx("name", "name/entity", "entity"), 0);
  const iType = idx("type", "entity type", "entitytype");
  const iAlias = idx("alias", "aliases", "alternate names");
  const iDob = idx("dob", "date of birth", "date of registration", "dob/date of registration");
  const iGender = idx("gender");
  const iJur = idx(
    "jurisdiction",
    "nationality",
    "nationality/jurisdiction",
    "country",
  );
  const iId = idx("id", "id/register", "register", "identification number");

  return rows
    .map((line) => {
      const cols = splitCsvRow(line);
      const name = cols[iName] ?? "";
      const out: ParsedRow = { name };
      if (iType >= 0 && cols[iType]) {
        const t = cols[iType].toLowerCase();
        if (t.startsWith("ind")) out.entityType = "individual";
        else if (t.startsWith("org")) out.entityType = "organisation";
      }
      if (iAlias >= 0 && cols[iAlias]) {
        out.aliases = cols[iAlias]
          .split(/;|\|/)
          .map((a) => a.trim())
          .filter(Boolean);
      }
      if (iDob >= 0 && cols[iDob]) out.dob = cols[iDob];
      if (iGender >= 0 && cols[iGender]) {
        const g = cols[iGender].toLowerCase();
        if (g.startsWith("m")) out.gender = "male";
        else if (g.startsWith("f")) out.gender = "female";
        else out.gender = "n/a";
      }
      if (iJur >= 0 && cols[iJur]) out.jurisdiction = cols[iJur];
      if (iId >= 0 && cols[iId]) out.idNumber = cols[iId];
      return out;
    })
    .filter((r) => r.name);
}

function csvEscape(value: string | number | null | undefined): string {
  if (value == null || value === "") return "";
  const str = String(value);
  return /[",\r\n]/.test(str) ? `"${str.replace(/"/g, '""')}"` : str;
}

function toCsv(results: RowResult[]): string {
  const header = [
    "Name",
    "Entity Type",
    "Alias",
    "DOB/Date of Registration",
    "Gender",
    "Nationality/Jurisdiction",
    "ID/Register",
    "Severity",
    "Top score",
    "Hit count",
    "List coverage",
    "Keyword groups",
    "ESG categories",
    "Duration ms",
    "Error",
  ].join(",");
  const rows = results.map((r) =>
    [
      csvEscape(r.name),
      csvEscape(r.entityType),
      csvEscape(r.aliases ? r.aliases.join(";") : ""),
      csvEscape(r.dob),
      csvEscape(r.gender),
      csvEscape(r.jurisdiction),
      csvEscape(r.idNumber),
      csvEscape(r.severity),
      csvEscape(r.topScore),
      csvEscape(r.hitCount),
      csvEscape(r.listCoverage.join("|")),
      csvEscape(r.keywordGroups.join("|")),
      csvEscape(r.esgCategories.join("|")),
      csvEscape(r.durationMs),
      csvEscape(r.error),
    ].join(","),
  );
  return [header, ...rows].join("\r\n");
}

const SEVERITY_CLS: Record<string, string> = {
  critical: "bg-red-dim text-red",
  high: "bg-orange-dim text-orange",
  medium: "bg-amber-dim text-amber",
  low: "bg-blue-dim text-blue",
  clear: "bg-green-dim text-green",
  error: "bg-red text-white",
};

export default function BatchPage() {
  const [rows, setRows] = useState<ParsedRow[]>([]);
  const [status, setStatus] = useState<
    | { kind: "idle" }
    | { kind: "loading" }
    | { kind: "done"; resp: BatchResponse }
    | { kind: "error"; error: string }
  >({ kind: "idle" });
  const fileInput = useRef<HTMLInputElement>(null);

  const summary = status.kind === "done" ? status.resp.summary : null;
  const results = status.kind === "done" ? status.resp.results ?? [] : [];

  const handleFile = async (file: File) => {
    const text = await file.text();
    setRows(parseCsv(text));
  };

  const onDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    const f = e.dataTransfer.files[0];
    if (f) void handleFile(f);
  };

  const runBatch = async () => {
    if (rows.length === 0) return;
    setStatus({ kind: "loading" });
    // Retry-aware POST with the standard 3 × 750ms / 15s contract. A
    // batch run is the most expensive endpoint we have so we rely on
    // fetchJson's per-attempt timeout to bound a hung Netlify cold-start
    // rather than freezing the operator on "loading…" forever.
    const res = await fetchJson<BatchResponse>("/api/batch-screen", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ rows }),
      label: "Batch failed",
      timeoutMs: 60_000, // batch runs can legitimately take longer
    });
    if (!res.ok) {
      setStatus({ kind: "error", error: res.error ?? "Batch failed" });
      return;
    }
    if (!res.data?.ok) {
      setStatus({
        kind: "error",
        error: res.data?.error ?? "Batch failed malformed response",
      });
      return;
    }
    setStatus({ kind: "done", resp: res.data });
  };

  const downloadCsv = () => {
    if (results.length === 0) return;
    const csv = toCsv(results);
    // UTF-8 BOM so Excel opens Cyrillic / Arabic / CJK aliases correctly.
    const blob = new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `hawkeye-batch-${Date.now()}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const sampleCsv = useMemo(
    () =>
      [
        "Name,Entity Type,Alias,DOB/Date of Registration,Gender,Nationality/Jurisdiction,ID/Register",
        'Wagner Group,Organisation,"PMC Wagner;ЧВК Вагнер",2014-05-01,N/A,RU,OGRN-1027700000000',
        'Dmitri Volkov,Individual,"Volkov D.;Дмитрий Волков",1968-03-14,Male,RU,P-4567890',
        "Kim Jong Un,Individual,Kim Jung Un,1984-01-08,Male,KP,",
        "Tornado Cash,Organisation,tornado.cash,2019-08-15,N/A,,",
      ].join("\r\n"),
    [],
  );

  const downloadSample = () => {
    // UTF-8 BOM so Excel doesn't mangle the Cyrillic aliases.
    const blob = new Blob(["﻿" + sampleCsv], {
      type: "text/csv;charset=utf-8",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "hawkeye-batch-template.csv";
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <ModuleLayout>
      <div>
        <div className="mb-8">
          <div className="font-mono text-11 tracking-wide-8 uppercase text-ink-2 mb-2">
            MODULE 07 · BATCH SCREENING
          </div>
          <h1 className="font-display font-normal text-48 leading-[1.1] tracking-tightest m-0 mb-2 text-ink-0">
            Batch <em className="italic text-brand">screening.</em>
          </h1>
          <p className="max-w-[72ch] text-ink-1 text-13.5 leading-[1.6] m-0 mt-3 border-l-2 border-brand pl-3.5">
            <strong>Drop a CSV · screen up to 500 subjects at once.</strong> Every row
            is run through quickScreen (sanctions / fuzzy match), the 16-group
            adverse-keyword classifier and the 28-category ESG classifier — same
            brain as single screening. Export the result as CSV for audit.
          </p>
        </div>

        <div
          onDragOver={(e) => e.preventDefault()}
          onDrop={onDrop}
          className="border-2 border-dashed border-hair-3 rounded-xl p-8 bg-bg-panel text-center mb-6"
        >
          <div className="text-12 text-ink-2 mb-3">
            Drop a CSV here, or choose a file. Columns:{" "}
            <span className="font-mono">Name · Entity Type · Alias · DOB/Date of Registration · Gender · Nationality/Jurisdiction · ID/Register</span>
          </div>
          <input
            ref={fileInput}
            type="file"
            accept=".csv,text/csv"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) void handleFile(f);
            }}
          />
          <div className="flex gap-2 justify-center">
            <button
              onClick={() => fileInput.current?.click()}
              className="px-4 py-2 bg-ink-0 text-bg-0 rounded text-12.5 font-semibold hover:bg-ink-1"
            >
              Choose CSV
            </button>
            <button
              onClick={downloadSample}
              className="px-4 py-2 bg-bg-2 text-ink-0 rounded text-12.5 font-medium hover:bg-hair-2"
            >
              Download template
            </button>
          </div>
        </div>

        {rows.length > 0 && (
          <div className="bg-bg-panel border border-hair-2 rounded-lg p-4 mb-4">
            <div className="flex items-center gap-4 flex-wrap mb-3">
              <div className="text-13 text-ink-0 font-semibold">
                {rows.length} row{rows.length === 1 ? "" : "s"} ready
              </div>
              <button
                onClick={runBatch}
                disabled={status.kind === "loading"}
                className="px-4 py-1.5 bg-brand text-white rounded font-semibold text-12.5 hover:bg-brand-hover disabled:opacity-50"
              >
                {status.kind === "loading" ? "Screening…" : "Run batch"}
              </button>
              <button
                onClick={() => {
                  setRows([]);
                  setStatus({ kind: "idle" });
                }}
                className="px-3 py-1.5 text-ink-2 text-12 hover:text-ink-0"
              >
                Clear
              </button>
            </div>
            <div className="max-h-[180px] overflow-y-auto text-11 text-ink-2 font-mono">
              {rows.slice(0, 25).map((r, i) => (
                <div key={r.name ?? i}>
                  {r.name}
                  {r.entityType ? ` · ${r.entityType}` : ""}
                  {r.jurisdiction ? ` · ${r.jurisdiction}` : ""}
                  {r.dob ? ` · DOB ${r.dob}` : ""}
                  {r.gender ? ` · ${r.gender}` : ""}
                  {r.idNumber ? ` · ${r.idNumber}` : ""}
                </div>
              ))}
              {rows.length > 25 && <div>…and {rows.length - 25} more</div>}
            </div>
          </div>
        )}

        {status.kind === "error" && (
          <div className="bg-red-dim text-red rounded px-3 py-2 text-12 mb-4">
            Batch failed: {status.error}
          </div>
        )}

        {summary && (
          <div className="bg-ink-0 text-bg-0 rounded-xl p-4 mb-4 flex flex-wrap gap-6 items-end">
            <SummaryStat label="Total" value={summary.total} />
            <SummaryStat label="Critical" value={summary.critical} tone="text-red" />
            <SummaryStat label="High" value={summary.high} tone="text-orange" />
            <SummaryStat label="Medium" value={summary.medium} tone="text-amber" />
            <SummaryStat label="Low" value={summary.low} tone="text-blue" />
            <SummaryStat label="Clear" value={summary.clear} tone="text-green" />
            {summary.errors > 0 && (
              <SummaryStat label="Errors" value={summary.errors} tone="text-red" />
            )}
            <div className="ml-auto flex gap-2">
              <button
                onClick={downloadCsv}
                className="px-3 py-1.5 bg-brand text-white rounded text-11 font-semibold hover:bg-brand-hover"
              >
                Download CSV
              </button>
            </div>
          </div>
        )}

        {results.length > 0 && (
          <div className="bg-bg-panel border border-hair-2 rounded-xl overflow-hidden">
            <table className="w-full text-12">
              <thead className="bg-bg-1 border-b border-hair-2">
                <tr>
                  <th className="text-left px-3 py-2 text-10 uppercase tracking-wide-3 text-ink-2">
                    Name
                  </th>
                  <th className="text-left px-3 py-2 text-10 uppercase tracking-wide-3 text-ink-2">
                    Severity
                  </th>
                  <th className="text-right px-3 py-2 text-10 uppercase tracking-wide-3 text-ink-2">
                    Score
                  </th>
                  <th className="text-right px-3 py-2 text-10 uppercase tracking-wide-3 text-ink-2">
                    Hits
                  </th>
                  <th className="text-left px-3 py-2 text-10 uppercase tracking-wide-3 text-ink-2">
                    Lists
                  </th>
                  <th className="text-left px-3 py-2 text-10 uppercase tracking-wide-3 text-ink-2">
                    Keyword groups
                  </th>
                  <th className="text-left px-3 py-2 text-10 uppercase tracking-wide-3 text-ink-2">
                    ESG
                  </th>
                </tr>
              </thead>
              <tbody>
                {results.map((r, i) => (
                  <tr key={`${r.name}-${i}`} className="border-b border-hair last:border-0 hover:bg-bg-1">
                    <td className="px-3 py-2 text-ink-0 font-medium">{r.name}</td>
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
                          <span key={l} className="px-1 py-px rounded-sm font-mono text-10 bg-violet-dim text-violet">
                            {l}
                          </span>
                        ))}
                      </div>
                    </td>
                    <td className="px-3 py-2">
                      <div className="flex flex-wrap gap-0.5">
                        {r.keywordGroups.map((k) => (
                          <span key={k} className="px-1 py-px rounded-sm font-mono text-10 bg-red-dim text-red">
                            {k.replace(/-/g, " ")}
                          </span>
                        ))}
                      </div>
                    </td>
                    <td className="px-3 py-2">
                      <div className="flex flex-wrap gap-0.5">
                        {r.esgCategories.slice(0, 3).map((c) => (
                          <span key={c} className="px-1 py-px rounded-sm font-mono text-10 bg-green-dim text-green">
                            {c.replace(/-/g, " ")}
                          </span>
                        ))}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </ModuleLayout>
  );
}

function SummaryStat({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone?: string;
}) {
  return (
    <div>
      <div className="text-10 uppercase tracking-wide-4 text-bg-0/50">{label}</div>
      <div className={`text-18 font-mono font-semibold ${tone ?? "text-bg-0"}`}>{value}</div>
    </div>
  );
}
