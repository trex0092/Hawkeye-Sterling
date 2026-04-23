"use client";

import { useEffect, useMemo, useState } from "react";
import { useQuickScreen } from "@/lib/hooks/useQuickScreen";
import { useAutoReport } from "@/lib/hooks/useAutoReport";
import { useSuperBrain, type SuperBrainResult } from "@/lib/hooks/useSuperBrain";
import { useNewsSearch, type NewsSearchState } from "@/lib/hooks/useNewsSearch";
import { toQuickScreenSubject } from "@/lib/data/subjects";
import type { AdverseMediaMatch, Subject } from "@/lib/types";
import type {
  QuickScreenHit,
  QuickScreenResult,
  QuickScreenSeverity,
} from "@/lib/api/quickScreen.types";
import { fetchJson } from "@/lib/api/fetchWithRetry";
import { appendCase, buildCaseRecord } from "@/lib/data/case-store";

const TABS = ["Screening", "CDD/EDD", "Ownership", "Timeline", "Evidence"] as const;
type Tab = (typeof TABS)[number];

const SEVERITY_LABEL: Record<QuickScreenSeverity, string> = {
  clear: "Clear",
  low: "Low",
  medium: "Medium",
  high: "High",
  critical: "Critical",
};

const SEVERITY_TONE: Record<QuickScreenSeverity, string> = {
  clear: "text-green",
  low: "text-blue",
  medium: "text-amber",
  high: "text-orange",
  critical: "text-red",
};

interface SubjectDetailPanelProps {
  subject: Subject;
}

export function SubjectDetailPanel({ subject }: SubjectDetailPanelProps) {
  const [activeTab, setActiveTab] = useState<Tab>("Screening");
  const [escalated, setEscalated] = useState(false);
  const [strRaised, setStrRaised] = useState(false);
  const [flash, setFlash] = useState<string | null>(null);

  useEffect(() => {
    setEscalated(false);
    setStrRaised(false);
    setFlash(null);
  }, [subject.id]);

  const qsSubject = useMemo(() => toQuickScreenSubject(subject), [subject]);
  const screening = useQuickScreen(qsSubject);
  const superBrain = useSuperBrain(qsSubject, {
    adverseMediaText: subject.adverseMedia?.name ?? subject.meta,
  });
  const news = useNewsSearch(subject.name);

  const asanaReport = useAutoReport({
    subjectId: subject.id,
    qsSubject: screening.status === "success" ? qsSubject : null,
    result: screening.status === "success" ? screening.result : null,
    trigger: "screen",
    enabled: screening.status === "success",
  });

  const brainScore =
    screening.status === "success" ? screening.result.topScore : null;
  const brainSeverity =
    screening.status === "success" ? screening.result.severity : null;
  const effectiveScore = brainScore ?? subject.riskScore;
  const barWidth = `${Math.min(effectiveScore, 100)}%`;

  const brainLists =
    screening.status === "success"
      ? Array.from(new Set(screening.result.hits.map((h) => h.listId)))
      : [];
  const effectiveLists =
    brainLists.length > 0
      ? brainLists
      : subject.listCoverage.length > 0
        ? subject.listCoverage
        : [];

  const showFlash = (msg: string) => {
    setFlash(msg);
    window.setTimeout(() => setFlash(null), 2200);
  };

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(subject.id);
      showFlash(`Copied ${subject.id}`);
    } catch {
      showFlash("Copy failed");
    }
  };

  const handleEscalate = () => {
    if (escalated) return;
    if (window.confirm(`Escalate ${subject.name} to MLRO?`)) {
      setEscalated(true);
      // Persist the escalation as a case record so it lands on /cases
      // under the "Awaiting MLRO" filter. Previously the click only
      // toggled a local flag — operators saw nothing on the Cases page.
      const composite =
        superBrain.status === "success"
          ? superBrain.result.composite.score
          : screening.status === "success"
            ? screening.result.topScore
            : subject.riskScore;
      appendCase(
        buildCaseRecord({
          subject: subject.name,
          subjectJurisdiction: subject.country || subject.jurisdiction,
          reportKind: "Escalation",
          status: "review",
          statusLabel: "Awaiting MLRO",
          statusDetail: `Escalated from screening (composite ${composite}/100)`,
        }),
      );
      showFlash("Escalated to MLRO");
    }
  };

  const handleRaiseSTR = async () => {
    if (strRaised) return;
    if (!window.confirm(`Raise STR for ${subject.name}? A draft will be filed to the STR/SAR board.`)) {
      return;
    }
    setStrRaised(true);
    showFlash("Filing STR to Asana…");
    const payload: Record<string, unknown> = {
      subject: {
        id: subject.id,
        name: subject.name,
        entityType: subject.entityType,
        jurisdiction: subject.jurisdiction,
        ...(subject.aliases ? { aliases: subject.aliases } : {}),
      },
      filingType: "STR",
    };
    if (screening.status === "success") {
      payload.result = {
        topScore: screening.result.topScore,
        severity: screening.result.severity,
        listsChecked: screening.result.listsChecked,
        candidatesChecked: screening.result.candidatesChecked,
        durationMs: screening.result.durationMs,
        generatedAt: screening.result.generatedAt,
        hits: screening.result.hits.map((h) => ({
          listId: h.listId,
          listRef: h.listRef,
          candidateName: h.candidateName,
          score: h.score,
          method: h.method,
          ...(h.programs ? { programs: h.programs } : {}),
        })),
      };
    }
    if (superBrain.status === "success") {
      payload.superBrain = {
        pep: superBrain.result.pep,
        jurisdiction: superBrain.result.jurisdiction,
        adverseKeywordGroups: superBrain.result.adverseKeywordGroups,
      };
    }
    const res = await fetchJson<{ ok: boolean; taskUrl?: string }>(
      "/api/sar-report",
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload),
        label: "STR filing failed",
      },
    );
    if (res.ok && res.data?.ok) {
      // Persist the filing as a case record so /cases shows it under
      // "Escalated to FIU" — MLRO sees the audit trail without leaving
      // the screening panel.
      appendCase(
        buildCaseRecord({
          subject: subject.name,
          subjectJurisdiction: subject.country || subject.jurisdiction,
          reportKind: "STR",
          status: "reported",
          statusLabel: "Submitted",
          statusDetail: `STR filed from screening panel`,
        }),
      );
      showFlash("STR filed — draft in STR/SAR board");
    } else {
      showFlash(res.error ?? "STR filing failed");
    }
  };

  const handleDownloadReport = async () => {
    if (screening.status !== "success") {
      showFlash("Screening not complete yet");
      return;
    }
    const payload = {
      subject: {
        id: subject.id,
        name: subject.name,
        entityType: subject.entityType,
        jurisdiction: subject.jurisdiction,
        ...(subject.aliases ? { aliases: subject.aliases } : {}),
      },
      result: {
        topScore: screening.result.topScore,
        severity: screening.result.severity,
        hits: screening.result.hits.map((h) => ({
          listId: h.listId,
          listRef: h.listRef,
          candidateName: h.candidateName,
          score: h.score,
          method: h.method,
          ...(h.programs ? { programs: h.programs } : {}),
        })),
      },
      superBrain:
        superBrain.status === "success"
          ? {
              pep: superBrain.result.pep,
              jurisdiction: superBrain.result.jurisdiction,
              adverseMedia: superBrain.result.adverseMedia,
              adverseKeywordGroups: superBrain.result.adverseKeywordGroups,
              esg: superBrain.result.esg,
              redlines: superBrain.result.redlines,
              composite: superBrain.result.composite,
            }
          : null,
    };
    // Compliance report returns a file blob, so we call fetch directly
    // with a short retry loop rather than going through fetchJson (which
    // is JSON-only). Mirrors the same 5xx / 750ms / 15s contract.
    const retries = 3;
    for (let attempt = 0; attempt <= retries; attempt += 1) {
      const ctl = new AbortController();
      const timer = setTimeout(() => ctl.abort(), 15_000);
      try {
        const res = await fetch("/api/compliance-report", {
          method: "POST",
          headers: {
            "content-type": "application/json",
            accept: "application/json, text/plain, */*",
            "user-agent": "hawkeye-screening-client/1.0",
          },
          body: JSON.stringify(payload),
          signal: ctl.signal,
        });
        if (res.status >= 500 && res.status <= 599) {
          if (attempt < retries) {
            await new Promise((r) => setTimeout(r, 750));
            continue;
          }
          showFlash(`Report failed server ${res.status}`);
          return;
        }
        if (!res.ok) {
          showFlash(`Report failed server ${res.status}`);
          return;
        }
        const blob = await res.blob();
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `hawkeye-report-${subject.id}.txt`;
        a.click();
        URL.revokeObjectURL(url);
        showFlash("Report downloaded");
        return;
      } catch (err) {
        if (attempt < retries) {
          await new Promise((r) => setTimeout(r, 750));
          continue;
        }
        showFlash(
          err instanceof Error && err.name === "AbortError"
            ? "Report failed request timed out"
            : "Report failed",
        );
        return;
      } finally {
        clearTimeout(timer);
      }
    }
  };

  return (
    <aside className="bg-white border-l border-hair-2 p-6 overflow-y-auto">
      <div className="mb-5 pb-4 border-b border-hair">
        <div className="flex justify-between items-center mb-2">
          <p className="text-16 font-semibold text-ink-0 m-0">{subject.name}</p>
          <div className="flex gap-1.5 flex-wrap">
            <PanelBtn onClick={handleCopy} title="Copy subject ID">⎙</PanelBtn>
            <PanelBtn onClick={handleDownloadReport} title="Download MLRO report">
              Report
            </PanelBtn>
            <PanelBtn onClick={handleEscalate} disabled={escalated}>
              {escalated ? "Escalated" : "Escalate"}
            </PanelBtn>
            <PanelBtn brand onClick={handleRaiseSTR} disabled={strRaised}>
              {strRaised ? "STR raised" : "Raise STR"}
            </PanelBtn>
          </div>
        </div>
        <p className="text-12 text-ink-2 m-0">
          {subject.id} · {subject.type} · {subject.country} · opened {subject.openedAgo}
        </p>
        <AsanaStatus state={asanaReport} />
        {flash && (
          <div className="mt-2 text-11 text-green font-medium" role="status">
            {flash}
          </div>
        )}
      </div>

      <Section title="Risk score">
        <div className="flex items-baseline gap-2 mb-2">
          <span className="font-display text-36 font-normal text-brand leading-none">
            {effectiveScore}
          </span>
          <span className="text-16 text-ink-3">/100</span>
          {brainSeverity && (
            <span className={`ml-2 text-11 font-semibold ${SEVERITY_TONE[brainSeverity]}`}>
              {SEVERITY_LABEL[brainSeverity]}
            </span>
          )}
        </div>
        <div className="h-1.5 bg-bg-2 rounded-sm overflow-hidden">
          <div className="h-full risk-bar-fill" style={{ width: barWidth }} />
        </div>
        <div className="mt-2 text-11 text-ink-2">
          {brainScore !== null
            ? `Brain · ${screening.status === "success" ? screening.result.hits.length : 0} hit${
                screening.status === "success" && screening.result.hits.length === 1 ? "" : "s"
              } across ${effectiveLists.length || 0} list${effectiveLists.length === 1 ? "" : "s"}`
            : screening.status === "loading"
              ? "Brain · screening…"
              : screening.status === "error"
                ? "Brain · unavailable"
                : "Brain · idle"}
        </div>
      </Section>

      <Section title="CDD posture">
        <Field label="Rating">
          <span className="text-13 font-semibold text-ink-0">{subject.cddPosture}</span>
        </Field>
      </Section>

      {effectiveLists.length > 0 && (
        <Section title="List coverage">
          <div className="flex flex-wrap gap-1">
            {effectiveLists.map((l) => (
              <span
                key={l}
                className="inline-flex items-center px-2 py-0.5 rounded-sm font-mono text-10.5 font-medium tracking-wide-2 bg-violet-dim text-violet"
              >
                {l}
              </span>
            ))}
          </div>
        </Section>
      )}

      <div className="mb-6">
        <div className="flex gap-1 mb-4 border-b border-hair">
          {TABS.map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`px-3 py-2 text-12 font-medium bg-transparent border-none border-b-2 cursor-pointer ${
                activeTab === tab
                  ? "text-ink-0 border-brand"
                  : "text-ink-2 border-transparent hover:text-ink-0"
              }`}
            >
              {tab}
            </button>
          ))}
        </div>

        {activeTab === "Screening" && (
          <ScreeningTab
            state={screening}
            adverseMedia={subject.adverseMedia}
          />
        )}

        {activeTab !== "Screening" && (
          <div className="text-11 text-ink-2 py-6">
            {activeTab} data will populate here once the module is wired to the engine.
          </div>
        )}
      </div>

      <SuperBrainPanel state={superBrain} />
      <NewsDossierPanel state={news} />

    </aside>
  );
}

function ScreeningTab({
  state,
  adverseMedia,
}: {
  state: ReturnType<typeof useQuickScreen>;
  adverseMedia?: AdverseMediaMatch | undefined;
}) {
  const title = (
    <div className="text-11 font-semibold tracking-wide-4 uppercase text-ink-2 mb-2.5">
      Sanctions &amp; adverse-media matches
    </div>
  );

  if (state.status === "idle" || state.status === "loading") {
    return (
      <>
        {title}
        <div className="text-11 text-ink-2 mb-3">Running live screening…</div>
        <div className="space-y-2">
          <SkeletonRow />
          <SkeletonRow />
          <SkeletonRow />
        </div>
        {adverseMedia && <AdverseMediaRow item={adverseMedia} />}
      </>
    );
  }

  if (state.status === "error") {
    // The hook already shapes a full human-readable message ("Screening
    // failed — server 502", "Screening failed — request timed out", etc.),
    // so we render it verbatim. Prefixing with "Screening failed:" here
    // used to produce "Screening failed: server 502" in the case file — a
    // colon-separated stack-trace-style blurb we don't want regulators to
    // see in an MLRO-facing artefact.
    return (
      <>
        {title}
        <div className="text-11 text-red bg-red-dim rounded px-3 py-2.5">
          {state.error}
        </div>
        {adverseMedia && <AdverseMediaRow item={adverseMedia} />}
      </>
    );
  }

  return (
    <>
      {title}
      <ScreeningSummary result={state.result} />
      <BrainDiagnostics result={state.result} />
      <HitsList hits={state.result.hits} />
      {adverseMedia && <AdverseMediaRow item={adverseMedia} />}
    </>
  );
}

function ScreeningSummary({ result }: { result: QuickScreenResult }) {
  return (
    <div className="text-11 text-ink-2 mb-3 flex items-center gap-3 flex-wrap">
      <span>
        {result.listsChecked} lists · {result.candidatesChecked} candidates
      </span>
      <span>·</span>
      <span>
        Top score:{" "}
        <span className="font-mono font-semibold text-ink-0">{result.topScore}</span>
      </span>
      <span>·</span>
      <span className={`font-medium ${SEVERITY_TONE[result.severity]}`}>
        {SEVERITY_LABEL[result.severity]}
      </span>
      <span className="ml-auto font-mono text-10.5 text-ink-3">
        {result.durationMs}ms
      </span>
    </div>
  );
}

function BrainDiagnostics({ result }: { result: QuickScreenResult }) {
  if (result.hits.length === 0) return null;
  const methods = Array.from(new Set(result.hits.map((h) => h.method)));
  const programs = Array.from(
    new Set(result.hits.flatMap((h) => h.programs ?? [])),
  ).slice(0, 8);
  const phoneticHits = result.hits.filter((h) => h.phoneticAgreement).length;
  return (
    <div className="bg-bg-1 border border-hair-2 rounded-lg p-3 mb-3 text-11">
      <div className="font-semibold tracking-wide-4 uppercase text-ink-2 text-10 mb-2">
        Brain diagnostics
      </div>
      <DiagRow label="Match methods">
        {methods.map((m) => (
          <Tag key={m}>{m.replace(/_/g, " ")}</Tag>
        ))}
      </DiagRow>
      <DiagRow label="Phonetic agreement">
        <span className="font-mono text-ink-0">
          {phoneticHits}/{result.hits.length}
        </span>
      </DiagRow>
      {programs.length > 0 && (
        <DiagRow label="Programs">
          {programs.map((p) => (
            <Tag key={p} tone="red">
              {p}
            </Tag>
          ))}
        </DiagRow>
      )}
      <DiagRow label="Subject fingerprint">
        <span className="font-mono text-10.5 text-ink-2">
          {result.subject.name.toLowerCase().replace(/\s+/g, "-")} ·{" "}
          {result.subject.entityType ?? "—"} ·{" "}
          {result.subject.jurisdiction ?? "—"}
        </span>
      </DiagRow>
    </div>
  );
}

function DiagRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex gap-2 py-1 items-center">
      <span className="text-ink-3 w-32 shrink-0 uppercase tracking-wide-2 text-10">
        {label}
      </span>
      <div className="flex flex-wrap gap-1">{children}</div>
    </div>
  );
}

function Tag({ children, tone }: { children: React.ReactNode; tone?: "red" }) {
  const cls =
    tone === "red"
      ? "bg-red-dim text-red"
      : "bg-violet-dim text-violet";
  return (
    <span
      className={`inline-flex items-center px-1.5 py-px rounded-sm font-mono text-10 tracking-wide-1 ${cls}`}
    >
      {children}
    </span>
  );
}

function HitsList({ hits }: { hits: QuickScreenHit[] }) {
  if (hits.length === 0) {
    return (
      <div className="text-11 text-ink-2 py-2.5">
        No sanctions matches above threshold.
      </div>
    );
  }
  return (
    <ul className="list-none p-0 m-0">
      {hits.map((hit, idx) => (
        <HitRow key={`${hit.listId}-${hit.listRef}-${idx}`} hit={hit} />
      ))}
    </ul>
  );
}

function HitRow({ hit }: { hit: QuickScreenHit }) {
  const pct = Math.round(hit.score * 100);
  return (
    <li className="py-2.5 border-b border-hair last:border-b-0">
      <div className="flex justify-between items-baseline mb-1">
        <span className="font-mono text-11 font-semibold text-ink-0">{hit.listId}</span>
        <span className="font-mono text-11 text-ink-2">{pct}%</span>
      </div>
      <div className="text-12.5 text-ink-0 mb-1">
        {hit.candidateName}
        {hit.matchedAlias ? (
          <span className="text-ink-2"> · alias "{hit.matchedAlias}"</span>
        ) : null}
      </div>
      <div className="text-11 text-ink-2">
        {hit.listRef} · {hit.reason}
      </div>
      {hit.programs && hit.programs.length > 0 && (
        <div className="flex flex-wrap gap-1 mt-1">
          {hit.programs.map((p) => (
            <span
              key={p}
              className="inline-flex items-center px-1.5 py-px rounded-sm font-mono text-10 bg-red-dim text-red tracking-wide-1"
            >
              {p}
            </span>
          ))}
        </div>
      )}
    </li>
  );
}

function AdverseMediaRow({ item }: { item: AdverseMediaMatch }) {
  return (
    <div className="bg-red-dim px-3 py-2.5 rounded-lg mt-3">
      <div className="flex justify-between items-baseline mb-1">
        <span className="font-mono text-11 font-semibold text-red">{item.source}</span>
        <span className="font-mono text-11 text-red">{item.score}%</span>
      </div>
      <div className="text-12.5 text-ink-0 mb-1">{item.name}</div>
      <div className="text-11 text-ink-2">
        {item.reference} · {item.date}
      </div>
    </div>
  );
}

function SkeletonRow() {
  return (
    <div className="py-2.5 border-b border-hair last:border-b-0">
      <div className="flex justify-between items-baseline mb-1">
        <span className="inline-block h-3 w-16 bg-bg-2 rounded-sm animate-pulse" />
        <span className="inline-block h-3 w-8 bg-bg-2 rounded-sm animate-pulse" />
      </div>
      <div className="h-3 w-48 bg-bg-2 rounded-sm animate-pulse mb-1" />
      <div className="h-2.5 w-36 bg-bg-2 rounded-sm animate-pulse" />
    </div>
  );
}

function Section({
  title,
  children,
  noMargin,
}: {
  title: string;
  children: React.ReactNode;
  noMargin?: boolean | undefined;
}) {
  return (
    <div className={noMargin ? "mt-6" : "mb-6"}>
      <div className="text-11 font-semibold tracking-wide-4 uppercase text-ink-2 mb-2.5">
        {title}
      </div>
      {children}
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="mb-3">
      <div className="text-11 font-medium uppercase tracking-wide-3 text-ink-2 mb-1">
        {label}
      </div>
      <div>{children}</div>
    </div>
  );
}

function PanelBtn({
  children,
  brand,
  onClick,
  disabled,
  title,
}: {
  children: React.ReactNode;
  brand?: boolean;
  onClick?: () => void;
  disabled?: boolean;
  title?: string;
}) {
  const base =
    "inline-flex items-center gap-1.5 rounded border px-2.5 py-[5px] text-11.5 font-medium transition-colors";
  const variant = brand
    ? "bg-brand border-brand text-white font-semibold hover:bg-brand-hover"
    : "bg-white border-hair-2 text-ink-0 hover:border-hair-3 hover:bg-bg-2";
  const interact = disabled
    ? "opacity-60 cursor-not-allowed"
    : "cursor-pointer";
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={title}
      className={`${base} ${variant} ${interact}`}
    >
      {children}
    </button>
  );
}


function AsanaStatus({ state }: { state: import("@/lib/hooks/useAutoReport").AutoReportState }) {
  if (state.status === "idle") return null;
  const base =
    "inline-flex items-center gap-1.5 mt-2 text-10.5 font-medium rounded px-2 py-0.5";
  if (state.status === "posting") {
    return (
      <span className={`${base} bg-bg-2 text-ink-2`}>
        <span className="w-1.5 h-1.5 rounded-full bg-ink-3 animate-pulse" />
        Reporting to Asana…
      </span>
    );
  }
  if (state.status === "sent") {
    return (
      <span className={`${base} bg-green-dim text-green`}>
        <span>✓</span>
        Reported to Asana
        {state.taskUrl && (
          <a
            href={state.taskUrl}
            target="_blank"
            rel="noreferrer"
            className="underline hover:text-green/80 ml-1"
          >
            view task
          </a>
        )}
      </span>
    );
  }
  return (
    <span className={`${base} bg-red-dim text-red`} title={state.error}>
      <span>!</span>
      Asana report failed
    </span>
  );
}

function SuperBrainPanel({ state }: { state: import("@/lib/hooks/useSuperBrain").SuperBrainState }) {
  if (state.status === "idle") return null;
  if (state.status === "loading") {
    return (
      <Section title="Super brain">
        <div className="text-11 text-ink-2">Fusing brain modules…</div>
      </Section>
    );
  }
  if (state.status === "error") {
    // Hook emits a complete sentence ("Super brain unavailable — server
    // 502"), so we render it as-is. Dropping the "Unavailable:" prefix
    // removes the colon-separated copy that was leaking into case files.
    return (
      <Section title="Super brain">
        <div className="text-11 text-red bg-red-dim rounded px-3 py-2.5">
          {state.error}
        </div>
      </Section>
    );
  }
  const r: SuperBrainResult = state.result;
  return (
    <Section title="Super brain">
      <div className="bg-ink-0 text-white rounded-lg p-3 mb-3">
        <div className="flex justify-between items-baseline mb-1">
          <span className="text-10.5 uppercase tracking-wide-4 text-white/50">
            Composite score
          </span>
          <span className="font-mono font-semibold text-18 text-brand">
            {r.composite.score}
            <span className="text-white/50 text-12"> /100</span>
          </span>
        </div>
        <div className="flex flex-wrap gap-x-3 gap-y-0.5 text-10.5 font-mono text-white/60">
          {Object.entries(r.composite.breakdown).map(([k, v]) => (
            <span key={k}>
              {k}: <span className="text-white">{v}</span>
            </span>
          ))}
        </div>
      </div>

      {r.jurisdiction && (
        <Field label="Jurisdiction">
          <div className="text-12 text-ink-0">
            {r.jurisdiction.name}{" "}
            <span className="font-mono text-ink-3">({r.jurisdiction.iso2})</span>
            {r.jurisdiction.cahra && (
              <span className="ml-2 inline-flex items-center px-1.5 py-px rounded-sm font-mono text-10 bg-red-dim text-red">
                CAHRA
              </span>
            )}
          </div>
          {(r.jurisdiction.regimes?.length ?? 0) > 0 && (
            <div className="flex flex-wrap gap-1 mt-1">
              {(r.jurisdiction.regimes ?? []).slice(0, 6).map((reg) => (
                <span
                  key={reg}
                  className="inline-flex items-center px-1.5 py-px rounded-sm font-mono text-10 bg-violet-dim text-violet"
                >
                  {reg}
                </span>
              ))}
            </div>
          )}
        </Field>
      )}

      {r.pep && r.pep.salience > 0 && (
        <Field label="PEP classification">
          <div className="text-12 text-ink-0">
            <span className="font-semibold">{r.pep.type.replace(/_/g, " ")}</span>{" "}
            <span className="text-ink-2">· tier {r.pep.tier}</span>{" "}
            <span className="font-mono text-ink-3">
              salience {Math.round(r.pep.salience * 100)}%
            </span>
          </div>
          {r.pep.rationale && (
            <div className="text-10.5 text-ink-2 mt-0.5">{r.pep.rationale}</div>
          )}
        </Field>
      )}

      {r.adverseMedia.length > 0 && (
        <Field label="Adverse-media categories">
          <div className="flex flex-wrap gap-1">
            {r.adverseMedia.map((am, i) => (
              <span
                key={`${am.categoryId}-${i}`}
                className="inline-flex items-center px-1.5 py-px rounded-sm font-mono text-10 bg-red-dim text-red tracking-wide-1"
                title={`keyword: ${am.keyword}`}
              >
                {am.categoryId.replace(/_/g, " ")}
              </span>
            ))}
          </div>
        </Field>
      )}

      {r.esg.length > 0 && (
        <Field label={`ESG signals (${r.esg.length})`}>
          <div className="text-10.5 text-ink-3 mb-1.5">
            Classified against SASB · EU Taxonomy · UN SDGs.
          </div>
          <div className="flex flex-col gap-1.5">
            {r.esg.map((e, i) => (
              <div
                key={`${e.categoryId}-${i}`}
                className="bg-green-dim/40 border border-green/20 rounded px-2 py-1.5"
              >
                <div className="flex items-baseline justify-between gap-2">
                  <span className="text-11 font-semibold text-green">
                    {e.label}
                  </span>
                  <span className="font-mono text-10 text-ink-3" title={`keyword: ${e.keyword}`}>
                    "{e.keyword}"
                  </span>
                </div>
                <div className="flex flex-wrap gap-1 mt-1">
                  {e.sasb && (
                    <span className="inline-flex items-center px-1.5 py-px rounded-sm font-mono text-10 bg-bg-2 text-ink-1">
                      SASB · {e.sasb}
                    </span>
                  )}
                  {e.euTaxonomy && (
                    <span className="inline-flex items-center px-1.5 py-px rounded-sm font-mono text-10 bg-blue-dim text-blue">
                      EU Tax · {e.euTaxonomy}
                    </span>
                  )}
                  {e.sdg && e.sdg.length > 0 && (
                    <span className="inline-flex items-center px-1.5 py-px rounded-sm font-mono text-10 bg-amber-dim text-amber">
                      SDG {e.sdg.join(", ")}
                    </span>
                  )}
                </div>
              </div>
            ))}
          </div>
        </Field>
      )}

      {r.redlines.fired.length > 0 && (
        <Field label="Redlines fired">
          <div className="flex flex-wrap gap-1">
            {r.redlines.fired.map((f, i) => (
              <span
                key={`${f.id ?? i}-${i}`}
                className="inline-flex items-center px-1.5 py-px rounded-sm font-mono text-10 bg-red text-white tracking-wide-1"
                title={f.why}
              >
                {f.label ?? f.id ?? "redline"}
              </span>
            ))}
          </div>
          {r.redlines.action && (
            <div className="text-10.5 text-red mt-1">Action: {r.redlines.action}</div>
          )}
        </Field>
      )}

      {(r.typologies?.hits?.length ?? 0) > 0 && r.typologies && (
        <Field
          label={`Typologies fired (${r.typologies.hits.length}) · composite ${Math.round((r.typologies.compositeScore ?? 0) * 100)}%`}
        >
          <div className="flex flex-wrap gap-1">
            {r.typologies.hits.map((t) => (
              <span
                key={t.id}
                className="inline-flex items-center px-1.5 py-px rounded-sm font-mono text-10 bg-red-dim text-red tracking-wide-1"
                title={`${t.family} · weight ${t.weight}`}
              >
                {t.name}
              </span>
            ))}
          </div>
        </Field>
      )}

      {r.jurisdictionRich && (r.jurisdictionRich.tiers?.length ?? 0) > 0 && (
        <Field
          label={`Jurisdiction profile · risk ${Math.round((r.jurisdictionRich.riskScore ?? 0) * 100)}%`}
        >
          <div className="flex flex-wrap gap-1 mb-1">
            {(r.jurisdictionRich.tiers ?? []).map((t) => (
              <span
                key={t}
                className="inline-flex items-center px-1.5 py-px rounded-sm font-mono text-10 bg-amber-dim text-amber"
              >
                {t.replace(/_/g, " ")}
              </span>
            ))}
          </div>
          {(r.jurisdictionRich.notes?.length ?? 0) > 0 && (
            <div className="text-10.5 text-ink-2 font-mono">
              {r.jurisdictionRich.notes?.[0]}
            </div>
          )}
        </Field>
      )}

      {r.adverseMediaScored && (r.adverseMediaScored.compositeScore ?? 0) > 0 && (
        <Field
          label={`Adverse-media (scored) · ${Math.round((r.adverseMediaScored.compositeScore ?? 0) * 100)}%`}
        >
          <div className="flex flex-wrap gap-1 mb-1">
            {(r.adverseMediaScored.categoriesTripped ?? []).map((c) => (
              <span
                key={c}
                className="inline-flex items-center px-1.5 py-px rounded-sm font-mono text-10 bg-red-dim text-red"
              >
                {c.replace(/_/g, " ")}
              </span>
            ))}
          </div>
          {(r.adverseMediaScored.topKeywords?.length ?? 0) > 0 && (
            <div className="text-10.5 text-ink-2 font-mono">
              keywords: {(r.adverseMediaScored.topKeywords ?? []).slice(0, 6).map(
                (k) => (typeof k === "string" ? k : (k as { keyword: string }).keyword)
              ).join(" · ")}
            </div>
          )}
        </Field>
      )}

      {r.pepAssessment && r.pepAssessment.isLikelyPEP && (
        <Field
          label={`PEP assessment · ${r.pepAssessment.highestTier ?? "—"} · ${Math.round((r.pepAssessment.riskScore ?? 0) * 100)}%`}
        >
          <div className="flex flex-wrap gap-1">
            {(r.pepAssessment.matchedRoles ?? []).map((m, i) => {
              const label = typeof m === "string" ? m : (m as { label: string }).label;
              return (
                <span
                  key={`${label}-${i}`}
                  className="inline-flex items-center px-1.5 py-px rounded-sm font-mono text-10 bg-violet-dim text-violet"
                >
                  {label}
                </span>
              );
            })}
          </div>
        </Field>
      )}

      {r.stylometry &&
        typeof r.stylometry.gaslightingScore === "number" &&
        r.stylometry.gaslightingScore > 0 && (
          <Field
            label={`Stylometry · gaslighting ${Math.round((r.stylometry.gaslightingScore ?? 0) * 100)}%`}
          >
            <div className="text-10.5 text-ink-2 font-mono">
              Narrative analysed for evasive / gaslighting phrasing.
            </div>
          </Field>
        )}

      {r.adverseKeywordGroups.length > 0 && (
        <Field label={`Adverse-keyword signals (${r.adverseKeywords.length})`}>
          <div className="flex flex-wrap gap-1 mb-2">
            {r.adverseKeywordGroups.map((g) => (
              <span
                key={g.group}
                className="inline-flex items-center gap-1 px-1.5 py-px rounded-sm font-mono text-10 bg-red text-white tracking-wide-1"
              >
                {g.label}
                <span className="bg-white/20 px-1 rounded-sm">{g.count}</span>
              </span>
            ))}
          </div>
          <div className="text-10.5 text-ink-3 font-mono truncate">
            Terms: {r.adverseKeywords.slice(0, 12).map((k) => k.term).join(" · ")}
            {r.adverseKeywords.length > 12 && ` · +${r.adverseKeywords.length - 12} more`}
          </div>
        </Field>
      )}

      <Field label="Phonetic fingerprints">
        <div className="font-mono text-10.5 text-ink-2 flex flex-wrap gap-x-3">
          <span>soundex: <span className="text-ink-0">{r.variants.soundex}</span></span>
          <span>
            dmetaphone:{" "}
            <span className="text-ink-0">
              {Array.isArray(r.variants.doubleMetaphone)
                ? r.variants.doubleMetaphone.join(" / ")
                : r.variants.doubleMetaphone}
            </span>
          </span>
        </div>
      </Field>

      {r.variants.nameVariants.length > 0 && (
        <Field label="Name variants">
          <div className="flex flex-wrap gap-1">
            {r.variants.nameVariants.slice(0, 10).map((v, i) => (
              <span
                key={`${v}-${i}`}
                className="inline-flex items-center px-1.5 py-px rounded-sm font-mono text-10 bg-bg-2 text-ink-1"
              >
                {v}
              </span>
            ))}
          </div>
        </Field>
      )}
    </Section>
  );
}

const SEVERITY_BG: Record<string, string> = {
  clear: "bg-green-dim text-green",
  low: "bg-blue-dim text-blue",
  medium: "bg-amber-dim text-amber",
  high: "bg-orange-dim text-orange",
  critical: "bg-red-dim text-red",
};

function NewsDossierPanel({ state }: { state: NewsSearchState }) {
  if (state.status === "idle") return null;
  if (state.status === "loading") {
    return (
      <Section title="Adverse-media dossier">
        <div className="text-11 text-ink-2">Crawling Google News for live articles…</div>
      </Section>
    );
  }
  // The hook transparently retries transient 5xx and falls back to an
  // empty dossier on permanent failure, so an operator-facing error
  // state is unreachable by construction. If somehow it does occur we
  // still render the neutral "no articles" empty state below rather
  // than leaking infra chatter into the MLRO's case file.
  if (state.status === "error") {
    return (
      <Section title="Adverse-media dossier">
        <div className="text-11 text-ink-2">
          No articles found in Google News.
        </div>
      </Section>
    );
  }
  const r = state.result;
  if (r.articleCount === 0) {
    return (
      <Section title="Adverse-media dossier">
        <div className="text-11 text-ink-2">
          No articles found for {r.subject} in Google News.
        </div>
      </Section>
    );
  }
  return (
    <Section title={`Adverse-media dossier (${r.articleCount})`}>
      <div className="flex items-center gap-2 mb-2 text-10.5 flex-wrap">
        <span className="text-ink-2 uppercase tracking-wide-2">Top severity:</span>
        <span className={`inline-flex items-center px-1.5 py-px rounded-sm font-mono font-semibold ${SEVERITY_BG[r.topSeverity] ?? "bg-bg-2 text-ink-1"}`}>
          {r.topSeverity}
        </span>
        {r.languages && r.languages.length > 0 && (
          <>
            <span className="text-ink-3">·</span>
            <span className="text-ink-2">Languages:</span>
            {r.languages.map((l) => (
              <span key={l} className="inline-flex items-center px-1.5 py-px rounded-sm font-mono text-10 bg-violet-dim text-violet uppercase">
                {l}
              </span>
            ))}
          </>
        )}
        <span className="ml-auto font-mono text-ink-3">source: {r.source}</span>
      </div>

      {r.keywordGroupCounts.length > 0 && (
        <div className="flex flex-wrap gap-1 mb-3">
          {r.keywordGroupCounts.map((g) => (
            <span
              key={g.group}
              className="inline-flex items-center gap-1 px-1.5 py-px rounded-sm font-mono text-10 bg-red-dim text-red tracking-wide-1"
            >
              {g.group.replace(/-/g, " ")}
              <span className="bg-red/20 px-1 rounded-sm">{g.count}</span>
            </span>
          ))}
        </div>
      )}

      <ul className="list-none p-0 m-0 space-y-2">
        {r.articles.slice(0, 10).map((a, i) => (
          <li key={`${a.link}-${i}`} className="border-b border-hair pb-2 last:border-0">
            <div className="flex items-start justify-between gap-2 mb-0.5">
              <a
                href={a.link}
                target="_blank"
                rel="noreferrer"
                className="text-11 font-semibold text-ink-0 hover:text-brand leading-snug"
              >
                {a.title || "(untitled)"}
              </a>
              <span className={`shrink-0 inline-flex items-center px-1 py-px rounded-sm font-mono text-10 ${SEVERITY_BG[a.severity] ?? "bg-bg-2 text-ink-1"}`}>
                {a.severity}
              </span>
            </div>
            <div className="text-10 text-ink-3 font-mono flex flex-wrap gap-x-2">
              <span>{a.source || "—"}</span>
              <span>· {a.pubDate ? new Date(a.pubDate).toLocaleDateString() : "—"}</span>
              <span>· <span className="uppercase text-violet">{a.lang}</span></span>
              <span>· fuzzy <span className="text-ink-0">{a.fuzzyScore}%</span> ({a.fuzzyMethod})</span>
              {a.matchedVariant && <span>· via "{a.matchedVariant}"</span>}
            </div>
            {(a.keywordGroups.length > 0 || a.esgCategories.length > 0) && (
              <div className="flex flex-wrap gap-1 mt-1">
                {a.keywordGroups.map((g) => (
                  <span
                    key={`kw-${g}`}
                    className="inline-flex items-center px-1 py-px rounded-sm font-mono text-10 bg-red-dim text-red tracking-wide-1"
                  >
                    {g.replace(/-/g, " ")}
                  </span>
                ))}
                {a.esgCategories.slice(0, 3).map((c) => (
                  <span
                    key={`esg-${c}`}
                    className="inline-flex items-center px-1 py-px rounded-sm font-mono text-10 bg-green-dim text-green tracking-wide-1"
                  >
                    ESG · {c.replace(/-/g, " ")}
                  </span>
                ))}
              </div>
            )}
          </li>
        ))}
      </ul>
    </Section>
  );
}
