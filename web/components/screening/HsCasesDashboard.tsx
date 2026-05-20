"use client";

import { useEffect, useState } from "react";

interface DashboardData {
  hsCases?: {
    total: number;
    bySeverity: { critical: number; high: number; medium: number; low: number; clear: number };
    byStatus: Record<string, number>;
    slaNearing: number;
    slaBreach: number;
    pendingFourEyes: number;
    reviewDueSoon: number;
  };
  listHealth?: {
    uaeEocnAgeHours: number | null;
    uaeLtlAgeHours: number | null;
    uaeEocnStale: boolean;
    uaeLtlStale: boolean;
  };
  breachSummary?: {
    total: number;
    open: number;
    critical: number;
    significant: number;
    moderate: number;
    minor: number;
  };
}

interface SubjectSchedule {
  subjectId: string;
  subjectName: string;
  currentRiskCategory: string;
  nextReviewDate: string;
  activeCaseId?: string;
}

interface SubjectsData {
  subjects?: SubjectSchedule[];
  reviewDueSoon?: number;
  overdue?: number;
}

export function HsCasesDashboard() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [subjects, setSubjects] = useState<SubjectsData | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const [dashRes, subRes] = await Promise.all([
          fetch("/api/dashboard", { headers: { accept: "application/json" } }),
          fetch("/api/subjects",  { headers: { accept: "application/json" } }),
        ]);
        if (dashRes.ok) {
          const json = (await dashRes.json()) as DashboardData;
          if (!cancelled) { setData(json); setError(null); }
        } else {
          if (!cancelled) setError(`${dashRes.status}`);
        }
        if (subRes.ok) {
          const sjson = (await subRes.json()) as SubjectsData;
          if (!cancelled) setSubjects(sjson);
        }
      } catch { if (!cancelled) setError("unavailable"); }
    };
    void load();
    const t = window.setInterval(() => { void load(); }, 30_000);
    return () => { cancelled = true; window.clearInterval(t); };
  }, []);

  if (error) return (
    <div className="text-11 text-red bg-red-dim border border-red/30 rounded p-2 mt-4">
      Dashboard data unavailable: {error}
    </div>
  );
  if (!data) return (
    <div className="text-11 text-ink-3 mt-4">Loading compliance dashboard…</div>
  );

  const hs = data.hsCases;
  const lh = data.listHealth;
  const bs = data.breachSummary;
  const escalatedCount = hs?.byStatus?.["escalated"] ?? 0;

  // Subjects with review due in next 7 days
  const now = Date.now();
  const sevenDays = 7 * 24 * 60 * 60 * 1000;
  const reviewDueList = (subjects?.subjects ?? []).filter((s) => {
    if (!s.nextReviewDate) return false;
    const ms = new Date(s.nextReviewDate).getTime() - now;
    return ms >= 0 && ms < sevenDays;
  }).sort((a, b) => new Date(a.nextReviewDate).getTime() - new Date(b.nextReviewDate).getTime());

  const overdueList = (subjects?.subjects ?? []).filter((s) => {
    if (!s.nextReviewDate) return false;
    return new Date(s.nextReviewDate).getTime() < now;
  });

  return (
    <div className="mt-6 space-y-4">
      {/* ── HS Cases panel ─────────────────────────────────────── */}
      {hs && (
        <div className="border border-hair-2 rounded-lg p-4 bg-bg-panel">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 rounded-full bg-brand shrink-0" />
              <span className="text-11 font-semibold uppercase tracking-wide-4 text-ink-1">
                Compliance Cases
              </span>
            </div>
            <div className="flex items-center gap-2">
              {escalatedCount > 0 && (
                <span className="inline-flex items-center gap-1 text-10 font-semibold bg-red-dim border border-red/30 text-red rounded-full px-2 py-0.5">
                  <span className="w-1 h-1 rounded-full bg-red shrink-0 animate-pulse" />
                  {escalatedCount} escalated
                </span>
              )}
              <span className="font-mono text-11 text-ink-3">{hs.total} total</span>
            </div>
          </div>

          {/* Severity counts */}
          <div className="flex gap-4 flex-wrap mb-3">
            <SeverityBadge label="CRITICAL" count={hs.bySeverity.critical} tone="red" />
            <SeverityBadge label="HIGH"     count={hs.bySeverity.high}     tone="orange" />
            <SeverityBadge label="MEDIUM"   count={hs.bySeverity.medium}   tone="amber" />
            <SeverityBadge label="LOW"      count={hs.bySeverity.low}      tone="green" />
          </div>

          {/* Alerts row */}
          <div className="flex gap-4 flex-wrap border-t border-hair-2 pt-3">
            <AlertPill
              label="SLA breach"
              count={hs.slaBreach}
              tone={hs.slaBreach > 0 ? "red" : "ok"}
            />
            <AlertPill
              label="SLA nearing (24h)"
              count={hs.slaNearing}
              tone={hs.slaNearing > 0 ? "orange" : "ok"}
            />
            <AlertPill
              label="Pending four-eyes"
              count={hs.pendingFourEyes}
              tone={hs.pendingFourEyes > 0 ? "amber" : "ok"}
            />
            <AlertPill
              label="Review due (7d)"
              count={hs.reviewDueSoon}
              tone={hs.reviewDueSoon > 0 ? "amber" : "ok"}
            />
          </div>
        </div>
      )}

      {/* ── Review schedule list ────────────────────────────────── */}
      {(reviewDueList.length > 0 || overdueList.length > 0) && (
        <div className="border border-hair-2 rounded-lg p-4 bg-bg-panel">
          <div className="flex items-center gap-1.5 mb-3">
            <span className="w-1.5 h-1.5 rounded-full bg-amber shrink-0" />
            <span className="text-11 font-semibold uppercase tracking-wide-4 text-ink-1">
              Review Schedule
            </span>
            {overdueList.length > 0 && (
              <span className="ml-auto text-10 font-semibold text-red bg-red-dim border border-red/30 rounded px-1.5 py-0.5">
                {overdueList.length} overdue
              </span>
            )}
          </div>

          {overdueList.length > 0 && (
            <div className="mb-3">
              <div className="text-10 uppercase tracking-wide-3 text-red mb-1.5 font-medium">Overdue</div>
              <div className="space-y-1">
                {overdueList.slice(0, 5).map((s) => (
                  <ReviewRow key={s.subjectId} subject={s} overdue />
                ))}
                {overdueList.length > 5 && (
                  <div className="text-10 text-ink-3 font-mono">
                    +{overdueList.length - 5} more overdue
                  </div>
                )}
              </div>
            </div>
          )}

          {reviewDueList.length > 0 && (
            <div>
              <div className="text-10 uppercase tracking-wide-3 text-amber mb-1.5 font-medium">Due within 7 days</div>
              <div className="space-y-1">
                {reviewDueList.slice(0, 8).map((s) => (
                  <ReviewRow key={s.subjectId} subject={s} />
                ))}
                {reviewDueList.length > 8 && (
                  <div className="text-10 text-ink-3 font-mono">
                    +{reviewDueList.length - 8} more due soon
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── UAE List Health ─────────────────────────────────────── */}
      {lh && (lh.uaeEocnStale || lh.uaeLtlStale) && (
        <div className="border border-red/30 bg-red-dim rounded-lg p-3 flex items-start gap-2">
          <span className="w-2 h-2 rounded-full bg-red shrink-0 mt-0.5" />
          <div>
            <div className="text-11 font-semibold text-red uppercase tracking-wide-3">
              UAE List Staleness Warning
            </div>
            <div className="text-10.5 text-ink-1 mt-0.5 font-mono">
              {lh.uaeEocnStale && `UAE EOCN: ${lh.uaeEocnAgeHours}h old (threshold 36h).`}
              {lh.uaeEocnStale && lh.uaeLtlStale && " "}
              {lh.uaeLtlStale  && `UAE LTL: ${lh.uaeLtlAgeHours}h old (threshold 36h).`}
              {" "}New screenings are marked provisional. Re-screen required after refresh.
            </div>
          </div>
        </div>
      )}

      {/* ── Breach Register summary ─────────────────────────────── */}
      {bs && bs.open > 0 && (
        <div className="border border-hair-2 rounded-lg p-4 bg-bg-panel">
          <div className="flex items-center gap-1.5 mb-3">
            <span className="w-1.5 h-1.5 rounded-full bg-red shrink-0" />
            <span className="text-11 font-semibold uppercase tracking-wide-4 text-ink-1">
              Breach Register
            </span>
            <span className="font-mono text-11 text-red ml-auto">{bs.open} open</span>
          </div>
          <div className="flex gap-4 flex-wrap">
            {bs.critical    > 0 && <BreachPill label="Critical"    count={bs.critical}    tone="red" />}
            {bs.significant > 0 && <BreachPill label="Significant" count={bs.significant} tone="orange" />}
            {bs.moderate    > 0 && <BreachPill label="Moderate"    count={bs.moderate}    tone="amber" />}
            {bs.minor       > 0 && <BreachPill label="Minor"       count={bs.minor}       tone="grey" />}
          </div>
        </div>
      )}
    </div>
  );
}

function ReviewRow({ subject, overdue }: { subject: SubjectSchedule; overdue?: boolean }) {
  const daysLeft = Math.floor((new Date(subject.nextReviewDate).getTime() - Date.now()) / 86_400_000);
  const daysOverdue = Math.floor((Date.now() - new Date(subject.nextReviewDate).getTime()) / 86_400_000);
  return (
    <div className="flex items-center gap-2 py-1 border-b border-hair-2 last:border-0">
      <span className={`text-10.5 font-medium flex-1 ${overdue ? "text-red" : "text-ink-1"}`}>
        {subject.subjectName}
      </span>
      <span className={`text-10 font-mono px-1.5 py-0.5 rounded ${
        overdue
          ? "text-red bg-red-dim border border-red/30"
          : "text-amber bg-amber-dim border border-amber/30"
      }`}>
        {overdue ? `${daysOverdue}d overdue` : `${daysLeft}d`}
      </span>
      <span className="text-10 text-ink-3 font-mono">{subject.currentRiskCategory}</span>
      {subject.activeCaseId && (
        <span className="text-10 text-brand font-mono">{subject.activeCaseId}</span>
      )}
    </div>
  );
}

function SeverityBadge({ label, count, tone }: { label: string; count: number; tone: "red"|"orange"|"amber"|"green" }) {
  const colors = {
    red:    { text: "text-red",    bg: "bg-red-dim",   border: "border-red/30" },
    orange: { text: "text-orange", bg: "bg-amber-dim", border: "border-amber/30" },
    amber:  { text: "text-amber",  bg: "bg-amber-dim", border: "border-amber/30" },
    green:  { text: "text-green",  bg: "bg-green-dim", border: "border-green/30" },
  }[tone];
  return (
    <div className={`border ${colors.border} ${colors.bg} rounded px-2.5 py-1.5`}>
      <div className={`font-mono text-16 font-semibold ${colors.text}`}>{count}</div>
      <div className="text-10 uppercase tracking-wide-3 text-ink-2 font-medium">{label}</div>
    </div>
  );
}

function AlertPill({ label, count, tone }: { label: string; count: number; tone: "red"|"orange"|"amber"|"ok" }) {
  const colors =
    tone === "red"    ? "text-red bg-red-dim border-red/30" :
    tone === "orange" ? "text-orange bg-amber-dim border-amber/30" :
    tone === "amber"  ? "text-amber bg-amber-dim border-amber/30" :
    "text-ink-3 border-hair-2";
  return (
    <div className={`border ${colors} rounded px-2 py-1 flex items-center gap-1.5`}>
      <span className="font-mono text-12 font-semibold">{count}</span>
      <span className="text-10.5 uppercase tracking-wide-2">{label}</span>
    </div>
  );
}

function BreachPill({ label, count, tone }: { label: string; count: number; tone: "red"|"orange"|"amber"|"grey" }) {
  const colors = {
    red:    "text-red bg-red-dim border-red/30",
    orange: "text-orange bg-amber-dim border-amber/30",
    amber:  "text-amber bg-amber-dim border-amber/30",
    grey:   "text-ink-2 border-hair-2",
  }[tone];
  return (
    <div className={`border ${colors} rounded px-2.5 py-1 flex items-center gap-1.5`}>
      <span className="font-mono text-13 font-semibold">{count}</span>
      <span className="text-10.5 uppercase tracking-wide-2">{label}</span>
    </div>
  );
}
