"use client";

import { useState } from "react";
import { ModuleLayout, ModuleHero } from "@/components/layout/ModuleLayout";
import { AsanaReportButton } from "@/components/shared/AsanaReportButton";

interface OwnershipNode {
  lei: string;
  legalName: string;
  jurisdiction: string;
  registrationStatus: string;
  depth: number;
  relationshipType?: string;
}

interface LeiRecord {
  lei: string;
  legalName: string;
  jurisdiction: string;
  legalForm?: string;
  registrationStatus: string;
  registeredAddress?: { addressLines: string[]; city: string; country: string; postalCode?: string };
  directParentLei?: string;
  ultimateParentLei?: string;
  lastUpdated?: string;
}

interface GleifResult {
  ok: boolean;
  lei: string;
  record?: LeiRecord;
  ownershipChain: OwnershipNode[];
  error?: string;
}

interface SearchResult {
  lei: string;
  legalName: string;
  jurisdiction: string;
  status: string;
}

const STATUS_TONE: Record<string, string> = {
  ISSUED:    "bg-green-dim text-green",
  LAPSED:    "bg-amber-dim text-amber",
  MERGED:    "bg-bg-2 text-ink-3",
  RETIRED:   "bg-red-dim text-red",
  DUPLICATE: "bg-amber-dim text-amber",
};

const inputCls = "px-3 py-2 border border-hair-2 rounded text-13 bg-bg-1 focus:outline-none focus:border-brand text-ink-0";
const monoInputCls = `${inputCls} font-mono`;
const btnCls = "px-4 py-1.5 rounded bg-green-dim text-green text-12 font-semibold border border-green/40 disabled:opacity-40 disabled:cursor-not-allowed hover:bg-green/20 transition-colors";
const tabCls = (active: boolean) =>
  `px-3 py-1 rounded text-11 font-medium border transition-colors ${
    active
      ? "bg-brand text-white border-brand"
      : "bg-bg-1 text-ink-2 border-hair-2 hover:border-brand hover:text-ink-0"
  }`;

export default function GleifPage() {
  const [tab, setTab] = useState<"lookup" | "search">("lookup");
  const [lei, setLei] = useState("");
  const [query, setQuery] = useState("");
  const [depth, setDepth] = useState(5);
  const [loading, setLoading] = useState(false);
  const [leiResult, setLeiResult] = useState<GleifResult | null>(null);
  const [searchResults, setSearchResults] = useState<SearchResult[]>([]);
  const [error, setError] = useState<string | null>(null);

  async function lookupLei() {
    if (!lei.trim()) return;
    setLoading(true); setError(null); setLeiResult(null);
    try {
      const res = await fetch(`/api/gleif?lei=${encodeURIComponent(lei.trim())}&depth=${depth}`);
      const data = await res.json() as GleifResult;
      if (!data.ok) setError(data.error ?? "LEI not found");
      else setLeiResult(data);
    } catch { setError("Request failed"); }
    finally { setLoading(false); }
  }

  async function searchGleif() {
    if (!query.trim()) return;
    setLoading(true); setError(null); setSearchResults([]);
    try {
      const res = await fetch(`/api/gleif?q=${encodeURIComponent(query.trim())}&limit=20`);
      const data = await res.json() as { ok: boolean; results: SearchResult[]; error?: string };
      if (!data.ok) setError(data.error ?? "Search failed");
      else setSearchResults(data.results);
    } catch { setError("Request failed"); }
    finally { setLoading(false); }
  }

  const switchTab = (t: "lookup" | "search") => {
    setTab(t); setLeiResult(null); setSearchResults([]); setError(null);
  };

  return (
    <ModuleLayout asanaModule="gleif" asanaLabel="GLEIF / LEI" engineLabel="GLEIF LEI">
      <ModuleHero
        moduleNumber={35}
        eyebrow="Module · Entity Intelligence"
        title="GLEIF"
        titleEm="LEI lookup."
        intro="Beneficial ownership chain traversal via the Global Legal Entity Identifier Foundation (GLEIF) public API."
      />

      <div className="bg-bg-panel border border-hair-2 rounded-xl p-5 space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <div className="text-11 font-semibold tracking-wide-4 uppercase text-brand mb-1">
              Entity Intelligence · GLEIF
            </div>
            <div className="text-12 text-ink-2">
              Beneficial ownership chain · sanctions-status LEI · UBO resolution
            </div>
          </div>
          <div className="flex items-center gap-1.5">
            {(["lookup", "search"] as const).map((t) => (
              <button key={t} type="button" onClick={() => switchTab(t)} className={tabCls(tab === t)}>
                {t === "lookup" ? "LEI Lookup" : "Name Search"}
              </button>
            ))}
          </div>
        </div>

        {tab === "lookup" && (
          <div className="flex gap-3 flex-wrap">
            <input
              className={`flex-1 min-w-48 ${monoInputCls}`}
              placeholder="20-character LEI e.g. 7LTWFZYICNSX8D621K86"
              value={lei}
              onChange={(e) => setLei(e.target.value.toUpperCase())}
              onKeyDown={(e) => e.key === "Enter" && lookupLei()}
              maxLength={20}
            />
            <select
              className={inputCls}
              value={depth}
              onChange={(e) => setDepth(Number(e.target.value))}
            >
              {[1, 2, 3, 5, 10].map((d) => (
                <option key={d} value={d}>Chain depth: {d}</option>
              ))}
            </select>
            <button type="button" onClick={lookupLei} disabled={loading || lei.length !== 20} className={btnCls}>
              {loading ? "Looking up…" : "Look Up"}
            </button>
          </div>
        )}

        {tab === "search" && (
          <div className="flex gap-3">
            <input
              className={`flex-1 ${inputCls}`}
              placeholder="Legal entity name e.g. Emirates NBD"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && searchGleif()}
            />
            <button type="button" onClick={searchGleif} disabled={loading || !query.trim()} className={btnCls}>
              {loading ? "⌕…" : "⌕"}
            </button>
          </div>
        )}

        {error && (
          <div className="bg-red-dim border border-red/30 rounded-lg p-3 text-12 text-red">
            <span className="font-semibold">Error:</span> {error}
          </div>
        )}

        {leiResult?.record && (
          <div className="border border-hair-2 rounded-lg p-4 space-y-3">
            <div className="flex items-start justify-between">
              <div>
                <p className="text-14 font-semibold text-ink-0">{leiResult.record.legalName}</p>
                <p className="text-11 font-mono text-ink-3 mt-0.5">{leiResult.lei}</p>
              </div>
              <div className="flex flex-col items-end gap-2">
                <span className={`text-11 px-2 py-0.5 rounded font-semibold uppercase ${STATUS_TONE[leiResult.record.registrationStatus] ?? "bg-bg-2 text-ink-3"}`}>
                  {leiResult.record.registrationStatus}
                </span>
                <AsanaReportButton payload={{
                  module: "gleif",
                  label: leiResult.record.legalName,
                  summary: `LEI: ${leiResult.lei}; Status: ${leiResult.record.registrationStatus}; Jurisdiction: ${leiResult.record.jurisdiction || "—"}; Ownership chain: ${leiResult.ownershipChain.length} entities`,
                  metadata: { lei: leiResult.lei, status: leiResult.record.registrationStatus, jurisdiction: leiResult.record.jurisdiction, chainDepth: leiResult.ownershipChain.length },
                }} />
              </div>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-12">
              <div>
                <div className="text-ink-3 mb-0.5">Jurisdiction</div>
                <div className="font-medium text-ink-0">{leiResult.record.jurisdiction || "—"}</div>
              </div>
              <div>
                <div className="text-ink-3 mb-0.5">Legal Form</div>
                <div className="font-medium text-ink-0">{leiResult.record.legalForm || "—"}</div>
              </div>
              {leiResult.record.registeredAddress && (
                <div className="col-span-2">
                  <div className="text-ink-3 mb-0.5">Registered Address</div>
                  <div className="font-medium text-ink-0">
                    {[
                      ...leiResult.record.registeredAddress.addressLines,
                      leiResult.record.registeredAddress.city,
                      leiResult.record.registeredAddress.country,
                    ].filter(Boolean).join(", ")}
                  </div>
                </div>
              )}
              {leiResult.record.lastUpdated && (
                <div>
                  <div className="text-ink-3 mb-0.5">Last Updated</div>
                  <div className="font-medium text-ink-0">{leiResult.record.lastUpdated.slice(0, 10)}</div>
                </div>
              )}
            </div>
          </div>
        )}

        {leiResult?.ownershipChain && leiResult.ownershipChain.length > 1 && (
          <div className="border border-hair-2 rounded-lg p-4">
            <div className="text-11 font-semibold uppercase tracking-wide-3 text-ink-2 mb-3">
              Beneficial Ownership Chain ({leiResult.ownershipChain.length} entities)
            </div>
            <div className="space-y-2">
              {leiResult.ownershipChain.map((node) => (
                <div key={node.lei} className="flex items-center gap-3 text-12">
                  <div className="w-6 h-6 rounded-full bg-brand-dim text-brand text-10 flex items-center justify-center font-bold flex-shrink-0">
                    {node.depth}
                  </div>
                  <div className="flex-1">
                    <span className="font-medium text-ink-0">{node.legalName}</span>
                    <span className="text-ink-3 ml-2 text-10 font-mono">{node.lei}</span>
                  </div>
                  <span className="text-ink-3 text-11">{node.jurisdiction}</span>
                  <span className={`text-10 px-1.5 py-px rounded font-semibold uppercase ${STATUS_TONE[node.registrationStatus] ?? "bg-bg-2 text-ink-3"}`}>
                    {node.registrationStatus}
                  </span>
                  {node.relationshipType === "ultimate" && (
                    <span className="text-10 bg-brand-dim text-brand px-1.5 py-px rounded font-semibold">UBO</span>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {searchResults.length > 0 && (
          <div className="border border-hair-2 rounded-lg overflow-hidden">
            <table className="w-full text-12">
              <thead className="bg-bg-1 border-b border-hair-2">
                <tr>
                  {["Legal Name", "LEI", "Jurisdiction", "Status"].map((h) => (
                    <th key={h} className="text-left px-3 py-2 text-10 uppercase tracking-wide-3 text-ink-2 font-mono">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {searchResults.map((r, i) => (
                  <tr
                    key={r.lei}
                    className={`hover:bg-bg-panel cursor-pointer transition-colors ${i < searchResults.length - 1 ? "border-b border-hair" : ""}`}
                    onClick={() => { setTab("lookup"); setLei(r.lei); }}
                  >
                    <td className="px-3 py-2 font-medium text-ink-0">{r.legalName}</td>
                    <td className="px-3 py-2 font-mono text-10 text-ink-2">{r.lei}</td>
                    <td className="px-3 py-2 text-ink-2">{r.jurisdiction}</td>
                    <td className="px-3 py-2">
                      <span className={`text-10 px-1.5 py-px rounded font-semibold uppercase ${STATUS_TONE[r.status] ?? "bg-bg-2 text-ink-3"}`}>
                        {r.status}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </ModuleLayout>
  );
}
