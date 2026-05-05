// Hawkeye Sterling — counterfactual analysis (leave-one-out).
//
// Re-runs the consensus calculation N times, each time excluding one
// source. If removing any single source flips the rating bucket
// (CLEAR ↔ POSSIBLE ↔ POSITIVE), that source is "decisive evidence"
// — we surface it explicitly so the operator knows their conclusion
// hinges on a single feed.
//
// This is the explainable-AI capability World Check / Dow Jones don't
// expose: their score is a black box. Ours is auditable down to "if
// we'd removed Reuters this case would be CLEAR; if we'd removed
// OpenSanctions it'd still be POSITIVE — so OpenSanctions is decisive."

import { multiSourceConsensus, type ConsensusInput, type ConsensusOutput } from "./screeningReasoning";

export interface CounterfactualResult {
  baseline: ConsensusOutput;
  baselineBucket: "clear" | "possible" | "positive";
  decisiveSources: Array<{
    source: string;
    counterfactualScore: number;
    counterfactualBucket: "clear" | "possible" | "positive";
    deltaScore: number;
    flipsRating: boolean;
  }>;
  robustSources: number;            // count of sources whose removal doesn't flip
  fragility: "robust" | "moderate" | "fragile";
  signal: string;
}

function bucketize(unified: number): "clear" | "possible" | "positive" {
  if (unified >= 60) return "positive";
  if (unified >= 25) return "possible";
  return "clear";
}

export function counterfactualAnalysis(inputs: ConsensusInput[]): CounterfactualResult {
  if (inputs.length === 0) {
    const baseline = multiSourceConsensus([]);
    return {
      baseline,
      baselineBucket: "clear",
      decisiveSources: [],
      robustSources: 0,
      fragility: "robust",
      signal: "No evidence to perform counterfactual analysis.",
    };
  }

  const baseline = multiSourceConsensus(inputs);
  const baselineBucket = bucketize(baseline.unified);

  const decisive: CounterfactualResult["decisiveSources"] = [];
  let robust = 0;

  // Group by source so removing one source removes ALL its contributions
  // (e.g. multiple GDELT articles count as one source for the leave-one-out)
  const sources = Array.from(new Set(inputs.map((i) => i.source)));

  for (const src of sources) {
    const without = inputs.filter((i) => i.source !== src);
    const cf = multiSourceConsensus(without);
    const cfBucket = bucketize(cf.unified);
    const flips = cfBucket !== baselineBucket;
    const delta = cf.unified - baseline.unified;

    if (flips || Math.abs(delta) >= 15) {
      decisive.push({
        source: src,
        counterfactualScore: cf.unified,
        counterfactualBucket: cfBucket,
        deltaScore: delta,
        flipsRating: flips,
      });
    } else {
      robust++;
    }
  }

  // Sort decisive by absolute delta, descending
  decisive.sort((a, b) => Math.abs(b.deltaScore) - Math.abs(a.deltaScore));

  let fragility: CounterfactualResult["fragility"];
  const flipping = decisive.filter((d) => d.flipsRating).length;
  if (flipping >= 2) fragility = "fragile";
  else if (flipping === 1 || decisive.length >= 3) fragility = "moderate";
  else fragility = "robust";

  let signal: string;
  if (flipping === 0 && decisive.length === 0) {
    signal = `Robust: removing any single source does not flip the rating. ${sources.length} source(s) corroborate.`;
  } else if (flipping === 1) {
    const d = decisive.find((x) => x.flipsRating)!;
    signal = `Single point of failure: removing "${d.source}" flips rating from ${baselineBucket.toUpperCase()} → ${d.counterfactualBucket.toUpperCase()}. Verify this source independently.`;
  } else if (flipping >= 2) {
    signal = `Fragile: ${flipping} source(s) each individually decisive. Rating depends on consensus of multiple feeds — re-screen if any feed lags.`;
  } else {
    signal = `Stable rating with ${decisive.length} influential source(s); none individually flip the bucket.`;
  }

  return {
    baseline,
    baselineBucket,
    decisiveSources: decisive,
    robustSources: robust,
    fragility,
    signal,
  };
}
