import { NextResponse } from "next/server";
import { withGuard, type RequestContext } from "@/lib/server/guard";
import { del, getJson, listKeys, setJson } from "@/lib/server/store";
import { writeAuditChainEntry } from "@/lib/server/audit-chain";
import { insertCaseRecord } from "@/lib/server/case-vault";
import { generateCaseId } from "@/lib/server/case-id";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 15;

type CustomerRiskTier = "standard" | "enhanced" | "intensive" | "pep" | "prohibited";

interface EnrolledSubject {
  id: string;
  tenantId?: string;
  name: string;
  aliases?: string[];
  entityType?: "individual" | "organisation" | "vessel" | "aircraft" | "other";
  jurisdiction?: string;
  group?: string;
  caseId?: string;
  enrolledAt: string;
  /** Customer risk tier determines monitoring frequency (FATF R.10/R.12). */
  riskTier?: CustomerRiskTier;
  /** True when the subject is a politically exposed person (FATF R.12). */
  isPep?: boolean;
}

// Allowlist for subject IDs used as blob store keys — prevent key-namespace
// injection via path separators or special characters.
const SAFE_ID_RE = /^[a-zA-Z0-9_\-.:]+$/;
const MAX_ID_LENGTH = 128;

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function stringField(v: unknown): string | undefined {
  return typeof v === "string" && v.trim() ? v.trim() : undefined;
}

function stringArray(v: unknown): string[] | undefined {
  if (!Array.isArray(v)) return undefined;
  const cleaned = v.filter((x): x is string => typeof x === "string" && x.trim().length > 0);
  return cleaned.length > 0 ? cleaned : undefined;
}

async function handleGet(_req: Request, ctx: RequestContext): Promise<NextResponse> {
  const keys = await listKeys("ongoing/subject/");
  const loaded = await Promise.all(keys.map((k) => getJson<EnrolledSubject>(k)));
  const subjects = loaded
    .filter((s): s is EnrolledSubject => s !== null)
    .filter((s) => s.tenantId === ctx.tenantId);
  return NextResponse.json({ ok: true, count: subjects.length, subjects });
}

async function handlePost(req: Request, ctx: RequestContext): Promise<NextResponse> {
  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "invalid JSON" }, { status: 400 });
  }
  if (!isRecord(raw)) {
    return NextResponse.json(
      { ok: false, error: "body must be a JSON object" },
      { status: 400 },
    );
  }
  const id = stringField(raw["id"]);
  const name = stringField(raw["name"]);
  if (!id || !name) {
    return NextResponse.json(
      { ok: false, error: "id and name required" },
      { status: 400 },
    );
  }
  if (id.length > MAX_ID_LENGTH || !SAFE_ID_RE.test(id)) {
    return NextResponse.json(
      { ok: false, error: "id must be alphanumeric/._-: and max 128 chars" },
      { status: 400 },
    );
  }
  const entityTypeRaw = stringField(raw["entityType"]);
  const allowedEntityTypes = new Set([
    "individual",
    "organisation",
    "vessel",
    "aircraft",
    "other",
  ]);
  const entityType =
    entityTypeRaw && allowedEntityTypes.has(entityTypeRaw)
      ? (entityTypeRaw as EnrolledSubject["entityType"])
      : undefined;

  // Validate riskTier — determines monitoring frequency per FATF R.10/R.12.
  const allowedRiskTiers = new Set<CustomerRiskTier>([
    "standard",
    "enhanced",
    "intensive",
    "pep",
    "prohibited",
  ]);
  const riskTierRaw = stringField(raw["riskTier"]);
  const riskTier: CustomerRiskTier | undefined =
    riskTierRaw && allowedRiskTiers.has(riskTierRaw as CustomerRiskTier)
      ? (riskTierRaw as CustomerRiskTier)
      : undefined;

  // isPep — PEP subjects are subject to FATF R.12 mandatory weekly screening.
  const isPepRaw = raw["isPep"];
  const isPep: boolean | undefined =
    typeof isPepRaw === "boolean" ? isPepRaw : undefined;

  const record: EnrolledSubject = {
    id,
    tenantId: ctx.tenantId,
    name,
    ...(stringArray(raw["aliases"]) ? { aliases: stringArray(raw["aliases"])! } : {}),
    ...(entityType ? { entityType } : {}),
    ...(stringField(raw["jurisdiction"]) ? { jurisdiction: stringField(raw["jurisdiction"])! } : {}),
    ...(stringField(raw["group"]) ? { group: stringField(raw["group"])! } : {}),
    ...(stringField(raw["caseId"]) ? { caseId: stringField(raw["caseId"])! } : {}),
    ...(riskTier ? { riskTier } : {}),
    ...(isPep !== undefined ? { isPep } : {}),
    enrolledAt: new Date().toISOString(),
  };
  await setJson(`ongoing/subject/${id}`, record);

  // Seed the case vault so the case appears in the operator dashboard.
  // Uses the caller-supplied caseId if present; otherwise generates a new one.
  const caseId = record.caseId ?? generateCaseId();
  const now = new Date().toISOString();
  void insertCaseRecord(ctx.tenantId, {
    id: caseId,
    badge: "OM",
    badgeTone: "violet",
    subject: name,
    meta: `Ongoing monitoring — enrolled ${now.slice(0, 10)}`,
    status: "active",
    evidenceCount: "0",
    lastActivity: now,
    opened: now,
    statusLabel: "Active",
    statusDetail: "Ongoing monitoring enrolled",
    evidence: [],
    timeline: [{ timestamp: now, event: "Subject enrolled in ongoing monitoring" }],
  }).catch((err) =>
    console.warn("[ongoing] case vault insert failed:", err instanceof Error ? err.message : String(err)),
  );

  // Enrolment in the ongoing-monitoring register is a compliance event
  // (FDL 10/2025 Art.16 — enhanced ongoing monitoring for high-risk subjects).
  void writeAuditChainEntry(
    {
      event: "ongoing.subject_enrolled",
      actor: ctx.apiKey.id,
      subjectId: id,
      subjectName: name,
      entityType: record.entityType,
      caseId: record.caseId,
      riskTier: record.riskTier ?? "standard",
      isPep: record.isPep ?? false,
    },
    ctx.tenantId,
  ).catch((err) =>
    console.warn("[ongoing] audit chain write failed:", err instanceof Error ? err.message : String(err)),
  );

  // Seed a thrice_daily schedule so the /api/ongoing/run cron produces
  // three Asana tasks per 24h for every newly enrolled subject, per
  // MLRO policy. Honour a caller-supplied cadence override when valid.
  const allowedCadences = new Set([
    "hourly",
    "thrice_daily",
    "daily",
    "weekly",
    "monthly",
  ]);
  const requestedCadence = stringField(raw["cadence"]);
  const cadence =
    requestedCadence && allowedCadences.has(requestedCadence)
      ? requestedCadence
      : "thrice_daily";
  const nextRunAt = new Date().toISOString();
  await setJson(`schedule/${id}`, {
    subjectId: id,
    cadence,
    nextRunAt,
  });

  return NextResponse.json({ ok: true, subject: record, cadence });
}

async function handleDelete(req: Request, ctx: RequestContext): Promise<NextResponse> {
  const url = new URL(req.url);
  const id = url.searchParams.get("id")?.trim();
  if (!id || id.length > MAX_ID_LENGTH || !SAFE_ID_RE.test(id)) {
    return NextResponse.json(
      { ok: false, error: "id required (alphanumeric/._-:, max 128 chars)" },
      { status: 400 },
    );
  }

  // Mandatory reason field — min 10 chars (FDL 10/2025 Art.16, audit trail).
  const reason = url.searchParams.get("reason")?.trim() ?? "";
  if (reason.length < 10) {
    return NextResponse.json(
      { ok: false, error: "reason required (min 10 characters)" },
      { status: 400 },
    );
  }

  // Verify ownership — only the enrolling tenant may delete the subject.
  // Strict equality check: if tenantId is missing on the record (legacy),
  // treat as a different tenant to prevent cross-tenant deletion.
  const existing = await getJson<EnrolledSubject>(`ongoing/subject/${id}`);
  if (!existing || existing.tenantId !== ctx.tenantId) {
    return NextResponse.json({ ok: false, error: "not found" }, { status: 404 });
  }
  await del(`ongoing/subject/${id}`);
  await del(`ongoing/last/${id}`);
  // Remove the schedule entry so the cron job no longer attempts to
  // re-screen this subject after it has been un-enrolled.
  await del(`schedule/${id}`);
  void writeAuditChainEntry(
    {
      event: "ongoing.subject_unenrolled",
      actor: ctx.apiKey.id,
      subjectId: id,
      subjectName: existing.name,
      reason,
    },
    ctx.tenantId,
  ).catch((err) =>
    console.warn("[ongoing] audit chain write failed:", err instanceof Error ? err.message : String(err)),
  );
  return NextResponse.json({ ok: true });
}

export const GET = withGuard(handleGet);
export const POST = withGuard(handlePost);
export const DELETE = withGuard(handleDelete);
