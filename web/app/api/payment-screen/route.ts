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
import { yenteMatch } from "../../../../dist/src/integrations/yente.js";
import { scoreWallet } from "../../../../dist/src/integrations/cryptoRisk.js";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 15;

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

  // Run yente FtM matching and crypto wallet risk in parallel (both fail-soft).
  const namesToMatch = [orderingName, beneficiaryName].filter((n): n is string => !!n);
  const cryptoAddress = parsed.ordering?.account ?? parsed.beneficiary?.account ?? "";
  const isCryptoLike = /^(0x[0-9a-fA-F]{40}|[13][a-km-zA-HJ-NP-Z1-9]{25,34}|bc1[a-z0-9]{6,87}|T[a-zA-Z0-9]{33})$/.test(cryptoAddress);

  const [yenteResults, walletRisk] = await Promise.all([
    namesToMatch.length > 0
      ? yenteMatch(namesToMatch.map((name) => ({ name, schema: "LegalEntity" as const }))).catch(() => null)
      : Promise.resolve(null),
    isCryptoLike
      ? scoreWallet(cryptoAddress).catch(() => null)
      : Promise.resolve(null),
  ]);

  const yenteSummary = yenteResults?.map((r: any, i: number) => ({
    name: namesToMatch[i],
    topScore: r.hits[0]?.score ?? 0,
    datasets: r.hits[0]?.datasets ?? [],
  })) ?? [];

  const cryptoRisk = walletRisk?.ok ? {
    address: walletRisk.address,
    chain: walletRisk.chain,
    riskScore: walletRisk.riskScore,
    riskLevel: walletRisk.riskLevel,
    exposure: walletRisk.exposure,
    labels: walletRisk.labels,
  } : null;

  // Escalate verdict if crypto wallet has critical/high taint
  const effectiveSeverity: QuickScreenResult["severity"] =
    walletRisk?.riskLevel === "critical" ? "critical"
    : walletRisk?.riskLevel === "high" && worseSeverity !== "critical" ? "high"
    : worseSeverity;

  return NextResponse.json({
    ok: true,
    parsed,
    orderingScreen,
    beneficiaryScreen,
    yente: yenteSummary,
    cryptoRisk,
    verdict: {
      worseSeverity: effectiveSeverity,
      shouldBlock: effectiveSeverity === "critical" || effectiveSeverity === "high",
    },
  });
}

export const POST = withGuard(handlePaymentScreen);
