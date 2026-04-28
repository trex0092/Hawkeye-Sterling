"use client";

import { useCallback, useEffect, useState } from "react";
import type { RegulatorySource } from "@/lib/regulatorySources";
import type { CheckEvent } from "@/app/api/regulatory-feed/sources/route";

interface SourcesResponse {
  ok: boolean;
  sources: RegulatorySource[];
  recentChecks: CheckEvent[];
  generatedAt?: string;
}

const KIND_LABEL: Record<RegulatorySource["kind"], string> = {
  consolidated_list: "Consolidated list",
  circular: "Circular",
  guidance: "Guidance",
  recommendation_set: "Recommendations",
  directive: "Directive",
  regulation: "Regulation",
  principles: "Principles",
};

const STATUS_CLS: Record<CheckEvent["status"], string> = {
  no_parser: "bg-bg-2 text-ink-2 border-hair-2",
  no_change: "bg-emerald-50 text-emerald-700 border-emerald-300",
  candidate_pending_review: "bg-amber-50 text-amber-700 border-amber-300",
  ingested: "bg-brand-dim text-brand border-brand/40",
  error: "bg-red-100 text-red-700 border-red-300",
};

export function RegulatorySourcesSection() {
  const [sources, setSources] = useState<RegulatorySource[]>([]);
  const [recentChecks, setRecentChecks] = useState<CheckEvent[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/regulatory-feed/sources", { cache: "no-store" });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = (await res.json()) as SourcesResponse;
      setSources(data.sources ?? []);
      setRecentChecks(data.recentChecks ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "load failed");
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const triggerCheck = async (sourceId: string) => {
    setBusy(sourceId);
    setError(null);
    try {
      const res = await fetch("/api/regulatory-feed/sources", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ sourceId, triggeredBy: "ui-manual" }),
      });
      const data = (await res.json()) as { ok: boolean; recentChecks?: CheckEvent[]; error?: string };
      if (!data.ok) throw new Error(data.error ?? `HTTP ${res.status}`);
      setRecentChecks(data.recentChecks ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "check failed");
    } finally {
      setBusy(null);
    }
  };

  const lastByCheck = new Map<string, CheckEvent>();
  for (const ev of recentChecks) {
    if (!lastByCheck.has(ev.sourceId)) lastByCheck.set(ev.sourceId, ev);
  }

  return (
    <section className="mt-10 space-y-4">
      <div>
        <h2 className="text-15 font-semibold text-ink-0 mb-1">Brain source registry</h2>
        <p className="text-12 text-ink-2">
          Canonical regulatory sources the brain watches. Trigger a manual check to capture an event.
          Production deployments wire a per-source parser at <code className="font-mono">server/feeds/&lt;sourceId&gt;.ts</code>.
        </p>
      </div>

      {error && (
        <div className="bg-red-dim border border-red/30 rounded p-2 text-12 text-red">
          {error}
        </div>
      )}

      <div className="border border-hair-2 rounded-xl overflow-hidden">
        <table className="w-full text-12">
          <thead className="bg-bg-1 text-ink-2 text-10 uppercase tracking-wide-3">
            <tr>
              <th className="text-left px-3 py-2 font-semibold">Source</th>
              <th className="text-left px-3 py-2 font-semibold">Authority</th>
              <th className="text-left px-3 py-2 font-semibold">Kind</th>
              <th className="text-left px-3 py-2 font-semibold">Cadence</th>
              <th className="text-left px-3 py-2 font-semibold">Last check</th>
              <th className="text-right px-3 py-2 font-semibold">Action</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-hair">
            {sources.map((s) => {
              const last = lastByCheck.get(s.id);
              return (
                <tr key={s.id} className="hover:bg-bg-1/50 transition-colors">
                  <td className="px-3 py-2 align-top">
                    <a
                      href={s.url}
                      target="_blank"
                      rel="noreferrer noopener"
                      className="text-ink-0 font-medium hover:text-brand"
                    >
                      {s.name}
                    </a>
                    <p className="text-11 text-ink-3 mt-0.5">{s.description}</p>
                  </td>
                  <td className="px-3 py-2 text-ink-1 align-top">{s.authority}</td>
                  <td className="px-3 py-2 text-ink-2 align-top">{KIND_LABEL[s.kind]}</td>
                  <td className="px-3 py-2 text-ink-2 align-top capitalize">{s.cadence.replace(/_/g, " ")}</td>
                  <td className="px-3 py-2 align-top">
                    {last ? (
                      <div className="flex items-center gap-1.5">
                        <span className={`text-10 font-semibold uppercase tracking-wide-2 px-1.5 py-0.5 rounded border ${STATUS_CLS[last.status]}`}>
                          {last.status.replace(/_/g, " ")}
                        </span>
                        <span className="text-10 text-ink-3 font-mono">
                          {new Date(last.triggeredAt).toLocaleString()}
                        </span>
                      </div>
                    ) : (
                      <span className="text-10 text-ink-3">never</span>
                    )}
                  </td>
                  <td className="px-3 py-2 text-right align-top">
                    <button
                      type="button"
                      onClick={() => { void triggerCheck(s.id); }}
                      disabled={busy === s.id}
                      className="text-11 px-2 py-1 rounded border border-hair-2 bg-bg-1 text-ink-1 hover:border-brand hover:text-brand disabled:opacity-40 disabled:cursor-not-allowed"
                    >
                      {busy === s.id ? "Checking…" : "Check now"}
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {recentChecks.length > 0 && (
        <div>
          <h3 className="text-12 font-semibold text-ink-1 uppercase tracking-wide-3 mb-2">Recent check events</h3>
          <ul className="space-y-1.5">
            {recentChecks.slice(0, 10).map((ev) => (
              <li key={ev.id} className="text-12 border border-hair-2 rounded p-2 bg-bg-1">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className={`text-10 font-semibold uppercase tracking-wide-2 px-1.5 py-0.5 rounded border ${STATUS_CLS[ev.status]}`}>
                    {ev.status.replace(/_/g, " ")}
                  </span>
                  <span className="text-12 text-ink-0 font-medium">{ev.sourceName}</span>
                  <span className="text-10 text-ink-3 font-mono">
                    {new Date(ev.triggeredAt).toLocaleString()} · by {ev.triggeredBy}
                  </span>
                </div>
                {ev.detail && <p className="text-11 text-ink-2 mt-1">{ev.detail}</p>}
                {ev.candidate && (
                  <div className="mt-2 border-l-2 border-amber pl-2">
                    <div className="text-11 font-medium text-ink-0">{ev.candidate.title}</div>
                    <div className="text-11 text-ink-2 mt-0.5">{ev.candidate.summary}</div>
                    <div className="text-11 text-ink-1 mt-1">
                      <span className="font-semibold">Proposed delta:</span> {ev.candidate.proposedDelta}
                    </div>
                  </div>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}
