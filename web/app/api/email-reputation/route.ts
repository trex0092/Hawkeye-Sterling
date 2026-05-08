export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";

const DISPOSABLE_DOMAINS = new Set([
  "mailinator.com", "guerrillamail.com", "tempmail.com", "throwaway.email",
  "yopmail.com", "10minutemail.com", "trashmail.com", "sharklasers.com",
  "maildrop.cc", "dispostable.com", "fakeinbox.com", "temp-mail.org",
]);

const HIGH_RISK_DOMAINS = new Set([
  "protonmail.com", "tutanota.com", "cock.li", "riseup.net",
]);

function getDomainAge(domain: string): string {
  // Deterministic stub based on domain TLD and length
  const d = domain.toLowerCase();
  if (d.endsWith(".gov") || d.endsWith(".edu")) return "20+ years";
  if (DISPOSABLE_DOMAINS.has(d)) return "< 1 year (disposable service)";
  if (d.length < 8) return "15+ years (short domain — likely legitimate)";
  const seed = d.split("").reduce((acc, c) => acc + c.charCodeAt(0), 0);
  const years = (seed % 18) + 1;
  return `${years} year${years !== 1 ? "s" : ""}`;
}

function getMxRecords(domain: string): string[] {
  const d = domain.toLowerCase();
  if (DISPOSABLE_DOMAINS.has(d)) return [`mx1.${d}`, `mx2.${d}`];
  if (d.endsWith("gmail.com")) return ["alt1.gmail-smtp-in.l.google.com", "alt2.gmail-smtp-in.l.google.com"];
  if (d.endsWith(".gov")) return [`mail.${d}`];
  return [`mx.${d}`, `mail.${d}`];
}

function getFraudScore(domain: string, email?: string): number {
  const d = domain.toLowerCase();
  if (DISPOSABLE_DOMAINS.has(d)) return 92;
  if (HIGH_RISK_DOMAINS.has(d)) return 55;
  if (d.endsWith(".ru") || d.endsWith(".cn")) return 45;
  if (d.endsWith(".gov") || d.endsWith(".edu")) return 2;
  // Deterministic variance
  const seed = d.split("").reduce((acc, c) => acc + c.charCodeAt(0), 0);
  const base = seed % 30;
  if (email && email.includes("+")) return Math.min(100, base + 20);
  return base;
}

export async function POST(req: Request) {
  let body: { email?: string; domain?: string };
  try {
    body = (await req.json()) as { email?: string; domain?: string };
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON" }, { status: 400 });
  }

  const rawDomain = body.domain ?? body.email?.split("@")[1] ?? "";
  const domain = rawDomain.toLowerCase().trim();

  if (!domain) {
    return NextResponse.json({ ok: false, error: "email or domain required" }, { status: 400 });
  }

  const isDisposable = DISPOSABLE_DOMAINS.has(domain);
  const fraudScore = getFraudScore(domain, body.email);

  const riskLevel =
    fraudScore >= 80 ? "critical" :
    fraudScore >= 60 ? "high" :
    fraudScore >= 35 ? "medium" : "low";

  return NextResponse.json({
    ok: true,
    domain,
    domainAge: getDomainAge(domain),
    mxRecords: getMxRecords(domain),
    isDisposable,
    fraudScore,
    riskLevel,
    notes: [
      isDisposable ? "Known disposable email service — high fraud risk" : null,
      HIGH_RISK_DOMAINS.has(domain) ? "Privacy-focused email provider — elevated anonymity risk" : null,
      domain.endsWith(".ru") || domain.endsWith(".cn") ? "High-risk TLD jurisdiction" : null,
      fraudScore < 10 ? "Domain appears legitimate and low-risk" : null,
    ].filter(Boolean),
  });
}
