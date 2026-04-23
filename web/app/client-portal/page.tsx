"use client";

import { useState } from "react";
import { ModuleHero, ModuleLayout } from "@/components/layout/ModuleLayout";
import { DateParts } from "@/components/ui/DateParts";

// Client Portal — external-facing subject-submission form. Your
// customer's KYC desk fills this in themselves; the brain auto-
// screens the result and the MLRO reviews. Big operational
// multiplier — KYC teams stop emailing spreadsheets.

export default function ClientPortalPage() {
  const [entityType, setEntityType] = useState<"individual" | "organisation">("individual");
  const [name, setName] = useState("");
  const [aliases, setAliases] = useState("");
  const [dob, setDob] = useState("");
  const [jurisdiction, setJurisdiction] = useState("");
  const [idNumber, setIdNumber] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [sourceOfWealth, setSourceOfWealth] = useState("");
  const [notes, setNotes] = useState("");
  const [submitted, setSubmitted] = useState(false);

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    // In production this POSTs to /api/client-portal/submit which enqueues
    // a new screening for the MLRO. Demo mode just flips to "submitted".
    setSubmitted(true);
  };

  if (submitted) {
    return (
      <ModuleLayout narrow>
        <div className="max-w-2xl mx-auto px-8 py-10">
          <div className="bg-white border border-hair-2 rounded-lg p-8 text-center">
            <div className="text-24 mb-3">✓</div>
            <h1 className="font-display text-24 text-ink-0 m-0 mb-3">
              Submission received
            </h1>
            <p className="text-12 text-ink-2 leading-relaxed">
              Your subject-data package has been received and will be reviewed
              by the MLRO. You will be notified at the email you provided
              once screening is complete. Expected turnaround: under 24h for
              standard CDD, up to 5 business days for EDD-tier reviews.
            </p>
            <div className="mt-4 font-mono text-10 text-ink-3">
              Reference: HS-{Date.now().toString().slice(-6)}
            </div>
          </div>
        </div>
      </ModuleLayout>
    );
  }

  const inputCls =
    "w-full text-12 px-3 py-1.5 rounded border border-hair-2 bg-white text-ink-0";

  return (
    <ModuleLayout narrow>
      <div className="max-w-3xl mx-auto px-8 py-10">
        <ModuleHero
          eyebrow="Module 13 · Self-service KYC"
          title="Client"
          titleEm="portal."
          intro={
            <>
              <strong>Onboard yourself in under 5 minutes.</strong> Fill in
              the subject details below; the compliance brain auto-screens
              against sanctions, PEP, adverse-media, and jurisdiction
              databases; the MLRO reviews and you receive a decision by
              email. No spreadsheets, no back-and-forth.
            </>
          }
        />

        <form
          onSubmit={submit}
          className="bg-white border border-hair-2 rounded-lg p-5 mt-6 space-y-4"
        >
          <div>
            <label className="block text-10 uppercase tracking-wide-3 text-ink-2 font-semibold mb-1">
              Entity type
            </label>
            <div className="flex gap-2">
              {(["individual", "organisation"] as const).map((t) => (
                <button
                  key={t}
                  type="button"
                  onClick={() => setEntityType(t)}
                  className={`flex-1 text-12 font-medium px-3 py-2 rounded border ${
                    entityType === t
                      ? "bg-brand-dim border-brand text-brand-deep font-semibold"
                      : "border-hair-2 text-ink-0 hover:bg-bg-1"
                  }`}
                >
                  {t === "individual" ? "Individual" : "Organisation"}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="block text-10 uppercase tracking-wide-3 text-ink-2 font-semibold mb-1">
              {entityType === "individual" ? "Full legal name" : "Registered entity name"} *
            </label>
            <input
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={entityType === "individual" ? "e.g. Ozcan Halac" : "e.g. Istanbul Gold Refinery"}
              className={inputCls}
            />
          </div>

          <div>
            <label className="block text-10 uppercase tracking-wide-3 text-ink-2 font-semibold mb-1">
              Alternate names / transliterations
            </label>
            <input
              value={aliases}
              onChange={(e) => setAliases(e.target.value)}
              placeholder="Semi-colon separated"
              className={inputCls}
            />
          </div>

          {entityType === "individual" && (
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-10 uppercase tracking-wide-3 text-ink-2 font-semibold mb-1">
                  Date of birth
                </label>
                <DateParts value={dob} onChange={setDob} className={inputCls} />
              </div>
              <div>
                <label className="block text-10 uppercase tracking-wide-3 text-ink-2 font-semibold mb-1">
                  Nationality
                </label>
                <input
                  value={jurisdiction}
                  onChange={(e) => setJurisdiction(e.target.value)}
                  placeholder="e.g. TR, UAE"
                  className={inputCls}
                />
              </div>
            </div>
          )}

          {entityType === "organisation" && (
            <div>
              <label className="block text-10 uppercase tracking-wide-3 text-ink-2 font-semibold mb-1">
                Country of incorporation
              </label>
              <input
                value={jurisdiction}
                onChange={(e) => setJurisdiction(e.target.value)}
                placeholder="e.g. UAE"
                className={inputCls}
              />
            </div>
          )}

          <div>
            <label className="block text-10 uppercase tracking-wide-3 text-ink-2 font-semibold mb-1">
              {entityType === "individual" ? "Passport / National ID number" : "Trade licence / Registration number"}
            </label>
            <input
              value={idNumber}
              onChange={(e) => setIdNumber(e.target.value)}
              className={inputCls}
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-10 uppercase tracking-wide-3 text-ink-2 font-semibold mb-1">
                Contact email *
              </label>
              <input
                required
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className={inputCls}
              />
            </div>
            <div>
              <label className="block text-10 uppercase tracking-wide-3 text-ink-2 font-semibold mb-1">
                Contact phone
              </label>
              <input
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                className={inputCls}
              />
            </div>
          </div>

          <div>
            <label className="block text-10 uppercase tracking-wide-3 text-ink-2 font-semibold mb-1">
              Source of wealth / source of funds
            </label>
            <textarea
              value={sourceOfWealth}
              onChange={(e) => setSourceOfWealth(e.target.value)}
              rows={3}
              placeholder="Short narrative explaining the commercial rationale for the relationship."
              className={`${inputCls} resize-y`}
            />
          </div>

          <div>
            <label className="block text-10 uppercase tracking-wide-3 text-ink-2 font-semibold mb-1">
              Additional notes
            </label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={2}
              className={`${inputCls} resize-y`}
            />
          </div>

          <div className="flex items-center justify-between pt-2">
            <div className="text-10 text-ink-3">
              By submitting you consent to screening under FDL 10/2025 Art.10
              (CDD) and confirm data accuracy under Art.29 (false-statement
              offence).
            </div>
            <button
              type="submit"
              className="text-12 font-semibold px-4 py-2 rounded bg-ink-0 text-white hover:bg-ink-1"
            >
              Submit for screening
            </button>
          </div>
        </form>
      </div>
    </ModuleLayout>
  );
}
