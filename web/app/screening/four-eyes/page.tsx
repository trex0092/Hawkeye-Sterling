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
  asanaTaskUrl?: string;
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

const CACHED_NAME_KEY = "hawkeye.four-eyes-operator";

function loadCachedName(): string {
  if (typeof window === "undefined") return "";
  return window.localStorage.getItem(CACHED_NAME_KEY) ?? "";
}

function saveCachedName(name: string) {
  try { window.localStorage.setItem(CACHED_NAME_KEY, name); }
  catch (err) { console.warn("[hawkeye] four-eyes cached-name persist failed:", err); }
}

interface SigningDraft {
  id: string;
  action: "approve" | "reject";
  name: string;
  reason: string;
}

export default function FourEyesPage() {
  const [items, setItems] = useState<FourEyesItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [signingDraft, setSigningDraft] = useState<SigningDraft | null>(null);
  const [lastAsanaUrl, setLastAsanaUrl] = useState<string | null>(null);

  const refresh = async () => {
    setLoading(true);
    const res = await fetchJson<ListResponse>("/api/four-eyes", { label: "Four-eyes load failed" });
    setLoading(false);
    if (!res.ok || !res.data?.ok) { setError(res.error ?? "load failed"); return; }
    setError(null);
    setItems(res.data.items ?? []);
  };

  useEffect(() => { void refresh(); }, []);

  const openSigning = (id: string, action: "approve" | "reject") => {
    setError(null);
    setLastAsanaUrl(null);
    setSigningDraft({ id, action, name: loadCachedName(), reason: "" });
  };

  const decide = async () => {
    if (!signingDraft) return;
    const { id, action, name, reason } = signingDraft;
    if (!name.trim()) { setError("Enter your name to sign."); return; }
    if (action === "reject" && !reason.trim()) { setError("Add a rejection reason."); return; }

    saveCachedName(name.trim());

    const body: Record<string, unknown> = { decision: action, operator: name.trim() };
    if (action === "reject") body.rejectionReason = reason.trim();

    const res = await fetchJson<PatchResponse>(`/api/four-eyes?id=${encodeURIComponent(id)}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
      label: "Four-eyes decision failed",
    });

    if (!res.ok || !res.data?.ok) { setError(res.error ?? "decision failed"); return; }

    const item = res.data.item;
    if (item) {
      writeAuditEvent(
        name.trim(),
        action === "approve" ? "four-eyes.approved" : "four-eyes.rejected",
        `${item.subjectName} (${item.subjectId}) — ${ACTION_LABEL[item.action]}`,
      );
    }
    if (res.data.asanaTaskUrl) setLastAsanaUrl(res.data.asanaTaskUrl);

    setSigningDraft(null);
    setError(null);
    void refresh();
  };

  const pending = items.filter((i) => i.status === "pending");
  const decided = items.filter((i) => i.status !== "pending");
  const role = typeof window !== "undefined" ? loadOperatorRole() : "analyst";
  const canApprove = role === "mlro" || role === "managing_director" || role === "co";

  return (
    <>
      <Header />
      <main className="max-w-5xl mx-auto px-10 py-8">
        <div className="mb-6">
          <div className="font-mono text-10 font-semibold text-amber tracking-wide-4 uppercase mb-1">MODULE 48</div>
          <div className="flex items-center gap-1.5 font-mono text-11 tracking-wide-8 uppercase text-ink-2 mb-2">
            <span className="w-1.5 h-1.5 rounded-full bg-brand shrink-0 shadow-[0_0_6px_var(--brand)] opacity-80" />
            BUREAU II · FOUR-EYES QUEUE
          </div>
          <h1 className="font-display font-normal text-32 text-ink-0 leading-tight">
            Awaiting <em className="italic text-brand">second approver.</em>
          </h1>
          <p className="text-13 text-ink-2 mt-1">
            FATF four-eyes principle — every STR / freeze / decline / EDD-uplift / escalation
            requires a second operator&apos;s sign-off. Initiator cannot self-approve.
          </p>
        </div>

        {!canApprove && (
          <div className="bg-amber-dim border border-amber/30 rounded-lg p-3 text-12 text-amber mb-4">
            Your role is &quot;{role}&quot;. Only MLRO / deputy MLRO / compliance head can approve.
          </div>
        )}

        {error && (
          <div className="bg-red-dim border border-red/30 rounded-lg p-3 text-12 text-red mb-4">{error}</div>
        )}

        {lastAsanaUrl && (
          <div className="bg-green-dim border border-green/30 rounded-lg p-3 text-12 text-green mb-4 flex items-center justify-between gap-3">
            <span>Decision recorded and reported to Asana.</span>
            <a href={lastAsanaUrl} target="_blank" rel="noopener noreferrer"
              className="text-11 font-semibold underline shrink-0">
              Open task →
            </a>
          </div>
        )}

        {/* Pending items */}
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
                const isOwn = it.initiatedBy === signingDraft?.name?.trim();
                const isSigningThis = signingDraft?.id === it.id;
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

                    {!isSigningThis && (
                      <div className="flex gap-2 flex-wrap">
                        <button
                          type="button"
                          disabled={!canApprove}
                          onClick={() => openSigning(it.id, "approve")}
                          className="px-3 py-1.5 text-12 font-semibold rounded bg-green text-white disabled:opacity-40 disabled:cursor-not-allowed hover:opacity-90"
                        >
                          Approve
                        </button>
                        <button
                          type="button"
                          disabled={!canApprove}
                          onClick={() => openSigning(it.id, "reject")}
                          className="px-3 py-1.5 text-12 font-medium border border-red/30 text-red rounded bg-red-dim disabled:opacity-40 disabled:cursor-not-allowed hover:bg-red hover:text-white"
                        >
                          Reject
                        </button>
                        {it.contextUrl && (
                          <a href={it.contextUrl} target="_blank" rel="noopener noreferrer"
                            className="px-3 py-1.5 text-12 font-medium border border-hair-2 rounded text-ink-1 hover:text-brand hover:border-brand">
                            Open context
                          </a>
                        )}
                      </div>
                    )}

                    {/* Inline signing panel */}
                    {isSigningThis && signingDraft && (
                      <div className={`mt-3 p-4 rounded-lg border ${
                        signingDraft.action === "approve"
                          ? "bg-green-dim/40 border-green/30"
                          : "bg-red-dim/40 border-red/30"
                      }`}>
                        <div className="text-11 font-semibold uppercase tracking-wide-3 text-ink-2 mb-3">
                          {signingDraft.action === "approve" ? "✓ Sign approval" : "✕ Sign rejection"}
                        </div>

                        <div className="mb-3">
                          <label className="block text-10 uppercase tracking-wide-3 text-ink-3 mb-1">
                            Your full name
                          </label>
                          <input
                            autoFocus
                            value={signingDraft.name}
                            onChange={(e) => setSigningDraft({ ...signingDraft, name: e.target.value })}
                            placeholder="e.g. Luisa Fernanda or mlro@firm.com"
                            className="w-full px-2.5 py-1.5 text-13 border border-hair-2 rounded bg-bg-1 text-ink-0 focus:outline-none focus:border-brand"
                          />
                        </div>

                        {signingDraft.action === "reject" && (
                          <div className="mb-3">
                            <label className="block text-10 uppercase tracking-wide-3 text-ink-3 mb-1">
                              Rejection reason (audit chain)
                            </label>
                            <textarea
                              value={signingDraft.reason}
                              onChange={(e) => setSigningDraft({ ...signingDraft, reason: e.target.value })}
                              rows={2}
                              placeholder="Explain why this action is being rejected…"
                              className="w-full px-2 py-1 text-12 border border-hair-2 rounded bg-bg-panel text-ink-0 resize-none"
                            />
                          </div>
                        )}

                        {isOwn && (
                          <div className="text-10 text-amber italic mb-2">
                            This name matches the initiator — FATF four-eyes requires a different operator.
                          </div>
                        )}

                        <div className="flex gap-2 justify-end">
                          <button
                            type="button"
                            onClick={() => { setSigningDraft(null); setError(null); }}
                            className="text-12 text-ink-3 px-3 py-1.5 border border-hair-2 rounded hover:text-ink-0"
                          >
                            Cancel
                          </button>
                          <button
                            type="button"
                            onClick={() => { void decide(); }}
                            disabled={!signingDraft.name.trim() || (signingDraft.action === "reject" && !signingDraft.reason.trim())}
                            className={`text-12 font-semibold px-4 py-1.5 rounded disabled:opacity-40 disabled:cursor-not-allowed ${
                              signingDraft.action === "approve"
                                ? "bg-green text-white hover:opacity-90"
                                : "bg-red text-white hover:opacity-90"
                            }`}
                          >
                            {signingDraft.action === "approve" ? "Confirm approval →" : "Confirm rejection →"}
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

        {/* Decided items */}
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
