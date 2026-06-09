"use client";

import { useState, useRef } from "react";
import { ModuleHero, ModuleLayout } from "@/components/layout/ModuleLayout";
import { apiErrorMessage } from "@/lib/client/error-utils";

// ─── Types ────────────────────────────────────────────────────────────────────

interface ErasureResult {
  erased: boolean;
  subjectId: string;
  pseudonymizedName: string;
  at: string;
}

interface SweepResult {
  sweptCount: number;
  retentionYears: number;
  at: string;
}

const inputCls = "w-full bg-bg-panel border border-hair-2 rounded px-3 py-2 text-sm text-ink-0 placeholder:text-ink-2 focus:outline-none focus:border-brand/40";

// ─── Panel: Data Erasure ─────────────────────────────────────────────────────

function ErasurePanel() {
  const [subjectId, setSubjectId] = useState("");
  const [reason, setReason] = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<ErasureResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const mountedRef = useRef(true);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setResult(null);
    setLoading(true);
    try {
      const resp = await fetch("/api/gdpr/erasure", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          subjectId: subjectId.trim(),
          requestedBy: "mlro",
          reason: reason.trim(),
        }),
      });
      const data = (await resp.json()) as
        | (ErasureResult & { ok: true })
        | { ok: false; error: string };
      if (!mountedRef.current) return;
      if (!resp.ok || !data.ok) {
        setError((data as { ok: false; error: string }).error ?? apiErrorMessage(resp.status, "GDPR erasure"));
      } else {
        setResult(data as ErasureResult & { ok: true });
      }
    } catch {
      if (mountedRef.current) setError("Network error — please try again.");
    } finally {
      if (mountedRef.current) setLoading(false);
    }
  };

  return (
    <section className="border border-hair-2 rounded-lg p-6 bg-bg-panel flex flex-col gap-4">
      <div>
        <h2 className="text-xs font-mono uppercase tracking-widest text-ink-2 mb-1">
          Article 17
        </h2>
        <h3 className="text-lg font-semibold text-ink-0">Data Erasure</h3>
        <p className="text-sm text-ink-2 mt-1">
          Pseudonymises a subject&apos;s PII. Requires all linked cases to be closed.
          The compliance skeleton is retained for AML obligations (Art.&nbsp;17(3)(b)).
        </p>
      </div>

      <form onSubmit={(e) => { void handleSubmit(e); }} className="flex flex-col gap-3">
        <div>
          <label className="block text-xs font-mono uppercase tracking-widest text-ink-2 mb-1">
            Subject ID
          </label>
          <input
            type="text"
            value={subjectId}
            onChange={(e) => setSubjectId(e.target.value)}
            placeholder="e.g. sub_01J..."
            required
            className={inputCls}
          />
        </div>
        <div>
          <label className="block text-xs font-mono uppercase tracking-widest text-ink-2 mb-1">
            Reason
          </label>
          <textarea
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="Legal basis for erasure request…"
            rows={3}
            required
            className={`${inputCls} resize-none`}
          />
        </div>
        <button
          type="submit"
          disabled={loading || !subjectId.trim() || !reason.trim()}
          className="self-start px-5 py-2 rounded bg-brand text-white text-sm font-semibold disabled:opacity-40 hover:opacity-90 transition-opacity"
        >
          {loading ? "Processing…" : "Execute Erasure"}
        </button>
      </form>

      {error && (
        <div className="text-sm px-3 py-2 rounded border border-red-500/40 bg-red-950/30 text-red-300">
          {error}
        </div>
      )}

      {result && (
        <div className="text-sm px-4 py-3 rounded border border-emerald-500/40 bg-emerald-950/30 text-emerald-300 flex flex-col gap-1 font-mono">
          <span className="font-semibold">Erasure complete</span>
          <span className="text-ink-2">
            Pseudonymised name:{" "}
            <span className="text-ink-0">{result.pseudonymizedName}</span>
          </span>
          <span className="text-ink-2">
            Subject ID:{" "}
            <span className="text-ink-0">{result.subjectId}</span>
          </span>
          <span className="text-ink-2">
            At: <span className="text-ink-0">{new Date(result.at).toLocaleString()}</span>
          </span>
        </div>
      )}
    </section>
  );
}

// ─── Panel: Data Export ───────────────────────────────────────────────────────

function ExportPanel() {
  const [subjectId, setSubjectId] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const mountedRef = useRef(true);

  const handleExport = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const resp = await fetch(
        `/api/gdpr/export?subjectId=${encodeURIComponent(subjectId.trim())}`,
      );
      if (!resp.ok) {
        const data = (await resp.json().catch(() => ({}))) as { error?: string };
        if (mountedRef.current) {
          setError(data.error ?? apiErrorMessage(resp.status, "GDPR export"));
        }
        return;
      }
      // Trigger browser download.
      const blob = await resp.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `gdpr-export-${subjectId.trim()}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch {
      if (mountedRef.current) setError("Network error — please try again.");
    } finally {
      if (mountedRef.current) setLoading(false);
    }
  };

  return (
    <section className="border border-hair-2 rounded-lg p-6 bg-bg-panel flex flex-col gap-4">
      <div>
        <h2 className="text-xs font-mono uppercase tracking-widest text-ink-2 mb-1">
          Article 20
        </h2>
        <h3 className="text-lg font-semibold text-ink-0">Data Export</h3>
        <p className="text-sm text-ink-2 mt-1">
          Download a structured JSON portability package containing the subject
          record, all associated cases, and screening history.
        </p>
      </div>

      <form onSubmit={(e) => { void handleExport(e); }} className="flex flex-col gap-3">
        <div>
          <label className="block text-xs font-mono uppercase tracking-widest text-ink-2 mb-1">
            Subject ID
          </label>
          <input
            type="text"
            value={subjectId}
            onChange={(e) => setSubjectId(e.target.value)}
            placeholder="e.g. sub_01J..."
            required
            className={inputCls}
          />
        </div>
        <button
          type="submit"
          disabled={loading || !subjectId.trim()}
          className="self-start px-5 py-2 rounded bg-brand text-white text-sm font-semibold disabled:opacity-40 hover:opacity-90 transition-opacity"
        >
          {loading ? "Generating…" : "Download Export"}
        </button>
      </form>

      {error && (
        <div className="text-sm px-3 py-2 rounded border border-red-500/40 bg-red-950/30 text-red-300">
          {error}
        </div>
      )}
    </section>
  );
}

// ─── Panel: Retention Policy ──────────────────────────────────────────────────

function RetentionPanel() {
  const [retentionYears, setRetentionYears] = useState(7);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<SweepResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const mountedRef = useRef(true);

  const handleSweep = async () => {
    setError(null);
    setLoading(true);
    try {
      const resp = await fetch("/api/gdpr/retention-sweep", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ retentionYears }),
      });
      const data = (await resp.json()) as
        | (SweepResult & { ok: true })
        | { ok: false; error: string };
      if (!mountedRef.current) return;
      if (!resp.ok || !data.ok) {
        setError((data as { ok: false; error: string }).error ?? apiErrorMessage(resp.status, "GDPR retention sweep"));
      } else {
        setResult(data as SweepResult & { ok: true });
      }
    } catch {
      if (mountedRef.current) setError("Network error — please try again.");
    } finally {
      if (mountedRef.current) setLoading(false);
    }
  };

  return (
    <section className="border border-hair-2 rounded-lg p-6 bg-bg-panel flex flex-col gap-4">
      <div>
        <h2 className="text-xs font-mono uppercase tracking-widest text-ink-2 mb-1">
          Article 5(1)(e)
        </h2>
        <h3 className="text-lg font-semibold text-ink-0">Retention Policy</h3>
        <p className="text-sm text-ink-2 mt-1">
          Marks cleared subjects older than the configured retention period as
          pending deletion. A grace-period review is recommended before hard
          deletion. AML retention obligations (Federal Decree-Law No. 10 of 2025 Art.20) take precedence.
        </p>
      </div>

      <div className="flex flex-col gap-3">
        <div>
          <label className="block text-xs font-mono uppercase tracking-widest text-ink-2 mb-1">
            Retention period (years)
          </label>
          <input
            type="number"
            min={1}
            max={20}
            value={retentionYears}
            onChange={(e) => setRetentionYears(Number(e.target.value))}
            className="w-32 bg-bg-panel border border-hair-2 rounded px-3 py-2 text-sm text-ink-0 focus:outline-none focus:border-brand/40"
          />
          <p className="text-xs text-ink-2 mt-1">
            Default: 7 years (FATF Recommendation 11 minimum)
          </p>
        </div>

        <button
          type="button"
          onClick={() => { void handleSweep(); }}
          disabled={loading}
          className="self-start px-5 py-2 rounded bg-brand text-white text-sm font-semibold disabled:opacity-40 hover:opacity-90 transition-opacity"
        >
          {loading ? "Running sweep…" : "Run Retention Sweep"}
        </button>
      </div>

      {error && (
        <div className="text-sm px-3 py-2 rounded border border-red-500/40 bg-red-950/30 text-red-300">
          {error}
        </div>
      )}

      {result && (
        <div className="text-sm px-4 py-3 rounded border border-hair-2 bg-bg-base flex flex-col gap-1 font-mono">
          <span className="font-semibold text-ink-0">Sweep complete</span>
          <span className="text-ink-2">
            Subjects marked for deletion:{" "}
            <span className="text-ink-0 font-semibold">{result.sweptCount}</span>
          </span>
          <span className="text-ink-2">
            Retention period:{" "}
            <span className="text-ink-0">{result.retentionYears} years</span>
          </span>
          <span className="text-ink-2">
            Completed at:{" "}
            <span className="text-ink-0">{new Date(result.at).toLocaleString()}</span>
          </span>
        </div>
      )}
    </section>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function GdprPage() {
  return (
    <ModuleLayout asanaModule="gdpr" asanaLabel="GDPR / PDPL">
      <ModuleHero
        eyebrow=""
        title="GDPR Data Subject"
        titleEm="rights."
        intro="Manage data subject erasure, export, and retention. All operations are logged in the tamper-evident audit chain."
      />
      <div className="px-6 pb-10 max-w-3xl">
        <div className="flex flex-col gap-6">
          <ErasurePanel />
          <ExportPanel />
          <RetentionPanel />
        </div>
      </div>
    </ModuleLayout>
  );
}
