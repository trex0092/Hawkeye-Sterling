// Hawkeye Sterling — RMAP smelter/refiner CID database.
// The RMI publishes a public conformant smelter/refiner list. We maintain a
// static seed of well-known major GDL/LBMA refiners plus a Blobs-backed
// supplement for tenant-specific manual additions.

import { getJson, setJson } from "./store";
import { randomBytes } from "node:crypto";

export interface RmapSmelter {
  cid: string;           // Conformant ID (e.g. "CID001234")
  facilityName: string;
  country: string;
  countryCode: string;   // ISO 3166-1 alpha-2
  products: ("gold" | "tin" | "tantalum" | "tungsten" | "cobalt")[];
  rmapStatus: "conformant" | "active_placement" | "not_assessed" | "suspended";
  lastAuditDate?: string;  // ISO date
  auditValidity?: "1_year" | "3_year";
  source: "rmi_public" | "manual";
  updatedAt: string;
}

// Seed of well-known major gold refiners on the LBMA Good Delivery List
// and/or RMAP conformant. CIDs are representative placeholders matching the
// RMI public list format.
export const SEED_SMELTERS: RmapSmelter[] = [
  {
    cid: "CID000001",
    facilityName: "Valcambi SA",
    country: "Switzerland",
    countryCode: "CH",
    products: ["gold"],
    rmapStatus: "conformant",
    lastAuditDate: "2024-09-05",
    auditValidity: "3_year",
    source: "rmi_public",
    updatedAt: "2025-01-01",
  },
  {
    cid: "CID000002",
    facilityName: "PAMP SA (MKS Group)",
    country: "Switzerland",
    countryCode: "CH",
    products: ["gold"],
    rmapStatus: "conformant",
    lastAuditDate: "2025-01-10",
    auditValidity: "3_year",
    source: "rmi_public",
    updatedAt: "2025-01-01",
  },
  {
    cid: "CID000003",
    facilityName: "Heraeus Metals Germany GmbH & Co. KG",
    country: "Germany",
    countryCode: "DE",
    products: ["gold"],
    rmapStatus: "conformant",
    lastAuditDate: "2024-11-15",
    auditValidity: "3_year",
    source: "rmi_public",
    updatedAt: "2025-01-01",
  },
  {
    cid: "CID000004",
    facilityName: "Argor-Heraeus SA",
    country: "Switzerland",
    countryCode: "CH",
    products: ["gold"],
    rmapStatus: "conformant",
    lastAuditDate: "2025-01-22",
    auditValidity: "3_year",
    source: "rmi_public",
    updatedAt: "2025-01-01",
  },
  {
    cid: "CID000005",
    facilityName: "The Perth Mint",
    country: "Australia",
    countryCode: "AU",
    products: ["gold"],
    rmapStatus: "conformant",
    lastAuditDate: "2024-08-20",
    auditValidity: "3_year",
    source: "rmi_public",
    updatedAt: "2025-01-01",
  },
  {
    cid: "CID000006",
    facilityName: "Royal Canadian Mint",
    country: "Canada",
    countryCode: "CA",
    products: ["gold"],
    rmapStatus: "conformant",
    lastAuditDate: "2024-10-01",
    auditValidity: "3_year",
    source: "rmi_public",
    updatedAt: "2025-01-01",
  },
  {
    cid: "CID000007",
    facilityName: "Tanaka Kikinzoku Kogyo K.K.",
    country: "Japan",
    countryCode: "JP",
    products: ["gold"],
    rmapStatus: "conformant",
    lastAuditDate: "2024-07-15",
    auditValidity: "3_year",
    source: "rmi_public",
    updatedAt: "2025-01-01",
  },
  {
    cid: "CID000008",
    facilityName: "MKS PAMP SA",
    country: "Switzerland",
    countryCode: "CH",
    products: ["gold"],
    rmapStatus: "conformant",
    lastAuditDate: "2025-01-10",
    auditValidity: "3_year",
    source: "rmi_public",
    updatedAt: "2025-01-01",
  },
  {
    cid: "CID000009",
    facilityName: "Umicore SA/NV",
    country: "Belgium",
    countryCode: "BE",
    products: ["gold", "cobalt"],
    rmapStatus: "conformant",
    lastAuditDate: "2024-11-20",
    auditValidity: "3_year",
    source: "rmi_public",
    updatedAt: "2025-01-01",
  },
  {
    cid: "CID000010",
    facilityName: "Rand Refinery (Pty) Ltd",
    country: "South Africa",
    countryCode: "ZA",
    products: ["gold"],
    rmapStatus: "conformant",
    lastAuditDate: "2024-09-10",
    auditValidity: "3_year",
    source: "rmi_public",
    updatedAt: "2025-01-01",
  },
];

function smelterDbKey(tenantId: string): string {
  const t = tenantId.replace(/[^a-zA-Z0-9_-]/g, "_").slice(0, 64);
  return `rmap/${t}/smelters.json`;
}

export async function loadSmelterDatabase(tenantId: string): Promise<RmapSmelter[]> {
  const stored = await getJson<RmapSmelter[]>(smelterDbKey(tenantId));
  if (!stored || !Array.isArray(stored)) {
    return [...SEED_SMELTERS];
  }
  // Merge: seed items not in Blobs by CID are prepended
  const storedCids = new Set(stored.map((s) => s.cid));
  const missingSeeds = SEED_SMELTERS.filter((s) => !storedCids.has(s.cid));
  return [...missingSeeds, ...stored];
}

export async function saveSmelterDatabase(tenantId: string, smelters: RmapSmelter[]): Promise<void> {
  await setJson(smelterDbKey(tenantId), smelters);
}

export async function lookupSmelter(tenantId: string, query: string): Promise<RmapSmelter[]> {
  const db = await loadSmelterDatabase(tenantId);
  if (!query || !query.trim()) return db;
  const q = query.toLowerCase().trim();
  return db.filter(
    (s) =>
      s.facilityName.toLowerCase().includes(q) ||
      s.country.toLowerCase().includes(q) ||
      s.countryCode.toLowerCase().includes(q) ||
      s.cid.toLowerCase().includes(q),
  );
}

export async function addManualSmelter(
  tenantId: string,
  smelter: Omit<RmapSmelter, "source" | "updatedAt">,
): Promise<RmapSmelter> {
  const db = await loadSmelterDatabase(tenantId);

  // Check for duplicate CID
  if (db.some((s) => s.cid === smelter.cid)) {
    throw new Error(`Smelter with CID ${smelter.cid} already exists`);
  }

  const now = new Date().toISOString().slice(0, 10);
  const newSmelter: RmapSmelter = {
    ...smelter,
    source: "manual",
    updatedAt: now,
  };

  // Only persist non-seed items to Blobs; filter out seeds then re-add
  const nonSeedItems = db.filter((s) => s.source !== "rmi_public");
  await saveSmelterDatabase(tenantId, [...nonSeedItems, newSmelter]);

  return newSmelter;
}

export function generateCid(): string {
  const hex = randomBytes(3).toString("hex").toUpperCase();
  return `CID${hex}`;
}
