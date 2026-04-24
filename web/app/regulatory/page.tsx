"use client";

import { useMemo, useState } from "react";
import { ModuleHero, ModuleLayout } from "@/components/layout/ModuleLayout";

// Regulatory Library — searchable reference for FDL 10/2025, CR 134/2025,
// MoE circulars, FATF Recs, LBMA guidance, Cabinet Resolutions, and goAML
// schema. Every entry the brain cites somewhere in the app appears here
// with a click-through to the authoritative source.

interface RegEntry {
  code: string;
  title: string;
  authority: string;
  citation: string;
  url?: string;
  summary: string;
  tags: string[];
}

const LIBRARY: RegEntry[] = [
  {
    code: "FDL 10/2025",
    title: "Federal Decree-Law No. 10 of 2025 on AML/CFT/CPF",
    authority: "UAE Federal",
    citation: "FDL 10/2025",
    summary:
      "Primary UAE AML/CFT/CPF law. Key articles referenced by the brain: Art. 2(3) constructive-knowledge standard; Art. 17 EDD for PEPs; Art. 19 UBO identification; Art. 24 ten-year retention; Art. 26-27 STR timing; Art. 29 tipping-off prohibition.",
    tags: ["UAE", "primary", "AML", "CFT"],
  },
  {
    code: "CR 134/2025",
    title: "Cabinet Resolution No. 134 of 2025 — Executive Regulations",
    authority: "UAE Cabinet",
    citation: "CR 134/2025",
    summary:
      "Executive Regulations giving effect to FDL 10/2025. Article 18 covers the goAML submission process and reporting-entity obligations.",
    tags: ["UAE", "regulation", "goAML"],
  },
  {
    code: "CR 156/2025",
    title: "Cabinet Resolution No. 156 of 2025 — Schedule of Goods Subject to Due-Diligence",
    authority: "UAE Cabinet",
    citation: "CR 156/2025",
    summary:
      "Lists goods — gold, precious metals, gemstones — subject to mandatory due-diligence regulation under the DNFBP framework.",
    tags: ["UAE", "DPMS", "DNFBP"],
  },
  {
    code: "MoE 2/2024",
    title: "MoE Circular No. 2 of 2024 — Responsible Sourcing for Precious-Metals",
    authority: "UAE MoE",
    citation: "MoE Circular 2/2024",
    summary:
      "Mandates LBMA-aligned responsible-sourcing practices for UAE precious-metals refiners, traders, and bullion dealers.",
    tags: ["UAE", "DPMS", "LBMA"],
  },
  {
    code: "MoE 3/2025",
    title: "MoE Circular No. 3 of 2025 — TFS / Sanctions Screening",
    authority: "UAE MoE",
    citation: "MoE Circular 3/2025",
    summary:
      "Targeted-Financial-Sanctions screening obligations. Requires real-time screening against UN, OFAC, EU, UK OFSI, and UAE EOCN / LTL lists.",
    tags: ["UAE", "sanctions", "TFS"],
  },
  {
    code: "MoE 6/2025",
    title: "MoE Circular No. 6 of 2025 — Risk-Based CDD / SDD",
    authority: "UAE MoE",
    citation: "MoE Circular 6/2025",
    summary:
      "Defines the risk-based approach to CDD (Customer Due Diligence) and the conditions under which SDD (Simplified Due Diligence) is available.",
    tags: ["UAE", "CDD", "SDD"],
  },
  {
    code: "FATF R.10",
    title: "FATF Recommendation 10 — Customer Due Diligence",
    authority: "FATF",
    citation: "FATF Rec. 10",
    summary:
      "Identifies and verifies the customer and beneficial owner; understands the nature and purpose of the business relationship; conducts ongoing due diligence.",
    tags: ["FATF", "CDD"],
  },
  {
    code: "FATF R.12",
    title: "FATF Recommendation 12 — Politically Exposed Persons",
    authority: "FATF",
    citation: "FATF Rec. 12",
    summary:
      "EDD for foreign PEPs; for domestic and international-organisation PEPs, EDD if higher risk. Senior-management approval, source-of-wealth, and ongoing monitoring required.",
    tags: ["FATF", "PEP", "EDD"],
  },
  {
    code: "FATF R.20",
    title: "FATF Recommendation 20 — Reporting of Suspicious Transactions",
    authority: "FATF",
    citation: "FATF Rec. 20",
    summary:
      "Prompt STR reporting to the FIU when there is suspicion of proceeds of crime / terrorism financing, regardless of amount.",
    tags: ["FATF", "STR"],
  },
  {
    code: "FATF R.22",
    title: "FATF Recommendation 22 — DNFBPs",
    authority: "FATF",
    citation: "FATF Rec. 22",
    summary:
      "Extends R.10 (CDD) and R.12 (PEPs) to designated non-financial businesses and professions, specifically including dealers in precious metals and stones.",
    tags: ["FATF", "DNFBP", "DPMS"],
  },
  {
    code: "LBMA RGG v9",
    title: "LBMA Responsible Gold Guidance v9",
    authority: "LBMA",
    citation: "LBMA Responsible Gold Guidance v9",
    summary:
      "Conflict-minerals / responsible-sourcing due-diligence framework for gold refiners on the LBMA Good Delivery List.",
    tags: ["LBMA", "gold", "DPMS"],
  },
  {
    code: "OECD DD",
    title: "OECD Due Diligence Guidance for Responsible Supply Chains of Minerals from Conflict-Affected and High-Risk Areas",
    authority: "OECD",
    citation: "OECD DD Guidance · Gold Supplement",
    summary:
      "5-step framework: management systems, risk identification, response, independent audit, public reporting. Annex II lists the specific Conflict-Affected and High-Risk Area (CAHRA) red flags.",
    tags: ["OECD", "CAHRA", "supply-chain"],
  },
];

const ALL_TAGS = Array.from(new Set(LIBRARY.flatMap((e) => e.tags)));

export default function RegulatoryPage() {
  const [query, setQuery] = useState("");
  const [activeTag, setActiveTag] = useState<string | null>(null);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return LIBRARY.filter((e) => {
      if (activeTag && !e.tags.includes(activeTag)) return false;
      if (!q) return true;
      const hay = `${e.code} ${e.title} ${e.citation} ${e.summary} ${e.authority} ${e.tags.join(" ")}`.toLowerCase();
      return hay.includes(q);
    });
  }, [query, activeTag]);

  return (
    <ModuleLayout narrow>
      <div className="max-w-5xl mx-auto px-8 py-10">
        <ModuleHero
          eyebrow="Module 11 · Regulatory Reference"
          title="Regulatory"
          titleEm="library."
          intro={
            <>
              <strong>Every citation the brain makes, in one searchable reference.</strong>{" "}
              FDL / CR / MoE / FATF / LBMA / OECD — keyword search across title,
              citation, and summary; click a tag to narrow by framework.
            </>
          }
        />

        <div className="bg-bg-panel border border-hair-2 rounded-lg p-3 mt-6 mb-4">
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search title / code / tag"
            className="w-full text-12 px-3 py-2 rounded border border-hair-2 bg-bg-panel text-ink-0"
          />
          <div className="flex flex-wrap gap-1.5 mt-3">
            <button
              type="button"
              onClick={() => setActiveTag(null)}
              className={`inline-flex items-center px-2 py-0.5 rounded-sm font-mono text-10 ${
                activeTag === null
                  ? "bg-brand text-white"
                  : "bg-bg-2 text-ink-2 hover:bg-bg-1"
              }`}
            >
              all
            </button>
            {ALL_TAGS.map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => setActiveTag(activeTag === t ? null : t)}
                className={`inline-flex items-center px-2 py-0.5 rounded-sm font-mono text-10 ${
                  activeTag === t
                    ? "bg-brand text-white"
                    : "bg-bg-2 text-ink-2 hover:bg-bg-1"
                }`}
              >
                {t}
              </button>
            ))}
          </div>
        </div>

        <div className="space-y-2">
          {filtered.map((e) => (
            <div key={e.code} className="bg-bg-panel border border-hair-2 rounded-lg p-4">
              <div className="flex items-baseline justify-between gap-3 mb-1">
                <h3 className="text-13 font-semibold text-ink-0 m-0">{e.title}</h3>
                <span className="font-mono text-10 text-ink-3 shrink-0">
                  {e.code}
                </span>
              </div>
              <div className="font-mono text-10 text-ink-3 mb-2">
                {e.authority} · {e.citation}
              </div>
              <p className="text-11.5 text-ink-1 leading-relaxed m-0">
                {e.summary}
              </p>
              <div className="flex flex-wrap gap-1 mt-2">
                {e.tags.map((t) => (
                  <span
                    key={t}
                    className="inline-flex items-center px-1.5 py-px rounded-sm font-mono text-10 bg-violet-dim text-violet"
                  >
                    {t}
                  </span>
                ))}
              </div>
            </div>
          ))}
          {filtered.length === 0 && (
            <div className="text-12 text-ink-2 py-8 text-center">
              No entries match.
            </div>
          )}
        </div>
      </div>
    </ModuleLayout>
  );
}
