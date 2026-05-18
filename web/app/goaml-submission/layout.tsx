import { ComplianceConsentGate } from "@/components/layout/ComplianceConsentGate";

export default function GoamlSubmissionLayout({ children }: { children: React.ReactNode }) {
  return (
    <ComplianceConsentGate toolName="the goAML STR Submission Portal">
      {children}
    </ComplianceConsentGate>
  );
}
