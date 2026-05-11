// POST /api/breach-check
//
// Dark Web / Breach Monitor — checks for data breach exposure associated with
// a subject name or email address. Uses Have I Been Pwned API v3 for email
// checks when HIBP_API_KEY is configured. Name-only queries return an
// inconclusive result — name matching against breach databases requires a
// commercial threat-intel feed not included by default.
//
// Body: { name: string, email?: string }
// Response: { found: boolean, sources: string[], riskLevel: string }

import { NextResponse } from "next/server";

import { enforce } from "@/lib/server/enforce";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface BreachCheckBody {
  name: string;
  email?: string;
}

interface BreachResult {
  found: boolean;
  sources: string[];
  riskLevel: "critical" | "high" | "medium" | "low" | "none" | "inconclusive";
  details: string[];
  emailBreaches?: Array<{ name: string; domain: string; breachDate: string; dataClasses: string[] }>;
  configNote?: string;
}

async function checkHibpEmail(
  email: string,
  apiKey: string,
): Promise<Array<{ name: string; domain: string; breachDate: string; dataClasses: string[] }>> {
  try {
    const res = await fetch(
      `https://haveibeenpwned.com/api/v3/breachedaccount/${encodeURIComponent(email)}?truncateResponse=false`,
      {
        signal: AbortSignal.timeout(8_000),
        headers: {
          "hibp-api-key": apiKey,
          "User-Agent": "Hawkeye-Sterling-AML/1.0",
        },
      },
    );

    if (res.status === 404) return [];
    if (!res.ok) return [];

    const data = (await res.json()) as Array<{
      Name: string;
      Domain: string;
      BreachDate: string;
      DataClasses: string[];
    }>;

    return data.map((b) => ({
      name: b.Name,
      domain: b.Domain,
      breachDate: b.BreachDate,
      dataClasses: b.DataClasses,
    }));
  } catch {
    return [];
  }
}

export async function POST(req: Request): Promise<NextResponse> {
  const gate = await enforce(req);
  if (!gate.ok) return gate.response;
  let body: BreachCheckBody;
  try {
    body = (await req.json()) as BreachCheckBody;
  } catch {
    return NextResponse.json({ error: "invalid JSON body" }, { status: 400 });
  }

  const { name, email } = body;
  if (!name || typeof name !== "string" || !name.trim()) {
    return NextResponse.json({ error: "name is required" }, { status: 400 });
  }

  const hibpKey = process.env.HIBP_API_KEY;

  // Base result: name-only checks return inconclusive — reliable name-based
  // breach attribution requires a commercial threat-intel feed (e.g. Recorded
  // Future, Flashpoint). Without one we surface no data rather than guessing.
  const result: BreachResult = {
    found: false,
    sources: [],
    riskLevel: "inconclusive",
    details: [
      "Name-only breach lookup requires a commercial dark-web intelligence feed.",
      "Configure HIBP_API_KEY and supply an email address for live breach data.",
    ],
    configNote: hibpKey
      ? undefined
      : "Set HIBP_API_KEY environment variable to enable live email breach checks.",
  };

  // Email check via HIBP when key and email are both present
  if (hibpKey && email && email.includes("@")) {
    const emailBreaches = await checkHibpEmail(email, hibpKey);
    result.configNote = undefined;
    if (emailBreaches.length > 0) {
      result.found = true;
      result.emailBreaches = emailBreaches;
      result.sources = emailBreaches.map((b) => b.name);
      const hasCritical = emailBreaches.some((b) =>
        b.dataClasses.some((dc) =>
          ["Passwords", "Credit cards", "Bank account numbers"].includes(dc),
        ),
      );
      result.riskLevel = hasCritical ? "critical" : "high";
      result.details = [
        `HIBP: ${emailBreaches.length} breach(es) confirmed for email address.`,
        ...emailBreaches.map((b) => `${b.name} (${b.breachDate}): ${b.dataClasses.join(", ")}`),
      ];
    } else {
      result.riskLevel = "none";
      result.details = ["HIBP: no breaches found for the supplied email address."];
    }
  }

  return NextResponse.json({ ok: true, ...result });
}
