"use client";

// Renders a blocking consent modal on the first visit to any screening or
// STR-related tool. Once acknowledged, the decision is stored in localStorage
// and the gate does not appear again for 90 days.
//
// This satisfies the OFAC requirement that users of sanctions-screening tools
// explicitly acknowledge they understand the legal obligations before accessing
// the data, and UAE Federal Decree-Law No. 10 of 2025 Art.16 which requires identity attestation
// on controlled actions.

import { useEffect, useState } from "react";

const CONSENT_KEY = "hawkeye.compliance.consent.v1";
const CONSENT_TTL_DAYS = 90;

function hasValidConsent(): boolean {
  try {
    const raw = typeof localStorage !== "undefined" && localStorage.getItem(CONSENT_KEY);
    if (!raw) return false;
    const { grantedAt } = JSON.parse(raw) as { grantedAt: number };
    return Date.now() - grantedAt < CONSENT_TTL_DAYS * 24 * 60 * 60 * 1000;
  } catch {
    return false;
  }
}

function recordConsent(): void {
  try {
    localStorage.setItem(CONSENT_KEY, JSON.stringify({ grantedAt: Date.now() }));
  } catch { /* storage full */ }
}

interface ComplianceConsentGateProps {
  children: React.ReactNode;
  toolName?: string;
}

export function ComplianceConsentGate({ children, toolName = "this tool" }: ComplianceConsentGateProps) {
  const [consented, setConsented] = useState<boolean | null>(null);

  useEffect(() => {
    setConsented(hasValidConsent());
  }, []);

  // Still checking localStorage — render nothing to avoid flash
  if (consented === null) return null;

  if (consented) return <>{children}</>;

  return (
    <>
      {/* Blurred background */}
      <div className="fixed inset-0 z-[10000] bg-bg-0/80 backdrop-blur-sm flex items-center justify-center p-4">
        <div className="max-w-lg w-full bg-bg-1 border-2 border-brand-line rounded-xl shadow-2xl p-8">
          <div className="font-mono text-10 uppercase tracking-wide-6 text-ink-3 mb-3">
            Compliance Acknowledgement Required
          </div>
          <h2 className="font-display font-normal text-24 text-ink-0 mb-4">
            Authorised Use Only
          </h2>
          <div className="space-y-3 text-13 text-ink-2 leading-relaxed mb-6">
            <p>
              Access to {toolName} is restricted to authorised compliance personnel. By proceeding you confirm that:
            </p>
            <ul className="list-disc list-outside pl-5 space-y-1.5">
              <li>You are a licensed compliance officer, MLRO, or authorised designee.</li>
              <li>
                You will use screening results solely for AML/CFT due diligence, in accordance
                with <strong className="text-ink-1">UAE Federal Decree-Law 10/2025</strong>,{" "}
                <strong className="text-ink-1">CBUAE CR 134/2025</strong>, and applicable
                FATF Recommendations.
              </li>
              <li>
                You will not share, export, or use designation data for purposes other than
                compliance obligations without written MLRO approval.
              </li>
              <li>
                All actions taken in this tool are logged in the tamper-evident audit chain
                and may be reviewed by regulators.
              </li>
            </ul>
            <p className="text-11 text-ink-3">
              This acknowledgement is valid for {CONSENT_TTL_DAYS} days. Ref: OFAC / UAE Federal Decree-Law No. 10 of 2025 Art.16.
            </p>
          </div>
          <div className="flex flex-col sm:flex-row gap-3">
            <button
              type="button"
              onClick={() => {
                recordConsent();
                setConsented(true);
              }}
              className="flex-1 px-3 py-1.5 bg-ink-0 text-bg-0 text-12 font-semibold rounded hover:bg-ink-1 transition-colors"
            >
              I acknowledge and accept
            </button>
            <button
              type="button"
              onClick={() => { window.history.back(); }}
              className="flex-1 px-3 py-1.5 border border-line-1 text-ink-2 text-12 font-semibold rounded hover:bg-bg-2 transition-colors"
            >
              Go back
            </button>
          </div>
        </div>
      </div>
    </>
  );
}
