import { NextResponse } from "next/server";
// Import each brain function from its concrete module rather than the
// index.js barrel. The barrel re-exports 80+ modules (~20k lines of
// catalogues); pulling it in at the top of a Netlify Function route was
// blowing cold-start past the 10s cap and returning 502s on every
// subject-detail open.
import { quickScreen } from "../../../../dist/src/brain/quick-screen.js";
import { classifyPepRole } from "../../../../dist/src/brain/pep-classifier.js";
import { classifyAdverseMedia } from "../../../../dist/src/brain/adverse-media.js";
import { jurisdictionByName } from "../../../../dist/src/brain/jurisdictions-full.js";
import { isCahra } from "../../../../dist/src/brain/cahra.js";
import { regimesForJurisdiction } from "../../../../dist/src/brain/sanction-regimes.js";
import { evaluateRedlines } from "../../../../dist/src/brain/redlines.js";
import { variantsOf } from "../../../../dist/src/brain/translit.js";
import { expandAliases } from "../../../../dist/src/brain/aliases.js";
import { doubleMetaphone, soundex } from "../../../../dist/src/brain/matching.js";
import { CANDIDATES } from "@/lib/data/candidates";
import { classifyEsg } from "@/lib/data/esg";
// Wave 4 enhancements — richer brain modules landed via PR #49.
import { jurisdictionProfile } from "../../../../dist/src/brain/lib/jurisdictions.js";
import {
  matchTypologies,
  typologyCompositeScore,
} from "../../../../dist/src/brain/lib/typologies.js";
import { scoreAdverseMedia } from "../../../../dist/src/brain/lib/adverse-media-scorer.js";
import { assessPEP } from "../../../../dist/src/brain/lib/pep.js";
import { analyseText } from "../../../../dist/src/brain/lib/stylometry.js";
import {
  classifyAdverseKeywords,
  adverseKeywordGroupCounts,
  type AdverseKeywordGroup,
} from "@/lib/data/adverse-keywords";
import { enforce } from "@/lib/server/enforce";
import {
  lookupKnownPEP,
  lookupKnownAdverse,
} from "@/lib/data/known-entities";

// Group weight: how much each fired group should push the composite score.
// Critical regimes (terrorism / WMD / proliferation / sanctions) dominate;
// purely informational groups (political exposure) are near-zero.
const KEYWORD_GROUP_WEIGHT: Record<AdverseKeywordGroup, number> = {
  "terrorism-financing": 20,
  "proliferation-wmd": 20,
  "regulatory-action": 14,
  "bribery-corruption": 14,
  "money-laundering": 14,
  "organised-crime": 14,
  "human-trafficking": 12,
  "fraud-forgery": 12,
  "market-abuse": 10,
  "tax-crime": 10,
  "cybercrime": 10,
  "law-enforcement": 6,
  "political-exposure": 2,
};

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface Body {
  subject: {
    name: string;
    aliases?: string[];
    entityType?: "individual" | "organisation" | "vessel" | "aircraft" | "other";
    jurisdiction?: string;
  };
  roleText?: string;
  adverseMediaText?: string;
}

export async function POST(req: Request): Promise<NextResponse> {
  // Gate + rate-limit BEFORE parsing the JSON body so an attacker can't
  // blast megabytes of junk into a free-tier endpoint. gate.headers is
  // threaded through every exit path so clients always see their
  // remaining quota and rate-limit window.
  const gate = await enforce(req);
  if (!gate.ok) return gate.response;

  let body: Body;
  try {
    body = (await req.json()) as Body;
  } catch {
    return NextResponse.json(
      { ok: false, error: "invalid JSON" },
      { status: 400, headers: gate.headers },
    );
  }
  if (!body?.subject?.name || body.subject.name.length > 500) {
    return NextResponse.json(
      { ok: false, error: "subject.name required (max 500 chars)" },
      { status: 400, headers: gate.headers },
    );
  }

  try {
    // 0 · Known-entity fixtures — household-name PEPs and documented
    //     adverse-media subjects auto-flag even without roleText or live
    //     external feeds (so demo subjects render a realistic posture).
    const knownPep = lookupKnownPEP(body.subject.name);
    const knownAdverse = lookupKnownAdverse(body.subject.name);

    // 1 · Quick screen (sanctions/fuzzy match against the seed corpus).
    const screen = quickScreen(body.subject, CANDIDATES as Parameters<typeof quickScreen>[1]);

    // 2 · PEP classification. Prefer supplied roleText; otherwise fall back
    //     to the known-PEP fixture's synthetic role, which lets recognised
    //     names (e.g. serving heads of state) classify without analyst input.
    const pepRoleText = body.roleText ?? knownPep?.role ?? null;
    const pep = pepRoleText ? classifyPepRole(pepRoleText) : null;

    // 3 · Adverse-media category detection. Merge live text classification
    //     with the known-adverse fixture so documented subjects still show a
    //     signal when no mediaText is provided.
    const mediaText = body.adverseMediaText ?? "";
    const adverseMediaLive = mediaText ? classifyAdverseMedia(mediaText) : [];
    const adverseMedia = knownAdverse
      ? [
          ...adverseMediaLive,
          ...knownAdverse.categories.map((c, i) => ({
            categoryId: c.categoryId,
            keyword: c.keyword,
            offset: i,
          })),
        ]
      : adverseMediaLive;

    // 3b · ESG classifier — 25 ESG-relevant categories across 5 domains,
    //      mapped to SASB / EU Taxonomy / UN SDGs.
    const fullText = [
      mediaText,
      body.subject.name,
      (body.subject.aliases ?? []).join(" "),
      pepRoleText ?? "",
      knownAdverse?.keywords.join(" ") ?? "",
    ].join(" ");
    const esg = classifyEsg(fullText);

    // 3c · Adverse-keyword classifier — the classic AML/CFT keyword set
    //      grouped by financial-crime family. Each firing group contributes
    //      to the composite score per KEYWORD_GROUP_WEIGHT.
    const adverseKeywords = classifyAdverseKeywords(fullText);
    const adverseKeywordGroups = adverseKeywordGroupCounts(adverseKeywords);
    const adverseKeywordPenalty = adverseKeywordGroups.reduce(
      (acc, g) => acc + (KEYWORD_GROUP_WEIGHT[g.group] ?? 0),
      0,
    );

    // 4 · Jurisdiction profile.
    const jurisdiction = resolveJurisdiction(body.subject.jurisdiction);

    // 5 · Redlines (charter prohibitions triggered by name/alias keywords).
    const redlineKeywords = [
      body.subject.name,
      ...(body.subject.aliases ?? []),
      body.roleText ?? "",
      body.adverseMediaText ?? "",
    ]
      .join(" ")
      .toLowerCase()
      .split(/\W+/)
      .filter((t) => t.length >= 3);
    const redlines = evaluateRedlines(redlineKeywords);

    // 6 · Name variants — transliteration / phonetic / alias expansion
    //     surfaces the phonetic tokens the matching engine uses under the hood.
    const variants = {
      aliasExpansion: expandAliases(body.subject.name),
      nameVariants: variantsOf(body.subject.name).slice(0, 20),
      doubleMetaphone: doubleMetaphone(body.subject.name),
      soundex: soundex(body.subject.name),
    };

    // 7 · Composite confidence. Give weight to list hits + redlines + jurisdiction risk.
    const jurisdictionPenalty = jurisdiction?.cahra ? 15 : 0;
    const regimesPenalty = Math.min((jurisdiction?.regimes.length ?? 0) * 3, 12);
    const redlinesPenalty = redlines.fired.length * 10;
    const adverseMediaPenalty = Math.min(adverseMedia.length * 8, 30);
    const pepPenalty = pep && pep.salience > 0 ? Math.round(pep.salience * 20) : 0;
    const composite = Math.max(
      0,
      Math.min(
        100,
        screen.topScore +
          jurisdictionPenalty +
          regimesPenalty +
          redlinesPenalty +
          adverseMediaPenalty +
          adverseKeywordPenalty +
          pepPenalty,
      ),
    );

    // ── Wave 4 additions ────────────────────────────────────────
    // Richer jurisdiction profile (FATF tier + secrecy + sanctions
    // exposure) from the new library module.
    const jurisdictionIso = jurisdiction?.iso2 ?? body.subject.jurisdiction;
    const jurisdictionRich = jurisdictionIso
      ? (() => {
          try {
            return jurisdictionProfile(jurisdictionIso.toUpperCase());
          } catch {
            return null;
          }
        })()
      : null;

    // FATF / Egmont typology catalogue — regex-fingerprint matching on
    // the joined narrative/aliases/role/media text.
    const rawTypologyHits: ReturnType<typeof matchTypologies> = (() => {
      try {
        return matchTypologies(fullText);
      } catch {
        return [];
      }
    })();
    const typologyHits = rawTypologyHits.map((h) => ({
      id: h.typology.id,
      name: h.typology.name,
      family: h.typology.family,
      weight: h.typology.weight,
      snippet: h.snippet,
    }));
    const typologyScore = (() => {
      try {
        return typologyCompositeScore(rawTypologyHits);
      } catch {
        return 0;
      }
    })();

    // Structured adverse-media scorer (5-category confidence + composite).
    const adverseMediaScored = mediaText
      ? (() => {
          try {
            return scoreAdverseMedia(mediaText, []);
          } catch {
            return null;
          }
        })()
      : null;

    // Richer PEP assessment across role + title heuristics. Uses the
    // synthetic role from the known-PEP fixture when no analyst roleText
    // is supplied.
    const pepAssessment = pepRoleText
      ? (() => {
          try {
            return assessPEP(pepRoleText ?? "", body.subject.name);
          } catch {
            return null;
          }
        })()
      : null;

    // Stylometry — detect gaslighting / evasive phrasing in the narrative.
    const stylometry = mediaText
      ? (() => {
          try {
            return analyseText(mediaText);
          } catch {
            return null;
          }
        })()
      : null;

    return NextResponse.json({
      ok: true,
      screen,
      pep,
      adverseMedia,
      esg,
      adverseKeywords,
      adverseKeywordGroups,
      jurisdiction,
      redlines,
      variants,
      // Wave 4 additions
      jurisdictionRich,
      typologies: { hits: typologyHits, compositeScore: typologyScore },
      adverseMediaScored,
      pepAssessment,
      stylometry,
      composite: {
        score: composite,
        breakdown: {
          quickScreen: screen.topScore,
          jurisdictionPenalty,
          regimesPenalty,
          redlinesPenalty,
          adverseMediaPenalty,
          adverseKeywordPenalty,
          pepPenalty,
        },
      },
    }, { headers: gate.headers });
  } catch (err) {
    // Log the detail server-side where auditors can see it; return a
    // generic message to the client so brain-internal stack frames
    // don't leak into an MLRO's screen as "Cannot find module …".
    console.error("super-brain failed", err);
    return NextResponse.json(
      {
        ok: false,
        error: "super-brain unavailable",
      },
      { status: 503, headers: gate.headers },
    );
  }
}

function resolveJurisdiction(
  input?: string,
): { iso2: string; name: string; region: string; cahra: boolean; regimes: string[] } | null {
  if (!input) return null;
  const raw = input.trim();
  if (!raw) return null;
  // Try exact name first, then ISO2 uppercase.
  const byName = jurisdictionByName(raw);
  const iso2Guess = raw.length === 2 ? raw.toUpperCase() : byName?.iso2 ?? raw.toUpperCase();
  const regimes = (() => {
    try {
      return regimesForJurisdiction(iso2Guess).map((r) => r.id ?? String(r));
    } catch {
      return [];
    }
  })();
  return {
    iso2: iso2Guess,
    name: byName?.name ?? raw,
    region: byName?.region ?? "—",
    cahra: isCahra(iso2Guess),
    regimes,
  };
}
