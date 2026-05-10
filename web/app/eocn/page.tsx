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
import type { EocnRegistrationRecord } from "@/app/api/eocn-registration/route";

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
type Tab = "registration" | "list-updates" | "matches" | "control-list";

const EOCN_DELETED_KEY = "hawkeye.eocn.matches.deleted.v1";
const EOCN_CUSTOM_KEY = "hawkeye.eocn.matches.custom.v1";

type MatchEditDraft = Pick<EocnMatch, "disposition" | "notes" | "goAmlRef" | "mlroSignedOff">;

export default function EocnPage() {
  const [tab, setTab] = useState<Tab>("registration");
  // Currently-expanded list-update row id. Clicking a row toggles its
  // detail panel (full notes + version + sync timestamps + "View on
  // EOCN" button when sourceUrl is present). Single-row open at a
  // time keeps the table readable.
  const [expandedUpdateId, setExpandedUpdateId] = useState<string | null>(null);
  const [deletedMatchIds, setDeletedMatchIds] = useState<string[]>([]);
  // NAS / ARS registration state
  const [registration, setRegistration] = useState<EocnRegistrationRecord | null>(null);
  const [regSaving, setRegSaving] = useState(false);
  // Control list state
  const [controlListLastSync, setControlListLastSync] = useState<string | null>(null);
  const [controlListCount, setControlListCount] = useState<number | null>(null);
  const [customMatches, setCustomMatches] = useState<EocnMatch[]>([]);
  const [editingMatchId, setEditingMatchId] = useState<string | null>(null);
  const [editMatchDraft, setEditMatchDraft] = useState<MatchEditDraft>({ disposition: "under-review", notes: "", goAmlRef: "", mlroSignedOff: false });
  const [refreshing, setRefreshing] = useState(false);
  const [lastRefreshed, setLastRefreshed] = useState<Date | null>(null);
  const [fetchError, setFetchError] = useState<string | null>(null);
  // Live-feed payload, initialized from the bundled fixture so the
  // page renders instantly on first load. Replaced by GET
  // /api/eocn-list-updates on mount and by POST on operator refresh.
  const [feed, setFeed] = useState<EocnFeedPayload>(() => fixturePayload());
  const LIST_UPDATES = feed.listUpdates;
  const MATCHES = feed.matches;
  const DECLARATIONS = feed.declarations;

  // Load NAS/ARS registration and control-list metadata on mount.
  useEffect(() => {
    (async () => {
      try {
        const r = await fetch("/api/eocn-registration");
        if (r.ok) { const d = (await r.json()) as { ok: boolean; registration: EocnRegistrationRecord }; if (d.ok) setRegistration(d.registration); }
        else { console.warn("[hawkeye] eocn registration fetch failed:", r.status); setFetchError(`Could not load registration data (HTTP ${r.status}).`); }
      } catch (err) { console.warn("[hawkeye] eocn registration fetch failed:", err); setFetchError("Could not load registration data — network error."); }
    })();
    (async () => {
      try {
        const r = await fetch("/api/goods-control-status");
        if (r.ok) { const d = (await r.json()) as { lastSync?: string; count?: number }; setControlListLastSync(d.lastSync ?? null); setControlListCount(d.count ?? null); }
      } catch { /* no goods-control-status endpoint yet — fallback to blob metadata */ }
    })();
  }, []);

  const saveRegistration = async (patch: Partial<EocnRegistrationRecord>) => {
    setRegSaving(true);
    try {
      const r = await fetch("/api/eocn-registration", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(patch) });
      if (r.ok) { const d = (await r.json()) as { ok: boolean; registration: EocnRegistrationRecord }; if (d.ok) setRegistration(d.registration); }
    } finally { setRegSaving(false); }
  };

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
        if (!r.ok) {
          console.warn("[hawkeye] eocn-list-updates GET failed:", r.status);
          setFetchError(`Could not load latest list updates (HTTP ${r.status}) — showing cached data.`);
          return;
        }
        const next = (await r.json()) as EocnFeedPayload;
        if (!cancelled && next?.listUpdates?.length) {
          setFeed(next);
          if (next.lastSyncedAt && next.lastSyncedAt !== new Date(0).toISOString()) {
            setLastRefreshed(new Date(next.lastSyncedAt));
          }
        }
      } catch (err) {
        console.warn("[hawkeye] eocn-list-updates GET threw — using fixture fallback:", err);
        setFetchError("Could not load latest list updates — showing cached data.");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    setFetchError(null);
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
      } else {
        console.error("[hawkeye] eocn-list-updates POST returned", r.status);
        setFetchError(`Refresh failed (HTTP ${r.status}) — showing last-known data.`);
      }
      setLastRefreshed(new Date());
    } catch (err) {
      console.error("[hawkeye] eocn-list-updates POST threw — refresh failed, keeping last-known data:", err);
      setFetchError("Refresh failed — network error. Showing last-known data.");
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
    try { localStorage.setItem(EOCN_DELETED_KEY, JSON.stringify(newDeleted)); }
    catch (err) { console.warn("[hawkeye] eocn deleted-matches persist failed:", err); }
    const nextCustom = [...customMatches.filter((c) => c.id !== m.id), patched];
    setCustomMatches(nextCustom);
    try { localStorage.setItem(EOCN_CUSTOM_KEY, JSON.stringify(nextCustom)); }
    catch (err) { console.warn("[hawkeye] eocn custom-matches persist failed:", err); }
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

      {fetchError && (
        <div className="mt-3 rounded-lg border border-red/30 bg-red-dim px-4 py-3 flex items-start gap-2">
          <span className="text-red text-14 shrink-0">⚠</span>
          <div>
            <p className="text-12 font-semibold text-red">Error</p>
            <p className="text-11 text-ink-2 mt-0.5">{fetchError}</p>
          </div>
        </div>
      )}

      {/* NAS/ARS warning banner — shown when not registered */}
      {registration && (!registration.nas.confirmed || !registration.ars.confirmed) && (
        <div className="mb-4 bg-red-dim border border-red/30 rounded-lg px-4 py-3 flex items-start gap-3">
          <span className="text-red text-16 shrink-0 mt-0.5">⚠</span>
          <div>
            <div className="text-12 font-semibold text-red mb-0.5">EOCN registration incomplete</div>
            <div className="text-11 text-ink-1">
              {!registration.nas.confirmed && <span>NAS (Notification Alert System) not confirmed. </span>}
              {!registration.ars.confirmed && <span>ARS (Automatic Reporting System) not confirmed. </span>}
              Register at <strong>uaeiec.gov.ae</strong> and confirm below. Required for all DNFBPs.
            </div>
          </div>
          <button type="button" onClick={() => setTab("registration")} className="shrink-0 text-11 font-semibold px-3 py-1.5 rounded border border-red/40 text-red hover:bg-red/10">
            Fix →
          </button>
        </div>
      )}

      {/* Tabs */}
      <div className="flex items-end gap-1 mb-6 border-b border-hair-2">
        {([
          { key: "registration" as Tab, label: "⚙ Registration", warn: registration && (!registration.nas.confirmed || !registration.ars.confirmed) },
          { key: "list-updates" as Tab, label: "List updates" },
          { key: "matches" as Tab, label: "Matches & dispositions" },
          { key: "control-list" as Tab, label: "UAE Control List" },
        ]).map((t) => (
          <button
            key={t.key}
            type="button"
            onClick={() => setTab(t.key)}
            className={`relative px-4 py-2 text-12 font-medium rounded-t border-b-2 transition-colors whitespace-nowrap ${
              tab === t.key
                ? "border-brand text-brand bg-brand-dim"
                : "border-transparent text-ink-2 hover:text-ink-0 hover:bg-bg-1"
            }`}
          >
            {t.label}
            {"warn" in t && t.warn && <span className="absolute -top-1 -right-1 w-2 h-2 rounded-full bg-red" />}
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

      {/* REGISTRATION TAB */}
      {tab === "registration" && (
        <div className="space-y-4">
          <div className="bg-amber-dim border border-amber/20 rounded-lg px-4 py-3 text-12 text-ink-1">
            <strong>Manual registration required.</strong> Hawkeye Sterling cannot automate EOCN portal registrations.
            Register at <strong>uaeiec.gov.ae</strong>, then confirm below. Both NAS and ARS are mandatory for all UAE DNFBPs.
          </div>

          {/* NAS */}
          <div className={`bg-bg-panel border rounded-xl p-5 ${registration?.nas.confirmed ? "border-green/30" : "border-red/30"}`}>
            <div className="flex items-center justify-between mb-3">
              <div>
                <div className="text-13 font-semibold text-ink-0">NAS — Notification Alert System</div>
                <div className="text-11 text-ink-3">Real-time email alerts when the UAE TFS list is updated · uaeiec.gov.ae</div>
              </div>
              <span className={`inline-flex items-center px-2.5 py-1 rounded font-mono text-11 font-semibold uppercase ${registration?.nas.confirmed ? "bg-green-dim text-green border border-green/30" : "bg-red-dim text-red border border-red/30"}`}>
                {registration?.nas.confirmed ? "✓ Confirmed" : "Not confirmed"}
              </span>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <div>
                <label className="block text-10 uppercase tracking-wide-3 text-ink-2 font-semibold mb-1">Registration reference</label>
                <input defaultValue={registration?.nas.reference ?? ""} id="nas-ref" className="w-full text-12 px-3 py-1.5 rounded border border-hair-2 bg-bg-panel text-ink-0 focus:border-brand outline-none" placeholder="NAS-XXXX / email confirmation ref" />
              </div>
              <div>
                <label className="block text-10 uppercase tracking-wide-3 text-ink-2 font-semibold mb-1">Registered email address</label>
                <input defaultValue={registration?.nas.email ?? ""} id="nas-email" className="w-full text-12 px-3 py-1.5 rounded border border-hair-2 bg-bg-panel text-ink-0 focus:border-brand outline-none" placeholder="compliance@entity.ae" />
              </div>
              <div>
                <label className="block text-10 uppercase tracking-wide-3 text-ink-2 font-semibold mb-1">Confirmed by</label>
                <input defaultValue={registration?.nas.confirmedBy ?? ""} id="nas-by" className="w-full text-12 px-3 py-1.5 rounded border border-hair-2 bg-bg-panel text-ink-0 focus:border-brand outline-none" placeholder="MLRO name" />
              </div>
            </div>
            <div className="flex items-center gap-3 mt-3">
              <button type="button" disabled={regSaving}
                onClick={() => {
                  const ref = (document.getElementById("nas-ref") as HTMLInputElement)?.value ?? "";
                  const email = (document.getElementById("nas-email") as HTMLInputElement)?.value ?? "";
                  const by = (document.getElementById("nas-by") as HTMLInputElement)?.value ?? "";
                  void saveRegistration({ nas: { confirmed: true, reference: ref, email, confirmedBy: by } });
                }}
                className="text-11 font-semibold px-3 py-1.5 rounded border border-green/40 text-green bg-green-dim hover:bg-green/20 disabled:opacity-50">
                {regSaving ? "Saving…" : "✓ Confirm NAS registration"}
              </button>
              {registration?.nas.confirmedAt && (
                <span className="text-10 text-ink-3 font-mono">Confirmed {new Date(registration.nas.confirmedAt).toLocaleDateString("en-GB")}</span>
              )}
            </div>
          </div>

          {/* ARS */}
          <div className={`bg-bg-panel border rounded-xl p-5 ${registration?.ars.confirmed ? "border-green/30" : "border-red/30"}`}>
            <div className="flex items-center justify-between mb-3">
              <div>
                <div className="text-13 font-semibold text-ink-0">ARS — Automatic Reporting System</div>
                <div className="text-11 text-ink-3">Automated list updates and reporting system · uaeiec.gov.ae · Separate from NAS</div>
              </div>
              <span className={`inline-flex items-center px-2.5 py-1 rounded font-mono text-11 font-semibold uppercase ${registration?.ars.confirmed ? "bg-green-dim text-green border border-green/30" : "bg-red-dim text-red border border-red/30"}`}>
                {registration?.ars.confirmed ? "✓ Confirmed" : "Not confirmed"}
              </span>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div>
                <label className="block text-10 uppercase tracking-wide-3 text-ink-2 font-semibold mb-1">ARS registration reference</label>
                <input defaultValue={registration?.ars.reference ?? ""} id="ars-ref" className="w-full text-12 px-3 py-1.5 rounded border border-hair-2 bg-bg-panel text-ink-0 focus:border-brand outline-none" placeholder="ARS registration ID" />
              </div>
              <div>
                <label className="block text-10 uppercase tracking-wide-3 text-ink-2 font-semibold mb-1">Confirmed by</label>
                <input defaultValue={registration?.ars.confirmedBy ?? ""} id="ars-by" className="w-full text-12 px-3 py-1.5 rounded border border-hair-2 bg-bg-panel text-ink-0 focus:border-brand outline-none" placeholder="MLRO name" />
              </div>
            </div>
            <div className="flex items-center gap-3 mt-3">
              <button type="button" disabled={regSaving}
                onClick={() => {
                  const ref = (document.getElementById("ars-ref") as HTMLInputElement)?.value ?? "";
                  const by = (document.getElementById("ars-by") as HTMLInputElement)?.value ?? "";
                  void saveRegistration({ ars: { confirmed: true, reference: ref, confirmedBy: by } });
                }}
                className="text-11 font-semibold px-3 py-1.5 rounded border border-green/40 text-green bg-green-dim hover:bg-green/20 disabled:opacity-50">
                {regSaving ? "Saving…" : "✓ Confirm ARS registration"}
              </button>
              {registration?.ars.confirmedAt && (
                <span className="text-10 text-ink-3 font-mono">Confirmed {new Date(registration.ars.confirmedAt).toLocaleDateString("en-GB")}</span>
              )}
            </div>
          </div>

          <p className="text-10.5 text-ink-3 leading-relaxed">
            Both NAS and ARS registrations are mandatory for all UAE DNFBPs under EOCN guidance. Register at uaeiec.gov.ae.
            ARS is separate from NAS — both require individual registration. Unregistered entities miss real-time TFS list updates
            and may fail regulatory inspections. The MoE 2026 AML/CFT survey asks for confirmation of both registrations.
          </p>
        </div>
      )}

      {/* CONTROL LIST TAB — UAE Cabinet Resolution 156/2025 */}
      {tab === "control-list" && (
        <div className="space-y-4">
          <div className="bg-bg-panel border border-hair-2 rounded-xl p-5">
            <div className="flex items-center justify-between mb-3">
              <div>
                <div className="text-13 font-semibold text-ink-0">UAE Control List — Cabinet Resolution 156/2025</div>
                <div className="text-11 text-ink-3">Dual-use and proliferation-sensitive goods · Gold dealers must screen trade transactions for controlled goods</div>
              </div>
              <span className={`inline-flex items-center px-2.5 py-1 rounded font-mono text-11 font-semibold uppercase ${controlListCount ? "bg-green-dim text-green border border-green/30" : "bg-amber-dim text-amber border border-amber/30"}`}>
                {controlListCount ? `${controlListCount.toLocaleString()} entries` : "Pending sync"}
              </span>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-4">
              <div className="bg-bg-1 rounded-lg p-3">
                <div className="text-9 font-mono uppercase tracking-wide-3 text-ink-3 mb-1">Last sync</div>
                <div className="text-12 font-semibold text-ink-0">{controlListLastSync ? new Date(controlListLastSync).toLocaleDateString("en-GB") : "Not synced"}</div>
              </div>
              <div className="bg-bg-1 rounded-lg p-3">
                <div className="text-9 font-mono uppercase tracking-wide-3 text-ink-3 mb-1">Legal basis</div>
                <div className="text-12 font-semibold text-ink-0">CR 156/2025 · EU 2021/821 · US CCL</div>
              </div>
              <div className="bg-bg-1 rounded-lg p-3">
                <div className="text-9 font-mono uppercase tracking-wide-3 text-ink-3 mb-1">Ingest schedule</div>
                <div className="text-12 font-semibold text-ink-0">Every 6 hours</div>
              </div>
            </div>

            <div className="bg-amber-dim border border-amber/20 rounded-lg p-3 text-11 text-ink-1 mb-4">
              <strong>EOCN requires DUG screening against the UAE Control List (CR 156/2025).</strong>{" "}
              Modes exist (<code className="font-mono bg-bg-2 px-1 rounded">dual_use_goods_routing</code>,{" "}
              <code className="font-mono bg-bg-2 px-1 rounded">dual_use_goods_routing</code>) but the Control List
              must be ingested as a live data source. The ingest cron (<code className="font-mono bg-bg-2 px-1 rounded">goods-control-ingest</code>)
              runs every 6h. Configure <code className="font-mono bg-bg-2 px-1 rounded">FEED_UAE_GOODS_CONTROL</code> env var to enable live feed.
            </div>

            <div>
              <div className="text-12 font-semibold text-ink-0 mb-3">Controlled goods categories (CR 156/2025)</div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                {[
                  { cat: "Dual-use goods", desc: "Commercial items with potential military end-use", riskLevel: "high" },
                  { cat: "Weapons & munitions", desc: "Conventional weapons and ammunition", riskLevel: "critical" },
                  { cat: "Nuclear materials", desc: "Fissile material and nuclear-related equipment", riskLevel: "critical" },
                  { cat: "Chemical precursors", desc: "Chemical weapon precursors and toxic agents", riskLevel: "critical" },
                  { cat: "Missile technology", desc: "Ballistic missile and rocket components", riskLevel: "critical" },
                  { cat: "Cyber surveillance", desc: "Intrusion software and surveillance equipment", riskLevel: "high" },
                ].map(({ cat, desc, riskLevel }) => (
                  <div key={cat} className="flex items-start gap-3 bg-bg-1 rounded p-3">
                    <span className={`inline-flex items-center px-1.5 py-0.5 rounded font-mono text-9 font-semibold uppercase shrink-0 mt-0.5 ${riskLevel === "critical" ? "bg-red-dim text-red" : "bg-amber-dim text-amber"}`}>{riskLevel}</span>
                    <div>
                      <div className="text-12 font-semibold text-ink-0">{cat}</div>
                      <div className="text-10 text-ink-3">{desc}</div>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="mt-4 pt-4 border-t border-hair">
              <div className="text-11 font-semibold text-ink-2 mb-2">Integration with screening engine</div>
              <p className="text-11 text-ink-2 mb-3">
                When the <code className="font-mono bg-bg-2 px-1 rounded">dual_use_goods_routing</code> brain mode is active,
                it consults the ingested UAE Control List (stored in Netlify Blobs under <code className="font-mono bg-bg-2 px-1 rounded">hawkeye-goods-control</code>)
                to evaluate HS codes against CR 156/2025 categories. Without the env var, it falls back to the <code className="font-mono bg-bg-2 px-1 rounded">isDualUse</code> flag in the evidence schema.
              </p>
              <a href="/supply-chain" className="inline-flex items-center gap-1.5 text-11 font-semibold text-brand hover:underline">
                Screen a shipment for dual-use goods ↗
              </a>
            </div>
          </div>
        </div>
      )}

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
    } catch (err) { console.warn("[hawkeye] eocn names list parse failed:", err); }
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
