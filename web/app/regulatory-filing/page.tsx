"use client";

import { useCallback, useState } from "react";
import { ModuleHero, ModuleLayout } from "@/components/layout/ModuleLayout";
import { apiErrorMessage, caughtErrorMessage } from "@/lib/client/error-utils";

// ─── Types ────────────────────────────────────────────────────────────────────

type Jurisdiction = "AU" | "CA" | "SG" | "AE" | "INT";

interface JurisdictionMeta {
  code: Jurisdiction;
  label: string;
  name: string;
  reportTypes: string[];
  format: "XML" | "JSON";
  endpoint: string;
}

const JURISDICTIONS: JurisdictionMeta[] = [
  {
    code: "AU",
    label: "AU — AUSTRAC",
    name: "Australia - AUSTRAC",
    reportTypes: ["SMR", "TTR"],
    format: "XML",
    endpoint: "/api/regulatory/austrac",
  },
  {
    code: "CA",
    label: "CA — FINTRAC",
    name: "Canada - FINTRAC",
    reportTypes: ["STR", "LCT", "EFT"],
    format: "XML",
    endpoint: "/api/regulatory/fintrac",
  },
  {
    code: "SG",
    label: "SG — MAS",
    name: "Singapore - MAS",
    reportTypes: ["STR"],
    format: "JSON",
    endpoint: "/api/regulatory/mas",
  },
  {
    code: "AE",
    label: "AE — DFSA",
    name: "UAE - DFSA",
    reportTypes: ["STR"],
    format: "XML",
    endpoint: "/api/regulatory/dfsa",
  },
  {
    code: "INT",
    label: "INT — goAML",
    name: "goAML (UN/FATF)",
    reportTypes: ["STR", "SAR"],
    format: "XML",
    endpoint: "/api/reports/goaml",
  },
];

// ─── Checklist steps ──────────────────────────────────────────────────────────

const PORTAL_URLS: Record<Jurisdiction, string> = {
  AU: "https://online.austrac.gov.au",
  CA: "https://www.fintrac-canafe.gc.ca/reporting-declaration/Info/rptAML-eng",
  SG: "https://www.mas.gov.sg/regulation/anti-money-laundering/suspicious-transaction-reporting",
  AE: "https://www.dfsa.ae/reports",
  INT: "https://goaml.unodc.org",
};

interface ChecklistStep {
  id: string;
  label: string;
  description: string;
}

function checklistFor(jur: Jurisdiction, format: "XML" | "JSON"): ChecklistStep[] {
  return [
    {
      id: "generate",
      label: "Generate the report file",
      description: `Complete the form and click "Generate ${format}" to download the filing document.`,
    },
    {
      id: "review",
      label: "Review and verify content",
      description:
        "Open the downloaded file and verify all fields — subject name, narrative, amounts — are accurate before submission.",
    },
    {
      id: "upload",
      label: `Upload to ${JURISDICTIONS.find((j) => j.code === jur)?.name ?? jur} portal`,
      description: `Log in to the regulator portal at ${PORTAL_URLS[jur]} and upload the generated file through the secure submission interface.`,
    },
    {
      id: "retain",
      label: "Retain a certified copy",
      description:
        "Store the filed document in the case management system for at least 5 years per AML/CFT record-keeping requirements.",
    },
    {
      id: "casenotes",
      label: "Update case notes",
      description:
        "Record the submission reference number, submission timestamp, and submitting analyst name in the case timeline.",
    },
    {
      id: "mlro",
      label: "Notify MLRO",
      description:
        "Confirm submission with the MLRO and obtain sign-off that the filing is complete and the case status updated accordingly.",
    },
  ];
}

// ─── Form state per jurisdiction ──────────────────────────────────────────────

interface BaseFields {
  caseId: string;
  subjectName: string;
  narrative: string;
  analystName: string;
}

interface AustracFields extends BaseFields {
  reportType: "SMR" | "TTR";
  amount: string;
  currency: string;
}

interface FintracFields extends BaseFields {
  reportType: "STR" | "LCT" | "EFT";
  amount: string;
  currency: string;
}

interface MasFields extends BaseFields {
  suspiciousActivities: string; // newline-separated
}

interface DfsaFields extends BaseFields {
  riskLevel: "high" | "medium" | "low";
}

interface IntFields extends BaseFields {
  reportCode: "STR" | "SAR";
  amount: string;
  currency: string;
  entityType: "individual" | "organisation";
}

// ─── Shared classes ───────────────────────────────────────────────────────────

const inputCls =
  "w-full text-13 px-3 py-2 rounded border border-hair-2 bg-bg-panel text-ink-0 focus:outline-none focus:border-brand";
const labelCls = "block text-11 font-mono uppercase tracking-wide-8 text-ink-2 mb-1";
const selectCls =
  "w-full text-13 px-3 py-2 rounded border border-hair-2 bg-bg-panel text-ink-0 focus:outline-none focus:border-brand";
const textareaCls =
  "w-full text-13 px-3 py-2 rounded border border-hair-2 bg-bg-panel text-ink-0 resize-none focus:outline-none focus:border-brand";

// ─── Sub-forms ────────────────────────────────────────────────────────────────

function BaseFormFields({
  values,
  onChange,
}: {
  values: BaseFields;
  onChange: (_field: keyof BaseFields, _value: string) => void;
}) {
  return (
    <>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <label className={labelCls}>Case ID *</label>
          <input
            className={inputCls}
            value={values.caseId}
            onChange={(e) => onChange("caseId", e.target.value)}
            placeholder="e.g. HWK-2026-0001"
          />
        </div>
        <div>
          <label className={labelCls}>Analyst Name *</label>
          <input
            className={inputCls}
            value={values.analystName}
            onChange={(e) => onChange("analystName", e.target.value)}
            placeholder="Full name of submitting analyst"
          />
        </div>
      </div>
      <div>
        <label className={labelCls}>Subject Name *</label>
        <input
          className={inputCls}
          value={values.subjectName}
          onChange={(e) => onChange("subjectName", e.target.value)}
          placeholder="Individual or entity being reported"
        />
      </div>
      <div>
        <label className={labelCls}>Narrative *</label>
        <textarea
          className={textareaCls}
          rows={6}
          value={values.narrative}
          onChange={(e) => onChange("narrative", e.target.value)}
          placeholder="Describe the suspicious activity, transaction patterns, and basis for filing..."
        />
      </div>
    </>
  );
}

// ─── Main page component ──────────────────────────────────────────────────────

export default function RegulatoryFilingPage() {
  const [jurisdiction, setJurisdiction] = useState<Jurisdiction>("AU");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  // Per-jurisdiction form state
  const [austrac, setAustrac] = useState<AustracFields>({
    caseId: "", subjectName: "", narrative: "", analystName: "",
    reportType: "SMR", amount: "", currency: "AUD",
  });
  const [fintrac, setFintrac] = useState<FintracFields>({
    caseId: "", subjectName: "", narrative: "", analystName: "",
    reportType: "STR", amount: "", currency: "CAD",
  });
  const [mas, setMas] = useState<MasFields>({
    caseId: "", subjectName: "", narrative: "", analystName: "",
    suspiciousActivities: "",
  });
  const [dfsa, setDfsa] = useState<DfsaFields>({
    caseId: "", subjectName: "", narrative: "", analystName: "",
    riskLevel: "high",
  });
  const [intGoAml, setIntGoAml] = useState<IntFields>({
    caseId: "", subjectName: "", narrative: "", analystName: "",
    reportCode: "STR", amount: "", currency: "AED", entityType: "individual",
  });

  const jurisMeta = JURISDICTIONS.find((j) => j.code === jurisdiction)!;
  const checklist = checklistFor(jurisdiction, jurisMeta.format);

  // ── Submit handler ──────────────────────────────────────────────────────────

  const handleSubmit = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      setError(null);
      setSuccess(null);
      setLoading(true);

      try {
        let body: Record<string, unknown>;
        let endpoint: string;
        let filenameHint: string;

        if (jurisdiction === "AU") {
          body = {
            caseId: austrac.caseId,
            subjectName: austrac.subjectName,
            narrative: austrac.narrative,
            analystName: austrac.analystName,
            reportType: austrac.reportType,
            ...(austrac.amount ? { amount: parseFloat(austrac.amount), currency: austrac.currency } : {}),
          };
          endpoint = "/api/regulatory/austrac";
          filenameHint = `AUSTRAC_${austrac.reportType}_${austrac.caseId}.xml`;
        } else if (jurisdiction === "CA") {
          body = {
            caseId: fintrac.caseId,
            subjectName: fintrac.subjectName,
            narrative: fintrac.narrative,
            analystName: fintrac.analystName,
            reportType: fintrac.reportType,
            ...(fintrac.amount ? { amount: parseFloat(fintrac.amount), currency: fintrac.currency } : {}),
          };
          endpoint = "/api/regulatory/fintrac";
          filenameHint = `FINTRAC_${fintrac.reportType}_${fintrac.caseId}.xml`;
        } else if (jurisdiction === "SG") {
          body = {
            caseId: mas.caseId,
            subjectName: mas.subjectName,
            narrative: mas.narrative,
            analystName: mas.analystName,
            suspiciousActivity: mas.suspiciousActivities
              .split("\n")
              .map((s) => s.trim())
              .filter(Boolean),
          };
          endpoint = "/api/regulatory/mas";
          filenameHint = `MAS_STR_${mas.caseId}.json`;
        } else if (jurisdiction === "AE") {
          body = {
            caseId: dfsa.caseId,
            subjectName: dfsa.subjectName,
            narrative: dfsa.narrative,
            analystName: dfsa.analystName,
            riskLevel: dfsa.riskLevel,
          };
          endpoint = "/api/regulatory/dfsa";
          filenameHint = `DFSA_STR_${dfsa.caseId}.xml`;
        } else {
          // INT — goAML
          body = {
            reportCode: intGoAml.reportCode,
            subject: {
              name: intGoAml.subjectName,
              entityType: intGoAml.entityType,
              caseId: intGoAml.caseId,
            },
            narrative: intGoAml.narrative,
            ...(intGoAml.amount ? { amount: parseFloat(intGoAml.amount), currency: intGoAml.currency } : {}),
          };
          endpoint = "/api/reports/goaml";
          filenameHint = `goaml-${intGoAml.reportCode.toLowerCase()}-${intGoAml.caseId}.xml`;
        }

        const res = await fetch(endpoint, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });

        if (!res.ok) {
          const errData = await res.json().catch(() => ({ error: "unknown error" }));
          throw new Error((errData as { error?: string; message?: string }).message ?? (errData as { error?: string }).error ?? apiErrorMessage(res.status, "Regulatory filing"));
        }

        // Trigger file download from the response blob
        const blob = await res.blob();
        const url = URL.createObjectURL(blob);
        const anchor = document.createElement("a");
        anchor.href = url;
        // Use content-disposition filename if available, otherwise our hint
        const cd = res.headers.get("content-disposition") ?? "";
        const match = /filename="([^"]+)"/.exec(cd);
        anchor.download = match?.[1] ?? filenameHint;
        document.body.appendChild(anchor);
        anchor.click();
        anchor.remove();
        URL.revokeObjectURL(url);

        setSuccess(
          `${jurisMeta.name} filing generated. Follow the checklist to complete submission.`,
        );
      } catch (err) {
        setError(caughtErrorMessage(err, "Filing generation failed."));
      } finally {
        setLoading(false);
      }
    },
    [jurisdiction, austrac, fintrac, mas, dfsa, intGoAml, jurisMeta],
  );

  // ── Jurisdiction-specific form sections ─────────────────────────────────────

  function AustracForm() {
    return (
      <>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div>
            <label className={labelCls}>Report Type *</label>
            <select
              className={selectCls}
              value={austrac.reportType}
              onChange={(e) =>
                setAustrac((p) => ({ ...p, reportType: e.target.value as "SMR" | "TTR" }))
              }
            >
              <option value="SMR">SMR — Suspicious Matter Report</option>
              <option value="TTR">TTR — Threshold Transaction Report</option>
            </select>
          </div>
          <div>
            <label className={labelCls}>Amount (optional)</label>
            <input
              type="number"
              min="0"
              step="0.01"
              className={inputCls}
              value={austrac.amount}
              onChange={(e) => setAustrac((p) => ({ ...p, amount: e.target.value }))}
              placeholder="0.00"
            />
          </div>
          <div>
            <label className={labelCls}>Currency</label>
            <input
              className={inputCls}
              value={austrac.currency}
              onChange={(e) => setAustrac((p) => ({ ...p, currency: e.target.value }))}
              placeholder="AUD"
              maxLength={3}
            />
          </div>
        </div>
        <BaseFormFields
          values={austrac}
          onChange={(f, v) => setAustrac((p) => ({ ...p, [f]: v }))}
        />
      </>
    );
  }

  function FintracForm() {
    return (
      <>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div>
            <label className={labelCls}>Report Type *</label>
            <select
              className={selectCls}
              value={fintrac.reportType}
              onChange={(e) =>
                setFintrac((p) => ({
                  ...p,
                  reportType: e.target.value as "STR" | "LCT" | "EFT",
                }))
              }
            >
              <option value="STR">STR — Suspicious Transaction Report</option>
              <option value="LCT">LCT — Large Cash Transaction Report</option>
              <option value="EFT">EFT — Electronic Funds Transfer Report</option>
            </select>
          </div>
          <div>
            <label className={labelCls}>Amount (optional)</label>
            <input
              type="number"
              min="0"
              step="0.01"
              className={inputCls}
              value={fintrac.amount}
              onChange={(e) => setFintrac((p) => ({ ...p, amount: e.target.value }))}
              placeholder="0.00"
            />
          </div>
          <div>
            <label className={labelCls}>Currency</label>
            <input
              className={inputCls}
              value={fintrac.currency}
              onChange={(e) => setFintrac((p) => ({ ...p, currency: e.target.value }))}
              placeholder="CAD"
              maxLength={3}
            />
          </div>
        </div>
        <BaseFormFields
          values={fintrac}
          onChange={(f, v) => setFintrac((p) => ({ ...p, [f]: v }))}
        />
      </>
    );
  }

  function MasForm() {
    return (
      <>
        <BaseFormFields
          values={mas}
          onChange={(f, v) => setMas((p) => ({ ...p, [f]: v }))}
        />
        <div>
          <label className={labelCls}>Suspicious Activities *</label>
          <textarea
            className={textareaCls}
            rows={4}
            value={mas.suspiciousActivities}
            onChange={(e) => setMas((p) => ({ ...p, suspiciousActivities: e.target.value }))}
            placeholder={"One activity per line, e.g.:\nUnusual cash deposits\nStructuring transactions\nMismatch between stated business and transaction volumes"}
          />
          <p className="text-11 text-ink-3 mt-1">Enter one suspicious activity indicator per line.</p>
        </div>
      </>
    );
  }

  function DfsaForm() {
    return (
      <>
        <div>
          <label className={labelCls}>Risk Level *</label>
          <select
            className={selectCls}
            value={dfsa.riskLevel}
            onChange={(e) =>
              setDfsa((p) => ({ ...p, riskLevel: e.target.value as "high" | "medium" | "low" }))
            }
          >
            <option value="high">High</option>
            <option value="medium">Medium</option>
            <option value="low">Low</option>
          </select>
        </div>
        <BaseFormFields
          values={dfsa}
          onChange={(f, v) => setDfsa((p) => ({ ...p, [f]: v }))}
        />
      </>
    );
  }

  function IntForm() {
    return (
      <>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className={labelCls}>Report Code *</label>
            <select
              className={selectCls}
              value={intGoAml.reportCode}
              onChange={(e) =>
                setIntGoAml((p) => ({ ...p, reportCode: e.target.value as "STR" | "SAR" }))
              }
            >
              <option value="STR">STR — Suspicious Transaction Report</option>
              <option value="SAR">SAR — Suspicious Activity Report</option>
            </select>
          </div>
          <div>
            <label className={labelCls}>Entity Type *</label>
            <select
              className={selectCls}
              value={intGoAml.entityType}
              onChange={(e) =>
                setIntGoAml((p) => ({
                  ...p,
                  entityType: e.target.value as "individual" | "organisation",
                }))
              }
            >
              <option value="individual">Individual</option>
              <option value="organisation">Organisation</option>
            </select>
          </div>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className={labelCls}>Amount (optional)</label>
            <input
              type="number"
              min="0"
              step="0.01"
              className={inputCls}
              value={intGoAml.amount}
              onChange={(e) => setIntGoAml((p) => ({ ...p, amount: e.target.value }))}
              placeholder="0.00"
            />
          </div>
          <div>
            <label className={labelCls}>Currency</label>
            <input
              className={inputCls}
              value={intGoAml.currency}
              onChange={(e) => setIntGoAml((p) => ({ ...p, currency: e.target.value }))}
              placeholder="AED"
              maxLength={3}
            />
          </div>
        </div>
        <BaseFormFields
          values={intGoAml}
          onChange={(f, v) => setIntGoAml((p) => ({ ...p, [f]: v }))}
        />
      </>
    );
  }

  // ── Render ──────────────────────────────────────────────────────────────────

  return (
    <ModuleLayout asanaModule="regulatory-filing" asanaLabel="Regulatory Filing">
      <div className="px-6 py-6 max-w-[900px]">
        <ModuleHero
          eyebrow=""
          title="Regulatory"
          titleEm="Filing."
          intro={
            <p className="text-14 text-ink-2 mt-2 max-w-prose">
              Generate structured filing documents for multiple regulatory jurisdictions.
              Select a jurisdiction, complete the adaptive form, and download the generated
              XML or JSON. Each file must be submitted to the appropriate regulator portal
              — this tool does not submit directly.
            </p>
          }
        />

        {/* Jurisdiction selector */}
        <div className="mb-6">
          <label className={labelCls}>Jurisdiction</label>
          <div className="flex flex-wrap gap-2 mt-1">
            {JURISDICTIONS.map((j) => (
              <button
                key={j.code}
                type="button"
                onClick={() => {
                  setJurisdiction(j.code);
                  setError(null);
                  setSuccess(null);
                }}
                className={[
                  "px-3 py-1.5 rounded border text-13 font-mono transition-colors",
                  jurisdiction === j.code
                    ? "border-brand bg-brand/10 text-brand"
                    : "border-hair-2 bg-bg-panel text-ink-2 hover:border-brand/60 hover:text-ink-0",
                ].join(" ")}
              >
                {j.label}
              </button>
            ))}
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-[1fr_320px] gap-6">
          {/* ── Filing form ─────────────────────────────────────────────────── */}
          <div className="bg-bg-panel border border-hair-2 rounded-lg p-6">
            <div className="flex items-center justify-between mb-5">
              <div>
                <h2 className="text-15 font-semibold text-ink-0 m-0">{jurisMeta.name}</h2>
                <p className="text-11 font-mono text-ink-3 mt-0.5">
                  Format: {jurisMeta.format} &middot; Report types:{" "}
                  {jurisMeta.reportTypes.join(", ")}
                </p>
              </div>
              <span className="px-2 py-0.5 rounded text-11 font-mono bg-brand/10 text-brand border border-brand/30">
                {jurisMeta.code}
              </span>
            </div>

            <form onSubmit={handleSubmit} className="flex flex-col gap-4">
              {jurisdiction === "AU" && <AustracForm />}
              {jurisdiction === "CA" && <FintracForm />}
              {jurisdiction === "SG" && <MasForm />}
              {jurisdiction === "AE" && <DfsaForm />}
              {jurisdiction === "INT" && <IntForm />}

              {error && (
                <div className="rounded border border-red/40 bg-red/8 px-3 py-2 text-13 text-red">
                  {error}
                </div>
              )}
              {success && (
                <div className="rounded border border-green/40 bg-green/8 px-3 py-2 text-13 text-green">
                  {success}
                </div>
              )}

              <button
                type="submit"
                disabled={loading}
                className="w-full mt-2 py-2.5 px-4 rounded bg-brand text-white font-semibold text-14 hover:bg-brand/90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                {loading
                  ? "Generating…"
                  : `Generate ${jurisMeta.format} — ${jurisMeta.name}`}
              </button>
            </form>
          </div>

          {/* ── Submission checklist sidebar ─────────────────────────────────── */}
          <div className="bg-bg-panel border border-hair-2 rounded-lg p-5 h-fit">
            <h3 className="text-13 font-semibold text-ink-0 mb-4 m-0 flex items-center gap-2">
              <span className="w-1.5 h-1.5 rounded-full bg-brand shrink-0" />
              Submission Checklist
            </h3>
            <ol className="flex flex-col gap-4 list-none m-0 p-0">
              {checklist.map((step, idx) => (
                <li key={step.id} className="flex gap-3">
                  <span className="flex-shrink-0 w-6 h-6 rounded-full border border-hair-2 bg-bg-2 flex items-center justify-center text-11 font-mono text-ink-2">
                    {idx + 1}
                  </span>
                  <div>
                    <p className="text-13 font-medium text-ink-0 m-0 mb-0.5">{step.label}</p>
                    <p className="text-11 text-ink-3 m-0 leading-relaxed">{step.description}</p>
                  </div>
                </li>
              ))}
            </ol>

            <div className="mt-5 pt-4 border-t border-hair-2">
              <p className="text-11 text-ink-3 m-0">
                <span className="font-medium text-amber">Notice:</span> This tool generates
                filing documents only. Actual submission requires uploading to the
                regulator&apos;s portal. Retain all submissions for at least 5 years.
              </p>
            </div>

            <div className="mt-4">
              <a
                href={PORTAL_URLS[jurisdiction]}
                target="_blank"
                rel="noreferrer noopener"
                className="block text-center text-12 font-mono text-brand border border-brand/30 rounded py-1.5 hover:bg-brand/10 transition-colors"
              >
                Open {jurisMeta.name} Portal
              </a>
            </div>
          </div>
        </div>
      </div>
    </ModuleLayout>
  );
}
