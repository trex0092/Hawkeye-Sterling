"use client";

import { useState, useCallback, useEffect, useRef } from "react";
import { ModuleHero, ModuleLayout } from "@/components/layout/ModuleLayout";
import { apiErrorMessage, caughtErrorMessage } from "@/lib/client/error-utils";
import type {
  MakerCheckerRequest,
  MakerCheckerActionType,
} from "@/lib/server/maker-checker";

// Maker-Checker Queue — four-eyes enforcement for high-risk AML decisions.
// UAE Federal Decree-Law No. 10 of 2025 Art.16 · FATF R.28

// ── Constants ──────────────────────────────────────────────────────────────────

const ACTION_LABELS: Record<MakerCheckerActionType, string> = {
  risk_override:  "Risk Score Override",
  str_filing:     "STR Filing",
  whitelist_add:  "Whitelist Addition",
  pep_clearance:  "PEP Clearance",
  case_close:     "Case Closure",
};

const ACTION_SEVERITY: Record<MakerCheckerActionType, "critical" | "warning" | "info"> = {
  risk_override:  "warning",
  str_filing:     "critical",
  whitelist_add:  "warning",
  pep_clearance:  "critical",
  case_close:     "info",
};

const SEVERITY_STYLE = {
  critical: "text-red   bg-red/10   border-red/20",
  warning:  "text-amber bg-amber/10 border-amber/20",
  info:     "text-brand bg-brand/10 border-brand/20",
};

const STATUS_STYLE: Record<string, string> = {
  pending:  "text-amber  bg-amber/10  border-amber/20",
  approved: "text-green  bg-green-dim border-green/20",
  rejected: "text-red    bg-red/10    border-red/20",
};

// ── Helpers ────────────────────────────────────────────────────────────────────

function formatAge(ageMs: number): string {
  const sec  = Math.floor(ageMs / 1_000);
  const min  = Math.floor(sec  / 60);
  const hr   = Math.floor(min  / 60);
  const days = Math.floor(hr   / 24);
  if (days > 0)  return `${days}d ${hr % 24}h`;
  if (hr > 0)    return `${hr}h ${min % 60}m`;
  if (min > 0)   return `${min}m`;
  return `${sec}s`;
}

function formatTimestamp(iso: string): string {
  try {
    return new Date(iso).toLocaleString("en-GB", {
      day: "2-digit", month: "short", year: "numeric",
      hour: "2-digit", minute: "2-digit",
    });
  } catch {
    return iso;
  }
}

// ── Request card ───────────────────────────────────────────────────────────────

interface RequestCardProps {
  item: MakerCheckerRequest & { ageMs?: number };
  onDecision: (_id: string, _decision: "approve" | "reject", _note: string) => Promise<void>;
  submitting: string | null;
}

function RequestCard({ item, onDecision, submitting }: RequestCardProps) {
  const [expanded, setExpanded] = useState(false);
  const [note, setNote] = useState("");
  const [noteError, setNoteError] = useState("");

  const actionSeverity = ACTION_SEVERITY[item.actionType] ?? "info";
  const actionClass    = SEVERITY_STYLE[actionSeverity];
  const statusClass    = STATUS_STYLE[item.status] ?? "text-ink-2 bg-bg-2 border-hair-2";
  const isOverdue      = (item.ageMs ?? 0) > 86_400_000;
  const isSubmitting   = submitting === item.id;

  const handleDecision = async (decision: "approve" | "reject") => {
    if (decision === "reject" && !note.trim()) {
      setNoteError("A note is required when rejecting.");
      return;
    }
    setNoteError("");
    await onDecision(item.id, decision, note);
  };

  return (
    <div className={`bg-bg-1 border rounded-xl p-4 space-y-3 ${
      isOverdue ? "border-red/30" : "border-hair-2"
    }`}>
      {/* Header */}
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-2 flex-wrap min-w-0">
          <span className={`px-2.5 py-0.5 rounded-full text-11 font-semibold border ${actionClass}`}>
            {ACTION_LABELS[item.actionType] ?? item.actionType}
          </span>
          <span className={`px-2 py-0.5 rounded text-10 font-bold border uppercase tracking-wide ${statusClass}`}>
            {item.status}
          </span>
          {isOverdue && (
            <span className="px-2 py-0.5 rounded text-10 font-bold border uppercase tracking-wide text-red bg-red/10 border-red/20">
              Overdue
            </span>
          )}
        </div>
        <div className="text-right shrink-0 text-11 text-ink-2 font-mono">
          {formatAge(item.ageMs ?? 0)} ago
        </div>
      </div>

      {/* Subject + initiator */}
      <div className="grid grid-cols-2 gap-3 text-11">
        <div>
          <div className="text-10 uppercase tracking-wide-4 text-ink-3 font-semibold mb-0.5">Subject</div>
          <div className="text-ink-0 font-medium truncate">{item.subjectId}</div>
        </div>
        <div>
          <div className="text-10 uppercase tracking-wide-4 text-ink-3 font-semibold mb-0.5">Initiated by</div>
          <div className="text-ink-1">{item.initiatorId}</div>
        </div>
        <div>
          <div className="text-10 uppercase tracking-wide-4 text-ink-3 font-semibold mb-0.5">Requested at</div>
          <div className="text-ink-2">{formatTimestamp(item.requestedAt)}</div>
        </div>
        <div>
          <div className="text-10 uppercase tracking-wide-4 text-ink-3 font-semibold mb-0.5">Request ID</div>
          <div className="text-ink-3 font-mono truncate">{item.id}</div>
        </div>
      </div>

      {/* Payload toggle */}
      {Object.keys(item.payload ?? {}).length > 0 && (
        <div>
          <button
            type="button"
            onClick={() => setExpanded((v) => !v)}
            className="text-10 text-brand hover:underline"
          >
            {expanded ? "Hide payload" : "Show payload"}
          </button>
          {expanded && (
            <pre className="mt-2 text-10 font-mono bg-bg-panel border border-hair-2 rounded p-2 overflow-x-auto text-ink-2">
              {JSON.stringify(item.payload, null, 2)}
            </pre>
          )}
        </div>
      )}

      {/* Checker info (if decided) */}
      {item.checkerId && (
        <div className="bg-bg-panel border border-hair-2 rounded p-2.5 text-11 text-ink-2 space-y-1">
          <div><span className="font-semibold text-ink-0">Checker:</span> {item.checkerId}</div>
          {item.checkedAt && <div><span className="font-semibold">Decided at:</span> {formatTimestamp(item.checkedAt)}</div>}
          {item.checkerNote && <div><span className="font-semibold">Note:</span> {item.checkerNote}</div>}
        </div>
      )}

      {/* Approve / Reject actions (only for pending) */}
      {item.status === "pending" && (
        <div className="pt-2 border-t border-hair-2 space-y-2">
          <div>
            <label className="text-10 uppercase tracking-wide-4 text-ink-3 font-semibold block mb-1">
              Checker note {item.actionType !== "risk_override" && item.actionType !== "case_close" ? "(required for reject)" : "(optional)"}
            </label>
            <textarea
              value={note}
              onChange={(e) => { setNote(e.target.value); setNoteError(""); }}
              placeholder="Add a note for the audit trail…"
              rows={2}
              className="w-full bg-bg-panel border border-hair-2 rounded px-3 py-2 text-11 text-ink-0 outline-none focus:border-brand resize-none placeholder:text-ink-3"
            />
            {noteError && (
              <p className="text-10 text-red mt-0.5">{noteError}</p>
            )}
          </div>
          <div className="flex gap-2">
            <button
              type="button"
              disabled={isSubmitting}
              onClick={() => void handleDecision("approve")}
              className="flex-1 py-1.5 rounded-lg bg-green text-white text-11 font-semibold hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed transition-opacity"
            >
              {isSubmitting ? "Processing…" : "Approve"}
            </button>
            <button
              type="button"
              disabled={isSubmitting}
              onClick={() => void handleDecision("reject")}
              className="flex-1 py-1.5 rounded-lg bg-red/10 border border-red/20 text-red text-11 font-semibold hover:bg-red/20 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {isSubmitting ? "Processing…" : "Reject"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Main page ──────────────────────────────────────────────────────────────────

type ItemWithAge = MakerCheckerRequest & { ageMs?: number };

export default function MakerCheckerPage() {
  const [items, setItems] = useState<ItemWithAge[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [showAll, setShowAll] = useState(false);
  const [filterType, setFilterType] = useState<MakerCheckerActionType | "all">("all");

  const mountedRef = useRef(true);
  useEffect(() => () => { mountedRef.current = false; }, []);

  const loadItems = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const url = showAll ? "/api/maker-checker?status=all" : "/api/maker-checker";
      const res = await fetch(url);
      if (!res.ok) throw new Error(apiErrorMessage(res.status, "Maker-checker queue"));
      const data = await res.json() as { ok: boolean; items?: ItemWithAge[]; error?: string };
      if (!mountedRef.current) return;
      if (!data.ok) throw new Error(data.error ?? "Failed to load");
      setItems(data.items ?? []);
    } catch (e) {
      if (mountedRef.current) setError(caughtErrorMessage(e, "Load failed"));
    } finally {
      if (mountedRef.current) setLoading(false);
    }
  }, [showAll]);

  useEffect(() => {
    void loadItems();
  }, [loadItems]);

  const handleDecision = useCallback(async (
    id: string,
    decision: "approve" | "reject",
    note: string,
  ) => {
    setSubmitting(id);
    setActionError(null);
    try {
      const res = await fetch(`/api/maker-checker/${id}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ decision, note }),
      });
      const data = await res.json() as { ok: boolean; error?: string };
      if (!mountedRef.current) return;
      if (!data.ok) throw new Error(data.error ?? "Decision failed");
      // Reload list after decision
      await loadItems();
    } catch (e) {
      if (mountedRef.current) setActionError(caughtErrorMessage(e, "Decision failed"));
    } finally {
      if (mountedRef.current) setSubmitting(null);
    }
  }, [loadItems]);

  const filtered = filterType === "all"
    ? items
    : items.filter((i) => i.actionType === filterType);

  const pendingCount = items.filter((i) => i.status === "pending").length;

  return (
    <ModuleLayout engineLabel="Maker-checker engine" asanaModule="maker-checker" asanaLabel="Maker-Checker" onSync={() => void loadItems()}>
      <ModuleHero
        eyebrow=""
        title="Maker-Checker"
        titleEm="Queue."
        kpis={[
          { value: pendingCount.toString(), label: "Pending decisions", tone: pendingCount > 0 ? "amber" : undefined },
          { value: items.filter((i) => (i.ageMs ?? 0) > 86_400_000 && i.status === "pending").length.toString(), label: "Overdue >24h", tone: "red" },
          { value: items.filter((i) => i.status === "approved").length.toString(), label: "Approved" },
          { value: items.filter((i) => i.status === "rejected").length.toString(), label: "Rejected" },
        ]}
        intro={
          <>
            All high-risk compliance decisions — STR filings, risk overrides, whitelist additions, PEP clearances,
            and case closures — require a second operator&apos;s approval before execution. Self-approval is
            prohibited under UAE Federal Decree-Law No. 10 of 2025 Art.16 (four-eyes principle) and FATF Recommendation 28.
          </>
        }
      />

      {/* Controls */}
      <div className="flex flex-wrap items-center gap-3 mb-5">
        {/* Status toggle */}
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={() => setShowAll(false)}
            className={`px-2.5 py-1 rounded text-11 font-medium transition-colors border ${
              !showAll ? "bg-brand text-white border-brand" : "text-ink-2 border-hair-2 hover:border-hair hover:text-ink-0"
            }`}
          >
            Pending only
          </button>
          <button
            type="button"
            onClick={() => setShowAll(true)}
            className={`px-2.5 py-1 rounded text-11 font-medium transition-colors border ${
              showAll ? "bg-brand text-white border-brand" : "text-ink-2 border-hair-2 hover:border-hair hover:text-ink-0"
            }`}
          >
            All decisions
          </button>
        </div>

        {/* Action type filter */}
        <select
          value={filterType}
          onChange={(e) => setFilterType(e.target.value as MakerCheckerActionType | "all")}
          className="bg-bg-1 border border-hair-2 rounded px-3 py-1.5 text-12 text-ink-1 outline-none focus:border-brand"
        >
          <option value="all">All action types</option>
          {(Object.entries(ACTION_LABELS) as [MakerCheckerActionType, string][]).map(([k, v]) => (
            <option key={k} value={k}>{v}</option>
          ))}
        </select>

        <button
          type="button"
          onClick={() => void loadItems()}
          disabled={loading}
          className="px-2.5 py-1 rounded bg-bg-1 border border-hair-2 text-11 font-medium text-ink-1 hover:border-brand disabled:opacity-50 transition-colors"
        >
          {loading ? "Loading…" : "Refresh"}
        </button>
      </div>

      {/* Error */}
      {(error || actionError) && (
        <div className="bg-red/10 border border-red/20 rounded-lg p-4 text-12 text-red mb-4">
          {error ?? actionError}
        </div>
      )}

      {/* Loading state */}
      {loading && (
        <div className="flex items-center gap-2 py-8 text-ink-2 text-12">
          <span
            className="w-4 h-4 rounded-full border-2 border-brand border-t-transparent shrink-0"
            style={{ animation: "spin 0.8s linear infinite" }}
          />
          Loading maker-checker queue…
        </div>
      )}

      {/* Items */}
      {!loading && filtered.length === 0 && (
        <div className="text-center py-12 text-ink-3">
          <div className="text-11 uppercase tracking-wide-4 font-semibold mb-1">
            {showAll ? "No decisions found" : "No pending decisions"}
          </div>
          <div className="text-12">
            {showAll
              ? "No maker-checker requests have been created yet."
              : "All high-risk decisions have been reviewed — the queue is clear."}
          </div>
        </div>
      )}

      {!loading && filtered.length > 0 && (
        <div className="space-y-4">
          <div className="text-11 text-ink-3 uppercase tracking-wide-4 font-semibold">
            {filtered.length} {filterType === "all" ? "" : ACTION_LABELS[filterType]} decision{filtered.length !== 1 ? "s" : ""}
          </div>
          {filtered.map((item) => (
            <RequestCard
              key={item.id}
              item={item}
              onDecision={handleDecision}
              submitting={submitting}
            />
          ))}
        </div>
      )}
    </ModuleLayout>
  );
}
