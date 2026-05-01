"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ModuleHero, ModuleLayout } from "@/components/layout/ModuleLayout";
import type { CalendarEvent, RegCalendarLiveResult } from "@/app/api/regulatory-calendar-live/route";

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

interface LiveItem {
  id: string;
  title: string;
  url: string;
  pubDate: string;
  publishedAt?: string;
  source: string;
  category: string;
  tone: "green" | "amber" | "red";
  snippet?: string;
  summary?: string;
}

interface FeedResult {
  ok: true;
  items: LiveItem[];
  sources: string[];
  fetchedAt: string;
  errors: string[];
}

// ─────────────────────────────────────────────────────────────────────────────
// Style maps
// ─────────────────────────────────────────────────────────────────────────────

const TONE_DOT: Record<LiveItem["tone"], string> = {
  red: "bg-red",
  amber: "bg-amber",
  green: "bg-green",
};

const TONE_BORDER: Record<LiveItem["tone"], string> = {
  red: "border-l-red bg-red/5",
  amber: "border-l-amber bg-amber/5",
  green: "border-l-green bg-green/5",
};

const URGENCY_CARD: Record<CalendarEvent["urgency"], string> = {
  overdue: "border-red bg-red/8 border",
  critical: "border-amber bg-amber/8 border",
  upcoming: "border-hair-2 bg-bg-panel border",
  planned: "border-hair-2 bg-bg-panel border",
};

const URGENCY_BADGE: Record<CalendarEvent["urgency"], string> = {
  overdue: "bg-red text-white",
  critical: "bg-amber text-white",
  upcoming: "bg-violet-dim text-violet",
  planned: "bg-bg-2 text-ink-2",
};

const CAT_BADGE: Record<CalendarEvent["category"], string> = {
  filing: "bg-blue-dim text-blue",
  review: "bg-violet-dim text-violet",
  audit: "bg-orange-dim text-orange",
  training: "bg-green-dim text-green",
  reporting: "bg-red-dim text-red",
};

// ─────────────────────────────────────────────────────────────────────────────
// Regulatory Reference Library
// ─────────────────────────────────────────────────────────────────────────────

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
  {
    code: "FATF R.1",
    title: "FATF Recommendation 1 — Risk-Based Approach",
    authority: "FATF",
    citation: "FATF Rec. 1",
    summary:
      "Countries and financial institutions should identify, assess and understand ML/TF/PF risks. Enhanced measures apply where risks are higher; simplified measures may apply where risks are lower. The RBA is the foundation of all FATF Recommendations.",
    tags: ["FATF", "primary", "AML", "CFT"],
  },
  {
    code: "FATF R.6",
    title: "FATF Recommendation 6 — Targeted Financial Sanctions (Terrorism & TF)",
    authority: "FATF",
    citation: "FATF Rec. 6",
    summary:
      "Implement UN Security Council resolutions on terrorist financing (UNSCRs 1267, 1373, 1988). Immediately freeze assets of designated persons without prior notice. No funds or services to be made available to listed persons. Compliance is mandatory with no threshold.",
    tags: ["FATF", "TFS", "sanctions", "terrorism"],
  },
  {
    code: "FATF R.7",
    title: "FATF Recommendation 7 — Targeted Financial Sanctions (Proliferation)",
    authority: "FATF",
    citation: "FATF Rec. 7",
    summary:
      "Implement UNSCRs on proliferation financing (1718/DPRK, 2231/Iran). Immediately freeze assets of designated entities. Applies to all transactions regardless of amount or purpose. PF-TFS controls must be independent from AML/CFT screening.",
    tags: ["FATF", "TFS", "sanctions", "proliferation"],
  },
  {
    code: "FATF R.13",
    title: "FATF Recommendation 13 — Correspondent Banking",
    authority: "FATF",
    citation: "FATF Rec. 13",
    summary:
      "Gather sufficient information to understand fully the nature of the respondent's business. Assess AML/CFT controls; obtain senior-management approval. Do not establish or continue relationships with shell banks. Document respective responsibilities.",
    tags: ["FATF", "banking", "CDD"],
  },
  {
    code: "FATF R.15",
    title: "FATF Recommendation 15 — New Technologies / Virtual Assets",
    authority: "FATF",
    citation: "FATF Rec. 15",
    summary:
      "Virtual asset service providers (VASPs) must be regulated for AML/CFT purposes, licensed, and subject to the Travel Rule. Countries must apply FATF standards to VASPs as they do to financial institutions. Includes NFTs where used for investment or payment.",
    tags: ["FATF", "VASP", "crypto"],
  },
  {
    code: "FATF R.16",
    title: "FATF Recommendation 16 — Wire Transfers (Travel Rule)",
    authority: "FATF",
    citation: "FATF Rec. 16",
    summary:
      "Originating institution must include full originator and beneficiary information with all wire transfers ≥ USD 1,000. Beneficiary institution must screen and may reject transfers missing required information. Applies to both traditional wire transfers and virtual asset transfers.",
    tags: ["FATF", "wire", "VASP", "payments"],
  },
  {
    code: "FATF R.24",
    title: "FATF Recommendation 24 — Transparency of Legal Persons",
    authority: "FATF",
    citation: "FATF Rec. 24",
    summary:
      "Countries must ensure adequate, accurate and timely information on the beneficial ownership of legal persons is available to competent authorities. UBO registers or equivalent mechanisms required. Shell companies used to conceal ownership are a major ML vulnerability.",
    tags: ["FATF", "UBO", "CDD"],
  },
  {
    code: "FATF R.25",
    title: "FATF Recommendation 25 — Transparency of Legal Arrangements (Trusts)",
    authority: "FATF",
    citation: "FATF Rec. 25",
    summary:
      "Trustees must hold and disclose basic and beneficial ownership information on express trusts. Equivalent measures apply to other legal arrangements. Professional trustees must be subject to AML/CFT obligations. Settlor, trustee, protector, and beneficiaries all in scope.",
    tags: ["FATF", "UBO", "trust", "CDD"],
  },
  {
    code: "FATF R.40",
    title: "FATF Recommendation 40 — International Co-operation",
    authority: "FATF",
    citation: "FATF Rec. 40",
    summary:
      "Countries must provide the widest possible range of international co-operation. FIU-to-FIU information exchange (Egmont Group); law-enforcement co-operation; mutual legal assistance. Dual criminality cannot be used as a sole basis for refusing cooperation in ML/TF cases.",
    tags: ["FATF", "FIU", "international"],
  },
  {
    code: "CD 58/2020",
    title: "Cabinet Decision No. 58 of 2020 — Beneficial Ownership Register",
    authority: "UAE Cabinet",
    citation: "Cabinet Decision 58/2020",
    summary:
      "Requires all UAE legal persons to maintain and file an accurate UBO register. Changes in beneficial ownership must be reported within 15 business days. The register is filed with the relevant authority (MoE / MOEC / ADGM etc.) and is subject to audit.",
    tags: ["UAE", "UBO", "CDD", "regulation"],
  },
  {
    code: "CD 74/2020",
    title: "Cabinet Decision No. 74 of 2020 — AML/CFT for DNFBPs",
    authority: "UAE Cabinet",
    citation: "Cabinet Decision 74/2020",
    summary:
      "Extends AML/CFT obligations to Designated Non-Financial Businesses and Professions (DNFBPs) including DPMS dealers, real estate agents, lawyers, accountants, and trust service providers. Mirrors financial-sector requirements for CDD, record-keeping, and STR filing.",
    tags: ["UAE", "DNFBP", "DPMS", "AML"],
  },
  {
    code: "FL 7/2014",
    title: "Federal Law No. 7 of 2014 — Combating Terrorism Offences",
    authority: "UAE Federal",
    citation: "Federal Law 7/2014",
    summary:
      "Primary UAE counter-terrorism law. Defines terrorism financing as a criminal offence independent of whether a terrorist act is committed. Enables asset freezing and forfeiture. Criminalises provision of funds, weapons, or services to terrorists or terrorist organisations.",
    tags: ["UAE", "terrorism", "TFS", "primary"],
  },
  {
    code: "FDL 45/2021",
    title: "Federal Decree-Law No. 45 of 2021 — Personal Data Protection",
    authority: "UAE Federal",
    citation: "Federal Decree-Law 45/2021",
    summary:
      "UAE data protection law governing collection, processing, storage and transfer of personal data. AML/CFT processing has a lawful basis under public-interest exemptions. Data subjects have access and rectification rights; destruction obligations apply at end of retention period.",
    tags: ["UAE", "data", "privacy", "regulation"],
  },
  {
    code: "CBUAE AML",
    title: "CBUAE AML/CFT Standards for Licensed Financial Institutions",
    authority: "CBUAE",
    citation: "CBUAE AML/CFT Standards 2021",
    summary:
      "Comprehensive standards issued by the Central Bank of UAE covering: customer risk classification, CDD procedures, PEP identification, STR filing timelines, and AML programme governance. Inspection checklist used for on-site supervision of LFIs.",
    tags: ["UAE", "CBUAE", "AML", "CDD", "primary"],
  },
  {
    code: "CBUAE SAN",
    title: "CBUAE Guidance on Sanctions Compliance",
    authority: "CBUAE",
    citation: "CBUAE Sanctions Guidance 2022",
    summary:
      "Detailed guidance on TFS implementation for UAE financial institutions. Prescribes test names and entities for annual screening effectiveness tests (para 4.3). Addresses screening of transactions, customers, UBOs, and counterparties. Defines false-negative remediation procedures.",
    tags: ["UAE", "CBUAE", "sanctions", "TFS"],
  },
  {
    code: "VARA 2023",
    title: "VARA Virtual Assets & Related Activities Regulations 2023",
    authority: "VARA (Dubai)",
    citation: "VARA Regulations 2023",
    summary:
      "Dubai Virtual Assets Regulatory Authority framework for licensing and supervising VASPs in Dubai. Mandates AML/CFT compliance, Travel Rule implementation, and blockchain analytics for on-chain address screening. Non-Dubai VASPs must be equivalently licensed.",
    tags: ["UAE", "VASP", "crypto", "regulation"],
  },
  {
    code: "EOCN DEC",
    title: "EOCN Circular — Conflict Minerals Annual Declaration",
    authority: "EOCN",
    citation: "EOCN Annual Declaration",
    summary:
      "The Emirates Official Cargoes Network requires an annual responsible-sourcing declaration covering all upstream smelters and refiners. Deadline: 31 March each year. Declaration must be supported by LBMA / RJC Chain-of-Custody certificates.",
    tags: ["UAE", "CAHRA", "EOCN", "supply-chain", "DPMS"],
  },
  {
    code: "UNSCR 1267",
    title: "UN Security Council Resolution 1267/1989/2253 — ISIL / Al-Qaeda Consolidated",
    authority: "UN Security Council",
    citation: "UNSCR 1267/2253",
    summary:
      "Establishes the ISIL (Da'esh) and Al-Qaeda Sanctions Committee and the Consolidated Sanctions List. Asset freeze, travel ban, and arms embargo on all listed persons and entities. Listing and delisting procedures governed by Ombudsperson Office. List updated continuously.",
    tags: ["sanctions", "terrorism", "TFS", "international"],
  },
  {
    code: "UNSCR 1718",
    title: "UN Security Council Resolution 1718 (2006) — DPRK Sanctions",
    authority: "UN Security Council",
    citation: "UNSCR 1718/2270",
    summary:
      "Comprehensive sanctions regime against the Democratic People's Republic of Korea (DPRK). Asset freeze, arms embargo, and prohibition on financial services that could contribute to DPRK's nuclear or ballistic missile programmes. Enforced by the 1718 Sanctions Committee and Panel of Experts.",
    tags: ["sanctions", "proliferation", "TFS", "DPRK", "international"],
  },
  {
    code: "UNSCR 2231",
    title: "UN Security Council Resolution 2231 (2015) — Iran (JCPOA)",
    authority: "UN Security Council",
    citation: "UNSCR 2231",
    summary:
      "Endorses the Joint Comprehensive Plan of Action (JCPOA) and modifies Iran sanctions. Residual restrictions remain on arms, ballistic missiles, and proliferation-sensitive activities. JCPOA snapback mechanism can reimpose full UN sanctions. Monitor Iran-nexus transactions carefully regardless of JCPOA status.",
    tags: ["sanctions", "proliferation", "TFS", "Iran", "international"],
  },
  {
    code: "EU 6AMLD",
    title: "EU 6th Anti-Money Laundering Directive (6AMLD)",
    authority: "European Union",
    citation: "Directive (EU) 2018/1673",
    summary:
      "Harmonises predicate offences for ML across EU member states (22 categories including cybercrime, tax crimes, environmental offences). Extends criminal liability to legal persons. Criminalises self-laundering and aiding/abetting. Minimum 4-year custodial sentence.",
    tags: ["EU", "AML", "regulation", "international"],
  },
  {
    code: "EU TFR",
    title: "EU Regulation 2023/1113 — Transfer of Funds / Travel Rule",
    authority: "European Union",
    citation: "EU Regulation 2023/1113",
    summary:
      "Extends the Travel Rule to crypto-asset transfers — all transfers require full originator and beneficiary information regardless of amount. Covers PSPs and CASPs operating in the EU. Unhosted wallet transfers require enhanced due diligence. Aligned with FATF R.16.",
    tags: ["EU", "VASP", "crypto", "wire", "payments", "international"],
  },
  {
    code: "Wolfsberg CBDDQ",
    title: "Wolfsberg Group — Correspondent Banking Due Diligence Questionnaire",
    authority: "Wolfsberg Group",
    citation: "Wolfsberg CBDDQ 2018",
    summary:
      "Industry-standard questionnaire for assessing the AML/CFT programme of correspondent banking respondents. Covers: ownership, regulatory status, AML programme, CDD, PEP policy, sanctions screening, STR filing, and independent audit. Annual renewal expected.",
    tags: ["banking", "CDD", "international"],
  },
  {
    code: "Wolfsberg PB",
    title: "Wolfsberg Group — AML Principles for Private Banking",
    authority: "Wolfsberg Group",
    citation: "Wolfsberg Private Banking Principles 2012",
    summary:
      "Guidance for private banks and wealth managers on: client acceptance, source-of-wealth verification, PEP handling, high-risk indicator detection, and suspicious activity reporting. Emphasises relationship manager accountability and senior-management oversight.",
    tags: ["banking", "PEP", "CDD", "EDD", "international"],
  },
  {
    code: "Basel ML",
    title: "Basel Committee — Sound Management of Risks Related to ML and TF",
    authority: "Basel Committee on Banking Supervision",
    citation: "BCBS 275 (2017)",
    summary:
      "Comprehensive guidance for banks on AML/CFT risk management: governance, customer due diligence, correspondent banking, wire transfers, and group-wide programmes. Emphasises the board's responsibility and the three-lines-of-defence model.",
    tags: ["banking", "CDD", "AML", "governance", "international"],
  },
  {
    code: "Egmont",
    title: "Egmont Group — Principles for Information Exchange Between FIUs",
    authority: "Egmont Group",
    citation: "Egmont Principles 2013",
    summary:
      "Framework for spontaneous and upon-request FIU-to-FIU information exchange. Governs use and confidentiality of shared intelligence. Covers 170+ member FIUs including the UAE's UAEFIU. Requests should be made via Egmont Secure Web when possible.",
    tags: ["FIU", "international", "STR"],
  },
  {
    code: "RJC COS",
    title: "Responsible Jewellery Council — Chain of Custody Standard",
    authority: "RJC",
    citation: "RJC Chain of Custody Standard 2019",
    summary:
      "Certification system for responsible gold, silver and PGMs through the supply chain. RJC COS certification can substitute for LBMA RGG Step-4 audit for certain refiner categories. Requires documented provenance, conflict-minerals policy, and third-party audit.",
    tags: ["LBMA", "gold", "DPMS", "supply-chain"],
  },
  {
    code: "KPCS",
    title: "Kimberley Process Certification Scheme",
    authority: "Kimberley Process",
    citation: "KPCS 2003",
    summary:
      "International certification scheme for rough diamonds. Participants certify that rough diamonds are conflict-free. KP Certificate required for all rough diamond imports/exports. Note: KPCS does not cover polished diamonds or jewellery; separate provenance documentation needed.",
    tags: ["DPMS", "supply-chain", "gold"],
  },
  {
    code: "EU AI Act",
    title: "EU AI Act — Regulation (EU) 2024/1689 on Artificial Intelligence",
    authority: "European Union",
    citation: "EU AI Act 2024/1689",
    summary:
      "World's first comprehensive AI regulatory framework. AML/CFT screening engines and risk-scoring models used in financial crime compliance are classified as high-risk AI systems (Annex III). High-risk systems require: conformity assessment, human oversight, transparency disclosures, accuracy/robustness standards, and registration in the EU AI database. Effective August 2026 for most provisions.",
    tags: ["AI", "regulation", "governance", "international"],
  },
  {
    code: "FATF AI",
    title: "FATF Guidance on AI/ML Tools for AML/CFT",
    authority: "FATF",
    citation: "FATF AI Guidance 2023",
    summary:
      "Guidance on opportunities and risks of AI/ML in AML/CFT. AI transaction monitoring and screening tools must be explainable to regulators; black-box models are discouraged. Model validation, bias testing, and human-in-the-loop review are expected. FIUs may request explanation of AI-generated alerts used to support STR filings.",
    tags: ["FATF", "AI", "AML", "governance"],
  },
  {
    code: "UAE AI",
    title: "UAE National Artificial Intelligence Strategy 2031",
    authority: "UAE Government",
    citation: "UAE AI Strategy 2031",
    summary:
      "National strategy positioning UAE as a global AI hub by 2031. Mandates responsible and ethical AI deployment across sectors including financial services. Requires AI systems to be transparent, explainable, and free from discriminatory bias. Compliance with UAE AI ethics principles is expected of all AI-powered compliance tools deployed in the UAE.",
    tags: ["UAE", "AI", "governance", "regulation"],
  },
  {
    code: "CBUAE AI",
    title: "CBUAE Guidance on Responsible Use of AI in Financial Services",
    authority: "CBUAE",
    citation: "CBUAE AI Guidance 2024",
    summary:
      "CBUAE expects licensed financial institutions to apply a risk-based governance framework to all AI systems used in compliance, credit, and customer service. Key requirements: documented model inventories, bias and fairness audits, model validation by independent parties, explainability to supervisors, and incident reporting when AI systems behave unexpectedly.",
    tags: ["UAE", "CBUAE", "AI", "governance", "AML"],
  },
  {
    code: "ISO 42001",
    title: "ISO/IEC 42001:2023 — AI Management System Standard",
    authority: "ISO / IEC",
    citation: "ISO/IEC 42001:2023",
    summary:
      "International standard for AI management systems. Provides a framework for responsible development and use of AI including: risk assessment, AI impact assessment, transparency requirements, and continuous monitoring. Certifiable by third-party auditors. Increasingly cited by regulators as the baseline for AI governance in financial services.",
    tags: ["AI", "governance", "international"],
  },
  {
    code: "MAS FSG AI",
    title: "MAS Fairness, Ethics, Accountability & Transparency (FEAT) Principles",
    authority: "Monetary Authority of Singapore",
    citation: "MAS FEAT 2019",
    summary:
      "Principles for use of AI and data analytics in financial services. FEAT covers: fairness (no bias or discrimination), ethics (human oversight), accountability (board-level responsibility), and transparency (explainability to customers and regulators). Widely adopted by global financial institutions as a governance benchmark alongside the EU AI Act.",
    tags: ["AI", "governance", "international"],
  },
  {
    code: "FCA AI",
    title: "FCA Discussion Paper: AI in UK Financial Services (DP5/22)",
    authority: "FCA (UK)",
    citation: "FCA DP5/22",
    summary:
      "FCA's regulatory position on AI in financial services. Principles-based approach: firms remain responsible for AI-driven decisions regardless of model complexity. Expects explainability, non-discrimination, and documented validation for all AI systems used in regulated activities including AML screening and customer risk scoring.",
    tags: ["AI", "governance", "international", "AML"],
  },
];

const ALL_TAGS = Array.from(new Set(LIBRARY.flatMap((e) => e.tags)));

// ─────────────────────────────────────────────────────────────────────────────
// Feed panel sub-components
// ─────────────────────────────────────────────────────────────────────────────

function FeedItem({ item }: { item: LiveItem }) {
  const [expanded, setExpanded] = useState(false);
  const text = item.summary ?? item.snippet ?? "";
  const dateStr = item.publishedAt ?? item.pubDate ?? "";
  const displayDate = dateStr
    ? (() => {
        try {
          return new Date(dateStr).toLocaleDateString("en-AE", {
            day: "2-digit", month: "short", year: "numeric",
          });
        } catch {
          return dateStr;
        }
      })()
    : "";

  return (
    <div className={`border border-l-2 rounded-lg px-4 py-3 ${TONE_BORDER[item.tone]}`}>
      <div className="flex items-start gap-2.5">
        <span className={`mt-1.5 shrink-0 w-2 h-2 rounded-full ${TONE_DOT[item.tone]}`} />
        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between gap-2 flex-wrap">
            <div className="flex-1 min-w-0">
              {item.url ? (
                <a
                  href={item.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-12 font-medium text-ink-0 leading-snug hover:text-brand no-underline hover:underline"
                >
                  {item.title}
                </a>
              ) : (
                <span className="text-12 font-medium text-ink-0 leading-snug">{item.title}</span>
              )}
            </div>
            <div className="flex items-center gap-1.5 shrink-0">
              <span className="font-mono text-10 px-1.5 py-px rounded-sm bg-bg-2 text-ink-2">
                {item.category}
              </span>
              <span className="font-mono text-10 text-ink-3">{item.source}</span>
            </div>
          </div>

          {text && (
            <div className="mt-1">
              <p className={`text-11 text-ink-2 m-0 leading-relaxed ${expanded ? "" : "line-clamp-2"}`}>
                {text}
              </p>
              {text.length > 120 && (
                <button
                  type="button"
                  onClick={() => setExpanded((x) => !x)}
                  className="font-mono text-10 text-brand hover:underline mt-0.5"
                >
                  {expanded ? "show less" : "show more"}
                </button>
              )}
            </div>
          )}

          {displayDate && (
            <div className="font-mono text-10 text-ink-3 mt-1">{displayDate}</div>
          )}
        </div>
      </div>
    </div>
  );
}

function FeedPanel({
  items,
  status,
  fetchedAt,
  onRefresh,
}: {
  items: LiveItem[];
  status: "idle" | "loading" | "ok" | "error";
  fetchedAt: string | null;
  onRefresh: () => void;
}) {
  return (
    <div className="flex flex-col min-h-0">
      <div className="flex items-center justify-between mb-3 gap-2">
        <h2 className="text-10 uppercase tracking-wide-4 font-semibold text-ink-2 m-0">
          Regulatory feed
        </h2>
        <div className="flex items-center gap-3">
          {status === "loading" && (
            <span className="font-mono text-10 text-ink-3 animate-pulse">fetching…</span>
          )}
          {status === "ok" && fetchedAt && (
            <span className="font-mono text-10 text-ink-3">
              refreshed {new Date(fetchedAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
            </span>
          )}
          {status === "error" && (
            <span className="font-mono text-10 text-red">feed unavailable</span>
          )}
          <button
            type="button"
            onClick={onRefresh}
            disabled={status === "loading"}
            className="font-mono text-10 px-2 py-0.5 rounded border border-hair-2 text-ink-2 hover:bg-bg-2 disabled:opacity-40"
          >
            refresh
          </button>
        </div>
      </div>

      {status === "loading" && (
        <div className="space-y-2">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="h-16 rounded-lg bg-bg-panel border border-hair-2 animate-pulse" />
          ))}
        </div>
      )}

      {(status === "ok" || status === "error") && (
        <div className="space-y-1.5 overflow-y-auto max-h-[600px] pr-1">
          {items.length > 0 ? (
            items.map((item) => <FeedItem key={item.id} item={item} />)
          ) : (
            <div className="text-12 text-ink-2 py-6 text-center border border-hair-2 rounded-lg">
              No items available.
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Calendar panel sub-components
// ─────────────────────────────────────────────────────────────────────────────

function CalendarCard({ event }: { event: CalendarEvent }) {
  const daysLabel =
    event.daysUntil < 0
      ? `${Math.abs(event.daysUntil)}d OVERDUE`
      : event.daysUntil === 0
        ? "TODAY"
        : `${event.daysUntil}d`;

  const deadlineDisplay = (() => {
    try {
      return new Date(event.deadline + "T00:00:00Z").toLocaleDateString("en-AE", {
        day: "2-digit", month: "short", year: "numeric",
      });
    } catch {
      return event.deadline;
    }
  })();

  return (
    <div className={`rounded-lg p-4 ${URGENCY_CARD[event.urgency]}`}>
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap mb-1">
            <span className={`font-mono text-10 px-1.5 py-px rounded-sm font-semibold ${URGENCY_BADGE[event.urgency]}`}>
              {daysLabel}
            </span>
            <span className={`font-mono text-10 px-1.5 py-px rounded-sm ${CAT_BADGE[event.category]}`}>
              {event.category}
            </span>
          </div>
          <h3 className="text-12 font-semibold text-ink-0 m-0 leading-snug">{event.title}</h3>
          <div className="font-mono text-10 text-ink-3 mt-0.5">
            {event.authority} · {deadlineDisplay}
          </div>
        </div>
      </div>
      <p className="text-11 text-ink-2 m-0 mt-2 leading-relaxed">{event.description}</p>
      <div className="font-mono text-10 text-ink-3 mt-2 border-t border-hair pt-2">
        Ref: {event.regulatoryRef}
      </div>
    </div>
  );
}

function CalendarPanel({
  data,
  status,
}: {
  data: RegCalendarLiveResult | null;
  status: "idle" | "loading" | "ok" | "error";
}) {
  const overdue = data?.events.filter((e) => e.urgency === "overdue") ?? [];
  const critical = data?.events.filter((e) => e.urgency === "critical") ?? [];
  const upcoming = data?.events.filter((e) => e.urgency === "upcoming") ?? [];
  const planned = data?.events.filter((e) => e.urgency === "planned") ?? [];

  return (
    <div className="flex flex-col min-h-0">
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-10 uppercase tracking-wide-4 font-semibold text-ink-2 m-0">
          Compliance calendar
        </h2>
        {status === "loading" && (
          <span className="font-mono text-10 text-ink-3 animate-pulse">loading…</span>
        )}
      </div>

      {status === "loading" && (
        <div className="space-y-2">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-24 rounded-lg bg-bg-panel border border-hair-2 animate-pulse" />
          ))}
        </div>
      )}

      {status === "ok" && data && (
        <div className="space-y-4 overflow-y-auto max-h-[600px] pr-1">
          {overdue.length > 0 && (
            <div>
              <div className="font-mono text-10 uppercase tracking-wide-4 text-red font-semibold mb-2">
                Overdue ({overdue.length})
              </div>
              <div className="space-y-2">
                {overdue.map((e) => <CalendarCard key={e.id} event={e} />)}
              </div>
            </div>
          )}

          {critical.length > 0 && (
            <div>
              <div className="font-mono text-10 uppercase tracking-wide-4 text-amber font-semibold mb-2">
                Critical — due within 14 days ({critical.length})
              </div>
              <div className="space-y-2">
                {critical.map((e) => <CalendarCard key={e.id} event={e} />)}
              </div>
            </div>
          )}

          {upcoming.length > 0 && (
            <div>
              <div className="font-mono text-10 uppercase tracking-wide-4 text-ink-2 font-semibold mb-2">
                Upcoming — next 60 days ({upcoming.length})
              </div>
              <div className="space-y-2">
                {upcoming.map((e) => <CalendarCard key={e.id} event={e} />)}
              </div>
            </div>
          )}

          {planned.length > 0 && (
            <div>
              <div className="font-mono text-10 uppercase tracking-wide-4 text-ink-3 font-semibold mb-2">
                Planned ({planned.length})
              </div>
              <div className="space-y-2">
                {planned.map((e) => <CalendarCard key={e.id} event={e} />)}
              </div>
            </div>
          )}
        </div>
      )}

      {status === "error" && (
        <div className="text-12 text-red py-6 text-center border border-hair-2 rounded-lg">
          Calendar unavailable.
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Main page
// ─────────────────────────────────────────────────────────────────────────────

export default function RegulatoryPage() {
  // Feed state
  const [feedItems, setFeedItems] = useState<LiveItem[]>([]);
  const [feedStatus, setFeedStatus] = useState<"idle" | "loading" | "ok" | "error">("idle");
  const [fetchedAt, setFetchedAt] = useState<string | null>(null);

  // Calendar state
  const [calData, setCalData] = useState<RegCalendarLiveResult | null>(null);
  const [calStatus, setCalStatus] = useState<"idle" | "loading" | "ok" | "error">("idle");

  // Library filter state
  const [query, setQuery] = useState("");
  const [activeTag, setActiveTag] = useState<string | null>(null);

  // Auto-refresh timer ref
  const refreshTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const loadFeed = useCallback(() => {
    setFeedStatus("loading");
    fetch("/api/regulatory-feed")
      .then((r) => r.json())
      .then((data: FeedResult) => {
        setFeedItems(data.items ?? []);
        setFetchedAt(data.fetchedAt ?? null);
        setFeedStatus("ok");
      })
      .catch(() => setFeedStatus("error"));
  }, []);

  const loadCalendar = useCallback(() => {
    setCalStatus("loading");
    fetch("/api/regulatory-calendar-live")
      .then((r) => r.json())
      .then((data: RegCalendarLiveResult) => {
        setCalData(data);
        setCalStatus("ok");
      })
      .catch(() => setCalStatus("error"));
  }, []);

  useEffect(() => {
    loadFeed();
    loadCalendar();
    // Auto-refresh feed every 5 minutes
    refreshTimerRef.current = setInterval(loadFeed, 5 * 60_000);
    return () => {
      if (refreshTimerRef.current) clearInterval(refreshTimerRef.current);
    };
  }, [loadFeed, loadCalendar]);

  // KPIs computed from feed + calendar
  const redCount = feedItems.filter((i) => i.tone === "red").length;
  const amberCount = feedItems.filter((i) => i.tone === "amber").length;
  const upcomingDeadlines = calData
    ? calData.events.filter((e) => e.urgency === "upcoming" || e.urgency === "critical").length
    : 0;
  const overdueCount = calData?.overdueCount ?? 0;

  // Library filtering
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return LIBRARY.filter((e) => {
      if (activeTag && !e.tags.includes(activeTag)) return false;
      if (!q) return true;
      const hay = `${e.code} ${e.title} ${e.citation} ${e.summary} ${e.authority} ${e.tags.join(" ")}`.toLowerCase();
      return hay.includes(q);
    });
  }, [query, activeTag]);

  const kpis = [
    { value: String(feedItems.length), label: "Live items" },
    { value: String(redCount), label: "Red alerts", tone: redCount > 0 ? ("red" as const) : undefined },
    { value: String(amberCount), label: "Amber alerts", tone: amberCount > 0 ? ("amber" as const) : undefined },
    { value: String(overdueCount), label: "Overdue", tone: overdueCount > 0 ? ("red" as const) : undefined },
    { value: String(upcomingDeadlines), label: "Upcoming deadlines" },
  ];

  return (
    <ModuleLayout asanaModule="regulatory" asanaLabel="Regulatory">
      <ModuleHero
        moduleNumber={31}
        eyebrow="Module 11 · Regulatory Intelligence"
        title="Regulatory"
        titleEm="library."
        kpis={kpis}
        intro={
          <>
            <strong>Every citation the brain makes, in one searchable reference.</strong>{" "}
            FDL / CR / MoE / FATF / LBMA / OECD — keyword search across title,
            citation, and summary; click a tag to narrow by framework.{" "}
            <strong>Primary UAE DPMS regulatory bodies:</strong>{" "}
            FATF (global standards), CBUAE (licensed financial institutions), MoE (DPMS/DNFBPs),
            LBMA (responsible gold guidance), and EOCN (targeted financial sanctions &amp; conflict minerals).
            Live feed auto-refreshes every 5 minutes. Calendar deadlines computed from today's date.
          </>
        }
      />

      {/* ── Live feed + Calendar panels — side by side on desktop ── */}
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6 mb-10">
        {/* Feed panel */}
        <div className="bg-bg-panel border border-hair-2 rounded-xl p-5">
          <FeedPanel
            items={feedItems}
            status={feedStatus}
            fetchedAt={fetchedAt}
            onRefresh={loadFeed}
          />
        </div>

        {/* Calendar panel */}
        <div className="bg-bg-panel border border-hair-2 rounded-xl p-5">
          <CalendarPanel data={calData} status={calStatus} />
        </div>
      </div>

      {/* ── Regulatory Reference Library ── */}
      <div className="mb-4">
        <h2 className="text-10 uppercase tracking-wide-4 font-semibold text-ink-2 m-0 mb-4">
          Regulatory reference library
        </h2>
        <div className="bg-bg-panel border border-hair-2 rounded-lg p-3 mb-4">
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
                activeTag === null ? "bg-brand text-white" : "bg-bg-2 text-ink-2 hover:bg-bg-1"
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
                  activeTag === t ? "bg-brand text-white" : "bg-bg-2 text-ink-2 hover:bg-bg-1"
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
                <span className="font-mono text-10 text-ink-3 shrink-0">{e.code}</span>
              </div>
              <div className="font-mono text-10 text-ink-3 mb-2">
                {e.authority} · {e.citation}
              </div>
              <p className="text-11.5 text-ink-1 leading-relaxed m-0">{e.summary}</p>
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
            <div className="text-12 text-ink-2 py-8 text-center">No entries match.</div>
          )}
        </div>
      </div>
    </ModuleLayout>
  );
}
