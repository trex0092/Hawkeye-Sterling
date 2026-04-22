#!/usr/bin/env node
// Hawkeye Sterling — pre-render the weaponized brain manifest to a static
// JSON file the web app serves directly. Eliminates the cold-start path
// that was intermittently 500-ing on /api/weaponized-brain.
//
// Produces:
//   web/public/weaponized-brain.json
//
// Runs AFTER `npm run build` at root (tsc populates dist/ first).

const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const distBrain = path.join(root, "dist", "src", "brain");
const outDir = path.join(root, "web", "public");
const outPath = path.join(outDir, "weaponized-brain.json");

function safeRequire(modulePath, fallback = null) {
  try {
    return require(modulePath);
  } catch (err) {
    console.warn(`[gen-weaponized-brain] ${modulePath}: ${err.message}`);
    return fallback;
  }
}

function len(k, obj) {
  const v = obj[k];
  if (Array.isArray(v)) return v.length;
  if (v && typeof v === "object") return Object.keys(v).length;
  return 0;
}

(function main() {
  const weaponized = safeRequire(path.join(distBrain, "weaponized.js"));
  const index = safeRequire(path.join(distBrain, "index.js"), {});

  let manifest = null;
  let integrity = null;
  if (weaponized) {
    try {
      manifest = weaponized.buildWeaponizedBrainManifest();
      integrity = weaponized.weaponizedIntegrity();
    } catch (err) {
      console.warn(
        `[gen-weaponized-brain] failed to build manifest: ${err.message}`,
      );
    }
  }

  const enhanced = (() => {
    const b = index;
    const extended = {
      taxonomy: {
        questionTemplates: len("QUESTION_TEMPLATES", b),
        sectorRubrics: len("SECTOR_RUBRICS", b),
        scenarios: len("SCENARIOS", b),
        typologies: len("TYPOLOGIES", b),
        redFlags: len("RED_FLAGS", b),
        redFlagsExtended: len("RED_FLAGS_EXTENDED", b),
        adverseMediaCategories: len("ADVERSE_MEDIA_CATEGORIES", b),
        metaCognition: len("META_COGNITION", b),
      },
      regulatory: {
        fatfRecommendations: len("FATF_RECOMMENDATIONS", b),
        sanctionRegimes: len("SANCTION_REGIMES", b),
        dispositions: len("DISPOSITIONS", b),
        redlines: len("REDLINES", b),
        riskAppetite: len("RISK_APPETITE", b),
        cahraSeed: len("CAHRA_SEED", b),
        uaeFreeZones: len("UAE_FREE_ZONES", b),
        jurisdictionsFull: len("JURISDICTIONS_FULL", b),
        dpmsKpis: len("DPMS_KPIS", b),
      },
      expertise: {
        skills: len("SKILLS", b),
        cognitiveAmplifier: len("COGNITIVE_AMPLIFIER", b),
      },
    };
    const typologies = Array.isArray(b.TYPOLOGIES) ? b.TYPOLOGIES : [];
    const redFlags = Array.isArray(b.RED_FLAGS_EXTENDED)
      ? b.RED_FLAGS_EXTENDED
      : [];
    const redFlagsByTypology = new Map();
    for (const rf of redFlags) {
      const t = rf && rf.typology ? rf.typology : "unclassified";
      redFlagsByTypology.set(t, (redFlagsByTypology.get(t) ?? 0) + 1);
    }
    const jurisdictions = Array.isArray(b.JURISDICTIONS_FULL)
      ? b.JURISDICTIONS_FULL
      : [];
    const regionCounts = new Map();
    for (const j of jurisdictions) {
      if (!j || !j.region) continue;
      regionCounts.set(j.region, (regionCounts.get(j.region) ?? 0) + 1);
    }
    const sum = (o) => Object.values(o).reduce((a, v) => a + v, 0);
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
            id: (t && t.id) ?? "",
            title: (t && (t.title || t.name)) ?? "",
          }))
          .filter((t) => t.id),
      },
      totals: {
        catalogues: 19,
        enhancedCatalogues:
          Object.keys(extended.taxonomy).length +
          Object.keys(extended.regulatory).length +
          Object.keys(extended.expertise).length,
        regulatoryRecords: sum(extended.regulatory),
        taxonomyRecords: sum(extended.taxonomy),
        skillsRecords: extended.expertise.skills,
        totalRecords:
          sum(extended.regulatory) +
          sum(extended.taxonomy) +
          extended.expertise.skills,
      },
    };
  })();

  fs.mkdirSync(outDir, { recursive: true });
  const payload = {
    ok: true,
    generatedAt: new Date().toISOString(),
    manifest,
    integrity,
    enhanced,
  };
  fs.writeFileSync(outPath, JSON.stringify(payload, null, 2));
  const bytes = fs.statSync(outPath).size;
  console.log(
    `[gen-weaponized-brain] wrote ${path.relative(root, outPath)} — ${bytes} bytes${
      manifest ? "" : " (manifest skipped — dist/weaponized.js unavailable)"
    }`,
  );
})();
