import { ComplianceConsentGate } from "@/components/layout/ComplianceConsentGate";

export default function StrCasesLayout({ children }: { children: React.ReactNode }) {
  return (
    <ComplianceConsentGate toolName="the STR/SAR Case Management Tool">
      {children}
    </ComplianceConsentGate>
  );
}
