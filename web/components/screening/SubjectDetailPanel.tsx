"use client";

import { useEffect, useMemo, useState } from "react";
import { useQuickScreen } from "@/lib/hooks/useQuickScreen";
import { toQuickScreenSubject } from "@/lib/data/subjects";
import type { AdverseMediaMatch, Subject } from "@/lib/types";
import type {
  QuickScreenHit,
  QuickScreenResult,
  QuickScreenSeverity,
} from "@/lib/api/quickScreen.types";

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
      showFlash("Escalated to MLRO");
    }
  };

  const handleRaiseSTR = () => {
    if (strRaised) return;
    if (window.confirm(`Raise STR for ${subject.name}?`)) {
      setStrRaised(true);
      showFlash("STR raised — queued to goAML");
    }
  };

  return (
    <aside className="bg-white border-l border-hair-2 p-6 overflow-y-auto">
      <div className="mb-5 pb-4 border-b border-hair">
        <div className="flex justify-between items-center mb-2">
          <p className="text-16 font-semibold text-ink-0 m-0">{subject.name}</p>
          <div className="flex gap-1.5">
            <PanelBtn onClick={handleCopy} title="Copy subject ID">⎙</PanelBtn>
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
    return (
      <>
        {title}
        <div className="text-11 text-red bg-red-dim rounded px-3 py-2.5">
          Screening failed: {state.error}
        </div>
        {adverseMedia && <AdverseMediaRow item={adverseMedia} />}
      </>
    );
  }

  return (
    <>
      {title}
      <ScreeningSummary result={state.result} />
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

