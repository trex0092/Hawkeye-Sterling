"use client";

import { useState } from "react";
import { ModuleLayout, ModuleHero } from "@/components/layout/ModuleLayout";
import type { EntityGraphResult } from "@/app/api/entity-graph/route";
import type { LeiLookupResult } from "@/app/api/lei-lookup/route";

// ── Shared style constants ─────────────────────────────────────────────────

const inputCls =
  "w-full px-3 py-2 border border-hair-2 rounded text-13 bg-bg-1 focus:outline-none focus:border-brand text-ink-0 placeholder-ink-3";
const btnPrimary =
  "px-4 py-1.5 rounded bg-brand text-white text-12 font-semibold disabled:opacity-40 disabled:cursor-not-allowed hover:opacity-90 transition-opacity";
const sectionHeading =
  "text-11 font-semibold uppercase tracking-wide-3 text-ink-2 mb-3";
const cardCls = "border border-hair-2 rounded-lg p-4";
const tdCls = "px-3 py-2 text-12 text-ink-0";
const thCls =
  "text-left px-3 py-2 text-10 uppercase tracking-wide-3 text-ink-2 font-mono font-semibold";

const JURISDICTIONS = [
  { code: "", label: "Any jurisdiction" },
  { code: "ae", label: "UAE" },
  { code: "vg", label: "BVI" },
  { code: "ky", label: "Cayman Islands" },
  { code: "sc", label: "Seychelles" },
  { code: "gb", label: "United Kingdom" },
  { code: "sg", label: "Singapore" },
  { code: "ch", label: "Switzerland" },
  { code: "pa", label: "Panama" },
  { code: "ws", label: "Samoa" },
  { code: "lu", label: "Luxembourg" },
  { code: "nl", label: "Netherlands" },
  { code: "hk", label: "Hong Kong" },
  { code: "", label: "Other" },
] as const;

// ── Small helper components ─────────────────────────────────────────────────

function StatusBadge({ status }: { status: string }) {
  const tone =
    status === "active" || status === "ISSUED"
      ? "bg-green-dim text-green"
      : status === "dissolved" || status === "RETIRED" || status === "LAPSED"
        ? "bg-red-dim text-red"
        : status === "PENDING_TRANSFER" || status === "PENDING_ARCHIVAL"
          ? "bg-amber-dim text-amber"
          : "bg-bg-2 text-ink-3";
  return (
    <span
      className={`inline-block text-10 font-semibold uppercase px-2 py-px rounded tracking-wide-2 ${tone}`}
    >
      {status}
    </span>
  );
}

function DataQualityBadge({ quality }: { quality: "high" | "medium" | "low" }) {
  const tone =
    quality === "high"
      ? "bg-green-dim text-green border border-green/25"
      : quality === "medium"
        ? "bg-amber-dim text-amber border border-amber/25"
        : "bg-red-dim text-red border border-red/25";
  return (
    <span className={`inline-block text-10 font-mono uppercase px-2 py-px rounded ${tone}`}>
      Data quality: {quality}
    </span>
  );
}

function SectionCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className={cardCls}>
      <div className={sectionHeading}>{title}</div>
      {children}
    </div>
  );
}

// ── Registration Cards ─────────────────────────────────────────────────────

function RegistrationCards({ registrations }: { registrations: EntityGraphResult["registrations"] }) {
  if (registrations.length === 0) {
    return (
      <p className="text-12 text-ink-3 italic">No registration records found.</p>
    );
  }
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
      {registrations.map((reg, i) => (
        <div
          key={`${reg.jurisdiction}-${i}`}
          className="border border-hair-2 rounded-lg p-3 space-y-1.5"
        >
          <div className="flex items-center justify-between">
            <span className="font-semibold text-13 text-ink-0">{reg.jurisdiction}</span>
            <StatusBadge status={reg.status} />
          </div>
          <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-12">
            <div>
              <span className="text-ink-3">Number</span>
              <div className="font-mono text-11 text-ink-1">{reg.companyNumber}</div>
            </div>
            <div>
              <span className="text-ink-3">Type</span>
              <div className="text-ink-1">{reg.companyType}</div>
            </div>
            <div>
              <span className="text-ink-3">Incorporated</span>
              <div className="text-ink-1">{reg.incorporationDate}</div>
            </div>
            <div>
              <span className="text-ink-3">Source</span>
              <div className="text-10 uppercase font-mono text-brand">{reg.source}</div>
            </div>
          </div>
          <div className="text-12 text-ink-2 mt-1">{reg.registeredAddress}</div>
        </div>
      ))}
    </div>
  );
}

// ── Officers Table ─────────────────────────────────────────────────────────

function OfficersTable({ officers }: { officers: EntityGraphResult["officers"] }) {
  if (officers.length === 0) {
    return <p className="text-12 text-ink-3 italic">No officer records available.</p>;
  }
  return (
    <div className="border border-hair-2 rounded-lg overflow-hidden">
      <table className="w-full text-12">
        <thead className="bg-bg-1 border-b border-hair-2">
          <tr>
            {["Name", "Role", "Start Date", "End Date", "Nationality"].map((h) => (
              <th key={h} className={thCls}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {officers.map((o, i) => (
            <tr
              key={`${o.name}-${i}`}
              className={`${i < officers.length - 1 ? "border-b border-hair" : ""} hover:bg-bg-panel transition-colors`}
            >
              <td className={`${tdCls} font-medium`}>{o.name}</td>
              <td className={tdCls}>{o.role}</td>
              <td className={`${tdCls} font-mono text-11`}>{o.startDate}</td>
              <td className={`${tdCls} font-mono text-11 text-ink-3`}>{o.endDate ?? "—"}</td>
              <td className={`${tdCls} text-ink-2`}>{o.nationality ?? "—"}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ── UBO Chain ──────────────────────────────────────────────────────────────

function UboChain({ chain }: { chain: EntityGraphResult["uboChain"] }) {
  if (chain.length === 0) {
    return <p className="text-12 text-ink-3 italic">UBO chain data unavailable.</p>;
  }
  return (
    <div className="space-y-2">
      {chain.map((node, i) => {
        const indent = (node.level - 1) * 20;
        return (
          <div key={`ubo-${i}`} className="flex items-start gap-3" style={{ paddingLeft: indent }}>
            {/* connector line */}
            {node.level > 1 && (
              <div className="flex flex-col items-center flex-shrink-0 mt-1">
                <div className="w-px h-3 bg-hair-3" />
                <div className="w-2 h-px bg-hair-3" />
              </div>
            )}
            <div
              className={`flex-1 flex items-center gap-3 border rounded-lg px-3 py-2 ${
                node.isNaturalPerson
                  ? "border-green/30 bg-green-dim"
                  : "border-hair-2 bg-bg-panel"
              }`}
            >
              <div
                className={`w-7 h-7 rounded-full flex items-center justify-center text-10 font-bold flex-shrink-0 ${
                  node.isNaturalPerson
                    ? "bg-green text-white"
                    : "bg-brand-dim text-brand"
                }`}
              >
                {node.level}
              </div>
              <div className="flex-1 min-w-0">
                <div className="font-medium text-12 text-ink-0 truncate">{node.entityName}</div>
                <div className="text-11 text-ink-3">{node.jurisdiction}</div>
              </div>
              <div className="flex items-center gap-2 flex-shrink-0">
                {node.ownershipPct !== undefined && (
                  <span className="font-mono text-11 bg-bg-2 border border-hair-2 rounded px-1.5 py-px text-ink-1">
                    {node.ownershipPct}%
                  </span>
                )}
                {node.isNaturalPerson && (
                  <span className="text-10 font-semibold bg-green text-white rounded px-1.5 py-px uppercase tracking-wide-2">
                    UBO
                  </span>
                )}
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ── Risk Flags ─────────────────────────────────────────────────────────────

function RiskFlags({ flags }: { flags: string[] }) {
  if (flags.length === 0) {
    return (
      <div className="flex items-center gap-2 text-12 text-green">
        <span className="w-4 h-4 rounded-full bg-green-dim flex items-center justify-center text-10 font-bold">✓</span>
        No risk flags identified from available data.
      </div>
    );
  }
  return (
    <div className="space-y-2">
      {flags.map((flag, i) => {
        const isRed =
          flag.toLowerCase().includes("dissolved") ||
          flag.toLowerCase().includes("offshore") ||
          flag.toLowerCase().includes("cannot be identified");
        return (
          <div
            key={`flag-${i}`}
            className={`flex items-start gap-3 rounded-lg px-3 py-2.5 border text-12 ${
              isRed
                ? "bg-red-dim border-red/30 text-red"
                : "bg-amber-dim border-amber/30 text-amber"
            }`}
          >
            <span className="flex-shrink-0 mt-0.5 font-bold">{isRed ? "!" : "⚠"}</span>
            <span>{flag}</span>
          </div>
        );
      })}
    </div>
  );
}

// ── Related Entities ───────────────────────────────────────────────────────

function RelatedEntitiesTable({
  entities,
}: {
  entities: EntityGraphResult["relatedEntities"];
}) {
  if (entities.length === 0) {
    return <p className="text-12 text-ink-3 italic">No related entities identified.</p>;
  }
  return (
    <div className="border border-hair-2 rounded-lg overflow-hidden">
      <table className="w-full text-12">
        <thead className="bg-bg-1 border-b border-hair-2">
          <tr>
            {["Entity Name", "Relationship", "Jurisdiction", "Risk Indicator"].map((h) => (
              <th key={h} className={thCls}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {entities.map((e, i) => (
            <tr
              key={`rel-${i}`}
              className={`${i < entities.length - 1 ? "border-b border-hair" : ""} hover:bg-bg-panel transition-colors`}
            >
              <td className={`${tdCls} font-medium`}>{e.name}</td>
              <td className={`${tdCls} text-ink-2`}>{e.relationship}</td>
              <td className={tdCls}>{e.jurisdiction}</td>
              <td className={tdCls}>
                {e.riskIndicator ? (
                  <span className="inline-block text-10 px-1.5 py-px rounded bg-amber-dim text-amber border border-amber/25">
                    {e.riskIndicator}
                  </span>
                ) : (
                  <span className="text-ink-3">—</span>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ── GLEIF LEI Panel ────────────────────────────────────────────────────────

function LeiPanel({ record }: { record: LeiLookupResult }) {
  return (
    <div className={`${cardCls} space-y-3`}>
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="font-semibold text-14 text-ink-0">{record.legalName}</div>
          <div className="font-mono text-11 text-ink-3 mt-0.5">{record.lei}</div>
        </div>
        <StatusBadge status={record.status} />
      </div>
      <div className="grid grid-cols-2 gap-3 text-12">
        <div>
          <div className="text-ink-3 mb-0.5">Jurisdiction</div>
          <div className="font-medium text-ink-0">{record.jurisdiction}</div>
        </div>
        <div>
          <div className="text-ink-3 mb-0.5">Legal Form</div>
          <div className="text-ink-0">{record.legalForm}</div>
        </div>
        <div className="col-span-2">
          <div className="text-ink-3 mb-0.5">Registered Address</div>
          <div className="text-ink-0">{record.registeredAddress}</div>
        </div>
        {record.headquartersAddress !== record.registeredAddress && (
          <div className="col-span-2">
            <div className="text-ink-3 mb-0.5">HQ Address</div>
            <div className="text-ink-0">{record.headquartersAddress}</div>
          </div>
        )}
        <div>
          <div className="text-ink-3 mb-0.5">Last Updated</div>
          <div className="font-mono text-11 text-ink-0">{record.lastUpdated.slice(0, 10)}</div>
        </div>
        <div>
          <div className="text-ink-3 mb-0.5">Registration Status</div>
          <div className="text-ink-0">{record.registrationStatus}</div>
        </div>
      </div>
      {(record.directParent || record.ultimateParent) && (
        <div className="border-t border-hair pt-3 space-y-2">
          <div className="text-10 font-semibold uppercase tracking-wide-3 text-ink-2">
            Ownership Structure
          </div>
          {record.directParent && (
            <div className="flex items-center gap-2 text-12">
              <span className="text-10 uppercase tracking-wide-2 bg-brand-dim text-brand rounded px-1.5 py-px font-mono">
                Direct Parent
              </span>
              <span className="font-medium text-ink-0">{record.directParent.legalName}</span>
              <span className="font-mono text-10 text-ink-3">{record.directParent.lei}</span>
            </div>
          )}
          {record.ultimateParent && record.ultimateParent.lei !== record.directParent?.lei && (
            <div className="flex items-center gap-2 text-12">
              <span className="text-10 uppercase tracking-wide-2 bg-amber-dim text-amber rounded px-1.5 py-px font-mono">
                Ultimate Parent
              </span>
              <span className="font-medium text-ink-0">{record.ultimateParent.legalName}</span>
              <span className="font-mono text-10 text-ink-3">{record.ultimateParent.lei}</span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── Main Page ──────────────────────────────────────────────────────────────

export default function EntityGraphPage() {
  // Entity graph search state
  const [companyName, setCompanyName] = useState("");
  const [jurisdiction, setJurisdiction] = useState("");
  const [companyNumber, setCompanyNumber] = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<EntityGraphResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  // LEI quick-lookup state
  const [leiInput, setLeiInput] = useState("");
  const [leiLoading, setLeiLoading] = useState(false);
  const [leiResult, setLeiResult] = useState<LeiLookupResult | null>(null);
  const [leiError, setLeiError] = useState<string | null>(null);

  async function search() {
    if (!companyName.trim()) return;
    setLoading(true);
    setError(null);
    setResult(null);
    try {
      const res = await fetch("/api/entity-graph", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          companyName: companyName.trim(),
          jurisdiction: jurisdiction || undefined,
          companyNumber: companyNumber.trim() || undefined,
        }),
      });
      const data = (await res.json()) as EntityGraphResult & { error?: string };
      if (!data.ok) {
        setError((data as unknown as { error?: string }).error ?? "Search failed");
      } else {
        setResult(data);
      }
    } catch {
      setError("Request failed — check network connection");
    } finally {
      setLoading(false);
    }
  }

  async function lookupLei() {
    const val = leiInput.trim();
    if (!val) return;
    setLeiLoading(true);
    setLeiError(null);
    setLeiResult(null);
    try {
      const body = val.length === 20 ? { lei: val } : { legalName: val };
      const res = await fetch("/api/lei-lookup", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = (await res.json()) as LeiLookupResult & { error?: string };
      if (!data.ok) {
        setLeiError((data as unknown as { error?: string }).error ?? "LEI lookup failed");
      } else {
        setLeiResult(data);
      }
    } catch {
      setLeiError("Request failed");
    } finally {
      setLeiLoading(false);
    }
  }

  return (
    <ModuleLayout asanaModule="entity-graph" asanaLabel="Entity Graph" engineLabel="Entity Intelligence">
      <ModuleHero
        eyebrow="Module · Entity Intelligence"
        title="Corporate Entity"
        titleEm="graph."
        intro={
          <>
            <strong>FATF Recommendations 24–25</strong> (transparency of legal persons and
            arrangements) · <strong>UAE FDL 10/2025 Art. 7</strong> (beneficial ownership
            verification). Query OpenCorporates and GLEIF to map corporate structures, resolve
            UBO chains, and flag offshore registration patterns, nominee directors, and dissolved
            entities.
          </>
        }
      />

      {/* ── Search Form ── */}
      <div className="bg-bg-panel border border-hair-2 rounded-xl p-5 space-y-4 mb-6">
        <div>
          <div className="text-11 font-semibold tracking-wide-4 uppercase text-brand mb-1">
            Corporate Entity Search
          </div>
          <div className="text-12 text-ink-2">
            OpenCorporates · GLEIF · UBO chain resolution · risk flagging
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div className="sm:col-span-1">
            <label className="block text-10 uppercase tracking-wide-3 text-ink-2 font-semibold mb-1">
              Company Name *
            </label>
            <input
              className={inputCls}
              placeholder="e.g. Dubai Precious Metals Trading LLC"
              value={companyName}
              onChange={(e) => setCompanyName(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && search()}
            />
          </div>
          <div>
            <label className="block text-10 uppercase tracking-wide-3 text-ink-2 font-semibold mb-1">
              Jurisdiction
            </label>
            <select
              className={inputCls}
              value={jurisdiction}
              onChange={(e) => setJurisdiction(e.target.value)}
            >
              {JURISDICTIONS.map((j, idx) => (
                <option key={`${j.code}-${idx}`} value={j.code}>
                  {j.label}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-10 uppercase tracking-wide-3 text-ink-2 font-semibold mb-1">
              Company Number
              <span className="ml-1 text-ink-3 normal-case font-normal">(optional)</span>
            </label>
            <input
              className={inputCls}
              placeholder="e.g. DED-1127443"
              value={companyNumber}
              onChange={(e) => setCompanyNumber(e.target.value)}
            />
          </div>
        </div>

        <div className="flex justify-end">
          <button
            type="button"
            onClick={search}
            disabled={loading || !companyName.trim()}
            className={btnPrimary}
          >
            {loading ? "Searching…" : "Search Entity"}
          </button>
        </div>

        {error && (
          <div className="bg-red-dim border border-red/30 rounded-lg p-3 text-12 text-red">
            <span className="font-semibold">Error:</span> {error}
          </div>
        )}
      </div>

      {/* ── Results ── */}
      {result && (
        <div className="space-y-5">
          {/* Header row */}
          <div className="flex items-center justify-between flex-wrap gap-3">
            <div>
              <h2 className="font-display font-normal text-22 text-ink-0 m-0">
                {result.subject}
              </h2>
              <div className="flex items-center gap-2 mt-1 flex-wrap">
                <span className="text-11 uppercase font-mono tracking-wide-3 text-ink-3">
                  {result.entityType}
                </span>
                <DataQualityBadge quality={result.dataQuality} />
                {result.sources.length > 0 && (
                  <span className="text-11 text-ink-3">
                    Sources: {result.sources.join(" · ")}
                  </span>
                )}
              </div>
            </div>
            {result.riskFlags.length > 0 && (
              <span className="inline-flex items-center gap-1.5 font-mono text-10 uppercase tracking-wide-3 px-3 py-1.5 rounded-full border border-red/30 bg-red-dim text-red">
                <span className="w-1.5 h-1.5 rounded-full bg-current shadow-[0_0_6px_currentColor]" />
                {result.riskFlags.length} risk flag{result.riskFlags.length !== 1 ? "s" : ""}
              </span>
            )}
          </div>

          {/* Risk Flags — shown first for immediate attention */}
          {result.riskFlags.length > 0 && (
            <SectionCard title="Risk Flags">
              <RiskFlags flags={result.riskFlags} />
            </SectionCard>
          )}

          {/* Registration Cards */}
          <SectionCard title={`Registrations (${result.registrations.length})`}>
            <RegistrationCards registrations={result.registrations} />
          </SectionCard>

          {/* UBO Chain */}
          <SectionCard title="UBO Ownership Chain">
            <p className="text-12 text-ink-2 mb-3">
              Ownership layers derived from officer and shareholder records. Natural persons
              (UBOs) are highlighted in green. Levels indicate distance from the subject entity.
            </p>
            <UboChain chain={result.uboChain} />
          </SectionCard>

          {/* Officers */}
          <SectionCard title={`Officers & Directors (${result.officers.length})`}>
            <OfficersTable officers={result.officers} />
          </SectionCard>

          {/* Related Entities */}
          <SectionCard title={`Related Entities (${result.relatedEntities.length})`}>
            <RelatedEntitiesTable entities={result.relatedEntities} />
          </SectionCard>
        </div>
      )}

      {/* ── GLEIF LEI Quick Lookup ── */}
      <div className="bg-bg-panel border border-hair-2 rounded-xl p-5 space-y-4 mt-8">
        <div>
          <div className="text-11 font-semibold tracking-wide-4 uppercase text-brand mb-1">
            GLEIF LEI Quick Lookup
          </div>
          <div className="text-12 text-ink-2">
            Enter a 20-character LEI code for a direct GLEIF record, or enter an entity name
            to search by legal name.
          </div>
        </div>

        <div className="flex gap-3 flex-wrap">
          <input
            className={`flex-1 min-w-48 font-mono ${inputCls}`}
            placeholder="20-char LEI  e.g. 529900S0LYEQVTRP7C22  — or entity name"
            value={leiInput}
            onChange={(e) => setLeiInput(e.target.value.toUpperCase())}
            onKeyDown={(e) => e.key === "Enter" && lookupLei()}
          />
          <button
            type="button"
            onClick={lookupLei}
            disabled={leiLoading || !leiInput.trim()}
            className={btnPrimary}
          >
            {leiLoading ? "Looking up…" : "Look Up LEI"}
          </button>
        </div>

        {leiError && (
          <div className="bg-red-dim border border-red/30 rounded-lg p-3 text-12 text-red">
            <span className="font-semibold">Error:</span> {leiError}
          </div>
        )}

        {leiResult && (
          <div>
            <div className={sectionHeading}>GLEIF Record</div>
            <LeiPanel record={leiResult} />
          </div>
        )}
      </div>
    </ModuleLayout>
  );
}
