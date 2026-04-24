import { NextResponse } from "next/server";
import { withGuard } from "@/lib/server/guard";
import { quickScreen as _quickScreen } from "../../../../dist/src/brain/quick-screen.js";
import { parseMt103 } from "@/lib/server/mt103";
import { loadCandidates } from "@/lib/server/candidates-loader";
import type {
  QuickScreenCandidate,
  QuickScreenResult,
  QuickScreenSubject,
} from "@/lib/api/quickScreen.types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type QuickScreenFn = (
  subject: QuickScreenSubject,
  candidates: QuickScreenCandidate[],
) => QuickScreenResult;
const quickScreen = _quickScreen as QuickScreenFn;

// POST /api/payment-screen
// Body: { message: string }  — raw SWIFT MT103 text
// Returns: { ok, parsed, orderingScreen, beneficiaryScreen }
//
// Parses the MT103, extracts ordering and beneficiary parties, screens
// each against the live candidate corpus (OFAC / UN / EU / UK / EOCN /
// UAE LTL via the same loader the screening panel uses), and returns
// both results. The UI surfaces the worse of the two severities as the
// payment verdict.

interface Body {
  message: string;
}

async function handlePaymentScreen(req: Request): Promise<NextResponse> {
  let body: Body;
  try {
    body = (await req.json()) as Body;
  } catch {
    return NextResponse.json({ ok: false, error: "invalid JSON" }, { status: 400 });
  }
  if (!body?.message || typeof body.message !== "string") {
    return NextResponse.json(
      { ok: false, error: "message (raw MT103 text) is required" },
      { status: 400 },
    );
  }
  if (body.message.length > 50_000) {
    return NextResponse.json(
      { ok: false, error: "message exceeds 50KB cap" },
      { status: 413 },
    );
  }

  const parsed = parseMt103(body.message);
  let candidates: Awaited<ReturnType<typeof loadCandidates>>;
  try {
    candidates = await loadCandidates();
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err);
    console.error("[payment-screen] loadCandidates failed", detail);
    return NextResponse.json(
      { ok: false, error: "watchlist corpus unavailable", detail },
      { status: 503 },
    );
  }

  const orderingName = parsed.ordering?.name;
  const beneficiaryName = parsed.beneficiary?.name;

  const orderingScreen = orderingName
    ? quickScreen(
        {
          name: orderingName,
          entityType: "other",
        },
        candidates,
      )
    : null;

  const beneficiaryScreen = beneficiaryName
    ? quickScreen(
        {
          name: beneficiaryName,
          entityType: "other",
        },
        candidates,
      )
    : null;

  const worseSeverity = [orderingScreen?.severity, beneficiaryScreen?.severity]
    .filter((s): s is QuickScreenResult["severity"] => !!s)
    .reduce<QuickScreenResult["severity"]>((acc, s) => {
      const order: QuickScreenResult["severity"][] = [
        "clear",
        "low",
        "medium",
        "high",
        "critical",
      ];
      return order.indexOf(s) > order.indexOf(acc) ? s : acc;
    }, "clear");

  return NextResponse.json({
    ok: true,
    parsed,
    orderingScreen,
    beneficiaryScreen,
    verdict: {
      worseSeverity,
      shouldBlock: worseSeverity === "critical" || worseSeverity === "high",
    },
  });
}

export const POST = withGuard(handlePaymentScreen);
