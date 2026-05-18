import type { Metadata } from "next";
import type { ReactNode } from "react";

export const metadata: Metadata = {
  title: "Security Audit — Hawkeye Sterling",
  description:
    "AI-powered code security analyser, OWASP remediation checklist, and free scanning tools for the Hawkeye Sterling compliance platform.",
};

export default function SecurityAuditLayout({ children }: { children: ReactNode }) {
  return <>{children}</>;
}
