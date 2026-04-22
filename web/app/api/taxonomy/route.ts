import { NextResponse } from "next/server";
import { ANALYSIS, REASONING, SKILLS, TAXONOMY } from "@/lib/data/taxonomy";
import { ANCHORS } from "@/lib/data/anchors";
import { PLAYBOOKS } from "@/lib/data/playbooks";

export const runtime = "nodejs";

export async function GET() {
  return NextResponse.json({
    ok: true,
    counts: {
      skills: SKILLS.length,
      reasoning: REASONING.length,
      analysis: ANALYSIS.length,
      taxonomy: TAXONOMY.length,
      anchors: ANCHORS.length,
      playbooks: PLAYBOOKS.length,
    },
    taxonomy: {
      skills: SKILLS,
      reasoning: REASONING,
      analysis: ANALYSIS,
    },
    anchors: ANCHORS,
    playbooks: PLAYBOOKS,
  });
}
