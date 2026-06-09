"use client";

import { useState } from "react";
import { ModuleLayout } from "@/components/layout/ModuleLayout";
import { caughtErrorMessage } from "@/lib/client/error-utils";
import type { BatchScreeningResponse, BatchResult, BatchSubject } from "@/app/api/screening/multi-agent-batch/route";

// ── Verdict styling ──────────────────────────────────────────────────────────

function verdictBadge(v: BatchResult["verdict"]): string {
  switch (v) {
    case "clear":          return "bg-emerald-950/40 text-emerald-300 border-emerald-500/30";
    case "hit":            return "bg-red-950/40 text-red-400 border-red-500/30";
    case "possible_match": return "bg-amber-950/40 text-amber-300 border-amber-500/30";
    case "held_review":    return "bg-violet-950/40 text-violet-300 border-violet-500/30";
    default:               return "bg-bg-1 text-ink-3 border-hair-2";
  }
}

function verdictLabel(v: BatchResult["verdict"]): string {
  switch (v) {
    case "clear":          return "CLEAR";
    case "hit":            return "HIT";
    case "possible_match": return "POSSIBLE";
    case "held_review":    return "HELD";
    default:               return "ERROR";
  }
}

function verdictDot(v: BatchResult["verdict"]): string {
  switch (v) {
    case "clear":          return "bg-emerald-500";
    case "hit":            return "bg-red-500";
    case "possible_match": return "bg-amber-400";
    case "held_review":    return "bg-violet-500";
    default:               return "bg-ink-4";
  }
}

// ── CSV parser ────────────────────────────────────────────────────────────────

function parseCsvSubjects(csv: string): BatchSubject[] {
  const lines = csv.trim().split("\n").filter((l) => l.trim());
  if (lines.length === 0) return [];

  const headers = (lines[0] ?? "").toLowerCase().split(",").map((h) => h.trim());
  const nameIdx = headers.findIndex((h) => h.includes("name"));
  if (nameIdx === -1) {
    // Treat each line as a bare name
    return lines.map((l, i) => ({ id: `row-${i + 1}`, name: l.trim() }));
  }

  const dobIdx   = headers.findIndex((h) => h.includes("dob") || h.includes("birth"));
  const natIdx   = headers.findIndex((h) => h.includes("nation") || h.includes("country"));
  const typeIdx  = headers.findIndex((h) => h.includes("type") || h.includes("entity"));
  const idIdx    = headers.findIndex((h) => h === "id");

  return lines.slice(1).map((line, i) => {
    const cols = line.split(",").map((c) => c.trim());
    return {
      id:          idIdx >= 0 ? cols[idIdx] : `row-${i + 1}`,
      name:        cols[nameIdx] ?? "",
      dob:         dobIdx >= 0  ? cols[dobIdx]   : undefined,
      nationality: natIdx >= 0  ? cols[natIdx]   : undefined,
      entityType:  (typeIdx >= 0 ? (cols[typeIdx]?.toLowerCase().includes("entity") ? "entity" : "individual") : "individual") as "individual" | "entity",
    };
  }).filter((s) => s.name);
}

// ── Results table ────────────────────────────────────────────────────────────

function ResultsTable({ results }: { results: BatchResult[] }) {
  return (
    <div className="overflow-x-auto rounded-xl border border-hair-2">
      <table className="w-full text-11 border-collapse">
        <thead>
          <tr className="border-b border-hair-2 bg-bg-1">
            <th className="text-left px-3 py-2 font-semibold text-ink-3 uppercase tracking-wide-2 hidden sm:table-cell">#</th>
            <th className="text-left px-3 py-2 font-semibold text-ink-3 uppercase tracking-wide-2">Subject</th>
            <th className="text-left px-3 py-2 font-semibold text-ink-3 uppercase tracking-wide-2">Verdict</th>
            <th className="text-left px-3 py-2 font-semibold text-ink-3 uppercase tracking-wide-2">Risk</th>
            <th className="text-left px-3 py-2 font-semibold text-ink-3 uppercase tracking-wide-2 hidden sm:table-cell">Matches</th>
            <th className="text-left px-3 py-2 font-semibold text-ink-3 uppercase tracking-wide-2 hidden md:table-cell">ms</th>
          </tr>
        </thead>
        <tbody>
          {results.map((r, i) => (
            <tr key={r.subjectId} className="border-b border-hair-2 last:border-0 hover:bg-bg-1/50 transition-colors">
              <td className="px-3 py-2 text-ink-4 font-mono text-10 hidden sm:table-cell">{i + 1}</td>
              <td className="px-3 py-2 text-ink-0 font-medium max-w-[200px] truncate" title={r.name}>{r.name}</td>
              <td className="px-3 py-2">
                <span className={`inline-flex items-center gap-1 px-1.5 py-px rounded border font-mono text-9 font-semibold uppercase tracking-wide-2 ${verdictBadge(r.verdict)}`}>
                  <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${verdictDot(r.verdict)}`} />
                  {verdictLabel(r.verdict)}
                </span>
              </td>
              <td className="px-3 py-2 font-mono text-10 text-ink-2">
                {r.riskScore !== null ? r.riskScore.toFixed(2) : "—"}
              </td>
              <td className="px-3 py-2 font-mono text-10 text-ink-2 hidden sm:table-cell">{r.matchCount}</td>
              <td className="px-3 py-2 font-mono text-10 text-ink-4 hidden md:table-cell">{r.processingMs}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ── Summary bar ───────────────────────────────────────────────────────────────

function SummaryBar({ summary }: { summary: BatchScreeningResponse["summary"] }) {
  const items = [
    { label: "Clear",    count: summary.clear,          color: "bg-emerald-500" },
    { label: "Hit",      count: summary.hit,            color: "bg-red-500" },
    { label: "Possible", count: summary.possible_match, color: "bg-amber-400" },
    { label: "Held",     count: summary.held_review,    color: "bg-violet-500" },
    { label: "Error",    count: summary.error,          color: "bg-ink-4" },
  ];

  return (
    <div className="flex gap-4 flex-wrap">
      {items.map((item) => (
        <div key={item.label} className="flex items-center gap-2">
          <span className={`w-2.5 h-2.5 rounded-full ${item.color}`} />
          <span className="text-12 font-semibold text-ink-0 tabular-nums">{item.count}</span>
          <span className="text-11 text-ink-3">{item.label}</span>
        </div>
      ))}
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

const DEMO_CSV = `name,nationality,dob
John Smith,GBR,1975-03-15
Maria Garcia,ESP,1982-07-22
Ali Hassan,UAE,1990-01-10
Wang Wei,CHN,1968-11-30
Sarah Johnson,USA,1995-06-05`;

export default function BatchScreeningPage() {
  const [csvText, setCsvText] = useState(DEMO_CSV);
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<BatchScreeningResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  const subjects = parseCsvSubjects(csvText);
  const canRun = subjects.length > 0 && subjects.length <= 50 && !running;

  const run = async () => {
    setRunning(true);
    setError(null);
    setResult(null);
    try {
      const res = await fetch("/api/screening/multi-agent-batch", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ subjects }),
      });
      const data = await res.json() as BatchScreeningResponse;
      if (!data.ok) throw new Error("Batch screening failed");
      setResult(data);
    } catch (e) {
      setError(caughtErrorMessage(e, "Batch screening failed"));
    } finally {
      setRunning(false);
    }
  };

  return (
    <ModuleLayout asanaModule="batch-screening" asanaLabel="Batch Screening" onRun={() => void run()}>
      <div className="mb-6 border-b-2 border-ink-0 pb-4">
        <div className="flex items-center gap-1.5 text-10.5 font-semibold uppercase tracking-wide-4 text-brand mb-1">
          <span className="w-1.5 h-1.5 rounded-full bg-brand shrink-0 shadow-[0_0_6px_var(--brand)] opacity-80" />
          Multi-Agent · High Volume
        </div>
        <h1 className="font-display text-36 text-ink-0 m-0 leading-tight">
          Batch <em className="italic text-brand">screening.</em>
        </h1>
        <p className="text-13 text-ink-2 mt-1 max-w-[70ch]">
          Screen up to 50 subjects in parallel using multi-agent orchestration.
          Each sub-batch of 5 runs concurrently. Results are audit-logged.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Input */}
        <div className="space-y-4">
          <div>
            <label className="block text-11 font-semibold uppercase tracking-wide-3 text-ink-3 mb-2">
              Subject List (CSV — columns: name, nationality, dob, entityType)
            </label>
            <textarea
              className="w-full font-mono text-11 bg-bg-panel border border-hair-2 rounded-xl p-3 text-ink-1 resize-y focus:outline-none focus:border-brand transition-colors"
              rows={10}
              value={csvText}
              onChange={(e) => setCsvText(e.target.value)}
              placeholder="name,nationality,dob&#10;John Smith,GBR,1975-03-15"
            />
          </div>

          <div className="flex items-center gap-3">
            <div className="text-11 text-ink-3">
              {subjects.length > 0 ? (
                <span className={subjects.length > 50 ? "text-red-400" : "text-emerald-300"}>
                  {subjects.length} subjects parsed{subjects.length > 50 ? " — max 50" : ""}
                </span>
              ) : (
                <span className="text-ink-4">No subjects parsed</span>
              )}
            </div>
            <button
              type="button"
              onClick={run}
              disabled={!canRun}
              className="ml-auto px-4 py-2 rounded-xl text-13 font-semibold bg-brand text-white hover:bg-brand/90 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {running ? (
                <span className="flex items-center gap-2">
                  <span className="w-3 h-3 rounded-full border-2 border-white/30 border-t-white animate-spin" />
                  Screening…
                </span>
              ) : (
                `Run Batch (${subjects.length})`
              )}
            </button>
          </div>

          <div className="text-10 text-ink-4 space-y-0.5">
            <div>• Parallel sub-batches of 5 subjects</div>
            <div>• Each result independently audit-logged</div>
            <div>• Fail-closed: errors return <span className="font-mono">held_review</span></div>
            <div>• Max 50 subjects per request</div>
          </div>
        </div>

        {/* Results */}
        <div className="space-y-4">
          {error && (
            <div className="text-red-400 text-13 p-4 border border-red-500/30 rounded-xl bg-red-950/20">
              {error}
            </div>
          )}

          {result && (
            <>
              <div className="bg-bg-panel border border-hair-2 rounded-xl p-4">
                <div className="text-10 font-semibold uppercase tracking-wide-3 text-ink-3 mb-3">Batch Summary</div>
                <SummaryBar summary={result.summary} />
                <div className="mt-3 text-10 text-ink-4">
                  Batch ID: <span className="font-mono">{result.batchId}</span> ·{" "}
                  {result.completedCount}/{result.totalSubjects} completed ·{" "}
                  {result.errorCount} error(s) · {new Date(result.processedAt).toLocaleTimeString()}
                </div>
              </div>

              <ResultsTable results={result.results} />
            </>
          )}

          {!result && !error && !running && (
            <div className="bg-bg-panel border border-hair-2 rounded-xl p-8 flex flex-col items-center gap-2 text-center">
              <div className="text-32 opacity-20">⚡</div>
              <div className="text-13 font-semibold text-ink-2">Ready to screen</div>
              <div className="text-11 text-ink-4">Enter subjects on the left and click Run Batch</div>
            </div>
          )}
        </div>
      </div>
    </ModuleLayout>
  );
}
