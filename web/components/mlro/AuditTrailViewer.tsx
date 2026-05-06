"use client";

import { useCallback, useEffect, useState } from "react";

// ── Types ─────────────────────────────────────────────────────────────────────

type HmacStatus = "pending" | "valid" | "invalid" | "error";

type ReasoningFaculty =
  | "sanctions"
  | "pep"
  | "adverse_media"
  | "jurisdiction"
  | "typology"
  | "redlines"
  | "composite"
  | "override"
  | "advisor"
  | "executor"
  | "unknown";

interface ReasoningStep {
  stepNo: number;
  faculty: ReasoningFaculty;
  label: string;
  summary: string;
  confidence: number;   // 0–1
  at: string;           // ISO timestamp
  note?: string;
}

interface DecisionEnvelope {
  subject: string;
  subjectId?: string;
  entityType?: string;
  verdict: "clear" | "review" | "escalate" | "decline" | "freeze" | "str_filed";
  verdictLabel: string;
  timestamp: string;
  analyst: string;
  compositeScore?: number;
  jurisdiction?: string;
}

interface HmacSeal {
  algorithm: string;
  seal: string;          // last 16 chars shown; full seal used for verify
  sealFull?: string;
  issuedAt: string;
  issuedBy: string;
}

interface RecommendedAction {
  action: string;
  rationale: string;
  priority: "high" | "medium" | "low";
  deadline?: string;
}

interface AuditViewResponse {
  ok: boolean;
  screeningId: string;
  envelope: DecisionEnvelope;
  reasoningChain: ReasoningStep[];
  hmac: HmacSeal;
  recommendedActions: RecommendedAction[];
  schemaVersion: number;
  retrievedAt: string;
}

interface VerifyResponse {
  ok: boolean;
  valid: boolean;
  message?: string;
  verifiedAt?: string;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmtDateTime(iso: string): string {
  try {
    return new Date(iso).toLocaleString("en-GB", {
      day: "2-digit",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    });
  } catch {
    return iso;
  }
}

function downloadBlob(content: string, filename: string, mime: string): void {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

// ── Verdict badge ─────────────────────────────────────────────────────────────

const VERDICT_STYLE: Record<DecisionEnvelope["verdict"], string> = {
  clear:      "bg-green-dim text-green border border-green/25",
  review:     "bg-amber-dim text-amber border border-amber/30",
  escalate:   "bg-orange-dim text-orange border border-orange/30",
  decline:    "bg-red-dim text-red border border-red/30",
  freeze:     "bg-red-dim text-red border border-red/30",
  str_filed:  "bg-violet-dim text-violet border border-violet/25",
};

function VerdictBadge({ verdict, label }: { verdict: DecisionEnvelope["verdict"]; label: string }) {
  return (
    <span
      className={`inline-flex items-center px-2.5 py-1 rounded font-mono text-11 font-semibold uppercase tracking-wide-2 ${VERDICT_STYLE[verdict]}`}
    >
      {label}
    </span>
  );
}

// ── Faculty label ─────────────────────────────────────────────────────────────

const FACULTY_LABEL: Record<ReasoningFaculty, string> = {
  sanctions:      "Sanctions Screen",
  pep:            "PEP Classification",
  adverse_media:  "Adverse Media",
  jurisdiction:   "Jurisdiction Risk",
  typology:       "Typology Matcher",
  redlines:       "Charter Redlines",
  composite:      "Composite Verdict",
  override:       "MLRO Override",
  advisor:        "AI Advisor",
  executor:       "Executor",
  unknown:        "Unknown Faculty",
};

const FACULTY_COLOR: Record<ReasoningFaculty, string> = {
  sanctions:      "bg-red-dim text-red",
  pep:            "bg-violet-dim text-violet",
  adverse_media:  "bg-orange-dim text-orange",
  jurisdiction:   "bg-amber-dim text-amber",
  typology:       "bg-blue-dim text-blue",
  redlines:       "bg-red-dim text-red",
  composite:      "bg-brand-dim text-brand",
  override:       "bg-green-dim text-green",
  advisor:        "bg-violet-dim text-violet",
  executor:       "bg-bg-2 text-ink-2",
  unknown:        "bg-bg-2 text-ink-3",
};

function FacultyBadge({ faculty }: { faculty: ReasoningFaculty }) {
  return (
    <span
      className={`inline-flex items-center px-1.5 py-px rounded-sm font-mono text-9.5 font-semibold uppercase tracking-wide-2 ${FACULTY_COLOR[faculty]}`}
    >
      {FACULTY_LABEL[faculty]}
    </span>
  );
}

// ── Confidence meter ──────────────────────────────────────────────────────────

function ConfidenceBar({ value }: { value: number }) {
  const pct = Math.round(value * 100);
  const color =
    pct >= 80 ? "bg-green"
    : pct >= 50 ? "bg-amber"
    : "bg-red";
  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 h-1.5 bg-bg-2 rounded-full overflow-hidden">
        <div
          className={`h-full rounded-full ${color}`}
          style={{ width: `${pct}%` }}
        />
      </div>
      <span className="font-mono text-10 text-ink-2 w-8 text-right">{pct}%</span>
    </div>
  );
}

// ── HMAC seal panel ───────────────────────────────────────────────────────────

function HmacSealPanel({
  hmac,
  hmacStatus,
  onVerify,
  verifying,
  verifyError,
}: {
  hmac: HmacSeal;
  hmacStatus: HmacStatus;
  onVerify: () => void;
  verifying: boolean;
  verifyError: string | null;
}) {
  const statusConfig: Record<HmacStatus, { label: string; cls: string; dotCls: string }> = {
    pending: {
      label: "Not verified",
      cls: "bg-bg-2 text-ink-2 border border-hair-2",
      dotCls: "bg-ink-3",
    },
    valid: {
      label: "Integrity verified",
      cls: "bg-green-dim text-green border border-green/25",
      dotCls: "bg-green shadow-[0_0_6px_var(--green)]",
    },
    invalid: {
      label: "Integrity FAILED",
      cls: "bg-red-dim text-red border border-red/30",
      dotCls: "bg-red shadow-[0_0_6px_var(--red)]",
    },
    error: {
      label: "Verification error",
      cls: "bg-amber-dim text-amber border border-amber/30",
      dotCls: "bg-amber",
    },
  };
  const cfg = statusConfig[hmacStatus];

  return (
    <div className="bg-bg-1 border border-hair-2 rounded-lg p-4">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div className="flex-1 min-w-0">
          <div className="text-10.5 uppercase tracking-wide-4 font-semibold text-ink-2 mb-2">
            HMAC Integrity Seal
          </div>
          <div className="font-mono text-11 text-ink-3 mb-1 break-all">
            {hmac.algorithm.toUpperCase()} ·{" "}
            <span className="text-ink-1">{hmac.seal}</span>
          </div>
          <div className="flex items-center gap-4 text-10 font-mono text-ink-3 flex-wrap">
            <span>Issued {fmtDateTime(hmac.issuedAt)}</span>
            <span>By {hmac.issuedBy}</span>
          </div>
        </div>
        <div className="flex flex-col items-end gap-2">
          <span
            className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded font-mono text-10.5 font-semibold uppercase ${cfg.cls}`}
          >
            <span className={`w-1.5 h-1.5 rounded-full ${cfg.dotCls}`} />
            {cfg.label}
          </span>
          <button
            type="button"
            onClick={onVerify}
            disabled={verifying || hmacStatus === "valid"}
            className="font-mono text-10 uppercase tracking-wide-3 font-semibold px-3 py-1.5 rounded border border-hair-2 bg-bg-panel text-ink-1 hover:border-hair-3 hover:text-ink-0 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {verifying ? "Verifying…" : hmacStatus === "valid" ? "Verified" : "Verify seal"}
          </button>
        </div>
      </div>
      {verifyError && (
        <div className="mt-2 text-11 font-mono text-red">{verifyError}</div>
      )}
      {hmacStatus === "invalid" && (
        <div className="mt-3 px-3 py-2 bg-red-dim border border-red/20 rounded text-11 text-red leading-snug">
          The HMAC seal does not match the envelope contents. This record may have been tampered with.
          Contact your compliance officer immediately.
        </div>
      )}
    </div>
  );
}

// ── Recommended actions ───────────────────────────────────────────────────────

const ACTION_PRIORITY_STYLE: Record<RecommendedAction["priority"], string> = {
  high:   "border-l-red bg-red-dim/30",
  medium: "border-l-amber bg-amber-dim/30",
  low:    "border-l-blue bg-blue-dim/20",
};

const PRIORITY_BADGE: Record<RecommendedAction["priority"], string> = {
  high:   "bg-red-dim text-red",
  medium: "bg-amber-dim text-amber",
  low:    "bg-blue-dim text-blue",
};

function RecommendedActionsPanel({ actions }: { actions: RecommendedAction[] }) {
  if (actions.length === 0) return null;
  return (
    <div>
      <div className="text-10.5 uppercase tracking-wide-4 font-semibold text-ink-2 mb-3">
        Recommended Actions
      </div>
      <div className="space-y-2">
        {actions.map((action, i) => (
          <div
            key={i}
            className={`border border-hair-2 border-l-4 rounded-lg px-4 py-3 ${ACTION_PRIORITY_STYLE[action.priority]}`}
          >
            <div className="flex items-start gap-2 mb-1 flex-wrap">
              <span
                className={`inline-flex items-center px-1.5 py-px rounded-sm font-mono text-9.5 font-semibold uppercase ${PRIORITY_BADGE[action.priority]}`}
              >
                {action.priority}
              </span>
              <span className="text-12 font-semibold text-ink-0">{action.action}</span>
              {action.deadline && (
                <span className="font-mono text-10 text-ink-3 ml-auto">
                  Due {fmtDateTime(action.deadline)}
                </span>
              )}
            </div>
            <p className="text-11 text-ink-2 m-0 leading-snug">{action.rationale}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

export function AuditTrailViewer({
  screeningId,
  onClose,
}: {
  screeningId: string;
  onClose?: () => void;
}) {
  const [data, setData] = useState<AuditViewResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [hmacStatus, setHmacStatus] = useState<HmacStatus>("pending");
  const [verifying, setVerifying] = useState(false);
  const [verifyError, setVerifyError] = useState<string | null>(null);

  const [exporting, setExporting] = useState(false);

  // ── Load audit record ──────────────────────────────────────────────────────

  useEffect(() => {
    if (!screeningId) return;
    let cancelled = false;

    async function load() {
      setLoading(true);
      setError(null);
      setHmacStatus("pending");
      try {
        const res = await fetch(`/api/audit/view?screeningId=${encodeURIComponent(screeningId)}`);
        if (!res.ok) {
          if (res.status === 404) throw new Error("No audit record found for this screening ID.");
          throw new Error(`HTTP ${res.status}: ${res.statusText}`);
        }
        const json = (await res.json()) as AuditViewResponse;
        if (!cancelled) setData(json);
      } catch (err) {
        if (!cancelled)
          setError(err instanceof Error ? err.message : "Failed to load audit record");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    void load();
    return () => { cancelled = true; };
  }, [screeningId]);

  // ── HMAC verify ───────────────────────────────────────────────────────────

  const handleVerify = useCallback(async () => {
    if (!data) return;
    setVerifying(true);
    setVerifyError(null);
    try {
      const res = await fetch("/api/audit/verify", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          screeningId,
          seal: data.hmac.sealFull ?? data.hmac.seal,
          algorithm: data.hmac.algorithm,
        }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = (await res.json()) as VerifyResponse;
      setHmacStatus(json.valid ? "valid" : "invalid");
    } catch (err) {
      setVerifyError(err instanceof Error ? err.message : "Verification failed");
      setHmacStatus("error");
    } finally {
      setVerifying(false);
    }
  }, [data, screeningId]);

  // ── Export JSON ───────────────────────────────────────────────────────────

  const handleExportJson = useCallback(async () => {
    setExporting(true);
    try {
      const res = await fetch(
        `/api/audit/export?format=json&screeningId=${encodeURIComponent(screeningId)}`,
      );
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const blob = await res.blob();
      const text = await blob.text();
      downloadBlob(text, `audit-${screeningId}.json`, "application/json");
    } catch {
      // Fallback: serialise the in-memory data we already have
      if (data) {
        downloadBlob(
          JSON.stringify(data, null, 2),
          `audit-${screeningId}.json`,
          "application/json",
        );
      }
    } finally {
      setExporting(false);
    }
  }, [screeningId, data]);

  const handleExportPdf = useCallback(async () => {
    setExporting(true);
    try {
      const res = await fetch(
        `/api/audit/export?format=pdf&screeningId=${encodeURIComponent(screeningId)}`,
      );
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `audit-${screeningId}.pdf`;
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      // Non-fatal — PDF export is best-effort
    } finally {
      setExporting(false);
    }
  }, [screeningId]);

  // ── Render helpers ─────────────────────────────────────────────────────────

  function renderLoading() {
    return (
      <div className="p-6 space-y-4">
        <div className="h-20 bg-bg-2 rounded-lg animate-pulse" />
        <div className="h-48 bg-bg-2 rounded-lg animate-pulse" />
        <div className="h-16 bg-bg-2 rounded-lg animate-pulse" />
      </div>
    );
  }

  function renderError() {
    return (
      <div className="p-8 text-center">
        <div className="text-32 mb-3 text-ink-3">!</div>
        <div className="text-14 font-semibold text-ink-0 mb-1">Audit Record Unavailable</div>
        <div className="text-12 text-ink-2 mb-4">{error}</div>
        <div className="text-11 font-mono text-ink-3">Screening ID: {screeningId}</div>
      </div>
    );
  }

  // ── Main render ────────────────────────────────────────────────────────────

  return (
    <div className="bg-bg-panel border border-hair-2 rounded-xl overflow-hidden flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between gap-4 px-6 py-4 border-b border-hair-2 flex-wrap">
        <div className="flex items-center gap-3 min-w-0">
          <span className="w-2 h-2 rounded-full bg-violet shadow-[0_0_8px_var(--violet)] shrink-0" />
          <div className="min-w-0">
            <h2 className="font-display font-normal text-20 leading-tight tracking-tightest text-ink-0 m-0">
              Audit Trail
            </h2>
            <div className="font-mono text-10 text-ink-3 mt-0.5">
              Screening ID:{" "}
              <span className="text-ink-1 select-all">{screeningId}</span>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          {data && (
            <>
              <button
                type="button"
                onClick={() => void handleExportJson()}
                disabled={exporting}
                className="font-mono text-10.5 uppercase tracking-wide-3 font-semibold px-3 py-1.5 rounded border border-hair-2 bg-bg-1 text-ink-1 hover:border-hair-3 hover:text-ink-0 transition-colors disabled:opacity-50"
              >
                {exporting ? "Exporting…" : "Export JSON"}
              </button>
              <button
                type="button"
                onClick={() => void handleExportPdf()}
                disabled={exporting}
                className="font-mono text-10.5 uppercase tracking-wide-3 font-semibold px-3 py-1.5 rounded border border-violet/40 bg-violet-dim text-violet hover:bg-violet hover:text-white transition-colors disabled:opacity-50"
              >
                Export PDF
              </button>
            </>
          )}
          {onClose && (
            <button
              type="button"
              onClick={onClose}
              aria-label="Close audit viewer"
              className="w-8 h-8 flex items-center justify-center rounded border border-hair-2 bg-bg-1 text-ink-2 hover:text-ink-0 hover:border-hair-3 transition-colors font-mono text-14 leading-none"
            >
              x
            </button>
          )}
        </div>
      </div>

      {/* Body */}
      {loading ? (
        renderLoading()
      ) : error ? (
        renderError()
      ) : data ? (
        <div className="p-6 space-y-6 overflow-y-auto">

          {/* 1. Decision Envelope */}
          <section>
            <div className="text-10.5 uppercase tracking-wide-4 font-semibold text-ink-2 mb-3">
              Decision Envelope
            </div>
            <div className="bg-bg-1 border border-hair-2 rounded-lg p-4">
              <div className="flex items-start justify-between gap-4 flex-wrap mb-4">
                <div>
                  <div className="text-18 font-semibold text-ink-0 leading-tight">
                    {data.envelope.subject}
                  </div>
                  <div className="flex items-center gap-2 mt-1 flex-wrap">
                    {data.envelope.entityType && (
                      <span className="font-mono text-10 bg-bg-2 text-ink-2 px-1.5 py-px rounded uppercase tracking-wide-2">
                        {data.envelope.entityType}
                      </span>
                    )}
                    {data.envelope.subjectId && (
                      <span className="font-mono text-10 text-ink-3">
                        ID: {data.envelope.subjectId}
                      </span>
                    )}
                  </div>
                </div>
                <VerdictBadge
                  verdict={data.envelope.verdict}
                  label={data.envelope.verdictLabel}
                />
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-12">
                <EnvelopeField label="Timestamp" value={fmtDateTime(data.envelope.timestamp)} mono />
                <EnvelopeField label="Analyst" value={data.envelope.analyst} />
                {data.envelope.compositeScore !== undefined && (
                  <EnvelopeField
                    label="Composite Score"
                    value={`${data.envelope.compositeScore}/100`}
                    mono
                  />
                )}
                {data.envelope.jurisdiction && (
                  <EnvelopeField label="Jurisdiction" value={data.envelope.jurisdiction} />
                )}
              </div>
            </div>
          </section>

          {/* 2. Reasoning Chain */}
          <section>
            <div className="text-10.5 uppercase tracking-wide-4 font-semibold text-ink-2 mb-3">
              Reasoning Chain
              <span className="ml-2 font-mono text-10 text-ink-3 normal-case tracking-normal">
                {data.reasoningChain.length} step{data.reasoningChain.length !== 1 ? "s" : ""}
              </span>
            </div>
            {data.reasoningChain.length === 0 ? (
              <div className="py-6 text-center text-12 text-ink-2">
                No reasoning steps recorded.
              </div>
            ) : (
              <ol className="relative list-none p-0 m-0 space-y-3">
                {data.reasoningChain.map((step, i) => {
                  const isLast = i === data.reasoningChain.length - 1;
                  return (
                    <li
                      key={`${step.stepNo}-${step.faculty}`}
                      className={`relative pl-8 ${isLast ? "pt-2 mt-2 border-t border-hair" : ""}`}
                    >
                      {/* Step dot */}
                      <span className="absolute left-1.5 top-1.5 w-3 h-3 rounded-full bg-bg-3 border-2 border-hair-3" />
                      {/* Vertical connector */}
                      {!isLast && (
                        <span className="absolute left-[13px] top-5 bottom-[-14px] border-l border-dashed border-hair-3" />
                      )}

                      <div className="bg-bg-panel border border-hair-2 rounded-lg p-3">
                        <div className="flex items-start justify-between gap-2 flex-wrap mb-2">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="font-mono text-10 text-ink-3">#{step.stepNo}</span>
                            <FacultyBadge faculty={step.faculty} />
                            <span className="text-12 font-semibold text-ink-0">{step.label}</span>
                          </div>
                          <span className="font-mono text-10 text-ink-3 shrink-0">
                            {fmtDateTime(step.at)}
                          </span>
                        </div>

                        <p className="text-12 text-ink-1 mb-2 leading-snug">{step.summary}</p>

                        <div className="flex items-center gap-3">
                          <span className="font-mono text-10 text-ink-3 shrink-0">Confidence</span>
                          <div className="flex-1 max-w-[200px]">
                            <ConfidenceBar value={step.confidence} />
                          </div>
                        </div>

                        {step.note && (
                          <div className="mt-2 text-11 text-ink-3 font-mono leading-relaxed border-t border-hair pt-2">
                            {step.note}
                          </div>
                        )}
                      </div>
                    </li>
                  );
                })}
              </ol>
            )}
          </section>

          {/* 3. HMAC Integrity Seal */}
          <section>
            <HmacSealPanel
              hmac={data.hmac}
              hmacStatus={hmacStatus}
              onVerify={() => void handleVerify()}
              verifying={verifying}
              verifyError={verifyError}
            />
          </section>

          {/* 4. Recommended Actions */}
          {data.recommendedActions.length > 0 && (
            <section>
              <RecommendedActionsPanel actions={data.recommendedActions} />
            </section>
          )}

          {/* Footer metadata */}
          <div className="pt-3 border-t border-hair flex items-center justify-between flex-wrap gap-2">
            <div className="text-10 font-mono text-ink-3 leading-relaxed">
              Schema v{data.schemaVersion} · Retrieved {fmtDateTime(data.retrievedAt)} ·
              Tamper-evident HMAC seal ({data.hmac.algorithm.toUpperCase()})
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => void handleExportJson()}
                disabled={exporting}
                className="font-mono text-9.5 uppercase tracking-wide-3 font-semibold px-2.5 py-1 rounded border border-hair-2 bg-bg-1 text-ink-2 hover:text-ink-0 transition-colors disabled:opacity-50"
              >
                JSON
              </button>
              <button
                type="button"
                onClick={() => void handleExportPdf()}
                disabled={exporting}
                className="font-mono text-9.5 uppercase tracking-wide-3 font-semibold px-2.5 py-1 rounded border border-violet/30 bg-violet-dim text-violet hover:bg-violet hover:text-white transition-colors disabled:opacity-50"
              >
                PDF
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

// ── Field helper ──────────────────────────────────────────────────────────────

function EnvelopeField({
  label,
  value,
  mono = false,
}: {
  label: string;
  value: string;
  mono?: boolean;
}) {
  return (
    <div>
      <div className="text-10 uppercase tracking-wide-3 font-semibold text-ink-3 mb-0.5">{label}</div>
      <div className={`text-12 text-ink-0 ${mono ? "font-mono" : ""}`}>{value}</div>
    </div>
  );
}
