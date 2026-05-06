"use client";

import { useEffect, useState } from "react";
import type { QuickScreenSubject, QuickScreenResult } from "@/lib/api/quickScreen.types";

export interface SuperBrainResult {
  screen: QuickScreenResult;
  pep: {
    role: string;
    tier: string;
    type: string;
    salience: number;
    matchedRule?: string;
    rationale?: string;
  } | null;
  adverseMedia: Array<{ categoryId: string; keyword: string; offset: number }>;
  esg: Array<{
    categoryId: string;
    domain: string;
    label: string;
    keyword: string;
    offset: number;
    sasb?: string;
    euTaxonomy?: string;
    sdg?: string[];
  }>;
  adverseKeywords: Array<{
    group: string;
    groupLabel: string;
    term: string;
    offset: number;
  }>;
  adverseKeywordGroups: Array<{ group: string; label: string; count: number }>;
  jurisdictionRich?: {
    code: string;
    name: string;
    tiers: string[];
    riskScore: number;
    notes: string[];
  } | null;
  typologies?: {
    hits: Array<{ id: string; name: string; family: string; weight: number; snippet?: string }>;
    compositeScore: number;
  };
  adverseMediaScored?: {
    byCategory: Record<string, number>;
    total: number;
    distinctKeywords: number;
    topKeywords: Array<{ keyword: string; categoryId: string; count: number }>;
    categoriesTripped: string[];
    compositeScore: number;
  } | null;
  pepAssessment?: {
    isLikelyPEP: boolean;
    highestTier: string;
    matchedRoles: Array<{ tier: string; label: string; snippet?: string }>;
    riskScore: number;
  } | null;
  stylometry?: {
    gaslightingScore?: number;
    [k: string]: unknown;
  } | null;
  jurisdiction: {
    iso2: string;
    name: string;
    region: string;
    cahra: boolean;
    regimes: string[];
  } | null;
  redlines: {
    fired: Array<{ id?: string; label?: string; why?: string }>;
    action: string | null;
    summary: string;
  };
  variants: {
    aliasExpansion: string[];
    nameVariants: string[];
    doubleMetaphone: string | [string, string] | { primary: string; alternate?: string };
    soundex: string;
  };
  composite: {
    score: number;
    breakdown: Record<string, number>;
  };
  // Audit trail — emitted by /api/super-brain alongside every result so
  // the compliance report can carry a defensible record of which run,
  // which weights, and which data sources produced the composite score.
  audit?: {
    runId: string;
    generatedAt: string;
    engineVersion?: string;
    schemaVersion?: string;
    buildSha?: string;
    dataFreshness: Record<string, string>;
    moduleWeights: Record<string, string | number>;
  };
  crossRegimeConflict?: {
    anyDesignated: boolean;
    unanimousDesignated: boolean;
    unanimousNotDesignated: boolean;
    split: boolean;
    mostRestrictive?: { regimeId: string; hit: string; asOf: string; sourceRef?: string; note?: string } | null;
    leastRestrictive?: { regimeId: string; hit: string; asOf: string; sourceRef?: string; note?: string } | null;
    conflicts: Array<{ regimeA: string; regimeB: string; detail: string; severity: "low" | "medium" | "high" }>;
    partialMatchRegimes: string[];
    unknownRegimes: string[];
    staleRegimes: string[];
    recommendedAction: "block" | "freeze" | "escalate" | "review" | "proceed_with_scope_declaration";
    rationale: string[];
  } | null;
  /** Live intelligence pipeline output — phonetic, cultural names,
   *  sub-national sanctions, geography + industry risk, sanctions
   *  stress tests. Populated by /api/super-brain on every screening. */
  intelligence?: {
    phonetic: { caverphone: string; beiderMorseLite: string; arabicPhonetic: string; pinyinCanonical: string };
    parsedName: { culture: string; given?: string; surname?: string; nasab?: string; kunya?: string; patronymic?: string; maternalSurname?: string; tokens: string[] };
    canonicalKey: string;
    subnational: { matched: boolean; region?: { iso2: string; region: string; regimes: string[] }; rationale: string };
    geography: { iso2: string; name: string; tiers: string[]; inherentRisk: number; activeRegimes: string[]; notes: string[] };
    industry: { segment: string; inherentRisk: number; label: string; rationale: string; typologyReferences: string[]; requiredEvidence: string[] };
    inferredSegment: string;
    stressTests: Array<{ regime: string; fired: boolean; severity: "critical" | "high" | "medium" | "low"; rationale: string; citation: string }>;
    stressTestsFiredCount: number;
  };
  /** Server-flagged module degradation list — surfaces silent failures. */
  degradation?: Array<{ module: string; reason: string }>;
}

export type SuperBrainState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "success"; result: SuperBrainResult }
  | { status: "error"; error: string };

// Client contract (matches quickScreen + the reference CLI spec):
//   - retry 5xx up to 3 times on a 750ms flat delay
//   - 15s per-request timeout
//   - Accept + User-Agent headers for parity with the server-side client
//   - non-JSON response bodies are caught and surfaced
//   - error copy is colon-free so it reads cleanly in the MLRO case file
const MAX_RETRIES = 3;
const RETRY_DELAY_MS = 750;
const REQUEST_TIMEOUT_MS = 15_000;

interface SuperBrainFetchOutcome {
  ok: boolean;
  result?: SuperBrainResult;
  error?: string;
  retryable?: boolean;
}

async function attemptSuperBrain(
  subject: QuickScreenSubject,
  opts: { roleText?: string; adverseMediaText?: string },
  externalSignal: AbortSignal,
): Promise<SuperBrainFetchOutcome> {
  const timeoutCtl = new AbortController();
  const timer = setTimeout(() => timeoutCtl.abort(), REQUEST_TIMEOUT_MS);
  const onAbort = (): void => timeoutCtl.abort();
  if (externalSignal.aborted) {
    clearTimeout(timer);
    return { ok: false, error: "aborted" };
  }
  externalSignal.addEventListener("abort", onAbort, { once: true });

  try {
    const r = await fetch("/api/super-brain", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        accept: "application/json",
        "user-agent": "hawkeye-screening-client/1.0",
      },
      body: JSON.stringify({ subject, ...opts }),
      signal: timeoutCtl.signal,
    });
    const raw = await r.text().catch(() => "");
    type ErrorBody = { ok: false; error?: string; detail?: string };
    type SuccessBody = { ok: true; [k: string]: unknown };
    let payload: SuccessBody | ErrorBody | null = null;
    if (raw) {
      try {
        payload = JSON.parse(raw) as SuccessBody | ErrorBody;
      } catch {
        /* non-JSON body — handled below */
      }
    }

    const errBody: ErrorBody | null =
      payload && payload.ok === false ? payload : null;

    if (r.status >= 500 && r.status <= 599) {
      // Log the raw upstream detail for ops; show the operator a clean
      // message so an MLRO case file never carries "Cannot find module
      // 'styled-jsx/style'" or other infrastructure stack traces.
      if (errBody?.detail || errBody?.error || raw) {
        console.warn(
          "super-brain 5xx",
          r.status,
          errBody?.detail || errBody?.error || raw.slice(0, 300),
        );
      }
      return {
        ok: false,
        retryable: true,
        error: "Super brain temporarily unavailable",
      };
    }

    if (r.status < 200 || r.status > 299) {
      // 4xx — the caller sent something we didn't like. We can safely
      // show our own validation message (errBody.error), but never the
      // upstream detail.
      const msg = errBody?.error ?? "Super brain request rejected";
      return { ok: false, error: msg };
    }

    if (!payload || payload.ok !== true) {
      return { ok: false, error: "Super brain returned no result" };
    }

    const { ok: _ok, ...rest } = payload;
    void _ok;
    return { ok: true, result: rest as unknown as SuperBrainResult };
  } catch (err) {
    if (externalSignal.aborted) return { ok: false, error: "aborted" };
    if (err instanceof Error && err.name === "AbortError") {
      return {
        ok: false,
        retryable: true,
        error: "Super brain request timed out",
      };
    }
    // Swallow internal network-error messages — operator just sees
    // "temporarily unavailable", ops sees the real error via console.
    console.warn("super-brain fetch failed", err);
    return {
      ok: false,
      retryable: true,
      error: "Super brain temporarily unavailable",
    };
  } finally {
    clearTimeout(timer);
    externalSignal.removeEventListener("abort", onAbort);
  }
}

export function useSuperBrain(
  subject: QuickScreenSubject | null,
  opts: { roleText?: string; adverseMediaText?: string } = {},
): SuperBrainState {
  const [state, setState] = useState<SuperBrainState>({ status: "idle" });
  const key = subject
    ? [subject.name, subject.jurisdiction ?? "", subject.entityType ?? "", opts.roleText ?? "", opts.adverseMediaText ?? ""].join("|")
    : "";

  useEffect(() => {
    if (!subject) {
      setState({ status: "idle" });
      return;
    }
    const ac = new AbortController();
    setState({ status: "loading" });

    (async (): Promise<void> => {
      let last: SuperBrainFetchOutcome | null = null;
      for (let attempt = 0; attempt <= MAX_RETRIES; attempt += 1) {
        last = await attemptSuperBrain(subject, opts, ac.signal);
        if (ac.signal.aborted) return;
        if (last.ok && last.result) {
          setState({ status: "success", result: last.result });
          return;
        }
        if (!last.retryable) break;
        if (attempt >= MAX_RETRIES) break;
        await new Promise((r) => setTimeout(r, RETRY_DELAY_MS));
        if (ac.signal.aborted) return;
      }
      if (ac.signal.aborted) return;
      setState({
        status: "error",
        error: last?.error ?? "Super brain unavailable",
      });
    })();

    return () => ac.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  return state;
}
