"use client";

/**
 * DeepIntelPanel — 20 intelligence features for the Deep Intel tab.
 *
 * Features are organized into 6 groups of collapsible IntelSection cards.
 * Each section is independently triggerable (lazy — no auto-fire on mount).
 */

import { useRef, useState } from "react";
import type { Subject } from "@/lib/types";
import type { QuickScreenResult } from "@/lib/api/quickScreen.types";
import type { SuperBrainResult } from "@/lib/hooks/useSuperBrain";

// ─── Props ────────────────────────────────────────────────────────────────────

interface Props {
  subject: Subject;
  screen: QuickScreenResult | null;
  superBrain: SuperBrainResult | null;
}

// ─── Section status ───────────────────────────────────────────────────────────

type SectionStatus = "idle" | "loading" | "done" | "error";

// ─── Shared small components ──────────────────────────────────────────────────

function StatusBadge({ status }: { status: SectionStatus }) {
  if (status === "idle") return <span className="text-10 font-mono text-ink-3 border border-hair-2 rounded px-1.5 py-0.5">idle</span>;
  if (status === "loading") return <span className="text-10 font-mono text-amber border border-amber/40 bg-amber-dim/30 rounded px-1.5 py-0.5 animate-pulse">loading…</span>;
  if (status === "done") return <span className="text-10 font-mono text-green border border-green/40 bg-green-dim/30 rounded px-1.5 py-0.5">done</span>;
  return <span className="text-10 font-mono text-red border border-red/40 bg-red-dim/30 rounded px-1.5 py-0.5">error</span>;
}

function RunBtn({ onClick, disabled }: { onClick: () => void; disabled?: boolean }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded text-11 font-semibold bg-brand-dim text-brand border border-brand/30 hover:opacity-80 disabled:opacity-40 transition-opacity"
    >
      Run
    </button>
  );
}

function ErrorBox({ msg }: { msg: string }) {
  return (
    <div className="mt-2 text-11 text-red bg-red-dim rounded px-2 py-1 font-mono">{msg}</div>
  );
}

function JsonTree({ data }: { data: unknown }) {
  return (
    <pre className="text-10 font-mono text-ink-2 bg-bg-2 rounded p-2 overflow-x-auto whitespace-pre-wrap break-all max-h-64">
      {JSON.stringify(data, null, 2)}
    </pre>
  );
}

// ─── Collapsible IntelSection ────────────────────────────────────────────────

function IntelSection({
  title,
  icon,
  status,
  children,
}: {
  title: string;
  icon: string;
  status: SectionStatus;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  return (
    <div className="bg-bg-panel border border-hair-2 rounded-lg overflow-hidden">
      <button
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center justify-between px-4 py-3 text-left hover:bg-bg-2/40 transition-colors"
      >
        <span className="flex items-center gap-2 text-12 font-semibold text-ink-0">
          <span className="text-14">{icon}</span>
          {title}
        </span>
        <span className="flex items-center gap-2">
          <StatusBadge status={status} />
          <span className="text-ink-3 text-12">{open ? "▲" : "▼"}</span>
        </span>
      </button>
      {open && (
        <div className="px-4 pb-4 pt-1 border-t border-hair-2">
          {children}
        </div>
      )}
    </div>
  );
}

// ─── Group header ────────────────────────────────────────────────────────────

function GroupHeader({ label }: { label: string }) {
  return (
    <div className="text-10 uppercase tracking-widest font-semibold text-brand pt-2 pb-1 pl-1">
      {label}
    </div>
  );
}

// ─── 1. Name Variant Engine ───────────────────────────────────────────────────

interface NameVariantsResult {
  canonicalName: string;
  variants: string[];
  transliterations: string[];
  patronymics: string[];
  maidenNames: string[];
  aliases: string[];
  entityVariants: string[];
  screeningStrings: string[];
  scriptVariants: string[];
  notes: string;
}

function NameVariantSection({ subject, screen }: { subject: Subject; screen: QuickScreenResult | null }) {
  const [status, setStatus] = useState<SectionStatus>("idle");
  const [result, setResult] = useState<NameVariantsResult | null>(null);
  const [error, setError] = useState<string>("");

  async function run() {
    setStatus("loading");
    setError("");
    try {
      const res = await fetch("/api/name-variants", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name: subject.name, nationality: subject.country || subject.jurisdiction }),
      });
      const data = (await res.json()) as NameVariantsResult & { ok?: boolean; error?: string };
      if (!res.ok || data.error) throw new Error(data.error ?? "API error");
      setResult(data);
      setStatus("done");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unknown error");
      setStatus("error");
    }
  }

  const screeningHits = new Set<string>(
    (screen?.hits ?? []).map((h) => h.matchedName?.toLowerCase() ?? ""),
  );

  return (
    <IntelSection title="Name Variant Engine" icon="🔤" status={status}>
      <div className="space-y-3">
        <div className="text-11 text-ink-3">Generate all phonetic / transliteration / patronymic / alias forms of the subject name and flag which ones already hit on current screening.</div>
        <RunBtn onClick={run} disabled={status === "loading"} />
        {error && <ErrorBox msg={error} />}
        {result && (
          <div className="space-y-3 mt-2">
            <div>
              <span className="text-11 font-semibold text-ink-0">Canonical: </span>
              <span className="font-mono text-11 text-brand">{result.canonicalName}</span>
            </div>
            {[
              { label: "Variants", items: result.variants },
              { label: "Transliterations", items: result.transliterations },
              { label: "Aliases", items: result.aliases },
              { label: "Patronymics", items: result.patronymics },
              { label: "Script variants", items: result.scriptVariants },
              { label: "Screening strings", items: result.screeningStrings },
            ].map(({ label, items }) =>
              items.length > 0 ? (
                <div key={label}>
                  <div className="text-10 uppercase tracking-wide font-semibold text-ink-3 mb-1">{label}</div>
                  <div className="flex flex-wrap gap-1">
                    {items.map((v) => {
                      const hit = screeningHits.has(v.toLowerCase());
                      return (
                        <span
                          key={v}
                          className={`text-10 font-mono px-1.5 py-0.5 rounded border ${hit ? "bg-red-dim text-red border-red/40 font-semibold" : "bg-bg-2 text-ink-2 border-hair-2"}`}
                        >
                          {v}{hit ? " ✓" : ""}
                        </span>
                      );
                    })}
                  </div>
                </div>
              ) : null,
            )}
            {result.notes && (
              <div className="text-10 text-ink-3 italic mt-1">{result.notes}</div>
            )}
          </div>
        )}
      </div>
    </IntelSection>
  );
}

// ─── 2. Network Expansion ────────────────────────────────────────────────────

interface NetworkNode {
  id: string;
  name: string;
  type: "individual" | "corporate" | "account" | "address";
  riskLevel: "high" | "medium" | "low";
  flags: string[];
}

interface NetworkConnection {
  from: string;
  to: string;
  linkType: string;
  strength: "confirmed" | "suspected";
  detail: string;
}

interface NetworkMapResult {
  networkRisk: "critical" | "high" | "medium" | "low" | "clear";
  entityCount: number;
  clusterCount: number;
  nodes: NetworkNode[];
  connections: NetworkConnection[];
  keyHubs: string[];
  circularOwnership: boolean;
  layeringLikelihood: "high" | "medium" | "low" | "none";
  shellNetworkRisk: boolean;
  recommendedAction: string;
  actionRationale: string;
  regulatoryBasis: string;
}

const RISK_COLOR: Record<string, string> = {
  critical: "text-red",
  high: "text-orange",
  medium: "text-amber",
  low: "text-blue",
  clear: "text-green",
  none: "text-green",
};

function NetworkExpansionSection({ subject }: { subject: Subject }) {
  const [status, setStatus] = useState<SectionStatus>("idle");
  const [result, setResult] = useState<NetworkMapResult | null>(null);
  const [error, setError] = useState<string>("");

  async function run() {
    setStatus("loading");
    setError("");
    try {
      const res = await fetch("/api/network-mapper", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name: subject.name, entityType: subject.entityType, jurisdiction: subject.jurisdiction }),
      });
      const data = (await res.json()) as NetworkMapResult & { ok?: boolean; error?: string };
      if (!res.ok || data.error) throw new Error(data.error ?? "API error");
      setResult(data);
      setStatus("done");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unknown error");
      setStatus("error");
    }
  }

  return (
    <IntelSection title="Network Expansion" icon="🕸️" status={status}>
      <div className="space-y-3">
        <div className="text-11 text-ink-3">Map associates, shell companies, and network connections for the subject.</div>
        <RunBtn onClick={run} disabled={status === "loading"} />
        {error && <ErrorBox msg={error} />}
        {result && (
          <div className="space-y-3 mt-2">
            <div className="flex gap-4 text-11 font-mono">
              <span>Network risk: <span className={`font-semibold ${RISK_COLOR[result.networkRisk]}`}>{result.networkRisk.toUpperCase()}</span></span>
              <span>Entities: <span className="text-ink-0">{result.entityCount}</span></span>
              <span>Clusters: <span className="text-ink-0">{result.clusterCount}</span></span>
            </div>
            {result.shellNetworkRisk && (
              <div className="text-11 font-semibold text-red bg-red-dim rounded px-2 py-1">⚠ Shell network risk detected</div>
            )}
            {result.circularOwnership && (
              <div className="text-11 font-semibold text-amber bg-amber-dim rounded px-2 py-1">⚠ Circular ownership structure</div>
            )}
            <div>
              <div className="text-10 uppercase tracking-wide font-semibold text-ink-3 mb-1">Nodes ({result.nodes.length})</div>
              <div className="space-y-1">
                {result.nodes.slice(0, 10).map((n) => (
                  <div key={n.id} className="flex items-center gap-2 text-11 font-mono">
                    <span className={`w-2 h-2 rounded-full inline-block ${n.riskLevel === "high" ? "bg-red" : n.riskLevel === "medium" ? "bg-amber" : "bg-green"}`} />
                    <span className="text-ink-1">{n.name}</span>
                    <span className="text-ink-3">{n.type}</span>
                    {n.flags.length > 0 && <span className="text-10 text-red">[{n.flags.join(", ")}]</span>}
                  </div>
                ))}
              </div>
            </div>
            {result.keyHubs.length > 0 && (
              <div>
                <div className="text-10 uppercase tracking-wide font-semibold text-ink-3 mb-1">Key hubs</div>
                <div className="flex flex-wrap gap-1">
                  {result.keyHubs.map((h) => (
                    <span key={h} className="text-10 font-mono bg-amber-dim text-amber border border-amber/30 px-1.5 py-0.5 rounded">{h}</span>
                  ))}
                </div>
              </div>
            )}
            <div className="text-11 text-ink-2">
              <span className="font-semibold">Recommended: </span>{result.recommendedAction} — {result.actionRationale}
            </div>
          </div>
        )}
      </div>
    </IntelSection>
  );
}

// ─── 3. Transaction Behavioral Overlay ───────────────────────────────────────

interface TxAlert {
  rule: string;
  detail: string;
}

interface SubjectAlertRoll {
  subjectId: string;
  subjectName: string;
  txCount: number;
  structuringAlerts: number;
  smurfingAlerts: number;
  anomalies: number;
  thresholdBreaches: number;
  top?: TxAlert | null;
}

interface TxMonitorResponse {
  ok: boolean;
  processed: number;
  subjects?: SubjectAlertRoll[];
  error?: string;
}

function TransactionOverlaySection({ subject }: { subject: Subject }) {
  const [status, setStatus] = useState<SectionStatus>("idle");
  const [result, setResult] = useState<SubjectAlertRoll | null>(null);
  const [error, setError] = useState<string>("");

  async function run() {
    setStatus("loading");
    setError("");
    try {
      const res = await fetch("/api/transaction-monitor/run", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ subjectIds: [subject.id] }),
      });
      const data = (await res.json()) as TxMonitorResponse;
      if (!res.ok || data.error) throw new Error(data.error ?? "API error");
      const roll = data.subjects?.find((s) => s.subjectId === subject.id) ?? data.subjects?.[0] ?? null;
      setResult(roll);
      setStatus("done");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unknown error");
      setStatus("error");
    }
  }

  return (
    <IntelSection title="Transaction Behavioral Overlay" icon="💹" status={status}>
      <div className="space-y-3">
        <div className="text-11 text-ink-3">Analyze velocity, structuring, and behavioral anomalies in transaction history for this subject.</div>
        <RunBtn onClick={run} disabled={status === "loading"} />
        {error && <ErrorBox msg={error} />}
        {result && (
          <div className="space-y-2 mt-2">
            <div className="grid grid-cols-2 gap-2 text-11 font-mono">
              {[
                { label: "Transactions", value: result.txCount, tone: "" },
                { label: "Structuring alerts", value: result.structuringAlerts, tone: result.structuringAlerts > 0 ? "text-red" : "text-green" },
                { label: "Smurfing alerts", value: result.smurfingAlerts, tone: result.smurfingAlerts > 0 ? "text-red" : "text-green" },
                { label: "Anomalies", value: result.anomalies, tone: result.anomalies > 0 ? "text-amber" : "text-green" },
                { label: "Threshold breaches", value: result.thresholdBreaches, tone: result.thresholdBreaches > 0 ? "text-red" : "text-green" },
              ].map(({ label, value, tone }) => (
                <div key={label} className="bg-bg-2 rounded p-2">
                  <div className="text-10 text-ink-3">{label}</div>
                  <div className={`text-14 font-semibold mt-0.5 ${tone || "text-ink-0"}`}>{value}</div>
                </div>
              ))}
            </div>
            {result.top && (
              <div className="bg-red-dim border border-red/20 rounded p-2">
                <div className="text-10 uppercase font-semibold text-red mb-1">Top alert</div>
                <div className="text-11 text-ink-1">{result.top.rule}</div>
                <div className="text-10 text-ink-3 mt-0.5">{result.top.detail}</div>
              </div>
            )}
          </div>
        )}
        {result === null && status === "done" && (
          <div className="text-11 text-ink-3 italic mt-2">No transaction data found for subject.</div>
        )}
      </div>
    </IntelSection>
  );
}

// ─── 4. Adversarial Red-Team Mode ────────────────────────────────────────────

interface PremortemScenario {
  id: string;
  scenario: string;
  warningSign: string;
  mitigation: string;
  severity: "critical" | "high" | "medium";
  likelihood: "high" | "medium" | "low";
}

interface PremortemResult {
  ok: boolean;
  scenarios: PremortemScenario[];
  mitigations?: Array<{ action: string; priority: string }>;
  error?: string;
}

function AdversarialRedTeamSection({ subject, screen }: { subject: Subject; screen: QuickScreenResult | null }) {
  const [status, setStatus] = useState<SectionStatus>("idle");
  const [result, setResult] = useState<PremortemResult | null>(null);
  const [error, setError] = useState<string>("");

  async function run() {
    setStatus("loading");
    setError("");
    try {
      const verdict = { outcome: subject.status, score: subject.riskScore };
      const res = await fetch("/api/agent/premortem", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ verdict, subject: { name: subject.name, entityType: subject.entityType, jurisdiction: subject.jurisdiction } }),
      });
      const data = (await res.json()) as PremortemResult;
      if (!res.ok || data.error) throw new Error(data.error ?? "API error");
      setResult(data);
      setStatus("done");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unknown error");
      setStatus("error");
    }
  }

  return (
    <IntelSection title="Adversarial Red-Team Mode" icon="🎯" status={status}>
      <div className="space-y-3">
        <div className="text-11 text-ink-3">Challenge the current screening decision by enumerating failure scenarios, warning signs, and required mitigations.</div>
        <RunBtn onClick={run} disabled={status === "loading"} />
        {error && <ErrorBox msg={error} />}
        {result && (
          <div className="space-y-2 mt-2">
            {(result.scenarios ?? []).map((s) => (
              <div key={s.id} className="bg-bg-2 border border-hair-2 rounded-lg p-3 space-y-1">
                <div className="flex items-center gap-2">
                  <span className={`text-10 font-mono font-semibold uppercase px-1.5 py-0.5 rounded ${s.severity === "critical" ? "bg-red-dim text-red" : s.severity === "high" ? "bg-orange/20 text-orange" : "bg-amber-dim text-amber"}`}>{s.severity}</span>
                  <span className="text-10 font-mono text-ink-3">likelihood: {s.likelihood}</span>
                </div>
                <div className="text-11 text-ink-0">{s.scenario}</div>
                <div className="text-10 text-amber"><span className="font-semibold">Warning sign: </span>{s.warningSign}</div>
                <div className="text-10 text-green"><span className="font-semibold">Mitigation: </span>{s.mitigation}</div>
              </div>
            ))}
            {result.scenarios?.length === 0 && (
              <div className="text-11 text-green italic">No significant failure scenarios identified.</div>
            )}
          </div>
        )}
      </div>
    </IntelSection>
  );
}

// ─── 5. Geopolitical Risk Pulse ───────────────────────────────────────────────

interface GeoEvent {
  id: string;
  country: string;
  region: string;
  eventType: string;
  riskLevel: "critical" | "high" | "medium";
  headline: string;
  impact: string;
  affectedSectors: string[];
  date: string;
  recommendation: string;
}

interface GeoEventsResult {
  ok: boolean;
  events?: GeoEvent[];
  error?: string;
}

function GeoRiskSection({ subject }: { subject: Subject }) {
  const [status, setStatus] = useState<SectionStatus>("idle");
  const [events, setEvents] = useState<GeoEvent[]>([]);
  const [error, setError] = useState<string>("");

  const country = subject.country || subject.jurisdiction || "";

  async function run() {
    setStatus("loading");
    setError("");
    try {
      const res = await fetch(`/api/geopolitical/events?country=${encodeURIComponent(country)}`, {
        method: "GET",
        headers: { "content-type": "application/json" },
      });
      const data = (await res.json()) as GeoEventsResult & { events?: GeoEvent[] };
      if (!res.ok || data.error) throw new Error(data.error ?? "API error");
      setEvents(data.events ?? []);
      setStatus("done");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unknown error");
      setStatus("error");
    }
  }

  return (
    <IntelSection title="Geopolitical Risk Pulse" icon="🌍" status={status}>
      <div className="space-y-3">
        <div className="text-11 text-ink-3">Fetch active geopolitical risk events for <span className="font-mono text-ink-1">{country || "subject country"}</span>.</div>
        <RunBtn onClick={run} disabled={status === "loading"} />
        {error && <ErrorBox msg={error} />}
        {events.length > 0 && (
          <div className="space-y-2 mt-2">
            {events.slice(0, 5).map((ev) => (
              <div key={ev.id} className="bg-bg-2 border border-hair-2 rounded p-3">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <span className={`text-10 font-mono font-semibold ${RISK_COLOR[ev.riskLevel]}`}>{ev.riskLevel.toUpperCase()}</span>
                    <span className="text-10 text-ink-3 ml-2">{ev.eventType} · {ev.date}</span>
                  </div>
                </div>
                <div className="text-11 text-ink-0 mt-1">{ev.headline}</div>
                <div className="text-10 text-ink-2 mt-0.5">{ev.impact}</div>
                <div className="text-10 text-amber mt-0.5 italic">{ev.recommendation}</div>
                {ev.affectedSectors.length > 0 && (
                  <div className="flex flex-wrap gap-1 mt-1">
                    {ev.affectedSectors.map((s) => (
                      <span key={s} className="text-10 font-mono bg-bg-panel border border-hair-2 px-1 py-0.5 rounded">{s}</span>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
        {events.length === 0 && status === "done" && (
          <div className="text-11 text-green italic mt-2">No active geopolitical risk events for this country.</div>
        )}
      </div>
    </IntelSection>
  );
}

// ─── 6. Corporate Registry (PEP Corporate) ────────────────────────────────────

interface PepCorporateResult {
  pepExposureLevel: "direct" | "indirect" | "none";
  riskRating: "critical" | "high" | "medium" | "low";
  politicalConnections: string[];
  corruptionRiskFactors: string[];
  eddMeasures: string[];
  approvalRequired: string;
  regulatoryBasis: string;
}

function CorporateRegistrySection({ subject }: { subject: Subject }) {
  const [status, setStatus] = useState<SectionStatus>("idle");
  const [result, setResult] = useState<PepCorporateResult | null>(null);
  const [error, setError] = useState<string>("");

  async function run() {
    setStatus("loading");
    setError("");
    try {
      const res = await fetch("/api/pep-corporate", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          companyName: subject.name,
          pepName: subject.name,
          pepRole: subject.pep?.tier ?? "unknown",
          ownershipPct: "unknown",
          industryContext: subject.riskCategory ?? "unknown",
          context: `entityType:${subject.entityType} jurisdiction:${subject.jurisdiction}`,
        }),
      });
      const data = (await res.json()) as PepCorporateResult & { ok?: boolean; error?: string };
      if (!res.ok || data.error) throw new Error(data.error ?? "API error");
      setResult(data);
      setStatus("done");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unknown error");
      setStatus("error");
    }
  }

  return (
    <IntelSection title="Corporate Registry" icon="🏢" status={status}>
      <div className="space-y-3">
        <div className="text-11 text-ink-3">Identify linked companies, political connections, and PEP corporate exposure.</div>
        <RunBtn onClick={run} disabled={status === "loading"} />
        {error && <ErrorBox msg={error} />}
        {result && (
          <div className="space-y-3 mt-2">
            <div className="flex gap-3 text-11 font-mono">
              <span>PEP exposure: <span className={`font-semibold ${result.pepExposureLevel === "direct" ? "text-red" : result.pepExposureLevel === "indirect" ? "text-amber" : "text-green"}`}>{result.pepExposureLevel}</span></span>
              <span>Risk: <span className={`font-semibold ${RISK_COLOR[result.riskRating]}`}>{result.riskRating.toUpperCase()}</span></span>
            </div>
            {result.politicalConnections.length > 0 && (
              <div>
                <div className="text-10 uppercase font-semibold text-ink-3 mb-1">Political connections</div>
                <ul className="space-y-0.5">
                  {result.politicalConnections.map((c, i) => (
                    <li key={i} className="text-11 text-ink-1 flex gap-1"><span className="text-red">•</span>{c}</li>
                  ))}
                </ul>
              </div>
            )}
            {result.corruptionRiskFactors.length > 0 && (
              <div>
                <div className="text-10 uppercase font-semibold text-ink-3 mb-1">Corruption risk factors</div>
                <ul className="space-y-0.5">
                  {result.corruptionRiskFactors.map((f, i) => (
                    <li key={i} className="text-11 text-amber flex gap-1"><span>⚠</span>{f}</li>
                  ))}
                </ul>
              </div>
            )}
            <div className="text-10 text-ink-3 italic">{result.approvalRequired}</div>
          </div>
        )}
      </div>
    </IntelSection>
  );
}

// ─── 7. Regulatory Deadlines ─────────────────────────────────────────────────

function getRegulatoryDeadlines(subject: Subject) {
  const now = new Date();
  // Use openedAt or parse openedAgo as dd/mm/yyyy
  let openedDate = now;
  if (subject.openedAt) {
    openedDate = new Date(subject.openedAt);
  } else if (subject.openedAgo && /\d{2}\/\d{2}\/\d{4}/.test(subject.openedAgo)) {
    const [d, m, y] = subject.openedAgo.split("/").map(Number);
    openedDate = new Date(y, m - 1, d);
  }

  function addDays(date: Date, days: number): Date {
    const d = new Date(date);
    d.setDate(d.getDate() + days);
    return d;
  }

  function daysLeft(target: Date): number {
    return Math.ceil((target.getTime() - now.getTime()) / 86400000);
  }

  const cddPosture = subject.cddPosture ?? "standard";
  const rescreenDays = cddPosture === "enhanced" ? 180 : cddPosture === "simplified" ? 730 : 365;
  const cddReviewDays = cddPosture === "enhanced" ? 90 : 365;
  const retentionYears = 5;

  const rescreenDate = addDays(openedDate, rescreenDays);
  const cddReviewDate = addDays(openedDate, cddReviewDays);
  const retentionDate = addDays(openedDate, retentionYears * 365);

  return [
    { label: "Re-screening due", date: rescreenDate, daysLeft: daysLeft(rescreenDate), basis: `FATF R.10 — ${cddPosture} CDD` },
    { label: "CDD review due", date: cddReviewDate, daysLeft: daysLeft(cddReviewDate), basis: "UAE FDL Art.14 — periodic review" },
    { label: "Record retention", date: retentionDate, daysLeft: daysLeft(retentionDate), basis: "FATF R.11 — 5-year retention" },
  ];
}

function RegulatoryDeadlinesSection({ subject }: { subject: Subject }) {
  const deadlines = getRegulatoryDeadlines(subject);

  return (
    <IntelSection title="Regulatory Deadlines" icon="📅" status="done">
      <div className="space-y-2 mt-2">
        <div className="text-11 text-ink-3 mb-2">Countdown timers computed from subject opening date and CDD posture ({subject.cddPosture ?? "standard"}).</div>
        {deadlines.map((d) => {
          const urgent = d.daysLeft < 14;
          const warning = d.daysLeft < 30;
          return (
            <div key={d.label} className={`rounded p-3 border ${urgent ? "bg-red-dim border-red/30" : warning ? "bg-amber-dim border-amber/30" : "bg-bg-2 border-hair-2"}`}>
              <div className="flex items-center justify-between">
                <span className="text-11 font-semibold text-ink-0">{d.label}</span>
                <span className={`text-12 font-mono font-bold ${urgent ? "text-red" : warning ? "text-amber" : "text-green"}`}>
                  {d.daysLeft > 0 ? `${d.daysLeft}d` : "OVERDUE"}
                </span>
              </div>
              <div className="text-10 text-ink-3 mt-0.5">{d.date.toLocaleDateString("en-GB")} · {d.basis}</div>
            </div>
          );
        })}
      </div>
    </IntelSection>
  );
}

// ─── 8. Document Intelligence ────────────────────────────────────────────────

interface DocumentFraudResult {
  fraudRisk: "critical" | "high" | "medium" | "low" | "clear";
  indicators: Array<{ indicator: string; severity: string; detail: string }>;
  recommendation: string;
  regulatoryBasis: string;
}

function DocumentIntelSection({ subject }: { subject: Subject }) {
  const [status, setStatus] = useState<SectionStatus>("idle");
  const [result, setResult] = useState<DocumentFraudResult | null>(null);
  const [error, setError] = useState<string>("");
  const fileRef = useRef<HTMLInputElement>(null);
  const [fileName, setFileName] = useState<string>("");

  async function run() {
    const file = fileRef.current?.files?.[0];
    if (!file) {
      setError("Please select a file first.");
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      setError("File exceeds 10MB limit.");
      return;
    }

    setStatus("loading");
    setError("");
    try {
      const formData = new FormData();
      formData.append("file", file);
      formData.append("subjectName", subject.name);
      formData.append("documentType", "identity");

      const res = await fetch("/api/document-fraud", {
        method: "POST",
        body: formData,
      });
      const data = (await res.json()) as DocumentFraudResult & { ok?: boolean; error?: string };
      if (!res.ok || data.error) throw new Error(data.error ?? "API error");
      setResult(data);
      setStatus("done");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unknown error");
      setStatus("error");
    }
  }

  return (
    <IntelSection title="Document Intelligence" icon="📄" status={status}>
      <div className="space-y-3">
        <div className="text-11 text-ink-3">Upload a document (PDF, image, DOCX) for AI-powered fraud and authenticity analysis.</div>
        <div className="flex items-center gap-2">
          <label
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded text-11 font-semibold bg-bg-2 text-ink-1 border border-hair-2 hover:border-brand/40 cursor-pointer transition-colors"
            htmlFor="deep-intel-doc-upload"
          >
            📎 Choose file
          </label>
          <input
            id="deep-intel-doc-upload"
            ref={fileRef}
            type="file"
            accept=".pdf,.png,.jpg,.jpeg,.webp,.docx,.doc"
            className="hidden"
            onChange={(e) => setFileName(e.target.files?.[0]?.name ?? "")}
          />
          {fileName && <span className="text-10 font-mono text-ink-2 truncate max-w-[180px]">{fileName}</span>}
        </div>
        <RunBtn onClick={run} disabled={status === "loading"} />
        {error && <ErrorBox msg={error} />}
        {result && (
          <div className="space-y-2 mt-2">
            <div className="flex gap-2 items-center">
              <span className="text-11">Fraud risk: </span>
              <span className={`text-12 font-semibold font-mono ${RISK_COLOR[result.fraudRisk]}`}>{result.fraudRisk.toUpperCase()}</span>
            </div>
            {result.indicators.map((ind, i) => (
              <div key={i} className="bg-bg-2 rounded p-2">
                <div className="flex gap-2 items-center">
                  <span className={`text-10 font-mono font-semibold ${ind.severity === "critical" || ind.severity === "high" ? "text-red" : "text-amber"}`}>{ind.severity}</span>
                  <span className="text-11 text-ink-1">{ind.indicator}</span>
                </div>
                <div className="text-10 text-ink-3 mt-0.5">{ind.detail}</div>
              </div>
            ))}
            <div className="text-11 text-ink-2 italic">{result.recommendation}</div>
          </div>
        )}
      </div>
    </IntelSection>
  );
}

// ─── 9. Voice-to-Case ────────────────────────────────────────────────────────

function VoiceToCaseSection({ subject }: { subject: Subject }) {
  const [transcript, setTranscript] = useState<string>("");
  const [recording, setRecording] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string>("");
  const recognitionRef = useRef<SpeechRecognition | null>(null);

  const speechSupported =
    typeof window !== "undefined" &&
    ("SpeechRecognition" in window || "webkitSpeechRecognition" in window);

  function startRecording() {
    if (!speechSupported) {
      setError("Web Speech API not supported in this browser.");
      return;
    }
    const SpeechRecognitionCtor =
      (window as Window & { SpeechRecognition?: typeof SpeechRecognition; webkitSpeechRecognition?: typeof SpeechRecognition }).SpeechRecognition ??
      (window as Window & { webkitSpeechRecognition?: typeof SpeechRecognition }).webkitSpeechRecognition;
    if (!SpeechRecognitionCtor) {
      setError("Speech recognition unavailable.");
      return;
    }
    const rec = new SpeechRecognitionCtor();
    rec.lang = "en-US";
    rec.continuous = true;
    rec.interimResults = true;
    rec.onresult = (e: SpeechRecognitionEvent) => {
      let t = "";
      for (let i = 0; i < e.results.length; i++) {
        t += e.results[i][0].transcript;
      }
      setTranscript(t);
    };
    rec.onerror = (e: SpeechRecognitionErrorEvent) => {
      setError(`Speech error: ${e.error}`);
      setRecording(false);
    };
    rec.onend = () => setRecording(false);
    rec.start();
    recognitionRef.current = rec;
    setRecording(true);
    setSaved(false);
  }

  function stopRecording() {
    recognitionRef.current?.stop();
    setRecording(false);
  }

  function addToCase() {
    if (!transcript.trim()) return;
    try {
      const key = `case-notes-${subject.id}`;
      const existing = localStorage.getItem(key) ?? "";
      const ts = new Date().toISOString();
      localStorage.setItem(key, existing + (existing ? "\n\n" : "") + `[${ts} · Voice note]\n${transcript.trim()}`);
      setSaved(true);
    } catch {
      setError("Failed to save to local case store.");
    }
  }

  return (
    <IntelSection title="Voice-to-Case" icon="🎙️" status={transcript ? "done" : "idle"}>
      <div className="space-y-3">
        <div className="text-11 text-ink-3">Use your microphone to dictate a case note. The transcript is added to the case record.</div>
        {!speechSupported && (
          <div className="text-11 text-amber bg-amber-dim rounded px-2 py-1">Web Speech API not supported in this browser. Use Chrome or Edge.</div>
        )}
        <div className="flex gap-2">
          {!recording ? (
            <button
              onClick={startRecording}
              disabled={!speechSupported}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded text-11 font-semibold bg-brand-dim text-brand border border-brand/30 hover:opacity-80 disabled:opacity-40"
            >
              🎙 Start recording
            </button>
          ) : (
            <button
              onClick={stopRecording}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded text-11 font-semibold bg-red-dim text-red border border-red/40 hover:opacity-80 animate-pulse"
            >
              ⏹ Stop recording
            </button>
          )}
        </div>
        {error && <ErrorBox msg={error} />}
        <textarea
          className="w-full rounded border border-hair-2 bg-bg-1 px-2 py-1 text-11 text-ink-0 placeholder:text-ink-3 resize-y font-mono min-h-[80px]"
          placeholder="Transcript will appear here…"
          value={transcript}
          onChange={(e) => { setTranscript(e.target.value); setSaved(false); }}
        />
        <div className="flex gap-2 items-center">
          <button
            onClick={addToCase}
            disabled={!transcript.trim()}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded text-11 font-semibold bg-brand-dim text-brand border border-brand/30 hover:opacity-80 disabled:opacity-40"
          >
            Add to case
          </button>
          {saved && <span className="text-11 text-green">✓ Saved to case</span>}
        </div>
      </div>
    </IntelSection>
  );
}

// ─── 10. PEP Network Map ─────────────────────────────────────────────────────

interface PepNetworkResult {
  pepCategory: string;
  riskRating: "critical" | "high" | "medium";
  riskNarrative: string;
  personsToScreen: Array<{ relationship: string; screeningPriority: string; rationale: string; fatfBasis: string }>;
  entitiesToScreen: Array<{ entityType: string; screeningPriority: string; rationale: string }>;
  typicalMlRisks: string[];
  eddRequirements: string[];
  seniorManagementApprovalRequired: boolean;
  regulatoryBasis: string;
}

function PepNetworkSection({ subject }: { subject: Subject }) {
  const [status, setStatus] = useState<SectionStatus>("idle");
  const [result, setResult] = useState<PepNetworkResult | null>(null);
  const [error, setError] = useState<string>("");

  async function run() {
    setStatus("loading");
    setError("");
    try {
      const res = await fetch("/api/pep-network", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          pepName: subject.name,
          role: subject.pep?.tier ?? "unknown",
          country: subject.country || subject.jurisdiction,
        }),
      });
      const data = (await res.json()) as PepNetworkResult & { ok?: boolean; error?: string };
      if (!res.ok || data.error) throw new Error(data.error ?? "API error");
      setResult(data);
      setStatus("done");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unknown error");
      setStatus("error");
    }
  }

  return (
    <IntelSection title="PEP Network Map" icon="👤" status={status}>
      <div className="space-y-3">
        <div className="text-11 text-ink-3">Map PEP family members, associates, and linked entities requiring screening.</div>
        <RunBtn onClick={run} disabled={status === "loading"} />
        {error && <ErrorBox msg={error} />}
        {result && (
          <div className="space-y-3 mt-2">
            <div className="flex gap-3 text-11 font-mono">
              <span>PEP category: <span className="text-ink-0">{result.pepCategory}</span></span>
              <span>Risk: <span className={`font-semibold ${RISK_COLOR[result.riskRating]}`}>{result.riskRating.toUpperCase()}</span></span>
            </div>
            <div className="text-11 text-ink-2 italic">{result.riskNarrative}</div>
            {result.personsToScreen.length > 0 && (
              <div>
                <div className="text-10 uppercase font-semibold text-ink-3 mb-1">Persons to screen ({result.personsToScreen.length})</div>
                <div className="space-y-1">
                  {result.personsToScreen.map((p, i) => (
                    <div key={i} className="bg-bg-2 rounded p-2 text-11">
                      <span className="text-ink-0">{p.relationship}</span>
                      <span className={`ml-2 text-10 font-mono ${p.screeningPriority === "mandatory" ? "text-red" : "text-amber"}`}>{p.screeningPriority}</span>
                      <div className="text-10 text-ink-3 mt-0.5">{p.rationale}</div>
                    </div>
                  ))}
                </div>
              </div>
            )}
            {result.seniorManagementApprovalRequired && (
              <div className="text-11 font-semibold text-red bg-red-dim rounded px-2 py-1">⚠ Senior management approval required</div>
            )}
          </div>
        )}
      </div>
    </IntelSection>
  );
}

// ─── 11. ML Disposition Predictor ────────────────────────────────────────────

interface Prediction {
  disposition: string;
  probability: number;
  confidence: string;
  drivers: string[];
}

interface PredictionResponse {
  ok: boolean;
  predictions: Prediction[];
  primaryRecommendation: string;
  regulatoryBasis: string;
  error?: string;
}

function DispositionPredictorSection({ subject, screen, superBrain }: { subject: Subject; screen: QuickScreenResult | null; superBrain: SuperBrainResult | null }) {
  const [status, setStatus] = useState<SectionStatus>("idle");
  const [result, setResult] = useState<PredictionResponse | null>(null);
  const [error, setError] = useState<string>("");

  async function run() {
    setStatus("loading");
    setError("");
    try {
      const amHits = screen?.hits?.length ?? (superBrain?.adverseMedia?.length ?? 0);
      const pepTier = subject.pep?.tier ?? superBrain?.pep?.tier ?? "none";
      const res = await fetch("/api/disposition-predict", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          score: subject.riskScore,
          jurisdiction: subject.jurisdiction || subject.country,
          entityType: subject.entityType,
          industry: subject.riskCategory ?? subject.meta ?? "",
          amHits,
          pepTier,
        }),
      });
      const data = (await res.json()) as PredictionResponse;
      if (!res.ok || data.error) throw new Error(data.error ?? "API error");
      setResult(data);
      setStatus("done");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unknown error");
      setStatus("error");
    }
  }

  return (
    <IntelSection title="ML Disposition Predictor" icon="🤖" status={status}>
      <div className="space-y-3">
        <div className="text-11 text-ink-3">Heuristic ML prediction of likely disposition outcome based on risk profile.</div>
        <RunBtn onClick={run} disabled={status === "loading"} />
        {error && <ErrorBox msg={error} />}
        {result && (
          <div className="space-y-3 mt-2">
            <div className="text-11 text-ink-2 italic">{result.primaryRecommendation}</div>
            <div className="space-y-2">
              {result.predictions.map((p) => (
                <div key={p.disposition}>
                  <div className="flex justify-between text-11 mb-0.5">
                    <span className="text-ink-1">{p.disposition}</span>
                    <span className="font-mono text-ink-0">{p.probability}%</span>
                  </div>
                  <div className="h-2 bg-bg-2 rounded-sm">
                    <div
                      className="h-full bg-brand rounded-sm transition-all"
                      style={{ width: `${p.probability}%`, opacity: 0.6 + (p.probability / 200) }}
                    />
                  </div>
                  {p.drivers.length > 0 && (
                    <div className="text-10 text-ink-3 mt-0.5">{p.drivers[0]}</div>
                  )}
                </div>
              ))}
            </div>
            <div className="text-10 text-ink-3 italic">{result.regulatoryBasis}</div>
          </div>
        )}
      </div>
    </IntelSection>
  );
}

// ─── 12. Dark Web / Breach Monitor ───────────────────────────────────────────

interface BreachResult {
  ok: boolean;
  found: boolean;
  sources: string[];
  riskLevel: "critical" | "high" | "medium" | "low" | "none";
  details: string[];
  emailBreaches?: Array<{ name: string; domain: string; breachDate: string; dataClasses: string[] }>;
  configNote?: string;
  error?: string;
}

function DarkWebBreachSection({ subject }: { subject: Subject }) {
  const [status, setStatus] = useState<SectionStatus>("idle");
  const [result, setResult] = useState<BreachResult | null>(null);
  const [error, setError] = useState<string>("");

  async function run() {
    setStatus("loading");
    setError("");
    try {
      const res = await fetch("/api/breach-check", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name: subject.name }),
      });
      const data = (await res.json()) as BreachResult;
      if (!res.ok || data.error) throw new Error(data.error ?? "API error");
      setResult(data);
      setStatus("done");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unknown error");
      setStatus("error");
    }
  }

  return (
    <IntelSection title="Dark Web / Breach Monitor" icon="🕵️" status={status}>
      <div className="space-y-3">
        <div className="text-11 text-ink-3">Check for data breach exposure associated with subject name in breach monitoring corpus.</div>
        <RunBtn onClick={run} disabled={status === "loading"} />
        {error && <ErrorBox msg={error} />}
        {result && (
          <div className="space-y-2 mt-2">
            <div className={`flex items-center gap-2 text-12 font-semibold font-mono ${result.found ? RISK_COLOR[result.riskLevel] : "text-green"}`}>
              {result.found ? "⚠ Exposure detected" : "✓ No exposure found"} · {result.riskLevel.toUpperCase()}
            </div>
            {result.sources.length > 0 && (
              <div>
                <div className="text-10 uppercase font-semibold text-ink-3 mb-1">Sources</div>
                <div className="flex flex-wrap gap-1">
                  {result.sources.map((s) => (
                    <span key={s} className="text-10 font-mono bg-red-dim text-red border border-red/30 px-1.5 py-0.5 rounded">{s}</span>
                  ))}
                </div>
              </div>
            )}
            {result.details.map((d, i) => (
              <div key={i} className="text-11 text-ink-2">{d}</div>
            ))}
            {result.configNote && (
              <div className="text-10 text-amber bg-amber-dim rounded px-2 py-1 italic">{result.configNote}</div>
            )}
          </div>
        )}
      </div>
    </IntelSection>
  );
}

// ─── 13. Vessel & Aircraft Ownership ─────────────────────────────────────────

interface VesselResult {
  ok: boolean;
  status?: string;
  flagState?: string;
  ownerName?: string;
  registeredOwner?: string;
  sanctionHits?: string[];
  riskLevel?: string;
  error?: string;
}

function VesselAircraftSection({ subject }: { subject: Subject }) {
  const [status, setStatus] = useState<SectionStatus>("idle");
  const [result, setResult] = useState<VesselResult | null>(null);
  const [error, setError] = useState<string>("");

  const imoNumber = subject.vesselImo ?? subject.vesselMmsi ?? subject.aircraftTail ?? "";

  async function run() {
    setStatus("loading");
    setError("");
    try {
      const body = imoNumber
        ? { imoNumber }
        : { subjectName: subject.name };
      const res = await fetch("/api/vessel-check", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = (await res.json()) as VesselResult;
      if (!res.ok || data.error) throw new Error(data.error ?? "API error");
      setResult(data);
      setStatus("done");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unknown error");
      setStatus("error");
    }
  }

  return (
    <IntelSection title="Vessel & Aircraft Ownership" icon="🚢" status={status}>
      <div className="space-y-3">
        <div className="text-11 text-ink-3">
          Check vessel / aircraft sanctions exposure and ownership chain.
          {imoNumber && <span className="ml-1 font-mono text-ink-1">IMO/Tail: {imoNumber}</span>}
        </div>
        <RunBtn onClick={run} disabled={status === "loading"} />
        {error && <ErrorBox msg={error} />}
        {result && (
          <div className="space-y-2 mt-2">
            <JsonTree data={result} />
          </div>
        )}
      </div>
    </IntelSection>
  );
}

// ─── 14. Real Estate Registry ─────────────────────────────────────────────────

interface RealEstateResult {
  mlRisk: "critical" | "high" | "medium" | "low" | "clear";
  dldRegistrationRisk: string;
  priceManipulation: boolean;
  allCashTransaction: boolean;
  rapidFlipping: boolean;
  indicators: Array<{ indicator: string; severity: string; category: string; fatfRef: string; detail: string }>;
  recommendedAction: string;
  actionRationale: string;
  regulatoryBasis: string;
}

function RealEstateSection({ subject }: { subject: Subject }) {
  const [status, setStatus] = useState<SectionStatus>("idle");
  const [result, setResult] = useState<RealEstateResult | null>(null);
  const [error, setError] = useState<string>("");

  async function run() {
    setStatus("loading");
    setError("");
    try {
      const res = await fetch("/api/real-estate-ml", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ subjectName: subject.name, jurisdiction: subject.jurisdiction || subject.country }),
      });
      const data = (await res.json()) as RealEstateResult & { ok?: boolean; error?: string };
      if (!res.ok || data.error) throw new Error(data.error ?? "API error");
      setResult(data);
      setStatus("done");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unknown error");
      setStatus("error");
    }
  }

  return (
    <IntelSection title="Real Estate Registry" icon="🏠" status={status}>
      <div className="space-y-3">
        <div className="text-11 text-ink-3">Analyze real estate transaction patterns and ML risk indicators for the subject.</div>
        <RunBtn onClick={run} disabled={status === "loading"} />
        {error && <ErrorBox msg={error} />}
        {result && (
          <div className="space-y-2 mt-2">
            <div className="flex gap-3 text-11 font-mono flex-wrap">
              <span>ML risk: <span className={`font-semibold ${RISK_COLOR[result.mlRisk]}`}>{result.mlRisk.toUpperCase()}</span></span>
              {result.priceManipulation && <span className="text-red">Price manipulation ⚠</span>}
              {result.allCashTransaction && <span className="text-amber">All-cash ⚠</span>}
              {result.rapidFlipping && <span className="text-amber">Rapid flipping ⚠</span>}
            </div>
            <div className="text-11 text-ink-2">{result.dldRegistrationRisk}</div>
            {result.indicators.slice(0, 5).map((ind, i) => (
              <div key={i} className="bg-bg-2 rounded p-2">
                <div className="flex gap-2">
                  <span className={`text-10 font-mono font-semibold ${ind.severity === "critical" ? "text-red" : ind.severity === "high" ? "text-orange" : "text-amber"}`}>{ind.severity}</span>
                  <span className="text-11 text-ink-1">{ind.indicator}</span>
                </div>
                <div className="text-10 text-ink-3 mt-0.5">{ind.detail}</div>
                <div className="text-10 font-mono text-ink-3">{ind.fatfRef}</div>
              </div>
            ))}
            <div className="text-11 text-ink-2">Recommended: {result.recommendedAction} — {result.actionRationale}</div>
          </div>
        )}
      </div>
    </IntelSection>
  );
}

// ─── 15. UN Panel / OFAC Narrative Mining ────────────────────────────────────

interface SanctionsBreachResult {
  breachSeverity: "critical" | "high" | "medium" | "low";
  voluntaryDisclosureRecommended: boolean;
  estimatedPenaltyRange: string;
  mitigatingFactors: string[];
  aggravatingFactors: string[];
  immediateActions: string[];
  disclosureDraft: string;
  regulatoryBasis: string;
}

function SanctionsNarrativeSection({ subject }: { subject: Subject }) {
  const [status, setStatus] = useState<SectionStatus>("idle");
  const [result, setResult] = useState<SanctionsBreachResult | null>(null);
  const [error, setError] = useState<string>("");

  async function run() {
    setStatus("loading");
    setError("");
    try {
      const res = await fetch("/api/sanctions-breach", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          counterparty: subject.name,
          transactionAmount: subject.exposureAED ?? "unknown",
          sanctionsList: subject.listCoverage?.join(", ") ?? "unknown",
          discoveryDate: new Date().toISOString().slice(0, 10),
          context: `jurisdiction:${subject.jurisdiction} entityType:${subject.entityType}`,
        }),
      });
      const data = (await res.json()) as SanctionsBreachResult & { ok?: boolean; error?: string };
      if (!res.ok || data.error) throw new Error(data.error ?? "API error");
      setResult(data);
      setStatus("done");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unknown error");
      setStatus("error");
    }
  }

  return (
    <IntelSection title="UN Panel / OFAC Narrative Mining" icon="⚖️" status={status}>
      <div className="space-y-3">
        <div className="text-11 text-ink-3">Extract narrative intelligence from sanctions lists and run breach analysis with FATF-based mitigations.</div>
        <RunBtn onClick={run} disabled={status === "loading"} />
        {error && <ErrorBox msg={error} />}
        {result && (
          <div className="space-y-2 mt-2">
            <div className={`text-12 font-semibold font-mono ${RISK_COLOR[result.breachSeverity]}`}>Breach severity: {result.breachSeverity.toUpperCase()}</div>
            {result.voluntaryDisclosureRecommended && (
              <div className="text-11 font-semibold text-amber bg-amber-dim rounded px-2 py-1">Voluntary disclosure recommended</div>
            )}
            <div className="text-11 text-ink-2"><span className="font-semibold">Estimated penalty: </span>{result.estimatedPenaltyRange}</div>
            {result.immediateActions.length > 0 && (
              <div>
                <div className="text-10 uppercase font-semibold text-ink-3 mb-1">Immediate actions</div>
                <ul className="space-y-0.5">
                  {result.immediateActions.map((a, i) => (
                    <li key={i} className="text-11 text-ink-1 flex gap-1"><span className="text-brand">→</span>{a}</li>
                  ))}
                </ul>
              </div>
            )}
            {result.disclosureDraft && (
              <div>
                <div className="text-10 uppercase font-semibold text-ink-3 mb-1">Disclosure draft</div>
                <div className="text-10 font-mono text-ink-2 bg-bg-2 rounded p-2 whitespace-pre-wrap max-h-32 overflow-y-auto">{result.disclosureDraft}</div>
              </div>
            )}
          </div>
        )}
      </div>
    </IntelSection>
  );
}

// ─── 16. Cross-Case Pattern Detection ────────────────────────────────────────

interface CrossCaseResult {
  ok: boolean;
  similarCases: number;
  clusterRisk: "critical" | "high" | "medium" | "low" | "none";
  patterns: string[];
  error?: string;
}

function CrossCasePatternSection({ subject }: { subject: Subject }) {
  const [status, setStatus] = useState<SectionStatus>("idle");
  const [result, setResult] = useState<CrossCaseResult | null>(null);
  const [error, setError] = useState<string>("");

  async function run() {
    setStatus("loading");
    setError("");
    try {
      const res = await fetch("/api/cross-case-patterns", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          subjectId: subject.id,
          score: subject.riskScore,
          jurisdiction: subject.jurisdiction || subject.country,
          entityType: subject.entityType,
        }),
      });
      const data = (await res.json()) as CrossCaseResult;
      if (!res.ok || data.error) throw new Error(data.error ?? "API error");
      setResult(data);
      setStatus("done");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unknown error");
      setStatus("error");
    }
  }

  return (
    <IntelSection title="Cross-Case Pattern Detection" icon="🔍" status={status}>
      <div className="space-y-3">
        <div className="text-11 text-ink-3">Detect similar risk profiles across the case store and identify clustering patterns.</div>
        <RunBtn onClick={run} disabled={status === "loading"} />
        {error && <ErrorBox msg={error} />}
        {result && (
          <div className="space-y-2 mt-2">
            <div className="flex gap-4 text-11 font-mono">
              <span>Similar cases: <span className="text-ink-0 font-semibold">{result.similarCases}</span></span>
              <span>Cluster risk: <span className={`font-semibold ${RISK_COLOR[result.clusterRisk] ?? "text-ink-0"}`}>{result.clusterRisk.toUpperCase()}</span></span>
            </div>
            {result.patterns.length > 0 && (
              <div>
                <div className="text-10 uppercase font-semibold text-ink-3 mb-1">Detected patterns</div>
                <ul className="space-y-0.5">
                  {result.patterns.map((p, i) => (
                    <li key={i} className="text-11 text-ink-1 flex gap-1"><span className="text-brand">•</span>{p}</li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}
      </div>
    </IntelSection>
  );
}

// ─── 17. Continuous Monitoring Config ────────────────────────────────────────

interface MonitoringConfig {
  frequency: "daily" | "weekly" | "monthly" | "quarterly";
  notificationEmail: string;
  alertThreshold: number;
}

function ContinuousMonitoringSection({ subject }: { subject: Subject }) {
  const storageKey = `monitoring-config-${subject.id}`;
  const saved: MonitoringConfig | null = (() => {
    if (typeof window === "undefined") return null;
    try {
      const raw = localStorage.getItem(storageKey);
      return raw ? (JSON.parse(raw) as MonitoringConfig) : null;
    } catch {
      return null;
    }
  })();

  const [config, setConfig] = useState<MonitoringConfig>({
    frequency: saved?.frequency ?? "monthly",
    notificationEmail: saved?.notificationEmail ?? "",
    alertThreshold: saved?.alertThreshold ?? 60,
  });
  const [saveMsg, setSaveMsg] = useState("");

  function save() {
    try {
      localStorage.setItem(storageKey, JSON.stringify(config));
      setSaveMsg("Configuration saved.");
      setTimeout(() => setSaveMsg(""), 3000);
    } catch {
      setSaveMsg("Failed to save.");
    }
  }

  return (
    <IntelSection title="Continuous Monitoring Config" icon="⚙️" status={saved ? "done" : "idle"}>
      <div className="space-y-3">
        <div className="text-11 text-ink-3">Configure re-screening frequency and notification settings for this subject.</div>
        <div className="grid grid-cols-1 gap-3">
          <div>
            <label className="text-10 uppercase font-semibold text-ink-3 block mb-1">Re-screening frequency</label>
            <select
              className="w-full px-2 py-1.5 border border-hair-2 rounded text-11 bg-bg-panel text-ink-0 focus:outline-none focus:border-brand"
              value={config.frequency}
              onChange={(e) => setConfig((c) => ({ ...c, frequency: e.target.value as MonitoringConfig["frequency"] }))}
            >
              <option value="daily">Daily</option>
              <option value="weekly">Weekly</option>
              <option value="monthly">Monthly</option>
              <option value="quarterly">Quarterly</option>
            </select>
          </div>
          <div>
            <label className="text-10 uppercase font-semibold text-ink-3 block mb-1">Notification email</label>
            <input
              type="email"
              className="w-full px-2 py-1.5 border border-hair-2 rounded text-11 bg-bg-panel text-ink-0 focus:outline-none focus:border-brand"
              placeholder="mlro@institution.com"
              value={config.notificationEmail}
              onChange={(e) => setConfig((c) => ({ ...c, notificationEmail: e.target.value }))}
            />
          </div>
          <div>
            <label className="text-10 uppercase font-semibold text-ink-3 block mb-1">Alert threshold (risk score)</label>
            <div className="flex items-center gap-2">
              <input
                type="range"
                min={0}
                max={100}
                value={config.alertThreshold}
                onChange={(e) => setConfig((c) => ({ ...c, alertThreshold: Number(e.target.value) }))}
                className="flex-1"
              />
              <span className="font-mono text-11 text-ink-0 w-8">{config.alertThreshold}</span>
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={save}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded text-11 font-semibold bg-brand-dim text-brand border border-brand/30 hover:opacity-80"
          >
            Save config
          </button>
          {saveMsg && <span className="text-11 text-green">{saveMsg}</span>}
        </div>
      </div>
    </IntelSection>
  );
}

// ─── 18. Bayesian Risk Trajectory ────────────────────────────────────────────

function BayesianTrajectorySection({ subject, superBrain }: { subject: Subject; superBrain: SuperBrainResult | null }) {
  const baseScore = subject.riskScore;

  // Compute hypothetical evidence-adjusted scores (pure heuristic)
  const trajectoryPoints = [
    { label: "Current", score: baseScore, note: "Baseline" },
    { label: "+SAR filing", score: Math.min(100, baseScore + 15), note: "If STR filed" },
    { label: "+PEP confirmed", score: Math.min(100, baseScore + 20), note: "If PEP verified" },
    { label: "+AM cleared", score: Math.max(0, baseScore - 15), note: "If adverse media cleared" },
    { label: "+EDD done", score: Math.max(0, baseScore - 20), note: "If full EDD completed" },
    { label: "+Network mapped", score: baseScore > 50 ? Math.min(100, baseScore + 10) : Math.max(0, baseScore - 5), note: "After network analysis" },
  ];

  const maxScore = 100;
  const chartW = 400;
  const chartH = 120;
  const padL = 32;
  const padR = 16;
  const padT = 12;
  const padB = 24;
  const innerW = chartW - padL - padR;
  const innerH = chartH - padT - padB;
  const step = innerW / (trajectoryPoints.length - 1);

  const points = trajectoryPoints.map((p, i) => ({
    x: padL + i * step,
    y: padT + innerH - (p.score / maxScore) * innerH,
    ...p,
  }));

  const polyline = points.map((p) => `${p.x},${p.y}`).join(" ");

  return (
    <IntelSection title="Bayesian Risk Trajectory" icon="📈" status="done">
      <div className="space-y-3">
        <div className="text-11 text-ink-3">Simulated risk score evolution with additional evidence scenarios.</div>
        <div className="overflow-x-auto">
          <svg viewBox={`0 0 ${chartW} ${chartH}`} className="w-full max-w-lg" style={{ minWidth: 280 }}>
            {/* Grid lines */}
            {[0, 25, 50, 75, 100].map((v) => {
              const y = padT + innerH - (v / maxScore) * innerH;
              return (
                <g key={v}>
                  <line x1={padL} y1={y} x2={chartW - padR} y2={y} stroke="currentColor" strokeOpacity="0.1" strokeWidth="0.5" />
                  <text x={padL - 4} y={y + 4} textAnchor="end" fontSize="8" fill="currentColor" opacity="0.5">{v}</text>
                </g>
              );
            })}
            {/* Area fill */}
            <polyline
              points={[`${padL},${padT + innerH}`, ...points.map((p) => `${p.x},${p.y}`), `${chartW - padR},${padT + innerH}`].join(" ")}
              fill="currentColor"
              fillOpacity="0.06"
              stroke="none"
            />
            {/* Line */}
            <polyline points={polyline} fill="none" stroke="#e879f9" strokeWidth="1.5" strokeLinejoin="round" />
            {/* Points */}
            {points.map((p, i) => (
              <g key={i}>
                <circle cx={p.x} cy={p.y} r="3" fill="#e879f9" />
                <text x={p.x} y={padT + innerH + 12} textAnchor="middle" fontSize="7" fill="currentColor" opacity="0.6">
                  {p.label.slice(0, 8)}
                </text>
                <title>{p.label}: {p.score} — {p.note}</title>
              </g>
            ))}
          </svg>
        </div>
        <div className="grid grid-cols-2 gap-1">
          {trajectoryPoints.map((p) => (
            <div key={p.label} className="flex justify-between text-10 font-mono bg-bg-2 rounded px-2 py-1">
              <span className="text-ink-2">{p.label}</span>
              <span className={`font-semibold ${p.score >= 70 ? "text-red" : p.score >= 40 ? "text-amber" : "text-green"}`}>{p.score}</span>
            </div>
          ))}
        </div>
      </div>
    </IntelSection>
  );
}

// ─── 19. Industry Typology Matching ──────────────────────────────────────────

interface FiuTypologyCheckResult {
  ok: boolean;
  typologies?: Array<{ id: string; title: string; riskRating: string; redFlags: string[]; fatfRecommendations: string[] }>;
  coverageMatrix?: Array<{ typologyId: string; title: string; coverageScore: number; gaps: string[] }>;
  overallCoverage?: number;
  error?: string;
}

function IndustryTypologySection({ subject }: { subject: Subject }) {
  const [status, setStatus] = useState<SectionStatus>("idle");
  const [result, setResult] = useState<FiuTypologyCheckResult | null>(null);
  const [error, setError] = useState<string>("");

  async function run() {
    setStatus("loading");
    setError("");
    try {
      const res = await fetch("/api/fiu-typology-check", {
        method: "GET",
        headers: { "content-type": "application/json" },
      });
      const data = (await res.json()) as FiuTypologyCheckResult;
      if (!res.ok || data.error) throw new Error(data.error ?? "API error");
      setResult(data);
      setStatus("done");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unknown error");
      setStatus("error");
    }
  }

  return (
    <IntelSection title="Industry Typology Matching" icon="📊" status={status}>
      <div className="space-y-3">
        <div className="text-11 text-ink-3">Match subject industry to FIU DPMS Sept 2025 typologies and identify applicable red flags.</div>
        <RunBtn onClick={run} disabled={status === "loading"} />
        {error && <ErrorBox msg={error} />}
        {result && (
          <div className="space-y-2 mt-2">
            {result.overallCoverage !== undefined && (
              <div className="text-11 font-mono">
                Coverage: <span className="text-ink-0 font-semibold">{result.overallCoverage}%</span>
              </div>
            )}
            {(result.typologies ?? []).slice(0, 5).map((t) => (
              <div key={t.id} className="bg-bg-2 border border-hair-2 rounded p-2">
                <div className="flex items-center gap-2 mb-1">
                  <span className={`text-10 font-mono font-semibold ${t.riskRating === "critical" ? "text-red" : t.riskRating === "high" ? "text-orange" : "text-amber"}`}>{t.riskRating}</span>
                  <span className="text-11 text-ink-0">{t.title}</span>
                </div>
                <div className="flex flex-wrap gap-1">
                  {(t.redFlags ?? []).slice(0, 3).map((f, i) => (
                    <span key={i} className="text-10 font-mono bg-red-dim text-red border border-red/20 px-1 py-0.5 rounded">{f}</span>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </IntelSection>
  );
}

// ─── 20. Multi-Jurisdiction Filing ───────────────────────────────────────────

interface FilingRequirement {
  jurisdiction: string;
  filingType: string;
  threshold: number;
  required: boolean;
  reason: string;
  module: string;
}

function getFilingRequirements(subject: Subject): FilingRequirement[] {
  const score = subject.riskScore;
  const country = subject.country || subject.jurisdiction;
  const isHighRisk = score >= 60;
  const isCritical = score >= 80;

  const requirements: FilingRequirement[] = [
    {
      jurisdiction: "UAE (goAML)",
      filingType: "Suspicious Transaction Report (STR)",
      threshold: 60,
      required: isHighRisk,
      reason: "UAE FDL 10/2025 Art.15 — STR mandatory for suspected ML/TF",
      module: "/goaml",
    },
    {
      jurisdiction: "UAE (CBUAE)",
      filingType: "Currency Transaction Report (CTR)",
      threshold: 80,
      required: isCritical && country?.toLowerCase().includes("uae"),
      reason: "CBUAE Reg — cash transactions >AED 40,000",
      module: "/goaml",
    },
    {
      jurisdiction: "US (FinCEN)",
      filingType: "Suspicious Activity Report (SAR)",
      threshold: 70,
      required: score >= 70 && (country?.toLowerCase().includes("us") || country?.toLowerCase().includes("united states")),
      reason: "BSA §5318(g) — financial institution SAR obligation",
      module: "/sar-report",
    },
    {
      jurisdiction: "UK (NCA)",
      filingType: "Suspicious Activity Report (SAR)",
      threshold: 65,
      required: score >= 65 && (country?.toLowerCase().includes("uk") || country?.toLowerCase().includes("united kingdom")),
      reason: "Proceeds of Crime Act 2002 §330 — nominated officer SAR",
      module: "/sar-report",
    },
    {
      jurisdiction: "EU (FIU.net)",
      filingType: "Suspicious Transaction Report",
      threshold: 65,
      required: score >= 65 && (country?.toLowerCase().includes("eu") || country?.toLowerCase().includes("europe")),
      reason: "AMLD6 Art.50 — obliged entity STR obligation",
      module: "/goaml",
    },
    {
      jurisdiction: "FATF (All jurisdictions)",
      filingType: "Enhanced Due Diligence documentation",
      threshold: 50,
      required: score >= 50,
      reason: "FATF R.10 — enhanced measures for higher risk",
      module: "/cdd-review",
    },
  ];

  return requirements.filter((r) => r.required || r.threshold <= score + 10);
}

function MultiJurisdictionFilingSection({ subject }: { subject: Subject }) {
  const requirements = getFilingRequirements(subject);
  const required = requirements.filter((r) => r.required);
  const optional = requirements.filter((r) => !r.required);

  return (
    <IntelSection title="Multi-Jurisdiction Filing" icon="🌐" status={required.length > 0 ? "done" : "idle"}>
      <div className="space-y-3">
        <div className="text-11 text-ink-3">Jurisdictions requiring reporting based on risk score ({subject.riskScore}) and country ({subject.country || subject.jurisdiction || "unknown"}).</div>
        {required.length > 0 && (
          <div>
            <div className="text-10 uppercase font-semibold text-red mb-2">Required filings ({required.length})</div>
            <div className="space-y-1.5">
              {required.map((r) => (
                <div key={r.jurisdiction} className="bg-red-dim border border-red/20 rounded p-2">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <div className="text-11 font-semibold text-ink-0">{r.jurisdiction} — {r.filingType}</div>
                      <div className="text-10 text-ink-3 mt-0.5">{r.reason}</div>
                    </div>
                    <a
                      href={r.module}
                      className="shrink-0 text-10 font-semibold px-2 py-1 rounded bg-brand-dim text-brand border border-brand/30 hover:opacity-80"
                    >
                      File →
                    </a>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
        {optional.length > 0 && (
          <div>
            <div className="text-10 uppercase font-semibold text-ink-3 mb-2">Consider ({optional.length})</div>
            <div className="space-y-1.5">
              {optional.map((r) => (
                <div key={r.jurisdiction} className="bg-bg-2 border border-hair-2 rounded p-2">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <div className="text-11 text-ink-1">{r.jurisdiction} — {r.filingType}</div>
                      <div className="text-10 text-ink-3 mt-0.5">Threshold: {r.threshold} · {r.reason}</div>
                    </div>
                    <a
                      href={r.module}
                      className="shrink-0 text-10 font-semibold px-2 py-1 rounded border border-hair-2 text-ink-2 hover:border-brand/40 hover:text-brand"
                    >
                      Open →
                    </a>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
        {required.length === 0 && optional.length === 0 && (
          <div className="text-11 text-green italic">No filing requirements triggered at current risk score.</div>
        )}
      </div>
    </IntelSection>
  );
}

// ─── Main DeepIntelPanel ──────────────────────────────────────────────────────

export function DeepIntelPanel({ subject, screen, superBrain }: Props) {
  return (
    <div className="space-y-2 mt-4">
      <div className="text-12 text-ink-3 mb-4">
        Deep Intelligence workbench — 20 independent modules. Expand any section and click <strong className="text-ink-1">Run</strong> to trigger on demand.
      </div>

      {/* GROUP 1: Identity & Aliases */}
      <GroupHeader label="Identity & Aliases" />
      <NameVariantSection subject={subject} screen={screen} />
      <PepNetworkSection subject={subject} />

      {/* GROUP 2: Network & Entities */}
      <GroupHeader label="Network & Entities" />
      <NetworkExpansionSection subject={subject} />
      <CorporateRegistrySection subject={subject} />
      <VesselAircraftSection subject={subject} />

      {/* GROUP 3: Financial Behavior */}
      <GroupHeader label="Financial Behavior" />
      <TransactionOverlaySection subject={subject} />
      <RealEstateSection subject={subject} />
      <DarkWebBreachSection subject={subject} />

      {/* GROUP 4: Geopolitical & Regulatory */}
      <GroupHeader label="Geopolitical & Regulatory" />
      <GeoRiskSection subject={subject} />
      <SanctionsNarrativeSection subject={subject} />
      <RegulatoryDeadlinesSection subject={subject} />

      {/* GROUP 5: AI Analysis */}
      <GroupHeader label="AI Analysis" />
      <AdversarialRedTeamSection subject={subject} screen={screen} />
      <DispositionPredictorSection subject={subject} screen={screen} superBrain={superBrain} />
      <BayesianTrajectorySection subject={subject} superBrain={superBrain} />
      <IndustryTypologySection subject={subject} />

      {/* GROUP 6: Case Actions */}
      <GroupHeader label="Case Actions" />
      <DocumentIntelSection subject={subject} />
      <VoiceToCaseSection subject={subject} />
      <CrossCasePatternSection subject={subject} />
      <MultiJurisdictionFilingSection subject={subject} />
      <ContinuousMonitoringSection subject={subject} />
    </div>
  );
}
