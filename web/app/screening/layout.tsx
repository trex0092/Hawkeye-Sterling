import { ComplianceConsentGate } from "@/components/layout/ComplianceConsentGate";

export default function ScreeningLayout({ children }: { children: React.ReactNode }) {
  return (
    <ComplianceConsentGate toolName="the Sanctions Screening & AML Intelligence Platform">
      {children}
    </ComplianceConsentGate>
  );
}
