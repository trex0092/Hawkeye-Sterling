"use client";

import { useState } from "react";
import { ModuleHero, ModuleLayout } from "@/components/layout/ModuleLayout";
import { RowActions } from "@/components/shared/RowActions";

// ── UBO AI Risk types ─────────────────────────────────────────────────────────
interface UboRisk {
  ok: boolean;
  overallRisk: "critical" | "high" | "medium" | "low";
  riskNarrative: string;
  ownershipStructureRisk: string;
  pepRiskFlags: string[];
  nationalityRisks: string[];
  cddGaps: string[];
  recommendedActions: string[];
  regulatoryBasis: string;
  eddRequired: boolean;
  sanctionsScreeningRequired: boolean;
}

const UBO_RISK_TONE: Record<string, string> = {
  critical: "bg-red-dim text-red border-red/30",
  high:     "bg-red-dim text-red border-red/30",
  medium:   "bg-amber-dim text-amber border-amber/30",
  low:      "bg-green-dim text-green border-green/30",
};

// Beneficial Owner Declaration — public-facing form. Your tenants send
// a link to their customers, who fill in UBO info that auto-populates
// the Ownership tab on the subject panel.

interface UboEntry {
  name: string;
  dob: string;
  nationality: string;
  gender: string;
  ownershipPct: string;
  role: string;
}

const EMPTY_UBO: UboEntry = {
  name: "",
  dob: "",
  nationality: "",
  gender: "",
  ownershipPct: "",
  role: "",
};

export default function UboDeclarationPage() {
  const [entity, setEntity] = useState("");
  const [registered, setRegistered] = useState("");
  const [ubos, setUbos] = useState<UboEntry[]>([{ ...EMPTY_UBO }]);
  const [submitted, setSubmitted] = useState(false);
  const [uboRisk, setUboRisk] = useState<UboRisk | null>(null);
  const [uboRiskLoading, setUboRiskLoading] = useState(false);

  const inputCls =
    "w-full text-12 px-3 py-1.5 rounded border border-hair-2 bg-bg-panel text-ink-0";

  const update = (idx: number, key: keyof UboEntry, value: string) => {
    const next = [...ubos];
    next[idx] = { ...next[idx]!, [key]: value };
    setUbos(next);
  };

  const addUbo = () => setUbos([...ubos, { ...EMPTY_UBO }]);
  const removeUbo = (idx: number) =>
    setUbos(ubos.filter((_, i) => i !== idx));

  const totalPct = ubos.reduce(
    (a, u) => a + (parseFloat(u.ownershipPct) || 0),
    0,
  );

  const assessUboRisk = async (entityName: string, registeredIn: string, uboList: UboEntry[]) => {
    setUboRiskLoading(true);
    try {
      const res = await fetch("/api/ubo-risk", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ entity: entityName, registered: registeredIn, ubos: uboList }),
      });
      if (res.ok) {
        const data = (await res.json()) as UboRisk;
        setUboRisk(data);
      } else {
        console.error(`[hawkeye] ubo-risk HTTP ${res.status}`);
      }
    } catch (err) {
      console.error("[hawkeye] ubo-risk threw:", err);
    } finally {
      setUboRiskLoading(false);
    }
  };

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitted(true);
    void assessUboRisk(entity, registered, ubos);
  };

  if (submitted) {
    return (
      <ModuleLayout asanaModule="ubo-declaration" asanaLabel="UBO Declaration">
        <div className="flex flex-col items-center min-h-[60vh] gap-6 pt-10">
          <div className="max-w-md w-full bg-bg-panel border border-hair-2 rounded-lg p-8 text-center">
            <div className="text-24 mb-3">✓</div>
            <h1 className="font-display text-24 text-ink-0 m-0 mb-3">
              UBO declaration received
            </h1>
            <p className="text-12 text-ink-2 leading-relaxed">
              Thank you. The declared ownership structure will be verified
              against public registers and cross-screened for PEP /
              sanctions exposure. The compliance team will be in touch
              within 3 business days.
            </p>
            <div className="mt-4 font-mono text-10 text-ink-3">
              Reference: UBO-{Date.now().toString().slice(-6)}
            </div>
          </div>

          {/* AI Risk Assessment panel */}
          <div className="max-w-2xl w-full">
            {uboRiskLoading && !uboRisk && (
              <div className="bg-bg-panel border border-hair-2 rounded-lg p-6 flex items-center justify-center gap-3">
                <div className="w-4 h-4 rounded-full border-2 border-brand border-t-transparent animate-spin" />
                <span className="text-12 text-ink-2">Running AI risk assessment…</span>
              </div>
            )}

            {uboRisk && (
              <div className="bg-bg-panel border border-amber/30 rounded-xl p-5 space-y-4">
                <div className="flex items-center gap-3 flex-wrap">
                  <span className="text-11 font-semibold uppercase tracking-wide-3 text-amber">AI UBO Risk Assessment</span>
                  <span className={`inline-flex items-center px-2 py-0.5 rounded font-mono text-10 font-semibold uppercase border ${UBO_RISK_TONE[uboRisk.overallRisk] ?? "bg-bg-2 text-ink-3 border-hair-2"}`}>
                    {uboRisk.overallRisk}
                  </span>
                  {uboRisk.eddRequired && (
                    <span className="inline-flex items-center px-2 py-0.5 rounded font-mono text-10 font-semibold uppercase bg-red-dim text-red border border-red/40">
                      EDD Required
                    </span>
                  )}
                  {uboRisk.sanctionsScreeningRequired && (
                    <span className="inline-flex items-center px-2 py-0.5 rounded font-mono text-10 font-semibold uppercase bg-amber-dim text-amber border border-amber/40">
                      Sanctions Screening Required
                    </span>
                  )}
                </div>

                <p className="text-12 text-ink-1">{uboRisk.riskNarrative}</p>

                {uboRisk.ownershipStructureRisk && (
                  <div>
                    <div className="text-10 font-semibold uppercase tracking-wide-3 text-ink-2 mb-1">Ownership structure</div>
                    <p className="text-12 text-ink-1">{uboRisk.ownershipStructureRisk}</p>
                  </div>
                )}

                {uboRisk.cddGaps.length > 0 && (
                  <div>
                    <div className="text-10 font-semibold uppercase tracking-wide-3 text-ink-2 mb-1">CDD gaps</div>
                    <ul className="list-disc list-inside space-y-0.5">
                      {uboRisk.cddGaps.map((g, i) => (
                        <li key={i} className="text-12 text-ink-1">{g}</li>
                      ))}
                    </ul>
                  </div>
                )}

                {uboRisk.pepRiskFlags.length > 0 && (
                  <div>
                    <div className="text-10 font-semibold uppercase tracking-wide-3 text-red mb-1">PEP risk flags</div>
                    <ul className="list-disc list-inside space-y-0.5">
                      {uboRisk.pepRiskFlags.map((f, i) => (
                        <li key={i} className="text-12 text-red">{f}</li>
                      ))}
                    </ul>
                  </div>
                )}

                {uboRisk.nationalityRisks.length > 0 && (
                  <div>
                    <div className="text-10 font-semibold uppercase tracking-wide-3 text-ink-2 mb-1">Nationality risks</div>
                    <ul className="list-disc list-inside space-y-0.5">
                      {uboRisk.nationalityRisks.map((r, i) => (
                        <li key={i} className="text-12 text-ink-1">{r}</li>
                      ))}
                    </ul>
                  </div>
                )}

                {uboRisk.recommendedActions.length > 0 && (
                  <div>
                    <div className="text-10 font-semibold uppercase tracking-wide-3 text-ink-2 mb-1">Recommended actions</div>
                    <ul className="list-disc list-inside space-y-0.5">
                      {uboRisk.recommendedActions.map((a, i) => (
                        <li key={i} className="text-12 text-ink-1">{a}</li>
                      ))}
                    </ul>
                  </div>
                )}

                {uboRisk.regulatoryBasis && (
                  <div>
                    <div className="text-10 font-semibold uppercase tracking-wide-3 text-ink-2 mb-1">Regulatory basis</div>
                    <code className="font-mono text-10 text-ink-1 break-all">{uboRisk.regulatoryBasis}</code>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </ModuleLayout>
    );
  }

  return (
    <ModuleLayout asanaModule="ubo-declaration" asanaLabel="UBO Declaration">
      <div>
        <ModuleHero
          moduleNumber={13}
          eyebrow="Module 21 · Public-facing form"
          title="Beneficial owner"
          titleEm="declaration."
          intro={
            <>
              <strong>UAE Cabinet Resolution No. 58 of 2020 / FDL 10/2025 Art.19.</strong>{" "}
              All entities must declare their natural-person beneficial
              owners holding ≥ 25% ownership, control, or voting rights.
              Fill in the form below.
            </>
          }
        />

        <form
          onSubmit={submit}
          className="bg-bg-panel border border-hair-2 rounded-lg p-5 mt-6 space-y-4"
        >
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div>
              <label className="block text-10 uppercase tracking-wide-3 text-ink-2 font-semibold mb-1">
                Registered entity name *
              </label>
              <input
                required
                value={entity}
                onChange={(e) => setEntity(e.target.value)}
                placeholder="e.g. Fine Gold LLC"
                className={inputCls}
              />
            </div>
            <div>
              <label className="block text-10 uppercase tracking-wide-3 text-ink-2 font-semibold mb-1">
                Country of registration *
              </label>
              <input
                required
                value={registered}
                onChange={(e) => setRegistered(e.target.value)}
                placeholder="e.g. UAE"
                className={inputCls}
              />
            </div>
          </div>

          <hr className="border-hair" />

          <div className="flex items-center justify-between">
            <h2 className="text-13 font-semibold text-ink-0 m-0">
              Beneficial owners
            </h2>
            <span className={`font-mono text-11 ${totalPct > 100 ? "text-red" : totalPct === 100 ? "text-green" : "text-ink-2"}`}>
              total: {totalPct}%
            </span>
          </div>

          {ubos.map((u, idx) => (
            <div
              key={`ubo-${idx}`}
              className="bg-bg-1 rounded p-3 space-y-2"
            >
              <div className="flex items-center justify-between">
                <span className="text-10 uppercase tracking-wide-3 text-ink-2 font-semibold">
                  UBO #{idx + 1}
                </span>
                {ubos.length > 1 && (
                  <RowActions
                    label={`UBO #${idx + 1}`}
                    onDelete={() => removeUbo(idx)}
                    confirmDelete={false}
                  />
                )}
              </div>
              <div className="grid grid-cols-[2fr_1.5fr_120px_80px] gap-2">
                <input
                  value={u.name}
                  onChange={(e) => update(idx, "name", e.target.value)}
                  placeholder="Full legal name"
                  className={inputCls}
                />
                <input
                  value={u.nationality}
                  onChange={(e) => update(idx, "nationality", e.target.value)}
                  placeholder="Nationality / country"
                  className={inputCls}
                />
                <select
                  value={u.gender}
                  onChange={(e) => update(idx, "gender", e.target.value)}
                  className={inputCls}
                >
                  <option value="">Gender</option>
                  <option value="male">Male</option>
                  <option value="female">Female</option>
                </select>
                <input
                  value={u.ownershipPct}
                  onChange={(e) => update(idx, "ownershipPct", e.target.value.replace(/[^\d.]/g, ""))}
                  placeholder="%"
                  className={inputCls}
                />
              </div>
            </div>
          ))}

          <button
            type="button"
            onClick={addUbo}
            className="text-11 font-semibold px-3 py-1.5 rounded bg-brand-dim text-brand border border-brand/40 hover:bg-brand/20 transition-colors"
          >
            + Add UBO
          </button>

          <div className="border-t border-hair pt-4 flex items-center justify-between">
            <div className="text-10 text-ink-3">
              By submitting you certify the declaration is accurate under FDL
              10/2025 Art.29 (false-statement offence).
            </div>
            <button
              type="submit"
              className="text-12 font-semibold px-4 py-2 rounded bg-brand text-white border border-brand hover:bg-brand-hover hover:border-brand-hover transition-colors"
            >
              Submit declaration
            </button>
          </div>
        </form>
      </div>
    </ModuleLayout>
  );
}
