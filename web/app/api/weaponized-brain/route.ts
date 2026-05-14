import { NextResponse } from "next/server";
import { withGuard } from "@/lib/server/guard";
import {
  buildWeaponizedBrainManifest,
  weaponizedIntegrity,
} from "../../../../dist/src/brain/weaponized.js";
import * as brain from "../../../../dist/src/brain/index.js";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

// Derive "enhanced" metrics from the compiled brain — things the canonical
// weaponized manifest does not expose: extended catalogues, cross-references,
// and coverage ratios. Every value is read live from dist/, nothing invented.
function enhance() {
  const b = brain as Record<string, unknown>;
  const arr = (k: string): unknown[] =>
    Array.isArray(b[k]) ? (b[k] as unknown[]) : [];
  const len = (k: string): number => arr(k).length;

  const extended = {
    taxonomy: {
      questionTemplates: len("QUESTION_TEMPLATES"),
      sectorRubrics: len("SECTOR_RUBRICS"),
      scenarios: len("SCENARIOS"),
      typologies: len("TYPOLOGIES"),
      redFlags: len("RED_FLAGS"),
      redFlagsExtended: len("RED_FLAGS_EXTENDED"),
      adverseMediaCategories: len("ADVERSE_MEDIA_CATEGORIES"),
      metaCognition: len("META_COGNITION"),
    },
    regulatory: {
      fatfRecommendations: len("FATF_RECOMMENDATIONS"),
      sanctionRegimes: len("SANCTION_REGIMES"),
      dispositions: len("DISPOSITIONS"),
      redlines: len("REDLINES"),
      riskAppetite: len("RISK_APPETITE"),
      cahraSeed: len("CAHRA_SEED"),
      uaeFreeZones: len("UAE_FREE_ZONES"),
      jurisdictionsFull: len("JURISDICTIONS_FULL"),
      dpmsKpis: len("DPMS_KPIS"),
    },
    expertise: {
      skills: len("SKILLS"),
      cognitiveAmplifier: Object.keys(
        (b["COGNITIVE_AMPLIFIER"] as Record<string, unknown> | undefined) ?? {},
      ).length,
    },
  };

  // Cross-refs derived at runtime from the compiled catalogues.
  const typologies = arr("TYPOLOGIES") as Array<Record<string, unknown>>;
  const redFlags = arr("RED_FLAGS_EXTENDED") as Array<Record<string, unknown>>;
  const redFlagsByTypology = new Map<string, number>();
  for (const rf of redFlags) {
    const t = (rf["typology"] as string) ?? "unclassified";
    redFlagsByTypology.set(t, (redFlagsByTypology.get(t) ?? 0) + 1);
  }
  const jurisdictions = arr("JURISDICTIONS_FULL") as Array<{
    iso2?: string;
    name?: string;
    region?: string;
  }>;
  const regionCounts = new Map<string, number>();
  for (const j of jurisdictions) {
    if (!j.region) continue;
    regionCounts.set(j.region, (regionCounts.get(j.region) ?? 0) + 1);
  }

  return {
    extended,
    crossReferences: {
      redFlagsByTypology: Array.from(redFlagsByTypology.entries())
        .map(([typology, count]) => ({ typology, count }))
        .sort((a, b) => b.count - a.count)
        .slice(0, 20),
      jurisdictionsByRegion: Array.from(regionCounts.entries())
        .map(([region, count]) => ({ region, count }))
        .sort((a, b) => b.count - a.count),
      typologyCount: typologies.length,
      topTypologies: typologies
        .slice(0, 12)
        .map((t) => ({
          id: (t["id"] as string) ?? "",
          title: (t["title"] as string) ?? (t["name"] as string) ?? "",
        }))
        .filter((t) => t.id),
    },
    totals: {
      catalogues: 19,
      enhancedCatalogues:
        Object.values(extended.taxonomy).length +
        Object.values(extended.regulatory).length +
        Object.values(extended.expertise).length,
      regulatoryRecords:
        Object.values(extended.regulatory).reduce((a, b) => a + b, 0),
      taxonomyRecords:
        Object.values(extended.taxonomy).reduce((a, b) => a + b, 0),
      skillsRecords: extended.expertise.skills,
      totalRecords:
        Object.values(extended.regulatory).reduce((a, b) => a + b, 0) +
        Object.values(extended.taxonomy).reduce((a, b) => a + b, 0) +
        extended.expertise.skills,
    },
  };
}

async function handleWeaponizedBrain(): Promise<NextResponse> {
  try {
    const manifest = buildWeaponizedBrainManifest();
    const integrity = weaponizedIntegrity();
    const enhanced = enhance();
    return NextResponse.json({ ok: true, manifest, integrity, enhanced });
  } catch (err) {
    // Audit DR-03: returning 200 with `offline: true` buried the signal
    // inside the JSON body. Liveness probes that only inspect HTTP status
    // saw "healthy" while the brain was dead. Now: 503 + structured
    // payload so dashboards alarm on the infrastructure failure.
    const message = err instanceof Error ? err.message : String(err);
    console.error("[weaponized-brain]", message);
    return NextResponse.json({
      ok: false,
      offline: true,
      error: "weaponized-brain-unavailable",
      message,
      hint: "dist/ artefact not built or corrupted; check Netlify build logs",
    }, { status: 503 });
  }
}

export const GET = withGuard(handleWeaponizedBrain);
