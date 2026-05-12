import { ModuleLayout, ModuleHero } from "@/components/layout/ModuleLayout";

export const metadata = { title: "Privacy Policy — Hawkeye Sterling" };

export default function PrivacyPage() {
  return (
    <ModuleLayout>
      <ModuleHero
        eyebrow="LEGAL · DATA PROTECTION"
        title="Privacy"
        titleEm="policy."
        intro="How Hawkeye Sterling collects, processes, and protects personal data under UAE Federal Law No. 45/2021 (PDPL) and applicable AML/CFT obligations."
      />

      <div className="max-w-2xl mt-6 space-y-6 text-12 text-ink-1 leading-relaxed">
        <Section title="1. Data Controller">
          Hawkeye Sterling FZE, DMCC Free Zone, Dubai, UAE is the data controller for all personal data processed through this platform. Contact our Data Protection Officer at <a href="mailto:dpo@hawkeyesterling.com" className="text-brand hover:underline font-mono">dpo@hawkeyesterling.com</a>.
        </Section>

        <Section title="2. Data We Collect">
          <ul className="list-disc pl-4 space-y-1">
            <li>Subject screening data: names, aliases, dates of birth, nationalities, jurisdictions entered for sanctions and adverse-media checks.</li>
            <li>Operator account data: email address, authentication credentials, activity logs.</li>
            <li>System telemetry: API call timestamps, latency metrics, error logs (no personal data included).</li>
          </ul>
        </Section>

        <Section title="3. Legal Basis for Processing">
          Processing is carried out under:
          <ul className="list-disc pl-4 space-y-1 mt-1">
            <li><strong>Legal obligation</strong> — UAE FDL No. 10 of 2025 (AML/CFT/CPF Law), Cabinet Resolution No. 134 of 2025, and CBUAE/FSRA/DFSA requirements mandate customer due diligence and sanctions screening.</li>
            <li><strong>Legitimate interests</strong> — Fraud prevention, platform security, and product improvement.</li>
            <li><strong>Contract</strong> — Providing the screening services under the operator&apos;s licence agreement.</li>
          </ul>
        </Section>

        <Section title="4. Data Sources">
          Adverse-media searches query the GDELT Project (public news corpus) and Google News RSS. Sanctions data is drawn from UN, OFAC, EU, UK OFSI, and UAE EOCN/LTL official lists. No data is purchased from third-party data brokers.
        </Section>

        <Section title="5. Data Retention">
          Screening records are retained for <strong>10 years</strong> from the date of the transaction or relationship termination, in accordance with FDL 10/2025 Art.19 and UAE AML Law Art.14. Audit logs are retained for the same period and are tamper-evident.
        </Section>

        <Section title="6. Data Transfers">
          Data processed by the AI enrichment features is sent to Anthropic&apos;s API (USA) under standard contractual clauses. Screening data remains within Netlify&apos;s infrastructure (GDPR-compliant EU region where selected). No other international transfers occur.
        </Section>

        <Section title="7. Your Rights">
          Under UAE PDPL Federal Law No. 45/2021 you have the right to access, correct, delete, or restrict processing of your personal data. Requests should be submitted to <a href="mailto:dpo@hawkeyesterling.com" className="text-brand hover:underline font-mono">dpo@hawkeyesterling.com</a>. Note: certain rights may be limited where processing is required by law (e.g. AML record-keeping obligations override erasure requests).
        </Section>

        <Section title="8. Security">
          All data is encrypted in transit (TLS 1.3) and at rest. Access is restricted to authorised operators via token-based authentication. Penetration testing is conducted annually. Incident response procedures are maintained per CBUAE guidance.
        </Section>

        <Section title="9. Cookies">
          This platform uses only essential session cookies required for authentication. No advertising or tracking cookies are deployed.
        </Section>

        <Section title="10. Changes to This Policy">
          Material changes will be communicated via the platform notification system and reflected in the version date below.
        </Section>

        <div className="border-t border-hair-2 pt-4 text-10 text-ink-3 font-mono">
          Last updated: 05 May 2026 · Version 2.0 · Hawkeye Sterling FZE
        </div>
      </div>
    </ModuleLayout>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="space-y-2">
      <h2 className="text-13 font-semibold text-ink-0">{title}</h2>
      <div className="text-12 text-ink-1 leading-relaxed">{children}</div>
    </div>
  );
}
