"use client";

import React, { useEffect, useState } from "react";
import { ModuleHero, ModuleLayout } from "@/components/layout/ModuleLayout";
import { RowActions } from "@/components/shared/RowActions";

const BUSINESS_UNITS = [
  "ZOE Precious Metals and Jewelery FZE",
  "Naples Jewellery Trading L.L.C",
  "Madison Jewellery Trading L.L.C",
  "Gramaltin A.S",
  "Fine Gold LLC",
  "Fine Gold (Branch)",
] as const;

type BusinessUnit = (typeof BUSINESS_UNITS)[number];

interface Employee {
  id: string;
  name: string;
  nationality: string;
  emiratesId: string;
  emiratesIdExpiry: string;
  dateOfBirth: string;
  passport: string;
  passportExpiry: string;
  designation: string;
  dateOfJoining: string;
  email: string;
  businessUnits: BusinessUnit[];
}

const STORAGE = "hawkeye.employees.v1";

const SEED: Employee[] = [];

const BLANK_FORM = {
  name: "",
  nationality: "",
  emiratesId: "",
  emiratesIdExpiry: "",
  dateOfBirth: "",
  passport: "",
  passportExpiry: "",
  designation: "",
  dateOfJoining: "",
  email: "",
  businessUnits: [] as BusinessUnit[],
};

function parseDMY(s: string): string {
  const m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (!m) return "";
  const [, d, mo, y] = m;
  if (!d || !mo) return "";
  return `${y}-${mo.padStart(2, "0")}-${d.padStart(2, "0")}`;
}

function fmtDMY(iso: string): string {
  const m = iso.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return iso;
  return `${m[3]}/${m[2]}/${m[1]}`;
}

type DocStatus = "valid" | "expiring" | "expired" | "missing";

function docStatus(expiryIso: string): DocStatus {
  if (!expiryIso) return "missing";
  const exp = new Date(expiryIso).getTime();
  const now = Date.now();
  const days30 = 30 * 86_400_000;
  if (exp < now) return "expired";
  if (exp - now <= days30) return "expiring";
  return "valid";
}

const DOC_BADGE: Record<DocStatus, string> = {
  valid: "bg-green-dim text-green",
  expiring: "bg-amber-dim text-amber",
  expired: "bg-red-dim text-red",
  missing: "bg-bg-2 text-ink-3",
};

const DOC_LABEL: Record<DocStatus, string> = {
  valid: "Valid",
  expiring: "Expiring",
  expired: "Expired",
  missing: "—",
};

function load(): Employee[] {
  if (typeof window === "undefined") return SEED;
  try {
    const raw = localStorage.getItem(STORAGE);
    return raw ? JSON.parse(raw) : SEED;
  } catch {
    return SEED;
  }
}

function save(rows: Employee[]) {
  try {
    localStorage.setItem(STORAGE, JSON.stringify(rows));
  } catch {
    /* */
  }
}

function worseStatus(a: DocStatus, b: DocStatus): DocStatus {
  const rank: Record<DocStatus, number> = { expired: 0, expiring: 1, missing: 2, valid: 3 };
  return rank[a] <= rank[b] ? a : b;
}

function overallStatus(emp: Employee): DocStatus {
  return worseStatus(docStatus(emp.emiratesIdExpiry), docStatus(emp.passportExpiry));
}

export default function EmployeesPage() {
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [form, setForm] = useState(BLANK_FORM);
  const [adding, setAdding] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [search, setSearch] = useState("");

  useEffect(() => {
    setEmployees(load());
  }, []);

  const set = <K extends keyof typeof BLANK_FORM>(k: K) =>
    (e: React.ChangeEvent<HTMLInputElement>) =>
      setForm((f) => ({ ...f, [k]: e.target.value }));

  const toggleUnit = (u: BusinessUnit) =>
    setForm((f) => ({
      ...f,
      businessUnits: f.businessUnits.includes(u)
        ? f.businessUnits.filter((x) => x !== u)
        : [...f.businessUnits, u],
    }));

  const coerce = (raw: string) => parseDMY(raw) || raw;

  const addEmployee = () => {
    if (!form.name || !form.email) return;
    const next: Employee[] = [
      ...employees,
      {
        id: `emp-${Date.now()}`,
        name: form.name,
        nationality: form.nationality,
        emiratesId: form.emiratesId,
        emiratesIdExpiry: coerce(form.emiratesIdExpiry),
        dateOfBirth: coerce(form.dateOfBirth),
        passport: form.passport,
        passportExpiry: coerce(form.passportExpiry),
        designation: form.designation,
        dateOfJoining: coerce(form.dateOfJoining),
        email: form.email,
        businessUnits: form.businessUnits,
      },
    ];
    save(next);
    setEmployees(next);
    setForm(BLANK_FORM);
    setAdding(false);
  };

  const remove = (id: string) => {
    const next = employees.filter((e) => e.id !== id);
    save(next);
    setEmployees(next);
    if (expandedId === id) setExpandedId(null);
  };

  const filtered = employees.filter(
    (e) =>
      !search ||
      e.name.toLowerCase().includes(search.toLowerCase()) ||
      e.designation.toLowerCase().includes(search.toLowerCase()) ||
      e.email.toLowerCase().includes(search.toLowerCase()) ||
      e.businessUnits.some((u) => u.toLowerCase().includes(search.toLowerCase())),
  );

  const expired = employees.filter((e) => overallStatus(e) === "expired").length;
  const expiring = employees.filter((e) => overallStatus(e) === "expiring").length;

  return (
    <ModuleLayout asanaModule="employees" asanaLabel="Employees">
        <ModuleHero
          eyebrow="Module 16 · HR registry"
          title="Employee"
          titleEm="information."
          intro={
            <>
              <strong>Staff register with document expiry tracking.</strong> Captures Emirates ID,
              passport, and business-unit affiliation for every team member. Flags expiring or lapsed
              documents for timely renewal.
            </>
          }
        />

        {/* Summary bar */}
        <div className="flex items-center gap-4 mt-6 mb-4">
          <div className="flex items-center gap-3 flex-1">
            <span className="text-12 font-semibold text-ink-0">{employees.length} employees</span>
            {expired > 0 && (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-red-dim text-red text-11 font-semibold">
                {expired} expired doc{expired !== 1 ? "s" : ""}
              </span>
            )}
            {expiring > 0 && (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-amber-dim text-amber text-11 font-semibold">
                {expiring} expiring soon
              </span>
            )}
          </div>
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search employees…"
            className="text-12 px-3 py-1.5 rounded border border-hair-2 bg-bg-panel text-ink-0 w-56"
          />
          <button
            type="button"
            onClick={() => setAdding((v) => !v)}
            className="text-11 font-semibold px-3 py-1.5 rounded bg-ink-0 text-bg-0 hover:bg-ink-1 transition-colors"
          >
            {adding ? "Cancel" : "+ Add employee"}
          </button>
        </div>

        {/* Add form */}
        {adding && (
          <div className="bg-bg-panel border border-hair-2 rounded-lg p-5 mb-4">
            <div className="text-10.5 uppercase tracking-wide-4 font-semibold text-ink-2 mb-3">
              New employee
            </div>

            {/* Row 1 */}
            <div className="grid grid-cols-3 gap-3 mb-3">
              <div>
                <label className="block text-10 uppercase tracking-wide-3 text-ink-3 mb-1">Employee Name *</label>
                <input value={form.name} onChange={set("name")} placeholder="Full legal name"
                  className="w-full text-12 px-3 py-1.5 rounded border border-hair-2 bg-bg-0 text-ink-0" />
              </div>
              <div>
                <label className="block text-10 uppercase tracking-wide-3 text-ink-3 mb-1">Nationality</label>
                <input value={form.nationality} onChange={set("nationality")} placeholder="e.g. Emirati"
                  className="w-full text-12 px-3 py-1.5 rounded border border-hair-2 bg-bg-0 text-ink-0" />
              </div>
              <div>
                <label className="block text-10 uppercase tracking-wide-3 text-ink-3 mb-1">Designation</label>
                <input value={form.designation} onChange={set("designation")} placeholder="e.g. Compliance Analyst"
                  className="w-full text-12 px-3 py-1.5 rounded border border-hair-2 bg-bg-0 text-ink-0" />
              </div>
            </div>

            {/* Row 2 — Emirates ID */}
            <div className="grid grid-cols-3 gap-3 mb-3">
              <div>
                <label className="block text-10 uppercase tracking-wide-3 text-ink-3 mb-1">Emirates ID</label>
                <input value={form.emiratesId} onChange={set("emiratesId")} placeholder="784-XXXX-XXXXXXX-X"
                  className="w-full text-12 px-3 py-1.5 rounded border border-hair-2 bg-bg-0 text-ink-0 font-mono" />
              </div>
              <div>
                <label className="block text-10 uppercase tracking-wide-3 text-ink-3 mb-1">Emirates ID Expiry (dd/mm/yyyy)</label>
                <input value={form.emiratesIdExpiry} onChange={set("emiratesIdExpiry")} placeholder="31/12/2027"
                  className="w-full text-12 px-3 py-1.5 rounded border border-hair-2 bg-bg-0 text-ink-0 font-mono" />
              </div>
              <div>
                <label className="block text-10 uppercase tracking-wide-3 text-ink-3 mb-1">Date of Birth (dd/mm/yyyy)</label>
                <input value={form.dateOfBirth} onChange={set("dateOfBirth")} placeholder="01/01/1990"
                  className="w-full text-12 px-3 py-1.5 rounded border border-hair-2 bg-bg-0 text-ink-0 font-mono" />
              </div>
            </div>

            {/* Row 3 — Passport */}
            <div className="grid grid-cols-3 gap-3 mb-3">
              <div>
                <label className="block text-10 uppercase tracking-wide-3 text-ink-3 mb-1">Passport Number</label>
                <input value={form.passport} onChange={set("passport")} placeholder="e.g. AX123456"
                  className="w-full text-12 px-3 py-1.5 rounded border border-hair-2 bg-bg-0 text-ink-0 font-mono" />
              </div>
              <div>
                <label className="block text-10 uppercase tracking-wide-3 text-ink-3 mb-1">Passport Expiry (dd/mm/yyyy)</label>
                <input value={form.passportExpiry} onChange={set("passportExpiry")} placeholder="31/12/2028"
                  className="w-full text-12 px-3 py-1.5 rounded border border-hair-2 bg-bg-0 text-ink-0 font-mono" />
              </div>
              <div>
                <label className="block text-10 uppercase tracking-wide-3 text-ink-3 mb-1">Date of Joining (dd/mm/yyyy)</label>
                <input value={form.dateOfJoining} onChange={set("dateOfJoining")} placeholder="01/01/2022"
                  className="w-full text-12 px-3 py-1.5 rounded border border-hair-2 bg-bg-0 text-ink-0 font-mono" />
              </div>
            </div>

            {/* Row 4 — Email */}
            <div className="grid grid-cols-3 gap-3 mb-4">
              <div className="col-span-1">
                <label className="block text-10 uppercase tracking-wide-3 text-ink-3 mb-1">Email Address *</label>
                <input value={form.email} onChange={set("email")} placeholder="name@company.ae" type="email"
                  className="w-full text-12 px-3 py-1.5 rounded border border-hair-2 bg-bg-0 text-ink-0" />
              </div>
            </div>

            {/* Business units multi-select */}
            <div className="mb-4">
              <label className="block text-10 uppercase tracking-wide-3 text-ink-3 mb-2">
                Business Unit Involved
              </label>
              <div className="flex flex-wrap gap-2">
                {BUSINESS_UNITS.map((u) => {
                  const selected = form.businessUnits.includes(u);
                  return (
                    <button
                      key={u}
                      type="button"
                      onClick={() => toggleUnit(u)}
                      className={`text-11 font-medium px-3 py-1 rounded-full border transition-colors ${
                        selected
                          ? "bg-brand-dim border-brand text-brand-deep"
                          : "border-hair-2 text-ink-2 hover:border-hair-0 hover:text-ink-0"
                      }`}
                    >
                      {selected && <span className="mr-1">✓</span>}
                      {u}
                    </button>
                  );
                })}
              </div>
            </div>

            <button
              type="button"
              onClick={addEmployee}
              disabled={!form.name || !form.email}
              className="text-11 font-semibold px-4 py-2 rounded bg-ink-0 text-bg-0 hover:bg-ink-1 disabled:opacity-40 transition-colors"
            >
              Save employee
            </button>
          </div>
        )}

        {/* Table */}
        <div className="bg-bg-panel border border-hair-2 rounded-lg overflow-hidden">
          <table className="w-full text-12">
            <thead className="bg-bg-1 border-b border-hair-2">
              <tr>
                <th className="text-left px-3 py-2 text-10 uppercase tracking-wide-3 text-ink-2 font-mono">Name</th>
                <th className="text-left px-3 py-2 text-10 uppercase tracking-wide-3 text-ink-2 font-mono">Designation</th>
                <th className="text-left px-3 py-2 text-10 uppercase tracking-wide-3 text-ink-2 font-mono">Nationality</th>
                <th className="text-left px-3 py-2 text-10 uppercase tracking-wide-3 text-ink-2 font-mono">Emirates ID</th>
                <th className="text-left px-3 py-2 text-10 uppercase tracking-wide-3 text-ink-2 font-mono">ID Expiry</th>
                <th className="text-left px-3 py-2 text-10 uppercase tracking-wide-3 text-ink-2 font-mono">Passport</th>
                <th className="text-left px-3 py-2 text-10 uppercase tracking-wide-3 text-ink-2 font-mono">PP Expiry</th>
                <th className="text-left px-3 py-2 text-10 uppercase tracking-wide-3 text-ink-2 font-mono">Joined</th>
                <th className="text-left px-3 py-2 text-10 uppercase tracking-wide-3 text-ink-2 font-mono">Business Units</th>
                <th className="text-left px-3 py-2 text-10 uppercase tracking-wide-3 text-ink-2 font-mono">Status</th>
                <th className="w-8" />
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={11} className="px-3 py-8 text-center text-ink-3 text-12">
                    {search ? "No employees match your search." : "No employees logged yet."}
                  </td>
                </tr>
              ) : (
                filtered.map((emp, i) => {
                  const eidStatus = docStatus(emp.emiratesIdExpiry);
                  const ppStatus = docStatus(emp.passportExpiry);
                  const overall = overallStatus(emp);
                  const expanded = expandedId === emp.id;
                  return (
                    <React.Fragment key={emp.id}>
                      <tr
                        className={`cursor-pointer hover:bg-bg-1 transition-colors ${i < filtered.length - 1 || expanded ? "border-b border-hair" : ""}`}
                        onClick={() => setExpandedId(expanded ? null : emp.id)}
                      >
                        <td className="px-3 py-2 text-ink-0 font-medium">{emp.name}</td>
                        <td className="px-3 py-2 text-ink-1">{emp.designation}</td>
                        <td className="px-3 py-2 text-ink-2">{emp.nationality}</td>
                        <td className="px-3 py-2 font-mono text-11 text-ink-2">{emp.emiratesId}</td>
                        <td className="px-3 py-2">
                          <span className={`inline-flex items-center gap-1 px-1.5 py-px rounded-sm font-mono text-10 font-semibold uppercase ${DOC_BADGE[eidStatus]}`}>
                            {fmtDMY(emp.emiratesIdExpiry) || "—"}
                          </span>
                        </td>
                        <td className="px-3 py-2 font-mono text-11 text-ink-2">{emp.passport}</td>
                        <td className="px-3 py-2">
                          <span className={`inline-flex items-center gap-1 px-1.5 py-px rounded-sm font-mono text-10 font-semibold uppercase ${DOC_BADGE[ppStatus]}`}>
                            {fmtDMY(emp.passportExpiry) || "—"}
                          </span>
                        </td>
                        <td className="px-3 py-2 font-mono text-11 text-ink-2">{fmtDMY(emp.dateOfJoining)}</td>
                        <td className="px-3 py-2">
                          <div className="flex flex-wrap gap-1">
                            {emp.businessUnits.map((u) => (
                              <span key={u} className="text-10 px-1.5 py-px rounded bg-bg-2 text-ink-2 whitespace-nowrap">
                                {u}
                              </span>
                            ))}
                          </div>
                        </td>
                        <td className="px-3 py-2">
                          <span className={`inline-flex items-center px-1.5 py-px rounded-sm font-mono text-10 font-semibold uppercase ${DOC_BADGE[overall]}`}>
                            {DOC_LABEL[overall]}
                          </span>
                        </td>
                        <td className="px-2 py-2 text-right">
                          <RowActions
                            label={`employee ${emp.fullName ?? emp.id}`}
                            onEdit={() => window.scrollTo({ top: 0, behavior: "smooth" })}
                            onDelete={() => remove(emp.id)}
                            confirmDelete={false}
                          />
                        </td>
                      </tr>
                      {expanded && (
                        <tr className={i < filtered.length - 1 ? "border-b border-hair" : ""}>
                          <td colSpan={11} className="px-4 py-3 bg-bg-1">
                            <div className="grid grid-cols-4 gap-4 text-11">
                              <div>
                                <div className="text-10 uppercase tracking-wide-3 text-ink-3 mb-0.5">Date of Birth</div>
                                <div className="font-mono text-ink-1">{fmtDMY(emp.dateOfBirth) || "—"}</div>
                              </div>
                              <div>
                                <div className="text-10 uppercase tracking-wide-3 text-ink-3 mb-0.5">Email</div>
                                <div className="text-ink-1">{emp.email}</div>
                              </div>
                              <div>
                                <div className="text-10 uppercase tracking-wide-3 text-ink-3 mb-0.5">Emirates ID status</div>
                                <span className={`inline-flex px-1.5 py-px rounded-sm font-mono text-10 font-semibold uppercase ${DOC_BADGE[eidStatus]}`}>
                                  {DOC_LABEL[eidStatus]}
                                </span>
                              </div>
                              <div>
                                <div className="text-10 uppercase tracking-wide-3 text-ink-3 mb-0.5">Passport status</div>
                                <span className={`inline-flex px-1.5 py-px rounded-sm font-mono text-10 font-semibold uppercase ${DOC_BADGE[ppStatus]}`}>
                                  {DOC_LABEL[ppStatus]}
                                </span>
                              </div>
                            </div>
                          </td>
                        </tr>
                      )}
                    </React.Fragment>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        <p className="text-10 text-ink-3 mt-3">
          Click any row to expand full details. Document status auto-updates: amber within 30 days of expiry, red after expiry.
        </p>
    </ModuleLayout>
  );
}
