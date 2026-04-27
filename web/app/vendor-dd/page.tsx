"use client";

import { useState, useEffect } from "react";
import { ModuleHero, ModuleLayout } from "@/components/layout/ModuleLayout";

interface Supplier {
  id: string;
  name: string;
  jurisdiction: string;
  tier: "critical" | "significant" | "standard";
  lbmaListed: boolean;
  lastReview: string;
  nextReview: string;
  flags: string[];
}

const STORAGE_KEY = "hawkeye.vendor-dd.v1";

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

function addYears(iso: string, years: number): string {
  const d = new Date(iso);
  d.setFullYear(d.getFullYear() + years);
  return d.toISOString().slice(0, 10);
}

function nextReviewFor(tier: Supplier["tier"], from: string): string {
  const yrs = tier === "critical" ? 1 : tier === "significant" ? 1.5 : 2;
  const d = new Date(from);
  d.setMonth(d.getMonth() + Math.round(yrs * 12));
  return d.toISOString().slice(0, 10);
}

function fmtDate(iso: string): string {
  const m = iso.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return iso;
  return `${m[3]}/${m[2]}/${m[1]}`;
}

function load(): Supplier[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (raw) return JSON.parse(raw) as Supplier[];
  } catch { /* ignore */ }
  return [];
}

function save(list: Supplier[]) {
  try { window.localStorage.setItem(STORAGE_KEY, JSON.stringify(list)); } catch { /* ignore */ }
}

const XIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24"
    fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
    <line x1="18" y1="6" x2="6" y2="18" />
    <line x1="6" y1="6" x2="18" y2="18" />
  </svg>
);

interface FormState {
  name: string;
  jurisdiction: string;
  tier: Supplier["tier"];
  lbmaListed: boolean;
  lastReview: string;
}

const EMPTY_FORM: FormState = {
  name: "",
  jurisdiction: "",
  tier: "standard",
  lbmaListed: false,
  lastReview: today(),
};

export default function SupplierDdPage() {
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);

  useEffect(() => {
    setSuppliers(load());
  }, []);

  const update = (next: Supplier[]) => { setSuppliers(next); save(next); };
  const remove = (id: string) => update(suppliers.filter((v) => v.id !== id));

  const handleAdd = () => {
    if (!form.name.trim()) return;
    const flags: string[] = [];
    if (!form.lbmaListed) flags.push("no-lbma");
    const newSupplier: Supplier = {
      id: `v${Date.now()}`,
      name: form.name.trim(),
      jurisdiction: form.jurisdiction.trim().toUpperCase() || "AE",
      tier: form.tier,
      lbmaListed: form.lbmaListed,
      lastReview: form.lastReview,
      nextReview: nextReviewFor(form.tier, form.lastReview),
      flags,
    };
    update([...suppliers, newSupplier]);
    setForm(EMPTY_FORM);
    setShowForm(false);
  };

  return (
    <ModuleLayout asanaModule="vendor-dd" asanaLabel="Vendor Due Diligence">
      <ModuleHero
        eyebrow="Module 20 · Supply-chain DD"
        title="Supplier"
        titleEm="due diligence."
        intro={
          <>
            <strong>Suppliers screened under a different rubric.</strong>{" "}
            LBMA Good Delivery status, OECD Annex II red-flag assessment,
            Step-4 audit history, CAHRA exposure. Review cadence proportional to tier.
          </>
        }
        kpis={[
          { value: String(suppliers.length), label: "active suppliers" },
          { value: String(suppliers.filter((v) => v.tier === "critical").length), label: "tier-critical", tone: "red" },
          { value: String(suppliers.filter((v) => !v.lbmaListed).length), label: "not LBMA-listed", tone: "amber" },
        ]}
      />

      {/* Add button */}
      <div className="flex justify-end mb-4">
        <button
          type="button"
          onClick={() => { setShowForm((s) => !s); setForm(EMPTY_FORM); }}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-11 font-semibold bg-brand text-white hover:bg-brand/90 transition-colors"
        >
          {showForm ? "Cancel" : "+ Add Supplier"}
        </button>
      </div>

      {/* Add form */}
      {showForm && (
        <div className="mb-5 bg-bg-panel border border-hair-2 rounded-lg p-4">
          <div className="text-11 uppercase tracking-wide-4 text-ink-3 mb-3 font-semibold">New supplier</div>
          <div className="grid grid-cols-2 gap-3 mb-3">
            <div className="col-span-2">
              <label className="block text-10 text-ink-3 mb-1">Supplier name *</label>
              <input
                className="w-full bg-bg-1 border border-hair-2 rounded px-2.5 py-1.5 text-12 text-ink-0 placeholder:text-ink-4 focus:outline-none focus:border-brand"
                placeholder="e.g. Valcambi SA"
                value={form.name}
                onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
              />
            </div>
            <div>
              <label className="block text-10 text-ink-3 mb-1">Jurisdiction (ISO-2)</label>
              <input
                className="w-full bg-bg-1 border border-hair-2 rounded px-2.5 py-1.5 text-12 text-ink-0 placeholder:text-ink-4 focus:outline-none focus:border-brand"
                placeholder="AE"
                maxLength={3}
                value={form.jurisdiction}
                onChange={(e) => setForm((f) => ({ ...f, jurisdiction: e.target.value }))}
              />
            </div>
            <div>
              <label className="block text-10 text-ink-3 mb-1">Tier</label>
              <select
                className="w-full bg-bg-1 border border-hair-2 rounded px-2.5 py-1.5 text-12 text-ink-0 focus:outline-none focus:border-brand"
                value={form.tier}
                onChange={(e) => setForm((f) => ({ ...f, tier: e.target.value as Supplier["tier"] }))}
              >
                <option value="critical">Critical (annual review)</option>
                <option value="significant">Significant (18-month review)</option>
                <option value="standard">Standard (24-month review)</option>
              </select>
            </div>
            <div>
              <label className="block text-10 text-ink-3 mb-1">Last review date</label>
              <input
                type="date"
                className="w-full bg-bg-1 border border-hair-2 rounded px-2.5 py-1.5 text-12 text-ink-0 focus:outline-none focus:border-brand"
                value={form.lastReview}
                onChange={(e) => setForm((f) => ({ ...f, lastReview: e.target.value }))}
              />
            </div>
            <div className="flex items-center gap-2 pt-4">
              <input
                id="lbma-check"
                type="checkbox"
                className="accent-brand"
                checked={form.lbmaListed}
                onChange={(e) => setForm((f) => ({ ...f, lbmaListed: e.target.checked }))}
              />
              <label htmlFor="lbma-check" className="text-12 text-ink-1 cursor-pointer">LBMA Good Delivery listed</label>
            </div>
          </div>
          <div className="flex justify-end">
            <button
              type="button"
              onClick={handleAdd}
              disabled={!form.name.trim()}
              className="px-4 py-1.5 rounded-md text-11 font-semibold bg-brand text-white hover:bg-brand/90 disabled:opacity-40 transition-colors"
            >
              Add supplier
            </button>
          </div>
        </div>
      )}

      {/* Supplier list */}
      <div className="space-y-2">
        {suppliers.length === 0 && !showForm && (
          <div className="text-12 text-ink-3 py-8 text-center border border-dashed border-hair-2 rounded-lg">
            No suppliers yet — click <strong className="text-ink-1">+ Add Supplier</strong> to add the first one.
          </div>
        )}
        {suppliers.map((v) => (
          <div key={v.id} className="bg-bg-panel border border-hair-2 rounded-lg p-4">
            <div className="flex items-baseline justify-between mb-1">
              <h3 className="text-13 font-semibold text-ink-0 m-0">{v.name}</h3>
              <div className="flex items-center gap-3">
                <span className={`inline-flex items-center px-1.5 py-px rounded-sm font-mono text-10 font-semibold uppercase ${
                  v.tier === "critical" ? "bg-red-dim text-red" : v.tier === "significant" ? "bg-amber-dim text-amber" : "bg-green-dim text-green"
                }`}>
                  {v.tier}
                </span>
                <button type="button" onClick={() => remove(v.id)} aria-label={`Delete ${v.name}`}
                  className="text-ink-3 hover:text-red transition-colors">
                  <XIcon />
                </button>
              </div>
            </div>
            <div className="grid grid-cols-4 gap-4 text-11 font-mono mt-2">
              <div><span className="text-ink-3">Jurisdiction: </span><span className="text-ink-0">{v.jurisdiction}</span></div>
              <div><span className="text-ink-3">LBMA: </span><span className={v.lbmaListed ? "text-green" : "text-amber"}>{v.lbmaListed ? "Good Delivery" : "not listed"}</span></div>
              <div><span className="text-ink-3">Last review: </span><span className="text-ink-0">{fmtDate(v.lastReview)}</span></div>
              <div><span className="text-ink-3">Next review: </span><span className="text-ink-0">{fmtDate(v.nextReview)}</span></div>
            </div>
            {v.flags.length > 0 && (
              <div className="mt-2 flex flex-wrap gap-1">
                {v.flags.map((f) => (
                  <span key={f} className="inline-flex items-center px-1.5 py-px rounded-sm font-mono text-10 bg-amber-dim text-amber">{f}</span>
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
