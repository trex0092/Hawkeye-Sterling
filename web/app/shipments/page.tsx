"use client";

import { useEffect, useMemo, useState } from "react";
import { ModuleHero, ModuleLayout } from "@/components/layout/ModuleLayout";
import { AsanaReportButton } from "@/components/shared/AsanaReportButton";
import { RowActions } from "@/components/shared/RowActions";
import { formatDMY } from "@/lib/utils/dateFormat";

// ── TBML AI types ────────────────────────────────────────────────────────────
interface TbmlFlaggedShipment {
  reference: string;
  tbmlIndicators: string[];
  fatfTypologies: string[];
  riskLevel: "critical" | "high" | "medium" | "low";
  recommendedAction: "hold" | "enhanced_dd" | "file_str" | "monitor" | "clear";
  rationale: string;
}

interface ShipmentTbml {
  ok: boolean;
  portfolioTbmlRisk: "critical" | "high" | "medium" | "low";
  portfolioNarrative: string;
  flaggedShipments: TbmlFlaggedShipment[];
  systemicRisks: string[];
  lbmaGaps: string[];
  immediateHolds: string[];
  regulatoryExposure: string;
}

const TBML_RISK_TONE: Record<string, string> = {
  critical: "bg-red-dim text-red border-red/30",
  high:     "bg-red-dim text-red border-red/30",
  medium:   "bg-amber-dim text-amber border-amber/30",
  low:      "bg-green-dim text-green border-green/30",
};

// Operator-saved deletes persist to localStorage so the working register
// survives reload. The seed CONSIGNMENTS array stays the system-of-record;
// user dismissals are overlaid and never mutate the seed.
const SHIPMENTS_DELETED_KEY = "hawkeye.shipments.deleted.v1";
const SHIPMENTS_CUSTOM_KEY = "hawkeye.shipments.custom.v1";

function loadDeletedIds(): string[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(SHIPMENTS_DELETED_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    return Array.isArray(parsed) ? parsed.filter((v): v is string => typeof v === "string") : [];
  } catch {
    return [];
  }
}

function saveDeletedIds(ids: string[]): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(SHIPMENTS_DELETED_KEY, JSON.stringify(ids));
  } catch {
    /* quota / disabled — silent */
  }
}

function loadCustom(): Consignment[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(SHIPMENTS_CUSTOM_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    return Array.isArray(parsed) ? (parsed as Consignment[]) : [];
  } catch {
    return [];
  }
}

function saveCustom(rows: Consignment[]): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(SHIPMENTS_CUSTOM_KEY, JSON.stringify(rows));
  } catch {
    /* quota / disabled — silent */
  }
}

// Bullion chain-of-custody register — LBMA RGG v9 / OECD 5-step DD framework.
// Each consignment is tracked from origin refinery through transit to final vault.

type ShipmentStatus = "in-flight" | "at-vault" | "awaiting-assay" | "held" | "arrived" | "delivered";

interface ChainEntry {
  ts: string;
  actor: string;
  action: string;
  hash: string; // truncated WORM hash
}

interface Consignment {
  id: string;
  reference: string;
  status: ShipmentStatus;
  origin: string;
  originCountry: string;
  refinery: string;
  refineryLbmaId: string;
  grossWeightKg: number;
  weightGms: number;
  fineness: number; // e.g. 999.9
  bars: number;
  usdValue: number;
  description: string;
  dispatchDate: string;
  eta: string;
  direction: "Import" | "Export";
  carrier: string;
  transportationAgent: string;
  awb: string;
  invoiceNumber: string;
  clearanceDate: string;
  transitProgress: number; // 0–100
  vaultLocation: string;
  consignee: string;
  assayPending: boolean;
  rggStep: 1 | 2 | 3 | 4 | 5; // highest OECD step completed
  flags: string[];
  chain: ChainEntry[];
  // §1 Supply-chain data
  mineOfOrigin: string;
  miningCountry: string;
  exportLicence: string;
  // §2 Refinery
  refineryAuditDate: string;
  lbmaGoodDelivery: boolean;
  // §3 Trading counterparty
  counterparty: string;
  counterpartyJurisdiction: string;
  counterpartyCddRef: string;
  // §4 Logistics & vault
  custodian: string;
  insuranceRef: string;
  vaultCertRef: string;
  deliveryLocation: string;
  // Additional fields
  netWeightKg: number;
  lotNumber: string;
  riskLevels?: string[];
}

const CONSIGNMENTS: Consignment[] = [
  {
    id: "SHP-2025-0041",
    reference: "SHP-2025-0041",
    status: "in-flight",
    origin: "Rand Refinery, Johannesburg",
    originCountry: "ZA",
    refinery: "Rand Refinery Ltd",
    refineryLbmaId: "LBMA-RR-001",
    grossWeightKg: 124.8,
    weightGms: 124_800,
    fineness: 999.9,
    bars: 10,
    usdValue: 11_240_000,
    description: "Gold bullion bars — 24K Good Delivery, cast & stamped, serialised",
    dispatchDate: "21/04/2025",
    eta: "26/04/2025",
    direction: "Import",
    carrier: "Malca-Amit",
    transportationAgent: "Malca-Amit Secure Logistics",
    awb: "MA-20250421-0099",
    invoiceNumber: "RR-INV-2025-0441",
    clearanceDate: "—",
    transitProgress: 68,
    vaultLocation: "DMCC Tradeflow Vault, Dubai",
    consignee: "DMCC Member 77341",
    assayPending: true,
    rggStep: 3,
    flags: [],
    chain: [
      { ts: "2025-04-21 08:14", actor: "Rand Refinery Ltd", action: "Bar cast & stamped — bar IDs logged", hash: "a3f9b2c1" },
      { ts: "2025-04-21 11:30", actor: "Malca-Amit JNB", action: "Consignment accepted, AWB issued", hash: "d71e4f08" },
      { ts: "2025-04-21 22:47", actor: "Malca-Amit DXB", action: "Departed JNB — EK773 cargo manifest", hash: "8b2a901c" },
      { ts: "2025-04-22 06:10", actor: "Hawkeye Compliance", action: "AML screening: origin country ZA — cleared", hash: "55c3d74e" },
    ],
    mineOfOrigin: "Driefontein Gold Mine",
    miningCountry: "South Africa",
    exportLicence: "SARS-EXP-2025-44102",
    refineryAuditDate: "2024-11-10",
    lbmaGoodDelivery: true,
    counterparty: "DMCC Member 77341",
    counterpartyJurisdiction: "UAE",
    counterpartyCddRef: "CDD-2024-0812",
    custodian: "DMCC Tradeflow",
    insuranceRef: "AON-AU-2025-7711",
    vaultCertRef: "—",
    deliveryLocation: "DMCC Tradeflow Vault, Dubai",
    netWeightKg: 124.6,
    lotNumber: "LOT-RR-2025-0099",
  },
  {
    id: "SHP-2025-0038",
    reference: "SHP-2025-0038",
    status: "at-vault",
    origin: "Argor-Heraeus SA, Mendrisio",
    originCountry: "CH",
    refinery: "Argor-Heraeus",
    refineryLbmaId: "LBMA-AH-003",
    grossWeightKg: 249.6,
    weightGms: 249_600,
    fineness: 999.5,
    bars: 20,
    usdValue: 22_410_000,
    description: "Gold bullion — 24K Good Delivery bars, recycled European scrap origin",
    dispatchDate: "14/04/2025",
    eta: "16/04/2025",
    direction: "Import",
    carrier: "Brinks",
    transportationAgent: "Brinks International",
    awb: "BRK-DXB-20250414",
    invoiceNumber: "AH-INV-2025-0318",
    clearanceDate: "16/04/2025",
    transitProgress: 100,
    vaultLocation: "Emirates Gold Vault, Almas Tower",
    consignee: "Emirates Gold DMCC",
    assayPending: true,
    rggStep: 4,
    flags: [],
    chain: [
      { ts: "2025-04-14 07:00", actor: "Argor-Heraeus", action: "Production complete — CoA issued", hash: "f2e7a310" },
      { ts: "2025-04-14 15:22", actor: "Brinks Geneva", action: "Collected for transit", hash: "3c8d5b99" },
      { ts: "2025-04-15 14:55", actor: "Emirates SkyCargo", action: "In-flight EK001 — cargo manifest #EK-2025-1415", hash: "9a1f2d86" },
      { ts: "2025-04-16 10:03", actor: "Brinks DXB", action: "Delivered to Emirates Gold Vault", hash: "b4c09e2a" },
      { ts: "2025-04-16 11:40", actor: "Emirates Gold Vault", action: "Vault receipt issued — VR-2025-0216", hash: "72da8f30" },
      { ts: "2025-04-17 09:15", actor: "Hawkeye Compliance", action: "AML screening: counterparty CDD refreshed", hash: "c5e3a198" },
    ],
    mineOfOrigin: "Multiple (European recycled scrap)",
    miningCountry: "Switzerland / EU",
    exportLicence: "CH-EXP-A-202504-0031",
    refineryAuditDate: "2025-01-22",
    lbmaGoodDelivery: true,
    counterparty: "Emirates Gold DMCC",
    counterpartyJurisdiction: "UAE",
    counterpartyCddRef: "CDD-2025-0114",
    custodian: "Emirates Gold Vault",
    insuranceRef: "ZURICH-CG-2025-3301",
    vaultCertRef: "VR-2025-0216",
    deliveryLocation: "Emirates Gold Vault, Almas Tower",
    netWeightKg: 249.2,
    lotNumber: "LOT-AH-2025-0318",
  },
  {
    id: "SHP-2025-0035",
    reference: "SHP-2025-0035",
    status: "awaiting-assay",
    origin: "Valcambi SA, Balerna",
    originCountry: "CH",
    refinery: "Valcambi",
    refineryLbmaId: "LBMA-VC-002",
    grossWeightKg: 62.2,
    weightGms: 62_200,
    fineness: 999.9,
    bars: 5,
    usdValue: 5_590_000,
    description: "Gold bullion bars — 24K Good Delivery, Valcambi Suisse certified",
    dispatchDate: "10/04/2025",
    eta: "12/04/2025",
    direction: "Import",
    carrier: "G4S Courier",
    transportationAgent: "G4S Security Solutions",
    awb: "G4S-DXB-20250410",
    invoiceNumber: "VC-INV-2025-0209",
    clearanceDate: "12/04/2025",
    transitProgress: 100,
    vaultLocation: "DMCC Tradeflow Vault, Dubai",
    consignee: "DMCC Member 61209",
    assayPending: true,
    rggStep: 4,
    flags: ["Assay overdue 12d"],
    chain: [
      { ts: "2025-04-10 09:00", actor: "Valcambi SA", action: "Good Delivery bars packaged", hash: "e1a3c72d" },
      { ts: "2025-04-12 13:30", actor: "DMCC Tradeflow Vault", action: "Received — 5 bars counted", hash: "48fb0d91" },
      { ts: "2025-04-12 14:00", actor: "DMCC Assay Lab", action: "Assay booked — ref ASY-2025-0410", hash: "7d2e9b55" },
    ],
    mineOfOrigin: "Recycled: European scrap pool",
    miningCountry: "Switzerland",
    exportLicence: "CH-EXP-A-202504-0018",
    refineryAuditDate: "2024-09-05",
    lbmaGoodDelivery: true,
    counterparty: "DMCC Member 61209",
    counterpartyJurisdiction: "UAE",
    counterpartyCddRef: "CDD-2024-1120",
    custodian: "DMCC Tradeflow",
    insuranceRef: "ZURICH-CG-2025-1801",
    vaultCertRef: "DMCC-VR-2025-0180",
    deliveryLocation: "DMCC Tradeflow Vault, Dubai",
    netWeightKg: 62.0,
    lotNumber: "LOT-VC-2025-0209",
  },
  {
    id: "SHP-2025-0029",
    reference: "SHP-2025-0029",
    status: "held",
    origin: "Unknown smelter, via broker",
    originCountry: "XX",
    refinery: "Unidentified",
    refineryLbmaId: "—",
    grossWeightKg: 37.5,
    weightGms: 37_500,
    fineness: 995.0,
    bars: 3,
    usdValue: 3_330_000,
    description: "Gold bars — fineness 995, origin undocumented, no CoA",
    dispatchDate: "02/04/2025",
    eta: "05/04/2025",
    direction: "Import",
    carrier: "Private courier",
    transportationAgent: "Unknown",
    awb: "PRIV-2025-0402",
    invoiceNumber: "—",
    clearanceDate: "—",
    transitProgress: 100,
    vaultLocation: "Dubai Airport FTZ, Holding Bay",
    consignee: "Anonymous broker",
    assayPending: true,
    rggStep: 1,
    flags: ["Unknown origin", "No LBMA certification", "Broker — no CDD"],
    chain: [
      { ts: "2025-04-05 16:45", actor: "DXB FTZ Customs", action: "Shipment arrived — origin docs incomplete", hash: "001ca374" },
      { ts: "2025-04-05 17:00", actor: "Hawkeye Compliance", action: "HOLD placed — origin undocumented per LBMA RGG §3.2", hash: "bb9f14e0" },
      { ts: "2025-04-06 09:00", actor: "MLRO", action: "STR assessment initiated — ref STR-2025-0041", hash: "3ff82a1d" },
    ],
    mineOfOrigin: "Unknown",
    miningCountry: "Unknown",
    exportLicence: "—",
    refineryAuditDate: "—",
    lbmaGoodDelivery: false,
    counterparty: "Anonymous broker",
    counterpartyJurisdiction: "Unknown",
    counterpartyCddRef: "—",
    custodian: "DXB FTZ Customs",
    insuranceRef: "—",
    vaultCertRef: "—",
    deliveryLocation: "Dubai Airport FTZ, Holding Bay",
    netWeightKg: 37.2,
    lotNumber: "—",
  },
  {
    id: "SHP-2025-0021",
    reference: "SHP-2025-0021",
    status: "delivered",
    origin: "PAMP SA, Geneva",
    originCountry: "CH",
    refinery: "PAMP SA",
    refineryLbmaId: "LBMA-PAMP-004",
    grossWeightKg: 124.4,
    weightGms: 124_400,
    fineness: 999.9,
    bars: 10,
    usdValue: 11_170_000,
    description: "Gold bullion bars — 24K Good Delivery, PAMP Suisse certified, serialised",
    dispatchDate: "15/03/2025",
    eta: "17/03/2025",
    direction: "Import",
    carrier: "Brinks",
    transportationAgent: "Brinks International",
    awb: "BRK-DXB-20250315",
    invoiceNumber: "PAMP-INV-2025-0144",
    clearanceDate: "17/03/2025",
    transitProgress: 100,
    vaultLocation: "Emirates Gold Vault, Almas Tower",
    consignee: "Emirates Gold DMCC",
    assayPending: false,
    rggStep: 5,
    flags: [],
    chain: [
      { ts: "2025-03-15 07:30", actor: "PAMP SA", action: "Good Delivery bars produced", hash: "9c4e7d02" },
      { ts: "2025-03-17 11:00", actor: "Emirates Gold Vault", action: "Received — 10 bars", hash: "a7f3c811" },
      { ts: "2025-03-17 15:00", actor: "DMCC Assay Lab", action: "Assay complete — fineness confirmed 999.9", hash: "d0b8e355" },
      { ts: "2025-03-18 09:00", actor: "Hawkeye Compliance", action: "Full RGG 5-step checklist passed", hash: "f49a1c70" },
      { ts: "2025-03-20 14:30", actor: "MLRO", action: "Release authorised — proceeds transferred", hash: "8e2c5f41" },
    ],
    mineOfOrigin: "Recycled: Swiss scrap",
    miningCountry: "Switzerland",
    exportLicence: "CH-EXP-A-202503-0044",
    refineryAuditDate: "2025-01-10",
    lbmaGoodDelivery: true,
    counterparty: "Emirates Gold DMCC",
    counterpartyJurisdiction: "UAE",
    counterpartyCddRef: "CDD-2025-0114",
    custodian: "Emirates Gold Vault",
    insuranceRef: "ZURICH-CG-2025-0101",
    vaultCertRef: "EGV-VR-2025-0091",
    deliveryLocation: "Emirates Gold Vault, Almas Tower",
    netWeightKg: 124.1,
    lotNumber: "LOT-PAMP-2025-0144",
  },
];

const STATUS_TABS: { key: ShipmentStatus | "all"; label: string }[] = [
  { key: "all", label: "All" },
  { key: "in-flight", label: "In flight" },
  { key: "arrived", label: "Arrived" },
  { key: "at-vault", label: "At vault" },
  { key: "awaiting-assay", label: "Awaiting assay" },
  { key: "held", label: "Held" },
  { key: "delivered", label: "Delivered" },
];

const STATUS_TONE: Record<ShipmentStatus, string> = {
  "in-flight": "bg-blue-dim text-blue",
  "arrived": "bg-brand-dim text-brand",
  "at-vault": "bg-green-dim text-green",
  "awaiting-assay": "bg-amber-dim text-amber",
  "held": "bg-red-dim text-red",
  "delivered": "bg-bg-2 text-ink-2",
};

const STATUS_LABEL: Record<ShipmentStatus, string> = {
  "in-flight": "In flight",
  "arrived": "Arrived",
  "at-vault": "At vault",
  "awaiting-assay": "Awaiting assay",
  "held": "Held",
  "delivered": "Delivered",
};

const RGG_STEPS = [
  { n: 1, label: "Management systems" },
  { n: 2, label: "Identify & assess risk" },
  { n: 3, label: "Manage & mitigate risk" },
  { n: 4, label: "Third-party audit" },
  { n: 5, label: "Report on DD" },
];

const COUNTRY_FLAG: Record<string, string> = {
  ZA: "🇿🇦", CH: "🇨🇭", AE: "🇦🇪", XX: "🏴",
};

function fmt(n: number): string {
  return n.toLocaleString("en-US");
}

function ProgressBar({ pct }: { pct: number }) {
  return (
    <div className="w-full bg-bg-2 rounded-full h-1.5 mt-1">
      <div
        className={`h-1.5 rounded-full transition-all ${pct === 100 ? "bg-green" : "bg-brand"}`}
        style={{ width: `${pct}%` }}
      />
    </div>
  );
}

const RISK_LEVEL_OPTIONS = ["Low-Risk", "Medium-Risk", "High-Risk"] as const;
const RISK_LEVEL_TONE: Record<string, string> = {
  "Low-Risk":    "bg-green-dim text-green border-green/30",
  "Medium-Risk": "bg-amber-dim text-amber border-amber/30",
  "High-Risk":   "bg-red-dim text-red border-red/30",
};

function EditShipmentForm({ initial, onSave, onCancel }: { initial: Consignment; onSave: (c: Consignment) => void; onCancel: () => void }) {
  const [draft, setDraft] = useState<Consignment>(initial);
  const [err, setErr] = useState("");

  const set = <K extends keyof Consignment>(k: K, v: Consignment[K]) =>
    setDraft((d) => ({ ...d, [k]: v }));

  const iCls = "w-full bg-bg-1 border border-hair-2 rounded px-2.5 py-1.5 text-12 text-ink-0 focus:outline-none focus:border-brand";
  const lCls = "block text-10 uppercase tracking-wide-3 text-ink-3 mb-1";
  const sectCls = "text-10 font-mono uppercase tracking-wide-3 text-brand mb-2";

  const toggleRisk = (level: string) => {
    const cur = draft.riskLevels ?? [];
    set("riskLevels", cur.includes(level) ? cur.filter((r) => r !== level) : [...cur, level]);
  };

  const submit = () => {
    if (!draft.refinery.trim()) { setErr("Supplier is required."); return; }
    const flagsArr = Array.isArray(draft.flags)
      ? draft.flags
      : String(draft.flags ?? "").split(",").map((s) => s.trim()).filter(Boolean);
    onSave({ ...draft, flags: flagsArr });
  };

  const flagsText = (draft.flags ?? []).join(", ");

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center bg-black/60 overflow-y-auto py-8 px-4"
      onClick={onCancel}
    >
      <div
        className="w-full max-w-4xl bg-bg-panel border border-brand/20 rounded-xl p-5 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-4">
          <div>
            <div className="text-11 font-semibold uppercase tracking-wide-3 text-brand">Edit consignment</div>
            <div className="font-mono text-11 text-ink-3 mt-0.5">{draft.id}</div>
          </div>
          <button type="button" onClick={onCancel} className="text-ink-3 hover:text-ink-0 text-18 leading-none px-2">×</button>
        </div>
        {err && <p className="text-11 text-red mb-2">{err}</p>}

        {/* Status & metrics */}
        <div className="mb-4">
          <div className={sectCls}>Status &amp; metrics</div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <div>
              <label className={lCls}>Status</label>
              <select value={draft.status} onChange={(e) => set("status", e.target.value as ShipmentStatus)} className={iCls}>
                <option value="in-flight">In flight</option>
                <option value="arrived">Arrived</option>
                <option value="awaiting-assay">Awaiting assay</option>
                <option value="at-vault">At vault</option>
                <option value="held">Held</option>
                <option value="delivered">Delivered</option>
              </select>
            </div>
            <div>
              <label className={lCls}>Transit %</label>
              <input type="number" min={0} max={100} value={draft.transitProgress}
                onChange={(e) => set("transitProgress", parseInt(e.target.value, 10) || 0)} className={iCls} />
            </div>
            <div>
              <label className={lCls}>OECD step (1–5)</label>
              <select value={draft.rggStep} onChange={(e) => set("rggStep", parseInt(e.target.value, 10) as 1 | 2 | 3 | 4 | 5)} className={iCls}>
                {[1, 2, 3, 4, 5].map((n) => <option key={n} value={n}>{n}</option>)}
              </select>
            </div>
            <div>
              <label className={lCls}>Assay pending</label>
              <select value={draft.assayPending ? "yes" : "no"} onChange={(e) => set("assayPending", e.target.value === "yes")} className={iCls}>
                <option value="no">No</option>
                <option value="yes">Yes</option>
              </select>
            </div>
            <div>
              <label className={lCls}>USD value</label>
              <input type="number" value={draft.usdValue} onChange={(e) => set("usdValue", parseFloat(e.target.value) || 0)} className={iCls} />
            </div>
            <div>
              <label className={lCls}>Gross weight (kg)</label>
              <input type="number" step="0.01" value={draft.grossWeightKg}
                onChange={(e) => {
                  const kg = parseFloat(e.target.value) || 0;
                  setDraft((d) => ({ ...d, grossWeightKg: kg, weightGms: Math.round(kg * 1000) }));
                }}
                className={iCls} />
            </div>
            <div>
              <label className={lCls}>Net weight (kg)</label>
              <input type="number" step="0.01" value={draft.netWeightKg} onChange={(e) => set("netWeightKg", parseFloat(e.target.value) || 0)} className={iCls} />
            </div>
            <div>
              <label className={lCls}>Lot number</label>
              <input value={draft.lotNumber} onChange={(e) => set("lotNumber", e.target.value)} className={iCls} />
            </div>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mt-3">
            <div>
              <label className={lCls}>Flags (comma-separated)</label>
              <input value={flagsText} onChange={(e) => set("flags", e.target.value.split(",").map((s) => s.trim()).filter(Boolean))} className={iCls} placeholder="e.g. SANCTION-MATCH, PRICE-VARIANCE" />
            </div>
            <div>
              <label className={lCls}>Risk level</label>
              <div className="flex gap-2">
                {RISK_LEVEL_OPTIONS.map((lvl) => {
                  const active = (draft.riskLevels ?? []).includes(lvl);
                  return (
                    <button key={lvl} type="button" onClick={() => toggleRisk(lvl)}
                      className={`flex-1 py-1.5 rounded border text-11 font-semibold transition-colors ${
                        active ? RISK_LEVEL_TONE[lvl] : "bg-bg-1 text-ink-2 border-hair-2 hover:border-brand hover:text-ink-0"
                      }`}>{lvl}</button>
                  );
                })}
              </div>
            </div>
          </div>
        </div>

        {/* §1 Origin */}
        <div className="mb-4 pt-3 border-t border-hair-2">
          <div className={sectCls}>§1 Origin</div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <div>
              <label className={lCls}>Mine of origin</label>
              <input value={draft.mineOfOrigin} onChange={(e) => set("mineOfOrigin", e.target.value)} className={iCls} />
            </div>
            <div>
              <label className={lCls}>Mining country</label>
              <input value={draft.miningCountry} onChange={(e) => set("miningCountry", e.target.value)} className={iCls} />
            </div>
            <div>
              <label className={lCls}>Origin country code</label>
              <input value={draft.originCountry} onChange={(e) => set("originCountry", e.target.value.toUpperCase())} className={iCls} placeholder="ZA / CH / AE" />
            </div>
            <div className="col-span-2">
              <label className={lCls}>Origin (free text)</label>
              <input value={draft.origin} onChange={(e) => set("origin", e.target.value)} className={iCls} />
            </div>
            <div>
              <label className={lCls}>Export licence</label>
              <input value={draft.exportLicence} onChange={(e) => set("exportLicence", e.target.value)} className={iCls} />
            </div>
            <div className="col-span-2">
              <label className={lCls}>Description</label>
              <input value={draft.description} onChange={(e) => set("description", e.target.value)} className={iCls} />
            </div>
            <div>
              <label className={lCls}>Dispatch date</label>
              <input value={draft.dispatchDate} onChange={(e) => set("dispatchDate", e.target.value)} className={iCls} placeholder="DD/MM/YYYY" />
            </div>
          </div>
        </div>

        {/* §2 Refinery */}
        <div className="mb-4 pt-3 border-t border-hair-2">
          <div className={sectCls}>§2 Refinery</div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <div>
              <label className={lCls}>Supplier *</label>
              <input value={draft.refinery} onChange={(e) => set("refinery", e.target.value)} className={iCls} />
            </div>
            <div>
              <label className={lCls}>LBMA ID / DGD</label>
              <input value={draft.refineryLbmaId} onChange={(e) => set("refineryLbmaId", e.target.value)} className={iCls} />
            </div>
            <div>
              <label className={lCls}>Audit date</label>
              <input value={draft.refineryAuditDate} onChange={(e) => set("refineryAuditDate", e.target.value)} className={iCls} placeholder="DD/MM/YYYY" />
            </div>
            <div>
              <label className={lCls}>Good Delivery</label>
              <select value={draft.lbmaGoodDelivery ? "yes" : "no"} onChange={(e) => set("lbmaGoodDelivery", e.target.value === "yes")} className={iCls}>
                <option value="no">No</option>
                <option value="yes">Yes</option>
              </select>
            </div>
            <div>
              <label className={lCls}>Fineness</label>
              <input type="number" step="0.01" value={draft.fineness} onChange={(e) => set("fineness", parseFloat(e.target.value) || 0)} className={iCls} />
            </div>
            <div>
              <label className={lCls}>Bars</label>
              <input type="number" value={draft.bars} onChange={(e) => set("bars", parseInt(e.target.value, 10) || 0)} className={iCls} />
            </div>
          </div>
        </div>

        {/* §3 Counterparty */}
        <div className="mb-4 pt-3 border-t border-hair-2">
          <div className={sectCls}>§3 Counterparty</div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <div>
              <label className={lCls}>Counterparty (Supplier)</label>
              <input value={draft.counterparty} onChange={(e) => set("counterparty", e.target.value)} className={iCls} />
            </div>
            <div>
              <label className={lCls}>Consignee</label>
              <input value={draft.consignee} onChange={(e) => set("consignee", e.target.value)} className={iCls} />
            </div>
            <div>
              <label className={lCls}>Jurisdiction</label>
              <input value={draft.counterpartyJurisdiction} onChange={(e) => set("counterpartyJurisdiction", e.target.value)} className={iCls} />
            </div>
            <div>
              <label className={lCls}>CDD ref</label>
              <input value={draft.counterpartyCddRef} onChange={(e) => set("counterpartyCddRef", e.target.value)} className={iCls} />
            </div>
            <div className="col-span-2">
              <label className={lCls}>Invoice no.</label>
              <input value={draft.invoiceNumber} onChange={(e) => set("invoiceNumber", e.target.value)} className={iCls} />
            </div>
          </div>
        </div>

        {/* §4 Logistics */}
        <div className="mb-4 pt-3 border-t border-hair-2">
          <div className={sectCls}>§4 Logistics &amp; vault</div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <div>
              <label className={lCls}>Direction</label>
              <select value={draft.direction} onChange={(e) => set("direction", e.target.value as "Import" | "Export")} className={iCls}>
                <option value="Import">Import</option>
                <option value="Export">Export</option>
              </select>
            </div>
            <div>
              <label className={lCls}>Carrier</label>
              <input value={draft.carrier} onChange={(e) => set("carrier", e.target.value)} className={iCls} />
            </div>
            <div>
              <label className={lCls}>Transportation agent</label>
              <input value={draft.transportationAgent} onChange={(e) => set("transportationAgent", e.target.value)} className={iCls} />
            </div>
            <div>
              <label className={lCls}>AWB</label>
              <input value={draft.awb} onChange={(e) => set("awb", e.target.value)} className={iCls} />
            </div>
            <div>
              <label className={lCls}>Clearance date</label>
              <input value={draft.clearanceDate} onChange={(e) => set("clearanceDate", e.target.value)} className={iCls} placeholder="DD/MM/YYYY" />
            </div>
            <div>
              <label className={lCls}>ETA</label>
              <input value={draft.eta} onChange={(e) => set("eta", e.target.value)} className={iCls} placeholder="DD/MM/YYYY" />
            </div>
            <div>
              <label className={lCls}>Custodian</label>
              <input value={draft.custodian} onChange={(e) => set("custodian", e.target.value)} className={iCls} />
            </div>
            <div>
              <label className={lCls}>Vault location</label>
              <input value={draft.vaultLocation} onChange={(e) => set("vaultLocation", e.target.value)} className={iCls} />
            </div>
            <div>
              <label className={lCls}>Delivery location</label>
              <input value={draft.deliveryLocation} onChange={(e) => set("deliveryLocation", e.target.value)} className={iCls} />
            </div>
            <div>
              <label className={lCls}>Vault cert ref</label>
              <input value={draft.vaultCertRef} onChange={(e) => set("vaultCertRef", e.target.value)} className={iCls} />
            </div>
            <div className="col-span-2">
              <label className={lCls}>Insurance ref</label>
              <input value={draft.insuranceRef} onChange={(e) => set("insuranceRef", e.target.value)} className={iCls} />
            </div>
          </div>
        </div>

        <div className="flex gap-2 pt-3 border-t border-hair-2">
          <button type="button" onClick={submit} className="text-11 font-semibold px-4 py-1.5 rounded bg-brand text-white hover:bg-brand/90">Save changes</button>
          <button type="button" onClick={onCancel} className="text-11 font-semibold px-4 py-1.5 rounded border border-hair-2 text-ink-1 hover:bg-bg-2">Cancel</button>
          <span className="ml-auto self-center text-10 text-ink-3 font-mono">Chain-of-custody ledger is WORM and not editable here.</span>
        </div>
      </div>
    </div>
  );
}

function AddShipmentForm({ onAdd, onCancel }: { onAdd: (c: Consignment) => void; onCancel: () => void }) {
  const [reference, setReference] = useState("");
  const [origin, setOrigin] = useState("");
  const [originCountry, setOriginCountry] = useState("AE");
  const [refinery, setRefinery] = useState("");
  const [grossWeightKg, setGrossWeightKg] = useState("");
  const [netWeightKg, setNetWeightKg] = useState("");
  const [bars, setBars] = useState("");
  const [usdValue, setUsdValue] = useState("");
  const [direction, setDirection] = useState<"Import" | "Export">("Import");
  const [status, setStatus] = useState<ShipmentStatus>("in-flight");
  const [riskLevels, setRiskLevels] = useState<string[]>([]);
  const [awb, setAwb] = useState("");
  const [lotNumber, setLotNumber] = useState("");
  const [vaultLocation, setVaultLocation] = useState("Brink's Dubai DMCC");
  const [counterparty, setCounterparty] = useState("");
  const [cddRef, setCddRef] = useState("");
  const [clearanceDate, setClearanceDate] = useState("");
  const [invoiceNo, setInvoiceNo] = useState("");
  const [err, setErr] = useState("");

  const iCls = "w-full bg-bg-1 border border-hair-2 rounded px-2.5 py-1.5 text-12 text-ink-0 focus:outline-none focus:border-brand";

  const toggleRisk = (level: string) => {
    setRiskLevels((prev) =>
      prev.includes(level) ? prev.filter((r) => r !== level) : [...prev, level],
    );
  };

  const submit = () => {
    if (!reference.trim() || !refinery.trim()) { setErr("Reference and Supplier are required."); return; }
    const today = formatDMY(new Date());
    const kg = parseFloat(grossWeightKg) || 0;
    const netKg = parseFloat(netWeightKg) || kg;
    const c: Consignment = {
      id: reference.trim(),
      reference: reference.trim(),
      status,
      origin: origin.trim() || refinery.trim(),
      originCountry: originCountry.trim().toUpperCase() || "AE",
      refinery: refinery.trim(),
      refineryLbmaId: "—",
      grossWeightKg: kg,
      netWeightKg: netKg,
      weightGms: Math.round(kg * 1000),
      fineness: 999.9,
      bars: parseInt(bars, 10) || 0,
      usdValue: parseFloat(usdValue) || 0,
      description: "User-added consignment",
      dispatchDate: today,
      eta: today,
      direction,
      carrier: "—",
      transportationAgent: "—",
      awb: awb.trim() || "—",
      lotNumber: lotNumber.trim() || "—",
      invoiceNumber: invoiceNo.trim() || "—",
      clearanceDate: clearanceDate.trim() || "—",
      transitProgress: status === "delivered" ? 100 : status === "at-vault" ? 95 : status === "arrived" ? 100 : 50,
      vaultLocation: vaultLocation.trim(),
      deliveryLocation: vaultLocation.trim(),
      consignee: counterparty.trim() || "—",
      assayPending: status === "awaiting-assay",
      rggStep: 1,
      flags: [],
      chain: [],
      mineOfOrigin: "—",
      miningCountry: originCountry.trim().toUpperCase() || "AE",
      exportLicence: "—",
      refineryAuditDate: "—",
      lbmaGoodDelivery: false,
      counterparty: counterparty.trim() || "—",
      counterpartyJurisdiction: originCountry.trim().toUpperCase() || "AE",
      counterpartyCddRef: cddRef.trim() || "—",
      custodian: "—",
      insuranceRef: "—",
      vaultCertRef: "—",
      riskLevels,
    };
    onAdd(c);
  };

  return (
    <div className="mb-4 bg-bg-panel border border-brand/20 rounded-xl p-5">
      <div className="text-11 font-semibold uppercase tracking-wide-3 text-brand mb-3">New shipment</div>
      {err && <p className="text-11 text-red mb-2">{err}</p>}

      {/* Row 1 */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-3">
        <div>
          <label className="block text-10 uppercase tracking-wide-3 text-ink-3 mb-1">Reference *</label>
          <input value={reference} onChange={(e) => setReference(e.target.value)} placeholder="SHP-2025-0042" className={iCls} />
        </div>
        <div>
          <label className="block text-10 uppercase tracking-wide-3 text-ink-3 mb-1">Supplier *</label>
          <input value={refinery} onChange={(e) => setRefinery(e.target.value)} placeholder="e.g. Argor-Heraeus" className={iCls} />
        </div>
        <div>
          <label className="block text-10 uppercase tracking-wide-3 text-ink-3 mb-1">Material origin</label>
          <input value={origin} onChange={(e) => setOrigin(e.target.value)} placeholder="City, Country" className={iCls} />
        </div>
        <div>
          <label className="block text-10 uppercase tracking-wide-3 text-ink-3 mb-1">Origin country</label>
          <input value={originCountry} onChange={(e) => setOriginCountry(e.target.value)} placeholder="AE" className={iCls} />
        </div>
      </div>

      {/* Row 2 */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-3">
        <div>
          <label className="block text-10 uppercase tracking-wide-3 text-ink-3 mb-1">Direction</label>
          <select value={direction} onChange={(e) => setDirection(e.target.value as "Import" | "Export")} className={iCls}>
            <option value="Import">Import</option>
            <option value="Export">Export</option>
          </select>
        </div>
        <div>
          <label className="block text-10 uppercase tracking-wide-3 text-ink-3 mb-1">Status</label>
          <select value={status} onChange={(e) => setStatus(e.target.value as ShipmentStatus)} className={iCls}>
            <option value="in-flight">In flight</option>
            <option value="arrived">Arrived</option>
            <option value="awaiting-assay">Awaiting assay</option>
            <option value="at-vault">At vault</option>
            <option value="held">Held</option>
            <option value="delivered">Delivered</option>
          </select>
        </div>
        <div>
          <label className="block text-10 uppercase tracking-wide-3 text-ink-3 mb-1">Gross weight (kg)</label>
          <input value={grossWeightKg} onChange={(e) => setGrossWeightKg(e.target.value)} placeholder="124.8" className={iCls} />
        </div>
        <div>
          <label className="block text-10 uppercase tracking-wide-3 text-ink-3 mb-1">Net weight (kg)</label>
          <input value={netWeightKg} onChange={(e) => setNetWeightKg(e.target.value)} placeholder="124.4" className={iCls} />
        </div>
      </div>

      {/* Row 3 */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-3">
        <div>
          <label className="block text-10 uppercase tracking-wide-3 text-ink-3 mb-1">Bars</label>
          <input value={bars} onChange={(e) => setBars(e.target.value)} placeholder="10" className={iCls} />
        </div>
        <div>
          <label className="block text-10 uppercase tracking-wide-3 text-ink-3 mb-1">USD value</label>
          <input value={usdValue} onChange={(e) => setUsdValue(e.target.value)} placeholder="11240000" className={iCls} />
        </div>
        <div>
          <label className="block text-10 uppercase tracking-wide-3 text-ink-3 mb-1">AWB</label>
          <input value={awb} onChange={(e) => setAwb(e.target.value)} placeholder="MA-20250421-0099" className={iCls} />
        </div>
        <div>
          <label className="block text-10 uppercase tracking-wide-3 text-ink-3 mb-1">Lot number</label>
          <input value={lotNumber} onChange={(e) => setLotNumber(e.target.value)} placeholder="LOT-2025-0042" className={iCls} />
        </div>
      </div>

      {/* Row 4 */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-3">
        <div>
          <label className="block text-10 uppercase tracking-wide-3 text-ink-3 mb-1">Counterparty</label>
          <input value={counterparty} onChange={(e) => setCounterparty(e.target.value)} placeholder="Buyer / consignee" className={iCls} />
        </div>
        <div>
          <label className="block text-10 uppercase tracking-wide-3 text-ink-3 mb-1">
            Risk level <span className="text-ink-3 normal-case tracking-normal">(multi-select)</span>
          </label>
          <div className="flex gap-1">
            {RISK_LEVEL_OPTIONS.map((lvl) => {
              const active = riskLevels.includes(lvl);
              return (
                <button
                  key={lvl}
                  type="button"
                  onClick={() => toggleRisk(lvl)}
                  aria-pressed={active}
                  className={`flex-1 py-1.5 rounded border text-10 font-semibold transition-colors ${
                    active ? RISK_LEVEL_TONE[lvl] : "bg-bg-1 text-ink-2 border-hair-2 hover:border-brand hover:text-ink-0"
                  }`}
                >
                  {lvl.replace("-Risk", "")}
                </button>
              );
            })}
          </div>
        </div>
        <div>
          <label className="block text-10 uppercase tracking-wide-3 text-ink-3 mb-1">CDD ref.</label>
          <input value={cddRef} onChange={(e) => setCddRef(e.target.value)} placeholder="CDD-2025-0042" className={iCls} />
        </div>
        <div>
          <label className="block text-10 uppercase tracking-wide-3 text-ink-3 mb-1">Clearance date</label>
          <input type="date" value={clearanceDate} onChange={(e) => setClearanceDate(e.target.value)} className={iCls} />
        </div>
      </div>

      {/* Row 5 */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
        <div>
          <label className="block text-10 uppercase tracking-wide-3 text-ink-3 mb-1">Invoice no.</label>
          <input value={invoiceNo} onChange={(e) => setInvoiceNo(e.target.value)} placeholder="INV-2025-0042" className={iCls} />
        </div>
        <div className="col-span-3">
          <label className="block text-10 uppercase tracking-wide-3 text-ink-3 mb-1">Vault / delivery location</label>
          <input value={vaultLocation} onChange={(e) => setVaultLocation(e.target.value)} className={iCls} />
        </div>
      </div>

      <div className="flex gap-2">
        <button type="button" onClick={submit} className="text-11 font-semibold px-3 py-1.5 rounded bg-brand text-white hover:bg-brand/90">Add</button>
        <button type="button" onClick={onCancel} className="text-11 font-semibold px-3 py-1.5 rounded border border-hair-2 text-ink-1 hover:bg-bg-2">Cancel</button>
      </div>
    </div>
  );
}

function RggBadge({ step }: { step: number }) {
  return (
    <div className="flex gap-1">
      {RGG_STEPS.map((s) => (
        <div
          key={s.n}
          title={`Step ${s.n}: ${s.label}`}
          className={`w-5 h-5 rounded-sm flex items-center justify-center text-10 font-mono font-semibold border ${
            s.n <= step
              ? "bg-green text-white border-green"
              : "bg-bg-2 text-ink-3 border-hair-2"
          }`}
        >
          {s.n}
        </div>
      ))}
    </div>
  );
}

export default function ShipmentsPage() {
  const [tab, setTab] = useState<ShipmentStatus | "all">("all");
  const [selected, setSelected] = useState<string | null>(CONSIGNMENTS[0]?.id ?? null);
  const [deletedIds, setDeletedIds] = useState<string[]>([]);
  const [customRows, setCustomRows] = useState<Consignment[]>([]);
  const [showAdd, setShowAdd] = useState(false);
  const [releasedIds, setReleasedIds] = useState<string[]>([]);
  const [editingShipment, setEditingShipment] = useState<Consignment | null>(null);
  const [tbml, setTbml] = useState<ShipmentTbml | null>(null);
  const [tbmlLoading, setTbmlLoading] = useState(false);

  // Hydrate deletions and custom rows from localStorage on mount only.
  useEffect(() => {
    setDeletedIds(loadDeletedIds());
    setCustomRows(loadCustom());
  }, []);

  const live = useMemo(
    () => [
      ...CONSIGNMENTS.filter((c) => !deletedIds.includes(c.id)),
      ...customRows.filter((c) => !deletedIds.includes(c.id)),
    ].map((c) =>
      releasedIds.includes(c.id)
        ? { ...c, status: "delivered" as ShipmentStatus, rggStep: 5 as const, transitProgress: 100, assayPending: false }
        : c
    ),
    [deletedIds, customRows, releasedIds],
  );

  const onAddRow = (row: Consignment) => {
    setCustomRows((prev) => {
      const next = [...prev, row];
      saveCustom(next);
      return next;
    });
    setShowAdd(false);
  };

  // Auto-deselect a consignment that was just removed.
  useEffect(() => {
    if (selected && !live.some((c) => c.id === selected)) {
      setSelected(live[0]?.id ?? null);
    }
  }, [live, selected]);

  const onDelete = (id: string) => {
    setDeletedIds((prev) => {
      if (prev.includes(id)) return prev;
      const next = [...prev, id];
      saveDeletedIds(next);
      return next;
    });
  };

  const startEditShipment = (c: Consignment) => {
    setEditingShipment(c);
  };

  const saveShipmentEdit = (patched: Consignment) => {
    // overlay: remove from seed via deletedIds, push patched to customRows
    setDeletedIds((prev) => {
      const next = prev.includes(patched.id) ? prev : [...prev, patched.id];
      saveDeletedIds(next);
      return next;
    });
    setCustomRows((prev) => {
      const next = [...prev.filter((x) => x.id !== patched.id), patched];
      saveCustom(next);
      return next;
    });
    setEditingShipment(null);
  };

  const onRestoreAll = () => {
    setDeletedIds([]);
    saveDeletedIds([]);
  };

  const runTbmlScan = async (consignments: Consignment[]) => {
    setTbmlLoading(true);
    try {
      const payload = consignments.map((c) => ({
        reference: c.reference,
        status: c.status,
        origin: c.origin,
        originCountry: c.originCountry,
        refinery: c.refinery,
        refineryLbmaId: c.refineryLbmaId,
        grossWeightKg: c.grossWeightKg,
        weightGms: c.weightGms,
        fineness: c.fineness,
        bars: c.bars,
        valueUsd: c.usdValue,
        counterparty: c.counterparty,
        counterpartyCountry: c.counterpartyJurisdiction,
        flags: c.flags,
      }));
      const res = await fetch("/api/shipment-tbml", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ consignments: payload }),
      });
      if (res.ok) {
        const data = (await res.json()) as ShipmentTbml;
        setTbml(data);
      }
    } catch {
      /* non-fatal */
    } finally {
      setTbmlLoading(false);
    }
  };

  const visible = tab === "all" ? live : live.filter((c) => c.status === tab);
  const detail = live.find((c) => c.id === selected) ?? null;

  const inFlight = live.filter((c) => c.status === "in-flight").length;
  const held = live.filter((c) => c.status === "held").length;
  const awaitingAssay = live.filter((c) => c.status === "awaiting-assay").length;
  const totalUsd = live.filter((c) => c.status !== "delivered").reduce((s, c) => s + c.usdValue, 0);
  const totalKg = live.filter((c) => c.status !== "delivered").reduce((s, c) => s + c.grossWeightKg, 0);

  return (
    <ModuleLayout asanaModule="shipments" asanaLabel="Shipments" engineLabel="Bullion compliance engine">
      <ModuleHero
        moduleNumber={22}
        eyebrow="Module 24 · Bullion Logistics"
        title="Bullion chain-of-custody"
        titleEm="register."
        intro={
          <>
            <strong>LBMA Responsible Gold Guidance v9 · OECD 5-step DD framework.</strong>{" "}
            End-to-end consignment tracking from origin refinery through transit to vault settlement.
            Every custody transfer is WORM-logged. Held shipments trigger automatic MLRO review.
          </>
        }
        kpis={[
          { value: String(inFlight), label: "in flight" },
          { value: String(awaitingAssay), label: "awaiting assay", tone: awaitingAssay > 0 ? "amber" : undefined },
          { value: String(held), label: "held", tone: held > 0 ? "red" : undefined },
          { value: `${totalKg.toFixed(1)} kg`, label: "active stock" },
          { value: `$${(totalUsd / 1_000_000).toFixed(1)}M`, label: "USD value" },
        ]}
      />


      {showAdd ? (
        <AddShipmentForm onAdd={onAddRow} onCancel={() => setShowAdd(false)} />
      ) : (
        <div className="flex items-center gap-2 mb-4">
          <button
            type="button"
            onClick={() => setShowAdd(true)}
            className="self-start text-11 font-semibold px-4 py-2 rounded border border-brand text-brand hover:bg-brand-dim transition-colors"
          >
            + Add
          </button>
          <button
            type="button"
            disabled={tbmlLoading}
            onClick={() => void runTbmlScan(visible)}
            className="self-start text-11 font-semibold px-4 py-2 rounded border border-amber/60 text-amber bg-amber-dim hover:bg-amber/20 transition-colors disabled:opacity-50"
          >
            {tbmlLoading ? "Scanning…" : "✦AI TBML Scan"}
          </button>
          {tbml && (
            <button
              type="button"
              onClick={() => setTbml(null)}
              className="self-start text-11 text-ink-3 hover:text-ink-1 px-2 py-2"
            >
              Clear scan
            </button>
          )}
        </div>
      )}

      {/* TBML AI panel */}
      {tbml && (
        <div className="mb-4 bg-bg-panel border border-amber/30 rounded-xl p-4 space-y-3">
          <div className="flex items-center gap-3 flex-wrap">
            <span className="text-11 font-semibold uppercase tracking-wide-3 text-amber">AI TBML Assessment</span>
            <span className={`inline-flex items-center px-2 py-0.5 rounded font-mono text-10 font-semibold uppercase border ${TBML_RISK_TONE[tbml.portfolioTbmlRisk] ?? "bg-bg-2 text-ink-3 border-hair-2"}`}>
              Portfolio risk: {tbml.portfolioTbmlRisk}
            </span>
          </div>
          <p className="text-12 text-ink-1">{tbml.portfolioNarrative}</p>

          {tbml.immediateHolds.length > 0 && (
            <div>
              <div className="text-10 font-semibold uppercase tracking-wide-3 text-red mb-1.5">HOLD immediately</div>
              <div className="flex flex-wrap gap-1.5">
                {tbml.immediateHolds.map((ref) => (
                  <span key={ref} className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-red-dim border border-red/40 font-mono text-10 text-red">
                    <strong>HOLD</strong> {ref}
                  </span>
                ))}
              </div>
            </div>
          )}

          {tbml.systemicRisks.length > 0 && (
            <div>
              <div className="text-10 font-semibold uppercase tracking-wide-3 text-ink-2 mb-1">Systemic risks</div>
              <ul className="list-disc list-inside space-y-0.5">
                {tbml.systemicRisks.map((r, i) => (
                  <li key={i} className="text-12 text-ink-1">{r}</li>
                ))}
              </ul>
            </div>
          )}

          {tbml.lbmaGaps.length > 0 && (
            <div>
              <div className="text-10 font-semibold uppercase tracking-wide-3 text-ink-2 mb-1">LBMA RGG v9 gaps</div>
              <ul className="list-disc list-inside space-y-0.5">
                {tbml.lbmaGaps.map((g, i) => (
                  <li key={i} className="text-12 text-ink-1">{g}</li>
                ))}
              </ul>
            </div>
          )}

          {tbml.regulatoryExposure && (
            <div>
              <div className="text-10 font-semibold uppercase tracking-wide-3 text-ink-2 mb-1">Regulatory exposure</div>
              <code className="font-mono text-10 text-ink-1 break-all">{tbml.regulatoryExposure}</code>
            </div>
          )}
        </div>
      )}

      {/* Filter tabs */}
      <div className="flex gap-1 mb-4 border-b border-hair-2 pb-0">
        {STATUS_TABS.map((t) => {
          const active = tab === t.key;
          const count = t.key === "all"
            ? live.length
            : live.filter((c) => c.status === t.key).length;
          return (
            <button
              key={t.key}
              type="button"
              onClick={() => setTab(t.key)}
              className={`px-3 py-2 text-12 font-medium rounded-t border-b-2 transition-colors whitespace-nowrap ${
                active
                  ? "border-brand text-brand bg-brand-dim"
                  : "border-transparent text-ink-2 hover:text-ink-0 hover:bg-bg-1"
              }`}
            >
              {t.label}
              <span className={`ml-1.5 font-mono text-10 ${active ? "text-brand" : "text-ink-3"}`}>
                {count}
              </span>
            </button>
          );
        })}
      </div>

      <div className="grid gap-4" style={{ gridTemplateColumns: detail ? "1fr 1fr" : "1fr" }}>
        {/* Consignment card list */}
        <div className="flex flex-col gap-3">
          {visible.length === 0 && (
            <div className="bg-bg-panel border border-hair-2 rounded-lg px-6 py-10 text-center text-ink-3 text-13">
              No consignments in this status.
            </div>
          )}
          {visible.map((c) => (
            <div
              key={c.id}
              role="button"
              tabIndex={0}
              onClick={() => setSelected(c.id === selected ? null : c.id)}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  setSelected(c.id === selected ? null : c.id);
                }
              }}
              className={`relative text-left bg-bg-panel border rounded-lg p-4 transition-all hover:border-brand cursor-pointer focus:outline-none focus:border-brand ${
                selected === c.id ? "border-brand shadow-sm" : "border-hair-2"
              }`}
            >
              <div className="absolute top-2 right-2 z-10">
                <RowActions
                  label={`consignment ${c.id}`}
                  onEdit={() => startEditShipment(c)}
                  onDelete={() => onDelete(c.id)}
                  confirmDelete={false}
                />
              </div>
              <div className="flex items-start justify-between gap-3 mb-2 pr-7">
                <div>
                  <span className="font-mono text-11 text-ink-3">{c.id}</span>
                  <div className="font-semibold text-14 text-ink-0 mt-0.5">
                    {COUNTRY_FLAG[c.originCountry] ?? "🌍"} {c.refinery}
                  </div>
                  <div className="text-11 text-ink-2 mt-0.5">
                    {c.bars} bars · {c.grossWeightKg} kg · {c.fineness} fine
                  </div>
                </div>
                <div className="flex flex-col items-end gap-1.5 shrink-0">
                  <span className={`inline-flex items-center px-2 py-0.5 rounded font-mono text-10 font-semibold uppercase ${STATUS_TONE[c.status]}`}>
                    {STATUS_LABEL[c.status]}
                  </span>
                  <span className="font-mono text-11 text-ink-0">${fmt(c.usdValue)}</span>
                </div>
              </div>

              {/* Transit progress */}
              {c.status !== "delivered" && (
                <div className="mb-2">
                  <div className="flex justify-between text-10 text-ink-3 mb-0.5">
                    <span>{c.origin.split(",")[0]} → {c.vaultLocation.split(",")[0]}</span>
                    <span>{c.transitProgress}%</span>
                  </div>
                  <ProgressBar pct={c.transitProgress} />
                </div>
              )}

              {/* Per-shipment TBML inline badge */}
              {tbml && (() => {
                const shipmentFlag = tbml.flaggedShipments.find((f) => f.reference === c.reference);
                if (!shipmentFlag) return null;
                return (
                  <div className="mb-1.5 flex flex-wrap gap-1">
                    <span className={`inline-flex items-center px-1.5 py-px rounded-sm border font-mono text-10 font-semibold uppercase ${TBML_RISK_TONE[shipmentFlag.riskLevel] ?? "bg-bg-2 text-ink-3 border-hair-2"}`}>
                      TBML {shipmentFlag.riskLevel}
                    </span>
                    {shipmentFlag.tbmlIndicators.map((ind, ii) => (
                      <span key={ii} className="bg-amber-dim text-amber text-10 font-mono px-1.5 py-px rounded-sm">
                        {ind}
                      </span>
                    ))}
                  </div>
                );
              })()}

              <div className="flex items-center justify-between flex-wrap gap-1">
                <RggBadge step={c.rggStep} />
                <div className="flex gap-1 flex-wrap justify-end">
                  {(c.riskLevels ?? []).map((rl) => (
                    <span key={rl} className={`text-10 font-semibold px-1.5 py-px rounded-sm border ${RISK_LEVEL_TONE[rl] ?? "bg-bg-2 text-ink-3 border-hair-2"}`}>
                      {rl}
                    </span>
                  ))}
                  {c.flags.map((f) => (
                    <span key={f} className="bg-red-dim text-red text-10 font-mono px-1.5 py-px rounded-sm font-semibold">
                      {f}
                    </span>
                  ))}
                  {c.flags.length === 0 && (c.riskLevels ?? []).length === 0 && (
                    <span className="text-10 text-ink-3 font-mono">ETA {c.eta}</span>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>

        {/* Detail panel — manifest + CoC ledger + OECD alignment */}
        {detail && (
          <div className="flex flex-col gap-4">
            {/* Manifest §1–§4 */}
            <div className="bg-bg-panel border border-hair-2 rounded-lg p-4">
              <div className="flex items-center justify-between mb-3">
                <span className="text-10 font-semibold uppercase tracking-wide-4 text-ink-2">
                  Consignment manifest — {detail.id}
                </span>
                <div className="flex items-center gap-2">
                  <AsanaReportButton payload={{
                    module: "shipments",
                    label: `${detail.id} · ${detail.refinery}`,
                    summary: `Consignment: ${detail.id}; Refinery: ${detail.refinery}; Origin: ${detail.miningCountry}; Status: ${detail.status}; USD value: $${detail.usdValue.toLocaleString()}; Weight: ${detail.grossWeightKg} kg`,
                    metadata: { id: detail.id, refinery: detail.refinery, status: detail.status, usdValue: detail.usdValue, direction: detail.direction, originCountry: detail.originCountry },
                  }} />
                  <span className={`inline-flex items-center px-2 py-0.5 rounded font-mono text-10 font-semibold uppercase ${STATUS_TONE[detail.status]}`}>
                    {STATUS_LABEL[detail.status]}
                  </span>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-12">
                {/* §1 Supply-chain origin */}
                <div>
                  <div className="text-10 font-mono uppercase tracking-wide-3 text-brand mb-1.5">§1 Origin</div>
                  <Row label="Mine of origin" value={detail.mineOfOrigin} />
                  <Row label="Mining country" value={`${COUNTRY_FLAG[detail.originCountry] ?? ""} ${detail.miningCountry}`} />
                  <Row label="Description" value={detail.description} />
                  <Row label="Weight (gms)" value={detail.weightGms.toLocaleString("en-US")} mono />
                  <Row label="Dispatch date" value={detail.dispatchDate} mono />
                </div>

                {/* §2 Refinery */}
                <div>
                  <div className="text-10 font-mono uppercase tracking-wide-3 text-brand mb-1.5">§2 Refinery</div>
                  <Row label="Supplier" value={detail.refinery} />
                  <Row label="LBMA ID / DGD" value={detail.refineryLbmaId} mono />
                  <Row label="Good Delivery" value={detail.lbmaGoodDelivery ? "Yes" : "No"} tone={detail.lbmaGoodDelivery ? "green" : "red"} />
                </div>

                {/* §3 Trading counterparty */}
                <div>
                  <div className="text-10 font-mono uppercase tracking-wide-3 text-brand mb-1.5">§3 Counterparty</div>
                  <Row label="Supplier" value={detail.counterparty} />
                  <Row label="Consignee" value={detail.consignee} />
                  <Row label="Jurisdiction" value={detail.counterpartyJurisdiction} />
                  <Row label="CDD ref" value={detail.counterpartyCddRef} mono />
                  <Row label="Invoice no." value={detail.invoiceNumber} mono />
                </div>

                {/* §4 Logistics & vault */}
                <div>
                  <div className="text-10 font-mono uppercase tracking-wide-3 text-brand mb-1.5">§4 Logistics</div>
                  <Row label="Import / Export" value={detail.direction} />
                  <Row label="Transportation agent" value={detail.transportationAgent} />
                  <Row label="AWB" value={detail.awb} mono />
                  <Row label="Clearance date" value={detail.clearanceDate} mono />
                  <Row label="Custodian" value={detail.custodian} />
                  <Row label="Delivery location" value={detail.deliveryLocation} />
                  <Row label="Vault cert" value={detail.vaultCertRef} mono />
                  <Row label="Insurance" value={detail.insuranceRef} mono />
                </div>
              </div>
            </div>

            {/* WORM chain-of-custody ledger */}
            <div className="bg-bg-panel border border-hair-2 rounded-lg p-4">
              <div className="text-10 font-semibold uppercase tracking-wide-4 text-ink-2 mb-3">
                Chain-of-custody ledger (WORM)
              </div>
              <div className="flex flex-col gap-0">
                {detail.chain.map((e, i) => (
                  <div key={e.hash} className={`flex gap-3 py-2 text-12 ${i < detail.chain.length - 1 ? "border-b border-hair" : ""}`}>
                    <div className="flex flex-col items-center gap-1 shrink-0 pt-0.5">
                      <div className="w-2 h-2 rounded-full bg-brand shrink-0" />
                      {i < detail.chain.length - 1 && <div className="w-px flex-1 bg-hair-2" />}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-ink-0 font-medium">{e.action}</div>
                      <div className="text-10 text-ink-2 mt-0.5">{e.actor}</div>
                    </div>
                    <div className="text-right shrink-0">
                      <div className="font-mono text-10 text-ink-3">{e.ts}</div>
                      <div className="font-mono text-10 text-ink-3 mt-0.5">#{e.hash}</div>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Release authority bar */}
            {detail.status !== "delivered" && (
              <div className={`rounded-lg px-4 py-3 border flex items-center justify-between gap-4 ${
                detail.flags.length > 0
                  ? "bg-red-dim border-red/30"
                  : detail.rggStep < 4
                  ? "bg-amber-dim border-amber/30"
                  : "bg-green-dim border-green/30"
              }`}>
                <div>
                  <div className={`text-12 font-semibold ${detail.flags.length > 0 ? "text-red" : detail.rggStep < 4 ? "text-amber" : "text-green"}`}>
                    {detail.flags.length > 0
                      ? "Release blocked — compliance hold"
                      : detail.rggStep < 4
                      ? "Release pending — DD steps outstanding"
                      : "Eligible for release — MLRO sign-off required"}
                  </div>
                  <div className="text-11 text-ink-2 mt-0.5">
                    {detail.flags.length > 0
                      ? detail.flags.join(" · ")
                      : `OECD steps ${detail.rggStep}/5 complete · Agent: ${detail.transportationAgent} · ETA ${detail.eta}`}
                  </div>
                </div>
                {detail.flags.length === 0 && detail.rggStep >= 4 && (
                  <button
                    type="button"
                    className="shrink-0 text-11 font-semibold px-3 py-1.5 rounded bg-ink-0 text-bg-0 hover:bg-ink-1"
                    onClick={() => setReleasedIds((prev) => prev.includes(detail.id) ? prev : [...prev, detail.id])}
                  >
                    Authorise release
                  </button>
                )}
              </div>
            )}
            {detail.status === "delivered" && (
              <div className="rounded-lg px-4 py-3 border border-hair-2 bg-bg-1 flex items-center gap-3">
                <span className="font-mono text-10 text-green font-semibold uppercase bg-green-dim px-2 py-0.5 rounded">Settled</span>
                <span className="text-12 text-ink-2">All 5 OECD RGG steps completed · Proceeds transferred</span>
              </div>
            )}
          </div>
        )}
      </div>

      {editingShipment && (
        <EditShipmentForm
          initial={editingShipment}
          onSave={saveShipmentEdit}
          onCancel={() => setEditingShipment(null)}
        />
      )}
    </ModuleLayout>
  );
}

function Row({
  label,
  value,
  mono,
  tone,
}: {
  label: string;
  value: string;
  mono?: boolean;
  tone?: "green" | "red";
}) {
  const valueColor = tone === "green" ? "text-green font-semibold" : tone === "red" ? "text-red font-semibold" : "text-ink-0";
  return (
    <div className="flex justify-between gap-2 py-0.5 border-b border-hair last:border-0">
      <span className="text-ink-3 shrink-0">{label}</span>
      <span className={`${mono ? "font-mono text-10" : "text-12"} ${valueColor} text-right truncate max-w-[140px]`} title={value}>
        {value}
      </span>
    </div>
  );
}
