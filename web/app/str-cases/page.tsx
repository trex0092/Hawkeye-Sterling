"use client";

import { useEffect, useState } from "react";
import { ModuleLayout } from "@/components/layout/ModuleLayout";
import {
  ModuleShell,
  ModuleHeader,
  ComplianceFlag,
  Kpi,
  KpiGrid,
  Card,
  CardSection,
  Field,
  ActionRow,
  Btn,
  Register,
  textInputCls,
  textareaCls,
} from "@/components/ui/ModuleShell";
import { MultiSelect, SingleSelect } from "@/components/ui/MultiSelect";
import { DateParts } from "@/components/ui/DateParts";
import {
  STR_REPORT_KINDS,
  STR_STATUSES,
  STR_RED_FLAGS,
} from "@/lib/data/str-taxonomy";
import { fetchJson } from "@/lib/api/fetchWithRetry";
import {
  appendCase,
  buildCaseRecord,
  loadCases,
} from "@/lib/data/case-store";
import {
  loadOperatorRole,
  saveOperatorRole,
  canPerform,
  ROLE_LABEL,
  ALL_ROLES,
  type OperatorRole,
} from "@/lib/data/operator-role";
import { writeAuditEvent } from "@/lib/audit";

type FlashTone = "success" | "error";
interface Flash {
  tone: FlashTone;
  msg: string;
}

interface CaseRow {
  id: string;
  title: string;
  reportKind: string;
  subject: string;
  amountAed: string;
  status: string;
  openedAt: string;
}

function AccessDeniedScreen({
  role,
  onRoleChange,
}: {
  role: OperatorRole;
  onRoleChange: (r: OperatorRole) => void;
}) {
  const elevate = (r: OperatorRole) => {
    saveOperatorRole(r);
    window.dispatchEvent(new Event("hawkeye:operator-role-updated"));
    onRoleChange(r);
  };

  return (
    <ModuleLayout asanaModule="str-cases" asanaLabel="STR / SAR Cases">
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="max-w-md text-center p-8 bg-bg-panel border border-hair-2 rounded-xl">
          <div className="text-3xl mb-4">🔒</div>
          <h2 className="text-16 font-bold text-ink-0 mb-2">
            Access restricted — FDL Art. 29
          </h2>
          <p className="text-13 text-ink-2 mb-4">
            The STR / SAR case register is restricted to Compliance Officers
            and the MLRO. Viewing this register by unauthorised personnel
            risks tipping-off the subject under investigation.
          </p>
          <div className="bg-red/10 border border-red/30 rounded-lg px-4 py-3 text-13 text-red font-medium mb-5">
            Your current role is <strong>{ROLE_LABEL[role]}</strong>. Switch
            to CO or MLRO to proceed.
          </div>
          <div className="flex justify-center gap-2 mb-5">
            {ALL_ROLES.filter((r) => canPerform(r, "str_read")).map((r) => (
              <button
                key={r}
                type="button"
                onClick={() => elevate(r)}
                className="px-4 py-1.5 rounded border border-brand text-brand text-12 font-semibold hover:bg-brand hover:text-white transition-colors"
              >
                Switch to {ROLE_LABEL[r]}
              </button>
            ))}
          </div>
          <p className="text-11 text-ink-3">
            This access attempt has been logged to the immutable audit chain.
          </p>
        </div>
      </div>
    </ModuleLayout>
  );
}

export default function StrCasesPage() {
  const [role, setRole] = useState<OperatorRole>("analyst");
  const [roleLoaded, setRoleLoaded] = useState(false);

  useEffect(() => {
    const r = loadOperatorRole();
    setRole(r);
    setRoleLoaded(true);

    // Log every access attempt to the audit chain regardless of role,
    // so there is a server-side record that this page was visited.
    // The server enforces str_read >= co — a 403 back here for analyst
    // is expected and harmless; the denied attempt is still visible in
    // the chain via the 403 status code being returned.
    const operatorName =
      typeof window !== "undefined"
        ? (window.localStorage.getItem("hawkeye.operator") ?? undefined)
        : undefined;
    fetch("/api/audit/sign", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        action: "str_read",
        target: "str-cases-page",
        actor: { role: r, name: operatorName },
        body: { at: new Date().toISOString() },
      }),
    }).catch(() => {/* non-blocking */});
  }, []);

  // Hydrate the in-page register from the shared case store so refreshing
  // this page, opening it in a new tab, or filing from elsewhere all
  // stay in sync. Previously this list was session-only state — a page
  // reload erased every filing, and the /cases module never saw them.
  const [cases, setCases] = useState<CaseRow[]>([]);
  useEffect(() => {
    if (!canPerform(role, "str_read")) return;
    setCases(
      loadCases()
        .filter((c) => c.meta?.startsWith("STR") || c.meta?.startsWith("SAR"))
        .map((c) => ({
      id: c.id,
      title: c.subject,
      reportKind: c.meta?.split(" · ")[0] ?? "STR",
      subject: c.subject,
      amountAed: "",
      status: c.statusLabel,
      openedAt: c.opened,
        })),
    );
  }, [role]);

  const [status, setStatus] = useState("Draft");
  const [reportKind, setReportKind] = useState("STR");
  const [title, setTitle] = useState("");
  const [subject, setSubject] = useState("");
  const [subjectCountry, setSubjectCountry] = useState("");
  const [amount, setAmount] = useState("");
  const [detectedOn, setDetectedOn] = useState("");
  const [deadline, setDeadline] = useState("");
  const [redFlags, setRedFlags] = useState<string[]>([]);
  const [narrative, setNarrative] = useState("");
  const [goamlRef, setGoamlRef] = useState("");
  const [mlro, setMlro] = useState("Luisa Fernanda");
  const [approver, setApprover] = useState("");
  const [noTippingOff, setNoTippingOff] = useState(true);
  const [flash, setFlash] = useState<Flash | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const open = cases.filter(
    (c) => c.status !== "Submitted" && c.status !== "Closed",
  ).length;
  const submitted = cases.filter((c) => c.status === "Submitted").length;
  const overdue = 0;

  const valid =
    title.trim().length > 0 &&
    subject.trim().length > 0 &&
    noTippingOff &&
    canPerform(role, "str");

  const clear = () => {
    setTitle("");
    setSubject("");
    setSubjectCountry("");
    setAmount("");
    setDetectedOn("");
    setDeadline("");
    setRedFlags([]);
    setNarrative("");
    setGoamlRef("");
    setApprover("");
    setStatus("Draft");
    setReportKind("STR");
    setNoTippingOff(true);
  };

  const flashFor = (tone: FlashTone, msg: string) => {
    setFlash({ tone, msg });
    if (typeof window !== "undefined") {
      window.setTimeout(() => setFlash(null), 3500);
    }
  };

  const openCase = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!valid) return;
    setSubmitting(true);
    try {
      // fetchJson handles 5xx retries (3 attempts × 750ms), 15s timeout,
      // safe JSON parsing and colon-free error copy. Previously the form
      // surfaced raw "Filing failed — server 502" on any Netlify cold
      // start — regulators saw infra chatter in the case file.
      const res = await fetchJson<{ ok: boolean; taskUrl?: string }>(
        "/api/sar-report",
        {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
            subject: {
              id: `STR-${Date.now()}`,
              name: subject.trim(),
              jurisdiction: subjectCountry.trim() || undefined,
            },
            filingType: reportKind,
            narrative: narrative.trim() || undefined,
            mlro,
            approver: approver.trim() || undefined,
      }),
      label: "Filing failed",
        },
      );
      if (!res.ok) {
        flashFor("error", res.error ?? "Filing failed");
        return;
      }
      if (res.data?.ok) {
        // Persist to the shared case store so /cases shows the filing.
        // Same record powers this page's in-module register (on next
        // hydration) via the loadCases() effect above.
        const caseStatus =
      status === "Submitted"
            ? "reported"
            : status === "Closed"
              ? "closed"
              : status === "Under review"
                ? "review"
                : "active";
        const record = buildCaseRecord({
      subject: subject.trim(),
      ...(subjectCountry.trim()
            ? { subjectJurisdiction: subjectCountry.trim() }
            : {}),
      reportKind,
      ...(amount ? { amountAed: amount } : {}),
      status: caseStatus,
      statusLabel: status,
      statusDetail: `${reportKind} filed by ${mlro || "MLRO"}`,
      ...(goamlRef.trim() ? { goAMLReference: goamlRef.trim() } : {}),
        });
        appendCase(record);

        // Immutable audit event — four-eyes sign-off recorded in chain
        writeAuditEvent(
          mlro || "MLRO",
          "str.filed",
          `${reportKind} · ${subject.trim()} · approver: ${approver.trim() || "none"} · case ${record.id}`,
        );

        flashFor("success", "Filed to STR/SAR Asana board");
        setCases((prev) => [
      {
            id: record.id,
            title: title.trim() || subject.trim(),
            reportKind,
            subject: subject.trim(),
            amountAed: amount,
            status,
            openedAt: record.opened,
      },
      ...prev,
        ]);
        clear();
      } else {
        flashFor("error", "Filing failed check Asana token");
      }
    } finally {
      setSubmitting(false);
    }
  };

  // Render nothing until role resolves to avoid FOUC on access-denied screen.
  if (!roleLoaded) return null;
  if (!canPerform(role, "str_read")) return <AccessDeniedScreen role={role} onRoleChange={setRole} />;

  return (
    <ModuleLayout asanaModule="str-cases" asanaLabel="STR / SAR Cases">
      <ModuleHeader
            title="STR Case Management"
            subtitle="Module 05 · file without delay · no tipping-off"
            dotColor="brand"
            badge={{
              label: "FDL Art. 26–27 · File without delay",
              tone: "critical",
            }}
            actions={<Btn variant="ghost">+ New case</Btn>}
      />

      <ComplianceFlag tone="green">
            No tipping off · FDL Art. 29
      </ComplianceFlag>

      <KpiGrid cols={4}>
            <Kpi value={cases.length} label="Total" tone="brand" />
            <Kpi value={open} label="Open" tone="amber" />
            <Kpi value={submitted} label="Submitted" tone="green" />
            <Kpi value={overdue} label="Overdue" tone="red" />
      </KpiGrid>

      <Card>
            <form onSubmit={openCase}>
              <CardSection title="Case identity">
                <div className="grid gap-x-3 gap-y-1.5 grid-cols-1 md:grid-cols-2">
                  <Field label="Case title">
                    <input
                      value={title}
                      onChange={(e) => setTitle(e.target.value)}
                      placeholder="Short case descriptor"
                      className={textInputCls}
                    />
                  </Field>
                  <Field label="Report kind">
                    <SingleSelect
                      options={STR_REPORT_KINDS}
                      value={reportKind}
                      onChange={setReportKind}
                    />
                  </Field>
                </div>
                <div className="grid gap-x-3 gap-y-1.5 grid-cols-1 md:grid-cols-2">
                  <Field label="Subject / entity">
                    <input
                      value={subject}
                      onChange={(e) => setSubject(e.target.value)}
                      placeholder="Customer, counterparty, or entity"
                      className={textInputCls}
                    />
                  </Field>
                  <Field label="Subject country">
                    <input
                      value={subjectCountry}
                      onChange={(e) => setSubjectCountry(e.target.value)}
                      placeholder="e.g. UAE, IN, RU"
                      className={textInputCls}
                    />
                  </Field>
                </div>
              </CardSection>

              <CardSection title="Timing & transaction value">
                <div className="grid gap-x-3 gap-y-1.5 grid-cols-1 md:grid-cols-3">
                  <Field label="Transaction amount" hint="(AED)">
                    <input
                      value={amount}
                      onChange={(e) => setAmount(e.target.value)}
                      placeholder="0.00"
                      className={textInputCls}
                    />
                  </Field>
                  <Field label="Detected on">
                    <DateParts
                      value={detectedOn}
                      onChange={setDetectedOn}
                      className={textInputCls}
                    />
                  </Field>
                  <Field label="Filing deadline" hint="without delay — FDL Art. 26–27">
                    <DateParts
                      value={deadline}
                      onChange={setDeadline}
                      className={textInputCls}
                    />
                  </Field>
                </div>
              </CardSection>

              <CardSection title="Red-flag category">
                <MultiSelect
                  groups={STR_RED_FLAGS}
                  placeholder="Select red-flag category…"
                  value={redFlags}
                  onChange={setRedFlags}
                />
              </CardSection>

              <CardSection title="Suspicion narrative">
                <Field label="Narrative">
                  <textarea
                    value={narrative}
                    onChange={(e) => setNarrative(e.target.value)}
                    placeholder="Who, what, when, where, why it is suspicious. Do NOT include tip-off-risking phrasing (FDL Art. 29)."
                    className={textareaCls}
                  />
                </Field>
              </CardSection>

              <CardSection title="Approval chain">
                <div className="grid gap-x-3 gap-y-1.5 grid-cols-1 md:grid-cols-3">
                  <Field label="goAML reference">
                    <input
                      value={goamlRef}
                      onChange={(e) => setGoamlRef(e.target.value)}
                      placeholder="e.g. RPT-2026-0001"
                      className={textInputCls}
                    />
                  </Field>
                  <Field label="MLRO (preparer)">
                    <input
                      value={mlro}
                      onChange={(e) => setMlro(e.target.value)}
                      placeholder="MLRO name"
                      className={textInputCls}
                    />
                  </Field>
                  <Field label="Four-eyes approver">
                    <input
                      value={approver}
                      onChange={(e) => setApprover(e.target.value)}
                      placeholder="Second approver"
                      className={textInputCls}
                    />
                  </Field>
                </div>
              </CardSection>

              {/* Tipping-off acknowledgment — must be checked before filing */}
              <div
                className={`mb-4 rounded-lg border px-4 py-3 ${
                  noTippingOff
                    ? "bg-green/5 border-green/30"
                    : "bg-amber/10 border-amber/40"
                }`}
              >
                <label className="flex items-start gap-3 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={noTippingOff}
                    onChange={(e) => setNoTippingOff(e.target.checked)}
                    className="accent-brand mt-0.5 shrink-0"
                  />
                  <span className="text-12 text-ink-1 leading-snug">
                    <strong>No tipping-off acknowledgment — FDL Art. 29</strong>
                    <br />I confirm that the subject of this report has not been
                    informed, directly or indirectly, that a suspicious
                    transaction report is being or has been filed. Disclosure
                    constitutes a criminal offence under UAE AML law.
                  </span>
                </label>
                {!noTippingOff && (
                  <p className="text-11 text-amber font-medium mt-2 ml-6">
                    You must acknowledge the no tipping-off obligation before
                    filing this report.
                  </p>
                )}
              </div>

              {/* MLRO-only filing notice for CO role */}
              {role === "co" && (
                <div className="mb-4 rounded-lg border border-brand/30 bg-brand/5 px-4 py-3 text-12 text-ink-1">
                  <strong>Note (CO role):</strong> You may view and prepare
                  cases but final filing requires the MLRO. Switch to MLRO role
                  in the sidebar to submit.
                </div>
              )}

              {flash && (
                <div
                  className={`text-11 font-medium mb-3 ${
                    flash.tone === "success" ? "text-green" : "text-red"
                  }`}
                  role="status"
                  aria-live="polite"
                >
                  {flash.msg}
                </div>
              )}

              <ActionRow
                left={
                  <>
                    <Btn
                      type="submit"
                      variant="primary"
                      disabled={!valid || submitting}
                      title={
                        !noTippingOff
                          ? "Acknowledge no tipping-off to enable filing"
                          : !canPerform(role, "str")
                          ? "MLRO role required to file"
                          : undefined
                      }
                    >
                      {submitting ? "Filing…" : "Open case"}
                    </Btn>
                    <Btn variant="secondary" onClick={clear}>
                      Cancel
                    </Btn>
                  </>
                }
                right={
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-10 uppercase tracking-wide-3 text-ink-2">
                      Status
                    </span>
                    <div className="w-[180px]">
                      <SingleSelect
                        options={STR_STATUSES}
                        value={status}
                        onChange={setStatus}
                      />
                    </div>
                  </div>
                }
              />
            </form>
      </Card>

      {cases.length === 0 ? (
            <Register title="Register" empty="No STR cases opened yet." />
      ) : (
            <div className="mt-8 bg-bg-panel border border-hair-2 rounded-xl overflow-hidden">
              <table className="w-full text-12">
                <thead className="bg-bg-1 border-b border-hair-2">
                  <tr>
                    <th className="text-left px-3 py-2 text-10 uppercase tracking-wide-3 text-ink-2 font-mono">
                      Case
                    </th>
                    <th className="text-left px-3 py-2 text-10 uppercase tracking-wide-3 text-ink-2 font-mono">
                      Kind
                    </th>
                    <th className="text-left px-3 py-2 text-10 uppercase tracking-wide-3 text-ink-2 font-mono">
                      Subject
                    </th>
                    <th className="text-right px-3 py-2 text-10 uppercase tracking-wide-3 text-ink-2 font-mono">
                      Amount (AED)
                    </th>
                    <th className="text-left px-3 py-2 text-10 uppercase tracking-wide-3 text-ink-2 font-mono">
                      Status
                    </th>
                    <th className="text-left px-3 py-2 text-10 uppercase tracking-wide-3 text-ink-2 font-mono">
                      Opened
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {cases.map((c) => (
                    <tr
                      key={c.id}
                      className="border-b border-hair last:border-0 hover:bg-bg-1"
                    >
                      <td className="px-3 py-2 text-ink-0">{c.title}</td>
                      <td className="px-3 py-2 font-mono text-ink-2">
                        {c.reportKind}
                      </td>
                      <td className="px-3 py-2 text-ink-0">{c.subject}</td>
                      <td className="px-3 py-2 text-right font-mono">
                        {c.amountAed || "—"}
                      </td>
                      <td className="px-3 py-2">
                        <span className="inline-flex items-center px-1.5 py-px rounded-sm font-mono text-10 bg-brand-dim text-brand-deep">
                          {c.status}
                        </span>
                      </td>
                      <td className="px-3 py-2 font-mono text-10 text-ink-3">
                        {new Date(c.openedAt).toLocaleString()}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
      )}
    </ModuleLayout>
  );
}
