"use client";

import { useState } from "react";
import { Header } from "@/components/layout/Header";
import { fetchJson } from "@/lib/api/fetchWithRetry";

interface Arm {
  threshold: number;
  totalHits: number;
  severityDist: Record<string, number>;
  perSubject: Array<{ name: string; topScore: number; severity: string; hitCount: number }>;
  falsePositiveProxy: number;
}

interface ApiResponse {
  ok: boolean;
  subjectCount?: number;
  arms?: Arm[];
  generatedAt?: string;
  error?: string;
}

const DEFAULT_THRESHOLDS = [0.7, 0.78, 0.85, 0.9];

// A/B harness for matching thresholds. Paste a list of names, choose
// the candidate thresholds, run, see how each arm partitions the
// population. The "false-positive proxy" column = hits in this arm
// that drop out at the strictest arm — i.e. the cost of loosening.
//
// Sells itself when the calibration question comes up: instead of
// arguing 0.78 vs 0.85, you show the regulator the same 30 names
// scored at four arms and let the curve speak.
export default function AbTestPage() {
  const [pasted, setPasted] = useState("");
  const [thresholdsRaw, setThresholdsRaw] = useState(DEFAULT_THRESHOLDS.join(", "));
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<ApiResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    const subjects = pasted
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean)
      .map((name) => ({ name }));
    if (subjects.length === 0) {
      setError("Paste at least one name (one per line).");
      return;
    }
    if (subjects.length > 50) {
      setError(`Cap is 50 subjects per run; you supplied ${subjects.length}.`);
      return;
    }
    const thresholds = thresholdsRaw
      .split(/[,\s]+/)
      .map((t) => parseFloat(t))
      .filter((t) => Number.isFinite(t) && t > 0 && t <= 1);
    if (thresholds.length === 0) {
      setError("Pick at least one threshold in (0, 1].");
      return;
    }
    setRunning(true);
    setError(null);
    setResult(null);
    const res = await fetchJson<ApiResponse>("/api/ab-threshold", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ subjects, thresholds }),
      label: "A/B run failed",
      timeoutMs: 90_000,
    });
    setRunning(false);
    if (!res.ok || !res.data?.ok) {
      console.error("[hawkeye] ab-test/ab-threshold failed:", res.error, res.data);
      setError(res.error ?? res.data?.error ?? "run failed");
      return;
    }
    setResult(res.data);
  };

  const arms = result?.arms ?? [];
  const maxHits = arms.reduce((m, a) => Math.max(m, a.totalHits), 1);

  return (
    <>
      <Header />
      <main className="max-w-5xl mx-auto px-10 py-8">
        <div className="mb-6">
          <div className="font-mono text-10 font-semibold text-amber tracking-wide-4 uppercase mb-1">
            MODULE 49
          </div>
          <div className="flex items-center gap-1.5 font-mono text-11 tracking-wide-8 uppercase text-brand mb-2">
            <span className="w-1.5 h-1.5 rounded-full bg-brand shrink-0 shadow-[0_0_6px_var(--brand)] opacity-80" />
            BUREAU II · MATCH-THRESHOLD A/B
          </div>
          <h1 className="font-display font-normal text-32 text-ink-0 leading-tight">
            Calibrate the cutoff <em className="italic text-brand">defensibly.</em>
          </h1>
          <p className="text-13 text-ink-2 mt-1">
            Paste up to 50 subject names; the brain re-scores them at every threshold
            you choose so you can pick a calibration that survives audit.
          </p>
        </div>

        <div className="bg-bg-panel border border-hair-2 rounded-xl p-5 mb-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <label className="block">
              <span className="text-11 font-semibold uppercase tracking-wide-3 text-ink-2 mb-1 block">Subjects (one per line)</span>
              <textarea
                value={pasted}
                onChange={(e) => setPasted(e.target.value)}
                rows={8}
                placeholder={"Maria Lopez\nNorth Star Trading LLC\nCarlos Pena Costa"}
                className="w-full px-2 py-2 text-12 border border-hair-2 rounded bg-bg-1 text-ink-0 font-mono resize-y focus:outline-none focus:border-brand"
              />
            </label>
            <div>
              <label className="block">
                <span className="text-11 font-semibold uppercase tracking-wide-3 text-ink-2 mb-1 block">Thresholds (0-1)</span>
                <input
                  value={thresholdsRaw}
                  onChange={(e) => setThresholdsRaw(e.target.value)}
                  placeholder="0.7, 0.78, 0.85, 0.9"
                  className="w-full px-2 py-1.5 text-12 border border-hair-2 rounded bg-bg-1 text-ink-0 font-mono focus:outline-none focus:border-brand"
                />
                <p className="text-10 text-ink-3 mt-1">Comma- or space-separated. The strictest arm is the rightmost.</p>
              </label>
              <button
                type="button"
                onClick={() => { void submit(); }}
                disabled={running}
                className="mt-4 w-full px-4 py-2 text-13 font-semibold rounded bg-brand text-white disabled:opacity-40 hover:bg-brand-hover"
              >
                {running ? "Running…" : "Run A/B"}
              </button>
              {error && (
                <p className="text-11 text-red mt-2">{error}</p>
              )}
            </div>
          </div>
        </div>

        {arms.length > 0 && (
          <div className="bg-bg-panel border border-hair-2 rounded-xl p-5 mb-6">
            <div className="text-11 font-semibold uppercase tracking-wide-3 text-ink-2 mb-3">
              Arms — {result?.subjectCount} subject{result?.subjectCount === 1 ? "" : "s"}
            </div>
            <table className="w-full text-12">
              <thead className="text-10 text-ink-3 uppercase tracking-wide-2 border-b border-hair-2">
                <tr>
                  <th className="text-left py-1.5">Threshold</th>
                  <th className="text-right py-1.5">Total hits</th>
                  <th className="text-left py-1.5 px-3">Distribution</th>
                  <th className="text-right py-1.5">FP proxy</th>
                </tr>
              </thead>
              <tbody>
                {arms.map((a) => (
                  <tr key={a.threshold} className="border-b border-hair last:border-b-0">
                    <td className="py-2 font-mono text-ink-0">{a.threshold.toFixed(2)}</td>
                    <td className="py-2 text-right font-mono text-ink-0">{a.totalHits}</td>
                    <td className="py-2 px-3">
                      <div className="h-2 rounded-sm overflow-hidden bg-bg-2 flex" title={JSON.stringify(a.severityDist)}>
                        <span style={{ width: `${(a.severityDist["critical"] ?? 0) / Math.max(1, result?.subjectCount ?? 1) * 100}%` }} className="bg-red" />
                        <span style={{ width: `${(a.severityDist["high"] ?? 0) / Math.max(1, result?.subjectCount ?? 1) * 100}%` }} className="bg-orange" />
                        <span style={{ width: `${(a.severityDist["medium"] ?? 0) / Math.max(1, result?.subjectCount ?? 1) * 100}%` }} className="bg-amber" />
                        <span style={{ width: `${(a.severityDist["low"] ?? 0) / Math.max(1, result?.subjectCount ?? 1) * 100}%` }} className="bg-blue" />
                        <span style={{ width: `${(a.severityDist["clear"] ?? 0) / Math.max(1, result?.subjectCount ?? 1) * 100}%` }} className="bg-green" />
                      </div>
                      <div className="flex gap-2 text-10 font-mono text-ink-3 mt-0.5">
                        {Object.entries(a.severityDist).map(([k, v]) => (
                          <span key={k}>{k}: <span className="text-ink-1">{v}</span></span>
                        ))}
                      </div>
                    </td>
                    <td className="py-2 text-right font-mono">
                      <span className={a.falsePositiveProxy > 0 ? "text-amber" : "text-green"}>
                        {a.falsePositiveProxy}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="text-10 text-ink-3 mt-3">
              FP proxy = subjects with hits in this arm that <em>don't</em> hit at the strictest arm —
              the implicit cost of loosening the threshold.
            </p>
            <p className="text-10 text-ink-3 font-mono mt-1">
              Bar widths normalised by subject count ({result?.subjectCount}). Max hit total observed: {maxHits}.
            </p>
          </div>
        )}

        {arms.length > 0 && (
          <div className="bg-bg-panel border border-hair-2 rounded-xl p-5">
            <div className="text-11 font-semibold uppercase tracking-wide-3 text-ink-2 mb-3">
              Per-subject (strictest arm)
            </div>
            <table className="w-full text-12">
              <thead className="text-10 text-ink-3 uppercase tracking-wide-2 border-b border-hair-2">
                <tr>
                  <th className="text-left py-1.5">Subject</th>
                  <th className="text-right py-1.5">Score</th>
                  <th className="text-left py-1.5 px-3">Severity</th>
                  <th className="text-right py-1.5">Hits</th>
                </tr>
              </thead>
              <tbody>
                {(arms[arms.length - 1]?.perSubject ?? []).map((p, i) => (
                  <tr key={i} className="border-b border-hair last:border-b-0">
                    <td className="py-1.5 text-ink-0">{p.name}</td>
                    <td className="py-1.5 text-right font-mono text-ink-0">{p.topScore}</td>
                    <td className="py-1.5 px-3 font-mono text-ink-2">{p.severity}</td>
                    <td className="py-1.5 text-right font-mono text-ink-2">{p.hitCount}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </main>
    </>
  );
}
