// Hawkeye Sterling — Regulatory Change Watcher
//
// Provides storage and digest generation for regulatory changes from major
// AML/CFT regimes (OFAC, UN, EU, UK, FATF, local regulators).
//
// Changes are stored in Netlify Blobs under the key prefix "reg-changes:".
// Each change has a UUID-based id and a detectedAt timestamp added at write time.

import { randomUUID } from "node:crypto";
import { getJson, setJson, listKeys } from "@/lib/server/store";

export interface RegulatoryChange {
  id: string;
  source: "ofac" | "un" | "eu" | "uk" | "fatf" | "local";
  changeType:
    | "new_designation"
    | "delisting"
    | "update"
    | "advisory"
    | "guidance";
  title: string;
  summary: string;
  effectiveDate: string;
  detectedAt: string;
  url?: string;
  affectedLists: string[];
  severity: "critical" | "high" | "medium" | "low";
}

const KEY_PREFIX = "reg-changes:";

/**
 * Return all recorded regulatory changes. When `since` is provided (ISO string)
 * only changes with `detectedAt >= since` are returned, sorted newest-first.
 */
export async function getRecentChanges(since?: string): Promise<RegulatoryChange[]> {
  const keys = await listKeys(KEY_PREFIX);
  if (keys.length === 0) return [];

  const records = await Promise.all(
    keys.map((key) => getJson<RegulatoryChange>(key)),
  );

  const valid = records.filter((r): r is RegulatoryChange => r !== null);

  const sinceMs = since ? new Date(since).getTime() : 0;
  const filtered = sinceMs > 0
    ? valid.filter((r) => new Date(r.detectedAt).getTime() >= sinceMs)
    : valid;

  // Newest first
  return filtered.sort(
    (a, b) => new Date(b.detectedAt).getTime() - new Date(a.detectedAt).getTime(),
  );
}

/**
 * Persist a new regulatory change. Adds `id` and `detectedAt` automatically.
 */
export async function recordChange(
  change: Omit<RegulatoryChange, "id" | "detectedAt">,
): Promise<RegulatoryChange> {
  const id = randomUUID();
  const detectedAt = new Date().toISOString();
  const full: RegulatoryChange = { ...change, id, detectedAt };
  await setJson(`${KEY_PREFIX}${id}`, full);
  return full;
}

/**
 * Return all changes in the last `days` days together with a plain-text
 * summary suitable for digest emails or webhook notifications.
 */
export async function getChangeDigest(
  tenantId: string,
  days: number,
): Promise<{ changes: RegulatoryChange[]; summary: string }> {
  void tenantId; // available for future per-tenant filtering

  const sinceDate = new Date();
  sinceDate.setUTCDate(sinceDate.getUTCDate() - Math.max(1, days));
  const changes = await getRecentChanges(sinceDate.toISOString());

  const summary = buildDigestSummary(changes, days);
  return { changes, summary };
}

// ── Digest summary builder ────────────────────────────────────────────────────

interface SourceBucket {
  label: string;
  counts: Record<string, number>;
}

function buildDigestSummary(changes: RegulatoryChange[], days: number): string {
  if (changes.length === 0) {
    return `Regulatory changes in the last ${days} day${days === 1 ? "" : "s"}:\n• No changes detected.`;
  }

  // Group by source × changeType for bullet point generation
  const bySource = new Map<RegulatoryChange["source"], SourceBucket>();

  const SOURCE_LABELS: Record<RegulatoryChange["source"], string> = {
    ofac: "OFAC",
    un: "UN",
    eu: "EU",
    uk: "UK",
    fatf: "FATF",
    local: "Local",
  };

  const CHANGE_TYPE_LABELS: Record<RegulatoryChange["changeType"], string> = {
    new_designation: "new designation",
    delisting: "delisting",
    update: "update",
    advisory: "advisory",
    guidance: "guidance",
  };

  for (const change of changes) {
    if (!bySource.has(change.source)) {
      bySource.set(change.source, { label: SOURCE_LABELS[change.source], counts: {} });
    }
    const bucket = bySource.get(change.source)!;
    const typeLabel = CHANGE_TYPE_LABELS[change.changeType] ?? change.changeType;
    const pluralLabel = `${typeLabel}s`;
    bucket.counts[pluralLabel] = (bucket.counts[pluralLabel] ?? 0) + 1;
  }

  const bullets: string[] = [];

  for (const [, bucket] of bySource) {
    for (const [typeLabel, count] of Object.entries(bucket.counts)) {
      bullets.push(`${count} ${bucket.label} ${count === 1 ? typeLabel.replace(/s$/, "") : typeLabel}`);
    }
  }

  const lines = [
    `Regulatory changes in the last ${days} day${days === 1 ? "" : "s"}:`,
    ...bullets.map((b) => `• ${b}`),
  ];

  return lines.join("\n");
}
