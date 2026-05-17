// Standardised API error and success response helpers.
//
// F-07: every MCP tool handler returns one of these two shapes:
//   success: { ok: true, tool, engineVersion, commitRef, generatedAt, latencyMs, ... }
//   error:   { ok: false, tool, errorCode, errorType, message, requestId, ... }
//
// F-08: commitRef and engineVersion are sourced from env vars at runtime.
//
// Phase 13 additions: Next.js route helpers for uniform HTTP error responses,
// 405 Method Not Allowed with Allow header, and OPTIONS preflight.

import { NextResponse } from "next/server";

export function httpError(
  message: string,
  status = 400,
  code?: string,
  extra?: Record<string, unknown>,
): NextResponse {
  return NextResponse.json(
    { ok: false, error: message, ...(code ? { code } : {}), ...extra },
    { status },
  );
}

export function methodNotAllowed(allowedMethods: string[]): NextResponse {
  return NextResponse.json(
    { ok: false, error: "Method not allowed", code: "METHOD_NOT_ALLOWED" },
    { status: 405, headers: { Allow: allowedMethods.join(", ") } },
  );
}

export function optionsResponse(allowedMethods: string[]): NextResponse {
  return new NextResponse(null, {
    status: 204,
    headers: {
      Allow: allowedMethods.join(", "),
      "Access-Control-Allow-Methods": allowedMethods.join(", "),
      "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Request-ID",
    },
  });
}

export type ErrorCode =
  | "LISTS_MISSING"
  | "HANDLER_EXCEPTION"
  | "AUTH_FAILURE"
  | "RATE_LIMIT"
  | "TIMEOUT"
  | "INVALID_INPUT"
  | "NOT_FOUND"
  | "UPSTREAM_UNAVAILABLE";

export type ErrorType = "data_integrity" | "internal" | "auth" | "rate_limit" | "timeout" | "validation" | "upstream";

export interface StandardError {
  ok: false;
  tool: string;
  errorCode: ErrorCode;
  errorType: ErrorType;
  message: string;
  requestId: string;
  retryAfterSeconds?: number;
}

export interface StandardSuccessMeta {
  tool: string;
  engineVersion: string;
  commitRef: string;
  generatedAt: string;
  latencyMs?: number;
}

// Resolve commitRef from build-time / runtime env vars.
// F-08: wire APP_VERSION and GIT_COMMIT_SHA from Netlify env vars.
// HAWKEYE_BUILD_COMMIT_REF is inlined by next.config.mjs at build time so
// the deployed SHA reaches serverless functions even when Netlify doesn't
// forward COMMIT_REF to the Lambda runtime (audit M-06).
export function resolveCommitRef(): string {
  return (
    process.env["HAWKEYE_BUILD_COMMIT_REF"] ??
    process.env["APP_VERSION"] ??
    process.env["GIT_COMMIT_SHA"] ??
    process.env["NEXT_PUBLIC_COMMIT_REF"] ??
    process.env["COMMIT_REF"] ??
    process.env["NETLIFY_COMMIT_REF"] ??
    process.env["NEXT_PUBLIC_VERCEL_GIT_COMMIT_SHA"] ??
    "dev"
  ).slice(0, 12);
}

export function resolveEngineVersion(): string {
  return process.env["APP_VERSION"] ?? process.env["BRAIN_VERSION"] ?? "wave-5";
}

export function makeError(
  tool: string,
  errorCode: ErrorCode,
  errorType: ErrorType,
  message: string,
  extra?: Record<string, unknown>,
): StandardError {
  return {
    ok: false,
    tool,
    errorCode,
    errorType,
    message,
    requestId: Math.random().toString(36).slice(2, 10),
    ...extra,
  };
}

export function makeSuccessMeta(tool: string, t0: number): StandardSuccessMeta {
  return {
    tool,
    engineVersion: resolveEngineVersion(),
    commitRef: resolveCommitRef(),
    generatedAt: new Date().toISOString(),
    latencyMs: Date.now() - t0,
  };
}
