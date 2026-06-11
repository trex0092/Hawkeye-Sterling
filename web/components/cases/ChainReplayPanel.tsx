"use client";

// Hawkeye Sterling — ChainReplayPanel (audit follow-up #31).
//
// Paste-a-runId reasoning-chain replay UI. Loads the persisted verdict
// + chain via /api/cases/<id> (existing endpoint), renders every
// ReasoningChainNode in order so an MLRO or auditor can see EXACTLY
// what the brain did at disposition day. Federal Decree-Law No. 10 of 2025 Art.24 + Art.20
// (tamper-evident retention) + Charter P9 (explicit calibration trail).

import { useState, useRef, useEffect } from "react";
import { caughtErrorMessage } from "@/lib/client/error-utils";

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
  reasoning: "bg-sky-950/30 text-sky-300 border border-sky-500/40",
  data_analysis: "bg-purple-950/30 text-purple-300 border border-purple-500/40",
  deep_thinking: "bg-indigo-950/30 text-indigo-300 border border-indigo-500/40",
  intelligence: "bg-emerald-950/30 text-emerald-300 border border-emerald-500/40",
  smartness: "bg-amber-950/30 text-amber-300 border border-amber-500/40",
  strong_brain: "bg-rose-950/30 text-rose-300 border border-rose-500/40",
  inference: "bg-cyan-950/30 text-cyan-300 border border-cyan-500/40",
  argumentation: "bg-orange-950/30 text-orange-300 border border-orange-500/40",
  introspection: "bg-zinc-800/40 text-zinc-300 border border-zinc-600/40",
  ratiocination: "bg-violet-950/30 text-violet-300 border border-violet-500/40",
  synthesis: "bg-pink-950/30 text-pink-300 border border-pink-500/40",
  anticipation: "bg-teal-950/30 text-teal-300 border border-teal-500/40",
  forensic_accounting: "bg-yellow-950/30 text-yellow-300 border border-yellow-500/40",
  geopolitical_awareness: "bg-lime-950/30 text-lime-300 border border-lime-500/40",
};

export function ChainReplayPanel(): JSX.Element {
  const [caseId, setCaseId] = useState("");
  const [busy, setBusy] = useState(false);
  const [data, setData] = useState<VerdictResponse | null>(null);
  const [errorText, setErrorText] = useState<string | null>(null);
  const mountedRef = useRef(true);
  useEffect(() => () => { mountedRef.current = false; }, []);

  async function load(): Promise<void> {
    if (!caseId.trim()) return;
    setBusy(true);
    setErrorText(null);
    setData(null);
    try {
      const res = await fetch(`/api/cases/${encodeURIComponent(caseId.trim())}`);
      const json = await res.json().catch(() => ({})) as VerdictResponse;
      if (!mountedRef.current) return;
      if (!res.ok || !json.ok) {
        setErrorText(json.error ?? `HTTP ${res.status}`);
        return;
      }
      setData(json);
    } catch (err) {
      if (mountedRef.current) setErrorText(caughtErrorMessage(err));
    } finally {
      if (mountedRef.current) setBusy(false);
    }
  }

  return (
    <div className="rounded-md border border-hair-2 bg-bg-panel p-3">
      <div className="text-xs uppercase tracking-wide text-ink-3">Reasoning-chain replay</div>
      <div className="mt-2 flex gap-2">
        <input
          type="text"
          value={caseId}
          onChange={(e) => setCaseId(e.target.value)}
          placeholder="Case ID or runId"
          className="flex-1 rounded border border-hair-2 px-2 py-1 text-xs"
          onKeyDown={(e) => { if (e.key === "Enter") void load(); }}
        />
        <button
          type="button"
          onClick={() => void load()}
          disabled={busy || !caseId.trim()}
          className="rounded bg-bg-2 px-2.5 py-1 text-xs text-white hover:bg-bg-3 disabled:opacity-50"
        >
          {busy ? "Loading…" : "Replay"}
        </button>
      </div>

      {errorText && <div className="mt-2 text-xs text-red-400">{errorText}</div>}

      {data?.case && (
        <div className="mt-3">
          <div className="rounded border border-hair-2 bg-bg-base p-2 text-xs">
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
                <li key={i} className="flex gap-2 rounded border border-hair-2 bg-bg-base px-2 py-1">
                  <span className="w-6 text-right font-mono tabular-nums text-ink-3">{node.step}</span>
                  <span className={`rounded px-1 text-[10px] uppercase tracking-wide ${FACULTY_BADGE[node.faculty] ?? "bg-bg-1"}`}>
                    {node.faculty}
                  </span>
                  <span className="font-mono text-ink-1">{node.modeId}</span>
                  <span className="flex-1 text-ink-2">{node.summary}</span>
                </li>
              ))}
            </ol>
          )}

          {data.case.methodology && (
            <details className="mt-2 text-xs">
              <summary className="cursor-pointer text-ink-3">methodology</summary>
              <pre className="mt-1 whitespace-pre-wrap rounded bg-bg-base p-2 text-[11px]">{data.case.methodology}</pre>
            </details>
          )}
        </div>
      )}
    </div>
  );
}

export default ChainReplayPanel;
