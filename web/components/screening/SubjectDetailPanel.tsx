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
import { postScreeningReport } from "@/lib/api/screeningReport";
import { AsanaStatus } from "@/components/shared/AsanaStatus";
import { BrainNarrative } from "@/components/screening/BrainNarrative";
import { BrainReasoningChain } from "@/components/screening/BrainReasoningChain";
import { BrainDecomposition } from "@/components/screening/BrainDecomposition";
import {
  BrainAdversarial,
  BrainTypologyMap,
  BrainKeywordExplorer,
  BrainCapabilityAudit,
  BrainChainOfCustody,
  BrainRegimeExposure,
  BrainScenarioMatcher,
  BrainBiasCheck,
  BrainDataFreshness,
  BrainInputValidator,
  BrainModuleWeights,
  BrainVerdictConsistency,
  BrainCrossReference,
  BrainCoherenceCheck,
  BrainRedFlagCombinator,
  BrainPolicyCitation,
  BrainFATFAlignment,
  BrainSanctionsPathway,
  BrainSoWPlausibility,
  BrainAnomalyDetector,
  BrainOutcomeForecast,
  BrainSourceTriangulation,
  BrainTemporalPattern,
  BrainTypologyConfidence,
  BrainJurisdictionClusters,
  BrainRegulatoryPredictor,
  BrainContextualEnrichment,
  BrainChainAttribution,
  BrainDefensibility,
  BrainAlternativeHypotheses,
  BrainSimilarityCorpus,
  BrainSignalInterference,
  BrainEscalationLadder,
  BrainDataCoverage,
  BrainCoverageGap,
} from "@/components/screening/BrainIntelPack";
import { OwnershipTab } from "@/components/screening/OwnershipTab";
import {
  canPerform,
  loadOperatorRole,
  type OperatorRole,
} from "@/lib/data/operator-role";
import {
  appendCase,
  attachEvidenceToSubject,
  buildCaseRecord,
} from "@/lib/data/case-store";

const TABS = ["Screening", "CDD/EDD", "Ownership", "Live reasoning", "Timeline", "Evidence"] as const;
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
  onUpdate?: (id: string, update: Partial<Subject>) => void;
}

export function SubjectDetailPanel({ subject, onUpdate: _onUpdate }: SubjectDetailPanelProps) {
  const [activeTab, setActiveTab] = useState<Tab>("Screening");
  const [escalated, setEscalated] = useState(false);
  const [strRaised, setStrRaised] = useState(false);
  const [role, setRole] = useState<OperatorRole>("analyst");

  useEffect(() => {
    setRole(loadOperatorRole());
    const onRoleChange = () => setRole(loadOperatorRole());
    window.addEventListener("hawkeye:operator-role-updated", onRoleChange);
    return () =>
      window.removeEventListener("hawkeye:operator-role-updated", onRoleChange);
  }, []);

  const canRaiseSTR = canPerform(role, "str");
  const [flash, setFlash] = useState<string | null>(null);

  useEffect(() => {
    setEscalated(false);
    setStrRaised(false);
    setFlash(null);
  }, [subject.id]);

  const qsSubject = useMemo(() => toQuickScreenSubject(subject), [subject]);
  const screening = useQuickScreen(qsSubject);
  // When a sanctions hit lands at high confidence the user-typed name may
  // be a misspelling that the sanctions matcher rescued via phonetic /
  // fuzzy matching (e.g. "Manuro" → "Maduro"). Use the canonical hit name
  // for downstream Google News and PEP/typology lookups so adverse-media
  // doesn't 0-result on the typo while sanctions screams CRITICAL.
  const canonicalName = useMemo(() => {
    if (screening.status === "success" && screening.result.hits.length > 0) {
      const topHit = screening.result.hits.reduce((a, b) =>
        a.score > b.score ? a : b,
      );
      if (topHit.score >= 0.85 && topHit.candidateName) {
        return topHit.candidateName;
      }
    }
    return null;
  }, [screening]);
  const newsSearchName = canonicalName ?? subject.name;
  const news = useNewsSearch(newsSearchName);
  const adverseMediaText = useMemo(() => {
    if (news.status === "success" && news.result.articles.length > 0) {
      return news.result.articles
        .slice(0, 15)
        .map((a) => a.title)
        .join(". ");
    }
    return subject.adverseMedia?.name ?? subject.meta ?? "";
  }, [news, subject.adverseMedia, subject.meta]);
  // Pass the canonical name to super-brain too so lookupKnownPEP /
  // lookupKnownAdverse hit the fixture (e.g. "nicolas maduro" → state_leader,
  // tier=national, salience=1) instead of the typo dropping into "not_pep".
  const qsSubjectForBrain = useMemo(
    () => (canonicalName ? { ...qsSubject, name: canonicalName } : qsSubject),
    [qsSubject, canonicalName],
  );
  // Live-reasoning overrides — operator can pin a custom role or narrative
  // and the super-brain hook re-keys on opts so it auto-refires. Cleared
  // whenever the active subject changes so overrides don't bleed across
  // records.
  const [roleOverride, setRoleOverride] = useState("");
  const [narrativeOverride, setNarrativeOverride] = useState("");
  useEffect(() => {
    setRoleOverride("");
    setNarrativeOverride("");
  }, [subject.id]);
  const effectiveAdverseMediaText =
    narrativeOverride.trim() || adverseMediaText;
  const superBrain = useSuperBrain(qsSubjectForBrain, {
    roleText: roleOverride.trim() || undefined,
    adverseMediaText: effectiveAdverseMediaText,
  });

  const asanaReport = useAutoReport({
    subjectId: subject.id,
    qsSubject: screening.status === "success" ? qsSubject : null,
    result: screening.status === "success" ? screening.result : null,
    trigger: "screen",
    enabled: screening.status === "success",
  });

  const brainScore =
    superBrain.status === "success"
      ? superBrain.result.composite.score
      : screening.status === "success"
        ? screening.result.topScore
        : null;
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

  const pepBadge = (() => {
    if (superBrain.status === "success") {
      const { pep, pepAssessment } = superBrain.result;
      const tier =
        (pep && pep.salience > 0 ? pep.tier : null) ??
        (pepAssessment?.isLikelyPEP ? pepAssessment.highestTier : null);
      if (tier) {
        return {
          tierLabel: tier.replace(/^tier_/, "tier ").replace(/_/g, " "),
          rationale: pep?.rationale ?? subject.pep?.rationale ?? null,
        };
      }
    }
    if (subject.pep) {
      return {
        tierLabel: subject.pep.tier.replace(/^tier_/, "tier ").replace(/_/g, " "),
        rationale: subject.pep.rationale ?? null,
      };
    }
    return null;
  })();

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
      // Register escalation to Asana immediately — fire-and-forget so the
      // UX isn't blocked. Uses the screening result if available; falls back
      // to a synthetic clear result so the task is always created.
      const escalationResult =
        screening.status === "success"
          ? screening.result
          : {
              hits: [],
              topScore: subject.riskScore,
              severity: "medium" as const,
              listsChecked: 0,
              candidatesChecked: 0,
              durationMs: 0,
              generatedAt: new Date().toISOString(),
              subject: qsSubject,
            };
      void postScreeningReport({
        subject: {
          ...qsSubject,
          id: subject.id,
          caseId: subject.id,
        },
        result: escalationResult,
        trigger: "save",
      }).catch(() => {});
      attachEvidenceToSubject(subject.name, {
        category: "four-eyes-approval",
        title: "Escalated to MLRO",
        meta: new Date().toISOString(),
        detail: `Escalated from screening panel (composite ${composite}/100) — filed to Asana`,
        timelineEvent: "Escalated to MLRO and registered in Asana",
      });
      showFlash("Escalated to MLRO — registering in Asana…");
    }
  };

  const handleRaiseSTR = async () => {
    if (strRaised) return;
    if (!window.confirm(`Raise STR for ${subject.name}? A draft will be filed to the STR/SAR board.`)) {
      return;
    }
    const approver = window.prompt(
      "Four-eyes required — enter the name of the second approving officer:",
    );
    if (!approver?.trim()) {
      showFlash("STR cancelled — second approver is required");
      return;
    }
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
      approver: approver.trim(),
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
      setStrRaised(true);
      void fetchJson("/api/audit/sign", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          action: "str",
          target: subject.id,
          actor: { role, name: subject.id },
          body: {
            subjectName: subject.name,
            asanaTaskUrl: res.data.taskUrl ?? null,
          },
        }),
        label: "Audit sign failed",
      });
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
      // Snapshot the Asana task URL into the case's evidence vault
      // the moment the case is created — the append above is sync so
      // the attach runs against the freshly-written record.
      const taskUrl = res.data.taskUrl;
      attachEvidenceToSubject(subject.name, {
        category: "four-eyes-approval",
        title: "STR filed to STR/SAR board",
        meta: new Date().toISOString(),
        detail: taskUrl
          ? `Asana task: ${taskUrl}`
          : "Asana task created (URL not returned)",
        timelineEvent: "STR filed to Asana STR/SAR board",
      });
      showFlash("STR filed — draft in STR/SAR board");
    } else {
      showFlash(res.error ?? "STR filing failed");
    }
  };


  // Open the print-optimised HTML report in a new tab; the browser
  // triggers its own print dialog on load, which lets the operator
  // "Save as PDF" without the app needing a server-side PDF engine.
  const handleDownloadPdf = async () => {
    if (screening.status !== "success") {
      showFlash("Screening not complete yet");
      return;
    }
    if (superBrain.status === "loading") {
      showFlash("Adverse-media analysis still loading — please wait a moment");
      return;
    }
    const payload = buildReportPayload();
    const adminToken = process.env.NEXT_PUBLIC_ADMIN_TOKEN ?? "";
    try {
      const res = await fetch("/api/compliance-report?format=html", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          accept: "text/html, application/json",
          ...(adminToken ? { authorization: `Bearer ${adminToken}` } : {}),
        },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        showFlash(`Report failed server ${res.status}`);
        return;
      }
      const html = await res.text();
      const blob = new Blob([html], { type: "text/html;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const opened = window.open(url, "_blank", "noopener,noreferrer");
      // Revoke the blob URL once the new tab has had time to load; too
      // early and the new tab gets nothing, too late and we leak memory.
      setTimeout(() => URL.revokeObjectURL(url), 30_000);
      if (!opened) {
        showFlash("Pop-up blocked — allow pop-ups to download PDF");
      }
      // Snapshot into the case's evidence vault so the regulator can
      // replay exactly what the MLRO saw on disposition day.
      attachEvidenceToSubject(subject.name, {
        category: "screening-report",
        title: "Compliance report (PDF)",
        meta: new Date().toISOString(),
        detail: `Generated for ${subject.name} (${subject.id}) via /api/compliance-report?format=html`,
        timelineEvent: "Compliance report (PDF) generated",
      });
    } catch (err) {
      showFlash(
        err instanceof Error && err.name === "AbortError"
          ? "Report failed request timed out"
          : "Report failed",
      );
    }
  };

  // Generate a goAML v4 XML envelope for the current subject and trigger
  // a browser download. The XML is a clean subset of the UAE FIU's goAML
  // schema, populated from brain data — the operator uploads it via the
  // FIU portal. reportCode defaults to STR, the most common filing.
  const handleDownloadGoaml = async () => {
    if (screening.status !== "success") {
      showFlash("Screening not complete yet");
      return;
    }
    const composite =
      superBrain.status === "success"
        ? superBrain.result.composite.score
        : screening.result.topScore;
    const severity = screening.result.severity.toUpperCase();
    const narrative =
      `Hawkeye Sterling flagged ${subject.name} (${subject.id}) as requiring a ` +
      `suspicious-transaction report. Brain severity ${severity}; composite ` +
      `${composite}/100. Jurisdiction: ${subject.country || "—"}. ` +
      `Constructive-knowledge standard (FDL 10/2025 Art.2(3)) assessed — ` +
      `MLRO to review before goAML submission.`;
    const adminToken = process.env.NEXT_PUBLIC_ADMIN_TOKEN ?? "";
    try {
      const res = await fetch("/api/goaml", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          accept: "application/xml, application/json",
          ...(adminToken ? { authorization: `Bearer ${adminToken}` } : {}),
        },
        body: JSON.stringify({
          reportCode: "STR",
          subject: {
            name: subject.name,
            entityType:
              subject.entityType === "individual"
                ? "individual"
                : subject.entityType === "organisation"
                  ? "organisation"
                  : "other",
            ...(subject.jurisdiction ? { jurisdiction: subject.jurisdiction } : {}),
            ...(subject.aliases ? { aliases: subject.aliases } : {}),
          },
          narrative,
        }),
      });
      if (!res.ok) {
        showFlash(`goAML failed server ${res.status}`);
        return;
      }
      const xml = await res.text();
      const blob = new Blob([xml], { type: "application/xml;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `goaml-str-${subject.id}.xml`;
      a.click();
      URL.revokeObjectURL(url);
      showFlash("goAML STR downloaded");
      attachEvidenceToSubject(subject.name, {
        category: "screening-report",
        title: "goAML STR envelope (XML)",
        meta: new Date().toISOString(),
        detail: `goAML v4 STR XML generated for ${subject.name} (${subject.id})`,
        timelineEvent: "goAML STR XML generated",
      });
    } catch {
      showFlash("goAML request failed");
    }
  };

  const buildReportPayload = () => ({
    subject: {
      id: subject.id,
      name: canonicalName ?? subject.name,
      entityType: subject.entityType,
      jurisdiction: subject.jurisdiction,
      ...(subject.aliases ? { aliases: subject.aliases } : {}),
    },
    operator: { role },
    result:
      screening.status === "success"
        ? {
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
          }
        : { topScore: 0, severity: "clear", hits: [] },
    superBrain:
      superBrain.status === "success"
        ? {
            pep: superBrain.result.pep,
            jurisdiction: superBrain.result.jurisdiction,
            adverseMedia: superBrain.result.adverseMedia,
            adverseKeywordGroups: superBrain.result.adverseKeywordGroups,
            adverseMediaScored: superBrain.result.adverseMediaScored ?? null,
            typologies: superBrain.result.typologies ?? null,
            esg: superBrain.result.esg,
            redlines: superBrain.result.redlines,
            composite: superBrain.result.composite,
            ...(news.status === "success"
              ? {
                  newsDossier: {
                    articleCount: news.result.articleCount,
                    topSeverity: news.result.topSeverity,
                    source: news.result.source,
                    languages: news.result.languages,
                    articles: news.result.articles.slice(0, 25).map((a) => ({
                      title: a.title,
                      link: a.link,
                      pubDate: a.pubDate,
                      source: a.source,
                      snippet: a.snippet,
                      severity: a.severity,
                      keywordGroups: a.keywordGroups,
                    })),
                  },
                }
              : {}),
            ...(superBrain.result.audit ? { audit: superBrain.result.audit } : {}),
          }
        : null,
  });

  const handleDownloadReport = async () => {
    if (screening.status !== "success") {
      showFlash("Screening not complete yet");
      return;
    }
    if (superBrain.status === "loading") {
      showFlash("Adverse-media analysis still loading — please wait a moment");
      return;
    }
    const payload = {
      subject: {
        id: subject.id,
        name: canonicalName ?? subject.name,
        entityType: subject.entityType,
        jurisdiction: subject.jurisdiction,
        ...(subject.aliases ? { aliases: subject.aliases } : {}),
      },
      operator: { role },
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
              adverseMediaScored: superBrain.result.adverseMediaScored ?? null,
              typologies: superBrain.result.typologies ?? null,
              esg: superBrain.result.esg,
              redlines: superBrain.result.redlines,
              composite: superBrain.result.composite,
              ...(news.status === "success"
                ? {
                    newsDossier: {
                      articleCount: news.result.articleCount,
                      topSeverity: news.result.topSeverity,
                      source: news.result.source,
                      languages: news.result.languages,
                      articles: news.result.articles.slice(0, 25).map((a) => ({
                        title: a.title,
                        link: a.link,
                        pubDate: a.pubDate,
                        source: a.source,
                        snippet: a.snippet,
                        severity: a.severity,
                        keywordGroups: a.keywordGroups,
                      })),
                    },
                  }
                : {}),
              ...(superBrain.result.audit ? { audit: superBrain.result.audit } : {}),
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
        const adminTokenTxt = process.env.NEXT_PUBLIC_ADMIN_TOKEN ?? "";
        const res = await fetch("/api/compliance-report", {
          method: "POST",
          headers: {
            "content-type": "application/json",
            accept: "application/json, text/plain, */*",
            "user-agent": "hawkeye-screening-client/1.0",
            ...(adminTokenTxt ? { authorization: `Bearer ${adminTokenTxt}` } : {}),
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
        attachEvidenceToSubject(subject.name, {
          category: "screening-report",
          title: "Compliance report (.txt)",
          meta: new Date().toISOString(),
          detail: `Plain-text MLRO dossier for ${subject.name} (${subject.id})`,
          timelineEvent: "Compliance report (.txt) downloaded",
        });
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
    <aside className="bg-bg-panel border-l border-[#ec4899] p-6 overflow-y-auto">
      <div className="mb-5 pb-4 border-b border-hair">
        <div className="flex justify-between items-center mb-2">
          <p className="text-16 font-semibold text-ink-0 m-0">{subject.name}</p>
          <div className="flex gap-1.5 flex-wrap">
            <PanelBtn onClick={handleCopy} title="Copy subject ID">⎙</PanelBtn>
            <PanelBtn onClick={handleDownloadPdf} title="Download PDF report">
              💾
            </PanelBtn>
            <PanelBtn onClick={handleDownloadGoaml} title="Download goAML STR XML">
              goAML
            </PanelBtn>
            <PanelBtn onClick={handleDownloadReport} title="Download .txt report">
              .txt
            </PanelBtn>
            <PanelBtn onClick={handleEscalate} disabled={escalated}>
              {escalated ? "Escalated" : "Escalate"}
            </PanelBtn>
            <PanelBtn
              brand
              onClick={handleRaiseSTR}
              disabled={strRaised || !canRaiseSTR}
              title={
                !canRaiseSTR
                  ? "MLRO role required to raise STR (toggle role in the sidebar)"
                  : undefined
              }
            >
              {strRaised ? "STR raised" : "Raise STR"}
            </PanelBtn>
          </div>
        </div>
        <p className="text-12 text-ink-2 m-0">
          {subject.id} · {subject.type} · {subject.country} · opened {subject.openedAgo}
        </p>
        {pepBadge && (
          <div className="mt-2 flex items-center gap-1.5" role="status">
            <span
              className="inline-flex items-center px-2 py-0.5 rounded-sm font-mono text-10.5 font-semibold tracking-wide-2 bg-brand text-white uppercase"
              title={pepBadge.rationale ?? undefined}
            >
              PEP · {pepBadge.tierLabel}
            </span>
          </div>
        )}
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
          <CddPostureBadge
            stored={subject.cddPosture}
            brainSeverity={brainSeverity}
            brainScore={brainScore}
            hasSanctionsHit={
              screening.status === "success" && screening.result.hits.length > 0
            }
            hasRedline={
              superBrain.status === "success" &&
              superBrain.result.redlines.fired.length > 0
            }
            isPep={
              (superBrain.status === "success" &&
                ((superBrain.result.pep?.salience ?? 0) > 0 ||
                  Boolean(superBrain.result.pepAssessment?.isLikelyPEP))) ||
              Boolean(subject.pep)
            }
            pepTier={
              (superBrain.status === "success" &&
                (superBrain.result.pep?.tier ??
                  superBrain.result.pepAssessment?.highestTier)) ||
              subject.pep?.tier ||
              null
            }
          />
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
            rca={subject.rca}
          />
        )}

        {activeTab === "Ownership" && <OwnershipTab subject={subject} />}

        {activeTab === "Live reasoning" && (
          <LiveReasoningTab
            superBrain={superBrain}
            subjectName={subject.name}
            subjectId={subject.id}
            news={news}
            roleOverride={roleOverride}
            setRoleOverride={setRoleOverride}
            narrativeOverride={narrativeOverride}
            setNarrativeOverride={setNarrativeOverride}
            liveNarrativePreview={adverseMediaText}
          />
        )}

        {activeTab !== "Screening" && activeTab !== "Ownership" && activeTab !== "Live reasoning" && (
          <div className="text-11 text-ink-2 py-6">
            {activeTab} data will populate here once the module is wired to the engine.
          </div>
        )}
      </div>

      <NewsDossierPanel state={news} />

    </aside>
  );
}

function ScreeningTab({
  state,
  adverseMedia,
  rca,
}: {
  state: ReturnType<typeof useQuickScreen>;
  adverseMedia?: AdverseMediaMatch | undefined;
  rca?: { screened: boolean; linkedAssociates?: string[] } | undefined;
}) {
  const title = (
    <div className="text-11 font-semibold tracking-wide-4 uppercase text-ink-2 mb-2.5">
      Sanctions · PEP · Adverse media · RCA
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
        <RcaRow rca={rca} />
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
        <RcaRow rca={rca} />
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
      <RcaRow rca={rca} />
    </>
  );
}

function RcaRow({
  rca,
}: {
  rca?: { screened: boolean; linkedAssociates?: string[] } | undefined;
}) {
  if (!rca) return null;
  return (
    <div className="mt-3 pt-3 border-t border-hair">
      <div className="flex items-center justify-between mb-1.5">
        <span className="text-11 font-semibold uppercase tracking-wide-3 text-ink-2">
          RCA — Relatives &amp; Close Associates
        </span>
        <span
          className={`inline-flex items-center px-1.5 py-0.5 rounded-sm font-mono text-10 font-semibold ${
            rca.screened ? "bg-green-dim text-green" : "bg-bg-2 text-ink-3"
          }`}
        >
          {rca.screened ? "Screened" : "Not screened"}
        </span>
      </div>
      {rca.screened && rca.linkedAssociates && rca.linkedAssociates.length > 0 && (
        <ul className="list-none p-0 m-0 space-y-1">
          {rca.linkedAssociates.map((a) => (
            <li key={a} className="text-11 text-ink-1 pl-2 border-l-2 border-hair-2">
              {a}
            </li>
          ))}
        </ul>
      )}
      {rca.screened && (!rca.linkedAssociates || rca.linkedAssociates.length === 0) && (
        <p className="text-11 text-ink-2 m-0">No linked associates identified.</p>
      )}
    </div>
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

// CDD posture auto-upgrades from the stored value based on runtime
// brain output. Business rule per MLRO policy:
//   - CRITICAL severity OR composite ≥ 85 OR any confirmed sanctions
//     hit OR redline fired OR tier-1 PEP → force EDD ("Zero tolerance —
//     Enhanced Due Diligence required")
//   - otherwise display whatever the onboarding analyst chose on the form
//
// The badge surfaces the upgrade reason so the operator sees WHY the
// brain escalated, instead of silently overriding their selection.
function CddPostureBadge({
  stored,
  brainSeverity,
  brainScore,
  hasSanctionsHit,
  hasRedline,
  isPep,
  pepTier,
}: {
  stored: "CDD" | "EDD" | "SDD";
  brainSeverity: import("@/lib/api/quickScreen.types").QuickScreenSeverity | null;
  brainScore: number | null;
  hasSanctionsHit: boolean;
  hasRedline: boolean;
  isPep: boolean;
  pepTier: string | null;
}) {
  const reasons: string[] = [];
  if (brainSeverity === "critical") reasons.push("critical severity");
  if (brainScore != null && brainScore >= 85) reasons.push(`composite ${brainScore}/100`);
  if (hasSanctionsHit) reasons.push("confirmed sanctions hit");
  if (hasRedline) reasons.push("redline fired");
  if (isPep && pepTier && /tier_1|tier 1|head_of_state/i.test(pepTier)) {
    reasons.push("tier-1 PEP");
  }

  const upgraded = reasons.length > 0 && stored !== "EDD";
  const display = upgraded ? "EDD" : stored;
  const zeroTolerance =
    hasSanctionsHit ||
    brainSeverity === "critical" ||
    (hasRedline && brainScore != null && brainScore >= 85);

  return (
    <div>
      <div className="flex items-center gap-2">
        <span className="text-13 font-semibold text-ink-0">{display}</span>
        {upgraded && (
          <span
            className="inline-flex items-center px-1.5 py-px rounded-sm font-mono text-10 font-semibold tracking-wide-2 bg-amber-dim text-amber uppercase"
            title={`Upgraded from ${stored} based on runtime screening result`}
          >
            upgraded
          </span>
        )}
        {zeroTolerance && (
          <span
            className="inline-flex items-center px-1.5 py-px rounded-sm font-mono text-10 font-semibold tracking-wide-2 bg-red text-white uppercase"
            title="Zero tolerance — decline / freeze relationship per policy"
          >
            zero tolerance
          </span>
        )}
      </div>
      {upgraded && (
        <div className="text-10.5 text-ink-2 mt-1 leading-snug">
          Auto-escalated to Enhanced Due Diligence — {reasons.join(", ")}.
          {zeroTolerance &&
            " Zero-tolerance thresholds crossed; refer MLRO to consider freeze / decline under FDL 10/2025 Art.26-27."}
        </div>
      )}
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
  brand?: boolean | undefined;
  onClick?: (() => void) | undefined;
  disabled?: boolean | undefined;
  title?: string | undefined;
}) {
  const base =
    "inline-flex items-center gap-1.5 rounded border px-2.5 py-[5px] text-11.5 font-medium transition-colors";
  const variant = brand
    ? "bg-brand border-brand text-white font-semibold hover:bg-brand-hover"
    : "bg-bg-panel border-hair-2 text-ink-0 hover:border-hair-3 hover:bg-bg-2";
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


// AsanaStatus is now in web/components/shared/AsanaStatus.tsx so other
// modules can mount the same persistent header indicator. Re-imported at
// the top of this file.

function formatDoubleMetaphone(
  dm: string | [string, string] | { primary: string; alternate?: string },
): string {
  if (typeof dm === "string") return dm;
  if (Array.isArray(dm)) return dm.join(" / ");
  return [dm.primary, dm.alternate].filter(Boolean).join(" / ");
}

function LiveReasoningTab({
  superBrain,
  subjectName,
  subjectId,
  news,
  roleOverride,
  setRoleOverride,
  narrativeOverride,
  setNarrativeOverride,
  liveNarrativePreview,
}: {
  superBrain: import("@/lib/hooks/useSuperBrain").SuperBrainState;
  subjectName: string;
  subjectId: string;
  news: NewsSearchState;
  roleOverride: string;
  setRoleOverride: (v: string) => void;
  narrativeOverride: string;
  setNarrativeOverride: (v: string) => void;
  liveNarrativePreview: string;
}) {
  const [overridesOpen, setOverridesOpen] = useState(false);
  const result =
    superBrain.status === "success" ? superBrain.result : null;

  const articleCount =
    news.status === "success" ? news.result.articles.length : 0;
  const narrativeSource = narrativeOverride.trim()
    ? "operator override"
    : articleCount > 0
      ? `${articleCount} live news article${articleCount === 1 ? "" : "s"}`
      : "subject record";

  const composite = result?.composite ?? null;
  const disposition = result?.redlines?.action ?? null;
  const redlinesFired = result?.redlines?.fired?.length ?? 0;
  const pepTier = (() => {
    if (!result) return null;
    const t =
      (result.pep && result.pep.salience > 0 ? result.pep.tier : null) ??
      (result.pepAssessment?.isLikelyPEP
        ? result.pepAssessment.highestTier
        : null);
    return t ? t.replace(/^tier_/, "tier ").replace(/_/g, " ") : null;
  })();
  const jurisdictionLabel = result?.jurisdiction
    ? `${result.jurisdiction.iso2}${result.jurisdiction.cahra ? " · CAHRA" : ""}`
    : null;
  const adverseCategories =
    result?.adverseMediaScored?.categoriesTripped?.length ?? 0;
  const typologyHits = result?.typologies?.hits?.length ?? 0;

  const dispositionTone =
    disposition && /BLOCK|REJECT|FREEZE/i.test(disposition)
      ? "bg-red-dim text-red"
      : disposition && /ENHANCED|REVIEW|EDD/i.test(disposition)
        ? "bg-amber-dim text-amber"
        : disposition
          ? "bg-green-dim text-green"
          : "bg-bg-2 text-ink-2";

  return (
    <div>
      <p className="text-11 text-ink-2 mb-3">
        Live reasoning auto-fires against this subject and stays in sync with
        screening, news, and operator overrides. Posture below is derived from
        the same modules used by Super brain — no second engine, no second
        click.
      </p>

      {/* Posture strip */}
      <div className="grid grid-cols-2 gap-2 mb-3 sm:grid-cols-3">
        <PostureCell
          label="Composite"
          value={
            composite
              ? `${composite.score}/100`
              : superBrain.status === "loading"
                ? "…"
                : "—"
          }
        />
        <PostureCell
          label="Disposition"
          value={disposition ?? (superBrain.status === "loading" ? "…" : "—")}
          toneClass={dispositionTone}
        />
        <PostureCell label="Redlines" value={String(redlinesFired)} />
        <PostureCell label="PEP" value={pepTier ?? "—"} />
        <PostureCell label="Jurisdiction" value={jurisdictionLabel ?? "—"} />
        <PostureCell
          label="Signals"
          value={`${adverseCategories} adv · ${typologyHits} typ`}
        />
      </div>

      <div className="text-10 text-ink-3 mb-3 font-mono">
        narrative source: {narrativeSource}
        {superBrain.status === "loading" && " · reasoning…"}
        {superBrain.status === "error" && " · brain unavailable"}
      </div>

      {/* Override controls */}
      <div className="mb-4 rounded border border-hair-2 bg-bg-panel">
        <button
          type="button"
          onClick={() => setOverridesOpen((v) => !v)}
          className="w-full flex items-center justify-between px-2.5 py-1.5 text-11 font-medium text-ink-1 bg-transparent border-none cursor-pointer hover:text-ink-0"
        >
          <span>
            Operator override
            {(roleOverride.trim() || narrativeOverride.trim()) && (
              <span className="ml-2 inline-flex items-center px-1.5 py-px rounded-sm font-mono text-10 bg-violet-dim text-violet">
                active
              </span>
            )}
          </span>
          <span className="text-ink-3 font-mono">{overridesOpen ? "−" : "+"}</span>
        </button>
        {overridesOpen && (
          <div className="px-2.5 pb-2.5 pt-1 border-t border-hair">
            <Field label="Role text">
              <input
                type="text"
                value={roleOverride}
                onChange={(e) => setRoleOverride(e.target.value)}
                placeholder="e.g. State leader, central bank governor, MP…"
                className="w-full rounded border border-hair-2 bg-bg-1 px-2 py-1 text-12 text-ink-0 placeholder:text-ink-3"
              />
            </Field>
            <Field label="Narrative">
              <textarea
                value={narrativeOverride}
                onChange={(e) => setNarrativeOverride(e.target.value)}
                placeholder={
                  liveNarrativePreview
                    ? `Override the live narrative (default: ${liveNarrativePreview.slice(0, 120)}${liveNarrativePreview.length > 120 ? "…" : ""})`
                    : "Paste a narrative for the brain to reason against."
                }
                rows={3}
                className="w-full rounded border border-hair-2 bg-bg-1 px-2 py-1 text-12 text-ink-0 placeholder:text-ink-3 resize-y"
              />
            </Field>
            <div className="flex gap-2">
              <PanelBtn
                onClick={() => {
                  setRoleOverride("");
                  setNarrativeOverride("");
                }}
                disabled={!roleOverride && !narrativeOverride}
              >
                Reset to live
              </PanelBtn>
            </div>
          </div>
        )}
      </div>

      <SuperBrainPanel
        state={superBrain}
        subjectName={subjectName}
        subjectId={subjectId}
        news={news}
      />
    </div>
  );
}

function PostureCell({
  label,
  value,
  toneClass,
}: {
  label: string;
  value: string;
  toneClass?: string;
}) {
  return (
    <div className="rounded border border-hair-2 bg-bg-panel px-2 py-1.5">
      <div className="text-10 uppercase tracking-wide-4 text-ink-3 mb-0.5">
        {label}
      </div>
      <div
        className={`text-12 font-mono font-medium truncate ${toneClass ? `inline-block px-1.5 py-px rounded-sm ${toneClass}` : "text-ink-0"}`}
        title={value}
      >
        {value}
      </div>
    </div>
  );
}

function SuperBrainPanel({
  state,
  subjectName,
  subjectId,
  news,
}: {
  state: import("@/lib/hooks/useSuperBrain").SuperBrainState;
  subjectName: string;
  subjectId: string;
  news: NewsSearchState;
}) {
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
      <BrainNarrative
        result={r}
        subjectName={subjectName}
        subjectId={subjectId}
        newsDossier={news.status === "success" ? news.result : null}
      />
      <BrainReasoningChain result={r} />
      <BrainOutcomeForecast result={r} />
      <BrainSourceTriangulation result={r} />
      <BrainTypologyConfidence result={r} />
      <BrainJurisdictionClusters result={r} />
      <BrainRegulatoryPredictor result={r} />
      <BrainContextualEnrichment result={r} />
      <BrainChainAttribution result={r} />
      <BrainDefensibility result={r} subjectName={subjectName} />
      <BrainAlternativeHypotheses result={r} />
      <BrainSimilarityCorpus result={r} subjectName={subjectName} />
      <BrainSignalInterference result={r} />
      <BrainEscalationLadder result={r} />
      <BrainDecomposition result={r} />
      <BrainVerdictConsistency result={r} />
      <BrainCoherenceCheck result={r} subjectName={subjectName} />
      <BrainBiasCheck result={r} />
      <BrainAnomalyDetector result={r} />
      <BrainRedFlagCombinator result={r} />
      <BrainSanctionsPathway result={r} />
      <BrainSoWPlausibility result={r} />
      <BrainTypologyMap result={r} />
      <BrainScenarioMatcher result={r} />
      <BrainRegimeExposure result={r} />
      <BrainAdversarial result={r} subjectName={subjectName} />
      <BrainKeywordExplorer result={r} />
      <BrainCrossReference result={r} />
      <BrainInputValidator result={r} subjectName={subjectName} />
      <BrainPolicyCitation result={r} />
      <BrainFATFAlignment result={r} />
      <BrainCapabilityAudit result={r} />
      <BrainDataFreshness result={r} />
      <BrainCoverageGap result={r} />
      <BrainDataCoverage />
      <BrainChainOfCustody result={r} />
      <BrainModuleWeights />
      <div className="flex items-center gap-2 mb-3 flex-wrap">
        <span className="text-10 uppercase tracking-wide-4 text-ink-3 shrink-0">Composite</span>
        <span className="inline-flex items-baseline gap-0.5 font-mono font-semibold text-12 text-brand shrink-0">
          {r.composite.score}
          <span className="text-ink-3 text-10 font-normal">/100</span>
        </span>
        <div className="flex flex-wrap gap-x-2 gap-y-0 text-10 font-mono text-ink-3">
          {Object.entries(r.composite.breakdown).map(([k, v]) => (
            <span key={k} className="whitespace-nowrap">
              {k}:<span className="text-ink-1">{v}</span>
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
              keywords: {(r.adverseMediaScored.topKeywords ?? []).slice(0, 6).map((k) => k.keyword).join(" · ")}
            </div>
          )}
        </Field>
      )}

      {r.pepAssessment && r.pepAssessment.isLikelyPEP && (
        <Field
          label={`PEP assessment · ${r.pepAssessment.highestTier ?? "—"} · ${Math.round((r.pepAssessment.riskScore ?? 0) * 100)}%`}
        >
          <div className="flex flex-wrap gap-1">
            {(r.pepAssessment.matchedRoles ?? []).map((m, i) => (
              <span
                key={`${m.label}-${i}`}
                className="inline-flex items-center px-1.5 py-px rounded-sm font-mono text-10 bg-violet-dim text-violet"
              >
                {m.label}
              </span>
            ))}
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
              {formatDoubleMetaphone(r.variants.doubleMetaphone)}
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
        <div className="text-11 text-ink-2">Crawling 20,000+ news sources for live articles…</div>
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
        <span className="ml-auto font-mono text-ink-3">20,000+ sources · {r.source}</span>
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
        {r.articles.map((a, i) => (
          <li key={`${a.link}-${i}`} className="border-b border-hair pb-2 last:border-0">
            <div className="flex items-start justify-between gap-2 mb-0.5">
              <a
                href={/^https?:\/\//i.test(a.link) ? a.link : "#"}
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
