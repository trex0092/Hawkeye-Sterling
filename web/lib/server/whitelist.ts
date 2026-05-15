// False-positive whitelist — shared helper.
//
// Stores per-tenant whitelist entries in Netlify Blobs at:
//   `whitelist/<tenantId>/<entryId>.json`
//
// An entry whitelists a subject (by id and/or normalised name) so that
// repeat screenings against the same known-clear individual or entity
// surface as `verdict: "whitelisted"` instead of bubbling the same
// false-positive hits up to the MLRO every cycle.
//
// Server callers (screening routes, ongoing-screen) check
// `isWhitelisted(...)` before running expensive list matching. The CRUD
// endpoint at `/api/whitelist` writes through this helper so the audit
// trail stays consistent.

import { del, getJson, listKeys, setJson } from "@/lib/server/store";

export interface WhitelistEntry {
  id: string;
  tenantId: string;
  subjectId?: string;
  subjectName: string;
  normalisedName: string;
  jurisdiction?: string;
  reason: string;
  approvedBy: string;
  approverRole: "co" | "mlro" | "admin";
  approvedAt: string;
  expiresAt?: string;
}

const ID_RE = /^[a-zA-Z0-9_\-.:]{1,128}$/;

export function normaliseName(name: string): string {
  return name
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function validateEntryId(id: string): boolean {
  return ID_RE.test(id);
}

function blobKey(tenantId: string, entryId: string): string {
  return `whitelist/${tenantId}/${entryId}.json`;
}

export async function listWhitelist(tenantId: string): Promise<WhitelistEntry[]> {
  const keys = await listKeys(`whitelist/${tenantId}/`);
  const loaded = await Promise.all(keys.map((k) => getJson<WhitelistEntry>(k)));
  return loaded
    .filter((e): e is WhitelistEntry => e !== null)
    .filter((e) => !e.expiresAt || Date.parse(e.expiresAt) > Date.now());
}

export async function addWhitelistEntry(entry: WhitelistEntry): Promise<void> {
  await setJson(blobKey(entry.tenantId, entry.id), entry);
}

export async function deleteWhitelistEntry(tenantId: string, entryId: string): Promise<boolean> {
  const key = blobKey(tenantId, entryId);
  const existing = await getJson<WhitelistEntry>(key);
  if (!existing) return false;
  await del(key);
  return true;
}

/**
 * Returns the matching whitelist entry if `subject` is on the tenant's
 * whitelist, otherwise null. Match priority: (1) subjectId exact, (2)
 * normalised name + optional jurisdiction match.
 */
export async function lookupWhitelist(
  tenantId: string,
  subject: { id?: string; name: string; jurisdiction?: string },
): Promise<WhitelistEntry | null> {
  const entries = await listWhitelist(tenantId);
  if (subject.id) {
    const byId = entries.find((e) => e.subjectId === subject.id);
    if (byId) return byId;
  }
  const target = normaliseName(subject.name);
  if (!target) return null;
  const byName = entries.find((e) => {
    if (e.normalisedName !== target) return false;
    if (!e.jurisdiction || !subject.jurisdiction) return true;
    return e.jurisdiction.toUpperCase() === subject.jurisdiction.toUpperCase();
  });
  return byName ?? null;
}
