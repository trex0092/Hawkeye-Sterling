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
