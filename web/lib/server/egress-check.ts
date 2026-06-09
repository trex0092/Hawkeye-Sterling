// Hawkeye Sterling — egress gate compliance pre-check.
//
// Every production path that delivers an AI-generated artefact to an external
// system (Asana MLRO inbox, goAML FIU submission) must pass through this
// gate before the side-effect executes. Gate is OFF by default; set
// EGRESS_GATE_ENABLED=true in Netlify env after MLRO confirms mandate
// (Federal Decree-Law No. 10 of 2025 Art.16; UAE charter P3).
//
// When enabled the gate calls Claude Haiku for a fast tipping-off +
// mandatory-sections pre-check. If the verdict is anything other than
// "approved" the artefact is held and a structured hold response is returned
// so the MLRO can disposition it.
//
// When disabled (default) the function returns { allowed: true } immediately
// with zero added latency or cost.

import { getAnthropicClient } from "@/lib/server/llm";
import { startSpan, SpanStatus } from "@/lib/server/tracer";
import { incrementCounter } from "@/lib/server/metrics-store";
import { emitAndLog } from "../../../src/integrations/webhook-emitter";

export type EgressVerdict = "approved" | "held_tipping_off" | "held_incomplete" | "held_review";

export interface EgressCheckResult {
  allowed: boolean;
  verdict: EgressVerdict;
  reason?: string;
}

// Tipping-off patterns: phrases that could alert a subject that an STR/SAR
// has been filed about them. Under UAE Federal Decree-Law No. 10 of 2025 Art.17 and FATF R.21
// disclosing that a suspicious transaction report has been filed (or is
// about to be filed) to the subject or their associates is a criminal offence.
const TIPPING_OFF_PATTERNS = [
  /\bsuspicious\s+(transaction|activity)\s+report\b/i,
  /\bsuspicious\s+(transaction|activity)\b.*\bfil(ed|ing)\b/i,
  /\bSTR\b.*\bfil(ed|ing)\b/i,
  /\bSAR\b.*\bfil(ed|ing)\b/i,
  /\bgoAML\b.*\bsubmit/i,
  /\bFIU\b.*\bsubmit/i,
  /\bsubmit.{0,40}\b(?:FIU|financial\s+intelligence\s+unit)\b/i,
  /\breport(ed|ing)\s+(you|your|them|the\s+subject)\b/i,
  /\bnotif(y|ied|ying)\s+(the\s+)?(?:subject|client|customer)\b/i,
  /\balert(ed|ing)\s+(the\s+)?(?:subject|client|customer)\b/i,
];

function hasTippingOff(narrative: string): boolean {
  return TIPPING_OFF_PATTERNS.some((re) => re.test(narrative));
}

async function llmEgressCheck(narrative: string, reportType: string): Promise<EgressCheckResult> {
  const apiKey = process.env["ANTHROPIC_API_KEY"];
  if (!apiKey) {
    // FAIL CLOSED: gate is enabled but no API key — hold the artefact for
    // manual MLRO review rather than silently approving it. This is a
    // configuration error (Federal Decree-Law No. 10 of 2025 Art.17 tipping-off is criminal);
    // never disable the gate implicitly due to infrastructure misconfiguration.
    console.error("[egress-check] EGRESS_GATE_ENABLED=true but ANTHROPIC_API_KEY absent — holding artefact for manual MLRO review");
    return {
      allowed: false,
      verdict: "held_review",
      reason: "Egress gate misconfigured: ANTHROPIC_API_KEY absent. Artefact held for manual MLRO review before delivery (Federal Decree-Law No. 10 of 2025 Art.17).",
    };
  }

  const client = getAnthropicClient(apiKey, 30_000, "egress-check");

  // F-29 fix: for long narratives, pass head + tail to the LLM so tipping-off
  // phrases are not missed because they appear after the 3000-char truncation
  // boundary. Regex hasTippingOff() already scans the full text (called above
  // in runEgressCheck); the LLM now also sees both ends.
  const LLM_WINDOW = 1500;
  const narrativeForLlm = narrative.length > LLM_WINDOW * 2
    ? narrative.slice(0, LLM_WINDOW) + "\n...[middle truncated]...\n" + narrative.slice(-LLM_WINDOW)
    : narrative;

  if (narrative.length > LLM_WINDOW * 2) {
    console.warn(`[egress-check] narrative (${narrative.length} chars) sent as head+tail to LLM for '${reportType}'`);
    incrementCounter('hawkeye_egress_narrative_truncated_total', 1, { reportType });
  }

  let response: Awaited<ReturnType<typeof client.messages.create>>;
  try {
    response = await client.messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 200,
      system:
        "You are a compliance pre-check agent for a regulated UAE DNFBP. " +
        "Your job is to review outbound artefacts before they reach the MLRO inbox. " +
        "Return ONLY a JSON object: { \"verdict\": \"approved\"|\"held_tipping_off\"|\"held_incomplete\"|\"held_review\", \"reason\": \"<one sentence>\" }",
      messages: [
        {
          role: "user",
          content:
            `Report type: ${reportType}\n\n` +
            `Narrative:\n${narrativeForLlm}\n\n` +
            "Check: (1) Does this narrative contain any language that could tip off the subject that a report is being filed? " +
            "(2) Are there any blank or placeholder sections that should be completed before filing? " +
            "Return the JSON verdict.",
        },
      ],
    });
  } catch (err) {
    // FAIL CLOSED on LLM error — hold for manual MLRO review rather than
    // silently approving. Tipping-off (Federal Decree-Law No. 10 of 2025 Art.17) is criminal;
    // infrastructure failures must not disable the compliance gate.
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[egress-check] LLM call failed — holding artefact for manual MLRO review:", msg);
    incrementCounter('hawkeye_egress_gate_failures_total', 1, { reason: 'llm_error' });
    void emitAndLog('alert_egress_gate_failure', {
      event: 'egress_gate_llm_failure',
      reportType,
      error: msg,
      severity: 'critical',
      at: new Date().toISOString(),
    }).catch(() => { incrementCounter('hawkeye_webhook_emit_errors_total', 1, { context: 'egress-check' }); });
    return {
      allowed: false,
      verdict: "held_review",
      reason: `Egress gate LLM check failed (${msg}). Artefact held for manual MLRO review (Federal Decree-Law No. 10 of 2025 Art.17).`,
    };
  }

  const raw = response.content[0]?.type === "text" ? response.content[0].text : "";
  try {
    const parsed = JSON.parse(raw.replace(/^```json\s*/i, "").replace(/```$/i, "").trim()) as {
      verdict?: string;
      reason?: string;
    };
    const VALID_VERDICTS: ReadonlySet<EgressVerdict> = new Set([
      "approved", "held_tipping_off", "held_incomplete", "held_review",
    ]);
    const rawVerdict = parsed.verdict ?? "held_review";
    if (rawVerdict !== "held_review" && !VALID_VERDICTS.has(rawVerdict as EgressVerdict)) {
      // M-4: Log unexpected verdicts before coercing so hallucination patterns are visible.
      console.warn(`[egress-check] unexpected LLM verdict '${rawVerdict}' for ${reportType} — coercing to held_review`);
      incrementCounter('hawkeye_egress_unexpected_verdict_total', 1, { reportType });
    }
    const verdict: EgressVerdict = VALID_VERDICTS.has(rawVerdict as EgressVerdict)
      ? (rawVerdict as EgressVerdict)
      : "held_review";
    const allowed = verdict === "approved";
    return { allowed, verdict, reason: parsed.reason };
  } catch {
    // FAIL CLOSED on parse error — same rationale as LLM failure above.
    console.warn("[egress-check] could not parse LLM response — holding artefact for manual MLRO review:", raw.slice(0, 200));
    incrementCounter('hawkeye_egress_gate_failures_total', 1, { reason: 'parse_error' });
    void emitAndLog('alert_egress_gate_failure', {
      event: 'egress_gate_parse_failure',
      reportType,
      rawSnippet: raw.slice(0, 200),
      severity: 'high',
      at: new Date().toISOString(),
    }).catch(() => { incrementCounter('hawkeye_webhook_emit_errors_total', 1, { context: 'egress-check' }); });
    return {
      allowed: false,
      verdict: "held_review",
      reason: "Egress gate response unparseable. Artefact held for manual MLRO review (Federal Decree-Law No. 10 of 2025 Art.17).",
    };
  }
}

/**
 * Run the egress compliance pre-check before delivering an artefact to Asana
 * or another external system.
 *
 * Returns `{ allowed: true }` immediately when `EGRESS_GATE_ENABLED` is not
 * set to "true". When enabled: first performs a fast regex tipping-off scan,
 * then calls Claude Haiku for a broader compliance review. Fails CLOSED on any
 * LLM error — artefact is held for manual MLRO review rather than auto-approved.
 * Tipping-off (Federal Decree-Law No. 10 of 2025 Art.17) is a criminal offence; infrastructure
 * failures must never silently disable this gate.
 *
 * @param narrative  The full text of the report / artefact being delivered.
 * @param reportType Human-readable type label (e.g. "STR filing", "Screening report").
 */
export async function runEgressCheck(
  narrative: string,
  reportType: string,
): Promise<EgressCheckResult> {
  const span = startSpan('egress-gate.check', { 'aml.report_type': reportType });
  try {
    // Gate is ON by default — fail-closed for criminal-liability tipping-off risk.
    // Set EGRESS_GATE_DISABLED=true (opt-out) ONLY with written MLRO waiver.
    // Previous opt-in design (EGRESS_GATE_ENABLED=true) meant a fresh deployment
    // ran without tipping-off checks, violating Federal Decree-Law No. 10 of 2025 Art.17 (F-02 fix).
    const gateDisabled = process.env["EGRESS_GATE_DISABLED"] === "true";
    if (gateDisabled) {
      span.setAttribute('egress.gate_enabled', false);
      // Alert monitoring when gate is explicitly disabled so ops can detect
      // deployments missing the MLRO waiver (Federal Decree-Law No. 10 of 2025 Art.17 is criminal).
      console.error("[egress-check] EGRESS_GATE_DISABLED=true — tipping-off checks are DISABLED. Written MLRO waiver required before deploying with this flag.");
      incrementCounter('hawkeye_egress_gate_disabled_total', 1, {});
      return { allowed: true, verdict: "approved" };
    }
    span.setAttribute('egress.gate_enabled', true);

    if (hasTippingOff(narrative)) {
      console.warn(`[egress-check] tipping-off pattern detected in ${reportType} — artefact held`);
      span.setAttribute('egress.verdict', 'held_tipping_off');
      span.setStatus({ code: SpanStatus.ERROR });
      return {
        allowed: false,
        verdict: "held_tipping_off",
        reason:
          "Narrative contains language that may constitute tipping-off under Federal Decree-Law No. 10 of 2025 Art.17. " +
          "Remove any references to the STR/SAR filing before delivery.",
      };
    }

    const result = await llmEgressCheck(narrative, reportType);
    span.setAttribute('egress.verdict', result.verdict);
    if (!result.allowed) span.setStatus({ code: SpanStatus.ERROR });
    return result;
  } catch (err) {
    span.setStatus({ code: SpanStatus.ERROR });
    span.recordException(err instanceof Error ? err : new Error(String(err)));
    throw err;
  } finally {
    span.end();
  }
}
