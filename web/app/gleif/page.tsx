"use client";

import { useState } from "react";
import { Header } from "@/components/layout/Header";

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

const STATUS_COLOUR: Record<string, string> = {
  ISSUED:    "bg-green-100 text-green-800",
  LAPSED:    "bg-yellow-100 text-yellow-800",
  MERGED:    "bg-gray-100 text-gray-600",
  RETIRED:   "bg-red-100 text-red-700",
  DUPLICATE: "bg-orange-100 text-orange-700",
};

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
    } catch {
      setError("Request failed");
    } finally { setLoading(false); }
  }

  async function searchGleif() {
    if (!query.trim()) return;
    setLoading(true); setError(null); setSearchResults([]);
    try {
      const res = await fetch(`/api/gleif?q=${encodeURIComponent(query.trim())}&limit=20`);
      const data = await res.json() as { ok: boolean; results: SearchResult[]; error?: string };
      if (!data.ok) setError(data.error ?? "Search failed");
      else setSearchResults(data.results);
    } catch {
      setError("Request failed");
    } finally { setLoading(false); }
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <Header />
      <main className="max-w-5xl mx-auto px-4 py-8">
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-gray-900">GLEIF LEI Lookup</h1>
          <p className="text-sm text-gray-500 mt-1">
            Beneficial ownership chain traversal via the Global Legal Entity Identifier Foundation (GLEIF) public API.
          </p>
        </div>

        {/* Tabs */}
        <div className="flex gap-2 mb-6">
          {(["lookup", "search"] as const).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`px-4 py-2 rounded text-sm font-medium transition-colors ${
                tab === t ? "bg-blue-600 text-white" : "bg-white text-gray-600 border border-gray-200 hover:bg-gray-50"
              }`}
            >
              {t === "lookup" ? "LEI Lookup" : "Name Search"}
            </button>
          ))}
        </div>

        {tab === "lookup" && (
          <div className="bg-white rounded-lg border border-gray-200 p-5 mb-6">
            <div className="flex gap-3 flex-wrap">
              <input
                className="flex-1 min-w-48 border border-gray-300 rounded px-3 py-2 text-sm font-mono"
                placeholder="20-character LEI e.g. 7LTWFZYICNSX8D621K86"
                value={lei}
                onChange={(e) => setLei(e.target.value.toUpperCase())}
                onKeyDown={(e) => e.key === "Enter" && lookupLei()}
                maxLength={20}
              />
              <select
                className="border border-gray-300 rounded px-3 py-2 text-sm"
                value={depth}
                onChange={(e) => setDepth(Number(e.target.value))}
              >
                {[1, 2, 3, 5, 10].map((d) => (
                  <option key={d} value={d}>Chain depth: {d}</option>
                ))}
              </select>
              <button
                onClick={lookupLei}
                disabled={loading || lei.length !== 20}
                className="px-4 py-2 bg-blue-600 text-white rounded text-sm font-medium disabled:opacity-50 hover:bg-blue-700"
              >
                {loading ? "Looking up…" : "Look Up"}
              </button>
            </div>
          </div>
        )}

        {tab === "search" && (
          <div className="bg-white rounded-lg border border-gray-200 p-5 mb-6">
            <div className="flex gap-3">
              <input
                className="flex-1 border border-gray-300 rounded px-3 py-2 text-sm"
                placeholder="Legal entity name e.g. Emirates NBD"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && searchGleif()}
              />
              <button
                onClick={searchGleif}
                disabled={loading || !query.trim()}
                className="px-4 py-2 bg-blue-600 text-white rounded text-sm font-medium disabled:opacity-50 hover:bg-blue-700"
              >
                {loading ? "Searching…" : "Search"}
              </button>
            </div>
          </div>
        )}

        {error && (
          <div className="bg-red-50 border border-red-200 rounded p-3 text-red-700 text-sm mb-4">{error}</div>
        )}

        {/* LEI record */}
        {leiResult?.record && (
          <div className="bg-white rounded-lg border border-gray-200 p-5 mb-4">
            <div className="flex items-start justify-between mb-4">
              <div>
                <h2 className="text-lg font-semibold text-gray-900">{leiResult.record.legalName}</h2>
                <p className="text-xs font-mono text-gray-400 mt-0.5">{leiResult.lei}</p>
              </div>
              <span className={`text-xs px-2 py-1 rounded font-medium ${STATUS_COLOUR[leiResult.record.registrationStatus] ?? "bg-gray-100 text-gray-600"}`}>
                {leiResult.record.registrationStatus}
              </span>
            </div>
            <div className="grid grid-cols-2 gap-3 text-sm">
              <div><span className="text-gray-400">Jurisdiction</span><p className="font-medium">{leiResult.record.jurisdiction || "—"}</p></div>
              <div><span className="text-gray-400">Legal Form</span><p className="font-medium">{leiResult.record.legalForm || "—"}</p></div>
              {leiResult.record.registeredAddress && (
                <div className="col-span-2">
                  <span className="text-gray-400">Registered Address</span>
                  <p className="font-medium">
                    {[...leiResult.record.registeredAddress.addressLines, leiResult.record.registeredAddress.city, leiResult.record.registeredAddress.country].filter(Boolean).join(", ")}
                  </p>
                </div>
              )}
              {leiResult.record.lastUpdated && (
                <div><span className="text-gray-400">Last Updated</span><p className="font-medium">{leiResult.record.lastUpdated.slice(0, 10)}</p></div>
              )}
            </div>
          </div>
        )}

        {/* Ownership chain */}
        {leiResult?.ownershipChain && leiResult.ownershipChain.length > 1 && (
          <div className="bg-white rounded-lg border border-gray-200 p-5 mb-4">
            <h3 className="text-sm font-semibold text-gray-700 mb-3">Beneficial Ownership Chain ({leiResult.ownershipChain.length} entities)</h3>
            <div className="space-y-2">
              {leiResult.ownershipChain.map((node) => (
                <div key={node.lei} className="flex items-center gap-3 text-sm">
                  <div className="w-6 h-6 rounded-full bg-blue-100 text-blue-700 text-xs flex items-center justify-center font-bold flex-shrink-0">{node.depth}</div>
                  <div className="flex-1">
                    <span className="font-medium text-gray-900">{node.legalName}</span>
                    <span className="text-gray-400 ml-2 text-xs">{node.lei}</span>
                  </div>
                  <span className="text-xs text-gray-400">{node.jurisdiction}</span>
                  <span className={`text-xs px-1.5 py-0.5 rounded ${STATUS_COLOUR[node.registrationStatus] ?? "bg-gray-100 text-gray-600"}`}>
                    {node.registrationStatus}
                  </span>
                  {node.relationshipType === "ultimate" && (
                    <span className="text-xs bg-purple-100 text-purple-700 px-1.5 py-0.5 rounded">UBO</span>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Search results */}
        {searchResults.length > 0 && (
          <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  <th className="text-left px-4 py-3 text-xs font-medium text-gray-500">Legal Name</th>
                  <th className="text-left px-4 py-3 text-xs font-medium text-gray-500">LEI</th>
                  <th className="text-left px-4 py-3 text-xs font-medium text-gray-500">Jurisdiction</th>
                  <th className="text-left px-4 py-3 text-xs font-medium text-gray-500">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {searchResults.map((r) => (
                  <tr key={r.lei} className="hover:bg-gray-50 cursor-pointer" onClick={() => { setTab("lookup"); setLei(r.lei); }}>
                    <td className="px-4 py-3 font-medium text-gray-900">{r.legalName}</td>
                    <td className="px-4 py-3 font-mono text-xs text-gray-500">{r.lei}</td>
                    <td className="px-4 py-3 text-gray-600">{r.jurisdiction}</td>
                    <td className="px-4 py-3">
                      <span className={`text-xs px-2 py-0.5 rounded font-medium ${STATUS_COLOUR[r.status] ?? "bg-gray-100 text-gray-600"}`}>{r.status}</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </main>
    </div>
  );
}
