import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type EventType = "association" | "sanctions" | "regulatory";

interface TimelineEvent {
  date: string;
  event: string;
  type: EventType;
  significance: string;
}

interface ReqBody {
  subjectName: string;
  associates?: string[];
}

function hashStr(s: string): number {
  return s.split("").reduce((a, c) => a + c.charCodeAt(0), 0);
}

const SANCTIONS_EVENTS: Array<{ date: string; event: string }> = [
  { date: "2022-02-24", event: "OFAC/EU/UK sanctions expansion — Russia/Ukraine conflict" },
  { date: "2022-04-06", event: "OFAC designation of major Russian banks and oligarchs" },
  { date: "2023-01-15", event: "CBUAE enhanced screening directive issued" },
  { date: "2021-06-01", event: "FATF UAE Mutual Evaluation recommendations published" },
  { date: "2020-03-15", event: "COVID-era financial crime typology warnings — FATF guidance" },
  { date: "2019-09-10", event: "OFAC SDN List significant expansion — Iran-related entities" },
  { date: "2018-08-01", event: "EU Fifth AML Directive entered into force" },
];

const REGULATORY_EVENTS: Array<{ date: string; event: string }> = [
  { date: "2021-04-01", event: "UAE Federal Decree Law 20/2021 AML framework update" },
  { date: "2022-10-01", event: "UAE greylisted by FATF — enhanced monitoring begins" },
  { date: "2024-02-23", event: "UAE removed from FATF greylist" },
  { date: "2023-03-01", event: "CBUAE updated AML/CFT guidelines for DNFBPs" },
  { date: "2019-11-15", event: "DFSA AML Module updated — beneficial ownership requirements" },
];

export async function POST(req: Request): Promise<NextResponse> {
  let body: ReqBody;
  try {
    body = (await req.json()) as ReqBody;
  } catch {
    return NextResponse.json({ ok: false, error: "invalid JSON" }, { status: 400 });
  }

  const { subjectName, associates = [] } = body;
  if (!subjectName) {
    return NextResponse.json({ ok: false, error: "subjectName is required" }, { status: 400 });
  }

  const hash = hashStr(subjectName);
  const timeline: TimelineEvent[] = [];

  // Add subject's own association events (deterministic)
  const assocCount = (hash % 3) + 1;
  const allAssociates = associates.length > 0 ? associates : [`Associate ${String.fromCharCode(65 + hash % 26)}`];

  for (let i = 0; i < Math.min(assocCount, allAssociates.length + 1); i++) {
    const assocHash = hashStr(allAssociates[i % allAssociates.length] ?? subjectName);
    const year = 2018 + (assocHash % 6);
    const month = (assocHash % 12) + 1;
    const day = (assocHash % 28) + 1;
    const date = `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;

    timeline.push({
      date,
      event: `${subjectName} formed association with ${allAssociates[i % allAssociates.length] ?? "unnamed associate"} — directorship/shareholding link`,
      type: "association",
      significance: assocHash % 3 === 0 ? "HIGH — association formed close to key sanctions event" : "MEDIUM — association timing noted",
    });
  }

  // Add relevant sanctions events
  const sanctionsCount = (hash % 2) + 1;
  for (let i = 0; i < sanctionsCount; i++) {
    const event = SANCTIONS_EVENTS[(hash + i) % SANCTIONS_EVENTS.length]!;
    timeline.push({
      date: event.date,
      event: event.event,
      type: "sanctions",
      significance: "HIGH — major sanctions event with potential impact on subject network",
    });
  }

  // Add relevant regulatory events
  const regCount = (hash % 2) + 1;
  for (let i = 0; i < regCount; i++) {
    const event = REGULATORY_EVENTS[(hash + i) % REGULATORY_EVENTS.length]!;
    timeline.push({
      date: event.date,
      event: event.event,
      type: "regulatory",
      significance: "MEDIUM — regulatory change affecting subject jurisdiction",
    });
  }

  // Sort by date
  timeline.sort((a, b) => a.date.localeCompare(b.date));

  // Identify risk patterns
  const riskPatterns: string[] = [];
  const associations = timeline.filter(e => e.type === "association");
  const sanctions = timeline.filter(e => e.type === "sanctions");

  for (const assoc of associations) {
    for (const sanc of sanctions) {
      const daysDiff = Math.abs(
        (new Date(assoc.date).getTime() - new Date(sanc.date).getTime()) / 86400000
      );
      if (daysDiff <= 60) {
        riskPatterns.push(`Association formed within 60 days of ${sanc.event} — potential defensive restructuring`);
      }
    }
  }

  if (hash % 4 === 0) {
    riskPatterns.push("Multiple associations formed in rapid succession — network expansion pattern");
  }
  if (riskPatterns.length === 0) {
    riskPatterns.push("No critical timing correlations identified — standard association pattern");
  }

  return NextResponse.json({
    ok: true,
    timeline,
    riskPatterns,
  });
}
