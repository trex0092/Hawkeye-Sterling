import { NextResponse } from "next/server";
import { createHash, createHmac } from "node:crypto";
import { withGuard, type RequestContext } from "@/lib/server/guard";
import { getJson, listKeys, setJson } from "@/lib/server/store";
import { getChainSecret } from "@/lib/server/audit-chain";
import { verifySession, SESSION_COOKIE } from "@/lib/server/auth";

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

// Alias so the rest of this file is unchanged. getChainSecret derives
// HMAC-SHA256(root, "hawkeye-audit-chain-v1:<tenantId>") — the same key
// the verify route uses, ensuring sign and verify are always consistent.
const getSigningKey = getChainSecret;

interface SignBody {
  action: string;
  target: string;
  actor: {
    role: "analyst" | "compliance_assistant" | "co" | "mlro" | "managing_director";
    name?: string;
  };
  body?: Record<string, unknown>;
  /** Tenant identifier for namespace isolation and per-tenant key derivation.
   *  Defaults to "default". Alphanumeric + hyphens/underscores only. */
  tenantId?: string;
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

async function handleSign(req: Request, ctx: RequestContext): Promise<NextResponse> {
  let body: SignBody;
  try {
    body = (await req.json()) as SignBody;
  } catch {
    return NextResponse.json({ ok: false, error: "invalid JSON" }, { status: 400 });
  }

  // tenantId is ALWAYS taken from the authenticated context — a caller cannot
  // write audit entries to a different tenant's chain by supplying a foreign
  // tenantId in the request body. Body-supplied tenantId is ignored.
  const tenantId = ctx.tenantId || "default";

  const secret = getSigningKey(tenantId);
  if (!secret) {
    // Fail-closed: returning ok:true with entry:null silently confused callers
    // into thinking audit writes succeeded. For FDL 10/2025 Art.24 compliance
    // the chain MUST be written or the endpoint MUST surface a clear error.
    console.error(
      `[hawkeye] audit/sign: AUDIT_CHAIN_SECRET missing or too short for tenant "${tenantId}" — refusing to sign. ` +
      "Generate with: openssl rand -hex 64",
    );
    return NextResponse.json(
      {
        ok: false,
        error: "AUDIT_CHAIN_SECRET is not configured — audit signing is disabled. " +
          "Set AUDIT_CHAIN_SECRET in Netlify environment variables (min 32 chars).",
        code: "AUDIT_CHAIN_SECRET_MISSING",
      },
      { status: 503 },
    );
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

  // For session-authenticated callers (browser clients), body.actor.role must
  // not exceed the authenticated session's actual role — prevents analysts from
  // forging MLRO audit chain entries by supplying a higher role in the body.
  // API-key-authenticated callers (server-to-server) are trusted and skipped.
  const rawCookie = req.headers.get("cookie") ?? "";
  const sessionToken = rawCookie.split(";").map((s) => s.trim())
    .find((s) => s.startsWith(`${SESSION_COOKIE}=`))
    ?.slice(SESSION_COOKIE.length + 1);
  if (sessionToken) {
    const session = verifySession(sessionToken);
    if (session) {
      const sessionPower = ROLE_POWER[session.role] ?? 0;
      const claimedPower = ROLE_POWER[body.actor.role] ?? 0;
      if (claimedPower > sessionPower) {
        return NextResponse.json(
          {
            ok: false,
            error: `actor.role '${body.actor.role}' exceeds authenticated session role '${session.role}'`,
          },
          { status: 403 },
        );
      }
    }
  }

  // Namespace storage by tenant: "default" uses the legacy paths for backward
  // compat; all other tenants are isolated under audit/<tenantId>/.
  const entryPrefix = tenantId === "default" ? "audit/entry" : `audit/${tenantId}/entry`;
  const headKey = tenantId === "default" ? "audit/head.json" : `audit/${tenantId}/head.json`;

  // Load head to chain the new entry.
  const head = (await getJson<AuditHead>(headKey)) ?? {
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
    await setJson(`${entryPrefix}/${paddedSeq}.json`, entry);
  } catch (err) {
    console.error(
      "[hawkeye] audit/sign: entry write failed — NOT persisted, sequence NOT advanced:",
      err,
      { sequence: nextSequence, paddedSeq, tenantId },
    );
    return NextResponse.json(
      { ok: false, error: "Audit entry could not be persisted to durable store" },
      { status: 500 },
    );
  }
  // Head hash is id — links the next entry to this one.
  // Split from the entry write so that a partial failure (entry written, head
  // not updated) is logged accurately rather than misreporting the entry as
  // un-persisted.
  try {
    await setJson(headKey, { sequence: nextSequence, hash: id });
  } catch (err) {
    console.error(
      "[hawkeye] audit/sign: head pointer write failed — entry IS persisted but chain head NOT advanced (orphaned entry):",
      err,
      { sequence: nextSequence, paddedSeq },
    );
    return NextResponse.json(
      { ok: false, error: "Audit entry persisted but chain head could not be updated — manual reconciliation required" },
      { status: 500 },
    );
  }

  return NextResponse.json({ ok: true, entry });
}

async function handleList(req: Request): Promise<NextResponse> {
  const url = new URL(req.url);
  const tenantId = ((url.searchParams.get("tenantId") ?? "default").replace(/[^a-zA-Z0-9_-]/g, "") || "default").slice(0, 64);
  const listPrefix = tenantId === "default" ? "audit/entry/" : `audit/${tenantId}/entry/`;
  const keys = await listKeys(listPrefix);
  const sorted = keys.sort(); // lexical sort = sequence order
  const entries: AuditEntry[] = [];
  for (const k of sorted.slice(-200)) {
    const e = await getJson<AuditEntry>(k);
    if (e) entries.push(e);
  }
  return NextResponse.json({
    ok: true,
    tenantId,
    count: entries.length,
    entries,
  });
}

export const POST = withGuard(handleSign);
export const GET = withGuard(handleList);
