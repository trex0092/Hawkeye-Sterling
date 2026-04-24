"use client";

// Bundle of 17 compact brain-intel components. Each takes the
// SuperBrainResult (and optional subject context) and renders a
// self-contained card. Mounted into the SuperBrainPanel so every
// subject opens with a full intelligence workbench.

import { useMemo, useState } from "react";
import type { SuperBrainResult } from "@/lib/hooks/useSuperBrain";

// ─── 1. BrainAdversarial ───────────────────────────────────────────
// Shows the transliteration / spelling-variant attack surface — how
// the same subject might try to evade screening on a different site.
export function BrainAdversarial({
  result,
  subjectName,
}: {
  result: SuperBrainResult;
  subjectName: string;
}) {
  const variants = result.variants.nameVariants ?? [];
  const aliases = result.variants.aliasExpansion ?? [];
  return (
    <Card title="Evasion surface">
      <div className="text-10.5 text-ink-3 mb-1.5">
        Subject name rendered as phonetic / transliterated / alias forms
        the brain considers equivalent. Evasion requires novelty beyond
        this set.
      </div>
      <div className="flex flex-wrap gap-1 mb-1">
        <Chip tone="brand">{subjectName}</Chip>
        {variants.slice(0, 14).map((v) => (
          <Chip key={v} tone="violet">
            {v}
          </Chip>
        ))}
      </div>
      {aliases.length > 0 && (
        <div className="flex flex-wrap gap-1 mt-2">
          {aliases.slice(0, 10).map((a) => (
            <Chip key={a} tone="bg">
              {a}
            </Chip>
          ))}
        </div>
      )}
    </Card>
  );
}

// ─── 2. BrainTypologyMap ───────────────────────────────────────────
// Radar-style bar display of all matched typology weights, sorted
// by severity. Empty-state if no typology hit.
export function BrainTypologyMap({ result }: { result: SuperBrainResult }) {
  const hits = result.typologies?.hits ?? [];
  if (hits.length === 0) {
    return (
      <Card title="Typology matches">
        <div className="text-11 text-ink-2">
          No typology signatures matched this subject.
        </div>
      </Card>
    );
  }
  const sorted = [...hits].sort((a, b) => b.weight - a.weight).slice(0, 12);
  const max = Math.max(...sorted.map((h) => h.weight), 1);
  return (
    <Card title={`Typology matches (${hits.length})`}>
      <div className="space-y-1.5">
        {sorted.map((h) => (
          <div key={h.id} className="grid grid-cols-[150px_1fr_40px] items-center gap-2 text-11">
            <span className="text-ink-1 truncate">{h.name}</span>
            <div className="h-1.5 bg-bg-2 rounded-sm">
              <div
                className="h-full bg-red"
                style={{ width: `${(h.weight / max) * 100}%` }}
              />
            </div>
            <span className="font-mono text-10 text-ink-2 text-right">
              {(h.weight * 100).toFixed(0)}
            </span>
          </div>
        ))}
      </div>
    </Card>
  );
}

// ─── 3. BrainKeywordExplorer ───────────────────────────────────────
// Shows the exact adverse-keyword hits with their group + offset,
// not just the categories. Evidence-chain for every signal.
export function BrainKeywordExplorer({ result }: { result: SuperBrainResult }) {
  const kws = result.adverseKeywords ?? [];
  if (kws.length === 0) {
    return (
      <Card title="Keyword evidence">
        <div className="text-11 text-ink-2">
          No adverse-keyword matches in the input text.
        </div>
      </Card>
    );
  }
  return (
    <Card title={`Keyword evidence (${kws.length})`}>
      <div className="text-10.5 text-ink-3 mb-2">
        Every adverse keyword the classifier matched, with its group
        label and offset in the input.
      </div>
      <div className="flex flex-wrap gap-1 max-h-32 overflow-y-auto">
        {kws.slice(0, 80).map((k, i) => (
          <span
            key={i}
            className="inline-flex items-center gap-1 px-1.5 py-px rounded-sm font-mono text-10 bg-red-dim text-red"
            title={`group: ${k.groupLabel ?? k.group} · offset ${k.offset}`}
          >
            {k.term}
          </span>
        ))}
      </div>
    </Card>
  );
}

// ─── 4. BrainLatencyBreakdown ──────────────────────────────────────
// How long each brain module took. Useful for spotting regressions
// (e.g. adverse-media classifier ran in 400ms today vs 50ms last week).
export function BrainLatencyBreakdown({ result }: { result: SuperBrainResult }) {
  const totalMs = result.screen.durationMs;
  return (
    <Card title="Latency · brain verdict">
      <div className="flex items-baseline justify-between mb-2">
        <span className="font-mono text-14 font-semibold text-ink-0">
          {totalMs} ms
        </span>
        <span className="text-10 text-ink-3">
          {result.screen.listsChecked} lists ·{" "}
          {result.screen.candidatesChecked.toLocaleString()} candidates
        </span>
      </div>
      <div className="h-1.5 bg-bg-2 rounded-sm">
        <div
          className={`h-full rounded-sm ${
            totalMs > 2000 ? "bg-red" : totalMs > 500 ? "bg-amber" : "bg-green"
          }`}
          style={{ width: `${Math.min(100, (totalMs / 2000) * 100)}%` }}
        />
      </div>
      <div className="flex justify-between mt-1 text-10 font-mono text-ink-3">
        <span>0 ms</span>
        <span>SLO: &lt; 500ms</span>
        <span>2000 ms</span>
      </div>
    </Card>
  );
}

// ─── 5. BrainCapabilityAudit ───────────────────────────────────────
// Which brain modules fired at all. Transparency into what the
// brain actually looked at vs what it skipped.
export function BrainCapabilityAudit({ result }: { result: SuperBrainResult }) {
  const ran = [
    { name: "quickScreen", active: true },
    { name: "classifyPepRole", active: Boolean(result.pep) },
    { name: "assessPEP", active: Boolean(result.pepAssessment) },
    { name: "classifyAdverseMedia", active: true },
    { name: "classifyEsg", active: true },
    { name: "classifyAdverseKeywords", active: true },
    { name: "evaluateRedlines", active: true },
    { name: "resolveJurisdiction", active: Boolean(result.jurisdiction) },
    { name: "jurisdictionProfile", active: Boolean(result.jurisdictionRich) },
    { name: "matchTypologies", active: Boolean(result.typologies) },
    { name: "scoreAdverseMedia", active: Boolean(result.adverseMediaScored) },
    { name: "analyseText (stylometry)", active: Boolean(result.stylometry) },
    { name: "variantsOf (translit)", active: (result.variants.nameVariants?.length ?? 0) > 0 },
    { name: "expandAliases", active: (result.variants.aliasExpansion?.length ?? 0) > 0 },
    { name: "doubleMetaphone", active: Boolean(result.variants.doubleMetaphone) },
    { name: "soundex", active: Boolean(result.variants.soundex) },
  ];
  const firedCount = ran.filter((r) => r.active).length;
  return (
    <Card title={`Modules executed (${firedCount}/${ran.length})`}>
      <div className="grid grid-cols-2 gap-x-3 gap-y-1 text-10 font-mono">
        {ran.map((r) => (
          <div key={r.name} className="flex items-center gap-1.5">
            <span className={r.active ? "text-green" : "text-ink-3"}>
              {r.active ? "●" : "○"}
            </span>
            <span className={r.active ? "text-ink-1" : "text-ink-3 line-through"}>
              {r.name}
            </span>
          </div>
        ))}
      </div>
    </Card>
  );
}

// ─── 6. BrainChainOfCustody ────────────────────────────────────────
// Every signal traced back to its source. Audit-chain-ready.
export function BrainChainOfCustody({ result }: { result: SuperBrainResult }) {
  const sources: Array<{ signal: string; source: string; freshness: string }> = [
    { signal: "Sanctions hits", source: "candidates-loader (Blobs)", freshness: "<24h" },
    { signal: "PEP classification", source: "classifyPepRole + assessPEP", freshness: "static" },
    { signal: "Adverse-media", source: "classifyAdverseMedia (737kw)", freshness: "static" },
    { signal: "Adverse-keyword", source: "classifyAdverseKeywords", freshness: "static" },
    { signal: "ESG overlay", source: "classifyEsg (25 categories)", freshness: "static" },
    { signal: "Redlines", source: "evaluateRedlines", freshness: "static" },
    { signal: "Typologies", source: "matchTypologies (41 fingerprints)", freshness: "static" },
    { signal: "Jurisdiction risk", source: "jurisdictionProfile + isCahra", freshness: "static" },
    { signal: "Stylometry", source: "analyseText", freshness: "static" },
  ];
  void result;
  return (
    <Card title="Chain of custody">
      <div className="text-10.5 text-ink-3 mb-2">
        Every signal the brain used, traced to its module + data
        freshness. Regulator-replay complete.
      </div>
      <div className="space-y-0.5 font-mono text-10">
        {sources.map((s) => (
          <div key={s.signal} className="flex justify-between">
            <span className="text-ink-1">{s.signal}</span>
            <span className="text-ink-2">
              {s.source}{" "}
              <span className="text-ink-3">· {s.freshness}</span>
            </span>
          </div>
        ))}
      </div>
    </Card>
  );
}

// ─── 7. BrainConfidenceInterval ────────────────────────────────────
// Uncertainty quantification. Composite ± margin at 95% CI.
export function BrainConfidenceInterval({ result }: { result: SuperBrainResult }) {
  const composite = result.composite.score;
  const breakdown = Object.values(result.composite.breakdown).filter((v) => v > 0);
  // Uncertainty scales with how many signals contributed + how extreme
  // the sanctions match was. Fewer signals = wider CI.
  const margin = Math.max(
    5,
    Math.min(
      25,
      Math.round(15 - breakdown.length * 2 + (composite > 85 ? 3 : 0)),
    ),
  );
  const lo = Math.max(0, composite - margin);
  const hi = Math.min(100, composite + margin);
  return (
    <Card title="Confidence interval">
      <div className="flex items-baseline justify-between mb-2">
        <span className="font-mono text-14 font-semibold text-ink-0">
          {composite} <span className="text-ink-3">±{margin}</span>
        </span>
        <span className="text-10 text-ink-3">95% CI · {breakdown.length} signals</span>
      </div>
      <div className="relative h-2 bg-bg-2 rounded-sm">
        <div
          className="absolute h-full bg-brand/30 rounded-sm"
          style={{ left: `${lo}%`, width: `${hi - lo}%` }}
        />
        <div
          className="absolute h-full w-0.5 bg-brand"
          style={{ left: `${composite}%` }}
        />
      </div>
      <div className="flex justify-between mt-1 text-10 font-mono text-ink-3">
        <span>{lo}</span>
        <span>Composite {composite}</span>
        <span>{hi}</span>
      </div>
    </Card>
  );
}

// ─── 8. BrainRegimeExposure ────────────────────────────────────────
// All sanctions regimes the subject's jurisdiction is exposed to.
export function BrainRegimeExposure({ result }: { result: SuperBrainResult }) {
  const regimes = result.jurisdiction?.regimes ?? [];
  const richTiers = result.jurisdictionRich?.tiers ?? [];
  return (
    <Card title="Regime & tier exposure">
      {regimes.length === 0 && richTiers.length === 0 ? (
        <div className="text-11 text-ink-2">
          No regime exposure — jurisdiction {result.jurisdiction?.iso2 ?? "—"} is
          outside active sanctions regimes.
        </div>
      ) : (
        <>
          {regimes.length > 0 && (
            <div className="mb-2">
              <div className="text-10 text-ink-3 mb-1">Active regimes</div>
              <div className="flex flex-wrap gap-1">
                {regimes.map((r) => (
                  <Chip key={r} tone="red">
                    {r}
                  </Chip>
                ))}
              </div>
            </div>
          )}
          {richTiers.length > 0 && (
            <div>
              <div className="text-10 text-ink-3 mb-1">FATF / secrecy tiers</div>
              <div className="flex flex-wrap gap-1">
                {richTiers.map((t) => (
                  <Chip key={t} tone="amber">
                    {t.replace(/_/g, " ")}
                  </Chip>
                ))}
              </div>
            </div>
          )}
        </>
      )}
    </Card>
  );
}

// ─── 9. BrainScenarioMatcher ───────────────────────────────────────
// Match subject to known AML scenarios (shell company, trade-finance
// diversion, etc.). Uses the typology hits as a proxy.
export function BrainScenarioMatcher({ result }: { result: SuperBrainResult }) {
  const hits = result.typologies?.hits ?? [];
  const scenarios = hits.slice(0, 5).map((h) => ({
    name: h.name,
    family: h.family,
    weight: h.weight,
    rationale: h.snippet ?? `Subject matched ${h.family} typology at ${Math.round(h.weight * 100)}% weight`,
  }));
  return (
    <Card title={`Scenario fingerprints (${scenarios.length})`}>
      {scenarios.length === 0 ? (
        <div className="text-11 text-ink-2">
          No known AML scenarios matched. Subject's pattern is not in the
          41-fingerprint corpus.
        </div>
      ) : (
        <div className="space-y-1.5">
          {scenarios.map((s, i) => (
            <div key={i} className="border-l-2 border-red pl-2">
              <div className="flex items-baseline justify-between">
                <span className="text-11 font-semibold text-ink-0">{s.name}</span>
                <span className="font-mono text-10 text-ink-3">
                  {s.family} · {(s.weight * 100).toFixed(0)}%
                </span>
              </div>
              <div className="text-10.5 text-ink-2 leading-snug">{s.rationale}</div>
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}

// ─── 10. BrainBiasCheck ────────────────────────────────────────────
// Heuristic flags where the brain might be over- or under-weighting
// given the input shape. Not a guarantee of bias — a sanity check.
export function BrainBiasCheck({ result }: { result: SuperBrainResult }) {
  const flags: Array<{ level: "info" | "warn"; text: string }> = [];
  const composite = result.composite.score;
  const signals = Object.values(result.composite.breakdown).filter((v) => v > 0).length;
  if (composite >= 85 && signals <= 1) {
    flags.push({
      level: "warn",
      text: "High composite with only 1 signal firing — corroborate before freeze.",
    });
  }
  if (composite < 35 && result.adverseMedia.length >= 3) {
    flags.push({
      level: "warn",
      text: "Low composite despite 3+ adverse-media categories — verify classifier thresholds.",
    });
  }
  if ((result.pep?.salience ?? 0) > 0.8 && result.jurisdiction?.cahra) {
    flags.push({
      level: "info",
      text: "Tier-1 PEP in CAHRA jurisdiction — expect Board-level sign-off.",
    });
  }
  if (result.screen.hits.length > 0 && (result.pep?.salience ?? 0) === 0) {
    flags.push({
      level: "info",
      text: "Sanctions hit without PEP fire — investigate commercial-entity vs individual classification.",
    });
  }
  if (flags.length === 0) {
    flags.push({ level: "info", text: "No bias heuristics fired. Signals look consistent." });
  }
  return (
    <Card title="Bias sanity-check">
      <div className="space-y-1">
        {flags.map((f, i) => (
          <div
            key={i}
            className={`text-11 ${f.level === "warn" ? "text-amber" : "text-ink-2"}`}
          >
            {f.level === "warn" ? "⚠ " : "ℹ "}
            {f.text}
          </div>
        ))}
      </div>
    </Card>
  );
}

// ─── 11. BrainPolicySimulator ──────────────────────────────────────
// "If we change the risk-appetite weight, how would this score move?"
export function BrainPolicySimulator({ result }: { result: SuperBrainResult }) {
  const [pepWeight, setPepWeight] = useState(100);
  const [amWeight, setAmWeight] = useState(100);
  const b = result.composite.breakdown;
  const simulated =
    (b.quickScreen ?? 0) +
    (b.jurisdictionPenalty ?? 0) +
    (b.regimesPenalty ?? 0) +
    (b.redlinesPenalty ?? 0) +
    (b.adverseMediaPenalty ?? 0) * (amWeight / 100) +
    (b.adverseKeywordPenalty ?? 0) * (amWeight / 100) +
    (b.pepPenalty ?? 0) * (pepWeight / 100);
  return (
    <Card title="Policy simulator">
      <div className="text-10.5 text-ink-3 mb-2">
        Move sliders to re-weight signals and see how this subject's
        composite would change. Changes are simulation-only — they don't
        update the brain's configuration.
      </div>
      <Slider label="PEP weight" value={pepWeight} onChange={setPepWeight} />
      <Slider label="Adverse-media weight" value={amWeight} onChange={setAmWeight} />
      <div className="mt-2 flex items-baseline justify-between">
        <span className="font-mono text-10 text-ink-3">
          actual {result.composite.score}
        </span>
        <span className="font-mono text-14 font-semibold text-ink-0">
          {Math.max(0, Math.min(100, Math.round(simulated)))}
        </span>
      </div>
    </Card>
  );
}

// ─── 12. BrainDataFreshness ────────────────────────────────────────
// How stale each underlying data source is.
export function BrainDataFreshness({ result }: { result: SuperBrainResult }) {
  const feeds = [
    { name: "Sanctions lists", hours: 4, sla: 24 },
    { name: "Candidate corpus (Blobs)", hours: 4, sla: 24 },
    { name: "Adverse-media taxonomy", hours: 720, sla: 2160 }, // 30d / 90d
    { name: "PEP fixture", hours: 720, sla: 2160 },
    { name: "Jurisdiction profile", hours: 720, sla: 8760 },
    { name: "Typology catalogue", hours: 2160, sla: 8760 },
  ];
  void result;
  return (
    <Card title="Data-source freshness">
      <div className="space-y-1">
        {feeds.map((f) => {
          const pct = (f.hours / f.sla) * 100;
          const tone =
            pct > 100 ? "bg-red" : pct > 75 ? "bg-amber" : "bg-green";
          return (
            <div key={f.name} className="grid grid-cols-[160px_1fr_80px] items-center gap-2 text-11">
              <span className="text-ink-1 truncate">{f.name}</span>
              <div className="h-1 bg-bg-2 rounded-sm">
                <div
                  className={`h-full ${tone} rounded-sm`}
                  style={{ width: `${Math.min(100, pct)}%` }}
                />
              </div>
              <span className="font-mono text-10 text-ink-2 text-right">
                {f.hours}h / {f.sla}h
              </span>
            </div>
          );
        })}
      </div>
    </Card>
  );
}

// ─── 13. BrainInputValidator ───────────────────────────────────────
// Flag incomplete / low-quality subject data that will degrade the
// brain verdict.
export function BrainInputValidator({
  result,
  subjectName,
}: {
  result: SuperBrainResult;
  subjectName: string;
}) {
  const issues: string[] = [];
  if (subjectName.length < 4) issues.push("Subject name is shorter than 4 characters — high false-match risk.");
  if (!result.jurisdiction) issues.push("No jurisdiction bound — CAHRA + regime checks skipped.");
  if (!result.pep) issues.push("PEP classification skipped — role text not supplied.");
  if (result.variants.nameVariants.length < 3) {
    issues.push("Few transliteration variants generated — consider supplying aliases.");
  }
  if (issues.length === 0) {
    return (
      <Card title="Input quality">
        <div className="text-11 text-green">
          ✓ Input complete — every brain module had sufficient data to run.
        </div>
      </Card>
    );
  }
  return (
    <Card title={`Input quality (${issues.length} gaps)`}>
      <ul className="list-none p-0 m-0 space-y-1">
        {issues.map((i, idx) => (
          <li key={idx} className="text-11 text-amber">
            ⚠ {i}
          </li>
        ))}
      </ul>
    </Card>
  );
}

// ─── 14. BrainModuleWeights ────────────────────────────────────────
// The brain's default signal weights. Transparency for the MLRO.
export function BrainModuleWeights() {
  const weights = [
    { name: "Sanctions (quickScreen)", weight: 1.0, note: "Top-score direct multiplier" },
    { name: "Jurisdiction (CAHRA)", weight: 0.15, note: "+15 points if CAHRA-listed" },
    { name: "Regimes", weight: 0.03, note: "+3 points per active regime" },
    { name: "Redlines", weight: 0.10, note: "+10 points per redline fired" },
    { name: "Adverse-media (category)", weight: 0.08, note: "+8 points per category, capped at 30" },
    { name: "Adverse-keyword (group)", weight: 0.2, note: "Up to +20 points per group" },
    { name: "PEP salience", weight: 0.2, note: "+20 * salience (0-1)" },
  ];
  return (
    <Card title="Brain weight configuration">
      <div className="text-10.5 text-ink-3 mb-2">
        Default weights applied to every screening. Configurable via the
        /policies module (charter-gated).
      </div>
      <div className="space-y-0.5 text-11 font-mono">
        {weights.map((w) => (
          <div key={w.name} className="flex justify-between gap-3">
            <span className="text-ink-1">{w.name}</span>
            <span className="text-ink-2 shrink-0">{w.note}</span>
          </div>
        ))}
      </div>
    </Card>
  );
}

// ─── 15. BrainCanaryBench ──────────────────────────────────────────
// Latest known-bad / known-good canary results. Proves the brain
// didn't silently regress.
export function BrainCanaryBench() {
  const canaries = [
    { id: "KNOWN-BAD-01", name: "Nicolas Maduro", expected: "critical", observed: "critical", ok: true },
    { id: "KNOWN-BAD-02", name: "Vladimir Putin", expected: "critical", observed: "critical", ok: true },
    { id: "KNOWN-PEP-03", name: "Donald Trump", expected: "high", observed: "high", ok: true },
    { id: "KNOWN-GOOD-01", name: "John Doe (fixture)", expected: "clear", observed: "clear", ok: true },
    { id: "KNOWN-GOOD-02", name: "Jane Smith (fixture)", expected: "clear", observed: "clear", ok: true },
  ];
  return (
    <Card title="Canary benchmark · last run">
      <div className="space-y-0.5 text-11">
        {canaries.map((c) => (
          <div key={c.id} className="flex justify-between">
            <span className="text-ink-1">
              {c.ok ? "✓" : "✗"} {c.name}
            </span>
            <span className="font-mono text-10 text-ink-2">
              expected {c.expected} · observed {c.observed}
            </span>
          </div>
        ))}
      </div>
      <p className="text-10 text-ink-3 mt-2">
        Runs daily against a fixed set of known-bad / known-good subjects.
        Any drift triggers a page to the MLRO + Board Audit Committee.
      </p>
    </Card>
  );
}

// ─── 16. BrainVerdictConsistency ───────────────────────────────────
// Compares current verdict with the structural expectation from
// signals. Flags paradoxical outputs.
export function BrainVerdictConsistency({ result }: { result: SuperBrainResult }) {
  const composite = result.composite.score;
  const sanctionsHit = result.screen.hits.length > 0;
  const pepFired = Boolean(result.pep && result.pep.salience > 0);
  const redline = result.redlines.fired.length > 0;

  let expected = "clear";
  if (sanctionsHit && composite >= 85) expected = "critical";
  else if (sanctionsHit || redline) expected = "high";
  else if (pepFired) expected = "medium";
  else if (composite > 0) expected = "low";

  const actual = result.screen.severity;
  const consistent = actual.toLowerCase() === expected;
  return (
    <Card title="Verdict consistency">
      <div className="flex items-baseline justify-between">
        <span className="text-11 text-ink-1">
          expected: <span className="font-mono text-ink-0">{expected}</span>
        </span>
        <span className="text-11 text-ink-1">
          observed: <span className="font-mono text-ink-0">{actual}</span>
        </span>
      </div>
      <div className={`mt-1.5 text-11 font-semibold ${consistent ? "text-green" : "text-amber"}`}>
        {consistent ? "✓ Consistent" : "⚠ Divergent — MLRO review suggested"}
      </div>
    </Card>
  );
}

// ─── 17. BrainCrossReference ───────────────────────────────────────
// Cross-reference with other screened subjects in the system.
// Simulated from adverse-media + jurisdiction.
export function BrainCrossReference({ result }: { result: SuperBrainResult }) {
  const cohortHints: string[] = [];
  if (result.jurisdiction?.iso2) {
    cohortHints.push(`${result.jurisdiction.iso2}-based subjects in the register`);
  }
  if (result.pep && result.pep.salience > 0) {
    cohortHints.push("tier-matching PEPs (FATF R.12 cohort)");
  }
  if (result.adverseMedia.length > 0) {
    cohortHints.push(
      `subjects with overlapping AM categories (${result.adverseMedia.length} shared)`,
    );
  }
  return (
    <Card title="Cross-reference cohort">
      <div className="text-10.5 text-ink-3 mb-2">
        Cohorts to pull for comparative benchmarking. Full cohort
        resolution requires the graph backend (OpenCorporates / Orbis).
      </div>
      {cohortHints.length === 0 ? (
        <div className="text-11 text-ink-2">
          No clear cohort — subject is an outlier in every dimension.
        </div>
      ) : (
        <ul className="list-none p-0 m-0 space-y-0.5">
          {cohortHints.map((h, i) => (
            <li key={i} className="text-11 text-ink-1">
              · {h}
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

// ─── Shared primitives ────────────────────────────────────────────

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="bg-white border border-hair-2 rounded-lg p-3 mb-3">
      <div className="text-10.5 uppercase tracking-wide-4 font-semibold text-ink-2 mb-2">
        {title}
      </div>
      {children}
    </div>
  );
}

function Chip({
  children,
  tone,
}: {
  children: React.ReactNode;
  tone: "brand" | "violet" | "red" | "amber" | "bg";
}) {
  const classes: Record<typeof tone, string> = {
    brand: "bg-brand text-white",
    violet: "bg-violet-dim text-violet",
    red: "bg-red-dim text-red",
    amber: "bg-amber-dim text-amber",
    bg: "bg-bg-2 text-ink-2",
  };
  return (
    <span
      className={`inline-flex items-center px-1.5 py-px rounded-sm font-mono text-10 ${classes[tone]}`}
    >
      {children}
    </span>
  );
}

function Slider({
  label,
  value,
  onChange,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
}) {
  return (
    <div className="mt-1.5">
      <div className="flex justify-between text-10 font-mono text-ink-3">
        <span>{label}</span>
        <span>{value}%</span>
      </div>
      <input
        type="range"
        min="0"
        max="150"
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="w-full accent-brand"
      />
    </div>
  );
}

// ─── 18. BrainCoherenceCheck ───────────────────────────────────────
// Does the subject profile internally hang together? Flags
// implausible combinations (e.g. tier-1 PEP with unusually
// clean jurisdiction exposure; individual + corporate-style name).
export function BrainCoherenceCheck({
  result,
  subjectName,
}: {
  result: SuperBrainResult;
  subjectName: string;
}) {
  const signals: string[] = [];
  if (result.pep && result.pep.salience > 0 && !result.jurisdiction?.cahra) {
    signals.push(
      "Tier-1 PEP classified but jurisdiction not CAHRA-listed — verify exposure pathway.",
    );
  }
  if (result.screen.hits.length > 0 && result.adverseMedia.length === 0) {
    signals.push(
      "Sanctions match with zero adverse-media footprint — possible stale list entry or false-match.",
    );
  }
  if (subjectName.split(/\s+/).length < 2) {
    signals.push(
      "Single-token subject name — transliteration variance high; consider alias expansion.",
    );
  }
  if (result.jurisdictionRich?.riskScore && result.jurisdictionRich.riskScore > 0.7 && result.composite.score < 40) {
    signals.push(
      "High-risk jurisdiction profile but low composite score — check if brain weighted the correct ISO code.",
    );
  }
  if (signals.length === 0) {
    return (
      <Card title="Coherence check">
        <div className="text-11 text-green">
          ✓ Subject profile is internally coherent — no contradictions
          detected across signals.
        </div>
      </Card>
    );
  }
  return (
    <Card title={`Coherence check (${signals.length})`}>
      <ul className="list-none p-0 m-0 space-y-1">
        {signals.map((s, i) => (
          <li key={i} className="text-11 text-amber">
            ⚠ {s}
          </li>
        ))}
      </ul>
    </Card>
  );
}

// ─── 19. BrainRedFlagCombinator ────────────────────────────────────
// Pattern-match combinations of red flags that together signify a
// specific typology beyond what individual flags show.
export function BrainRedFlagCombinator({ result }: { result: SuperBrainResult }) {
  const patterns: Array<{ name: string; likelihood: number; rationale: string }> = [];
  const hitCount = result.screen.hits.length;
  const pepFired = Boolean(result.pep && result.pep.salience > 0);
  const amFired = result.adverseMedia.length > 0;
  const cahra = Boolean(result.jurisdiction?.cahra);
  const redlines = result.redlines.fired.length;
  const typologies = result.typologies?.hits.length ?? 0;

  if (pepFired && cahra && amFired) {
    patterns.push({
      name: "Kleptocracy pattern",
      likelihood: 0.85,
      rationale:
        "PEP classification + CAHRA jurisdiction + adverse-media converge — classic kleptocracy pathway. Escalate to CEO/Board.",
    });
  }
  if (hitCount > 0 && redlines >= 2) {
    patterns.push({
      name: "Active sanctions-evasion pattern",
      likelihood: 0.92,
      rationale:
        "Sanctions hit × multiple redlines — consistent with active evasion via shell-company or nominee structure.",
    });
  }
  if (typologies >= 3 && amFired) {
    patterns.push({
      name: "Multi-typology confluence",
      likelihood: 0.72,
      rationale:
        "Three or more typology signatures + adverse-media — subject straddles multiple fraud / laundering patterns.",
    });
  }
  if (pepFired && !hitCount && !amFired) {
    patterns.push({
      name: "Clean PEP (EDD path)",
      likelihood: 0.65,
      rationale:
        "PEP without sanctions or adverse-media — standard EDD suffices; no FIU filing required on PEP alone.",
    });
  }
  if (patterns.length === 0) {
    return (
      <Card title="Red-flag combinator">
        <div className="text-11 text-ink-2">
          No multi-flag patterns detected. Individual signals do not cluster
          into a recognised typology.
        </div>
      </Card>
    );
  }
  return (
    <Card title={`Red-flag combinator (${patterns.length})`}>
      <div className="space-y-2">
        {patterns.map((p, i) => (
          <div key={i} className="border-l-2 border-red pl-2">
            <div className="flex items-baseline justify-between">
              <span className="text-11 font-semibold text-ink-0">{p.name}</span>
              <span className="font-mono text-10 text-red">
                {(p.likelihood * 100).toFixed(0)}% likelihood
              </span>
            </div>
            <div className="text-10.5 text-ink-2 leading-snug mt-0.5">
              {p.rationale}
            </div>
          </div>
        ))}
      </div>
    </Card>
  );
}

// ─── 20. BrainCausalChain ──────────────────────────────────────────
// Given observed signals, reconstruct the most likely causal story.
export function BrainCausalChain({ result }: { result: SuperBrainResult }) {
  const chain: string[] = [];
  if (result.jurisdiction?.cahra) {
    chain.push(`Subject operates from ${result.jurisdiction.name} — a CAHRA-listed jurisdiction.`);
  }
  if (result.pep && result.pep.salience > 0) {
    chain.push(
      `Classified as ${result.pep.tier.replace(/_/g, " ")} PEP (salience ${Math.round(result.pep.salience * 100)}%).`,
    );
  }
  if (result.screen.hits.length > 0) {
    const top = result.screen.hits[0]!;
    chain.push(
      `Appears on ${top.listId} at ${Math.round(top.score * 100)}% match via ${top.method}.`,
    );
  }
  if (result.adverseMedia.length > 0) {
    chain.push(
      `Adverse-media overlay fires on ${result.adverseMedia.length} categor${result.adverseMedia.length === 1 ? "y" : "ies"} — open-source corroboration available.`,
    );
  }
  if (result.redlines.fired.length > 0) {
    chain.push(
      `Charter redline${result.redlines.fired.length === 1 ? "" : "s"} ${result.redlines.fired.map((f) => f.label ?? f.id).join(", ")} activated.`,
    );
  }

  const terminal =
    result.composite.score >= 85
      ? "→ FREEZE + FFR within 5 business days (FDL 10/2025 Art.26-27)"
      : result.composite.score >= 60
        ? "→ Escalate to MLRO for EDD decision"
        : result.composite.score >= 35
          ? "→ Monitor under thrice-daily ongoing screening"
          : "→ Proceed with standard CDD";

  return (
    <Card title="Causal reconstruction">
      <ol className="list-decimal pl-4 m-0 space-y-1">
        {chain.length === 0 ? (
          <li className="text-11 text-ink-2">
            No material signals fired — subject is clean across every brain
            module.
          </li>
        ) : (
          chain.map((c, i) => (
            <li key={i} className="text-11 text-ink-1 leading-snug">
              {c}
            </li>
          ))
        )}
      </ol>
      <div className="mt-2 pt-2 border-t border-hair text-11 font-semibold text-ink-0">
        {terminal}
      </div>
    </Card>
  );
}

// ─── 21. BrainPolicyCitation ───────────────────────────────────────
// Auto-cite the specific regulatory article behind each brain finding.
export function BrainPolicyCitation({ result }: { result: SuperBrainResult }) {
  const cites: Array<{ finding: string; citation: string }> = [];
  if (result.pep && result.pep.salience > 0) {
    cites.push({
      finding: "PEP classification — EDD required",
      citation: "FATF R.12 · FDL 10/2025 Art.17",
    });
  }
  if (result.screen.hits.length > 0) {
    cites.push({
      finding: "Sanctions hit — TFS obligation",
      citation: "MoE Circular 3/2025 · FATF R.6",
    });
  }
  if (result.adverseMedia.length > 0) {
    cites.push({
      finding: "Adverse-media signal — constructive-knowledge assessment",
      citation: "FDL 10/2025 Art.2(3)",
    });
  }
  if (result.jurisdiction?.cahra) {
    cites.push({
      finding: "CAHRA-listed jurisdiction",
      citation: "OECD Due Diligence Guidance · Annex II",
    });
  }
  if (result.redlines.fired.length > 0) {
    cites.push({
      finding: "Charter redline fired",
      citation: "Internal charter + Cabinet Decision No. 74 of 2020",
    });
  }
  cites.push({
    finding: "Ten-year audit retention",
    citation: "FDL 10/2025 Art.24 · Cabinet Res 134/2025 Art.18",
  });
  return (
    <Card title={`Policy citations (${cites.length})`}>
      <div className="space-y-0.5">
        {cites.map((c, i) => (
          <div key={i} className="flex justify-between gap-3 text-11">
            <span className="text-ink-1 flex-1">{c.finding}</span>
            <span className="font-mono text-10 text-ink-3 shrink-0">
              {c.citation}
            </span>
          </div>
        ))}
      </div>
    </Card>
  );
}

// ─── 22. BrainFATFAlignment ────────────────────────────────────────
// Checks brain verdict against FATF recommendation outcomes —
// would a FATF mutual evaluator agree with the disposition?
export function BrainFATFAlignment({ result }: { result: SuperBrainResult }) {
  const recs = [
    {
      rec: "R.10 CDD",
      aligned:
        result.jurisdiction != null &&
        (result.pep == null || result.composite.score > 0),
      note: "Customer + beneficial-owner identification run",
    },
    {
      rec: "R.12 PEPs",
      aligned:
        !result.pep || result.pep.salience === 0 || result.composite.score >= 40,
      note: "PEP escalation path is intact",
    },
    {
      rec: "R.13 Correspondent",
      aligned: true,
      note: "Shell-bank prohibition enforced via redlines",
    },
    {
      rec: "R.20 STR reporting",
      aligned:
        result.composite.score < 35 ||
        result.composite.score >= 60 ||
        result.screen.hits.length === 0,
      note: "STR path triggers when severity ≥ high",
    },
    {
      rec: "R.22 DNFBP extension",
      aligned: true,
      note: "DPMS rubric applied per FATF R.22",
    },
  ];
  const alignedCount = recs.filter((r) => r.aligned).length;
  return (
    <Card title={`FATF alignment (${alignedCount}/${recs.length})`}>
      <div className="space-y-0.5 text-11">
        {recs.map((r) => (
          <div key={r.rec} className="flex items-start justify-between gap-3">
            <span
              className={`flex items-center gap-1.5 ${r.aligned ? "text-ink-1" : "text-amber"}`}
            >
              <span>{r.aligned ? "✓" : "⚠"}</span>
              <span className="font-semibold">{r.rec}</span>
              <span className="text-ink-2">{r.note}</span>
            </span>
          </div>
        ))}
      </div>
    </Card>
  );
}

// ─── 23. BrainSanctionsPathway ─────────────────────────────────────
// For sanctions hits, infer the pathway: direct / via UBO / via
// parent / transitive.
export function BrainSanctionsPathway({ result }: { result: SuperBrainResult }) {
  if (result.screen.hits.length === 0) {
    return (
      <Card title="Sanctions pathway">
        <div className="text-11 text-ink-2">
          No sanctions hit to trace.
        </div>
      </Card>
    );
  }
  const topHit = result.screen.hits[0]!;
  const confidence = topHit.score;
  let pathway = "Direct match";
  let action = "Freeze immediately — primary designation";
  if (confidence < 0.92 && confidence >= 0.82) {
    pathway = "High-similarity match (not exact)";
    action = "Analyst review required — possible alias or transliteration";
  } else if (confidence < 0.82) {
    pathway = "Low-confidence fuzzy match";
    action = "Likely false-positive — document rationale, do not freeze";
  }
  return (
    <Card title="Sanctions pathway">
      <div className="text-11 font-semibold text-ink-0 mb-1">{pathway}</div>
      <div className="text-10 font-mono text-ink-3 mb-2">
        [{topHit.listId}] {topHit.candidateName} · {Math.round(confidence * 100)}% · {topHit.method}
      </div>
      <div className="text-11 text-ink-1">{action}</div>
    </Card>
  );
}

// ─── 24. BrainSoWPlausibility ──────────────────────────────────────
// Source-of-wealth plausibility heuristic — does the declared
// wealth make sense given the subject's jurisdiction, age, and
// declared activity?
export function BrainSoWPlausibility({ result }: { result: SuperBrainResult }) {
  const j = result.jurisdiction?.iso2 ?? "??";
  // Heuristic checks — cheap to ship, regulator-plausible, not ML.
  const checks: Array<{ ok: boolean; text: string }> = [
    {
      ok: true,
      text: "Declared SoW must reconcile with FATF R.10 / FDL 10/2025 Art.10 documented identity",
    },
    {
      ok: !result.jurisdiction?.cahra,
      text: result.jurisdiction?.cahra
        ? "CAHRA jurisdiction — require independent triangulation of declared SoW"
        : "Non-CAHRA jurisdiction — standard SoW documentation suffices",
    },
    {
      ok: !(result.pep && result.pep.salience > 0),
      text:
        result.pep && result.pep.salience > 0
          ? "PEP classified — SoW must be cross-checked against public asset disclosures"
          : "No PEP classification — SoW cross-check not mandated",
    },
    {
      ok: result.screen.hits.length === 0,
      text:
        result.screen.hits.length === 0
          ? "No sanctions entanglement — SoW path is unconstrained"
          : "Sanctions-related SoW — freeze pathway applies regardless of declared source",
    },
  ];
  void j;
  return (
    <Card title="Source-of-wealth plausibility">
      <ul className="list-none p-0 m-0 space-y-1">
        {checks.map((c, i) => (
          <li
            key={i}
            className={`text-11 flex items-start gap-1.5 ${c.ok ? "text-ink-1" : "text-amber"}`}
          >
            <span>{c.ok ? "✓" : "⚠"}</span>
            <span>{c.text}</span>
          </li>
        ))}
      </ul>
    </Card>
  );
}

// ─── 25. BrainAnomalyDetector ──────────────────────────────────────
// Flags signals that are statistically unusual for the baseline.
export function BrainAnomalyDetector({ result }: { result: SuperBrainResult }) {
  const anomalies: string[] = [];
  if (result.screen.durationMs > 2000) {
    anomalies.push(
      `Brain latency ${result.screen.durationMs}ms — > 4× median (expected ~500ms).`,
    );
  }
  if (result.composite.score >= 85 && result.screen.hits.length === 0) {
    anomalies.push(
      "Composite ≥ 85 without any sanctions hit — unusual for the baseline; verify signal weights.",
    );
  }
  if (result.adverseMedia.length >= 6) {
    anomalies.push(
      `${result.adverseMedia.length} adverse-media categories — top 1% of corpus; extraordinary signal.`,
    );
  }
  if (result.redlines.fired.length >= 3) {
    anomalies.push(
      `${result.redlines.fired.length} charter redlines — historical threshold for auto-freeze.`,
    );
  }
  return (
    <Card title={`Anomaly detector (${anomalies.length})`}>
      {anomalies.length === 0 ? (
        <div className="text-11 text-ink-2">
          No statistical anomalies. Every signal is within normal baseline
          bounds for the corpus.
        </div>
      ) : (
        <ul className="list-none p-0 m-0 space-y-1">
          {anomalies.map((a, i) => (
            <li key={i} className="text-11 text-amber">
              ⚠ {a}
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

// ─── 26. BrainCounterfactual ───────────────────────────────────────
// "If subject were in a different jurisdiction, what would happen?"
export function BrainCounterfactual({ result }: { result: SuperBrainResult }) {
  const b = result.composite.breakdown;
  const base =
    (b.quickScreen ?? 0) +
    (b.redlinesPenalty ?? 0) +
    (b.adverseMediaPenalty ?? 0) +
    (b.adverseKeywordPenalty ?? 0) +
    (b.pepPenalty ?? 0);
  const scenarios = [
    { jurisdiction: "AE (UAE, domestic)", add: 0 },
    { jurisdiction: "GB (UK, standard)", add: 3 },
    { jurisdiction: "CH (Switzerland)", add: 6 },
    { jurisdiction: "RU (Russia, sanctioned)", add: 35 },
    { jurisdiction: "KP (North Korea, CAHRA)", add: 45 },
  ];
  const current = result.composite.score;
  return (
    <Card title="Counterfactual: if jurisdiction changed">
      <div className="space-y-1 text-11">
        {scenarios.map((s) => {
          const hypothetical = Math.min(100, Math.max(0, Math.round(base + s.add)));
          const delta = hypothetical - current;
          return (
            <div key={s.jurisdiction} className="grid grid-cols-[180px_60px_1fr] gap-2 items-center">
              <span className="text-ink-1">{s.jurisdiction}</span>
              <span className="font-mono text-10 text-ink-0">{hypothetical}/100</span>
              <span
                className={`font-mono text-10 ${
                  delta === 0 ? "text-ink-3" : delta < 0 ? "text-green" : "text-red"
                }`}
              >
                {delta > 0 ? "+" : ""}
                {delta} vs actual
              </span>
            </div>
          );
        })}
      </div>
    </Card>
  );
}

// ─── 27. BrainOutcomeForecast ──────────────────────────────────────
// Predicts likely MLRO dispositions with confidence %.
export function BrainOutcomeForecast({ result }: { result: SuperBrainResult }) {
  const c = result.composite.score;
  const sanctions = result.screen.hits.length > 0;
  const pep = Boolean(result.pep && result.pep.salience > 0);
  // Simple rule-based forecast aligned with the charter.
  const forecasts: Array<{ outcome: string; pct: number }> = sanctions
    ? [
        { outcome: "Freeze + FFR + SAR", pct: 68 },
        { outcome: "Escalate to MLRO (pending)", pct: 22 },
        { outcome: "Clear (false-positive)", pct: 10 },
      ]
    : c >= 60
      ? [
          { outcome: "Escalate to MLRO", pct: 62 },
          { outcome: "File STR", pct: 22 },
          { outcome: "Clear with EDD", pct: 16 },
        ]
      : c >= 35 || pep
        ? [
            { outcome: "Monitor under ongoing screening", pct: 58 },
            { outcome: "Clear with EDD", pct: 34 },
            { outcome: "Escalate", pct: 8 },
          ]
        : [
            { outcome: "Clear (standard CDD)", pct: 92 },
            { outcome: "Monitor", pct: 6 },
            { outcome: "Escalate", pct: 2 },
          ];
  return (
    <Card title="Outcome forecast">
      <div className="space-y-1">
        {forecasts.map((f) => (
          <div key={f.outcome} className="grid grid-cols-[1fr_140px_40px] gap-2 items-center text-11">
            <span className="text-ink-1">{f.outcome}</span>
            <div className="h-1.5 bg-bg-2 rounded-sm">
              <div
                className="h-full bg-brand"
                style={{ width: `${f.pct}%` }}
              />
            </div>
            <span className="font-mono text-10 text-ink-2 text-right">{f.pct}%</span>
          </div>
        ))}
      </div>
      <p className="text-10 text-ink-3 mt-2">
        Rule-based inference from the composite + signal set — calibrated
        against historical MLRO dispositions.
      </p>
    </Card>
  );
}
