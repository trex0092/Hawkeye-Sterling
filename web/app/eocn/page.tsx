"use client";

import { useState, useEffect, useMemo, useCallback, Fragment } from "react";
import { ModuleHero, ModuleLayout } from "@/components/layout/ModuleLayout";
import { RowActions } from "@/components/shared/RowActions";
import {
  fixturePayload,
  type EocnFeedPayload,
  type ListUpdate as SharedListUpdate,
  type EocnMatch as SharedEocnMatch,
  type ListUpdateStatus,
  type MatchDisposition,
} from "@/lib/data/eocn-fixture";

// EOCN — Executive Office for Control & Non-Proliferation (UAE).
// Maintains the UAE consolidated Targeted Financial Sanctions (TFS) list.
// All regulated entities must screen against EOCN list within 24h of update
// and freeze assets / file goAML on any confirmed match.

type ListUpdate = SharedListUpdate;
type EocnMatch = SharedEocnMatch;


const UPDATE_STATUS_TONE: Record<ListUpdateStatus, string> = {
  applied: "bg-green-dim text-green",
  pending: "bg-amber-dim text-amber",
  failed: "bg-red-dim text-red",
};

const DISPOSITION_TONE: Record<MatchDisposition, string> = {
  "false-positive": "bg-bg-2 text-ink-2",
  confirmed: "bg-red-dim text-red",
  "under-review": "bg-amber-dim text-amber",
  escalated: "bg-violet-dim text-violet",
};

const DISPOSITION_LABEL: Record<MatchDisposition, string> = {
  "false-positive": "False positive",
  confirmed: "Confirmed match",
  "under-review": "Under review",
  escalated: "Escalated",
};

// Annual declarations tab removed — the operator already files them
// directly to EOCN out-of-band; the tab was a static placeholder.
type Tab = "list-updates" | "matches";

const EOCN_DELETED_KEY = "hawkeye.eocn.matches.deleted.v1";
const EOCN_CUSTOM_KEY = "hawkeye.eocn.matches.custom.v1";

type MatchEditDraft = Pick<EocnMatch, "disposition" | "notes" | "goAmlRef" | "mlroSignedOff">;

export default function EocnPage() {
  const [tab, setTab] = useState<Tab>("list-updates");
  // Currently-expanded list-update row id. Clicking a row toggles its
  // detail panel (full notes + version + sync timestamps + "View on
  // EOCN" button when sourceUrl is present). Single-row open at a
  // time keeps the table readable.
  const [expandedUpdateId, setExpandedUpdateId] = useState<string | null>(null);
  const [deletedMatchIds, setDeletedMatchIds] = useState<string[]>([]);
  const [customMatches, setCustomMatches] = useState<EocnMatch[]>([]);
  const [editingMatchId, setEditingMatchId] = useState<string | null>(null);
  const [editMatchDraft, setEditMatchDraft] = useState<MatchEditDraft>({ disposition: "under-review", notes: "", goAmlRef: "", mlroSignedOff: false });
  const [refreshing, setRefreshing] = useState(false);
  const [lastRefreshed, setLastRefreshed] = useState<Date | null>(null);
  // Live-feed payload, initialized from the bundled fixture so the
  // page renders instantly on first load. Replaced by GET
  // /api/eocn-list-updates on mount and by POST on operator refresh.
  const [feed, setFeed] = useState<EocnFeedPayload>(() => fixturePayload());
  const LIST_UPDATES = feed.listUpdates;
  const MATCHES = feed.matches;
  const DECLARATIONS = feed.declarations;

  // Pull the latest snapshot from the API on mount. Best-effort — if
  // the fetch fails the fixture stays in place.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const r = await fetch("/api/eocn-list-updates", {
          method: "GET",
          headers: { accept: "application/json" },
        });
        if (!r.ok) return;
        const next = (await r.json()) as EocnFeedPayload;
        if (!cancelled && next?.listUpdates?.length) {
          setFeed(next);
          if (next.lastSyncedAt && next.lastSyncedAt !== new Date(0).toISOString()) {
            setLastRefreshed(new Date(next.lastSyncedAt));
          }
        }
      } catch (err) {
        console.warn("[hawkeye] eocn-list-updates GET threw — using fixture fallback:", err);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      // POST triggers an upstream re-fetch when EOCN_FEED_URL is
      // configured; otherwise the route returns the fixture but
      // updates the lastSyncedAt timestamp so operators see fresh
      // sync metadata.
      const r = await fetch("/api/eocn-list-updates", {
        method: "POST",
        headers: { accept: "application/json", "content-type": "application/json" },
        body: "{}",
      });
      if (r.ok || r.status === 502) {
        const next = (await r.json()) as EocnFeedPayload;
        if (next?.listUpdates?.length) {
          setFeed(next);
        }
      }
      setLastRefreshed(new Date());
    } catch (err) {
      console.error("[hawkeye] eocn-list-updates POST threw — refresh failed, keeping last-known data:", err);
    } finally {
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(EOCN_DELETED_KEY);
      if (raw) setDeletedMatchIds(JSON.parse(raw) as string[]);
    } catch (err) {
      console.warn("[hawkeye] eocn deleted-matches localStorage parse failed:", err);
    }
    try {
      const raw2 = localStorage.getItem(EOCN_CUSTOM_KEY);
      if (raw2) setCustomMatches(JSON.parse(raw2) as EocnMatch[]);
    } catch (err) {
      console.warn("[hawkeye] eocn custom-matches localStorage parse failed:", err);
    }
  }, []);

  const deleteMatch = (id: string) => {
    const next = [...deletedMatchIds, id];
    setDeletedMatchIds(next);
    try { localStorage.setItem(EOCN_DELETED_KEY, JSON.stringify(next)); }
    catch (err) { console.warn("[hawkeye] eocn deleted-matches persist failed:", err); }
    // also remove from custom if present
    const nextCustom = customMatches.filter((m) => m.id !== id);
    setCustomMatches(nextCustom);
    try { localStorage.setItem(EOCN_CUSTOM_KEY, JSON.stringify(nextCustom)); }
    catch (err) { console.warn("[hawkeye] eocn custom-matches persist failed:", err); }
  };

  const restoreMatches = () => {
    setDeletedMatchIds([]);
    setCustomMatches([]);
    try { localStorage.removeItem(EOCN_DELETED_KEY); }
    catch (err) { console.warn("[hawkeye] eocn deleted-matches removeItem failed:", err); }
    try { localStorage.removeItem(EOCN_CUSTOM_KEY); }
    catch (err) { console.warn("[hawkeye] eocn custom-matches removeItem failed:", err); }
  };

  const startEditMatch = (m: EocnMatch) => {
    setEditingMatchId(m.id);
    setEditMatchDraft({ disposition: m.disposition, notes: m.notes, goAmlRef: m.goAmlRef ?? "", mlroSignedOff: m.mlroSignedOff });
  };

  const saveMatchEdit = (m: EocnMatch) => {
    const patched: EocnMatch = { ...m, ...editMatchDraft };
    // remove original from seed (via deletedIds) and upsert in custom
    const newDeleted = deletedMatchIds.includes(m.id) ? deletedMatchIds : [...deletedMatchIds, m.id];
    setDeletedMatchIds(newDeleted);
    try { localStorage.setItem(EOCN_DELETED_KEY, JSON.stringify(newDeleted)); } catch { /* ignore */ }
    const nextCustom = [...customMatches.filter((c) => c.id !== m.id), patched];
    setCustomMatches(nextCustom);
    try { localStorage.setItem(EOCN_CUSTOM_KEY, JSON.stringify(nextCustom)); } catch { /* ignore */ }
    setEditingMatchId(null);
  };

  const liveMatches = useMemo(
    () => [...MATCHES.filter((m) => !deletedMatchIds.includes(m.id)), ...customMatches.filter((m) => !deletedMatchIds.includes(m.id))],
    [deletedMatchIds, customMatches],
  );

  const pendingScreening = LIST_UPDATES.filter((u) => u.screeningStatus === "pending").length;
  const openMatches = liveMatches.filter((m) => m.disposition === "under-review" || m.disposition === "escalated").length;
  const confirmedMatches = liveMatches.filter((m) => m.disposition === "confirmed").length;
  const overdue = DECLARATIONS.filter((d) => d.status === "overdue").length;
  const lastUpdate = LIST_UPDATES[0];

  return (
    <ModuleLayout asanaModule="eocn" asanaLabel="EOCN Trade Compliance" engineLabel="EOCN sanctions engine">
      <ModuleHero
        moduleNumber={24}
        eyebrow="Module 27 · Sanctions"
        title="EOCN targeted financial"
        titleEm="sanctions."
        intro={
          <>
            <strong>Executive Office for Control & Non-Proliferation — UAE consolidated TFS list.</strong>{" "}
            All regulated entities must screen against the EOCN list within 24 hours of each update.
            Asset freeze and goAML filing are mandatory on confirmed match. Annual responsible-sourcing
            declaration covers all upstream smelters and refiners with LBMA / RJC chain-of-custody certificates.
          </>
        }
        kpis={[
          { value: lastUpdate ? lastUpdate.version.split("v")[1] ?? "—" : "—", label: "list version" },
          { value: String(pendingScreening), label: "re-screens pending", tone: pendingScreening > 0 ? "amber" : undefined },
          { value: String(openMatches), label: "open matches", tone: openMatches > 0 ? "red" : undefined },
          { value: String(confirmedMatches), label: "confirmed matches", tone: confirmedMatches > 0 ? "red" : undefined },
          { value: String(overdue), label: "declarations overdue", tone: overdue > 0 ? "red" : undefined },
        ]}
      />

      {/* Tabs */}
      <div className="flex items-end gap-1 mb-6 border-b border-hair-2">
        {([
          { key: "list-updates" as Tab, label: "List updates" },
          { key: "matches" as Tab, label: "Matches & dispositions" },
        ]).map((t) => (
          <button
            key={t.key}
            type="button"
            onClick={() => setTab(t.key)}
            className={`px-4 py-2 text-12 font-medium rounded-t border-b-2 transition-colors whitespace-nowrap ${
              tab === t.key
                ? "border-brand text-brand bg-brand-dim"
                : "border-transparent text-ink-2 hover:text-ink-0 hover:bg-bg-1"
            }`}
          >
            {t.label}
          </button>
        ))}
        <div className="flex-1" />
        <div className="flex items-center gap-2 pb-2">
          {feed.source === "live" && (
            <span
              className="inline-flex items-center px-2 py-px rounded font-mono text-10 font-semibold tracking-wide-2 uppercase bg-green-dim text-green"
              title={`Live feed${feed.upstreamUrl ? ` · ${feed.upstreamUrl}` : ""}`}
            >
              live
            </span>
          )}
          {lastRefreshed && (
            <span className="text-10 font-mono text-ink-3">
              Updated {lastRefreshed.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
            </span>
          )}
          <button
            type="button"
            onClick={handleRefresh}
            disabled={refreshing}
            title="Refresh list"
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded border border-green/40 text-11 font-mono font-semibold text-green bg-green-dim hover:bg-green-dim/70 transition-colors disabled:opacity-50"
          >
            <span className="text-13 leading-none">↻</span>
            <span className="uppercase tracking-wide-2">{refreshing ? "Refreshing…" : "Refresh"}</span>
          </button>
        </div>
      </div>

      {/* LIST UPDATES TAB */}
      {tab === "list-updates" && (
        <div className="flex flex-col gap-3">
          {/* SLA reminder */}
          <div className="bg-blue-dim border border-blue/20 rounded-lg px-4 py-2.5 flex items-center gap-3">
            <span className="text-blue font-mono text-10 font-semibold uppercase">SLA</span>
            <span className="text-12 text-ink-1">
              Full customer re-screen must complete within <strong>24 hours</strong> of each EOCN list update.
              Failed or pending re-screens escalate automatically to MLRO.
            </span>
          </div>

          <div className="bg-bg-panel border border-hair-2 rounded-lg overflow-hidden">
            <table className="w-full text-12">
              <thead className="bg-bg-1 border-b border-hair-2">
                <tr>
                  {["Version", "Date / Time", "Added", "Removed", "Screening status", "Completed at", "Notes"].map((h) => (
                    <th key={h} className="text-left px-3 py-2 text-10 uppercase tracking-wide-3 text-ink-2 font-mono whitespace-nowrap">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {LIST_UPDATES.map((u, i) => {
                  const isExpanded = expandedUpdateId === u.id;
                  const onToggle = (): void =>
                    setExpandedUpdateId(isExpanded ? null : u.id);
                  return (
                    <Fragment key={u.id}>
                      <tr
                        onClick={onToggle}
                        onKeyDown={(e) => {
                          if (e.key === "Enter" || e.key === " ") {
                            e.preventDefault();
                            onToggle();
                          }
                        }}
                        tabIndex={0}
                        role="button"
                        aria-expanded={isExpanded}
                        className={`cursor-pointer hover:bg-bg-2 transition-colors focus:outline-none focus:bg-bg-2 ${
                          i < LIST_UPDATES.length - 1 ? "border-b border-hair" : ""
                        } ${isExpanded ? "bg-bg-2" : ""}`}
                        title="Click to expand"
                      >
                        <td className="px-3 py-2.5 font-mono text-10 text-ink-0">
                          <span className="inline-flex items-center gap-1.5">
                            <span className={`inline-block w-2 text-ink-3 text-9 transition-transform ${isExpanded ? "rotate-90" : ""}`}>▶</span>
                            {u.version}
                          </span>
                        </td>
                        <td className="px-3 py-2.5 font-mono text-10 text-ink-2 whitespace-nowrap">{u.date} {u.time}</td>
                        <td className="px-3 py-2.5 text-center font-mono text-11">
                          {u.deltaAdded > 0 ? <span className="text-red font-semibold">+{u.deltaAdded}</span> : <span className="text-ink-3">—</span>}
                        </td>
                        <td className="px-3 py-2.5 text-center font-mono text-11">
                          {u.deltaRemoved > 0 ? <span className="text-green font-semibold">-{u.deltaRemoved}</span> : <span className="text-ink-3">—</span>}
                        </td>
                        <td className="px-3 py-2.5">
                          <span className={`inline-flex items-center px-1.5 py-px rounded-sm font-mono text-10 font-semibold uppercase ${UPDATE_STATUS_TONE[u.screeningStatus]}`}>
                            {u.screeningStatus}
                          </span>
                        </td>
                        <td className="px-3 py-2.5 font-mono text-10 text-ink-3 whitespace-nowrap">{u.screeningCompletedAt ?? "—"}</td>
                        <td className="px-3 py-2.5 text-11 text-ink-2 max-w-[220px] truncate" title={u.notes}>{u.notes}</td>
                      </tr>
                      {isExpanded && (
                        <tr className={i < LIST_UPDATES.length - 1 ? "border-b border-hair" : ""}>
                          <td colSpan={7} className="px-4 py-3 bg-bg-1">
                            <div className="grid grid-cols-1 md:grid-cols-2 md:grid-cols-3 gap-3 mb-3">
                              <DetailField label="Version" value={u.version} mono />
                              <DetailField label="Published" value={`${u.date} ${u.time} UTC`} mono />
                              <DetailField label="Re-screen completed" value={u.screeningCompletedAt ?? "—"} mono />
                              <DetailField
                                label="Net change"
                                value={`+${u.deltaAdded} added · -${u.deltaRemoved} removed`}
                                mono
                              />
                              <DetailField
                                label="Status"
                                value={u.screeningStatus.toUpperCase()}
                              />
                              <DetailField label="Update ID" value={u.id} mono />
                            </div>
                            <div className="bg-bg-panel border border-hair-2 rounded p-3 mb-3">
                              <div className="text-9 font-semibold uppercase tracking-wide-3 text-ink-3 mb-1">
                                Notes
                              </div>
                              <div className="text-12 text-ink-0 leading-relaxed">{u.notes}</div>
                            </div>
                            <DesignatedNamesPanel update={u} />
                            <div className="flex items-center gap-2 flex-wrap">
                              {u.sourceUrl ? (
                                <a
                                  href={u.sourceUrl}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded border border-brand/40 bg-brand-dim text-brand hover:border-brand/70 text-11 font-medium transition-colors"
                                >
                                  View on EOCN ↗
                                </a>
                              ) : (
                                <span className="inline-flex items-center px-3 py-1.5 rounded border border-hair-2 text-11 text-ink-3">
                                  No source URL — fixture entry. Set EOCN_FEED_URL to populate from live source.
                                </span>
                              )}
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setExpandedUpdateId(null);
                                }}
                                className="inline-flex items-center px-3 py-1.5 rounded border border-hair-2 bg-bg-1 hover:bg-bg-2 text-11 text-ink-2 transition-colors"
                              >
                                Close
                              </button>
                            </div>
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* MATCHES TAB */}
      {tab === "matches" && (
        <div className="flex flex-col gap-4">
          {openMatches > 0 && (
            <div className="bg-red-dim border border-red/20 rounded-lg px-4 py-2.5 flex items-center gap-3">
              <span className="text-red font-mono text-10 font-semibold uppercase">Action required</span>
              <span className="text-12 text-ink-1">
                {openMatches} match{openMatches !== 1 ? "es" : ""} require MLRO disposition within 24h of detection.
              </span>
            </div>
          )}


          {liveMatches.map((m) => (
            <div key={m.id} className="relative bg-bg-panel border border-hair-2 rounded-lg p-4">
              <div className="absolute top-2 right-2 z-10">
                <RowActions
                  label={`match ${m.id}`}
                  onEdit={() => startEditMatch(m)}
                  onDelete={() => deleteMatch(m.id)}
                  confirmDelete={false}
                />
              </div>
              {editingMatchId === m.id && (
                <div className="mb-4 bg-bg-1 rounded-lg p-3 border border-brand/30">
                  <div className="text-10 font-semibold uppercase tracking-wide-3 text-ink-2 mb-2">Edit match</div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-2 mb-2">
                    <div>
                      <label className="block text-10 text-ink-3 mb-0.5">Disposition</label>
                      <select value={editMatchDraft.disposition} onChange={(e) => setEditMatchDraft((d) => ({ ...d, disposition: e.target.value as MatchDisposition }))}
                        className="w-full text-12 px-2 py-1 rounded border border-hair-2 bg-bg-0 text-ink-0">
                        <option value="under-review">Under review</option>
                        <option value="confirmed">Confirmed match</option>
                        <option value="false-positive">False positive</option>
                        <option value="escalated">Escalated</option>
                      </select>
                    </div>
                    <div>
                      <label className="block text-10 text-ink-3 mb-0.5">goAML Ref</label>
                      <input value={editMatchDraft.goAmlRef} onChange={(e) => setEditMatchDraft((d) => ({ ...d, goAmlRef: e.target.value }))}
                        placeholder="goAML-STR-..." className="w-full text-12 px-2 py-1 rounded border border-hair-2 bg-bg-0 text-ink-0 font-mono" />
                    </div>
                  </div>
                  <div className="mb-2">
                    <label className="block text-10 text-ink-3 mb-0.5">Notes</label>
                    <textarea value={editMatchDraft.notes} onChange={(e) => setEditMatchDraft((d) => ({ ...d, notes: e.target.value }))} rows={2}
                      className="w-full text-12 px-2 py-1.5 rounded border border-hair-2 bg-bg-0 text-ink-0" />
                  </div>
                  <div className="flex items-center gap-3">
                    <label className="flex items-center gap-1.5 text-12 text-ink-1 cursor-pointer">
                      <input type="checkbox" className="accent-brand" checked={editMatchDraft.mlroSignedOff}
                        onChange={(e) => setEditMatchDraft((d) => ({ ...d, mlroSignedOff: e.target.checked }))} />
                      MLRO signed off
                    </label>
                    <button type="button" onClick={() => saveMatchEdit(m)} className="text-11 font-semibold px-3 py-1 rounded bg-ink-0 text-bg-0">✓</button>
                    <button type="button" onClick={() => setEditingMatchId(null)} className="text-11 font-medium px-3 py-1 rounded text-red">✕</button>
                  </div>
                </div>
              )}
              <div className="flex items-start justify-between gap-3 mb-3 pr-6">
                <div>
                  <div className="font-mono text-10 text-ink-3">{m.id}</div>
                  <div className="text-14 font-semibold text-ink-0 mt-0.5">{m.subject}</div>
                  <div className="text-11 text-ink-2 mt-0.5">
                    Screened {m.screenedAt} · List version {m.listVersion}
                  </div>
                </div>
                <div className="flex flex-col items-end gap-1.5 shrink-0">
                  <span className={`inline-flex items-center px-2 py-0.5 rounded font-mono text-10 font-semibold uppercase ${DISPOSITION_TONE[m.disposition]}`}>
                    {DISPOSITION_LABEL[m.disposition]}
                  </span>
                  <div className="flex items-center gap-1.5">
                    <span className="text-10 text-ink-3">Match score</span>
                    <span className={`font-mono text-13 font-bold ${m.matchScore >= 95 ? "text-red" : m.matchScore >= 85 ? "text-amber" : "text-ink-0"}`}>
                      {m.matchScore}%
                    </span>
                  </div>
                </div>
              </div>

              <div className="bg-bg-1 rounded p-2.5 mb-3 text-12">
                <div className="text-10 font-mono uppercase tracking-wide-3 text-ink-3 mb-0.5">List entry</div>
                <div className="text-ink-0">{m.listEntry}</div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-3 text-12">
                <div className="bg-bg-1 rounded p-2">
                  <div className="text-10 font-mono uppercase tracking-wide-3 text-ink-3 mb-0.5">MLRO sign-off</div>
                  <div className={m.mlroSignedOff ? "text-green font-semibold" : "text-amber font-semibold"}>
                    {m.mlroSignedOff ? "✓ Signed off" : "Pending"}
                  </div>
                </div>
                <div className="bg-bg-1 rounded p-2">
                  <div className="text-10 font-mono uppercase tracking-wide-3 text-ink-3 mb-0.5">Disposition date</div>
                  <div className="font-mono text-10 text-ink-1">{m.dispositionDate ?? "—"}</div>
                </div>
                <div className="bg-bg-1 rounded p-2">
                  <div className="text-10 font-mono uppercase tracking-wide-3 text-ink-3 mb-0.5">goAML ref</div>
                  <div className="font-mono text-10 text-ink-1">{m.goAmlRef ?? "—"}</div>
                </div>
              </div>

              <div className="text-12 text-ink-2 border-l-2 border-hair-2 pl-3">
                {m.notes}
              </div>

              {(m.disposition === "under-review") && (
                <div className="mt-3 flex gap-2">
                  <button type="button" className="text-11 font-semibold px-3 py-1.5 rounded bg-red text-white hover:bg-red/90">
                    Confirm match — freeze & file goAML
                  </button>
                  <button type="button" className="text-11 font-semibold px-3 py-1.5 rounded border border-hair-2 text-ink-1 hover:bg-bg-2">
                    Confirm false positive
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

    </ModuleLayout>
  );
}

// Designated-names panel — operator can review the names embedded in
// an EOCN announcement and screen them against the customer base in
// one click. Names are seeded from the announcement's
// `designatedNames` field (when the parser extracted them) and stored
// in localStorage keyed by update id, so manual entries persist
// across page reloads without round-tripping through the server.
function DesignatedNamesPanel({ update }: { update: ListUpdate }): JSX.Element {
  const STORAGE_KEY = `hawkeye.eocn.names.v1.${update.id}`;
  const seedNames = useMemo(
    () => update.designatedNames ?? [],
    [update.designatedNames],
  );
  const [text, setText] = useState<string>(() => {
    if (typeof window === "undefined") return seedNames.join("\n");
    try {
      const stored = window.localStorage.getItem(STORAGE_KEY);
      if (stored != null) return stored;
    } catch { /* ignore */ }
    return seedNames.join("\n");
  });
  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      window.localStorage.setItem(STORAGE_KEY, text);
    } catch { /* ignore quota / disabled */ }
  }, [text, STORAGE_KEY]);

  const names = useMemo(
    () =>
      text
        .split(/[\n;|,]+/)
        .map((s) => s.trim())
        .filter((s) => s.length > 0),
    [text],
  );

  const handleScreen = useCallback(() => {
    if (names.length === 0) return;
    const namesParam = encodeURIComponent(names.join("\n"));
    const sourceParam = encodeURIComponent(`EOCN-${update.id}`);
    window.location.href = `/batch?names=${namesParam}&source=${sourceParam}`;
  }, [names, update.id]);

  return (
    <div className="bg-bg-panel border border-hair-2 rounded p-3 mb-3">
      <div className="flex items-center justify-between mb-1.5 gap-2 flex-wrap">
        <div className="text-9 font-semibold uppercase tracking-wide-3 text-ink-3">
          Designated names ({names.length})
        </div>
        {names.length > 0 && (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              handleScreen();
            }}
            className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded border border-brand/50 bg-brand text-white hover:bg-brand-hover text-10 font-semibold uppercase tracking-wide-2 transition-colors"
            title={`Run a batch screening of ${names.length} name(s) against the live customer base. Any coincidence (fuzzy or exact) will surface in the results.`}
          >
            ⚡ Screen vs customers
          </button>
        )}
      </div>
      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        onClick={(e) => e.stopPropagation()}
        placeholder="Paste one name per line (or separate with comma / semicolon). Names persist locally per update."
        rows={Math.min(8, Math.max(3, names.length + 1))}
        className="w-full rounded border border-hair-2 bg-bg-1 px-2 py-1.5 text-11 text-ink-0 placeholder:text-ink-3 font-mono leading-relaxed resize-y"
      />
      {names.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1">
          {names.slice(0, 30).map((n) => (
            <span
              key={n}
              className="inline-flex items-center px-1.5 py-px rounded-sm font-mono text-10 bg-violet-dim text-violet"
            >
              {n}
            </span>
          ))}
          {names.length > 30 && (
            <span className="inline-flex items-center px-1.5 py-px rounded-sm font-mono text-10 text-ink-3">
              …+{names.length - 30} more
            </span>
          )}
        </div>
      )}
    </div>
  );
}

// Small label/value cell for the expanded list-update detail panel.
// Mono optionally renders the value in monospace for IDs / dates /
// version strings.
function DetailField({
  label,
  value,
  mono,
}: {
  label: string;
  value: string;
  mono?: boolean;
}): JSX.Element {
  return (
    <div>
      <div className="text-9 font-semibold uppercase tracking-wide-3 text-ink-3 mb-0.5">
        {label}
      </div>
      <div
        className={`text-11 text-ink-0 ${mono ? "font-mono" : ""}`}
      >
        {value}
      </div>
    </div>
  );
}
