// Jube client — jube-home/aml-fraud-transaction-monitoring
// (github.com/jube-home/aml-fraud-transaction-monitoring)
// Optional ML-based AML risk scoring via a running Jube instance.
// Activate by setting JUBE_API_URL:
//   docker compose up   (from jube repo)
//   JUBE_API_URL=http://localhost:5001
//
// Returns a 0–100 risk score derived from Jube's adaptive ML engine.
// If JUBE_API_URL is not set, returns null (no-op, fail-soft).

export interface JubeRiskResult {
  riskScore: number;
  label: "low" | "medium" | "high";
}

export async function checkJube(
  name: string,
  entityType?: string,
  jurisdiction?: string,
): Promise<JubeRiskResult | null> {
  const base = process.env["JUBE_API_URL"];
  if (!base) return null;

  try {
    const res = await fetch(`${base}/api/entity/risk`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        accept: "application/json",
      },
      body: JSON.stringify({
        name,
        entityType: entityType ?? "unknown",
        jurisdiction: jurisdiction ?? "",
      }),
      signal: AbortSignal.timeout(5_000),
    });
    if (!res.ok) {
      // Audit DR-07: log HTTP failures so silent nulls become diagnosable.
      console.warn(`[jube-client] HTTP ${res.status}`);
      return null;
    }

    const data = (await res.json()) as {
      riskScore?: number;
      score?: number;
    };
    const score = data.riskScore ?? data.score ?? 0;
    const label: JubeRiskResult["label"] =
      score >= 70 ? "high" : score >= 40 ? "medium" : "low";
    return { riskScore: score, label };
  } catch (err) {
    console.warn(`[jube-client] request failed: ${err instanceof Error ? err.message : String(err)}`);
    return null;
  }
}
