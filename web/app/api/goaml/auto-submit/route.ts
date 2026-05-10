// POST /api/goaml/auto-submit
//
// goAML auto-submit (audit follow-up #53). Submits a generated STR /
// SAR / FFR XML envelope to the UAE FIU goAML endpoint with mandatory
// two-eyes confirmation: the request body must contain a confirmation
// signature signed by a SECOND authorised user (Charter P9 + Cabinet
// Resolution 134/2025 Art.19 four-eyes rule).
//
// Two-step flow:
//   1) STR is drafted via /api/sar-report (existing) or composed by
//      the MLRO. The draft + draftSha256 are presented to the
//      submitter for review.
//   2) Submitter approves; their HMAC over draftSha256 is the first
//      eyes. A second authoriser must independently approve;
//      confirmationSignature is the HMAC of the SAME draftSha256.
//   3) This route verifies BOTH signatures, then forwards the XML to
//      goAML. NEVER auto-submits without the second signature.
//
// Body:
//   {
//     xml: string,                 // the STR/SAR XML envelope
//     submitter: { id, signature },// HMAC-SHA256 of sha256(xml)
//     authoriser: { id, signature },// HMAC-SHA256 of sha256(xml)
//     mode?: 'dry-run' | 'live'    // dry-run skips the actual upstream POST
//   }
//
// Response:
//   { ok, submissionRef, draftSha256, twoEyesVerified, upstreamStatus, dryRun }

import { NextResponse } from "next/server";
import { enforce } from "@/lib/server/enforce";
import { createHash, createHmac, timingSafeEqual } from "node:crypto";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const GOAML_ENDPOINT_ENV = "GOAML_SUBMIT_URL";
const GOAML_API_KEY_ENV = "GOAML_API_KEY";
const SIGNING_SECRET_ENV = "GOAML_TWO_EYES_SECRET";

interface Body {
  xml: string;
  submitter: { id: string; signature: string };
  authoriser: { id: string; signature: string };
  mode?: "dry-run" | "live";
}

function expectedSignature(secret: string, payload: string): string {
  return `sha256=${createHmac("sha256", secret).update(payload).digest("hex")}`;
}

function safeEqual(a: string, b: string): boolean {
  const ba = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ba.length !== bb.length) return false;
  return timingSafeEqual(new Uint8Array(ba), new Uint8Array(bb));
}

async function handlePost(req: Request): Promise<NextResponse> {
  const gate = await enforce(req);
  if (!gate.ok) return gate.response;
  const gateHeaders: Record<string, string> = gate.ok ? gate.headers : {};

  const secret = process.env[SIGNING_SECRET_ENV];
  if (!secret) {
    return NextResponse.json(
      { ok: false, error: `${SIGNING_SECRET_ENV} not configured` },
      { status: 503, headers: gateHeaders },
    );
  }

  let body: Body;
  try {
    body = (await req.json()) as Body;
  } catch {
    return NextResponse.json({ ok: false, error: "invalid JSON" }, { status: 400, headers: gateHeaders });
  }

  if (!body?.xml || typeof body.xml !== "string" || body.xml.length === 0) {
    return NextResponse.json({ ok: false, error: "xml required" }, { status: 400, headers: gateHeaders });
  }
  if (!body.submitter?.id || !body.submitter.signature || !body.authoriser?.id || !body.authoriser.signature) {
    return NextResponse.json({ ok: false, error: "submitter + authoriser id+signature required" }, { status: 400, headers: gateHeaders });
  }
  if (body.submitter.id === body.authoriser.id) {
    return NextResponse.json({ ok: false, error: "submitter and authoriser must be distinct (Cabinet Res 134/2025 Art.19)" }, { status: 400, headers: gateHeaders });
  }

  // Guard: reject live submissions if any goamlRentityId is still the placeholder
  // value — submitting REPLACE_ME will be rejected by the UAE FIU goAML gateway.
  const entitiesEnv = process.env["HAWKEYE_ENTITIES"];
  if (entitiesEnv && body.mode === "live") {
    try {
      const entities = JSON.parse(entitiesEnv) as Array<{ goamlRentityId?: string }>;
      const hasPlaceholder = entities.some((e) => e.goamlRentityId === "REPLACE_ME");
      if (hasPlaceholder) {
        return NextResponse.json(
          { ok: false, error: "goamlRentityId not configured — replace REPLACE_ME with FIU-assigned entity IDs before live submission" },
          { status: 503, headers: gateHeaders },
        );
      }
    } catch {
      // Malformed HAWKEYE_ENTITIES is a configuration error — block live submission.
      return NextResponse.json(
        { ok: false, error: "HAWKEYE_ENTITIES is not valid JSON — live submission blocked" },
        { status: 503, headers: gateHeaders },
      );
    }
  }

  const draftSha256 = createHash("sha256").update(body.xml).digest("hex");
  const expected = expectedSignature(secret, draftSha256);

  const submitterValid = safeEqual(expected, body.submitter.signature);
  const authoriserValid = safeEqual(expected, body.authoriser.signature);
  const twoEyesVerified = submitterValid && authoriserValid;

  if (!twoEyesVerified) {
    return NextResponse.json(
      {
        ok: false,
        error: "two-eyes verification failed",
        submitterValid,
        authoriserValid,
        draftSha256,
      },
      { status: 401, headers: gateHeaders },
    );
  }

  const dryRun = body.mode !== "live";
  const submissionRef = `hsg-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;

  if (dryRun) {
    return NextResponse.json(
      {
        ok: true,
        submissionRef,
        draftSha256,
        twoEyesVerified,
        dryRun: true,
        upstreamStatus: "dry-run-skip",
        note: "Dry-run successful. To submit live, set body.mode='live' and ensure GOAML_SUBMIT_URL + GOAML_API_KEY are configured.",
      },
      { headers: gateHeaders },
    );
  }

  const endpoint = process.env[GOAML_ENDPOINT_ENV];
  const apiKey = process.env[GOAML_API_KEY_ENV];
  if (!endpoint || !apiKey) {
    return NextResponse.json(
      { ok: false, error: `${GOAML_ENDPOINT_ENV} or ${GOAML_API_KEY_ENV} not configured for live submit` },
      { status: 503, headers: gateHeaders },
    );
  }

  try {
    const upstream = await fetch(endpoint, {
      signal: AbortSignal.timeout(25_000),
      method: "POST",
      headers: {
        "content-type": "application/xml",
        authorization: `Bearer ${apiKey}`,
        "x-hawkeye-submission-ref": submissionRef,
        "x-hawkeye-two-eyes": "verified",
      },
      body: body.xml,
    });
    const upstreamText = await upstream.text();
    return NextResponse.json(
      {
        ok: upstream.ok,
        submissionRef,
        draftSha256,
        twoEyesVerified,
        dryRun: false,
        upstreamStatus: upstream.status,
        upstreamBody: upstreamText.slice(0, 2000),
      },
      { status: upstream.ok ? 200 : 502, headers: gateHeaders },
    );
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json(
      { ok: false, submissionRef, draftSha256, twoEyesVerified, error: `upstream fetch failed: ${msg}` },
      { status: 502, headers: gateHeaders },
    );
  }
}

export const POST = handlePost;
