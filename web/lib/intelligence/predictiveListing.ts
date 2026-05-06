// Hawkeye Sterling — predictive-listing detector.
//
// Surfaces signals that a subject is LIKELY to be sanctions-listed in
// the near future, even if not yet on any official list. These are the
// patterns that historically preceded actual designations:
//
//   1. Multiple credible adverse-media articles in the past 30 days
//   2. Investigation / indictment / regulatory action coverage
//   3. Direct ties to already-designated entities
//   4. Sector + jurisdiction combination on FATF watch
//   5. Asset-freeze / civil-forfeiture proceedings reported

export interface PredictiveSignal {
  signal: string;
  weight: number;             // 0..1
  evidence?: string;
}

export interface PredictiveListingResult {
  likelihoodScore: number;          // 0..100
  band: "stable" | "watch" | "elevated" | "imminent";
  signals: PredictiveSignal[];
  recommendation: string;
}

interface PredictiveInputs {
  recentAmCount: number;             // articles in last 30 days
  baselineAmCount: number;           // articles in prior 11 months
  hasInvestigationCoverage: boolean;
  hasIndictmentCoverage: boolean;
  hasAssetFreezeCoverage: boolean;
  hasRegulatoryActionCoverage: boolean;
  ticksToDesignatedEntities: number; // co-occurrence count w/ sanctioned
  inHighRiskJurisdiction: boolean;
  inHighRiskSector: boolean;
  pepStatus: "none" | "domestic" | "foreign";
}

export function predictListingLikelihood(inp: PredictiveInputs): PredictiveListingResult {
  const signals: PredictiveSignal[] = [];

  // Velocity signal — recent coverage outpacing baseline
  if (inp.recentAmCount >= 3 && inp.recentAmCount >= 2 * Math.max(1, inp.baselineAmCount / 12)) {
    signals.push({
      signal: "Adverse-media velocity spike",
      weight: 0.20,
      evidence: `${inp.recentAmCount} articles in last 30d vs baseline ${(inp.baselineAmCount / 12).toFixed(1)}/month`,
    });
  }

  // Pre-listing typology signals
  if (inp.hasIndictmentCoverage) signals.push({ signal: "Indictment coverage", weight: 0.25, evidence: "Indictment / criminal-charge articles" });
  if (inp.hasAssetFreezeCoverage) signals.push({ signal: "Asset-freeze coverage", weight: 0.30, evidence: "Civil-forfeiture or asset-freeze proceedings reported" });
  if (inp.hasInvestigationCoverage) signals.push({ signal: "Investigation coverage", weight: 0.15, evidence: "Active investigation / probe" });
  if (inp.hasRegulatoryActionCoverage) signals.push({ signal: "Regulatory enforcement", weight: 0.20, evidence: "Regulator-issued enforcement / consent order" });

  if (inp.ticksToDesignatedEntities >= 3) {
    signals.push({
      signal: "Multiple ties to designated entities",
      weight: 0.20,
      evidence: `${inp.ticksToDesignatedEntities} co-occurrences with sanctioned counterparties`,
    });
  } else if (inp.ticksToDesignatedEntities >= 1) {
    signals.push({ signal: "Tied to designated entity", weight: 0.10 });
  }

  if (inp.inHighRiskJurisdiction && inp.inHighRiskSector) {
    signals.push({ signal: "High-risk jurisdiction × sector combo", weight: 0.10 });
  }
  if (inp.pepStatus === "foreign") signals.push({ signal: "Foreign PEP", weight: 0.05 });

  const raw = signals.reduce((s, x) => s + x.weight, 0);
  const likelihoodScore = Math.min(100, Math.round(raw * 100));

  let band: PredictiveListingResult["band"];
  if (likelihoodScore >= 75) band = "imminent";
  else if (likelihoodScore >= 50) band = "elevated";
  else if (likelihoodScore >= 25) band = "watch";
  else band = "stable";

  let recommendation: string;
  if (band === "imminent") {
    recommendation = "Pre-emptive EDD + freeze decision pending — treat as if already listed; document constructive-knowledge analysis.";
  } else if (band === "elevated") {
    recommendation = "Subject shows pre-listing signals; document monitoring cadence + accelerated CDD refresh.";
  } else if (band === "watch") {
    recommendation = "Place on watchlist; daily ongoing-monitoring cadence; review in 30 days.";
  } else {
    recommendation = "No pre-listing indicators; standard ongoing-monitoring applies.";
  }

  return { likelihoodScore, band, signals, recommendation };
}
