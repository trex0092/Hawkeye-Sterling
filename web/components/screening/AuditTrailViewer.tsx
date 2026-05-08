"use client";

// AuditTrailViewer — MLRO-facing inspection panel for the HMAC-sealed
// audit chain. Required by HS-OPS-003 Day 2 ("Show us your audit trail
// for the last 30 days") and HS-MC-001 §10 (audit trail viewer).
//
// Reads /api/audit/view (filterable, paginated) and /api/audit/verify
// (HMAC + chain-link integrity). All entries render their previousHash
// + signature so a regulator can spot-check tamper-evidence directly.
//
// Accessibility:
//   · semantic <article> per entry, <header> per group
//   · all controls keyboard reachable; visible focus rings via :focus-visible
//   · aria-live on the loading/verify status banner
//   · aria-sort on sortable columns
//   · role="status" on async result banner; role="alert" on errors
//
// Charter alignment: P9 (every audit row carries previousHash + signature
// in the rendered output — no opaque view).

import { useCallback, useEffect, useMemo, useState } from "react";

interface AuditEntry {
  sequence: number;
  id: string;
  at: string;
  actor: { role: string; name?: string };
  action: string;
  target: string;
  body: Record<string, unknown>;
  previousHash: string;
  signature: string;
}

interface AuditHead {
  sequence: number;
  hash: string;
}

interface ViewResponse {
  ok: boolean;
  total: number;
  returned: number;
  offset: number;
  limit: number;
  scanned: number;
  head: AuditHead;
  entries: AuditEntry[];
  filter: Record<string, string | null>;
}

interface VerifyFault {
  sequence: number;
  expected: string;
  got: string;
}

interface VerifyResponse {
  ok: boolean;
  totalScanned: number;
  totalVerified: number;
  brokenLinks: VerifyFault[];
  invalidIds: VerifyFault[];
  invalidSignatures: VerifyFault[];
  sequenceGaps: Array<{ expected: number; got: number }>;
  headConsistent: boolean;
  head: AuditHead;
  error?: string;
}

interface Props {
  defaultScreeningId?: string;
  pageSize?: number;
  className?: string;
}

const PAGE_SIZE_DEFAULT = 50;
const SHORT_HASH = (h: string): string => (h ? `${h.slice(0, 10)}…${h.slice(-6)}` : "");

function formatDate(iso: string): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return `${d.toISOString().slice(0, 19).replace("T", " ")} UTC`;
}

function buildViewUrl(params: {
  screeningId: string;
  action: string;
  actor: string;
  limit: number;
  offset: number;
}): string {
  const q = new URLSearchParams();
  if (params.screeningId.trim()) q.set("screening_id", params.screeningId.trim());
  if (params.action.trim()) q.set("action", params.action.trim());
  if (params.actor.trim()) q.set("actor", params.actor.trim());
  q.set("limit", String(params.limit));
  q.set("offset", String(params.offset));
  return `/api/audit/view?${q.toString()}`;
}

export function AuditTrailViewer({
  defaultScreeningId = "",
  pageSize = PAGE_SIZE_DEFAULT,
  className,
}: Props): JSX.Element {
  const [screeningId, setScreeningId] = useState(defaultScreeningId);
  const [action, setAction] = useState("");
  const [actor, setActor] = useState("");
  const [offset, setOffset] = useState(0);
  const [data, setData] = useState<ViewResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [verifyResult, setVerifyResult] = useState<VerifyResponse | null>(null);
  const [verifying, setVerifying] = useState(false);
  const [expanded, setExpanded] = useState<Set<number>>(new Set());

  const load = useCallback(
    async (nextOffset: number) => {
      setLoading(true);
      setError(null);
      try {
        const url = buildViewUrl({
          screeningId,
          action,
          actor,
          limit: pageSize,
          offset: nextOffset,
        });
        const res = await fetch(url, { headers: { accept: "application/json" } });
        if (!res.ok) {
          throw new Error(`Audit view failed: HTTP ${res.status}`);
        }
        const json = (await res.json()) as ViewResponse;
        setData(json);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Failed to load audit trail.");
      } finally {
        setLoading(false);
      }
    },
    [screeningId, action, actor, pageSize],
  );

  useEffect(() => {
    void load(0);
    setOffset(0);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const submit = (e: React.FormEvent<HTMLFormElement>): void => {
    e.preventDefault();
    setOffset(0);
    void load(0);
  };

  const verify = useCallback(async () => {
    setVerifying(true);
    setVerifyResult(null);
    try {
      const q = new URLSearchParams();
      if (screeningId.trim()) q.set("screening_id", screeningId.trim());
      const res = await fetch(`/api/audit/verify?${q.toString()}`, {
        headers: { accept: "application/json" },
      });
      const json = (await res.json()) as VerifyResponse;
      setVerifyResult(json);
    } catch (e) {
      setVerifyResult({
        ok: false,
        totalScanned: 0,
        totalVerified: 0,
        brokenLinks: [],
        invalidIds: [],
        invalidSignatures: [],
        sequenceGaps: [],
        headConsistent: false,
        head: { sequence: 0, hash: "" },
        error: e instanceof Error ? e.message : "Verification request failed.",
      });
    } finally {
      setVerifying(false);
    }
  }, [screeningId]);

  const exportJson = useCallback(() => {
    if (!data) return;
    const blob = new Blob([JSON.stringify(data, null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `audit-trail-${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }, [data]);

  const exportCsv = useCallback((): void => {
    const q = new URLSearchParams();
    if (screeningId.trim()) q.set("screening_id", screeningId.trim());
    if (action.trim()) q.set("action", action.trim());
    if (actor.trim()) q.set("actor", actor.trim());
    q.set("limit", String(pageSize));
    q.set("offset", String(offset));
    q.set("format", "csv");
    window.open(`/api/audit/view?${q.toString()}`, "_blank", "noopener");
  }, [screeningId, action, actor, pageSize, offset]);

  const toggleExpanded = (seq: number): void => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(seq)) next.delete(seq);
      else next.add(seq);
      return next;
    });
  };

  const verifyBanner = useMemo(() => {
    if (!verifyResult) return null;
    if (verifyResult.error) {
      return (
        <div role="alert" className="bg-rose-50 border border-rose-200 text-rose-900 text-12 px-3 py-2 rounded-md">
          Verification failed: {verifyResult.error}
        </div>
      );
    }
    if (verifyResult.ok) {
      return (
        <div role="status" className="bg-emerald-50 border border-emerald-200 text-emerald-900 text-12 px-3 py-2 rounded-md">
          Chain verified · {verifyResult.totalVerified}/{verifyResult.totalScanned} entries pass HMAC + link checks · head sequence {verifyResult.head.sequence}.
        </div>
      );
    }
    const issues = [
      verifyResult.brokenLinks.length && `${verifyResult.brokenLinks.length} broken link(s)`,
      verifyResult.invalidIds.length && `${verifyResult.invalidIds.length} invalid id(s)`,
      verifyResult.invalidSignatures.length && `${verifyResult.invalidSignatures.length} bad signature(s)`,
      verifyResult.sequenceGaps.length && `${verifyResult.sequenceGaps.length} sequence gap(s)`,
      !verifyResult.headConsistent && "head pointer inconsistent",
    ].filter(Boolean);
    return (
      <div role="alert" className="bg-rose-50 border border-rose-200 text-rose-900 text-12 px-3 py-2 rounded-md">
        Chain integrity FAILED · {issues.join(" · ")}. Escalate to Engineering Lead per HS-OPS-001 §3.4 (CRITICAL).
      </div>
    );
  }, [verifyResult]);

  const totalPages = data ? Math.ceil(data.total / data.limit) : 0;
  const currentPage = data ? Math.floor(data.offset / data.limit) + 1 : 0;

  const containerClass = ["bg-bg-panel border border-hair-2 rounded-xl p-4", className]
    .filter(Boolean)
    .join(" ");

  return (
    <section
      aria-labelledby="audit-trail-viewer-title"
      className={containerClass}
    >
      <header className="flex items-center justify-between gap-3 mb-3">
        <div>
          <h2 id="audit-trail-viewer-title" className="font-display text-20 leading-none tracking-tightest text-ink-0 m-0">
            Audit trail viewer
          </h2>
          <p className="font-mono text-10 uppercase tracking-wide-3 text-ink-2 mt-1">
            HMAC-sealed chain · FDL 10/2025 Art.24 · 10-year retention
          </p>
        </div>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => void verify()}
            disabled={verifying}
            className="text-11 font-mono uppercase tracking-wide-3 px-3 py-1.5 border border-brand bg-brand-dim text-brand-deep hover:bg-brand hover:text-white rounded font-semibold transition-colors disabled:opacity-50 disabled:cursor-not-allowed focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-1"
          >
            {verifying ? "Verifying…" : "Verify signatures"}
          </button>
          <button
            type="button"
            onClick={exportJson}
            disabled={!data || data.entries.length === 0}
            className="text-11 font-mono uppercase tracking-wide-3 px-3 py-1.5 border border-hair-2 text-ink-1 hover:border-brand hover:text-brand rounded font-semibold transition-colors disabled:opacity-50 disabled:cursor-not-allowed focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-1"
          >
            Export JSON
          </button>
          <button
            type="button"
            onClick={exportCsv}
            className="text-11 font-mono uppercase tracking-wide-3 px-3 py-1.5 border border-hair-2 text-ink-1 hover:border-brand hover:text-brand rounded font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-1"
          >
            Export CSV
          </button>
        </div>
      </header>

      {verifyBanner ? <div className="mb-3">{verifyBanner}</div> : null}

      <form onSubmit={submit} className="grid grid-cols-1 md:grid-cols-4 gap-2 mb-3" aria-label="Audit trail filters">
        <label className="flex flex-col gap-1">
          <span className="font-mono text-9 uppercase tracking-wide-4 text-ink-2">Screening / target ID</span>
          <input
            type="search"
            value={screeningId}
            onChange={(e) => setScreeningId(e.target.value)}
            placeholder="e.g. case-12345"
            className="px-2 py-1.5 text-12 bg-bg-1 border border-hair-2 rounded text-ink-0 focus-visible:outline-none focus-visible:border-brand focus-visible:ring-2 focus-visible:ring-brand/40"
          />
        </label>
        <label className="flex flex-col gap-1">
          <span className="font-mono text-9 uppercase tracking-wide-4 text-ink-2">Action</span>
          <select
            value={action}
            onChange={(e) => setAction(e.target.value)}
            className="px-2 py-1.5 text-12 bg-bg-1 border border-hair-2 rounded text-ink-0 focus-visible:outline-none focus-visible:border-brand focus-visible:ring-2 focus-visible:ring-brand/40"
          >
            <option value="">Any action</option>
            <option value="clear">clear</option>
            <option value="escalate">escalate</option>
            <option value="str_read">str_read</option>
            <option value="str">str</option>
            <option value="freeze">freeze</option>
            <option value="dispose">dispose</option>
            <option value="goaml_submit">goaml_submit</option>
            <option value="subject_added">subject_added</option>
            <option value="subject_removed">subject_removed</option>
            <option value="screening_completed">screening_completed</option>
            <option value="ongoing_enrolled">ongoing_enrolled</option>
          </select>
        </label>
        <label className="flex flex-col gap-1">
          <span className="font-mono text-9 uppercase tracking-wide-4 text-ink-2">Actor role</span>
          <select
            value={actor}
            onChange={(e) => setActor(e.target.value)}
            className="px-2 py-1.5 text-12 bg-bg-1 border border-hair-2 rounded text-ink-0 focus-visible:outline-none focus-visible:border-brand focus-visible:ring-2 focus-visible:ring-brand/40"
          >
            <option value="">Any role</option>
            <option value="analyst">analyst</option>
            <option value="compliance_assistant">compliance_assistant</option>
            <option value="co">co</option>
            <option value="mlro">mlro</option>
            <option value="managing_director">managing_director</option>
          </select>
        </label>
        <div className="flex items-end">
          <button
            type="submit"
            disabled={loading}
            className="w-full text-11 font-mono uppercase tracking-wide-3 px-3 py-1.5 bg-brand text-white rounded font-semibold hover:bg-brand-hover transition-colors disabled:opacity-50 disabled:cursor-not-allowed focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-1"
          >
            {loading ? "Loading…" : "Apply filters"}
          </button>
        </div>
      </form>

      <div aria-live="polite" className="sr-only">
        {loading ? "Loading audit entries" : data ? `Loaded ${data.returned} of ${data.total} entries` : ""}
      </div>

      {error ? (
        <div role="alert" className="bg-rose-50 border border-rose-200 text-rose-900 text-12 px-3 py-2 rounded-md mb-3">
          {error}
        </div>
      ) : null}

      {!data && loading ? <SkeletonRows /> : null}

      {data && data.entries.length === 0 ? (
        <div className="text-center py-8 text-ink-2 text-12 border border-dashed border-hair-2 rounded-md">
          No audit entries match these filters. Try widening the time range or clearing the screening ID.
        </div>
      ) : null}

      {data && data.entries.length > 0 ? (
        <div className="space-y-1.5">
          {data.entries.map((entry) => {
            const isOpen = expanded.has(entry.sequence);
            return (
              <article
                key={entry.sequence}
                aria-labelledby={`audit-entry-${entry.sequence}`}
                className="border border-hair-2 rounded-md overflow-hidden bg-bg-1"
              >
                <button
                  type="button"
                  onClick={() => toggleExpanded(entry.sequence)}
                  aria-expanded={isOpen}
                  aria-controls={`audit-entry-body-${entry.sequence}`}
                  className="w-full flex items-center gap-3 px-3 py-2 text-left hover:bg-bg-2 transition-colors focus-visible:outline-none focus-visible:bg-bg-2"
                >
                  <span
                    id={`audit-entry-${entry.sequence}`}
                    className="font-mono text-10 text-ink-2 tabular-nums w-16"
                  >
                    #{entry.sequence}
                  </span>
                  <ActionBadge action={entry.action} />
                  <span className="font-mono text-11 text-ink-1 truncate flex-1">{entry.target}</span>
                  <span className="font-mono text-10 text-ink-2 hidden md:inline">{entry.actor.role}</span>
                  <span className="font-mono text-10 text-ink-2 tabular-nums hidden md:inline">{formatDate(entry.at)}</span>
                  <span aria-hidden="true" className="text-ink-2 text-12">{isOpen ? "−" : "+"}</span>
                </button>
                {isOpen ? (
                  <div
                    id={`audit-entry-body-${entry.sequence}`}
                    className="px-3 pb-3 pt-1 border-t border-hair-2 bg-bg-panel grid grid-cols-1 md:grid-cols-2 gap-2 text-11"
                  >
                    <Field label="Entry id" mono value={entry.id} copy />
                    <Field label="Previous hash" mono value={entry.previousHash} copy />
                    <Field label="HMAC signature" mono value={entry.signature} copy />
                    <Field label="Actor" value={`${entry.actor.role}${entry.actor.name ? ` · ${entry.actor.name}` : ""}`} />
                    <Field label="Timestamp" mono value={formatDate(entry.at)} />
                    <Field label="Sequence" mono value={String(entry.sequence)} />
                    <div className="md:col-span-2">
                      <div className="font-mono text-9 uppercase tracking-wide-4 text-ink-2 mb-1">Body</div>
                      <pre className="bg-bg-1 border border-hair-2 rounded p-2 text-10 leading-snug text-ink-0 overflow-x-auto whitespace-pre-wrap break-words">
                        {JSON.stringify(entry.body ?? {}, null, 2)}
                      </pre>
                    </div>
                  </div>
                ) : null}
              </article>
            );
          })}
        </div>
      ) : null}

      {data && data.total > data.limit ? (
        <nav aria-label="Audit trail pagination" className="flex items-center justify-between gap-2 mt-3 text-11">
          <span className="font-mono text-ink-2">
            Page {currentPage} of {totalPages} · showing {data.returned} of {data.total}
          </span>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => {
                const next = Math.max(0, offset - data.limit);
                setOffset(next);
                void load(next);
              }}
              disabled={offset === 0 || loading}
              className="px-2.5 py-1 border border-hair-2 rounded text-ink-1 hover:border-brand hover:text-brand transition-colors disabled:opacity-50 disabled:cursor-not-allowed focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-1"
            >
              ← Previous
            </button>
            <button
              type="button"
              onClick={() => {
                const next = offset + data.limit;
                if (next >= data.total) return;
                setOffset(next);
                void load(next);
              }}
              disabled={offset + data.limit >= data.total || loading}
              className="px-2.5 py-1 border border-hair-2 rounded text-ink-1 hover:border-brand hover:text-brand transition-colors disabled:opacity-50 disabled:cursor-not-allowed focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-1"
            >
              Next →
            </button>
          </div>
        </nav>
      ) : null}

      {data ? (
        <footer className="mt-3 pt-2 border-t border-dashed border-hair-2 font-mono text-10 text-ink-2 flex items-center justify-between gap-2 flex-wrap">
          <span>Chain head · sequence {data.head.sequence} · {SHORT_HASH(data.head.hash)}</span>
          <span>Scanned {data.scanned} · matched {data.total}</span>
        </footer>
      ) : null}
    </section>
  );
}

const ACTION_TONES: Record<string, string> = {
  str: "bg-rose-100 text-rose-900 border-rose-200",
  freeze: "bg-rose-100 text-rose-900 border-rose-200",
  dispose: "bg-amber-100 text-amber-900 border-amber-200",
  escalate: "bg-amber-100 text-amber-900 border-amber-200",
  goaml_submit: "bg-violet-100 text-violet-900 border-violet-200",
  clear: "bg-emerald-100 text-emerald-900 border-emerald-200",
  str_read: "bg-sky-100 text-sky-900 border-sky-200",
};

function ActionBadge({ action }: { action: string }): JSX.Element {
  const tone = ACTION_TONES[action] ?? "bg-bg-2 text-ink-1 border-hair-2";
  return (
    <span
      className={`font-mono text-10 uppercase tracking-wide-3 px-2 py-0.5 rounded border ${tone} whitespace-nowrap`}
    >
      {action}
    </span>
  );
}

function Field({
  label,
  value,
  mono = false,
  copy = false,
}: {
  label: string;
  value: string;
  mono?: boolean;
  copy?: boolean;
}): JSX.Element {
  return (
    <div>
      <div className="font-mono text-9 uppercase tracking-wide-4 text-ink-2 mb-0.5 flex items-center gap-2">
        <span>{label}</span>
        {copy ? (
          <button
            type="button"
            onClick={() => {
              if (typeof navigator !== "undefined" && navigator.clipboard) {
                void navigator.clipboard.writeText(value);
              }
            }}
            className="text-ink-2 hover:text-brand text-9 underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-1 rounded"
            aria-label={`Copy ${label} to clipboard`}
          >
            copy
          </button>
        ) : null}
      </div>
      <div className={`text-ink-0 ${mono ? "font-mono text-11 break-all" : "text-12"}`}>{value}</div>
    </div>
  );
}

function SkeletonRows(): JSX.Element {
  return (
    <div className="space-y-1.5" aria-hidden="true">
      {Array.from({ length: 5 }).map((_, i) => (
        <div
          key={i}
          className="border border-hair-2 rounded-md bg-bg-1 px-3 py-2 flex items-center gap-3"
        >
          <div className="w-12 h-3 rounded bg-bg-2 animate-pulse" />
          <div className="w-16 h-3 rounded bg-bg-2 animate-pulse" />
          <div className="flex-1 h-3 rounded bg-bg-2 animate-pulse" />
          <div className="w-24 h-3 rounded bg-bg-2 animate-pulse hidden md:block" />
        </div>
      ))}
    </div>
  );
}
