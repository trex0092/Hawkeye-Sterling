// Hawkeye Sterling — server-side intelligence pipeline.
//
// One-call orchestrator that runs the new pure-function intelligence
// modules against a super-brain payload and returns a unified
// `intelligence` object. The super-brain route attaches this to every
// response so the panel + report consume the same enriched output.

import {
  euEighthPackage, ukSamlaEvasion, russiaOilPriceCap, dprkOverseasLabour,
  iranNuclearProcurement, syriaReconstruction, cubaCacr, comprehensiveRegions,
  belarusDualUseExport, venezuelaOil, type StressTestResult,
} from "@/lib/intelligence/sanctionsStressTests";
import { detectSubnationalRegion } from "@/lib/intelligence/subnationalSanctions";
import { multiPhonetic } from "@/lib/intelligence/phoneticEngines";
import { parseName, canonicalKey } from "@/lib/intelligence/culturalNames";
import { jurisdictionRisk } from "@/lib/intelligence/geographicRisk";
import { industryRisk, inferIndustrySegment } from "@/lib/intelligence/industryRisk";

export interface IntelligenceInputs {
  subjectName: string;
  aliases?: string[];
  entityType?: "individual" | "organisation" | "vessel" | "aircraft" | "other";
  jurisdictionIso2?: string | null;
  registeredAddress?: string | null;
  industryHints?: string[];
  /** Optional transactional context for stress tests. */
  counterpartyIso2?: string | null;
  goodsHsCode?: string | null;
  vesselFlag?: string | null;
  amountUsd?: number | null;
  oilPriceUsd?: number | null;
}

export interface IntelligenceOutput {
  /** Multi-engine phonetic fingerprint (Caverphone, Beider-Morse-lite, Arabic, Pinyin). */
  phonetic: ReturnType<typeof multiPhonetic>;
  /** Canonical-key parsed name (Arabic / Chinese / Spanish / Russian / Western). */
  parsedName: ReturnType<typeof parseName>;
  /** Cross-cultural canonical key for matching. */
  canonicalKey: string;
  /** Sub-national region match (Crimea / DPR / LPR / Zaporizhzhia / Kherson / etc.). */
  subnational: ReturnType<typeof detectSubnationalRegion>;
  /** Geographic risk for the declared jurisdiction. */
  geography: ReturnType<typeof jurisdictionRisk>;
  /** Industry sector inherent risk. */
  industry: ReturnType<typeof industryRisk>;
  /** Detected industry segment from name + aliases. */
  inferredSegment: string;
  /** All sanctions stress tests fired against the supplied context. */
  stressTests: StressTestResult[];
  /** Number of stress tests that fired. */
  stressTestsFiredCount: number;
}

export function runIntelligencePipeline(input: IntelligenceInputs): IntelligenceOutput {
  const phonetic = multiPhonetic(input.subjectName);
  const parsed = parseName(input.subjectName);
  const segment = inferIndustrySegment(input.subjectName, input.aliases ?? []);

  const ctx = {
    subjectIso2: input.jurisdictionIso2 ?? undefined,
    counterpartyIso2: input.counterpartyIso2 ?? undefined,
    industry: segment as string,
    goodsHsCode: input.goodsHsCode ?? undefined,
    vesselFlag: input.vesselFlag ?? undefined,
    amountUsd: input.amountUsd ?? undefined,
    oilProductBarrelPriceUsd: input.oilPriceUsd ?? undefined,
  };

  const stressTests: StressTestResult[] = [
    euEighthPackage(ctx),
    ukSamlaEvasion(ctx),
    russiaOilPriceCap(ctx),
    dprkOverseasLabour(ctx),
    iranNuclearProcurement(ctx),
    syriaReconstruction(ctx),
    cubaCacr(ctx),
    comprehensiveRegions(input.registeredAddress ?? null),
    belarusDualUseExport(ctx),
    venezuelaOil(ctx),
  ];

  return {
    phonetic,
    parsedName: parsed,
    canonicalKey: canonicalKey(parsed),
    subnational: detectSubnationalRegion(input.registeredAddress ?? null),
    geography: jurisdictionRisk(input.jurisdictionIso2 ?? null),
    industry: industryRisk(segment),
    inferredSegment: segment,
    stressTests,
    stressTestsFiredCount: stressTests.filter((s) => s.fired).length,
  };
}
