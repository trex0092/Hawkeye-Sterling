import { NextResponse } from "next/server";
import { createHash, createHmac } from "node:crypto";
import { withGuard } from "@/lib/server/guard";
import { getJson, listKeys, setJson } from "@/lib/server/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 15;

// HMAC-signed audit chain. The four-eyes workflow needs every MLRO
// disposition / STR / freeze / goAML submission sealed into an
// immutable chain where each entry is bound to the hash of the
// previous one — tamper-evident per FDL 10/2025 Art.24 (10-year
// retention).
//
// Entry shape:
//   {
//     id: sha256 of payload,
//     at: iso timestamp,
//     actor: { role: 'analyst'|'mlro', name?: string },
//     action: 'clear'|'escalate'|'str'|'freeze'|'dispose'|'goaml_submit',
//     target: string (e.g. subject id or case id),
//     body: record,
//     previousHash: hex,
//     signature: HMAC-SHA256(prevHash + id + at, AUDIT_CHAIN_SECRET)
//   }
//
// Stored in Blobs as:
//   audit/entry/<zero-padded sequence>.json  (append-only)
//   audit/head.json → { sequence, hash }     (latest pointer)
//
// Verification is a separate endpoint (/api/audit/verify) — this one
// just signs-and-appends.

const ALLOWED_ACTIONS = new Set([
  "clear",
  "escalate",
  "str_read",
  "str",
  "freeze",
  "dispose",
  "goaml_submit",
  // Portal-generated lifecycle events (analyst tier). These are fired
  // automatically from the screening UI so every subject-add and screening
  // result lands in the tamper-evident HMAC chain in Netlify Blobs —
  // not just the client-side localStorage copy.
  "subject_added",
  "subject_removed",
  "screening_completed",
  "ongoing_enrolled",
]);

const ACTION_MIN_ROLE: Record<string, string> = {
  clear:               "analyst",
  escalate:            "analyst",
  str_read:            "co",
  str:                 "mlro",
  freeze:              "mlro",
  dispose:             "mlro",
  goaml_submit:        "mlro",
  subject_added:       "analyst",
  subject_removed:     "analyst",
  screening_completed: "analyst",
  ongoing_enrolled:    "analyst",
};

// Must mirror operator-role.ts ROLE_POWER. All 5 roles must be present —
// any role missing from this map gets power undefined, which passes NaN
// comparisons and would grant full MLRO access to lower roles.
const ROLE_POWER: Record<string, number> = {
  analyst:              1,
  compliance_assistant: 1,
  co:                   2,
  mlro:                 3,
  managing_director:    3,
};

interface SignBody {
  action: string;
  target: string;
  actor: {
    role: "analyst" | "compliance_assistant" | "co" | "mlro" | "managing_director";
    name?: string;
  };
  body?: Record<string, unknown>;
}

interface AuditEntry {
  sequence: number;
  id: string;
  at: string;
  actor: SignBody["actor"];
  action: string;
  target: string;
  body: Record<string, unknown>;
  previousHash: string;
  signature: string;
}

interface AuditHead {
  sequence: number;
  hash: string;
}

function sha256Hex(input: string): string {
  return createHash("sha256").update(input).digest("hex");
}

async function handleSign(req: Request): Promise<NextResponse> {
  const secret = process.env["AUDIT_CHAIN_SECRET"];
  if (!secret) {
    return NextResponse.json(
      {
        ok: true,
        entry: null,
        warning: "AI analysis unavailable — manual review required. Set AUDIT_CHAIN_SECRET to enable the signed audit chain.",
      },
    );
  }

  let body: SignBody;
  try {
    body = (await req.json()) as SignBody;
  } catch {
    return NextResponse.json({ ok: false, error: "invalid JSON" }, { status: 400 });
  }
  if (!body?.action || !body?.target || !body?.actor?.role) {
    return NextResponse.json(
      { ok: false, error: "action, target, actor.role are required" },
      { status: 400 },
    );
  }
  if (!ALLOWED_ACTIONS.has(body.action)) {
    return NextResponse.json(
      {
        ok: false,
        error: `action must be one of: ${Array.from(ALLOWED_ACTIONS).join(", ")}`,
      },
      { status: 400 },
    );
  }
  const minRole = ACTION_MIN_ROLE[body.action] ?? "analyst";
  if ((ROLE_POWER[body.actor.role] ?? 0) < (ROLE_POWER[minRole] ?? 0)) {
    return NextResponse.json(
      {
        ok: false,
        error: `action '${body.action}' requires role '${minRole}'; actor is '${body.actor.role}'`,
      },
      { status: 403 },
    );
  }

  // Load head to chain the new entry.
  const head = (await getJson<AuditHead>("audit/head.json")) ?? {
    sequence: 0,
    hash: "0".repeat(64),
  };
  const previousHash = head.hash;
  const nextSequence = head.sequence + 1;

  const at = new Date().toISOString();
  const payloadCanon = JSON.stringify({
    action: body.action,
    target: body.target,
    actor: body.actor,
    body: body.body ?? {},
    at,
  });
  const id = sha256Hex(payloadCanon);

  const signature = createHmac("sha256", secret)
    .update(previousHash)
    .update(id)
    .update(at)
    .digest("hex");

  const entry: AuditEntry = {
    sequence: nextSequence,
    id,
    at,
    actor: body.actor,
    action: body.action,
    target: body.target,
    body: body.body ?? {},
    previousHash,
    signature,
  };

  // Zero-pad to 10 digits so lexical blob listing = chronological order.
  const paddedSeq = String(nextSequence).padStart(10, "0");
  try {
    await setJson(`audit/entry/${paddedSeq}.json`, entry);
    // Head hash is id — links the next entry to this one.
    await setJson("audit/head.json", { sequence: nextSequence, hash: id });
  } catch (err) {
    console.error(
      "[hawkeye] audit/sign: Blobs write failed — entry NOT persisted, sequence NOT advanced:",
      err,
      { sequence: nextSequence, paddedSeq },
    );
    return NextResponse.json(
      { ok: false, error: "Audit entry could not be persisted to durable store" },
      { status: 500 },
    );
  }

  return NextResponse.json({ ok: true, entry });
}

async function handleList(_req: Request): Promise<NextResponse> {
  const keys = await listKeys("audit/entry/");
  const sorted = keys.sort(); // lexical sort = sequence order
  const entries: AuditEntry[] = [];
  for (const k of sorted.slice(-200)) {
    const e = await getJson<AuditEntry>(k);
    if (e) entries.push(e);
  }
  return NextResponse.json({
    ok: true,
    count: entries.length,
    entries,
  });
}

export const POST = withGuard(handleSign);
export const GET = withGuard(handleList);
