"use client";

import { useState } from "react";
import { ModuleHero, ModuleLayout } from "@/components/layout/ModuleLayout";
import { DateParts } from "@/components/ui/DateParts";

// Beneficial Owner Declaration — public-facing form. Your tenants send
// a link to their customers, who fill in UBO info that auto-populates
// the Ownership tab on the subject panel.

interface UboEntry {
  name: string;
  dob: string;
  nationality: string;
  ownershipPct: string;
  role: string;
}

const EMPTY_UBO: UboEntry = {
  name: "",
  dob: "",
  nationality: "",
  ownershipPct: "",
  role: "",
};

export default function UboDeclarationPage() {
  const [entity, setEntity] = useState("");
  const [registered, setRegistered] = useState("");
  const [ubos, setUbos] = useState<UboEntry[]>([{ ...EMPTY_UBO }]);
  const [submitted, setSubmitted] = useState(false);

  const inputCls =
    "w-full text-12 px-3 py-1.5 rounded border border-hair-2 bg-white text-ink-0";

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

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitted(true);
  };

  if (submitted) {
    return (
      <ModuleLayout narrow>
        <div className="max-w-2xl mx-auto px-8 py-10">
          <div className="bg-white border border-hair-2 rounded-lg p-8 text-center">
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
        </div>
      </ModuleLayout>
    );
  }

  return (
    <ModuleLayout narrow>
      <div className="max-w-3xl mx-auto px-8 py-10">
        <ModuleHero
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
          className="bg-white border border-hair-2 rounded-lg p-5 mt-6 space-y-4"
        >
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
              key={idx}
              className="bg-bg-1 rounded p-3 space-y-2"
            >
              <div className="flex items-center justify-between">
                <span className="text-10 uppercase tracking-wide-3 text-ink-2 font-semibold">
                  UBO #{idx + 1}
                </span>
                {ubos.length > 1 && (
                  <button
                    type="button"
                    onClick={() => removeUbo(idx)}
                    className="text-10 font-mono text-red hover:underline"
                  >
                    remove
                  </button>
                )}
              </div>
              <div className="grid grid-cols-2 gap-2">
                <input
                  value={u.name}
                  onChange={(e) => update(idx, "name", e.target.value)}
                  placeholder="Full legal name"
                  className={inputCls}
                />
                <input
                  value={u.nationality}
                  onChange={(e) => update(idx, "nationality", e.target.value)}
                  placeholder="Nationality"
                  className={inputCls}
                />
                <DateParts
                  value={u.dob}
                  onChange={(v) => update(idx, "dob", v)}
                  className={inputCls}
                />
                <div className="flex gap-2">
                  <input
                    value={u.ownershipPct}
                    onChange={(e) => update(idx, "ownershipPct", e.target.value.replace(/[^\d.]/g, ""))}
                    placeholder="%"
                    className={inputCls}
                  />
                  <input
                    value={u.role}
                    onChange={(e) => update(idx, "role", e.target.value)}
                    placeholder="Role (director / signatory / etc.)"
                    className={inputCls}
                  />
                </div>
              </div>
            </div>
          ))}

          <button
            type="button"
            onClick={addUbo}
            className="text-11 font-medium px-3 py-1.5 rounded border border-hair-2 bg-white text-ink-0 hover:bg-bg-1"
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
              className="text-12 font-semibold px-4 py-2 rounded bg-ink-0 text-white hover:bg-ink-1"
            >
              Submit declaration
            </button>
          </div>
        </form>
      </div>
    </ModuleLayout>
  );
}
