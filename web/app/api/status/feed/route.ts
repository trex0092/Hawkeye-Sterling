import { getJson, listKeys } from "@/lib/server/store";

import { enforce } from "@/lib/server/enforce";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 15;

// RSS 2.0 feed of status events — incidents, maintenance windows,
// and status transitions — so PagerDuty / Slack / any RSS reader
// can subscribe without parsing the JSON /api/status payload.

interface Incident {
  id: string;
  openedAt: string;
  closedAt?: string;
  severity: "critical" | "major" | "minor";
  title: string;
  affected: string[];
  body?: string;
}

interface MaintenanceWindow {
  id: string;
  startAt: string;
  endAt: string;
  title: string;
  affected: string[];
  body?: string;
}

function safeUTCString(iso: string): string {
  const d = new Date(iso);
  return isNaN(d.getTime()) ? new Date().toUTCString() : d.toUTCString();
}

function escape(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

export async function GET(req: Request): Promise<Response> {
  const gate = await enforce(req);
  if (!gate.ok) return gate.response;
  const origin = new URL(req.url).origin;

  let incidents: Incident[] = [];
  try {
    const keys = await listKeys("status/incident/");
    const loaded = await Promise.all(keys.map((k) => getJson<Incident>(k)));
    incidents = loaded.filter((i): i is Incident => Boolean(i));
  } catch {
    /* feed still renders even when store is unavailable */
  }
  let maintenance: MaintenanceWindow[] = [];
  try {
    maintenance =
      (await getJson<MaintenanceWindow[]>("status/maintenance.json")) ?? [];
  } catch {
    /* */
  }

  const items: Array<{
    guid: string;
    title: string;
    pubDate: string;
    description: string;
    link: string;
    category: string;
  }> = [];

  for (const i of incidents) {
    items.push({
      guid: `incident-${i.id}`,
      title: `[INCIDENT · ${i.severity.toUpperCase()}] ${i.title}`,
      pubDate: safeUTCString(i.openedAt),
      description: `${i.body ?? ""} Affected: ${i.affected.join(", ")}.${
        i.closedAt ? ` Resolved at ${safeUTCString(i.closedAt)}.` : " Ongoing."
      }`,
      link: `${origin}/status#incident-${i.id}`,
      category: "incident",
    });
  }
  for (const m of maintenance) {
    items.push({
      guid: `maintenance-${m.id}`,
      title: `[SCHEDULED MAINTENANCE] ${m.title}`,
      pubDate: safeUTCString(m.startAt),
      description: `${m.body ?? ""} Window: ${m.startAt} → ${m.endAt}. Affected: ${m.affected.join(", ")}.`,
      link: `${origin}/status#maintenance-${m.id}`,
      category: "maintenance",
    });
  }

  items.sort((a, b) => Date.parse(b.pubDate) - Date.parse(a.pubDate));

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0">
  <channel>
    <title>Hawkeye Sterling — System Status</title>
    <link>${origin}/status</link>
    <description>Incidents, scheduled maintenance windows, and status transitions for the Hawkeye Sterling compliance brain.</description>
    <language>en</language>
    <lastBuildDate>${new Date().toUTCString()}</lastBuildDate>
    <atom:link xmlns:atom="http://www.w3.org/2005/Atom" href="${origin}/api/status/feed" rel="self" type="application/rss+xml" />
${items
  .map(
    (it) => `    <item>
      <guid isPermaLink="false">${escape(it.guid)}</guid>
      <title>${escape(it.title)}</title>
      <link>${escape(it.link)}</link>
      <pubDate>${escape(it.pubDate)}</pubDate>
      <category>${escape(it.category)}</category>
      <description>${escape(it.description)}</description>
    </item>`,
  )
  .join("\n")}
  </channel>
</rss>`;

  return new Response(xml, {
    status: 200,
    headers: {
      "content-type": "application/rss+xml; charset=utf-8",
      "cache-control": "no-store",
    },
  });
}
