"use client";

import { useEffect, useState } from "react";
import { Header } from "@/components/layout/Header";
import { fetchJson } from "@/lib/api/fetchWithRetry";
import type { FourEyesItem, FourEyesStatus } from "@/lib/types";
import { loadOperatorRole } from "@/lib/data/operator-role";
import { writeAuditEvent } from "@/lib/audit";
import { formatDMYTime as fmt } from "@/lib/utils/dateFormat";

interface ListResponse {
  ok: boolean;
  items?: FourEyesItem[];
  error?: string;
}

interface PatchResponse {
  ok: boolean;
  item?: FourEyesItem;
  error?: string;
}

const ACTION_LABEL: Record<FourEyesItem["action"], string> = {
  str: "STR draft",
  freeze: "Freeze relationship",
  decline: "Decline onboarding",
  "edd-uplift": "Uplift to EDD",
  escalate: "Escalate to MLRO",
};

const STATUS_TONE: Record<FourEyesStatus, string> = {
  pending: "bg-amber-dim text-amber border-amber/30",
  approved: "bg-green-dim text-green border-green/30",
  rejected: "bg-red-dim text-red border-red/30",
  expired: "bg-bg-2 text-ink-3 border-hair-2",
};

export default function FourEyesPage() {
  const [items, setItems] = useState<FourEyesItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [decisionDraft, setDecisionDraft] = useState<{ id: string; reason: string } | null>(null);
  const [operatorName, setOperatorName] = useState("");

  const refresh = async () => {
    setLoading(true);
    const res = await fetchJson<ListResponse>("/api/four-eyes", {
      label: "Four-eyes load failed",
    });
    setLoading(false);
    if (!res.ok || !res.data?.ok) {
      setError(res.error ?? "load failed");
      return;
    }
    setError(null);
    setItems(res.data.items ?? []);
  };

  useEffect(() => {
    void refresh();
    // Pre-fill operator name from localStorage if available — saves typing
    // on every approval.
    if (typeof window !== "undefined") {
      const cached = window.localStorage.getItem("hawkeye.four-eyes-operator") ?? "";
      setOperatorName(cached);
    }
  }, []);

  const persistOperator = (n: string) => {
    setOperatorName(n);
    if (typeof window !== "undefined") {
      try { window.localStorage.setItem("hawkeye.four-eyes-operator", n); } catch { /* quota */ }
    }
  };

  const decide = async (id: string, decision: "approve" | "reject", rejectionReason?: string) => {
    if (!operatorName.trim()) {
      setError("Enter your operator name before approving / rejecting.");
      return;
    }
    const body: Record<string, unknown> = { decision, operator: operatorName.trim() };
    if (decision === "reject" && rejectionReason) body.rejectionReason = rejectionReason;
    const res = await fetchJson<PatchResponse>(`/api/four-eyes?id=${encodeURIComponent(id)}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
      label: "Four-eyes decision failed",
    });
    if (!res.ok || !res.data?.ok) {
      setError(res.error ?? "decision failed");
      return;
    }
    setDecisionDraft(null);
    setError(null);
    const item = res.data.item;
    if (item) {
      writeAuditEvent(
        operatorName.trim(),
        decision === "approve" ? "four-eyes.approved" : "four-eyes.rejected",
        `${item.subjectName} (${item.subjectId}) - ${ACTION_LABEL[item.action]}`,
      );
    }
    void refresh();
  };

  const pending = items.filter((i) => i.status === "pending");
  const decided = items.filter((i) => i.status !== "pending");
  const role = typeof window !== "undefined" ? loadOperatorRole() : "analyst";
  // Only MLRO / managing-director / Compliance Officer can approve a
  // four-eyes item — analysts and compliance assistants only initiate.
  const canApprove = role === "mlro" || role === "managing_director" || role === "co";

  return (
    <>
      <Header />
      <main className="max-w-5xl mx-auto px-10 py-8">
        <div className="mb-6">
          <div className="font-mono text-10 font-semibold text-amber tracking-wide-4 uppercase mb-1">
            MODULE 48
          </div>
          <div className="font-mono text-11 tracking-wide-8 uppercase text-ink-2 mb-2">
            BUREAU II · FOUR-EYES QUEUE
          </div>
          <h1 className="font-display font-normal text-32 text-ink-0 leading-tight">
            Awaiting <em className="italic text-brand">second approver.</em>
          </h1>
          <p className="text-13 text-ink-2 mt-1">
            FATF four-eyes principle - every STR / freeze / decline / EDD-uplift / escalation
            requires a second operator's approval. Initiator cannot self-approve.
          </p>
        </div>

        <div className="bg-bg-panel border border-hair-2 rounded-xl p-4 mb-6">
          <label className="block text-11 font-semibold uppercase tracking-wide-3 text-ink-2 mb-1">
            Your operator name
          </label>
          <input
            value={operatorName}
            onChange={(e) => persistOperator(e.target.value)}
            placeholder="e.g. fmejia or mlro@firm.com"
            className="w-full px-2.5 py-1.5 text-13 border border-hair-2 rounded bg-bg-1 text-ink-0 focus:outline-none focus:border-brand"
          />
          {!canApprove && (
            <p className="text-10 text-amber mt-1.5">
              Your role is "{role}". Only MLRO / deputy MLRO / compliance head can approve.
            </p>
          )}
        </div>

        {error && (
          <div className="bg-red-dim border border-red/30 rounded-lg p-3 text-12 text-red mb-4">
            {error}
          </div>
        )}

        <section className="mb-8">
          <div className="text-11 font-semibold uppercase tracking-wide-3 text-ink-2 mb-3">
            Pending ({pending.length}){loading ? " · refreshing…" : ""}
          </div>
          {pending.length === 0 ? (
            <div className="text-12 text-ink-3 italic border border-hair-2 rounded-xl p-6 text-center">
              Nothing awaiting approval.
            </div>
          ) : (
            <ul className="space-y-3">
              {pending.map((it) => {
                const isOwn = it.initiatedBy === operatorName.trim();
                return (
                  <li key={it.id} className="border border-amber/30 bg-amber-dim/30 rounded-xl p-4">
                    <div className="flex items-start justify-between mb-2 gap-3">
                      <div className="min-w-0 flex-1">
                        <div className="text-13 font-semibold text-ink-0">{it.subjectName}</div>
                        <div className="text-11 text-ink-2 font-mono">{it.subjectId} · {ACTION_LABEL[it.action]}</div>
                      </div>
                      <span className={`text-10 font-bold uppercase px-2 py-0.5 rounded border ${STATUS_TONE[it.status]}`}>
                        {it.status}
                      </span>
                    </div>
                    {it.reason && (
                      <p className="text-12 text-ink-1 leading-relaxed mb-2">{it.reason}</p>
                    )}
                    <div className="text-10 text-ink-3 font-mono mb-3">
                      Initiated by {it.initiatedBy} · {fmt(it.initiatedAt)}
                    </div>
                    {isOwn && (
                      <div className="text-10 text-amber italic mb-2">
                        You initiated this item; FATF four-eyes requires a different operator to approve.
                      </div>
                    )}
                    <div className="flex gap-2 flex-wrap">
                      <button
                        type="button"
                        disabled={!canApprove || isOwn || !operatorName.trim()}
                        onClick={() => { void decide(it.id, "approve"); }}
                        className="px-3 py-1.5 text-12 font-semibold rounded bg-green text-white disabled:opacity-40 disabled:cursor-not-allowed hover:opacity-90"
                      >
                        Approve
                      </button>
                      <button
                        type="button"
                        disabled={!canApprove || isOwn || !operatorName.trim()}
                        onClick={() => setDecisionDraft({ id: it.id, reason: "" })}
                        className="px-3 py-1.5 text-12 font-medium border border-red/30 text-red rounded bg-red-dim disabled:opacity-40 disabled:cursor-not-allowed hover:bg-red hover:text-white"
                      >
                        Reject
                      </button>
                      {it.contextUrl && (
                        <a
                          href={it.contextUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="px-3 py-1.5 text-12 font-medium border border-hair-2 rounded text-ink-1 hover:text-brand hover:border-brand"
                        >
                          Open context
                        </a>
                      )}
                    </div>
                    {decisionDraft?.id === it.id && (
                      <div className="mt-3 p-3 bg-bg-1 border border-red/30 rounded">
                        <label className="block text-10 uppercase tracking-wide-3 text-ink-3 mb-1">Rejection reason (audit chain)</label>
                        <textarea
                          autoFocus
                          value={decisionDraft.reason}
                          onChange={(e) => setDecisionDraft({ id: it.id, reason: e.target.value })}
                          rows={2}
                          className="w-full px-2 py-1 text-12 border border-hair-2 rounded bg-bg-panel text-ink-0 resize-none"
                        />
                        <div className="flex justify-end gap-2 mt-1.5">
                          <button type="button" onClick={() => setDecisionDraft(null)} className="text-11 text-ink-3 px-2 py-1">Cancel</button>
                          <button
                            type="button"
                            disabled={!decisionDraft.reason.trim()}
                            onClick={() => { void decide(it.id, "reject", decisionDraft.reason.trim()); }}
                            className="text-11 font-semibold text-red px-2 py-1 disabled:opacity-40"
                          >
                            Confirm reject
                          </button>
                        </div>
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </section>

        <section>
          <div className="text-11 font-semibold uppercase tracking-wide-3 text-ink-2 mb-3">
            Decided ({decided.length})
          </div>
          {decided.length === 0 ? (
            <div className="text-12 text-ink-3 italic">No decisions logged.</div>
          ) : (
            <ul className="space-y-2">
              {decided.map((it) => (
                <li key={it.id} className="border border-hair-2 rounded-lg p-3 flex items-start gap-3 text-12">
                  <span className={`text-10 font-bold uppercase px-1.5 py-px rounded shrink-0 ${STATUS_TONE[it.status]}`}>
                    {it.status}
                  </span>
                  <div className="flex-1 min-w-0">
                    <div className="text-ink-0 font-medium">{it.subjectName} · {ACTION_LABEL[it.action]}</div>
                    <div className="text-10 text-ink-3 font-mono">
                      {it.subjectId} · initiated by {it.initiatedBy} · {fmt(it.initiatedAt)}
                      {it.approvedBy && ` · approved by ${it.approvedBy} ${fmt(it.approvedAt!)}`}
                      {it.rejectedBy && ` · rejected by ${it.rejectedBy} ${fmt(it.rejectedAt!)}`}
                    </div>
                    {it.rejectionReason && (
                      <div className="text-11 text-red mt-1">Reason: {it.rejectionReason}</div>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>
      </main>
    </>
  );
}

