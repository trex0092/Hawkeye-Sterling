"use client";

// Module — Intelligence Tools (deterministic).
// Three operator-facing widgets that wrap the existing pure-function
// modules — OFAC 50% rule walker, crypto wallet exposure analyzer,
// synthetic-identity cluster detector. No LLM dependency; everything
// runs client-side.

import { useMemo, useState } from "react";
import { ModuleHero, ModuleLayout } from "@/components/layout/ModuleLayout";
import { walkOwnershipChain, type OwnershipGraph } from "@/lib/intelligence/ownershipChain";
import { analyzeCrypto, type WalletNode } from "@/lib/intelligence/cryptoExposure";
import { detectSyntheticClusters, type IdentityTelemetry } from "@/lib/intelligence/syntheticIdentity";

type Tab = "ubo" | "crypto" | "synthetic";

const DEMO_OWNERSHIP: OwnershipGraph = {
  rootId: "target",
  nodes: [
    { id: "designated_a", name: "Sanctioned Individual A", designated: true, regimes: ["OFAC SDN"], owns: [{ toId: "shell_1", pct: 0.6 }] },
    { id: "designated_b", name: "Sanctioned Individual B", designated: true, regimes: ["EU CFSP"], owns: [{ toId: "shell_2", pct: 0.4 }] },
    { id: "shell_1", name: "Shell Holdings BVI Ltd", designated: false, owns: [{ toId: "target", pct: 0.5 }] },
    { id: "shell_2", name: "Nominee Trust KY", designated: false, owns: [{ toId: "target", pct: 0.3 }] },
    { id: "target", name: "Target Corp UAE", designated: false },
  ],
};

const DEMO_WALLETS: WalletNode[] = [
  {
    address: "1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa",
    chain: "btc",
    cluster: "darknet_market",
    providerRisk: 80,
    oneHopCounterparties: [
      { address: "0xtornado1", cluster: "tornado_cash" },
      { address: "0xkyc1", cluster: null },
    ],
  },
];

const DEMO_TELEMETRY: IdentityTelemetry[] = [
  { subjectId: "HS-1001", deviceFingerprint: "fp-a1b2c3", ip: "203.0.113.10", phone: "+97150000001", email: "alice+1@disposable.test", at: "2026-05-05T08:00:00Z" },
  { subjectId: "HS-1002", deviceFingerprint: "fp-a1b2c3", ip: "203.0.113.10", phone: "+97150000002", email: "alice+2@disposable.test", at: "2026-05-05T08:05:00Z" },
  { subjectId: "HS-1003", deviceFingerprint: "fp-a1b2c3", ip: "203.0.113.10", phone: "+97150000003", email: "alice+3@disposable.test", at: "2026-05-05T08:10:00Z" },
  { subjectId: "HS-1004", deviceFingerprint: "fp-a1b2c3", ip: "203.0.113.10", phone: "+97150000004", email: "alice+4@disposable.test", at: "2026-05-05T08:15:00Z" },
  { subjectId: "HS-1005", deviceFingerprint: "fp-a1b2c3", ip: "203.0.113.10", phone: "+97150000005", email: "alice+5@disposable.test", at: "2026-05-05T08:20:00Z" },
];

export default function IntelligenceToolsPage() {
  const [tab, setTab] = useState<Tab>("ubo");
  const [ownershipJson, setOwnershipJson] = useState<string>(JSON.stringify(DEMO_OWNERSHIP, null, 2));
  const [walletsJson, setWalletsJson] = useState<string>(JSON.stringify(DEMO_WALLETS, null, 2));
  const [telemetryJson, setTelemetryJson] = useState<string>(JSON.stringify(DEMO_TELEMETRY, null, 2));

  // ── #1 OFAC 50% UBO walker ─────────────────────────────────────────────
  const uboResult = useMemo(() => {
    try {
      const graph = JSON.parse(ownershipJson) as OwnershipGraph;
      return walkOwnershipChain(graph);
    } catch (err) {
      return { error: err instanceof Error ? err.message : "Invalid JSON" };
    }
  }, [ownershipJson]);

  // ── #2 Crypto wallet exposure ──────────────────────────────────────────
  const cryptoResult = useMemo(() => {
    try {
      const wallets = JSON.parse(walletsJson) as WalletNode[];
      return analyzeCrypto(wallets);
    } catch (err) {
      return { error: err instanceof Error ? err.message : "Invalid JSON" };
    }
  }, [walletsJson]);

  // ── #3 Synthetic-identity cluster ──────────────────────────────────────
  const syntheticResult = useMemo(() => {
    try {
      const telemetry = JSON.parse(telemetryJson) as IdentityTelemetry[];
      return { ok: true as const, clusters: detectSyntheticClusters(telemetry) };
    } catch (err) {
      return { error: err instanceof Error ? err.message : "Invalid JSON" };
    }
  }, [telemetryJson]);

  return (
    <ModuleLayout asanaModule="intelligence-tools" asanaLabel="Intelligence Tools">
      <ModuleHero
        eyebrow="DETERMINISTIC INTELLIGENCE"
        title="Intelligence"
        titleEm="tools."
        intro={
          <>
            <strong>Three deterministic operator tools.</strong> OFAC 50% rule
            walker over an ownership graph, crypto-wallet exposure analyzer,
            and synthetic-identity cluster detector. Pure-function — no LLM
            dependency.
          </>
        }
        kpis={[
          { value: "3", label: "tools" },
          { value: "0", label: "LLM dependency" },
          { value: "client-side", label: "execution" },
        ]}
      />

      <div className="flex gap-1 mb-4 border-b border-hair-2">
        {([
          { key: "ubo", label: "OFAC 50% UBO walker" },
          { key: "crypto", label: "Crypto wallet exposure" },
          { key: "synthetic", label: "Synthetic-identity cluster" },
        ] as const).map((t) => (
          <button
            key={t.key}
            type="button"
            onClick={() => setTab(t.key)}
            className={`px-4 py-2 text-12 font-medium border-b-2 -mb-px transition-colors ${
              tab === t.key
                ? "border-brand text-brand bg-brand-dim"
                : "border-transparent text-ink-2 hover:text-ink-1 hover:border-hair-2"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === "ubo" && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <h2 className="text-12 font-semibold mb-2 uppercase tracking-wide-3 text-ink-2">
              Ownership graph (JSON)
            </h2>
            <textarea
              value={ownershipJson}
              onChange={(e) => setOwnershipJson(e.target.value)}
              rows={20}
              className="w-full text-11 font-mono bg-bg-1 border border-hair-2 rounded p-3 text-ink-0 focus:outline-none focus:border-brand"
            />
          </div>
          <div>
            <h2 className="text-12 font-semibold mb-2 uppercase tracking-wide-3 text-ink-2">
              Walker result
            </h2>
            {"error" in uboResult ? (
              <div className="text-11 text-red bg-red-dim/40 rounded p-3">
                {(uboResult as { error: string }).error}
              </div>
            ) : (
              <div className={`rounded-lg border p-4 ${uboResult.blocked ? "border-red/40 bg-red-dim/40" : "border-green/40 bg-green-dim/40"}`}>
                <div className="flex items-baseline gap-3 mb-2">
                  <span className={`text-13 font-bold ${uboResult.blocked ? "text-red" : "text-green"}`}>
                    {uboResult.blocked ? "BLOCKED — OFAC 50% rule" : "CLEAR"}
                  </span>
                  <span className="text-11 font-mono text-ink-2">
                    cumulative {(uboResult.cumulativePct * 100).toFixed(1)}%
                  </span>
                </div>
                <div className="text-10 text-ink-3 font-mono mb-3">
                  Examined {uboResult.examinedPaths} paths · max depth {uboResult.maxDepth}
                </div>
                {uboResult.traces.length > 0 && (
                  <>
                    <div className="text-10 uppercase tracking-wide-3 text-ink-3 font-semibold mb-1">
                      Designated-party paths
                    </div>
                    <ul className="space-y-2">
                      {uboResult.traces.map((t, i) => (
                        <li key={i} className="text-11 text-ink-1">
                          <strong>{t.designatedName}</strong> → {(t.effectivePct * 100).toFixed(1)}%
                          <div className="text-10 text-ink-3 font-mono">
                            {t.path.join(" → ")}
                          </div>
                          {t.regimes.length > 0 && (
                            <div className="text-10 text-ink-3">
                              regimes: {t.regimes.join(", ")}
                            </div>
                          )}
                        </li>
                      ))}
                    </ul>
                  </>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {tab === "crypto" && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <h2 className="text-12 font-semibold mb-2 uppercase tracking-wide-3 text-ink-2">
              Wallets (JSON)
            </h2>
            <textarea
              value={walletsJson}
              onChange={(e) => setWalletsJson(e.target.value)}
              rows={20}
              className="w-full text-11 font-mono bg-bg-1 border border-hair-2 rounded p-3 text-ink-0 focus:outline-none focus:border-brand"
            />
          </div>
          <div>
            <h2 className="text-12 font-semibold mb-2 uppercase tracking-wide-3 text-ink-2">
              Exposure analysis
            </h2>
            {"error" in cryptoResult ? (
              <div className="text-11 text-red bg-red-dim/40 rounded p-3">
                {(cryptoResult as { error: string }).error}
              </div>
            ) : (
              <div className={`rounded-lg border p-4 ${
                cryptoResult.exposureTier === "direct" ? "border-red/40 bg-red-dim/40" :
                cryptoResult.exposureTier === "one_hop" ? "border-orange/40 bg-orange-dim/40" :
                cryptoResult.exposureTier === "indirect" ? "border-amber/40 bg-amber-dim/40" :
                "border-green/40 bg-green-dim/40"
              }`}>
                <div className="flex items-baseline gap-3 mb-2">
                  <span className="text-13 font-bold uppercase">{cryptoResult.exposureTier}</span>
                  <span className="text-11 font-mono text-ink-2">{cryptoResult.walletCount} wallets</span>
                </div>
                <p className="text-11 text-ink-1 italic mb-3">{cryptoResult.rationale}</p>
                {cryptoResult.directClusters.length > 0 && (
                  <div className="mb-2">
                    <div className="text-10 uppercase tracking-wide-3 text-ink-3 font-semibold">
                      Direct clusters
                    </div>
                    <div className="flex flex-wrap gap-1 mt-1">
                      {cryptoResult.directClusters.map((c) => (
                        <span key={c} className="inline-flex items-center px-2 py-0.5 rounded font-mono text-10 bg-red-dim text-red">
                          {c.replace(/_/g, " ")}
                        </span>
                      ))}
                    </div>
                  </div>
                )}
                {cryptoResult.oneHopClusters.length > 0 && (
                  <div className="mb-2">
                    <div className="text-10 uppercase tracking-wide-3 text-ink-3 font-semibold">
                      1-hop clusters
                    </div>
                    <div className="flex flex-wrap gap-1 mt-1">
                      {cryptoResult.oneHopClusters.map((c) => (
                        <span key={c} className="inline-flex items-center px-2 py-0.5 rounded font-mono text-10 bg-amber-dim text-amber">
                          {c.replace(/_/g, " ")}
                        </span>
                      ))}
                    </div>
                  </div>
                )}
                {cryptoResult.redFlags.length > 0 && (
                  <ul className="space-y-1 text-11 text-ink-1 mt-2">
                    {cryptoResult.redFlags.map((f, i) => (
                      <li key={i}>● {f}</li>
                    ))}
                  </ul>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {tab === "synthetic" && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <h2 className="text-12 font-semibold mb-2 uppercase tracking-wide-3 text-ink-2">
              Onboarding telemetry (JSON)
            </h2>
            <textarea
              value={telemetryJson}
              onChange={(e) => setTelemetryJson(e.target.value)}
              rows={20}
              className="w-full text-11 font-mono bg-bg-1 border border-hair-2 rounded p-3 text-ink-0 focus:outline-none focus:border-brand"
            />
          </div>
          <div>
            <h2 className="text-12 font-semibold mb-2 uppercase tracking-wide-3 text-ink-2">
              Cluster detection
            </h2>
            {"error" in syntheticResult ? (
              <div className="text-11 text-red bg-red-dim/40 rounded p-3">
                {(syntheticResult as { error: string }).error}
              </div>
            ) : syntheticResult.clusters.length === 0 ? (
              <div className="rounded-lg border border-green/40 bg-green-dim/40 p-4 text-11 text-ink-1">
                No synthetic-identity clusters detected — telemetry is within normal envelope.
              </div>
            ) : (
              <div className="space-y-3">
                {syntheticResult.clusters.map((c, i) => (
                  <div key={i} className="rounded-lg border border-red/40 bg-red-dim/40 p-3">
                    <div className="flex items-baseline gap-2 mb-1">
                      <span className="text-11 font-bold text-red uppercase">
                        {c.signatureKind.replace(/_/g, " ")}
                      </span>
                      <span className="text-10 font-mono text-ink-2">{c.members.length} subjects</span>
                      <span className="text-10 font-mono text-ink-3">window {c.windowSpanH}h</span>
                    </div>
                    <p className="text-11 text-ink-1 italic mb-1">{c.rationale}</p>
                    <div className="text-10 font-mono text-ink-3">
                      Signature: {c.signature}
                    </div>
                    <div className="text-10 font-mono text-ink-3">
                      Members: {c.members.join(", ")}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </ModuleLayout>
  );
}
