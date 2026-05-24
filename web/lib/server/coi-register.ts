// Conflicts of Interest (COI) Register — FATF R.35 · CBUAE Governance Guidelines · FDL 10/2025 Art.19
//
// Tracks staff declarations of conflicts of interest, MLRO review decisions,
// and annual review cycles.
//
// Regulatory basis: FATF Recommendation 35, CBUAE Governance Guidelines,
// UAE Federal Decree-Law 10/2025 Article 19

import { getJson, setJson, listKeys } from "@/lib/server/store";

export interface CoiDeclaration {
  id: string;               // "COI-YYYYMMDD-xxxx"
  tenantId: string;
  staffName: string;
  staffRole: string;
  declarationDate: string;  // ISO date
  conflictType: "financial" | "personal" | "business" | "other";
  description: string;
  potentialImpact: string;
  mitigationProposed: string;
  status: "pending_review" | "approved" | "rejected" | "managed";
  mlroReviewDate?: string;
  mlroDecision?: string;
  mlroSignOff?: boolean;
  nextReviewDate?: string;  // auto: +1 year from declarationDate
  createdAt: string;
  updatedAt: string;
}

export type CoiCreateFields = Pick<
  CoiDeclaration,
  | "staffName"
  | "staffRole"
  | "declarationDate"
  | "conflictType"
  | "description"
  | "potentialImpact"
  | "mitigationProposed"
>;

export type CoiPatch = Partial<
  Omit<CoiDeclaration, "id" | "tenantId" | "createdAt">
>;

function sanitizeSegment(s: string): string {
  return s.replace(/[^a-zA-Z0-9_-]/g, "_").slice(0, 64);
}

export function coiKey(tenantId: string, id: string): string {
  return `coi-register/${sanitizeSegment(tenantId)}/${sanitizeSegment(id)}.json`;
}

function generateCoiId(): string {
  const now = new Date();
  const yyyymmdd = now.toISOString().slice(0, 10).replace(/-/g, "");
  const suffix = Math.random().toString(36).slice(2, 6).toUpperCase();
  return `COI-${yyyymmdd}-${suffix}`;
}

function addOneYear(dateStr: string): string {
  const d = new Date(dateStr);
  d.setFullYear(d.getFullYear() + 1);
  return d.toISOString().slice(0, 10);
}

export async function createCoiDeclaration(
  tenantId: string,
  fields: CoiCreateFields,
): Promise<CoiDeclaration> {
  const now = new Date();
  const id = generateCoiId();

  const record: CoiDeclaration = {
    id,
    tenantId,
    staffName: fields.staffName,
    staffRole: fields.staffRole,
    declarationDate: fields.declarationDate,
    conflictType: fields.conflictType,
    description: fields.description,
    potentialImpact: fields.potentialImpact,
    mitigationProposed: fields.mitigationProposed,
    status: "pending_review",
    nextReviewDate: addOneYear(fields.declarationDate),
    createdAt: now.toISOString(),
    updatedAt: now.toISOString(),
  };

  await setJson(coiKey(tenantId, id), record);
  return record;
}

export async function loadCoiDeclaration(
  tenantId: string,
  id: string,
): Promise<CoiDeclaration | null> {
  return getJson<CoiDeclaration>(coiKey(tenantId, id));
}

export async function loadAllCoiDeclarations(tenantId: string): Promise<CoiDeclaration[]> {
  const prefix = `coi-register/${sanitizeSegment(tenantId)}/`;
  const keys = await listKeys(prefix);
  const records = await Promise.all(
    keys.map((key) => getJson<CoiDeclaration>(key)),
  );

  return records
    .filter((r): r is CoiDeclaration => r !== null)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export async function updateCoiDeclaration(
  tenantId: string,
  id: string,
  patch: CoiPatch,
): Promise<CoiDeclaration> {
  const existing = await loadCoiDeclaration(tenantId, id);
  if (!existing) {
    throw new Error(`COI declaration not found: ${id}`);
  }

  const now = new Date();
  const updated: CoiDeclaration = { ...existing, ...patch, updatedAt: now.toISOString() };

  await setJson(coiKey(tenantId, id), updated);
  return updated;
}
