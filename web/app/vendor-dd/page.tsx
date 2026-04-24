"use client";

import { useState } from "react";
import { ModuleHero, ModuleLayout } from "@/components/layout/ModuleLayout";

interface Supplier {
  id: string;
  name: string;
  jurisdiction: string;
  tier: "critical" | "significant" | "standard";
  lbmaListed: boolean;
  lastReview: string; // stored as YYYY-MM-DD
  nextReview: string;
  flags: string[];
}

/** "2026-03-12" → "12/03/2026" */
function fmtDate(iso: string): string {
  const m = iso.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return iso;
  return `${m[3]}/${m[2]}/${m[1]}`;
}

const DEFAULT_SUPPLIERS: Supplier[] = [
  {
    id: "v1",
    name: "Valcambi SA",
    jurisdiction: "CH",
    tier: "critical",
    lbmaListed: true,
    lastReview: "2026-03-12",
    nextReview: "2027-03-12",
    flags: [],
  },
  {
    id: "v2",
    name: "MMTC-PAMP India",
    jurisdiction: "IN",
    tier: "critical",
    lbmaListed: true,
    lastReview: "2026-01-28",
    nextReview: "2027-01-28",
    flags: [],
  },
  {
    id: "v3",
    name: "Bullion Couriers FZ-LLC",
    jurisdiction: "AE",
    tier: "significant",
    lbmaListed: false,
    lastReview: "2025-12-04",
    nextReview: "2026-12-04",
    flags: ["no-lbma"],
  },
];

const XIcon = () => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    width="14"
    height="14"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2.5"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <line x1="18" y1="6" x2="6" y2="18" />
    <line x1="6" y1="6" x2="18" y2="18" />
  </svg>
);

export default function SupplierDdPage() {
  const [suppliers, setSuppliers] = useState<Supplier[]>(DEFAULT_SUPPLIERS);

  const remove = (id: string) => setSuppliers((vs) => vs.filter((v) => v.id !== id));

  return (
    <ModuleLayout>
        <ModuleHero
          eyebrow="Module 20 · Supply-chain DD"
          title="Supplier"
          titleEm="due diligence."
          intro={
            <>
              <strong>Suppliers screened under a different rubric.</strong>{" "}
              LBMA Good Delivery status, OECD Annex II red-flag assessment,
              Step-4 audit history, CAHRA exposure. Review cadence
              proportional to tier.
            </>
          }
          kpis={[
            { value: String(suppliers.length), label: "active suppliers" },
            {
              value: String(suppliers.filter((v) => v.tier === "critical").length),
              label: "tier-critical",
              tone: "red",
            },
            {
              value: String(suppliers.filter((v) => !v.lbmaListed).length),
              label: "not LBMA-listed",
              tone: "amber",
            },
          ]}
        />

        <div className="mt-6 space-y-2">
          {suppliers.map((v) => (
            <div
              key={v.id}
              className="bg-bg-panel border border-hair-2 rounded-lg p-4"
            >
              <div className="flex items-baseline justify-between mb-1">
                <h3 className="text-13 font-semibold text-ink-0 m-0">
                  {v.name}
                </h3>
                <div className="flex items-center gap-3">
                  <span
                    className={`inline-flex items-center px-1.5 py-px rounded-sm font-mono text-10 font-semibold uppercase ${
                      v.tier === "critical"
                        ? "bg-red-dim text-red"
                        : v.tier === "significant"
                          ? "bg-amber-dim text-amber"
                          : "bg-green-dim text-green"
                    }`}
                  >
                    {v.tier}
                  </span>
                  <button
                    type="button"
                    onClick={() => remove(v.id)}
                    aria-label={`Delete ${v.name}`}
                    className="text-ink-3 hover:text-red transition-colors"
                  >
                    <XIcon />
                  </button>
                </div>
              </div>
              <div className="grid grid-cols-4 gap-4 text-11 font-mono mt-2">
                <div>
                  <span className="text-ink-3">Jurisdiction: </span>
                  <span className="text-ink-0">{v.jurisdiction}</span>
                </div>
                <div>
                  <span className="text-ink-3">LBMA: </span>
                  <span className={v.lbmaListed ? "text-green" : "text-amber"}>
                    {v.lbmaListed ? "Good Delivery" : "not listed"}
                  </span>
                </div>
                <div>
                  <span className="text-ink-3">Last review: </span>
                  <span className="text-ink-0">{fmtDate(v.lastReview)}</span>
                </div>
                <div>
                  <span className="text-ink-3">Next review: </span>
                  <span className="text-ink-0">{fmtDate(v.nextReview)}</span>
                </div>
              </div>
              {v.flags.length > 0 && (
                <div className="mt-2 flex flex-wrap gap-1">
                  {v.flags.map((f) => (
                    <span
                      key={f}
                      className="inline-flex items-center px-1.5 py-px rounded-sm font-mono text-10 bg-amber-dim text-amber"
                    >
                      {f}
                    </span>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>

        <p className="text-11 text-ink-3 mt-6 leading-relaxed">
          Supplier reviews follow LBMA RGG v9 + OECD Due Diligence Guidance for
          Minerals. Critical-tier suppliers get annual Step-4 audit; significant
          tier every 18 months; standard every 24 months per MoE Circular 2/2024.
        </p>
    </ModuleLayout>
  );
}
