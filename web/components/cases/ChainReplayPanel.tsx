"use client";

// Hawkeye Sterling — ChainReplayPanel (audit follow-up #31).
//
// Paste-a-runId reasoning-chain replay UI. Loads the persisted verdict
// + chain via /api/cases/<id> (existing endpoint), renders every
// ReasoningChainNode in order so an MLRO or auditor can see EXACTLY
// what the brain did at disposition day. FDL 10/2025 Art.24 + Art.20
// (tamper-evident retention) + Charter P9 (explicit calibration trail).

import { useState } from "react";

interface ReasoningChainNode {
  step: number;
  modeId: string;
  faculty: string;
  summary: string;
  producedAt: number;
}

interface VerdictResponse {
  ok?: boolean;
  case?: {
    runId?: string;
    subject?: { name?: string };
    outcome?: string;
    aggregateScore?: number;
    aggregateConfidence?: number;
    chain?: ReasoningChainNode[];
    findings?: Array<{ modeId: string; rationale?: string }>;
    methodology?: string;
    generatedAt?: number;
  };
  error?: string;
}

const FACULTY_BADGE: Record<string, string> = {
  reasoning: "bg-blue-100 text-blue-800",
  data_analysis: "bg-purple-100 text-purple-800",
  deep_thinking: "bg-indigo-100 text-indigo-800",
  intelligence: "bg-emerald-100 text-emerald-800",
  smartness: "bg-amber-100 text-amber-800",
  strong_brain: "bg-rose-100 text-rose-800",
  inference: "bg-cyan-100 text-cyan-800",
  argumentation: "bg-orange-100 text-orange-800",
  introspection: "bg-zinc-100 text-zinc-700",
  ratiocination: "bg-violet-100 text-violet-800",
  synthesis: "bg-pink-100 text-pink-800",
  anticipation: "bg-teal-100 text-teal-800",
  forensic_accounting: "bg-yellow-100 text-yellow-800",
  geopolitical_awareness: "bg-lime-100 text-lime-800",
};

export function ChainReplayPanel(): JSX.Element {
  const [caseId, setCaseId] = useState("");
  const [busy, setBusy] = useState(false);
  const [data, setData] = useState<VerdictResponse | null>(null);
  const [errorText, setErrorText] = useState<string | null>(null);

  async function load(): Promise<void> {
    if (!caseId.trim()) return;
    setBusy(true);
    setErrorText(null);
    setData(null);
    try {
      const res = await fetch(`/api/cases/${encodeURIComponent(caseId.trim())}`);
      const json = (await res.json()) as VerdictResponse;
      if (!res.ok || !json.ok) {
        setErrorText(json.error ?? `HTTP ${res.status}`);
        return;
      }
      setData(json);
    } catch (err) {
      setErrorText(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="rounded-md border border-zinc-200 bg-white p-3">
      <div className="text-xs uppercase tracking-wide text-zinc-500">Reasoning-chain replay</div>
      <div className="mt-2 flex gap-2">
        <input
          type="text"
          value={caseId}
          onChange={(e) => setCaseId(e.target.value)}
          placeholder="Case ID or runId"
          className="flex-1 rounded border border-zinc-300 px-2 py-1 text-xs"
          onKeyDown={(e) => { if (e.key === "Enter") void load(); }}
        />
        <button
          type="button"
          onClick={() => void load()}
          disabled={busy || !caseId.trim()}
          className="rounded bg-zinc-900 px-3 py-1 text-xs text-white hover:bg-zinc-800 disabled:opacity-50"
        >
          {busy ? "Loading…" : "Replay"}
        </button>
      </div>

      {errorText && <div className="mt-2 text-xs text-red-600">{errorText}</div>}

      {data?.case && (
        <div className="mt-3">
          <div className="rounded border border-zinc-200 bg-zinc-50 p-2 text-xs">
            <div><span className="opacity-60">subject </span><span className="font-medium">{data.case.subject?.name ?? "—"}</span></div>
            <div><span className="opacity-60">outcome </span><span className="font-mono">{data.case.outcome ?? "—"}</span></div>
            <div>
              <span className="opacity-60">score </span>
              <span className="font-mono tabular-nums">{data.case.aggregateScore?.toFixed(3) ?? "—"}</span>
              <span className="opacity-60"> · confidence </span>
              <span className="font-mono tabular-nums">{data.case.aggregateConfidence?.toFixed(3) ?? "—"}</span>
            </div>
          </div>

          {data.case.chain && data.case.chain.length > 0 && (
            <ol className="mt-2 max-h-[460px] space-y-1 overflow-y-auto text-xs">
              {data.case.chain.map((node, i) => (
                <li key={i} className="flex gap-2 rounded border border-zinc-100 bg-white px-2 py-1">
                  <span className="w-6 text-right font-mono tabular-nums text-zinc-400">{node.step}</span>
                  <span className={`rounded px-1 text-[10px] uppercase tracking-wide ${FACULTY_BADGE[node.faculty] ?? "bg-zinc-100"}`}>
                    {node.faculty}
                  </span>
                  <span className="font-mono text-zinc-700">{node.modeId}</span>
                  <span className="flex-1 text-zinc-600">{node.summary}</span>
                </li>
              ))}
            </ol>
          )}

          {data.case.methodology && (
            <details className="mt-2 text-xs">
              <summary className="cursor-pointer text-zinc-500">methodology</summary>
              <pre className="mt-1 whitespace-pre-wrap rounded bg-zinc-50 p-2 text-[11px]">{data.case.methodology}</pre>
            </details>
          )}
        </div>
      )}
    </div>
  );
}

export default ChainReplayPanel;
