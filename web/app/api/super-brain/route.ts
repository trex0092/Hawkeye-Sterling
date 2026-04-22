import { NextResponse } from "next/server";
import {
  quickScreen,
  classifyPepRole,
  classifyAdverseMedia,
  jurisdictionByName,
  isCahra,
  regimesForJurisdiction,
  evaluateRedlines,
  variantsOf,
  expandAliases,
  doubleMetaphone,
  soundex,
} from "../../../../dist/src/brain/index.js";
import { CANDIDATES } from "@/lib/data/candidates";
import { classifyEsg } from "@/lib/data/esg";
import {
  classifyAdverseKeywords,
  adverseKeywordGroupCounts,
  type AdverseKeywordGroup,
} from "@/lib/data/adverse-keywords";

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
  let body: Body;
  try {
    body = (await req.json()) as Body;
  } catch {
    return NextResponse.json({ ok: false, error: "invalid JSON" }, { status: 400 });
  }
  if (!body?.subject?.name) {
    return NextResponse.json(
      { ok: false, error: "subject.name required" },
      { status: 400 },
    );
  }

  try {
    // 1 · Quick screen (sanctions/fuzzy match against the seed corpus).
    const screen = quickScreen(body.subject, CANDIDATES as Parameters<typeof quickScreen>[1]);

    // 2 · PEP classification from a freeform role text, if supplied.
    const pep = body.roleText ? classifyPepRole(body.roleText) : null;

    // 3 · Adverse-media category detection.
    const mediaText = body.adverseMediaText ?? "";
    const adverseMedia = mediaText
      ? classifyAdverseMedia(mediaText)
      : [];

    // 3b · ESG classifier — 25 ESG-relevant categories across 5 domains,
    //      mapped to SASB / EU Taxonomy / UN SDGs.
    const fullText = [
      mediaText,
      body.subject.name,
      (body.subject.aliases ?? []).join(" "),
      body.roleText ?? "",
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
    });
  } catch (err) {
    return NextResponse.json(
      {
        ok: false,
        error: "super-brain failed",
        detail: err instanceof Error ? err.message : String(err),
      },
      { status: 500 },
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
