// GET  /api/audit/view?screeningId=<id>&format=json|jsonpdf
// GET  /api/audit/view?format=json|pdf   (export / signature validation)
// POST /api/audit/view                   (HMAC signature verification)
//
// Audit trail query and verification endpoint (audit follow-up #25).
// Reads HMAC-signed audit chain entries from the "hawkeye-audit-chain"
// Netlify Blobs store written by /api/audit/sign, returns the full
// BrainVerdict envelope for a given screening ID, and exposes a
// POST handler for HMAC signature verification per FDL 10/2025 Art.24.
//
// Entry shape (produced by /api/audit/sign):
//   {
//     sequence: number,
//     id: string,          sha256 of canonical payload
//     at: string,          ISO timestamp
//     actor: { role, name? },
//     action: string,
//     target: string,      screening ID or case ID
//     body: Record<string, unknown>,
//     previousHash: string,
//     signature: string    HMAC-SHA256(prevHash + id + at, AUDIT_CHAIN_SECRET)
//   }
//
// Store layout (same as sign/route.ts):
//   audit/entry/<zero-padded-10-digit>.json   (append-only)
//   audit/head.json → { sequence, hash }      (latest pointer)

import { NextResponse } from "next/server";
import { createHmac } from "node:crypto";
import { enforce } from "@/lib/server/enforce";
import { getJson, listKeys } from "@/lib/server/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

// ─── Shared types (must mirror sign/route.ts) ────────────────────────────────

interface AuditActor {
  role: "analyst" | "compliance_assistant" | "co" | "mlro" | "managing_director";
  name?: string;
}

export interface AuditEntry {
  sequence: number;
  id: string;
  at: string;
  actor: AuditActor;
  action: string;
  target: string;
  body: Record<string, unknown>;
  previousHash: string;
  signature: string;
}

// ─── BrainVerdict envelope types ─────────────────────────────────────────────

interface Finding {
  source: string;
  risk_level: "low" | "medium" | "high" | "critical";
  detail: string;
  matched_terms?: string[];
}

interface ChainStep {
  step: number;
  label: string;
  actor: string;
  at: string;
  outcome: string;
}

interface BrainVerdictEnvelope {
  ok: true;
  screeningId: string;
  entries: AuditEntry[];
  findings: Finding[];
  faculty_labelled_chain: ChainStep[];
  recommended_actions: string[];
  cognitive_depth_sidecar: Record<string, unknown>;
  hmac_signature: string;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

/**
 * Load audit entries from the Blobs store.
 * Reads are parallelised with Promise.all to avoid sequential-IO timeouts on
 * large chains. Pass `limit` to cap the number of entries returned (newest
 * first when limit is set); omit to return the full chain.
 */
async function loadAllEntries(limit?: number): Promise<AuditEntry[]> {
  const keys = await listKeys("audit/entry/");
  let sorted = keys.sort(); // lexical == chronological for zero-padded keys
  if (limit && limit > 0) {
    // Take the last `limit` keys (most recent) for paginated callers.
    sorted = sorted.slice(-limit);
  }
  const results = await Promise.all(sorted.map(k => getJson<AuditEntry>(k)));
  return results.filter((e): e is AuditEntry => e !== null);
}

/**
 * Verify a single entry's HMAC signature.
 * Returns true when the recomputed signature matches the stored one.
 */
function verifyEntrySignature(entry: AuditEntry, secret: string): boolean {
  const expected = createHmac("sha256", secret)
    .update(entry.previousHash)
    .update(entry.id)
    .update(entry.at)
    .digest("hex");
  // Constant-time comparison via length check + XOR loop to avoid timing
  // attacks on the hex string. Both strings are the same length when
  // produced correctly; a length mismatch is an immediate rejection.
  if (expected.length !== entry.signature.length) return false;
  let diff = 0;
  for (let i = 0; i < expected.length; i++) {
    diff |= expected.charCodeAt(i) ^ entry.signature.charCodeAt(i);
  }
  return diff === 0;
}

/**
 * Extract high-level findings from the audit entry bodies.
 * Entries with action "screening_completed" carry findings in body.findings;
 * all others are surfaced as a plain audit event.
 */
function extractFindings(entries: AuditEntry[]): Finding[] {
  const findings: Finding[] = [];
  for (const e of entries) {
    if (
      e.action === "screening_completed" &&
      Array.isArray(e.body["findings"])
    ) {
      for (const f of e.body["findings"] as Finding[]) {
        findings.push(f);
      }
    }
  }
  return findings;
}

/**
 * Build a faculty-labelled chain from audit entries — one step per entry,
 * providing a human-readable audit trail for the BrainVerdict envelope.
 */
function buildFacultyLabelledChain(entries: AuditEntry[]): ChainStep[] {
  return entries.map((e, i) => ({
    step: i + 1,
    label: actionLabel(e.action),
    actor: e.actor.name ? `${e.actor.name} (${e.actor.role})` : e.actor.role,
    at: e.at,
    outcome: String(e.body["outcome"] ?? e.action),
  }));
}

function actionLabel(action: string): string {
  const labels: Record<string, string> = {
    clear:               "Case Cleared",
    escalate:            "Case Escalated",
    str_read:            "STR Reviewed",
    str:                 "STR Filed",
    freeze:              "Account Frozen",
    dispose:             "Case Disposed",
    goaml_submit:        "goAML Submission",
    subject_added:       "Subject Added",
    subject_removed:     "Subject Removed",
    screening_completed: "Screening Completed",
    ongoing_enrolled:    "Ongoing Monitoring Enrolled",
  };
  return labels[action] ?? action;
}

/**
 * Derive recommended actions from the audit trail.
 * Uses the most recent escalation / clearing action to produce guidance.
 */
function deriveRecommendedActions(entries: AuditEntry[]): string[] {
  const actions: string[] = [];
  const lastEntry = entries.at(-1);
  if (!lastEntry) return actions;

  switch (lastEntry.action) {
    case "escalate":
      actions.push("Review escalated case within 24 hours per AML policy.");
      actions.push("Prepare STR if grounds are confirmed by MLRO.");
      break;
    case "str":
      actions.push("Monitor subject for ongoing transaction anomalies.");
      actions.push("Ensure goAML submission within the statutory deadline.");
      break;
    case "freeze":
      actions.push("Notify compliance officer of account freeze.");
      actions.push("Schedule 5-day review for freeze continuation or release.");
      break;
    case "clear":
      actions.push("Document clearing rationale and retain for 10 years per FDL 10/2025 Art.24.");
      break;
    case "screening_completed":
      actions.push("Verify findings against watchlist sources.");
      actions.push("Escalate if any high-risk hits require MLRO review.");
      break;
    default:
      actions.push("Review audit trail and confirm all actions are properly authorised.");
  }
  return actions;
}

/**
 * Build a cognitive depth sidecar — metadata about the chain's integrity
 * and coverage useful for MLRO oversight dashboards.
 */
function buildCognitiveDepthSidecar(
  entries: AuditEntry[],
  screeningId: string,
  allValid: boolean,
): Record<string, unknown> {
  const roles = new Set(entries.map((e) => e.actor.role));
  const actions = entries.map((e) => e.action);
  const hasFourEyes =
    roles.has("analyst") &&
    (roles.has("co") || roles.has("mlro") || roles.has("managing_director"));

  return {
    screening_id: screeningId,
    chain_length: entries.length,
    all_signatures_valid: allValid,
    four_eyes_satisfied: hasFourEyes,
    actor_roles: Array.from(roles),
    actions_taken: actions,
    first_action_at: entries[0]?.at ?? null,
    last_action_at: entries.at(-1)?.at ?? null,
    retention_deadline: entries[0]
      ? new Date(
          Date.parse(entries[0].at) + 10 * 365.25 * 24 * 60 * 60 * 1000,
        ).toISOString()
      : null,
  };
}

// ─── GET handler ─────────────────────────────────────────────────────────────

async function handleGet(req: Request): Promise<NextResponse> {
  const _handlerStart = Date.now();
  try {
  const gate = await enforce(req);
  if (!gate.ok) return gate.response;
  const gateHeaders = gate.headers;

  const url = new URL(req.url);
  const screeningId = url.searchParams.get("screeningId");
  const format = url.searchParams.get("format") ?? "json";

  // ── Step 8: no screeningId → return 10 most recent trails ────────────────
  if (!screeningId) {
    const secret = process.env["AUDIT_CHAIN_SECRET"];

    // Fetch only the last 50 entries in parallel — avoids a sequential full-
    // chain read that would time-out on large audit logs (FIX C-02).
    const entries = await loadAllEntries(50);
    const recent = entries.slice(-10).reverse(); // last 10, most recent first

    // Verify AUDIT_CHAIN_SECRET wiring
    const secretPresent = Boolean(secret);
    const validationResults = secret
      ? recent.map((e) => ({
          sequence: e.sequence,
          id: e.id,
          at: e.at,
          valid: verifyEntrySignature(e, secret),
        }))
      : recent.map((e) => ({ sequence: e.sequence, id: e.id, at: e.at, valid: null, note: "AUDIT_CHAIN_SECRET not configured" }));

    const allValid = secret ? validationResults.every((r) => r.valid === true) : false;
    const invalidCount = validationResults.filter((r) => r.valid === false).length;

    if (format === "pdf") {
      return NextResponse.json(
        {
          ok: false,
          error: "PDF export is not yet implemented. Use format=json to retrieve the full audit chain.",
          totalEntries: entries.length,
        },
        { status: 501, headers: gateHeaders },
      );
    }

    const latencyMs = Date.now() - _handlerStart;
    if (latencyMs > 5000) console.warn(`[audit/view] latencyMs=${latencyMs} exceeds 5000ms`);

    return NextResponse.json(
      {
        ok: true,
        mode: "recent",
        note: "No screeningId provided — returning 10 most recent audit trails",
        allSignaturesValid: allValid,
        auditChainSecretConfigured: secretPresent,
        invalidCount,
        totalEntries: entries.length,
        recentCount: recent.length,
        validationResults,
        entries: recent,
        exportedAt: new Date().toISOString(),
        format,
        latencyMs,
      },
      { headers: gateHeaders },
    );
  }

  // ── Per-screening-ID view path ────────────────────────────────────────────
  const secret = process.env["AUDIT_CHAIN_SECRET"];

  const allEntries = await loadAllEntries();
  // Filter to entries whose `target` matches the requested screening ID.
  const entries = allEntries.filter((e) => e.target === screeningId);

  if (entries.length === 0) {
    return NextResponse.json(
      {
        ok: false,
        error: `No audit entries found for screeningId '${screeningId}'.`,
        screeningId,
      },
      { status: 404, headers: gateHeaders },
    );
  }

  // Compute HMAC over the filtered entry chain for the envelope.
  let hmacSignature = "";
  let allSigsValid = false;
  if (secret) {
    const sigValid = entries.map((e) => verifyEntrySignature(e, secret));
    allSigsValid = sigValid.every(Boolean);
    // Chain HMAC: sign the concatenation of all entry IDs in sequence order.
    const chainData = entries.map((e) => e.id).join(":");
    hmacSignature = createHmac("sha256", secret).update(chainData).digest("hex");
  }

  const findings = extractFindings(entries);
  const facultyLabelledChain = buildFacultyLabelledChain(entries);
  const recommendedActions = deriveRecommendedActions(entries);
  const cognitiveDepthSidecar = buildCognitiveDepthSidecar(
    entries,
    screeningId,
    allSigsValid,
  );

  if (format === "jsonpdf") {
    // jsonpdf: return the full JSON envelope with a hint that the client
    // should render it as a PDF. The actual PDF rendering is handled
    // client-side (or by a separate PDF generation service).
    return NextResponse.json(
      {
        ok: true,
        _format: "jsonpdf",
        screeningId,
        entries,
        findings,
        faculty_labelled_chain: facultyLabelledChain,
        recommended_actions: recommendedActions,
        cognitive_depth_sidecar: cognitiveDepthSidecar,
        hmac_signature: hmacSignature,
        all_signatures_valid: allSigsValid,
        generatedAt: new Date().toISOString(),
      } satisfies BrainVerdictEnvelope & {
        _format: string;
        all_signatures_valid: boolean;
        generatedAt: string;
      },
      { headers: gateHeaders },
    );
  }

  const envelope: BrainVerdictEnvelope = {
    ok: true,
    screeningId,
    entries,
    findings,
    faculty_labelled_chain: facultyLabelledChain,
    recommended_actions: recommendedActions,
    cognitive_depth_sidecar: cognitiveDepthSidecar,
    hmac_signature: hmacSignature,
  };

  const latencyMs = Date.now() - _handlerStart;
  if (latencyMs > 5000) console.warn(`[audit/view] latencyMs=${latencyMs} exceeds 5000ms`);
  return NextResponse.json({ ...envelope, latencyMs }, { headers: gateHeaders });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({
      ok: false,
      errorCode: "HANDLER_EXCEPTION",
      errorType: "internal",
      tool: "audit_trail",
      message,
      retryAfterSeconds: null,
      requestId: Math.random().toString(36).slice(2, 10),
      latencyMs: Date.now() - _handlerStart,
    }, { status: 500 , headers: {} });
  }
}

// ─── POST handler — HMAC signature verification ──────────────────────────────

interface VerifyBody {
  /** The chain HMAC to verify (as returned in the view response). */
  hmac_signature: string;
  /** The ordered list of entry IDs that were used to produce the signature. */
  entry_ids: string[];
}

async function handlePost(req: Request): Promise<NextResponse> {
  const gate = await enforce(req);
  if (!gate.ok) return gate.response;
  const gateHeaders = gate.headers;

  const secret = process.env["AUDIT_CHAIN_SECRET"];
  if (!secret) {
    return NextResponse.json(
      {
        ok: false,
        error:
          "AUDIT_CHAIN_SECRET not configured — HMAC verification unavailable.",
      },
      { status: 503, headers: gateHeaders },
    );
  }

  let body: VerifyBody;
  try {
    body = (await req.json()) as VerifyBody;
  } catch {
    return NextResponse.json(
      { ok: false, error: "invalid JSON body" },
      { status: 400, headers: gateHeaders },
    );
  }

  if (
    !body?.hmac_signature ||
    !Array.isArray(body?.entry_ids) ||
    body.entry_ids.length === 0
  ) {
    return NextResponse.json(
      {
        ok: false,
        error: "hmac_signature (string) and entry_ids (non-empty array) are required",
      },
      { status: 400, headers: gateHeaders },
    );
  }

  // Recompute the chain HMAC from the supplied entry_ids.
  const chainData = body.entry_ids.join(":");
  const expected = createHmac("sha256", secret).update(chainData).digest("hex");

  // Constant-time comparison.
  const supplied = body.hmac_signature;
  let valid = false;
  if (expected.length === supplied.length) {
    let diff = 0;
    for (let i = 0; i < expected.length; i++) {
      diff |= expected.charCodeAt(i) ^ supplied.charCodeAt(i);
    }
    valid = diff === 0;
  }

  // Optionally cross-check each entry_id against the store so the caller
  // knows whether the referenced entries actually exist.
  const allEntries = await loadAllEntries();
  const storedIds = new Set(allEntries.map((e) => e.id));
  const unknownIds = body.entry_ids.filter((id) => !storedIds.has(id));

  return NextResponse.json(
    {
      ok: true,
      valid,
      entry_count: body.entry_ids.length,
      unknown_entry_ids: unknownIds,
      all_entries_found: unknownIds.length === 0,
      verifiedAt: new Date().toISOString(),
    },
    { headers: gateHeaders },
  );
}

// ─── Route exports ────────────────────────────────────────────────────────────

export const GET = handleGet;
export const POST = handlePost;
