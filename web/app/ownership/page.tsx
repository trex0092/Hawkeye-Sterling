"use client";

import { useMemo, useState } from "react";
import { ModuleHero, ModuleLayout } from "@/components/layout/ModuleLayout";
import type { OwnershipResult } from "@/app/api/ownership/route";
import { walkOwnershipChain, type OwnershipGraph } from "@/lib/intelligence/ownershipChain";

// Module 37 — Corporate Ownership Explorer
// Ultimate Beneficial Owner mapping, ownership tree visualisation, and
// shell company risk assessment per FATF R.10, UAE FDL 10/2025 Art.11,
// and CBUAE AML Standards.

const SHELL_RISK_CONFIG = {
  low: { label: "Low", color: "text-green", bg: "bg-green/10 border-green/30" },
  medium: { label: "Medium", color: "text-amber", bg: "bg-amber/10 border-amber/30" },
  high: { label: "High", color: "text-orange", bg: "bg-orange/10 border-orange/30" },
  critical: { label: "Critical", color: "text-red", bg: "bg-red/10 border-red/30" },
} as const;

const ENTITY_TYPE_ICON: Record<string, string> = {
  individual: "👤",
  corporate: "🏢",
  trust: "📜",
  foundation: "🏛",
};

const iCls =
  "w-full bg-bg-1 border border-hair-2 rounded px-2.5 py-1.5 text-12 text-ink-0 focus:outline-none focus:border-brand";

export default function OwnershipPage() {
  const [entityName, setEntityName] = useState("");
  const [jurisdiction, setJurisdiction] = useState("");
  const [registrationNumber, setRegistrationNumber] = useState("");
  const [directors, setDirectors] = useState("");
  const [shareholders, setShareholders] = useState("");

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState<OwnershipResult | null>(null);

  // Static KPI counters (would be dynamic in production)
  const [entitiesCount] = useState(183);
  const [uboCount] = useState(142);
  const [shellAlerts] = useState(29);
  const [multiJurisdiction] = useState(47);

  const mapOwnership = async () => {
    if (!entityName.trim()) {
      setError("Entity name is required.");
      return;
    }
    setError("");
    setLoading(true);
    try {
      const res = await fetch("/api/ownership", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          entityName,
          jurisdiction,
          registrationNumber,
          directors,
          shareholders,
        }),
      });
      const data = (await res.json()) as OwnershipResult;
      setResult(data);
    } catch {
      setError("Request failed — please try again.");
    } finally {
      setLoading(false);
    }
  };

  const shellCfg = result ? SHELL_RISK_CONFIG[result.shellCompanyRisk] : null;

  // ── Deterministic OFAC 50% rule walker ────────────────────────────────
  // Parses the shareholders textarea into an ownership graph, treats any
  // line containing "[SANCTIONED]" or "[OFAC]" or "[UN]" or "[EOCN]" as a
  // designated party, and walks the chain to compute the cumulative
  // designated-party stake at the root entity. Independent of the AI
  // result — runs the moment shareholders are typed.
  const ofacWalk = useMemo(() => {
    if (!entityName.trim() || !shareholders.trim()) return null;
    const nodes: OwnershipGraph["nodes"] = [
      { id: "root", name: entityName.trim(), designated: false },
    ];
    const lines = shareholders.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
    for (let i = 0; i < lines.length; i += 1) {
      const line = lines[i]!;
      // Match "<name> — <pct>%" with optional "[SANCTIONED]" tag
      const m = line.match(/^(.*?)\s*[—\-:]\s*(\d+(?:\.\d+)?)\s*%/);
      if (!m) continue;
      const name = m[1]!.replace(/\[(?:SANCTIONED|OFAC|UN|EOCN|EU|UK)\]/gi, "").trim();
      const pct = Number(m[2]) / 100;
      const designated = /\[(?:SANCTIONED|OFAC|UN|EOCN|EU|UK)\]/i.test(line);
      const regimes = Array.from(line.matchAll(/\[(SANCTIONED|OFAC|UN|EOCN|EU|UK)\]/gi)).map((x) => x[1] ?? "");
      const id = `sh-${i}`;
      nodes.push({
        id,
        name,
        designated,
        ...(designated && regimes.length ? { regimes } : {}),
        owns: [{ toId: "root", pct }],
      });
    }
    if (nodes.length <= 1) return null;
    return walkOwnershipChain({ rootId: "root", nodes });
  }, [entityName, shareholders]);

  return (
    <ModuleLayout
      asanaModule="ownership"
      asanaLabel="Corporate Ownership Explorer"
      engineLabel="Ownership analysis engine"
    >
      <ModuleHero
        moduleNumber={37}
        eyebrow="Module 37 · KYC / Beneficial Ownership"
        title="Ownership"
        titleEm="explorer."
        intro={
          <>
            <strong>FATF R.10 · UAE FDL 10/2025 Art.11 · CBUAE AML Standards §4.</strong>{" "}
            Corporate structure penetration — map UBOs through multi-layer entities, identify shell company
            risk, flag jurisdiction layering, and surface beneficial ownership disclosure gaps.
          </>
        }
        kpis={[
          { value: String(entitiesCount), label: "entities mapped" },
          { value: String(uboCount), label: "UBOs identified" },
          { value: String(shellAlerts), label: "shell company alerts", tone: "amber" },
          { value: String(multiJurisdiction), label: "multi-jurisdiction structures", tone: "amber" },
        ]}
      />

      {/* Input form */}
      <div className="bg-bg-panel border border-hair-2 rounded-xl p-6 mb-6">
        <div className="text-11 font-semibold uppercase tracking-wide-3 text-brand mb-4">
          Entity Information
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
          <div>
            <label className="block text-10 uppercase tracking-wide-3 text-ink-3 mb-1">
              Entity Name <span className="text-red">*</span>
            </label>
            <input
              value={entityName}
              onChange={(e) => setEntityName(e.target.value)}
              placeholder="e.g. Meridian Trade LLC"
              className={iCls}
            />
          </div>
          <div>
            <label className="block text-10 uppercase tracking-wide-3 text-ink-3 mb-1">Jurisdiction</label>
            <input
              value={jurisdiction}
              onChange={(e) => setJurisdiction(e.target.value)}
              placeholder="e.g. UAE — DMCC"
              className={iCls}
            />
          </div>
          <div>
            <label className="block text-10 uppercase tracking-wide-3 text-ink-3 mb-1">Registration Number</label>
            <input
              value={registrationNumber}
              onChange={(e) => setRegistrationNumber(e.target.value)}
              placeholder="e.g. DMCC-123456"
              className={iCls}
            />
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-5">
          <div>
            <label className="block text-10 uppercase tracking-wide-3 text-ink-3 mb-1">
              Directors / Officers
            </label>
            <textarea
              value={directors}
              onChange={(e) => setDirectors(e.target.value)}
              rows={4}
              placeholder={"John Smith — Managing Director (UK national)\nMaria Lopes — Director (Portugal national)\nNominated Director Services LLC — Corporate Director"}
              className="w-full bg-bg-1 border border-hair-2 rounded px-2.5 py-1.5 text-12 text-ink-0 focus:outline-none focus:border-brand leading-snug resize-none"
            />
          </div>
          <div>
            <label className="block text-10 uppercase tracking-wide-3 text-ink-3 mb-1">
              Shareholders / Ownership Structure
            </label>
            <textarea
              value={shareholders}
              onChange={(e) => setShareholders(e.target.value)}
              rows={4}
              placeholder={"Albatross Holdings BV (Netherlands) — 100%\n  └─ Cayman Trust Structure — 100%\n      └─ Unknown beneficial owner"}
              className="w-full bg-bg-1 border border-hair-2 rounded px-2.5 py-1.5 text-12 text-ink-0 focus:outline-none focus:border-brand leading-snug resize-none"
            />
          </div>
        </div>

        {error && <p className="text-11 text-red mb-3">{error}</p>}

        <button
          type="button"
          onClick={() => void mapOwnership()}
          disabled={loading}
          className="text-13 font-semibold px-5 py-2.5 rounded bg-brand text-white hover:bg-brand/90 disabled:opacity-60 transition-colors"
        >
          {loading ? "◌ Mapping Ownership…" : "🔍 Map Ownership"}
        </button>
      </div>

      {/* Results */}
      {result && shellCfg && (
        <div className="flex flex-col gap-5">
          {/* Summary stats */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="bg-bg-panel border border-hair-2 rounded-xl p-4 flex flex-col gap-1">
              <div className="text-10 uppercase tracking-wide-3 text-ink-3 font-semibold">UBO Identified</div>
              <div
                className={`font-mono text-20 font-bold ${result.uboIdentified ? "text-green" : "text-red"}`}
              >
                {result.uboIdentified ? "Yes" : "No"}
              </div>
            </div>
            <div className="bg-bg-panel border border-hair-2 rounded-xl p-4 flex flex-col gap-1">
              <div className="text-10 uppercase tracking-wide-3 text-ink-3 font-semibold">Ownership Layers</div>
              <div
                className={`font-mono text-20 font-bold ${
                  result.ownershipLayers >= 4 ? "text-red" : result.ownershipLayers >= 2 ? "text-amber" : "text-ink-0"
                }`}
              >
                {result.ownershipLayers}
              </div>
            </div>
            <div className={`bg-bg-panel border rounded-xl p-4 flex flex-col gap-1 ${shellCfg.bg}`}>
              <div className="text-10 uppercase tracking-wide-3 text-ink-3 font-semibold">Shell Company Risk</div>
              <div className={`font-mono text-20 font-bold ${shellCfg.color}`}>{shellCfg.label}</div>
            </div>
            <div className="bg-bg-panel border border-hair-2 rounded-xl p-4 flex flex-col gap-1">
              <div className="text-10 uppercase tracking-wide-3 text-ink-3 font-semibold">Jurisdictions</div>
              <div className="font-mono text-20 font-bold text-ink-0">
                {result.jurisdictionLayering.length > 0
                  ? String(
                      new Set(
                        result.jurisdictionLayering[0]
                          ?.split("→")
                          .map((j) => j.trim())
                          .filter(Boolean) ?? [],
                      ).size,
                    )
                  : "—"}
              </div>
            </div>
          </div>

          {/* Ownership tree — indented visual hierarchy (pure CSS) */}
          <div className="bg-bg-panel border border-hair-2 rounded-xl p-5">
            <div className="text-11 font-semibold uppercase tracking-wide-3 text-ink-2 mb-4">
              Ownership Structure Tree
            </div>
            <div className="flex flex-col gap-1">
              {result.ownershipTree.map((node, i) => {
                const indent = node.level * 28;
                const isLast =
                  i === result.ownershipTree.length - 1 ||
                  (result.ownershipTree[i + 1]?.level ?? 0) <= node.level;
                return (
                  <div key={i} className="flex items-start" style={{ paddingLeft: `${indent}px` }}>
                    {node.level > 0 && (
                      <div className="flex flex-col items-center shrink-0 mr-1" style={{ width: "20px" }}>
                        <div
                          className="border-l-2 border-b-2 border-hair-2 rounded-bl"
                          style={{ width: "14px", height: "14px", marginTop: "2px" }}
                        />
                        {!isLast && (
                          <div
                            className="border-l-2 border-hair-2 flex-1"
                            style={{ minHeight: "8px" }}
                          />
                        )}
                      </div>
                    )}
                    <div
                      className={`flex-1 mb-1 rounded-lg border px-3 py-2 ${
                        node.riskFlags.length > 0
                          ? "border-amber/30 bg-amber/5"
                          : "border-hair-2 bg-bg-1"
                      }`}
                    >
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-14">{ENTITY_TYPE_ICON[node.type] ?? "🏢"}</span>
                        <span className="text-12 font-semibold text-ink-0">{node.entity}</span>
                        <span className="font-mono text-11 text-brand font-semibold">
                          {node.ownershipPct}%
                        </span>
                        <span className="text-10 text-ink-3 px-1.5 py-0.5 bg-bg-2 rounded-full">
                          {node.jurisdiction}
                        </span>
                        <span className="text-10 text-ink-3 uppercase tracking-wide">
                          {node.type}
                        </span>
                      </div>
                      {node.riskFlags.length > 0 && (
                        <ul className="list-none p-0 m-0 mt-1.5 flex flex-col gap-0.5">
                          {node.riskFlags.map((flag, fi) => (
                            <li key={fi} className="flex items-start gap-1.5 text-11 text-amber">
                              <span className="shrink-0">⚠</span>
                              {flag}
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Beneficial owners table */}
          {result.beneficialOwners.length > 0 && (
            <div className="bg-bg-panel border border-hair-2 rounded-xl p-5">
              <div className="text-11 font-semibold uppercase tracking-wide-3 text-ink-2 mb-3">
                Beneficial Owners
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-12">
                  <thead>
                    <tr className="border-b border-hair-2">
                      <th className="text-left text-10 uppercase tracking-wide-3 text-ink-3 font-semibold pb-2 pr-4">
                        Name
                      </th>
                      <th className="text-right text-10 uppercase tracking-wide-3 text-ink-3 font-semibold pb-2 pr-4">
                        Direct %
                      </th>
                      <th className="text-right text-10 uppercase tracking-wide-3 text-ink-3 font-semibold pb-2 pr-4">
                        Indirect %
                      </th>
                      <th className="text-left text-10 uppercase tracking-wide-3 text-ink-3 font-semibold pb-2 pr-4">
                        Jurisdiction
                      </th>
                      <th className="text-center text-10 uppercase tracking-wide-3 text-ink-3 font-semibold pb-2 pr-4">
                        PEP
                      </th>
                      <th className="text-center text-10 uppercase tracking-wide-3 text-ink-3 font-semibold pb-2">
                        Sanctions
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-hair">
                    {result.beneficialOwners.map((ubo, i) => (
                      <tr key={i} className={ubo.pepFlag || ubo.sanctionsFlag ? "bg-red/5" : ""}>
                        <td className="py-2 pr-4 font-medium text-ink-0">{ubo.name}</td>
                        <td className="py-2 pr-4 text-right font-mono text-ink-1">{ubo.directPct}%</td>
                        <td className="py-2 pr-4 text-right font-mono text-ink-1">{ubo.indirectPct}%</td>
                        <td className="py-2 pr-4 text-ink-2">{ubo.jurisdiction}</td>
                        <td className="py-2 pr-4 text-center">
                          {ubo.pepFlag ? (
                            <span className="text-10 font-semibold text-amber bg-amber/10 border border-amber/20 px-1.5 py-0.5 rounded">
                              PEP
                            </span>
                          ) : (
                            <span className="text-10 text-ink-3">—</span>
                          )}
                        </td>
                        <td className="py-2 text-center">
                          {ubo.sanctionsFlag ? (
                            <span className="text-10 font-semibold text-red bg-red/10 border border-red/20 px-1.5 py-0.5 rounded">
                              ⚠ Listed
                            </span>
                          ) : (
                            <span className="text-10 text-ink-3">—</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Control structure */}
          <div className="bg-bg-panel border border-hair-2 rounded-xl p-5">
            <div className="text-11 font-semibold uppercase tracking-wide-3 text-ink-2 mb-2">
              Control Structure
            </div>
            <p className="text-12 text-ink-1 leading-relaxed m-0 border-l-2 border-brand pl-3">
              {result.controlStructure}
            </p>
          </div>

          {/* Jurisdiction layering warning */}
          {result.jurisdictionLayering.length > 0 && (
            <div className="bg-amber/5 border border-amber/30 rounded-xl p-5">
              <div className="text-11 font-semibold uppercase tracking-wide-3 text-amber mb-3">
                ⚠ Jurisdiction Layering
              </div>
              <ul className="list-none p-0 m-0 flex flex-col gap-1.5">
                {result.jurisdictionLayering.map((note, i) => (
                  <li key={i} className="flex items-start gap-2 text-12 text-ink-1">
                    <span className="text-amber shrink-0 mt-0.5">›</span>
                    {note}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Red flags + UBO gaps — side by side */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {result.redFlags.length > 0 && (
              <div className="bg-red/5 border border-red/20 rounded-xl p-5">
                <div className="text-11 font-semibold uppercase tracking-wide-3 text-red mb-3">Red Flags</div>
                <ul className="list-none p-0 m-0 flex flex-col gap-2">
                  {result.redFlags.map((flag, i) => (
                    <li key={i} className="flex items-start gap-2 text-12 text-ink-1">
                      <span className="text-red shrink-0 mt-0.5">✕</span>
                      {flag}
                    </li>
                  ))}
                </ul>
              </div>
            )}
            {result.uboDisclosureGaps.length > 0 && (
              <div className="bg-bg-panel border border-hair-2 rounded-xl p-5">
                <div className="text-11 font-semibold uppercase tracking-wide-3 text-ink-2 mb-3">
                  UBO Disclosure Gaps
                </div>
                <ul className="list-none p-0 m-0 flex flex-col gap-2">
                  {result.uboDisclosureGaps.map((gap, i) => (
                    <li key={i} className="flex items-start gap-2 text-12 text-ink-1">
                      <span className="text-amber shrink-0 mt-0.5">⊘</span>
                      {gap}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>

          {/* Recommendation + summary */}
          <div className="bg-bg-panel border border-brand/20 rounded-xl p-5">
            <div className="text-11 font-semibold uppercase tracking-wide-3 text-brand mb-2">
              Recommendation
            </div>
            <p className="text-12 text-ink-1 leading-relaxed mb-4">{result.recommendation}</p>
            <div className="text-11 font-semibold uppercase tracking-wide-3 text-ink-2 mb-2">Summary</div>
            <p className="text-13 text-ink-1 leading-relaxed m-0">{result.summary}</p>
          </div>
        </div>
      )}

      {/* Deterministic OFAC 50% rule walker */}
      {ofacWalk && (
        <div className={`mt-6 rounded-xl border p-5 ${
          ofacWalk.blocked
            ? "border-red/40 bg-red/5"
            : "border-green/40 bg-green/5"
        }`}>
          <div className="flex items-baseline justify-between gap-3 mb-3 flex-wrap">
            <div>
              <div className="text-11 font-semibold uppercase tracking-wide-3 text-brand mb-0.5">
                OFAC 50% rule walker (deterministic)
              </div>
              <div className="text-10 text-ink-3 font-mono">
                Independent walk over the shareholder graph — flags any cumulative designated-party stake ≥ 50% at the root.
                Tag a shareholder line with <code className="text-ink-1">[SANCTIONED]</code>, <code className="text-ink-1">[OFAC]</code>, <code className="text-ink-1">[UN]</code>, <code className="text-ink-1">[EOCN]</code>, <code className="text-ink-1">[EU]</code>, or <code className="text-ink-1">[UK]</code> to mark them as designated.
              </div>
            </div>
            <span className={`text-12 font-bold uppercase ${ofacWalk.blocked ? "text-red" : "text-green"}`}>
              {ofacWalk.blocked ? "BLOCKED" : "CLEAR"}
            </span>
          </div>
          <div className="text-11 font-mono text-ink-2 mb-2">
            Cumulative designated-party stake: <strong className="text-ink-0">{(ofacWalk.cumulativePct * 100).toFixed(1)}%</strong>
            {" · "}{ofacWalk.examinedPaths} paths examined · max depth {ofacWalk.maxDepth}
          </div>
          {ofacWalk.traces.length > 0 && (
            <div className="mt-3">
              <div className="text-10 uppercase tracking-wide-3 text-ink-3 font-semibold mb-1.5">
                Designated-party paths
              </div>
              <ul className="space-y-1.5">
                {ofacWalk.traces.map((t, i) => (
                  <li key={i} className="text-11 text-ink-1">
                    <strong>{t.designatedName}</strong>
                    <span className="font-mono text-ink-2">
                      {" "}→ {(t.effectivePct * 100).toFixed(1)}% effective stake
                    </span>
                    <div className="text-10 text-ink-3 font-mono">
                      path: {t.path.join(" → ")}
                    </div>
                    {t.regimes.length > 0 && (
                      <div className="text-10 text-ink-3">
                        regimes: {t.regimes.join(", ")}
                      </div>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          )}
          {ofacWalk.blocked && (
            <p className="mt-3 text-11 text-red">
              <strong>Action:</strong> OFAC 50% rule is engaged — refuse the relationship absent a specific licence. Verify any
              ownership-chain documentation against the {ofacWalk.traces.length} designated-party path(s) above.
            </p>
          )}
        </div>
      )}
    </ModuleLayout>
  );
}
