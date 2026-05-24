"use client";

import { useState, useRef } from "react";

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
        setError((data as { ok: false; error: string }).error ?? `HTTP ${resp.status}`);
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
    <section className="border border-border rounded-lg p-6 bg-background flex flex-col gap-4">
      <div>
        <h2 className="text-sm font-mono uppercase tracking-widest text-foreground/50 mb-1">
          Article 17
        </h2>
        <h3 className="text-lg font-semibold text-foreground">Data Erasure</h3>
        <p className="text-sm text-foreground/60 mt-1">
          Pseudonymises a subject&apos;s PII. Requires all linked cases to be closed.
          The compliance skeleton is retained for AML obligations (Art.&nbsp;17(3)(b)).
        </p>
      </div>

      <form onSubmit={(e) => { void handleSubmit(e); }} className="flex flex-col gap-3">
        <div>
          <label className="block text-xs font-mono uppercase tracking-widest text-foreground/50 mb-1">
            Subject ID
          </label>
          <input
            type="text"
            value={subjectId}
            onChange={(e) => setSubjectId(e.target.value)}
            placeholder="e.g. sub_01J..."
            required
            className="w-full bg-background border border-border rounded px-3 py-2 text-sm text-foreground placeholder:text-foreground/30 focus:outline-none focus:border-foreground/40"
          />
        </div>
        <div>
          <label className="block text-xs font-mono uppercase tracking-widest text-foreground/50 mb-1">
            Reason
          </label>
          <textarea
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="Legal basis for erasure request…"
            rows={3}
            required
            className="w-full bg-background border border-border rounded px-3 py-2 text-sm text-foreground placeholder:text-foreground/30 focus:outline-none focus:border-foreground/40 resize-none"
          />
        </div>
        <button
          type="submit"
          disabled={loading || !subjectId.trim() || !reason.trim()}
          className="self-start px-5 py-2 rounded bg-foreground text-background text-sm font-semibold disabled:opacity-40 hover:opacity-90 transition-opacity"
        >
          {loading ? "Processing…" : "Execute Erasure"}
        </button>
      </form>

      {error && (
        <div className="text-sm px-3 py-2 rounded border border-red-500/30 bg-red-500/10 text-red-400">
          {error}
        </div>
      )}

      {result && (
        <div className="text-sm px-4 py-3 rounded border border-green-500/30 bg-green-500/10 text-green-400 flex flex-col gap-1 font-mono">
          <span className="font-semibold text-green-400">Erasure complete</span>
          <span className="text-foreground/60">
            Pseudonymised name:{" "}
            <span className="text-foreground">{result.pseudonymizedName}</span>
          </span>
          <span className="text-foreground/60">
            Subject ID:{" "}
            <span className="text-foreground">{result.subjectId}</span>
          </span>
          <span className="text-foreground/60">
            At: <span className="text-foreground">{new Date(result.at).toLocaleString()}</span>
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
          setError(data.error ?? `HTTP ${resp.status}`);
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
    <section className="border border-border rounded-lg p-6 bg-background flex flex-col gap-4">
      <div>
        <h2 className="text-sm font-mono uppercase tracking-widest text-foreground/50 mb-1">
          Article 20
        </h2>
        <h3 className="text-lg font-semibold text-foreground">Data Export</h3>
        <p className="text-sm text-foreground/60 mt-1">
          Download a structured JSON portability package containing the subject
          record, all associated cases, and screening history.
        </p>
      </div>

      <form onSubmit={(e) => { void handleExport(e); }} className="flex flex-col gap-3">
        <div>
          <label className="block text-xs font-mono uppercase tracking-widest text-foreground/50 mb-1">
            Subject ID
          </label>
          <input
            type="text"
            value={subjectId}
            onChange={(e) => setSubjectId(e.target.value)}
            placeholder="e.g. sub_01J..."
            required
            className="w-full bg-background border border-border rounded px-3 py-2 text-sm text-foreground placeholder:text-foreground/30 focus:outline-none focus:border-foreground/40"
          />
        </div>
        <button
          type="submit"
          disabled={loading || !subjectId.trim()}
          className="self-start px-5 py-2 rounded bg-foreground text-background text-sm font-semibold disabled:opacity-40 hover:opacity-90 transition-opacity"
        >
          {loading ? "Generating…" : "Download Export"}
        </button>
      </form>

      {error && (
        <div className="text-sm px-3 py-2 rounded border border-red-500/30 bg-red-500/10 text-red-400">
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
        setError((data as { ok: false; error: string }).error ?? `HTTP ${resp.status}`);
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
    <section className="border border-border rounded-lg p-6 bg-background flex flex-col gap-4">
      <div>
        <h2 className="text-sm font-mono uppercase tracking-widest text-foreground/50 mb-1">
          Article 5(1)(e)
        </h2>
        <h3 className="text-lg font-semibold text-foreground">Retention Policy</h3>
        <p className="text-sm text-foreground/60 mt-1">
          Marks cleared subjects older than the configured retention period as
          pending deletion. A grace-period review is recommended before hard
          deletion. AML retention obligations (FDL 10/2025 Art.20) take precedence.
        </p>
      </div>

      <div className="flex flex-col gap-3">
        <div>
          <label className="block text-xs font-mono uppercase tracking-widest text-foreground/50 mb-1">
            Retention period (years)
          </label>
          <input
            type="number"
            min={1}
            max={20}
            value={retentionYears}
            onChange={(e) => setRetentionYears(Number(e.target.value))}
            className="w-32 bg-background border border-border rounded px-3 py-2 text-sm text-foreground focus:outline-none focus:border-foreground/40"
          />
          <p className="text-xs text-foreground/40 mt-1">
            Default: 7 years (FATF Recommendation 11 minimum)
          </p>
        </div>

        <button
          type="button"
          onClick={() => { void handleSweep(); }}
          disabled={loading}
          className="self-start px-5 py-2 rounded bg-foreground text-background text-sm font-semibold disabled:opacity-40 hover:opacity-90 transition-opacity"
        >
          {loading ? "Running sweep…" : "Run Retention Sweep"}
        </button>
      </div>

      {error && (
        <div className="text-sm px-3 py-2 rounded border border-red-500/30 bg-red-500/10 text-red-400">
          {error}
        </div>
      )}

      {result && (
        <div className="text-sm px-4 py-3 rounded border border-border bg-background/50 flex flex-col gap-1 font-mono">
          <span className="font-semibold text-foreground">Sweep complete</span>
          <span className="text-foreground/60">
            Subjects marked for deletion:{" "}
            <span className="text-foreground font-semibold">{result.sweptCount}</span>
          </span>
          <span className="text-foreground/60">
            Retention period:{" "}
            <span className="text-foreground">{result.retentionYears} years</span>
          </span>
          <span className="text-foreground/60">
            Completed at:{" "}
            <span className="text-foreground">{new Date(result.at).toLocaleString()}</span>
          </span>
        </div>
      )}
    </section>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function GdprPage() {
  return (
    <div className="min-h-screen bg-background text-foreground">
      <div className="max-w-4xl mx-auto px-6 py-12">
        {/* Header */}
        <div className="mb-10">
          <p className="text-xs font-mono uppercase tracking-widest text-foreground/40 mb-2">
            Data Protection
          </p>
          <h1 className="text-3xl font-bold text-foreground mb-3">
            GDPR Data Subject Rights
          </h1>
          <p className="text-sm text-foreground/60 max-w-2xl">
            Manage data subject rights under the General Data Protection Regulation.
            All operations are logged in the immutable audit chain. Erasure requests
            that conflict with AML record-retention obligations are blocked per
            Art.&nbsp;17(3)(b) and UAE FDL&nbsp;10/2025&nbsp;Art.&nbsp;20.
          </p>
        </div>

        {/* Three panels */}
        <div className="flex flex-col gap-6">
          <ErasurePanel />
          <ExportPanel />
          <RetentionPanel />
        </div>
      </div>
    </div>
  );
}
