import { NextResponse } from "next/server";
import { enforce } from "@/lib/server/enforce";
import { getStore } from "@netlify/blobs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 15;

// GET  /api/eocn-registration  — return NAS + ARS registration status
// POST /api/eocn-registration  — update / confirm registration status
//
// EOCN requires all UAE DNFBPs to:
// 1. Register on the Notification Alert System (NAS) to receive real-time
//    email alerts when the UAE TFS list is updated (uaeiec.gov.ae).
// 2. Register on the Automatic Reporting System (ARS) so DPMS dealers
//    receive automated list updates. Separate from NAS.
//
// These are manual portal registrations — Hawkeye cannot automate them.
// This API stores confirmation evidence and drives compliance gate warnings.

export interface EocnRegistrationRecord {
  nas: {
    confirmed: boolean;
    confirmedAt?: string;
    confirmedBy?: string;
    reference?: string;         // registration reference / email confirmation ref
    email?: string;             // registered email address
    notes?: string;
    lastVerifiedAt?: string;
  };
  ars: {
    confirmed: boolean;
    confirmedAt?: string;
    confirmedBy?: string;
    reference?: string;
    notes?: string;
    lastVerifiedAt?: string;
  };
  updatedAt: string;
  tenant: string;
}

const STORE = "hawkeye-eocn-registration";

async function loadRecord(tenant: string): Promise<EocnRegistrationRecord> {
  try {
    const store = getStore({ name: STORE, consistency: "strong" });
    const raw = await store.get(tenant, { type: "text" });
    if (raw) return JSON.parse(raw) as EocnRegistrationRecord;
  } catch { /* blob store unavailable in local dev */ }
  return {
    nas: { confirmed: false },
    ars: { confirmed: false },
    updatedAt: new Date().toISOString(),
    tenant,
  };
}

async function saveRecord(tenant: string, record: EocnRegistrationRecord): Promise<void> {
  try {
    const store = getStore({ name: STORE, consistency: "strong" });
    await store.set(tenant, JSON.stringify(record));
  } catch { /* local dev */ }
}

export async function GET(req: Request): Promise<NextResponse> {
  const gate = await enforce(req);
  if (!gate.ok) return gate.response;
  const tenant = (gate.record?.id ?? "anon").slice(0, 32);
  const record = await loadRecord(tenant);
  return NextResponse.json({ ok: true, registration: record }, { headers: gate.headers });
}

export async function POST(req: Request): Promise<NextResponse> {
  const gate = await enforce(req);
  if (!gate.ok) return gate.response;
  const tenant = (gate.record?.id ?? "anon").slice(0, 32);

  let body: Partial<EocnRegistrationRecord>;
  try { body = (await req.json()) as Partial<EocnRegistrationRecord>; }
  catch { return NextResponse.json({ ok: false, error: "invalid JSON" }, { status: 400, headers: gate.headers }); }

  const existing = await loadRecord(tenant);
  const now = new Date().toISOString();

  const updated: EocnRegistrationRecord = {
    ...existing,
    nas: {
      ...existing.nas,
      ...(body.nas ?? {}),
      confirmedAt: body.nas?.confirmed && !existing.nas.confirmed ? now : existing.nas.confirmedAt,
      lastVerifiedAt: now,
    },
    ars: {
      ...existing.ars,
      ...(body.ars ?? {}),
      confirmedAt: body.ars?.confirmed && !existing.ars.confirmed ? now : existing.ars.confirmedAt,
      lastVerifiedAt: now,
    },
    updatedAt: now,
    tenant,
  };

  await saveRecord(tenant, updated);
  return NextResponse.json({ ok: true, registration: updated }, { headers: gate.headers });
}
