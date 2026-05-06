"use client";

// BrainIntelligencePack — surface the dispositionEngine output INSIDE the
// subject panel (not just in the PDF). Renders typology fingerprints,
// per-typology MLRO playbooks, geographic + industry + network + temporal
// risk, predicate-offence chain, anomalies, required evidence, MLRO
// interview script, document requests, calibrated confidence, and the
// counterfactual narrative — all from a single live disposition() call
// against the brain payload.

import { useMemo } from "react";
import {
  disposition,
  inferIndustryHints,
  type DispositionInputs,
  type DispositionResult,
} from "@/lib/intelligence/dispositionEngine";
import { inferIndustrySegment } from "@/lib/intelligence/industryRisk";
import type { Subject } from "@/lib/types";
import type { QuickScreenResult } from "@/lib/api/quickScreen.types";
import type { SuperBrainResult } from "@/lib/hooks/useSuperBrain";

interface Props {
  subject: Subject;
  screen: QuickScreenResult | null;
  superBrain: SuperBrainResult | null;
}

export function BrainIntelligencePack({ subject, screen, superBrain }: Props) {
  const intel: DispositionResult | null = useMemo(() => {
    if (!screen || !superBrain) return null;

    const composite = superBrain.composite?.score ?? screen.topScore ?? 0;
    const sanctionsHits = screen.hits?.length ?? 0;
    const topSanctionsScore = sanctionsHits > 0
      ? Math.max(...screen.hits.map((h) => h.score))
      : 0;
    const sanctionsLists = Array.from(new Set(screen.hits.map((h) => h.listId)));
    const pepTier =
      superBrain.pep && (superBrain.pep.salience ?? 0) > 0
        ? superBrain.pep.tier
        : null;
    const amCompositeScore = superBrain.adverseMediaScored?.compositeScore ?? -1;
    const amCount =
      (superBrain.adverseKeywordGroups?.length ?? 0) +
      (superBrain.adverseMedia?.length ?? 0);
    const amCategories =
      superBrain.adverseMediaScored?.categoriesTripped ??
      Array.from(new Set((superBrain.adverseMedia ?? []).map((a) => a.categoryId)));

    const inputs: DispositionInputs = {
      composite,
      sanctionsHits,
      topSanctionsScore,
      sanctionsLists,
      pepTier,
      ...(superBrain.pep?.salience !== undefined ? { pepSalience: superBrain.pep.salience } : {}),
      amCompositeScore,
      amCount,
      amCategoriesTripped: amCategories,
      redlinesFired: superBrain.redlines?.fired?.length ?? 0,
      jurisdictionIso2: superBrain.jurisdiction?.iso2 ?? null,
      cahra: Boolean(superBrain.jurisdiction?.cahra),
      crossRegimeSplit: Boolean(superBrain.crossRegimeConflict?.split),
      entityType: subject.entityType as DispositionInputs["entityType"],
      industryHints: inferIndustryHints(subject.name, subject.aliases ?? []),
      industrySegment: inferIndustrySegment(subject.name, subject.aliases ?? []),
    };

    return disposition(inputs);
  }, [subject, screen, superBrain]);

  if (!intel) {
    return (
      <div className="text-11 text-ink-3 italic py-3">
        Intelligence engine awaits a completed brain run.
      </div>
    );
  }

  const bandTone: Record<DispositionResult["band"], string> = {
    clear: "text-green",
    low: "text-blue",
    medium: "text-amber",
    high: "text-orange",
    critical: "text-red",
  };

  // Live server-side intelligence (phonetic / cultural / sub-national /
  // stress tests / industry / geography). Populated by /api/super-brain.
  const serverIntel = superBrain?.intelligence;
  const degradation = superBrain?.degradation ?? [];

  return (
    <div className="space-y-5 mt-4">
      {/* DEGRADATION WARNINGS */}
      {degradation.length > 0 && (
        <div className="rounded-lg border border-amber/40 bg-amber-dim/40 p-3">
          <div className="text-11 font-semibold text-amber mb-1">
            ⚠ Brain modules degraded ({degradation.length})
          </div>
          <ul className="space-y-0.5 text-10 text-ink-1">
            {degradation.map((d, i) => (
              <li key={i}>
                <span className="font-mono">{d.module}</span>: {d.reason}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* SERVER-INTELLIGENCE PHONETIC + CULTURAL */}
      {serverIntel && (
        <div className="rounded-lg border border-hair-2 bg-bg-1 p-4 space-y-3">
          <div className="text-10 uppercase tracking-wide-3 text-ink-3 font-semibold">
            Server intelligence (live pipeline)
          </div>

          {/* Phonetic fingerprint */}
          <div>
            <div className="text-10 uppercase tracking-wide-3 text-ink-3 mb-1">
              Phonetic fingerprint
            </div>
            <div className="grid grid-cols-2 gap-x-4 gap-y-0.5 text-10 font-mono">
              <div>
                <span className="text-ink-3">Caverphone</span>{" "}
                <span className="text-ink-0">{serverIntel.phonetic.caverphone || "—"}</span>
              </div>
              <div>
                <span className="text-ink-3">Beider-Morse</span>{" "}
                <span className="text-ink-0">{serverIntel.phonetic.beiderMorseLite || "—"}</span>
              </div>
              <div>
                <span className="text-ink-3">Arabic</span>{" "}
                <span className="text-ink-0">{serverIntel.phonetic.arabicPhonetic || "—"}</span>
              </div>
              <div>
                <span className="text-ink-3">Pinyin</span>{" "}
                <span className="text-ink-0">{serverIntel.phonetic.pinyinCanonical || "—"}</span>
              </div>
            </div>
          </div>

          {/* Cultural-name parse */}
          <div>
            <div className="text-10 uppercase tracking-wide-3 text-ink-3 mb-1">
              Cultural-name parse · {serverIntel.parsedName.culture}
            </div>
            <div className="text-11 text-ink-1">
              {serverIntel.parsedName.given && <span><strong>Given:</strong> {serverIntel.parsedName.given}</span>}
              {serverIntel.parsedName.surname && <span> · <strong>Surname:</strong> {serverIntel.parsedName.surname}</span>}
              {serverIntel.parsedName.nasab && <span> · <strong>Nasab:</strong> {serverIntel.parsedName.nasab}</span>}
              {serverIntel.parsedName.kunya && <span> · <strong>Kunya:</strong> {serverIntel.parsedName.kunya}</span>}
              {serverIntel.parsedName.patronymic && <span> · <strong>Patronymic:</strong> {serverIntel.parsedName.patronymic}</span>}
            </div>
            <div className="text-10 text-ink-3 font-mono mt-0.5">
              Canonical key: {serverIntel.canonicalKey}
            </div>
          </div>

          {/* Sub-national region match */}
          {serverIntel.subnational.matched && (
            <div>
              <div className="text-10 uppercase tracking-wide-3 text-red mb-1">
                Sub-national region match
              </div>
              <div className="text-11 text-red">{serverIntel.subnational.rationale}</div>
            </div>
          )}

          {/* Sanctions stress tests */}
          {serverIntel.stressTestsFiredCount > 0 && (
            <div>
              <div className="text-10 uppercase tracking-wide-3 text-red mb-1">
                Sanctions stress tests fired ({serverIntel.stressTestsFiredCount})
              </div>
              <ul className="space-y-1 text-10">
                {serverIntel.stressTests
                  .filter((s) => s.fired)
                  .map((s) => (
                    <li key={s.regime} className="text-ink-1">
                      <span className="font-semibold text-red">{s.regime}</span>:{" "}
                      {s.rationale}
                      <div className="text-ink-3 font-mono">{s.citation}</div>
                    </li>
                  ))}
              </ul>
            </div>
          )}
        </div>
      )}

      {/* HEADLINE */}
      <div className="rounded-lg border border-hair-2 bg-bg-1 p-4">
        <div className="flex items-baseline gap-3 flex-wrap">
          <div className="text-10 uppercase tracking-wide-3 text-ink-3 font-semibold">
            Intelligence verdict
          </div>
          <span className={`text-13 font-bold uppercase ${bandTone[intel.band]}`}>
            {intel.band}
          </span>
          <span className="text-11 font-mono text-ink-2">
            → {intel.recommendation.replace(/_/g, " ").toUpperCase()}
          </span>
          <span className="text-10 font-mono text-ink-3 ml-auto">
            {(intel.confidence.confidence * 100).toFixed(0)}% confidence
          </span>
        </div>
        <p className="text-11 text-ink-2 mt-2 italic">{intel.confidence.basis}</p>
      </div>

      {/* RED FLAGS */}
      {intel.redFlags.length > 0 && (
        <Section title="Red flags fired" tone="red">
          <ul className="space-y-1">
            {intel.redFlags.map((f) => (
              <li key={f} className="text-11 text-red flex items-start gap-2">
                <span className="text-red font-bold">●</span>
                <span>{f}</span>
              </li>
            ))}
          </ul>
        </Section>
      )}

      {/* BAND ESCALATIONS */}
      {intel.escalations.length > 0 && (
        <Section title="Band escalations">
          <ol className="space-y-1.5">
            {intel.escalations.map((esc, i) => (
              <li key={i} className="text-11 text-ink-1 flex items-start gap-2">
                <span className="font-mono text-10 text-ink-3">
                  {esc.from.toUpperCase()} → {esc.to.toUpperCase()}
                </span>
                <span>· {esc.reason}</span>
              </li>
            ))}
          </ol>
        </Section>
      )}

      {/* GEOGRAPHY */}
      <Section title="Geographic risk profile">
        <div className="text-11 text-ink-1">
          <strong>{intel.geography.subject.name}</strong>{" "}
          <span className="text-ink-3">({intel.geography.subject.iso2})</span>{" "}
          · inherent risk{" "}
          <span className="font-mono">
            {intel.geography.subject.inherentRisk}/100
          </span>
        </div>
        {intel.geography.subject.tiers.length > 0 && (
          <div className="flex flex-wrap gap-1 mt-1.5">
            {intel.geography.subject.tiers.map((t) => (
              <span
                key={t}
                className="inline-flex items-center px-1.5 py-px rounded-sm font-mono text-10 bg-amber-dim text-amber"
              >
                {t.replace(/_/g, " ")}
              </span>
            ))}
          </div>
        )}
        {intel.geography.subject.activeRegimes.length > 0 && (
          <div className="text-10 text-ink-3 mt-1.5">
            <strong>Active regimes:</strong>{" "}
            {intel.geography.subject.activeRegimes.join(", ")}
          </div>
        )}
        {intel.geography.subject.notes.length > 0 && (
          <ul className="mt-1.5 space-y-0.5">
            {intel.geography.subject.notes.map((n, i) => (
              <li key={i} className="text-10 text-ink-2 italic">
                · {n}
              </li>
            ))}
          </ul>
        )}
      </Section>

      {/* INDUSTRY */}
      <Section title="Industry / sector inherent risk">
        <div className="text-11 text-ink-1">
          <strong>{intel.industry.label}</strong> · inherent risk{" "}
          <span className="font-mono">{intel.industry.inherentRisk}/100</span>
        </div>
        <p className="text-10 text-ink-2 mt-1 italic">{intel.industry.rationale}</p>
        {intel.industry.typologyReferences.length > 0 && (
          <div className="text-10 text-ink-3 font-mono mt-1.5">
            {intel.industry.typologyReferences.join(" · ")}
          </div>
        )}
      </Section>

      {/* TYPOLOGIES */}
      {intel.typologies.length > 0 && (
        <Section title="Typology fingerprints (FATF / Egmont)">
          <div className="space-y-2">
            {intel.typologies.map((t) => (
              <div
                key={t.id}
                className="border border-hair-2 rounded p-2.5 bg-bg-1"
              >
                <div className="flex items-baseline justify-between gap-2 flex-wrap">
                  <div className="text-11 font-semibold text-ink-0">{t.name}</div>
                  <div className="flex items-center gap-2">
                    <span className="text-10 font-mono text-ink-3 uppercase">
                      {t.family}
                    </span>
                    <span className="text-10 font-mono font-semibold text-ink-1">
                      {Math.round(t.match * 100)}%
                    </span>
                  </div>
                </div>
                {t.evidence.length > 0 && (
                  <div className="text-10 text-ink-2 italic mt-1">
                    {t.evidence.join(" · ")}
                  </div>
                )}
              </div>
            ))}
          </div>
        </Section>
      )}

      {/* PLAYBOOKS */}
      {intel.playbooks.length > 0 && (
        <Section title="MLRO playbooks (per fired typology)">
          <div className="space-y-3">
            {intel.playbooks.map((pb) => (
              <details
                key={pb.typologyId}
                className="border border-hair-2 rounded bg-bg-1"
              >
                <summary className="cursor-pointer px-3 py-2 text-11 font-semibold text-brand">
                  {pb.typologyId.replace(/_/g, " ").toUpperCase()}
                </summary>
                <div className="px-3 pb-3 space-y-2 text-10 text-ink-1">
                  <p className="italic">{pb.summary}</p>
                  <PlaybookList label="Immediate" items={pb.immediate} />
                  <PlaybookList label="Secondary" items={pb.secondary} />
                  <PlaybookList label="Escalation triggers" items={pb.escalationTriggers} />
                  <PlaybookList label="Red lines" items={pb.redLines} tone="red" />
                  <div className="text-10 text-ink-3 font-mono pt-1 border-t border-hair-2">
                    {pb.citations.join(" · ")}
                  </div>
                </div>
              </details>
            ))}
          </div>
        </Section>
      )}

      {/* PREDICATE OFFENCES */}
      {intel.predicateOffences.length > 0 && (
        <Section title="FATF predicate offences implied">
          <ul className="space-y-1">
            {intel.predicateOffences.map((p) => (
              <li key={p.id} className="text-11 text-ink-1">
                <strong>{p.label}</strong>
                <div className="text-10 text-ink-3 font-mono">
                  {p.fatfReference} · {p.uaeBasis}
                </div>
              </li>
            ))}
          </ul>
        </Section>
      )}

      {/* ANOMALIES */}
      {intel.anomalies.length > 0 && (
        <Section title="Anomaly flags" tone="amber">
          <ul className="space-y-1">
            {intel.anomalies.map((a, i) => (
              <li key={i} className="text-10 text-amber">
                · {a}
              </li>
            ))}
          </ul>
        </Section>
      )}

      {/* REQUIRED EVIDENCE */}
      {intel.requiredEvidence.length > 0 && (
        <Section title="Required evidence">
          <ul className="space-y-1">
            {intel.requiredEvidence.map((ev, i) => (
              <li key={i} className="text-11 text-ink-1 flex items-start gap-2">
                <span className="text-ink-3">·</span>
                <span>{ev}</span>
              </li>
            ))}
          </ul>
        </Section>
      )}

      {/* DOCUMENT REQUESTS */}
      {intel.documentRequests.length > 0 && (
        <Section title="Documents to request">
          <ul className="space-y-1">
            {intel.documentRequests.map((d) => (
              <li key={d.id} className="text-11 text-ink-1">
                <strong>{d.document}</strong>
                <div className="text-10 text-ink-3 italic">{d.why}</div>
              </li>
            ))}
          </ul>
        </Section>
      )}

      {/* INTERVIEW SCRIPT */}
      {intel.interviewScript.length > 0 && (
        <Section title="MLRO interview script">
          <ol className="space-y-2 list-decimal list-inside">
            {intel.interviewScript.map((q) => (
              <li key={q.id} className="text-11 text-ink-1">
                <span>{q.question}</span>
                <div className="text-10 text-ink-3 italic mt-0.5">
                  Why: {q.rationale}
                </div>
              </li>
            ))}
          </ol>
        </Section>
      )}

      {/* COUNTERFACTUAL */}
      <Section title="Counterfactual">
        <p className="text-11 text-ink-1 italic">{intel.counterfactual}</p>
      </Section>
    </div>
  );
}

function Section({
  title,
  children,
  tone,
}: {
  title: string;
  children: React.ReactNode;
  tone?: "red" | "amber";
}) {
  const titleCls =
    tone === "red"
      ? "text-red"
      : tone === "amber"
        ? "text-amber"
        : "text-ink-2";
  return (
    <div>
      <div
        className={`text-10 font-semibold uppercase tracking-wide-3 mb-2 ${titleCls}`}
      >
        {title}
      </div>
      {children}
    </div>
  );
}

function PlaybookList({
  label,
  items,
  tone,
}: {
  label: string;
  items: string[];
  tone?: "red";
}) {
  if (!items || items.length === 0) return null;
  const labelCls = tone === "red" ? "text-red" : "text-ink-3";
  return (
    <div>
      <div className={`text-9 font-semibold uppercase tracking-wide-3 ${labelCls} mb-1`}>
        {label}
      </div>
      <ul className="space-y-0.5 pl-3 list-disc">
        {items.map((it, i) => (
          <li key={i} className="text-10 text-ink-1">
            {it}
          </li>
        ))}
      </ul>
    </div>
  );
}
