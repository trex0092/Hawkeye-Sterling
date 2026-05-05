import { NextResponse } from "next/server";
import { enforce } from "@/lib/server/enforce";
import {
  runReasoning,
  generateCounterfactuals,
  generateSteelman,
  generateModeCoverage,
  generateNarrative,
  type ReasonInput,
} from "./_helpers";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function POST(req: Request): Promise<NextResponse> {
  const gate = await enforce(req);
  if (!gate.ok && gate.response.status === 429) return gate.response;
  const gateHeaders: Record<string, string> = gate.ok ? gate.headers : {};

  let body: ReasonInput;
  try {
    body = (await req.json()) as ReasonInput;
  } catch {
    return NextResponse.json(
      { ok: false, error: "invalid JSON" },
      { status: 400, headers: gateHeaders },
    );
  }
  if (!body?.subject?.name || body.subject.name.length > 500) {
    return NextResponse.json(
      { ok: false, error: "subject.name required (max 500 chars)" },
      { status: 400, headers: gateHeaders },
    );
  }

  try {
    // Live reasoning trace + the four "weaponize more" artefacts. The
    // counterfactual pass runs the full pipeline three more times against
    // perturbed inputs; total budget remains within maxDuration because each
    // re-run is purely in-process (no external fetches).
    const baseline = await runReasoning(body);
    const counterfactuals = await generateCounterfactuals(body, baseline);
    const steelman = generateSteelman(baseline);
    const modeCoverage = generateModeCoverage(baseline.firedModeIds);
    const narrative = generateNarrative(body, baseline);

    return NextResponse.json(
      {
        ok: true,
        ...baseline,
        counterfactuals,
        steelman,
        modeCoverage,
        narrative,
      },
      { headers: gateHeaders },
    );
  } catch (err) {
    // Reasoning pipeline crashed. Return degraded:true with a score that
    // unambiguously triggers REVIEW_REQUIRED (≥60) in every downstream consumer.
    // Score 50 was previously ambiguous — some dispositions mapped it to
    // PROCEED_STANDARD, letting a subject pass on a crashed analysis.
    const detail = err instanceof Error ? err.message.slice(0, 200) : String(err);
    console.error("[weaponized-brain/reason] Pipeline crashed:", detail);
    return NextResponse.json(
      {
        ok: true,
        degraded: true,
        degradedReason: detail,
        subject: body.subject,
        severity: "high",
        // Score 75 → unambiguous REVIEW_REQUIRED in all disposition maps.
        // MLRO must manually clear before any onboarding decision.
        score: 75,
        composite: { score: 75, breakdown: {} },
        verdict: "REVIEW_REQUIRED",
        disposition: {
          code: "REVIEW_REQUIRED",
          label: "Manual review required",
          rationale: "Weaponized brain reasoning unavailable — scoring engine crashed. MLRO must manually clear before any onboarding or clearance decision. Do not treat as CLEAR.",
        },
        narrative: "⚠ Weaponized brain reasoning temporarily unavailable. Manual compliance review required under UAE FDL 20/2018 Art.14 and FDL 10/2025 Art.19. Do not onboard or clear this subject without MLRO sign-off.",
        counterfactuals: [],
        steelman: { argument: "Manual review required — engine unavailable", confidence: 0 },
        modeCoverage: [],
        firedModeIds: [],
      },
      { status: 200, headers: gateHeaders },
    );
  }
}
