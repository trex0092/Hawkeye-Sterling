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

// ═══════════════════════════════════════════════════════════════════════════════
// NEW SECTIONS — Group 1 additions (Identity)
// ═══════════════════════════════════════════════════════════════════════════════

// ─── 21. OSINT Digital Footprint ─────────────────────────────────────────────

function OsintSection({ subject }: { subject: Subject }) {
  const [status, setStatus] = useState<SectionStatus>("idle");
  const [result, setResult] = useState<unknown>(null);
  const [error, setError] = useState<string | null>(null);

  async function run() {
    setStatus("loading");
    setError(null);
    try {
      const res = await fetch("/api/osint-bridge", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ tool: "sherlock", username: subject.name, entityType: subject.entityType }),
      });
      const data = (await res.json()) as unknown;
      setResult(data);
      setStatus("done");
    } catch (err) {
      setError(String(err));
      setStatus("error");
    }
  }

  return (
    <IntelSection title="OSINT Digital Footprint" icon="🌐" status={status}>
      <div className="space-y-3">
        <div className="text-11 text-ink-3">Search for digital presence, social profiles, and web intelligence associated with the subject.</div>
        <RunBtn onClick={run} disabled={status === "loading"} />
        {error && <ErrorBox msg={error} />}
        {result && <JsonTree data={result} />}
      </div>
    </IntelSection>
  );
}

// ─── 22. Email & Domain Reputation ───────────────────────────────────────────

interface EmailRepResult {
  ok: boolean;
  domain: string;
  domainAge: string;
  mxRecords: string[];
  isDisposable: boolean;
  fraudScore: number;
  riskLevel: string;
  notes: (string | null)[];
}

function EmailRepSection({ subject }: { subject: Subject }) {
  const [status, setStatus] = useState<SectionStatus>("idle");
  const [result, setResult] = useState<EmailRepResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function run() {
    setStatus("loading");
    setError(null);
    try {
      const res = await fetch("/api/email-reputation", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ domain: subject.name }),
      });
      const data = (await res.json()) as EmailRepResult;
      setResult(data);
      setStatus("done");
    } catch (err) {
      setError(String(err));
      setStatus("error");
    }
  }

  return (
    <IntelSection title="Email & Domain Reputation" icon="📧" status={status}>
      <div className="space-y-3">
        <div className="text-11 text-ink-3">Domain age, MX record analysis, disposable email check, and fraud score.</div>
        <RunBtn onClick={run} disabled={status === "loading"} />
        {error && <ErrorBox msg={error} />}
        {result && (
          <div className="space-y-2 mt-2">
            <div className="flex gap-4 text-11 font-mono flex-wrap">
              <span>Domain: <span className="text-ink-0">{result.domain}</span></span>
              <span>Age: <span className="text-ink-0">{result.domainAge}</span></span>
              <span>Fraud score: <span className={`font-semibold ${result.fraudScore >= 60 ? "text-red" : result.fraudScore >= 35 ? "text-amber" : "text-green"}`}>{result.fraudScore}</span></span>
              <span>Risk: <span className={`font-semibold ${result.riskLevel === "critical" || result.riskLevel === "high" ? "text-red" : result.riskLevel === "medium" ? "text-amber" : "text-green"}`}>{result.riskLevel.toUpperCase()}</span></span>
            </div>
            {result.isDisposable && (
              <div className="text-11 font-semibold text-red bg-red-dim rounded px-2 py-1">⚠ Disposable email domain detected</div>
            )}
            {result.mxRecords.length > 0 && (
              <div>
                <div className="text-10 uppercase font-semibold text-ink-3 mb-1">MX Records</div>
                <div className="flex flex-wrap gap-1">
                  {result.mxRecords.map((mx) => (
                    <span key={mx} className="text-10 font-mono bg-bg-2 border border-hair-2 px-1.5 py-0.5 rounded">{mx}</span>
                  ))}
                </div>
              </div>
            )}
            {result.notes.filter(Boolean).length > 0 && (
              <ul className="space-y-0.5">
                {result.notes.filter(Boolean).map((n, i) => (
                  <li key={i} className="text-11 text-amber flex gap-1"><span>⚠</span>{n}</li>
                ))}
              </ul>
            )}
          </div>
        )}
      </div>
    </IntelSection>
  );
}

// ─── 23. Smart Identity Disambiguation ───────────────────────────────────────

function SmartDisambiguateSection({ subject }: { subject: Subject }) {
  const [status, setStatus] = useState<SectionStatus>("idle");
  const [result, setResult] = useState<unknown>(null);
  const [error, setError] = useState<string | null>(null);

  async function run() {
    setStatus("loading");
    setError(null);
    try {
      const res = await fetch("/api/smart-disambiguate", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name: subject.name, context: `entityType:${subject.entityType} jurisdiction:${subject.jurisdiction || subject.country}` }),
      });
      const data = (await res.json()) as unknown;
      setResult(data);
      setStatus("done");
    } catch (err) {
      setError(String(err));
      setStatus("error");
    }
  }

  return (
    <IntelSection title="Smart Identity Disambiguation" icon="🧬" status={status}>
      <div className="space-y-3">
        <div className="text-11 text-ink-3">Alias deduplication and identity clustering — distinguish true matches from false positives.</div>
        <RunBtn onClick={run} disabled={status === "loading"} />
        {error && <ErrorBox msg={error} />}
        {result && <JsonTree data={result} />}
      </div>
    </IntelSection>
  );
}

// ─── 24. IBAN Risk Assessment ────────────────────────────────────────────────

interface IbanRiskResult {
  ok: boolean;
  iban: string;
  countryCode: string;
  country: string;
  riskLevel: string;
  fatfStatus: string;
  notes: string[];
  eddRequired: boolean;
  sanctionsCheck: boolean;
}

function IbanRiskSection({ subject }: { subject: Subject }) {
  const [status, setStatus] = useState<SectionStatus>("idle");
  const [result, setResult] = useState<IbanRiskResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [iban, setIban] = useState<string>("");

  async function run() {
    const ibanVal = iban.trim() || (subject as Subject & { iban?: string }).iban || "";
    if (!ibanVal) { setError("Enter an IBAN first"); return; }
    setStatus("loading");
    setError(null);
    try {
      const res = await fetch("/api/iban-risk", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ iban: ibanVal }),
      });
      const data = (await res.json()) as IbanRiskResult;
      setResult(data);
      setStatus("done");
    } catch (err) {
      setError(String(err));
      setStatus("error");
    }
  }

  return (
    <IntelSection title="IBAN Risk Assessment" icon="🏦" status={status}>
      <div className="space-y-3">
        <div className="text-11 text-ink-3">Parse IBAN country code and assess jurisdiction risk, FATF status, and sanctions exposure.</div>
        <input
          type="text"
          className="w-full px-2 py-1.5 border border-hair-2 rounded text-11 bg-bg-panel text-ink-0 font-mono focus:outline-none focus:border-brand"
          placeholder="e.g. GB29 NWBK 6016 1331 9268 19"
          value={iban}
          onChange={(e) => setIban(e.target.value)}
        />
        <RunBtn onClick={run} disabled={status === "loading"} />
        {error && <ErrorBox msg={error} />}
        {result && (
          <div className="space-y-2 mt-2">
            <div className="flex gap-4 text-11 font-mono flex-wrap">
              <span>Country: <span className="text-ink-0">{result.country} ({result.countryCode})</span></span>
              <span>Risk: <span className={`font-semibold ${result.riskLevel === "critical" || result.riskLevel === "high" ? "text-red" : result.riskLevel === "medium" ? "text-amber" : "text-green"}`}>{result.riskLevel.toUpperCase()}</span></span>
            </div>
            <div className="text-11 text-ink-2">FATF: {result.fatfStatus}</div>
            {result.eddRequired && <div className="text-11 font-semibold text-amber bg-amber-dim rounded px-2 py-1">⚠ Enhanced Due Diligence required</div>}
            {result.sanctionsCheck && <div className="text-11 font-semibold text-red bg-red-dim rounded px-2 py-1">⚠ Sanctions check mandatory</div>}
            {result.notes.length > 0 && (
              <ul className="space-y-0.5">
                {result.notes.map((n, i) => <li key={i} className="text-11 text-ink-2 flex gap-1"><span className="text-brand">•</span>{n}</li>)}
              </ul>
            )}
          </div>
        )}
      </div>
    </IntelSection>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// NEW SECTIONS — Group 3 additions (Financial Behavior)
// ═══════════════════════════════════════════════════════════════════════════════

// ─── 25. SWIFT / LC Analyzer ─────────────────────────────────────────────────

interface SwiftLcResultUI {
  tbmlRisk: string;
  messageType: string;
  priceManipulation: boolean;
  routingRisk: string;
  amendmentSuspicion: boolean;
  beneficiaryRisk: string;
  indicators: Array<{ indicator: string; severity: string; detail: string }>;
  recommendedAction: string;
  actionRationale: string;
  regulatoryBasis: string;
}

function SwiftLcSection({ subject }: { subject: Subject }) {
  const [status, setStatus] = useState<SectionStatus>("idle");
  const [result, setResult] = useState<SwiftLcResultUI | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function run() {
    setStatus("loading");
    setError(null);
    try {
      const res = await fetch("/api/swift-lc-analyzer", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ bankName: subject.name }),
      });
      const data = (await res.json()) as SwiftLcResultUI;
      setResult(data);
      setStatus("done");
    } catch (err) {
      setError(String(err));
      setStatus("error");
    }
  }

  return (
    <IntelSection title="SWIFT / LC Analyzer" icon="🏛️" status={status}>
      <div className="space-y-3">
        <div className="text-11 text-ink-3">SWIFT/BIC lookup, correspondent banking chain analysis, and LC red flag detection.</div>
        <RunBtn onClick={run} disabled={status === "loading"} />
        {error && <ErrorBox msg={error} />}
        {result && (
          <div className="space-y-2 mt-2">
            <div className="flex gap-3 text-11 font-mono flex-wrap">
              <span>TBML Risk: <span className={`font-semibold ${result.tbmlRisk === "critical" || result.tbmlRisk === "high" ? "text-red" : result.tbmlRisk === "medium" ? "text-amber" : "text-green"}`}>{result.tbmlRisk?.toUpperCase()}</span></span>
              <span>Type: <span className="text-ink-1">{result.messageType}</span></span>
              <span>Routing risk: <span className={result.routingRisk === "high" ? "text-red" : result.routingRisk === "medium" ? "text-amber" : "text-green"}>{result.routingRisk}</span></span>
            </div>
            <div className="flex gap-3 flex-wrap">
              {result.priceManipulation && <span className="text-10 font-mono bg-red-dim text-red border border-red/30 px-1.5 py-0.5 rounded">Price manipulation</span>}
              {result.amendmentSuspicion && <span className="text-10 font-mono bg-amber-dim text-amber border border-amber/30 px-1.5 py-0.5 rounded">Amendment suspicion</span>}
            </div>
            <div className="text-11 text-ink-2">Beneficiary risk: {result.beneficiaryRisk}</div>
            {result.indicators.slice(0, 4).map((ind, i) => (
              <div key={i} className="bg-bg-2 rounded p-2">
                <div className="flex gap-2">
                  <span className={`text-10 font-mono font-semibold ${ind.severity === "critical" || ind.severity === "high" ? "text-red" : "text-amber"}`}>{ind.severity}</span>
                  <span className="text-11 text-ink-1">{ind.indicator}</span>
                </div>
                <div className="text-10 text-ink-3 mt-0.5">{ind.detail}</div>
              </div>
            ))}
            <div className="text-11 text-ink-2">Recommended: {result.recommendedAction} — {result.actionRationale}</div>
          </div>
        )}
      </div>
    </IntelSection>
  );
}

// ─── 26. Crypto Wallet Tracing ────────────────────────────────────────────────

function CryptoTracingSection({ subject }: { subject: Subject }) {
  const [status, setStatus] = useState<SectionStatus>("idle");
  const [result, setResult] = useState<unknown>(null);
  const [error, setError] = useState<string | null>(null);
  const [wallet, setWallet] = useState<string>("");

  async function run() {
    setStatus("loading");
    setError(null);
    try {
      const res = await fetch("/api/crypto-tracing", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ walletAddress: wallet || subject.name, blockchain: "bitcoin", entityName: subject.name, transactionHistory: "", exchangeOrigin: "", transactionPatterns: { highFrequency: false, largeSingleTx: false, mixerUsed: false, privacyCoinConversion: false, peeling: false, consolidation: false, layering: false }, riskFlags: { darknetMarket: false, ransomware: false, scam: false, sanctions: false, childExploitation: false, terroristFinancing: false } }),
      });
      const data = (await res.json()) as unknown;
      setResult(data);
      setStatus("done");
    } catch (err) {
      setError(String(err));
      setStatus("error");
    }
  }

  return (
    <IntelSection title="Crypto Wallet Tracing" icon="₿" status={status}>
      <div className="space-y-3">
        <div className="text-11 text-ink-3">Wallet cluster analysis, tainted fund tracing, and exchange attribution.</div>
        <input
          type="text"
          className="w-full px-2 py-1.5 border border-hair-2 rounded text-11 bg-bg-panel text-ink-0 font-mono focus:outline-none focus:border-brand"
          placeholder="Wallet address (optional — uses subject name if blank)"
          value={wallet}
          onChange={(e) => setWallet(e.target.value)}
        />
        <RunBtn onClick={run} disabled={status === "loading"} />
        {error && <ErrorBox msg={error} />}
        {result && <JsonTree data={result} />}
      </div>
    </IntelSection>
  );
}

// ─── 27. Crypto Mixer / DeFi Exposure ────────────────────────────────────────

function CryptoMixingSection({ subject }: { subject: Subject }) {
  const [status, setStatus] = useState<SectionStatus>("idle");
  const [result, setResult] = useState<unknown>(null);
  const [error, setError] = useState<string | null>(null);
  const [wallet, setWallet] = useState<string>("");

  async function run() {
    setStatus("loading");
    setError(null);
    try {
      const res = await fetch("/api/crypto-mixing", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ wallet: wallet || subject.name }),
      });
      const data = (await res.json()) as unknown;
      setResult(data);
      setStatus("done");
    } catch (err) {
      setError(String(err));
      setStatus("error");
    }
  }

  return (
    <IntelSection title="Crypto Mixer / DeFi Exposure" icon="🔀" status={status}>
      <div className="space-y-3">
        <div className="text-11 text-ink-3">Detect mixing service usage, DeFi protocol exposure, and obfuscation techniques.</div>
        <input
          type="text"
          className="w-full px-2 py-1.5 border border-hair-2 rounded text-11 bg-bg-panel text-ink-0 font-mono focus:outline-none focus:border-brand"
          placeholder="Wallet address"
          value={wallet}
          onChange={(e) => setWallet(e.target.value)}
        />
        <RunBtn onClick={run} disabled={status === "loading"} />
        {error && <ErrorBox msg={error} />}
        {result && <JsonTree data={result} />}
      </div>
    </IntelSection>
  );
}

// ─── 28. Trade Finance Red Flags ─────────────────────────────────────────────

function TradeFinanceSection({ subject }: { subject: Subject }) {
  const [status, setStatus] = useState<SectionStatus>("idle");
  const [result, setResult] = useState<unknown>(null);
  const [error, setError] = useState<string | null>(null);

  async function run() {
    setStatus("loading");
    setError(null);
    try {
      const res = await fetch("/api/trade-finance-rf", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ subjectName: subject.name }),
      });
      const data = (await res.json()) as unknown;
      setResult(data);
      setStatus("done");
    } catch (err) {
      setError(String(err));
      setStatus("error");
    }
  }

  return (
    <IntelSection title="Trade Finance Red Flags" icon="🚢" status={status}>
      <div className="space-y-3">
        <div className="text-11 text-ink-3">Detect TBML patterns: over/under-invoicing, phantom shipments, multiple invoicing.</div>
        <RunBtn onClick={run} disabled={status === "loading"} />
        {error && <ErrorBox msg={error} />}
        {result && <JsonTree data={result} />}
      </div>
    </IntelSection>
  );
}

// ─── 29. Shell Company Detector ───────────────────────────────────────────────

interface ShellDetectorResult {
  shellRisk: string;
  shellProbability: number;
  redFlags: Array<{ flag: string; severity: string; category: string; detail: string }>;
  recommendedAction: string;
  actionRationale: string;
}

function ShellDetectorSection({ subject }: { subject: Subject }) {
  const [status, setStatus] = useState<SectionStatus>("idle");
  const [result, setResult] = useState<ShellDetectorResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function run() {
    setStatus("loading");
    setError(null);
    try {
      const res = await fetch("/api/shell-detector", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ entityName: subject.name }),
      });
      const data = (await res.json()) as ShellDetectorResult;
      setResult(data);
      setStatus("done");
    } catch (err) {
      setError(String(err));
      setStatus("error");
    }
  }

  return (
    <IntelSection title="Shell Company Detector" icon="🐚" status={status}>
      <div className="space-y-3">
        <div className="text-11 text-ink-3">Score shell company probability based on structural, director, and geographic indicators.</div>
        <RunBtn onClick={run} disabled={status === "loading"} />
        {error && <ErrorBox msg={error} />}
        {result && (
          <div className="space-y-2 mt-2">
            <div className="flex gap-4 text-11 font-mono">
              <span>Shell risk: <span className={`font-semibold ${result.shellRisk === "critical" || result.shellRisk === "high" ? "text-red" : result.shellRisk === "medium" ? "text-amber" : "text-green"}`}>{result.shellRisk?.toUpperCase()}</span></span>
              <span>Probability: <span className={`font-semibold ${result.shellProbability >= 60 ? "text-red" : result.shellProbability >= 35 ? "text-amber" : "text-green"}`}>{result.shellProbability}%</span></span>
            </div>
            <div>
              <div className="text-10 uppercase font-semibold text-ink-3 mb-1">Risk factors</div>
              <div className="flex flex-wrap gap-1">
                {result.redFlags.slice(0, 8).map((f, i) => (
                  <span key={i} className={`text-10 font-mono px-1.5 py-0.5 rounded border ${f.severity === "critical" || f.severity === "high" ? "bg-red-dim text-red border-red/30" : "bg-amber-dim text-amber border-amber/30"}`}>{f.flag}</span>
                ))}
              </div>
            </div>
            <div className="text-11 text-ink-2">Recommended: {result.recommendedAction} — {result.actionRationale}</div>
          </div>
        )}
      </div>
    </IntelSection>
  );
}

// ─── 30. Hawala / Informal Value Transfer ────────────────────────────────────

function HawalaDetectorSection({ subject }: { subject: Subject }) {
  const [status, setStatus] = useState<SectionStatus>("idle");
  const [result, setResult] = useState<unknown>(null);
  const [error, setError] = useState<string | null>(null);

  async function run() {
    setStatus("loading");
    setError(null);
    try {
      const res = await fetch("/api/hawala-detector", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ subjectName: subject.name }),
      });
      const data = (await res.json()) as unknown;
      setResult(data);
      setStatus("done");
    } catch (err) {
      setError(String(err));
      setStatus("error");
    }
  }

  return (
    <IntelSection title="Hawala / Informal Value Transfer" icon="💱" status={status}>
      <div className="space-y-3">
        <div className="text-11 text-ink-3">Detect hawala network indicators and informal value transfer system usage.</div>
        <RunBtn onClick={run} disabled={status === "loading"} />
        {error && <ErrorBox msg={error} />}
        {result && <JsonTree data={result} />}
      </div>
    </IntelSection>
  );
}

// ─── 31. Layering / Loan-Back Detection ──────────────────────────────────────

function LayeringDetectorSection({ subject }: { subject: Subject }) {
  const [status, setStatus] = useState<SectionStatus>("idle");
  const [result, setResult] = useState<unknown>(null);
  const [error, setError] = useState<string | null>(null);

  async function run() {
    setStatus("loading");
    setError(null);
    try {
      const res = await fetch("/api/layering-detector", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ subjectName: subject.name }),
      });
      const data = (await res.json()) as unknown;
      setResult(data);
      setStatus("done");
    } catch (err) {
      setError(String(err));
      setStatus("error");
    }
  }

  return (
    <IntelSection title="Layering / Loan-Back Detection" icon="🔄" status={status}>
      <div className="space-y-3">
        <div className="text-11 text-ink-3">Identify loan-back schemes, round-trip transactions, and complex layering patterns.</div>
        <RunBtn onClick={run} disabled={status === "loading"} />
        {error && <ErrorBox msg={error} />}
        {result && <JsonTree data={result} />}
      </div>
    </IntelSection>
  );
}

// ─── 32. Cash-Intensive Business Overlay ─────────────────────────────────────

function CashIntensiveSection({ subject }: { subject: Subject }) {
  const [status, setStatus] = useState<SectionStatus>("idle");
  const [result, setResult] = useState<unknown>(null);
  const [error, setError] = useState<string | null>(null);

  async function run() {
    setStatus("loading");
    setError(null);
    try {
      const res = await fetch("/api/cash-intensive", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ subjectName: subject.name, industry: subject.riskCategory ?? subject.meta ?? "" }),
      });
      const data = (await res.json()) as unknown;
      setResult(data);
      setStatus("done");
    } catch (err) {
      setError(String(err));
      setStatus("error");
    }
  }

  return (
    <IntelSection title="Cash-Intensive Business Overlay" icon="💵" status={status}>
      <div className="space-y-3">
        <div className="text-11 text-ink-3">Assess whether the subject operates in a cash-intensive sector and overlay associated ML risks.</div>
        <RunBtn onClick={run} disabled={status === "loading"} />
        {error && <ErrorBox msg={error} />}
        {result && <JsonTree data={result} />}
      </div>
    </IntelSection>
  );
}

// ─── 33. Ghost / Dormant Company Activation ──────────────────────────────────

function GhostCompanySection({ subject }: { subject: Subject }) {
  const [status, setStatus] = useState<SectionStatus>("idle");
  const [result, setResult] = useState<unknown>(null);
  const [error, setError] = useState<string | null>(null);

  async function run() {
    setStatus("loading");
    setError(null);
    try {
      const res = await fetch("/api/ghost-company", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ entityName: subject.name }),
      });
      const data = (await res.json()) as unknown;
      setResult(data);
      setStatus("done");
    } catch (err) {
      setError(String(err));
      setStatus("error");
    }
  }

  return (
    <IntelSection title="Ghost / Dormant Company Detection" icon="👻" status={status}>
      <div className="space-y-3">
        <div className="text-11 text-ink-3">Detect dormant company reactivation, shelf company indicators, and sudden activity spikes.</div>
        <RunBtn onClick={run} disabled={status === "loading"} />
        {error && <ErrorBox msg={error} />}
        {result && <JsonTree data={result} />}
      </div>
    </IntelSection>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// NEW SECTIONS — Group 4 additions (Geopolitical)
// ═══════════════════════════════════════════════════════════════════════════════

// ─── 34. Secondary / Indirect Sanctions Exposure ─────────────────────────────

function SanctionsIndirectSection({ subject }: { subject: Subject }) {
  const [status, setStatus] = useState<SectionStatus>("idle");
  const [result, setResult] = useState<unknown>(null);
  const [error, setError] = useState<string | null>(null);

  async function run() {
    setStatus("loading");
    setError(null);
    try {
      const res = await fetch("/api/sanctions-indirect", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name: subject.name }),
      });
      const data = (await res.json()) as unknown;
      setResult(data);
      setStatus("done");
    } catch (err) {
      setError(String(err));
      setStatus("error");
    }
  }

  return (
    <IntelSection title="Secondary Sanctions Exposure" icon="⚡" status={status}>
      <div className="space-y-3">
        <div className="text-11 text-ink-3">Assess secondary and indirect sanctions exposure through network links and correspondent relationships.</div>
        <RunBtn onClick={run} disabled={status === "loading"} />
        {error && <ErrorBox msg={error} />}
        {result && <JsonTree data={result} />}
      </div>
    </IntelSection>
  );
}

// ─── 35. Sanctions Regime Mapper ─────────────────────────────────────────────

function SanctionsExposureMapperSection({ subject }: { subject: Subject }) {
  const [status, setStatus] = useState<SectionStatus>("idle");
  const [result, setResult] = useState<unknown>(null);
  const [error, setError] = useState<string | null>(null);

  async function run() {
    setStatus("loading");
    setError(null);
    try {
      const res = await fetch("/api/sanctions-exposure-mapper", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name: subject.name }),
      });
      const data = (await res.json()) as unknown;
      setResult(data);
      setStatus("done");
    } catch (err) {
      setError(String(err));
      setStatus("error");
    }
  }

  return (
    <IntelSection title="Sanctions Regime Mapper" icon="🗺️" status={status}>
      <div className="space-y-3">
        <div className="text-11 text-ink-3">Map exposure across OFAC, EU, UN, UK HMT, OFSI, and UAE TFS sanctions regimes.</div>
        <RunBtn onClick={run} disabled={status === "loading"} />
        {error && <ErrorBox msg={error} />}
        {result && <JsonTree data={result} />}
      </div>
    </IntelSection>
  );
}

// ─── 36. De-risking Impact Assessment ────────────────────────────────────────

function DeRiskingImpactSection({ subject }: { subject: Subject }) {
  const [status, setStatus] = useState<SectionStatus>("idle");
  const [result, setResult] = useState<unknown>(null);
  const [error, setError] = useState<string | null>(null);

  async function run() {
    setStatus("loading");
    setError(null);
    try {
      const res = await fetch("/api/derisking-impact", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ sector: subject.riskCategory ?? "general", jurisdiction: subject.jurisdiction || subject.country }),
      });
      const data = (await res.json()) as unknown;
      setResult(data);
      setStatus("done");
    } catch (err) {
      setError(String(err));
      setStatus("error");
    }
  }

  return (
    <IntelSection title="De-risking Impact Assessment" icon="⚖️" status={status}>
      <div className="space-y-3">
        <div className="text-11 text-ink-3">Assess sector and jurisdiction de-risking exposure and correspondent banking withdrawal risk.</div>
        <RunBtn onClick={run} disabled={status === "loading"} />
        {error && <ErrorBox msg={error} />}
        {result && <JsonTree data={result} />}
      </div>
    </IntelSection>
  );
}

// ─── 37. Conflict Minerals / CAHRA Exposure ──────────────────────────────────

function RmiAssessSection({ subject }: { subject: Subject }) {
  const [status, setStatus] = useState<SectionStatus>("idle");
  const [result, setResult] = useState<unknown>(null);
  const [error, setError] = useState<string | null>(null);

  async function run() {
    setStatus("loading");
    setError(null);
    try {
      const res = await fetch("/api/rmi-assess", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name: subject.name, commodities: "" }),
      });
      const data = (await res.json()) as unknown;
      setResult(data);
      setStatus("done");
    } catch (err) {
      setError(String(err));
      setStatus("error");
    }
  }

  return (
    <IntelSection title="Conflict Minerals / CAHRA Exposure" icon="⛏️" status={status}>
      <div className="space-y-3">
        <div className="text-11 text-ink-3">Assess conflict mineral supply chain exposure and CAHRA (Conflict-Affected High-Risk Areas) linkages.</div>
        <RunBtn onClick={run} disabled={status === "loading"} />
        {error && <ErrorBox msg={error} />}
        {result && <JsonTree data={result} />}
      </div>
    </IntelSection>
  );
}

// ─── 38. Jurisdiction Intelligence ────────────────────────────────────────────

function JurisdictionIntelSection({ subject }: { subject: Subject }) {
  const [status, setStatus] = useState<SectionStatus>("idle");
  const [result, setResult] = useState<unknown>(null);
  const [error, setError] = useState<string | null>(null);

  async function run() {
    setStatus("loading");
    setError(null);
    try {
      const res = await fetch("/api/jurisdiction-intel", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ jurisdiction: subject.jurisdiction || subject.country }),
      });
      const data = (await res.json()) as unknown;
      setResult(data);
      setStatus("done");
    } catch (err) {
      setError(String(err));
      setStatus("error");
    }
  }

  return (
    <IntelSection title="Jurisdiction Intelligence" icon="🌍" status={status}>
      <div className="space-y-3">
        <div className="text-11 text-ink-3">Country risk profile, FATF status, regulatory regime, and AML/CFT framework assessment.</div>
        <RunBtn onClick={run} disabled={status === "loading"} />
        {error && <ErrorBox msg={error} />}
        {result && <JsonTree data={result} />}
      </div>
    </IntelSection>
  );
}

// ─── 39. Sanctions Evasion Typology ──────────────────────────────────────────

function SanctionsEvasionSection({ subject }: { subject: Subject }) {
  const [status, setStatus] = useState<SectionStatus>("idle");
  const [result, setResult] = useState<unknown>(null);
  const [error, setError] = useState<string | null>(null);

  async function run() {
    setStatus("loading");
    setError(null);
    try {
      const res = await fetch("/api/sanctions-evasion", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name: subject.name }),
      });
      const data = (await res.json()) as unknown;
      setResult(data);
      setStatus("done");
    } catch (err) {
      setError(String(err));
      setStatus("error");
    }
  }

  return (
    <IntelSection title="Sanctions Evasion Typology" icon="🚨" status={status}>
      <div className="space-y-3">
        <div className="text-11 text-ink-3">Match subject against known sanctions evasion typologies: name morphing, front companies, re-routing.</div>
        <RunBtn onClick={run} disabled={status === "loading"} />
        {error && <ErrorBox msg={error} />}
        {result && <JsonTree data={result} />}
      </div>
    </IntelSection>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// NEW SECTIONS — Group 5 additions (AI Analysis)
// ═══════════════════════════════════════════════════════════════════════════════

// ─── 40. News Sentiment Intelligence ─────────────────────────────────────────

interface NewsIntelResult {
  ok: boolean;
  sentiment?: string;
  sentimentScore?: number;
  positiveCount?: number;
  neutralCount?: number;
  negativeCount?: number;
  articles?: Array<{ headline: string; date: string; sentiment: string; source: string }>;
  error?: string;
}

function NewsIntelSection({ subject }: { subject: Subject }) {
  const [status, setStatus] = useState<SectionStatus>("idle");
  const [result, setResult] = useState<NewsIntelResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function run() {
    setStatus("loading");
    setError(null);
    try {
      const res = await fetch("/api/news-intel", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name: subject.name }),
      });
      const data = (await res.json()) as NewsIntelResult;
      setResult(data);
      setStatus("done");
    } catch (err) {
      setError(String(err));
      setStatus("error");
    }
  }

  const total = (result?.positiveCount ?? 0) + (result?.neutralCount ?? 0) + (result?.negativeCount ?? 0);
  const posPct = total > 0 ? Math.round(((result?.positiveCount ?? 0) / total) * 100) : 0;
  const neuPct = total > 0 ? Math.round(((result?.neutralCount ?? 0) / total) * 100) : 0;
  const negPct = total > 0 ? Math.round(((result?.negativeCount ?? 0) / total) * 100) : 0;

  return (
    <IntelSection title="News Sentiment Intelligence" icon="📰" status={status}>
      <div className="space-y-3">
        <div className="text-11 text-ink-3">Sentiment trajectory, news timeline, and adverse media clustering.</div>
        <RunBtn onClick={run} disabled={status === "loading"} />
        {error && <ErrorBox msg={error} />}
        {result && (
          <div className="space-y-3 mt-2">
            {total > 0 && (
              <div>
                <div className="text-10 uppercase font-semibold text-ink-3 mb-1">Sentiment distribution ({total} articles)</div>
                <div className="flex h-4 rounded overflow-hidden gap-px">
                  {posPct > 0 && <div className="bg-green" style={{ width: `${posPct}%` }} title={`Positive: ${posPct}%`} />}
                  {neuPct > 0 && <div className="bg-amber" style={{ width: `${neuPct}%` }} title={`Neutral: ${neuPct}%`} />}
                  {negPct > 0 && <div className="bg-red" style={{ width: `${negPct}%` }} title={`Negative: ${negPct}%`} />}
                </div>
                <div className="flex gap-3 text-10 font-mono mt-1">
                  <span className="text-green">+ {posPct}%</span>
                  <span className="text-amber">~ {neuPct}%</span>
                  <span className="text-red">- {negPct}%</span>
                </div>
              </div>
            )}
            {result.articles && result.articles.slice(0, 5).map((a, i) => (
              <div key={i} className="bg-bg-2 rounded p-2">
                <div className="flex items-center gap-2">
                  <span className={`text-10 font-mono ${a.sentiment === "negative" ? "text-red" : a.sentiment === "positive" ? "text-green" : "text-amber"}`}>{a.sentiment}</span>
                  <span className="text-10 text-ink-3">{a.date} · {a.source}</span>
                </div>
                <div className="text-11 text-ink-1 mt-0.5">{a.headline}</div>
              </div>
            ))}
            {!result.articles && <JsonTree data={result} />}
          </div>
        )}
      </div>
    </IntelSection>
  );
}

// ─── 41. SAR Narrative Generator ─────────────────────────────────────────────

interface StrNarrativeResult {
  narrative: string;
  wordCount: number;
  qualityScore: number;
  fatfR20Coverage: string[];
  missingElements: string[];
  regulatoryBasis: string;
}

function SarNarrativeSection({ subject }: { subject: Subject }) {
  const [status, setStatus] = useState<SectionStatus>("idle");
  const [result, setResult] = useState<StrNarrativeResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  async function run() {
    setStatus("loading");
    setError(null);
    setCopied(false);
    try {
      const res = await fetch("/api/str-narrative", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ subjectName: subject.name, evidence: `entityType:${subject.entityType} riskScore:${subject.riskScore} jurisdiction:${subject.jurisdiction || subject.country}` }),
      });
      const data = (await res.json()) as StrNarrativeResult;
      setResult(data);
      setStatus("done");
    } catch (err) {
      setError(String(err));
      setStatus("error");
    }
  }

  function copy() {
    if (!result?.narrative) return;
    navigator.clipboard.writeText(result.narrative).then(() => { setCopied(true); setTimeout(() => setCopied(false), 2000); }).catch(() => {});
  }

  return (
    <IntelSection title="SAR Narrative Generator" icon="📝" status={status}>
      <div className="space-y-3">
        <div className="text-11 text-ink-3">Auto-draft a FATF R.20-compliant Suspicious Activity Report narrative from subject evidence.</div>
        <RunBtn onClick={run} disabled={status === "loading"} />
        {error && <ErrorBox msg={error} />}
        {result && (
          <div className="space-y-2 mt-2">
            <div className="flex items-center gap-3 text-11 font-mono">
              <span>Words: <span className="text-ink-0">{result.wordCount}</span></span>
              <span>Quality: <span className={`font-semibold ${result.qualityScore >= 70 ? "text-green" : result.qualityScore >= 40 ? "text-amber" : "text-red"}`}>{result.qualityScore}/100</span></span>
            </div>
            {result.missingElements.length > 0 && (
              <div className="text-10 text-amber bg-amber-dim rounded px-2 py-1">Missing: {result.missingElements.join(", ")}</div>
            )}
            <div className="relative">
              <textarea
                readOnly
                className="w-full rounded border border-hair-2 bg-bg-2 px-3 py-2 text-11 text-ink-0 font-mono resize-y min-h-[140px] max-h-64"
                value={result.narrative}
              />
              <button
                onClick={copy}
                className="absolute top-2 right-2 text-10 font-semibold px-2 py-0.5 rounded bg-brand-dim text-brand border border-brand/30 hover:opacity-80"
              >
                {copied ? "✓ Copied" : "Copy"}
              </button>
            </div>
            <div className="text-10 text-ink-3 italic">{result.regulatoryBasis}</div>
          </div>
        )}
      </div>
    </IntelSection>
  );
}

// ─── 42. EDD Questionnaire / Interrogation Script ────────────────────────────

interface EddResult {
  questions?: string[];
  ok?: boolean;
  error?: string;
}

function EddQuestionnaireSection({ subject }: { subject: Subject }) {
  const [status, setStatus] = useState<SectionStatus>("idle");
  const [result, setResult] = useState<EddResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function run() {
    setStatus("loading");
    setError(null);
    try {
      const res = await fetch("/api/edd-questionnaire", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name: subject.name, pepTier: subject.pep?.tier ?? "none", entityType: subject.entityType }),
      });
      const data = (await res.json()) as EddResult;
      setResult(data);
      setStatus("done");
    } catch (err) {
      setError(String(err));
      setStatus("error");
    }
  }

  return (
    <IntelSection title="EDD Questionnaire / Interrogation Script" icon="🎤" status={status}>
      <div className="space-y-3">
        <div className="text-11 text-ink-3">Generate tailored Enhanced Due Diligence interview questions based on subject risk profile.</div>
        <RunBtn onClick={run} disabled={status === "loading"} />
        {error && <ErrorBox msg={error} />}
        {result && (
          <div className="space-y-2 mt-2">
            {result.questions && result.questions.length > 0 ? (
              <ol className="space-y-2">
                {result.questions.map((q, i) => (
                  <li key={i} className="flex gap-2 text-11">
                    <span className="text-brand font-mono font-semibold shrink-0">{i + 1}.</span>
                    <span className="text-ink-1">{q}</span>
                  </li>
                ))}
              </ol>
            ) : (
              <JsonTree data={result} />
            )}
          </div>
        )}
      </div>
    </IntelSection>
  );
}

// ─── 43. MLRO Regulatory Q&A ──────────────────────────────────────────────────

interface MlroAdvisorResult {
  ok: boolean;
  answer?: string;
  error?: string;
}

function MlroAdvisorSection() {
  const [status, setStatus] = useState<SectionStatus>("idle");
  const [result, setResult] = useState<MlroAdvisorResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState<string>("");

  async function run() {
    if (!query.trim()) { setError("Enter a question first"); return; }
    setStatus("loading");
    setError(null);
    try {
      const res = await fetch("/api/mlro-advisor-quick", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ question: query }),
      });
      const data = (await res.json()) as MlroAdvisorResult;
      setResult(data);
      setStatus("done");
    } catch (err) {
      setError(String(err));
      setStatus("error");
    }
  }

  return (
    <IntelSection title="MLRO Regulatory Q&A" icon="🧠" status={status}>
      <div className="space-y-3">
        <div className="text-11 text-ink-3">Ask the MLRO AI advisor any AML/CFT regulatory question — FATF, CBUAE, FCA, FinCEN.</div>
        <textarea
          className="w-full rounded border border-hair-2 bg-bg-panel text-ink-0 px-2 py-1.5 text-11 resize-y min-h-[60px] focus:outline-none focus:border-brand"
          placeholder="e.g. What are the EDD requirements for a Tier 1 PEP under UAE FDL 2025?"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        <RunBtn onClick={run} disabled={status === "loading"} />
        {error && <ErrorBox msg={error} />}
        {result?.answer && (
          <div className="mt-2 bg-bg-2 border border-hair-2 rounded p-3 text-11 text-ink-1 whitespace-pre-wrap leading-relaxed">
            {result.answer}
          </div>
        )}
        {result && !result.answer && <JsonTree data={result} />}
      </div>
    </IntelSection>
  );
}

// ─── 44. OSINT Synthesis Narrative ───────────────────────────────────────────

function OsintSynthesisSection({ subject }: { subject: Subject }) {
  const [status, setStatus] = useState<SectionStatus>("idle");
  const [result, setResult] = useState<unknown>(null);
  const [error, setError] = useState<string | null>(null);

  async function run() {
    setStatus("loading");
    setError(null);
    try {
      const res = await fetch("/api/osint-synthesis", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name: subject.name }),
      });
      const data = (await res.json()) as unknown;
      setResult(data);
      setStatus("done");
    } catch (err) {
      setError(String(err));
      setStatus("error");
    }
  }

  return (
    <IntelSection title="OSINT Synthesis Narrative" icon="🔮" status={status}>
      <div className="space-y-3">
        <div className="text-11 text-ink-3">Synthesize all OSINT intelligence into a coherent narrative profile for the subject.</div>
        <RunBtn onClick={run} disabled={status === "loading"} />
        {error && <ErrorBox msg={error} />}
        {result && <JsonTree data={result} />}
      </div>
    </IntelSection>
  );
}

// ─── 45. Typology / Peer Comparison ──────────────────────────────────────────

interface CompetitorResult {
  ok: boolean;
  competitors?: Array<{ name: string; riskScore: number; riskLevel: string; jurisdiction: string; flags: string[]; similarity: number }>;
  peerGroupAvgRisk?: number;
  peerGroupRiskLevel?: string;
  methodology?: string;
  error?: string;
}

function TypologyMatchSection({ subject }: { subject: Subject }) {
  const [status, setStatus] = useState<SectionStatus>("idle");
  const [result, setResult] = useState<CompetitorResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function run() {
    setStatus("loading");
    setError(null);
    try {
      const res = await fetch("/api/competitor-screen", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ subjectName: subject.name, industry: subject.riskCategory ?? subject.meta ?? "", jurisdiction: subject.jurisdiction || subject.country }),
      });
      const data = (await res.json()) as CompetitorResult;
      setResult(data);
      setStatus("done");
    } catch (err) {
      setError(String(err));
      setStatus("error");
    }
  }

  return (
    <IntelSection title="Typology / Peer Comparison" icon="📊" status={status}>
      <div className="space-y-3">
        <div className="text-11 text-ink-3">Compare subject risk profile to similar peers in the same industry and jurisdiction.</div>
        <RunBtn onClick={run} disabled={status === "loading"} />
        {error && <ErrorBox msg={error} />}
        {result && (
          <div className="space-y-2 mt-2">
            {result.peerGroupAvgRisk !== undefined && (
              <div className="text-11 font-mono">
                Peer avg risk: <span className={`font-semibold ${(result.peerGroupAvgRisk ?? 0) >= 60 ? "text-red" : (result.peerGroupAvgRisk ?? 0) >= 40 ? "text-amber" : "text-green"}`}>{result.peerGroupAvgRisk}</span>
                {result.peerGroupRiskLevel && <span className="ml-2 text-ink-3">({result.peerGroupRiskLevel})</span>}
              </div>
            )}
            {result.competitors && result.competitors.map((c, i) => (
              <div key={i} className="bg-bg-2 border border-hair-2 rounded p-2">
                <div className="flex items-center justify-between">
                  <span className="text-11 font-semibold text-ink-0">{c.name}</span>
                  <span className={`text-11 font-mono font-semibold ${c.riskScore >= 60 ? "text-red" : c.riskScore >= 40 ? "text-amber" : "text-green"}`}>{c.riskScore}</span>
                </div>
                <div className="text-10 text-ink-3">{c.jurisdiction} · {c.similarity}% similar</div>
                {c.flags.length > 0 && (
                  <div className="flex flex-wrap gap-1 mt-1">
                    {c.flags.map((f, fi) => <span key={fi} className="text-10 font-mono bg-amber-dim text-amber border border-amber/30 px-1 py-0.5 rounded">{f}</span>)}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </IntelSection>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// NEW SECTIONS — Group 6 additions (Case Actions)
// ═══════════════════════════════════════════════════════════════════════════════

// ─── 46. Predictive Re-Screen Scheduler ──────────────────────────────────────

function ReScreenSchedulerSection({ subject }: { subject: Subject }) {
  const [status, setStatus] = useState<SectionStatus>("idle");
  const [result, setResult] = useState<unknown>(null);
  const [error, setError] = useState<string | null>(null);

  async function run() {
    setStatus("loading");
    setError(null);
    try {
      const res = await fetch(`/api/screening-history?subjectId=${encodeURIComponent(subject.id)}`);
      const data = (await res.json()) as unknown;
      setResult(data);
      setStatus("done");
    } catch (err) {
      setError(String(err));
      setStatus("error");
    }
  }

  return (
    <IntelSection title="Predictive Re-Screen Scheduler" icon="📆" status={status}>
      <div className="space-y-3">
        <div className="text-11 text-ink-3">Predict optimal re-screening date based on historical screening patterns and risk evolution.</div>
        <RunBtn onClick={run} disabled={status === "loading"} />
        {error && <ErrorBox msg={error} />}
        {result && <JsonTree data={result} />}
      </div>
    </IntelSection>
  );
}

// ─── 47. Four-Eyes Review ────────────────────────────────────────────────────

function FourEyesSection({ subject }: { subject: Subject }) {
  const [status, setStatus] = useState<SectionStatus>("idle");
  const [result, setResult] = useState<unknown>(null);
  const [error, setError] = useState<string | null>(null);

  async function run() {
    setStatus("loading");
    setError(null);
    try {
      const res = await fetch("/api/four-eyes", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ subjectId: subject.id, subjectName: subject.name, riskScore: subject.riskScore }),
      });
      const data = (await res.json()) as unknown;
      setResult(data);
      setStatus("done");
    } catch (err) {
      setError(String(err));
      setStatus("error");
    }
  }

  return (
    <IntelSection title="Four-Eyes Review" icon="👁️" status={status}>
      <div className="space-y-3">
        <div className="text-11 text-ink-3">Submit the current screening for mandatory second-reviewer approval under four-eyes control.</div>
        <RunBtn onClick={run} disabled={status === "loading"} />
        {error && <ErrorBox msg={error} />}
        {result && <JsonTree data={result} />}
      </div>
    </IntelSection>
  );
}

// ─── 48. Whistleblower Tip Submission ────────────────────────────────────────

function WhistleblowerSection({ subject }: { subject: Subject }) {
  const [status, setStatus] = useState<SectionStatus>("idle");
  const [result, setResult] = useState<unknown>(null);
  const [error, setError] = useState<string | null>(null);
  const [tip, setTip] = useState<string>("");

  async function run() {
    if (!tip.trim()) { setError("Enter a tip before submitting"); return; }
    setStatus("loading");
    setError(null);
    try {
      const res = await fetch("/api/whistleblower", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ subjectId: subject.id, subjectName: subject.name, tip }),
      });
      const data = (await res.json()) as unknown;
      setResult(data);
      setStatus("done");
    } catch (err) {
      setError(String(err));
      setStatus("error");
    }
  }

  return (
    <IntelSection title="Whistleblower Tip" icon="📣" status={status}>
      <div className="space-y-3">
        <div className="text-11 text-ink-3">Submit a confidential whistleblower tip linked to this subject. Anonymised and encrypted at rest.</div>
        <textarea
          className="w-full rounded border border-hair-2 bg-bg-panel text-ink-0 px-2 py-1.5 text-11 resize-y min-h-[60px] focus:outline-none focus:border-brand"
          placeholder="Describe the suspicious activity or information..."
          value={tip}
          onChange={(e) => setTip(e.target.value)}
        />
        <RunBtn onClick={run} disabled={status === "loading"} />
        {error && <ErrorBox msg={error} />}
        {result && <JsonTree data={result} />}
      </div>
    </IntelSection>
  );
}

// ─── 49. Inter-Agency Referral ───────────────────────────────────────────────

function InterAgencyReferralSection({ subject }: { subject: Subject }) {
  const [status, setStatus] = useState<SectionStatus>("idle");
  const [result, setResult] = useState<unknown>(null);
  const [error, setError] = useState<string | null>(null);

  async function run() {
    setStatus("loading");
    setError(null);
    try {
      const res = await fetch("/api/inter-agency-referral", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ subjectId: subject.id, subjectName: subject.name, riskScore: subject.riskScore, jurisdiction: subject.jurisdiction || subject.country }),
      });
      const data = (await res.json()) as unknown;
      setResult(data);
      setStatus("done");
    } catch (err) {
      setError(String(err));
      setStatus("error");
    }
  }

  return (
    <IntelSection title="Inter-Agency Referral" icon="🏛️" status={status}>
      <div className="space-y-3">
        <div className="text-11 text-ink-3">Initiate a referral to UAEFIU, CBUAE, police, or customs as appropriate for the risk profile.</div>
        <RunBtn onClick={run} disabled={status === "loading"} />
        {error && <ErrorBox msg={error} />}
        {result && <JsonTree data={result} />}
      </div>
    </IntelSection>
  );
}

// ─── 50. Investigation Expansion ─────────────────────────────────────────────

function InvestigationExpandSection({ subject }: { subject: Subject }) {
  const [status, setStatus] = useState<SectionStatus>("idle");
  const [result, setResult] = useState<unknown>(null);
  const [error, setError] = useState<string | null>(null);

  async function run() {
    setStatus("loading");
    setError(null);
    try {
      const res = await fetch("/api/investigation-expand", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ subjectId: subject.id }),
      });
      const data = (await res.json()) as unknown;
      setResult(data);
      setStatus("done");
    } catch (err) {
      setError(String(err));
      setStatus("error");
    }
  }

  return (
    <IntelSection title="Investigation Expansion" icon="🔭" status={status}>
      <div className="space-y-3">
        <div className="text-11 text-ink-3">Expand the investigation to all linked subjects, associates, and counterparties identified in the network.</div>
        <RunBtn onClick={run} disabled={status === "loading"} />
        {error && <ErrorBox msg={error} />}
        {result && <JsonTree data={result} />}
      </div>
    </IntelSection>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// NEW SECTIONS — Group 7: Corporate Structure
// ═══════════════════════════════════════════════════════════════════════════════

// ─── 51. Director Network ────────────────────────────────────────────────────

interface EntityGraphResult {
  ok: boolean;
  subject?: string;
  registrations?: Array<{ jurisdiction: string; companyNumber: string; status: string }>;
  directors?: Array<{ name: string; role: string; jurisdiction: string }>;
  linkedCompanies?: Array<{ name: string; jurisdiction: string; relationship: string }>;
  totalLinkedCompanies?: number;
  error?: string;
}

function EntityGraphSection({ subject }: { subject: Subject }) {
  const [status, setStatus] = useState<SectionStatus>("idle");
  const [result, setResult] = useState<EntityGraphResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function run() {
    setStatus("loading");
    setError(null);
    try {
      const res = await fetch("/api/entity-graph", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name: subject.name }),
      });
      const data = (await res.json()) as EntityGraphResult;
      setResult(data);
      setStatus("done");
    } catch (err) {
      setError(String(err));
      setStatus("error");
    }
  }

  return (
    <IntelSection title="Director Network" icon="🕸️" status={status}>
      <div className="space-y-3">
        <div className="text-11 text-ink-3">Map director network, all linked companies, and cross-jurisdiction registrations.</div>
        <RunBtn onClick={run} disabled={status === "loading"} />
        {error && <ErrorBox msg={error} />}
        {result && (
          <div className="space-y-2 mt-2">
            {result.totalLinkedCompanies !== undefined && (
              <div className="text-11 font-mono">
                Linked companies: <span className={`font-semibold ${(result.totalLinkedCompanies ?? 0) > 10 ? "text-amber" : "text-ink-0"}`}>{result.totalLinkedCompanies}</span>
              </div>
            )}
            {result.registrations && result.registrations.length > 0 && (
              <div>
                <div className="text-10 uppercase font-semibold text-ink-3 mb-1">Registrations ({result.registrations.length})</div>
                {result.registrations.slice(0, 5).map((r, i) => (
                  <div key={i} className="text-11 font-mono text-ink-2 flex gap-2">
                    <span className="text-ink-0">{r.jurisdiction}</span>
                    <span>{r.companyNumber}</span>
                    <span className={r.status === "active" ? "text-green" : "text-amber"}>{r.status}</span>
                  </div>
                ))}
              </div>
            )}
            {result.directors && result.directors.length > 0 && (
              <div>
                <div className="text-10 uppercase font-semibold text-ink-3 mb-1">Directors ({result.directors.length})</div>
                {result.directors.slice(0, 5).map((d, i) => (
                  <div key={i} className="text-11 text-ink-2">
                    <span className="text-ink-0">{d.name}</span> · {d.role} · <span className="font-mono text-ink-3">{d.jurisdiction}</span>
                  </div>
                ))}
              </div>
            )}
            {(!result.registrations || result.registrations.length === 0) && (!result.directors || result.directors.length === 0) && <JsonTree data={result} />}
          </div>
        )}
      </div>
    </IntelSection>
  );
}

// ─── 52. UBO Ownership Chain ──────────────────────────────────────────────────

function OwnershipSection({ subject }: { subject: Subject }) {
  const [status, setStatus] = useState<SectionStatus>("idle");
  const [result, setResult] = useState<unknown>(null);
  const [error, setError] = useState<string | null>(null);

  async function run() {
    setStatus("loading");
    setError(null);
    try {
      const res = await fetch("/api/ownership", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name: subject.name }),
      });
      const data = (await res.json()) as unknown;
      setResult(data);
      setStatus("done");
    } catch (err) {
      setError(String(err));
      setStatus("error");
    }
  }

  return (
    <IntelSection title="UBO Ownership Chain" icon="🔗" status={status}>
      <div className="space-y-3">
        <div className="text-11 text-ink-3">Trace Ultimate Beneficial Owner chain and identify all ownership tiers above 25%.</div>
        <RunBtn onClick={run} disabled={status === "loading"} />
        {error && <ErrorBox msg={error} />}
        {result && <JsonTree data={result} />}
      </div>
    </IntelSection>
  );
}

// ─── 53. Trust / Foundation Structures ────────────────────────────────────────

function TrustStructuresSection({ subject }: { subject: Subject }) {
  const [status, setStatus] = useState<SectionStatus>("idle");
  const [result, setResult] = useState<unknown>(null);
  const [error, setError] = useState<string | null>(null);

  async function run() {
    setStatus("loading");
    setError(null);
    try {
      const res = await fetch("/api/trust-structures", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name: subject.name }),
      });
      const data = (await res.json()) as unknown;
      setResult(data);
      setStatus("done");
    } catch (err) {
      setError(String(err));
      setStatus("error");
    }
  }

  return (
    <IntelSection title="Trust / Foundation Structures" icon="🏰" status={status}>
      <div className="space-y-3">
        <div className="text-11 text-ink-3">Identify trust, nominee, and foundation arrangements that may obscure beneficial ownership.</div>
        <RunBtn onClick={run} disabled={status === "loading"} />
        {error && <ErrorBox msg={error} />}
        {result && <JsonTree data={result} />}
      </div>
    </IntelSection>
  );
}

// ─── 54. Nominee Director / Shareholder Risk ──────────────────────────────────

function NomineeRiskSection({ subject }: { subject: Subject }) {
  const [status, setStatus] = useState<SectionStatus>("idle");
  const [result, setResult] = useState<unknown>(null);
  const [error, setError] = useState<string | null>(null);

  async function run() {
    setStatus("loading");
    setError(null);
    try {
      const res = await fetch("/api/nominee-risk", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name: subject.name }),
      });
      const data = (await res.json()) as unknown;
      setResult(data);
      setStatus("done");
    } catch (err) {
      setError(String(err));
      setStatus("error");
    }
  }

  return (
    <IntelSection title="Nominee Director / Shareholder Risk" icon="🎭" status={status}>
      <div className="space-y-3">
        <div className="text-11 text-ink-3">Score risk of nominee arrangements concealing true controllers and beneficial owners.</div>
        <RunBtn onClick={run} disabled={status === "loading"} />
        {error && <ErrorBox msg={error} />}
        {result && <JsonTree data={result} />}
      </div>
    </IntelSection>
  );
}

// ─── 55. EOCN / Regulatory Licence Check ─────────────────────────────────────

function EocnListSection() {
  const [status, setStatus] = useState<SectionStatus>("idle");
  const [result, setResult] = useState<unknown>(null);
  const [error, setError] = useState<string | null>(null);

  async function run() {
    setStatus("loading");
    setError(null);
    try {
      const res = await fetch("/api/eocn-list-updates");
      const data = (await res.json()) as unknown;
      setResult(data);
      setStatus("done");
    } catch (err) {
      setError(String(err));
      setStatus("error");
    }
  }

  return (
    <IntelSection title="EOCN / Regulatory Licence Check" icon="📋" status={status}>
      <div className="space-y-3">
        <div className="text-11 text-ink-3">Check EOCN registration, regulatory licences, and Designated Non-Financial Business status.</div>
        <RunBtn onClick={run} disabled={status === "loading"} />
        {error && <ErrorBox msg={error} />}
        {result && <JsonTree data={result} />}
      </div>
    </IntelSection>
  );
}

// ─── 56. Corruption / Bribery Risk ────────────────────────────────────────────

function CorruptionRiskSection({ subject }: { subject: Subject }) {
  const [status, setStatus] = useState<SectionStatus>("idle");
  const [result, setResult] = useState<unknown>(null);
  const [error, setError] = useState<string | null>(null);

  async function run() {
    setStatus("loading");
    setError(null);
    try {
      const res = await fetch("/api/corruption-risk", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name: subject.name, jurisdiction: subject.jurisdiction || subject.country }),
      });
      const data = (await res.json()) as unknown;
      setResult(data);
      setStatus("done");
    } catch (err) {
      setError(String(err));
      setStatus("error");
    }
  }

  return (
    <IntelSection title="Corruption / Bribery Risk" icon="💰" status={status}>
      <div className="space-y-3">
        <div className="text-11 text-ink-3">Assess corruption and bribery risk using CPI scores, sector exposure, and political connections.</div>
        <RunBtn onClick={run} disabled={status === "loading"} />
        {error && <ErrorBox msg={error} />}
        {result && <JsonTree data={result} />}
      </div>
    </IntelSection>
  );
}

// ─── 57. High Net Worth Indicators ────────────────────────────────────────────

function HighNetWorthSection({ subject }: { subject: Subject }) {
  const [status, setStatus] = useState<SectionStatus>("idle");
  const [result, setResult] = useState<unknown>(null);
  const [error, setError] = useState<string | null>(null);

  async function run() {
    setStatus("loading");
    setError(null);
    try {
      const res = await fetch("/api/high-net-worth", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name: subject.name }),
      });
      const data = (await res.json()) as unknown;
      setResult(data);
      setStatus("done");
    } catch (err) {
      setError(String(err));
      setStatus("error");
    }
  }

  return (
    <IntelSection title="High Net Worth Indicators" icon="💎" status={status}>
      <div className="space-y-3">
        <div className="text-11 text-ink-3">Identify HNW wealth indicators, unexplained wealth flags, and source of wealth signals.</div>
        <RunBtn onClick={run} disabled={status === "loading"} />
        {error && <ErrorBox msg={error} />}
        {result && <JsonTree data={result} />}
      </div>
    </IntelSection>
  );
}

// ─── 58. Source of Wealth Calculator ─────────────────────────────────────────

function SowCalculatorSection({ subject }: { subject: Subject }) {
  const [status, setStatus] = useState<SectionStatus>("idle");
  const [result, setResult] = useState<unknown>(null);
  const [error, setError] = useState<string | null>(null);

  async function run() {
    setStatus("loading");
    setError(null);
    try {
      const res = await fetch("/api/sow-calculator", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name: subject.name }),
      });
      const data = (await res.json()) as unknown;
      setResult(data);
      setStatus("done");
    } catch (err) {
      setError(String(err));
      setStatus("error");
    }
  }

  return (
    <IntelSection title="Source of Wealth Calculator" icon="📐" status={status}>
      <div className="space-y-3">
        <div className="text-11 text-ink-3">Calculate plausible source of wealth based on known career history, business activities, and disclosed assets.</div>
        <RunBtn onClick={run} disabled={status === "loading"} />
        {error && <ErrorBox msg={error} />}
        {result && <JsonTree data={result} />}
      </div>
    </IntelSection>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// NEW SECTIONS — Group 8: Financial Crime Patterns (extended)
// ═══════════════════════════════════════════════════════════════════════════════

// ─── 59. Asset Tracer ────────────────────────────────────────────────────────

interface AssetTracerResult {
  ok: boolean;
  jurisdictions?: Array<{ country: string; assetTypes: string[]; estimatedValue: string; registrySource: string }>;
  totalJurisdictions?: number;
  totalEstimatedValue?: string;
  error?: string;
}

function AssetTracerSection({ subject }: { subject: Subject }) {
  const [status, setStatus] = useState<SectionStatus>("idle");
  const [result, setResult] = useState<AssetTracerResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function run() {
    setStatus("loading");
    setError(null);
    try {
      const res = await fetch("/api/asset-tracer", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name: subject.name }),
      });
      const data = (await res.json()) as AssetTracerResult;
      setResult(data);
      setStatus("done");
    } catch (err) {
      setError(String(err));
      setStatus("error");
    }
  }

  return (
    <IntelSection title="Asset Tracer" icon="🗺️" status={status}>
      <div className="space-y-3">
        <div className="text-11 text-ink-3">Trace assets across jurisdictions: real estate, vehicles, bank accounts, beneficial interests.</div>
        <RunBtn onClick={run} disabled={status === "loading"} />
        {error && <ErrorBox msg={error} />}
        {result && (
          <div className="space-y-2 mt-2">
            {result.totalJurisdictions !== undefined && (
              <div className="flex gap-4 text-11 font-mono">
                <span>Jurisdictions: <span className="text-ink-0 font-semibold">{result.totalJurisdictions}</span></span>
                {result.totalEstimatedValue && <span>Est. value: <span className="text-ink-0 font-semibold">{result.totalEstimatedValue}</span></span>}
              </div>
            )}
            {result.jurisdictions && result.jurisdictions.map((j, i) => (
              <div key={i} className="bg-bg-2 border border-hair-2 rounded p-2">
                <div className="flex items-center justify-between">
                  <span className="text-11 font-semibold text-ink-0">{j.country}</span>
                  <span className="text-11 font-mono text-amber">{j.estimatedValue}</span>
                </div>
                <div className="text-10 text-ink-3">Assets: {j.assetTypes.join(", ")}</div>
                <div className="text-10 font-mono text-ink-3">{j.registrySource}</div>
              </div>
            ))}
            {(!result.jurisdictions || result.jurisdictions.length === 0) && <JsonTree data={result} />}
          </div>
        )}
      </div>
    </IntelSection>
  );
}

// ─── 60. Freeze / Seizure Order Workflow ─────────────────────────────────────

function FreezeSeizureSection({ subject }: { subject: Subject }) {
  const [status, setStatus] = useState<SectionStatus>("idle");
  const [result, setResult] = useState<unknown>(null);
  const [error, setError] = useState<string | null>(null);

  async function run() {
    setStatus("loading");
    setError(null);
    try {
      const res = await fetch("/api/freeze-seizure", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name: subject.name, subjectId: subject.id }),
      });
      const data = (await res.json()) as unknown;
      setResult(data);
      setStatus("done");
    } catch (err) {
      setError(String(err));
      setStatus("error");
    }
  }

  return (
    <IntelSection title="Freeze / Seizure Order" icon="🔒" status={status}>
      <div className="space-y-3">
        <div className="text-11 text-ink-3">Initiate asset freeze or seizure order workflow with CBUAE / UAEFIU / judicial authority.</div>
        <RunBtn onClick={run} disabled={status === "loading"} />
        {error && <ErrorBox msg={error} />}
        {result && <JsonTree data={result} />}
      </div>
    </IntelSection>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// NEW SECTIONS — Group 9: Extended AI Analysis
// ═══════════════════════════════════════════════════════════════════════════════

// ─── 61. Evidence Pack Report ────────────────────────────────────────────────

function EvidencePackSection({ subject }: { subject: Subject }) {
  const [status, setStatus] = useState<SectionStatus>("idle");
  const [result, setResult] = useState<unknown>(null);
  const [error, setError] = useState<string | null>(null);

  async function run() {
    setStatus("loading");
    setError(null);
    try {
      const res = await fetch("/api/evidence-pack-report", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ subjectId: subject.id }),
      });
      const data = (await res.json()) as unknown;
      setResult(data);
      setStatus("done");
    } catch (err) {
      setError(String(err));
      setStatus("error");
    }
  }

  return (
    <IntelSection title="Evidence Pack Report" icon="📦" status={status}>
      <div className="space-y-3">
        <div className="text-11 text-ink-3">Generate a court-ready expert witness evidence pack compiling all intelligence findings.</div>
        <RunBtn onClick={run} disabled={status === "loading"} />
        {error && <ErrorBox msg={error} />}
        {result && <JsonTree data={result} />}
      </div>
    </IntelSection>
  );
}

// ─── 62. Legal Privilege Checker ─────────────────────────────────────────────

function LegalPrivilegeSection({ subject }: { subject: Subject }) {
  const [status, setStatus] = useState<SectionStatus>("idle");
  const [result, setResult] = useState<unknown>(null);
  const [error, setError] = useState<string | null>(null);

  async function run() {
    setStatus("loading");
    setError(null);
    try {
      const res = await fetch("/api/legal-privilege", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ subjectId: subject.id }),
      });
      const data = (await res.json()) as unknown;
      setResult(data);
      setStatus("done");
    } catch (err) {
      setError(String(err));
      setStatus("error");
    }
  }

  return (
    <IntelSection title="Legal Privilege Checker" icon="⚖️" status={status}>
      <div className="space-y-3">
        <div className="text-11 text-ink-3">Assert or check legal professional privilege over documents and communications in the case.</div>
        <RunBtn onClick={run} disabled={status === "loading"} />
        {error && <ErrorBox msg={error} />}
        {result && <JsonTree data={result} />}
      </div>
    </IntelSection>
  );
}

// ─── 63. Domain Intelligence ─────────────────────────────────────────────────

function DomainIntelSection({ subject }: { subject: Subject }) {
  const [status, setStatus] = useState<SectionStatus>("idle");
  const [result, setResult] = useState<unknown>(null);
  const [error, setError] = useState<string | null>(null);
  const [domain, setDomain] = useState<string>("");

  async function run() {
    setStatus("loading");
    setError(null);
    try {
      const res = await fetch("/api/domain-intel", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ domain: domain.trim() || subject.name }),
      });
      const data = (await res.json()) as unknown;
      setResult(data);
      setStatus("done");
    } catch (err) {
      setError(String(err));
      setStatus("error");
    }
  }

  return (
    <IntelSection title="Domain Intelligence" icon="🌐" status={status}>
      <div className="space-y-3">
        <div className="text-11 text-ink-3">Email domain reputation, MX records, WHOIS age, registrar analysis, and fraud scoring.</div>
        <input
          type="text"
          className="w-full px-2 py-1.5 border border-hair-2 rounded text-11 bg-bg-panel text-ink-0 font-mono focus:outline-none focus:border-brand"
          placeholder="e.g. example.com"
          value={domain}
          onChange={(e) => setDomain(e.target.value)}
        />
        <RunBtn onClick={run} disabled={status === "loading"} />
        {error && <ErrorBox msg={error} />}
        {result && <JsonTree data={result} />}
      </div>
    </IntelSection>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// NEW SECTIONS — Group 10: Operations & Actions
// ═══════════════════════════════════════════════════════════════════════════════

// ─── 64. Insider Threat Screen ────────────────────────────────────────────────

function InsiderThreatSection({ subject }: { subject: Subject }) {
  const [status, setStatus] = useState<SectionStatus>("idle");
  const [result, setResult] = useState<unknown>(null);
  const [error, setError] = useState<string | null>(null);

  async function run() {
    setStatus("loading");
    setError(null);
    try {
      const res = await fetch("/api/insider-threat-screen", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name: subject.name }),
      });
      const data = (await res.json()) as unknown;
      setResult(data);
      setStatus("done");
    } catch (err) {
      setError(String(err));
      setStatus("error");
    }
  }

  return (
    <IntelSection title="Insider Threat Screen" icon="🔍" status={status}>
      <div className="space-y-3">
        <div className="text-11 text-ink-3">Screen for insider threat indicators: unusual access patterns, financial stress, behavioural anomalies.</div>
        <RunBtn onClick={run} disabled={status === "loading"} />
        {error && <ErrorBox msg={error} />}
        {result && <JsonTree data={result} />}
      </div>
    </IntelSection>
  );
}

// ─── 65. Human Trafficking Risk ──────────────────────────────────────────────

function HumanTraffickingSection({ subject }: { subject: Subject }) {
  const [status, setStatus] = useState<SectionStatus>("idle");
  const [result, setResult] = useState<unknown>(null);
  const [error, setError] = useState<string | null>(null);

  async function run() {
    setStatus("loading");
    setError(null);
    try {
      const res = await fetch("/api/human-trafficking", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name: subject.name }),
      });
      const data = (await res.json()) as unknown;
      setResult(data);
      setStatus("done");
    } catch (err) {
      setError(String(err));
      setStatus("error");
    }
  }

  return (
    <IntelSection title="Human Trafficking Risk Indicators" icon="🚨" status={status}>
      <div className="space-y-3">
        <div className="text-11 text-ink-3">Identify human trafficking risk indicators: recruitment patterns, exploitation venues, financial flows.</div>
        <RunBtn onClick={run} disabled={status === "loading"} />
        {error && <ErrorBox msg={error} />}
        {result && <JsonTree data={result} />}
      </div>
    </IntelSection>
  );
}

// ─── GROUP 11: Behavioral & Psychological Intelligence ───────────────────────

function BehavioralBaselineSection({ subject }: { subject: Subject }) {
  const [status, setStatus] = useState<SectionStatus>("idle");
  const [result, setResult] = useState<unknown>(null);
  const [error, setError] = useState("");
  async function run() {
    setStatus("loading"); setError("");
    try {
      const res = await fetch("/api/behavioral-baseline", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ name: subject.name, entityType: subject.entityType, jurisdiction: subject.jurisdiction, industry: subject.riskCategory }) });
      const data = (await res.json()) as unknown;
      setResult(data); setStatus("done");
    } catch (e) { setError(String(e)); setStatus("error"); }
  }
  return (
    <IntelSection title="Behavioral Anomaly Baseline" icon="🧠" status={status}>
      <div className="space-y-3">
        <div className="text-11 text-ink-3">Establish a behavioral baseline for the subject type and flag deviations — transaction timing, counterparty diversity, channel mix, geographic spread vs. declared profile.</div>
        <RunBtn onClick={run} disabled={status === "loading"} />
        {error && <ErrorBox msg={error} />}
        {result && <JsonTree data={result} />}
      </div>
    </IntelSection>
  );
}

function LinguisticRiskSection({ subject }: { subject: Subject }) {
  const [status, setStatus] = useState<SectionStatus>("idle");
  const [result, setResult] = useState<unknown>(null);
  const [error, setError] = useState("");
  async function run() {
    setStatus("loading"); setError("");
    try {
      const res = await fetch("/api/linguistic-risk", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ name: subject.name, narrative: subject.notes ?? subject.name }) });
      const data = (await res.json()) as unknown;
      setResult(data); setStatus("done");
    } catch (e) { setError(String(e)); setStatus("error"); }
  }
  return (
    <IntelSection title="Linguistic Deception Markers" icon="🗣️" status={status}>
      <div className="space-y-3">
        <div className="text-11 text-ink-3">Analyse written statements, narrative text, and KYC documentation for linguistic deception markers: vagueness, hedging, temporal inconsistency, SCAN indicators.</div>
        <RunBtn onClick={run} disabled={status === "loading"} />
        {error && <ErrorBox msg={error} />}
        {result && <JsonTree data={result} />}
      </div>
    </IntelSection>
  );
}

function LifestyleWealthGapSection({ subject }: { subject: Subject }) {
  const [status, setStatus] = useState<SectionStatus>("idle");
  const [result, setResult] = useState<unknown>(null);
  const [error, setError] = useState("");
  async function run() {
    setStatus("loading"); setError("");
    try {
      const res = await fetch("/api/lifestyle-wealth-gap", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ name: subject.name, entityType: subject.entityType, jurisdiction: subject.jurisdiction }) });
      const data = (await res.json()) as unknown;
      setResult(data); setStatus("done");
    } catch (e) { setError(String(e)); setStatus("error"); }
  }
  return (
    <IntelSection title="Lifestyle / Wealth Gap Analysis" icon="💸" status={status}>
      <div className="space-y-3">
        <div className="text-11 text-ink-3">Compare declared income and source of wealth against observable lifestyle indicators (property, vehicles, travel, social media) to surface unexplained wealth gaps.</div>
        <RunBtn onClick={run} disabled={status === "loading"} />
        {error && <ErrorBox msg={error} />}
        {result && <JsonTree data={result} />}
      </div>
    </IntelSection>
  );
}

function PlausibilityScoreSection({ subject }: { subject: Subject }) {
  const [status, setStatus] = useState<SectionStatus>("idle");
  const [result, setResult] = useState<unknown>(null);
  const [error, setError] = useState("");
  async function run() {
    setStatus("loading"); setError("");
    try {
      const res = await fetch("/api/plausibility-score", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ name: subject.name, entityType: subject.entityType, jurisdiction: subject.jurisdiction, industry: subject.riskCategory, notes: subject.notes }) });
      const data = (await res.json()) as unknown;
      setResult(data); setStatus("done");
    } catch (e) { setError(String(e)); setStatus("error"); }
  }
  return (
    <IntelSection title="Plausibility Score Engine" icon="🎯" status={status}>
      <div className="space-y-3">
        <div className="text-11 text-ink-3">10-dimension common-sense plausibility scoring: Does the business model make sense? Are stated relationships credible? Does the risk profile fit the declared activity?</div>
        <RunBtn onClick={run} disabled={status === "loading"} />
        {error && <ErrorBox msg={error} />}
        {result && <JsonTree data={result} />}
      </div>
    </IntelSection>
  );
}

function AssociationTimelineSection({ subject }: { subject: Subject }) {
  const [status, setStatus] = useState<SectionStatus>("idle");
  const [result, setResult] = useState<unknown>(null);
  const [error, setError] = useState("");
  async function run() {
    setStatus("loading"); setError("");
    try {
      const res = await fetch("/api/association-timeline", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ subjectName: subject.name, associates: [] }) });
      const data = (await res.json()) as unknown;
      setResult(data); setStatus("done");
    } catch (e) { setError(String(e)); setStatus("error"); }
  }
  return (
    <IntelSection title="Association Timeline" icon="📅" status={status}>
      <div className="space-y-3">
        <div className="text-11 text-ink-3">Date-sorted timeline of significant events involving the subject and their associates, highlighting proximity to sanctions designations, enforcement actions, and typology events.</div>
        <RunBtn onClick={run} disabled={status === "loading"} />
        {error && <ErrorBox msg={error} />}
        {result && <JsonTree data={result} />}
      </div>
    </IntelSection>
  );
}

function ConfidenceDecaySection({ subject }: { subject: Subject }) {
  const [status, setStatus] = useState<SectionStatus>("idle");
  const [result, setResult] = useState<unknown>(null);
  const [error, setError] = useState("");
  async function run() {
    setStatus("loading"); setError("");
    try {
      const res = await fetch("/api/confidence-decay", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ subjectName: subject.name, initialConfidence: 85, daysSinceLastReview: 180 }) });
      const data = (await res.json()) as unknown;
      setResult(data); setStatus("done");
    } catch (e) { setError(String(e)); setStatus("error"); }
  }
  return (
    <IntelSection title="Confidence Decay Calculator" icon="📉" status={status}>
      <div className="space-y-3">
        <div className="text-11 text-ink-3">Model how confidence in the current risk assessment degrades over time as KYC data ages. Outputs decay curve, current confidence level, and recommended re-review date.</div>
        <RunBtn onClick={run} disabled={status === "loading"} />
        {error && <ErrorBox msg={error} />}
        {result && <JsonTree data={result} />}
      </div>
    </IntelSection>
  );
}

function ExaminerSimSection({ subject }: { subject: Subject }) {
  const [status, setStatus] = useState<SectionStatus>("idle");
  const [result, setResult] = useState<unknown>(null);
  const [error, setError] = useState("");
  async function run() {
    setStatus("loading"); setError("");
    try {
      const res = await fetch("/api/examiner-sim", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ subjectName: subject.name, entityType: subject.entityType, jurisdiction: subject.jurisdiction }) });
      const data = (await res.json()) as unknown;
      setResult(data); setStatus("done");
    } catch (e) { setError(String(e)); setStatus("error"); }
  }
  return (
    <IntelSection title="Examiner Simulation" icon="🔬" status={status}>
      <div className="space-y-3">
        <div className="text-11 text-ink-3">Simulate how a CBUAE / DFSA / FATF examiner would scrutinise this case: what questions they would ask, what evidence gaps they would flag, what findings they would record.</div>
        <RunBtn onClick={run} disabled={status === "loading"} />
        {error && <ErrorBox msg={error} />}
        {result && <JsonTree data={result} />}
      </div>
    </IntelSection>
  );
}

function BenfordSection({ subject }: { subject: Subject }) {
  const [status, setStatus] = useState<SectionStatus>("idle");
  const [result, setResult] = useState<unknown>(null);
  const [error, setError] = useState("");
  async function run() {
    setStatus("loading"); setError("");
    try {
      const res = await fetch("/api/benford", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ name: subject.name }) });
      const data = (await res.json()) as unknown;
      setResult(data); setStatus("done");
    } catch (e) { setError(String(e)); setStatus("error"); }
  }
  return (
    <IntelSection title="Benford's Law Analysis" icon="📊" status={status}>
      <div className="space-y-3">
        <div className="text-11 text-ink-3">Apply Benford's Law to transaction amounts to detect structured / artificial round-number patterns that deviate significantly from natural first-digit distribution.</div>
        <RunBtn onClick={run} disabled={status === "loading"} />
        {error && <ErrorBox msg={error} />}
        {result && <JsonTree data={result} />}
      </div>
    </IntelSection>
  );
}

// ─── GROUP 12: Legal & Regulatory Deep Intelligence ───────────────────────────

function LitigationScanSection({ subject }: { subject: Subject }) {
  const [status, setStatus] = useState<SectionStatus>("idle");
  const [result, setResult] = useState<unknown>(null);
  const [error, setError] = useState("");
  async function run() {
    setStatus("loading"); setError("");
    try {
      const res = await fetch("/api/litigation-scan", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ name: subject.name, jurisdiction: subject.jurisdiction }) });
      const data = (await res.json()) as unknown;
      setResult(data); setStatus("done");
    } catch (e) { setError(String(e)); setStatus("error"); }
  }
  return (
    <IntelSection title="Litigation Scan" icon="⚖️" status={status}>
      <div className="space-y-3">
        <div className="text-11 text-ink-3">Scan for civil and criminal proceedings, court judgments, arbitration awards, insolvency filings, and enforcement actions across primary jurisdictions.</div>
        <RunBtn onClick={run} disabled={status === "loading"} />
        {error && <ErrorBox msg={error} />}
        {result && <JsonTree data={result} />}
      </div>
    </IntelSection>
  );
}

function EnforcementActionsSection({ subject }: { subject: Subject }) {
  const [status, setStatus] = useState<SectionStatus>("idle");
  const [result, setResult] = useState<unknown>(null);
  const [error, setError] = useState("");
  async function run() {
    setStatus("loading"); setError("");
    try {
      const res = await fetch("/api/enforcement-actions", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ name: subject.name, jurisdiction: subject.jurisdiction }) });
      const data = (await res.json()) as unknown;
      setResult(data); setStatus("done");
    } catch (e) { setError(String(e)); setStatus("error"); }
  }
  return (
    <IntelSection title="Enforcement Actions History" icon="🚨" status={status}>
      <div className="space-y-3">
        <div className="text-11 text-ink-3">Retrieve FCA, SEC, CBUAE, DFSA, FinCEN, and other regulatory enforcement actions, fines, prohibition orders, and deferred prosecution agreements.</div>
        <RunBtn onClick={run} disabled={status === "loading"} />
        {error && <ErrorBox msg={error} />}
        {result && <JsonTree data={result} />}
      </div>
    </IntelSection>
  );
}

function TaxAuthoritySection({ subject }: { subject: Subject }) {
  const [status, setStatus] = useState<SectionStatus>("idle");
  const [result, setResult] = useState<unknown>(null);
  const [error, setError] = useState("");
  async function run() {
    setStatus("loading"); setError("");
    try {
      const res = await fetch("/api/tax-authority", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ name: subject.name, jurisdiction: subject.jurisdiction, entityType: subject.entityType }) });
      const data = (await res.json()) as unknown;
      setResult(data); setStatus("done");
    } catch (e) { setError(String(e)); setStatus("error"); }
  }
  return (
    <IntelSection title="Tax Authority Flags" icon="🏦" status={status}>
      <div className="space-y-3">
        <div className="text-11 text-ink-3">Check CRS/FATCA reportable account flags, tax haven usage, TIN inconsistencies, offshore disclosure scheme participation, and treaty abuse patterns.</div>
        <RunBtn onClick={run} disabled={status === "loading"} />
        {error && <ErrorBox msg={error} />}
        {result && <JsonTree data={result} />}
      </div>
    </IntelSection>
  );
}

function ExtraditionMapSection({ subject }: { subject: Subject }) {
  const [status, setStatus] = useState<SectionStatus>("idle");
  const [result, setResult] = useState<unknown>(null);
  const [error, setError] = useState("");
  async function run() {
    setStatus("loading"); setError("");
    try {
      const res = await fetch("/api/extradition-map", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ subjectCountry: subject.country ?? subject.jurisdiction, targetCountry: "AE" }) });
      const data = (await res.json()) as unknown;
      setResult(data); setStatus("done");
    } catch (e) { setError(String(e)); setStatus("error"); }
  }
  return (
    <IntelSection title="Extradition Treaty Map" icon="🗺️" status={status}>
      <div className="space-y-3">
        <div className="text-11 text-ink-3">Map extradition treaty status between subject's jurisdiction and UAE / key partner states. Flag no-treaty or non-cooperative jurisdictions used as safe havens.</div>
        <RunBtn onClick={run} disabled={status === "loading"} />
        {error && <ErrorBox msg={error} />}
        {result && <JsonTree data={result} />}
      </div>
    </IntelSection>
  );
}

function StatuteLimitationsSection({ subject }: { subject: Subject }) {
  const [status, setStatus] = useState<SectionStatus>("idle");
  const [result, setResult] = useState<unknown>(null);
  const [error, setError] = useState("");
  async function run() {
    setStatus("loading"); setError("");
    try {
      const res = await fetch("/api/statute-limitations", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ jurisdiction: subject.jurisdiction, offenceType: "money_laundering" }) });
      const data = (await res.json()) as unknown;
      setResult(data); setStatus("done");
    } catch (e) { setError(String(e)); setStatus("error"); }
  }
  return (
    <IntelSection title="Statute of Limitations" icon="⏱️" status={status}>
      <div className="space-y-3">
        <div className="text-11 text-ink-3">Calculate applicable limitation periods for AML/CFT offences across relevant jurisdictions. Flag near-expiry situations that create urgency for filing or asset freezing.</div>
        <RunBtn onClick={run} disabled={status === "loading"} />
        {error && <ErrorBox msg={error} />}
        {result && <JsonTree data={result} />}
      </div>
    </IntelSection>
  );
}

function RegArbitrageSection({ subject }: { subject: Subject }) {
  const [status, setStatus] = useState<SectionStatus>("idle");
  const [result, setResult] = useState<unknown>(null);
  const [error, setError] = useState("");
  async function run() {
    setStatus("loading"); setError("");
    try {
      const res = await fetch("/api/reg-arbitrage", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ entityType: subject.entityType, jurisdictions: [subject.jurisdiction].filter(Boolean) }) });
      const data = (await res.json()) as unknown;
      setResult(data); setStatus("done");
    } catch (e) { setError(String(e)); setStatus("error"); }
  }
  return (
    <IntelSection title="Regulatory Arbitrage Detection" icon="⚡" status={status}>
      <div className="space-y-3">
        <div className="text-11 text-ink-3">Identify regulatory arbitrage patterns: deliberate jurisdiction selection to exploit lighter AML/CFT regimes, licensing gaps, or supervisory blind spots.</div>
        <RunBtn onClick={run} disabled={status === "loading"} />
        {error && <ErrorBox msg={error} />}
        {result && <JsonTree data={result} />}
      </div>
    </IntelSection>
  );
}

function AuditReadinessSection({ subject }: { subject: Subject }) {
  const [status, setStatus] = useState<SectionStatus>("idle");
  const [result, setResult] = useState<unknown>(null);
  const [error, setError] = useState("");
  async function run() {
    setStatus("loading"); setError("");
    try {
      const res = await fetch("/api/audit-readiness", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ subjectName: subject.name, entityType: subject.entityType }) });
      const data = (await res.json()) as unknown;
      setResult(data); setStatus("done");
    } catch (e) { setError(String(e)); setStatus("error"); }
  }
  return (
    <IntelSection title="Audit Readiness Score" icon="📋" status={status}>
      <div className="space-y-3">
        <div className="text-11 text-ink-3">Score how audit-ready this case file is (0-100). Checks documentation completeness, evidence quality, rationale clarity, and CBUAE / DFSA examination expectations.</div>
        <RunBtn onClick={run} disabled={status === "loading"} />
        {error && <ErrorBox msg={error} />}
        {result && <JsonTree data={result} />}
      </div>
    </IntelSection>
  );
}

function AmlProgrammeGapSection() {
  const [status, setStatus] = useState<SectionStatus>("idle");
  const [result, setResult] = useState<unknown>(null);
  const [error, setError] = useState("");
  async function run() {
    setStatus("loading"); setError("");
    try {
      const res = await fetch("/api/aml-programme-gap", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({}) });
      const data = (await res.json()) as unknown;
      setResult(data); setStatus("done");
    } catch (e) { setError(String(e)); setStatus("error"); }
  }
  return (
    <IntelSection title="AML Programme Gap Analysis" icon="🔎" status={status}>
      <div className="space-y-3">
        <div className="text-11 text-ink-3">Identify gaps in the AML/CFT programme against FATF Recommendations, CBUAE standards, and DNFBP obligations. Prioritised remediation roadmap.</div>
        <RunBtn onClick={run} disabled={status === "loading"} />
        {error && <ErrorBox msg={error} />}
        {result && <JsonTree data={result} />}
      </div>
    </IntelSection>
  );
}

// ─── GROUP 13: Sector-Specific Intelligence ───────────────────────────────────

function ArtMarketSection({ subject }: { subject: Subject }) {
  const [status, setStatus] = useState<SectionStatus>("idle");
  const [result, setResult] = useState<unknown>(null);
  const [error, setError] = useState("");
  async function run() {
    setStatus("loading"); setError("");
    try {
      const res = await fetch("/api/art-market", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ name: subject.name, entityType: subject.entityType }) });
      const data = (await res.json()) as unknown;
      setResult(data); setStatus("done");
    } catch (e) { setError(String(e)); setStatus("error"); }
  }
  return (
    <IntelSection title="Art Market Risk" icon="🎨" status={status}>
      <div className="space-y-3">
        <div className="text-11 text-ink-3">Assess art market AML risk: provenance opacity, valuation anomalies, anonymous buyer patterns, free-port storage, and known high-value art laundering typologies.</div>
        <RunBtn onClick={run} disabled={status === "loading"} />
        {error && <ErrorBox msg={error} />}
        {result && <JsonTree data={result} />}
      </div>
    </IntelSection>
  );
}

function LuxuryGoodsSection({ subject }: { subject: Subject }) {
  const [status, setStatus] = useState<SectionStatus>("idle");
  const [result, setResult] = useState<unknown>(null);
  const [error, setError] = useState("");
  async function run() {
    setStatus("loading"); setError("");
    try {
      const res = await fetch("/api/luxury-goods", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ name: subject.name, entityType: subject.entityType }) });
      const data = (await res.json()) as unknown;
      setResult(data); setStatus("done");
    } catch (e) { setError(String(e)); setStatus("error"); }
  }
  return (
    <IntelSection title="Luxury Goods Risk" icon="💎" status={status}>
      <div className="space-y-3">
        <div className="text-11 text-ink-3">Detect luxury goods value transfer risk: high-value watches, jewellery, handbags, and Dubai re-export patterns used as portable stores of illicit wealth.</div>
        <RunBtn onClick={run} disabled={status === "loading"} />
        {error && <ErrorBox msg={error} />}
        {result && <JsonTree data={result} />}
      </div>
    </IntelSection>
  );
}

function AviationIntelSection({ subject }: { subject: Subject }) {
  const [status, setStatus] = useState<SectionStatus>("idle");
  const [result, setResult] = useState<unknown>(null);
  const [error, setError] = useState("");
  async function run() {
    setStatus("loading"); setError("");
    try {
      const res = await fetch("/api/aviation-intel", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ name: subject.name, entityType: subject.entityType }) });
      const data = (await res.json()) as unknown;
      setResult(data); setStatus("done");
    } catch (e) { setError(String(e)); setStatus("error"); }
  }
  return (
    <IntelSection title="Aviation & Aircraft Intel" icon="✈️" status={status}>
      <div className="space-y-3">
        <div className="text-11 text-ink-3">Aircraft ownership registration, sanctioned airport routing patterns, private jet financing structures, and charter company beneficial ownership analysis.</div>
        <RunBtn onClick={run} disabled={status === "loading"} />
        {error && <ErrorBox msg={error} />}
        {result && <JsonTree data={result} />}
      </div>
    </IntelSection>
  );
}

function FreeZoneRiskSection({ subject }: { subject: Subject }) {
  const [status, setStatus] = useState<SectionStatus>("idle");
  const [result, setResult] = useState<unknown>(null);
  const [error, setError] = useState("");
  async function run() {
    setStatus("loading"); setError("");
    try {
      const res = await fetch("/api/free-zone-risk", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ name: subject.name, freeZone: subject.jurisdiction }) });
      const data = (await res.json()) as unknown;
      setResult(data); setStatus("done");
    } catch (e) { setError(String(e)); setStatus("error"); }
  }
  return (
    <IntelSection title="UAE Free Zone Risk" icon="🏭" status={status}>
      <div className="space-y-3">
        <div className="text-11 text-ink-3">UAE free zone risk profiling: JAFZA, DMCC, RAKEZ, UAQ, SAIF Zone, IFZA risk ratings, supervisory oversight quality, and known typologies per zone.</div>
        <RunBtn onClick={run} disabled={status === "loading"} />
        {error && <ErrorBox msg={error} />}
        {result && <JsonTree data={result} />}
      </div>
    </IntelSection>
  );
}

function GamingRiskSection({ subject }: { subject: Subject }) {
  const [status, setStatus] = useState<SectionStatus>("idle");
  const [result, setResult] = useState<unknown>(null);
  const [error, setError] = useState("");
  async function run() {
    setStatus("loading"); setError("");
    try {
      const res = await fetch("/api/gaming-risk", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ name: subject.name, entityType: subject.entityType, jurisdiction: subject.jurisdiction }) });
      const data = (await res.json()) as unknown;
      setResult(data); setStatus("done");
    } catch (e) { setError(String(e)); setStatus("error"); }
  }
  return (
    <IntelSection title="Gaming / Gambling Risk" icon="🎰" status={status}>
      <div className="space-y-3">
        <div className="text-11 text-ink-3">Assess gaming and gambling sector risk: chip dumping, smurfing via online platforms, unlicensed operators, and match-fixing proceeds laundering patterns.</div>
        <RunBtn onClick={run} disabled={status === "loading"} />
        {error && <ErrorBox msg={error} />}
        {result && <JsonTree data={result} />}
      </div>
    </IntelSection>
  );
}

function GoldPreciousMetalsSection({ subject }: { subject: Subject }) {
  const [status, setStatus] = useState<SectionStatus>("idle");
  const [result, setResult] = useState<unknown>(null);
  const [error, setError] = useState("");
  async function run() {
    setStatus("loading"); setError("");
    try {
      const res = await fetch("/api/gold-precious-metals", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ name: subject.name, entityType: subject.entityType }) });
      const data = (await res.json()) as unknown;
      setResult(data); setStatus("done");
    } catch (e) { setError(String(e)); setStatus("error"); }
  }
  return (
    <IntelSection title="Gold & Precious Metals Risk" icon="🥇" status={status}>
      <div className="space-y-3">
        <div className="text-11 text-ink-3">UAE LBMA/DMCC gold chain heuristics: conflict gold sourcing, refinery by-pass, cash-for-gold smurfing, suspicious provenance declarations, and DMCC compliance flags.</div>
        <RunBtn onClick={run} disabled={status === "loading"} />
        {error && <ErrorBox msg={error} />}
        {result && <JsonTree data={result} />}
      </div>
    </IntelSection>
  );
}

function NpoRiskSection({ subject }: { subject: Subject }) {
  const [status, setStatus] = useState<SectionStatus>("idle");
  const [result, setResult] = useState<unknown>(null);
  const [error, setError] = useState("");
  async function run() {
    setStatus("loading"); setError("");
    try {
      const res = await fetch("/api/npo-risk", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ name: subject.name, entityType: subject.entityType, jurisdiction: subject.jurisdiction }) });
      const data = (await res.json()) as unknown;
      setResult(data); setStatus("done");
    } catch (e) { setError(String(e)); setStatus("error"); }
  }
  return (
    <IntelSection title="NPO / Charity Risk" icon="🤝" status={status}>
      <div className="space-y-3">
        <div className="text-11 text-ink-3">Non-profit and charitable organisation AML/CFT/TF risk: donor anonymity, geographic diversion, links to designated entities, registration status, and FATF Recommendation 8 indicators.</div>
        <RunBtn onClick={run} disabled={status === "loading"} />
        {error && <ErrorBox msg={error} />}
        {result && <JsonTree data={result} />}
      </div>
    </IntelSection>
  );
}

function VaspRiskSection({ subject }: { subject: Subject }) {
  const [status, setStatus] = useState<SectionStatus>("idle");
  const [result, setResult] = useState<unknown>(null);
  const [error, setError] = useState("");
  async function run() {
    setStatus("loading"); setError("");
    try {
      const res = await fetch("/api/vasp-risk", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ name: subject.name, entityType: subject.entityType, jurisdiction: subject.jurisdiction }) });
      const data = (await res.json()) as unknown;
      setResult(data); setStatus("done");
    } catch (e) { setError(String(e)); setStatus("error"); }
  }
  return (
    <IntelSection title="VASP / Crypto Exchange Risk" icon="🔐" status={status}>
      <div className="space-y-3">
        <div className="text-11 text-ink-3">Virtual Asset Service Provider risk: VARA licensing status, Travel Rule compliance, dark market exposure, unhosted wallet concentration, and FATF R.15 compliance gaps.</div>
        <RunBtn onClick={run} disabled={status === "loading"} />
        {error && <ErrorBox msg={error} />}
        {result && <JsonTree data={result} />}
      </div>
    </IntelSection>
  );
}

function EnvironmentalCrimeSection({ subject }: { subject: Subject }) {
  const [status, setStatus] = useState<SectionStatus>("idle");
  const [result, setResult] = useState<unknown>(null);
  const [error, setError] = useState("");
  async function run() {
    setStatus("loading"); setError("");
    try {
      const res = await fetch("/api/environmental-crime", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ name: subject.name, entityType: subject.entityType, industry: subject.riskCategory }) });
      const data = (await res.json()) as unknown;
      setResult(data); setStatus("done");
    } catch (e) { setError(String(e)); setStatus("error"); }
  }
  return (
    <IntelSection title="Environmental Crime Risk" icon="🌿" status={status}>
      <div className="space-y-3">
        <div className="text-11 text-ink-3">Environmental crime proceeds: illegal logging, wildlife trafficking, carbon credit fraud, illegal waste disposal, and green-washing scam indicators per FATF guidance.</div>
        <RunBtn onClick={run} disabled={status === "loading"} />
        {error && <ErrorBox msg={error} />}
        {result && <JsonTree data={result} />}
      </div>
    </IntelSection>
  );
}

// ─── GROUP 14: Network & Graph Intelligence ───────────────────────────────────

function SixDegreesSection({ subject }: { subject: Subject }) {
  const [status, setStatus] = useState<SectionStatus>("idle");
  const [result, setResult] = useState<unknown>(null);
  const [error, setError] = useState("");
  async function run() {
    setStatus("loading"); setError("");
    try {
      const res = await fetch("/api/six-degrees", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ name: subject.name, entityType: subject.entityType }) });
      const data = (await res.json()) as unknown;
      setResult(data); setStatus("done");
    } catch (e) { setError(String(e)); setStatus("error"); }
  }
  return (
    <IntelSection title="Six Degrees to Sanctions" icon="🕸️" status={status}>
      <div className="space-y-3">
        <div className="text-11 text-ink-3">Graph traversal to find the shortest path between the subject and any OFAC / UN / EU / HMT sanctioned entity. Flag hop count, path, and intermediate nodes.</div>
        <RunBtn onClick={run} disabled={status === "loading"} />
        {error && <ErrorBox msg={error} />}
        {result && <JsonTree data={result} />}
      </div>
    </IntelSection>
  );
}

function HiddenControllerSection({ subject }: { subject: Subject }) {
  const [status, setStatus] = useState<SectionStatus>("idle");
  const [result, setResult] = useState<unknown>(null);
  const [error, setError] = useState("");
  async function run() {
    setStatus("loading"); setError("");
    try {
      const res = await fetch("/api/hidden-controller", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ name: subject.name, entityType: subject.entityType, jurisdiction: subject.jurisdiction }) });
      const data = (await res.json()) as unknown;
      setResult(data); setStatus("done");
    } catch (e) { setError(String(e)); setStatus("error"); }
  }
  return (
    <IntelSection title="Hidden Controller Detection" icon="🎭" status={status}>
      <div className="space-y-3">
        <div className="text-11 text-ink-3">Identify concealed control mechanisms: nominee directors, power of attorney chains, trust-behind-trust structures, and informal control arrangements masking the true beneficial owner.</div>
        <RunBtn onClick={run} disabled={status === "loading"} />
        {error && <ErrorBox msg={error} />}
        {result && <JsonTree data={result} />}
      </div>
    </IntelSection>
  );
}

function ClusterContaminationSection({ subject }: { subject: Subject }) {
  const [status, setStatus] = useState<SectionStatus>("idle");
  const [result, setResult] = useState<unknown>(null);
  const [error, setError] = useState("");
  async function run() {
    setStatus("loading"); setError("");
    try {
      const res = await fetch("/api/cluster-contamination", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ subjectName: subject.name, entityType: subject.entityType }) });
      const data = (await res.json()) as unknown;
      setResult(data); setStatus("done");
    } catch (e) { setError(String(e)); setStatus("error"); }
  }
  return (
    <IntelSection title="Cluster Contamination Analysis" icon="🔴" status={status}>
      <div className="space-y-3">
        <div className="text-11 text-ink-3">Model risk propagation across linked entity cluster: if one node is designated/convicted, how does risk spread through the network and which other entities are at risk of contamination?</div>
        <RunBtn onClick={run} disabled={status === "loading"} />
        {error && <ErrorBox msg={error} />}
        {result && <JsonTree data={result} />}
      </div>
    </IntelSection>
  );
}

function TimingCorrelationSection({ subject }: { subject: Subject }) {
  const [status, setStatus] = useState<SectionStatus>("idle");
  const [result, setResult] = useState<unknown>(null);
  const [error, setError] = useState("");
  async function run() {
    setStatus("loading"); setError("");
    try {
      const res = await fetch("/api/timing-correlation", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ subjectName: subject.name, entityType: subject.entityType }) });
      const data = (await res.json()) as unknown;
      setResult(data); setStatus("done");
    } catch (e) { setError(String(e)); setStatus("error"); }
  }
  return (
    <IntelSection title="Timing Correlation Engine" icon="⏰" status={status}>
      <div className="space-y-3">
        <div className="text-11 text-ink-3">Correlate corporate actions (incorporation, capital changes, director changes) against external sanctions events, regulatory announcements, and enforcement timelines to detect evasion timing patterns.</div>
        <RunBtn onClick={run} disabled={status === "loading"} />
        {error && <ErrorBox msg={error} />}
        {result && <JsonTree data={result} />}
      </div>
    </IntelSection>
  );
}

function DarkMoneyFlowSection({ subject }: { subject: Subject }) {
  const [status, setStatus] = useState<SectionStatus>("idle");
  const [result, setResult] = useState<unknown>(null);
  const [error, setError] = useState("");
  async function run() {
    setStatus("loading"); setError("");
    try {
      const res = await fetch("/api/dark-money-flow", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ subjectName: subject.name, entityType: subject.entityType, jurisdiction: subject.jurisdiction }) });
      const data = (await res.json()) as unknown;
      setResult(data); setStatus("done");
    } catch (e) { setError(String(e)); setStatus("error"); }
  }
  return (
    <IntelSection title="Dark Money Flow Analysis" icon="🌑" status={status}>
      <div className="space-y-3">
        <div className="text-11 text-ink-3">Structural capacity estimation for dark money flows: shell chain depth, opacity index, correspondent banking pathways, and estimated value-at-risk through the entity structure.</div>
        <RunBtn onClick={run} disabled={status === "loading"} />
        {error && <ErrorBox msg={error} />}
        {result && <JsonTree data={result} />}
      </div>
    </IntelSection>
  );
}

function BeneficialOwnerVerifySection({ subject }: { subject: Subject }) {
  const [status, setStatus] = useState<SectionStatus>("idle");
  const [result, setResult] = useState<unknown>(null);
  const [error, setError] = useState("");
  async function run() {
    setStatus("loading"); setError("");
    try {
      const res = await fetch("/api/beneficial-owner-verify", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ name: subject.name, entityType: subject.entityType, jurisdiction: subject.jurisdiction }) });
      const data = (await res.json()) as unknown;
      setResult(data); setStatus("done");
    } catch (e) { setError(String(e)); setStatus("error"); }
  }
  return (
    <IntelSection title="Beneficial Owner Verification" icon="✅" status={status}>
      <div className="space-y-3">
        <div className="text-11 text-ink-3">Cross-verify declared beneficial owners against registry data, LEI records, corporate filings, and open-source intelligence. Flag discrepancies and unverified ownership claims.</div>
        <RunBtn onClick={run} disabled={status === "loading"} />
        {error && <ErrorBox msg={error} />}
        {result && <JsonTree data={result} />}
      </div>
    </IntelSection>
  );
}

function PepCorporateNexusSection({ subject }: { subject: Subject }) {
  const [status, setStatus] = useState<SectionStatus>("idle");
  const [result, setResult] = useState<unknown>(null);
  const [error, setError] = useState("");
  async function run() {
    setStatus("loading"); setError("");
    try {
      const res = await fetch("/api/pep-corporate", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ name: subject.name, entityType: subject.entityType }) });
      const data = (await res.json()) as unknown;
      setResult(data); setStatus("done");
    } catch (e) { setError(String(e)); setStatus("error"); }
  }
  return (
    <IntelSection title="PEP Corporate Nexus" icon="🏛️" status={status}>
      <div className="space-y-3">
        <div className="text-11 text-ink-3">Map PEP connections to corporate structures: companies where PEPs hold directorships, shareholdings, or are beneficial owners — including family members and close associates.</div>
        <RunBtn onClick={run} disabled={status === "loading"} />
        {error && <ErrorBox msg={error} />}
        {result && <JsonTree data={result} />}
      </div>
    </IntelSection>
  );
}

function CrossBorderWireSection({ subject }: { subject: Subject }) {
  const [status, setStatus] = useState<SectionStatus>("idle");
  const [result, setResult] = useState<unknown>(null);
  const [error, setError] = useState("");
  async function run() {
    setStatus("loading"); setError("");
    try {
      const res = await fetch("/api/cross-border-wire", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ name: subject.name, entityType: subject.entityType, jurisdiction: subject.jurisdiction }) });
      const data = (await res.json()) as unknown;
      setResult(data); setStatus("done");
    } catch (e) { setError(String(e)); setStatus("error"); }
  }
  return (
    <IntelSection title="Cross-Border Wire Analysis" icon="🌐" status={status}>
      <div className="space-y-3">
        <div className="text-11 text-ink-3">Analyse cross-border wire transfer patterns: corridor risk, SWIFT message anomalies, R-16 round-trip indicators, and high-risk correspondent banking pathway detection.</div>
        <RunBtn onClick={run} disabled={status === "loading"} />
        {error && <ErrorBox msg={error} />}
        {result && <JsonTree data={result} />}
      </div>
    </IntelSection>
  );
}

function CtrStructuringSection({ subject }: { subject: Subject }) {
  const [status, setStatus] = useState<SectionStatus>("idle");
  const [result, setResult] = useState<unknown>(null);
  const [error, setError] = useState("");
  async function run() {
    setStatus("loading"); setError("");
    try {
      const res = await fetch("/api/ctr-structuring", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ name: subject.name, entityType: subject.entityType }) });
      const data = (await res.json()) as unknown;
      setResult(data); setStatus("done");
    } catch (e) { setError(String(e)); setStatus("error"); }
  }
  return (
    <IntelSection title="CTR Structuring Detection" icon="💰" status={status}>
      <div className="space-y-3">
        <div className="text-11 text-ink-3">Detect cash transaction report structuring (smurfing): sub-threshold splitting, multiple-branch coordination, periodic clustering just below AED 40,000 / USD 10,000 reporting thresholds.</div>
        <RunBtn onClick={run} disabled={status === "loading"} />
        {error && <ErrorBox msg={error} />}
        {result && <JsonTree data={result} />}
      </div>
    </IntelSection>
  );
}

// ─── GROUP 15: Advanced AI Reasoning ─────────────────────────────────────────

function CaseAnalogySection({ subject }: { subject: Subject }) {
  const [status, setStatus] = useState<SectionStatus>("idle");
  const [result, setResult] = useState<unknown>(null);
  const [error, setError] = useState("");
  async function run() {
    setStatus("loading"); setError("");
    try {
      const res = await fetch("/api/case-analogy", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ subjectName: subject.name, entityType: subject.entityType, jurisdiction: subject.jurisdiction }) });
      const data = (await res.json()) as unknown;
      setResult(data); setStatus("done");
    } catch (e) { setError(String(e)); setStatus("error"); }
  }
  return (
    <IntelSection title="Case Analogy Matching" icon="🔗" status={status}>
      <div className="space-y-3">
        <div className="text-11 text-ink-3">Tag-based similarity matching against real enforcement cases, FIU typologies, and regulatory precedents. Surfaces the most analogous historical cases and their outcomes.</div>
        <RunBtn onClick={run} disabled={status === "loading"} />
        {error && <ErrorBox msg={error} />}
        {result && <JsonTree data={result} />}
      </div>
    </IntelSection>
  );
}

function EvidenceSufficiencySection({ subject }: { subject: Subject }) {
  const [status, setStatus] = useState<SectionStatus>("idle");
  const [result, setResult] = useState<unknown>(null);
  const [error, setError] = useState("");
  async function run() {
    setStatus("loading"); setError("");
    try {
      const res = await fetch("/api/evidence-sufficiency", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ subjectName: subject.name, entityType: subject.entityType, disposition: "STR" }) });
      const data = (await res.json()) as unknown;
      setResult(data); setStatus("done");
    } catch (e) { setError(String(e)); setStatus("error"); }
  }
  return (
    <IntelSection title="Evidence Sufficiency Checker" icon="✔️" status={status}>
      <div className="space-y-3">
        <div className="text-11 text-ink-3">Evaluate whether the evidence assembled is sufficient to support the proposed disposition (Clear / Monitor / EDD / STR / Reject). Checklist against FATF and UAE filing standards.</div>
        <RunBtn onClick={run} disabled={status === "loading"} />
        {error && <ErrorBox msg={error} />}
        {result && <JsonTree data={result} />}
      </div>
    </IntelSection>
  );
}

function RedlineMonitorSection({ subject }: { subject: Subject }) {
  const [status, setStatus] = useState<SectionStatus>("idle");
  const [result, setResult] = useState<unknown>(null);
  const [error, setError] = useState("");
  async function run() {
    setStatus("loading"); setError("");
    try {
      const res = await fetch("/api/redline-monitor", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ subjectName: subject.name, conditions: [] }) });
      const data = (await res.json()) as unknown;
      setResult(data); setStatus("done");
    } catch (e) { setError(String(e)); setStatus("error"); }
  }
  return (
    <IntelSection title="Redline Monitor" icon="🔴" status={status}>
      <div className="space-y-3">
        <div className="text-11 text-ink-3">Define absolute redline conditions (sanctions match, PEP + cash + high-risk jurisdiction, etc.) that trigger immediate escalation regardless of overall risk score.</div>
        <RunBtn onClick={run} disabled={status === "loading"} />
        {error && <ErrorBox msg={error} />}
        {result && <JsonTree data={result} />}
      </div>
    </IntelSection>
  );
}

function ProbabilityTreeSection({ subject }: { subject: Subject }) {
  const [status, setStatus] = useState<SectionStatus>("idle");
  const [result, setResult] = useState<unknown>(null);
  const [error, setError] = useState("");
  async function run() {
    setStatus("loading"); setError("");
    try {
      const res = await fetch("/api/probability-tree", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ subjectName: subject.name, entityType: subject.entityType }) });
      const data = (await res.json()) as unknown;
      setResult(data); setStatus("done");
    } catch (e) { setError(String(e)); setStatus("error"); }
  }
  return (
    <IntelSection title="Probability Tree Builder" icon="🌳" status={status}>
      <div className="space-y-3">
        <div className="text-11 text-ink-3">Bayesian scenario probability tree: branch the case into explanatory hypotheses (legitimate / suspicious / high-risk), assign prior/posterior probabilities, and identify the most likely true scenario.</div>
        <RunBtn onClick={run} disabled={status === "loading"} />
        {error && <ErrorBox msg={error} />}
        {result && <JsonTree data={result} />}
      </div>
    </IntelSection>
  );
}

function AutonomousInvestigateSection({ subject }: { subject: Subject }) {
  const [status, setStatus] = useState<SectionStatus>("idle");
  const [result, setResult] = useState<unknown>(null);
  const [error, setError] = useState("");
  async function run() {
    setStatus("loading"); setError("");
    try {
      const res = await fetch("/api/autonomous-investigate", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ subjectName: subject.name, entityType: subject.entityType, jurisdiction: subject.jurisdiction }) });
      const data = (await res.json()) as unknown;
      setResult(data); setStatus("done");
    } catch (e) { setError(String(e)); setStatus("error"); }
  }
  return (
    <IntelSection title="Autonomous Investigation" icon="🤖" status={status}>
      <div className="space-y-3">
        <div className="text-11 text-ink-3">AI-driven autonomous investigation: multi-step reasoning chain, hypothesis formation, evidence gathering plan, gap identification, and structured intelligence report — without human direction at each step.</div>
        <RunBtn onClick={run} disabled={status === "loading"} />
        {error && <ErrorBox msg={error} />}
        {result && <JsonTree data={result} />}
      </div>
    </IntelSection>
  );
}

function CompetitorScreenSection({ subject }: { subject: Subject }) {
  const [status, setStatus] = useState<SectionStatus>("idle");
  const [result, setResult] = useState<unknown>(null);
  const [error, setError] = useState("");
  async function run() {
    setStatus("loading"); setError("");
    try {
      const res = await fetch("/api/competitor-screen", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ name: subject.name, entityType: subject.entityType, industry: subject.riskCategory }) });
      const data = (await res.json()) as unknown;
      setResult(data); setStatus("done");
    } catch (e) { setError(String(e)); setStatus("error"); }
  }
  return (
    <IntelSection title="Peer / Competitor Screen" icon="👥" status={status}>
      <div className="space-y-3">
        <div className="text-11 text-ink-3">Screen peer entities in the same industry/sector. If competitors are flagged, assess contagion risk. If the subject is notably cleaner than peers, assess whether that itself is anomalous.</div>
        <RunBtn onClick={run} disabled={status === "loading"} />
        {error && <ErrorBox msg={error} />}
        {result && <JsonTree data={result} />}
      </div>
    </IntelSection>
  );
}

function AdverseClassifySection({ subject }: { subject: Subject }) {
  const [status, setStatus] = useState<SectionStatus>("idle");
  const [result, setResult] = useState<unknown>(null);
  const [error, setError] = useState("");
  async function run() {
    setStatus("loading"); setError("");
    try {
      const res = await fetch("/api/adverse-classify", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ name: subject.name, entityType: subject.entityType }) });
      const data = (await res.json()) as unknown;
      setResult(data); setStatus("done");
    } catch (e) { setError(String(e)); setStatus("error"); }
  }
  return (
    <IntelSection title="Adverse Media Classifier" icon="📰" status={status}>
      <div className="space-y-3">
        <div className="text-11 text-ink-3">AI classification of adverse media hits: fraud, corruption, sanctions, terrorism financing, drug trafficking, human trafficking — with relevance scoring and false-positive probability.</div>
        <RunBtn onClick={run} disabled={status === "loading"} />
        {error && <ErrorBox msg={error} />}
        {result && <JsonTree data={result} />}
      </div>
    </IntelSection>
  );
}

function FalsePositiveOptimizerSection({ subject }: { subject: Subject }) {
  const [status, setStatus] = useState<SectionStatus>("idle");
  const [result, setResult] = useState<unknown>(null);
  const [error, setError] = useState("");
  async function run() {
    setStatus("loading"); setError("");
    try {
      const res = await fetch("/api/false-positive", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ name: subject.name, entityType: subject.entityType }) });
      const data = (await res.json()) as unknown;
      setResult(data); setStatus("done");
    } catch (e) { setError(String(e)); setStatus("error"); }
  }
  return (
    <IntelSection title="False Positive Optimizer" icon="🎛️" status={status}>
      <div className="space-y-3">
        <div className="text-11 text-ink-3">Estimate false positive probability for this case: common name disambiguation, legitimate business explanations, base-rate calibration, and recommended tuning actions to reduce future false positives.</div>
        <RunBtn onClick={run} disabled={status === "loading"} />
        {error && <ErrorBox msg={error} />}
        {result && <JsonTree data={result} />}
      </div>
    </IntelSection>
  );
}

function MixedFundsSection({ subject }: { subject: Subject }) {
  const [status, setStatus] = useState<SectionStatus>("idle");
  const [result, setResult] = useState<unknown>(null);
  const [error, setError] = useState("");
  async function run() {
    setStatus("loading"); setError("");
    try {
      const res = await fetch("/api/mixed-funds", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ name: subject.name, entityType: subject.entityType }) });
      const data = (await res.json()) as unknown;
      setResult(data); setStatus("done");
    } catch (e) { setError(String(e)); setStatus("error"); }
  }
  return (
    <IntelSection title="Mixed Funds Detector" icon="🫧" status={status}>
      <div className="space-y-3">
        <div className="text-11 text-ink-3">Detect commingling of legitimate and illicit funds: blending ratios, co-mingling through operating accounts, legitimate business revenue used to disguise proceeds of crime.</div>
        <RunBtn onClick={run} disabled={status === "loading"} />
        {error && <ErrorBox msg={error} />}
        {result && <JsonTree data={result} />}
      </div>
    </IntelSection>
  );
}

function MlPredicateSection({ subject }: { subject: Subject }) {
  const [status, setStatus] = useState<SectionStatus>("idle");
  const [result, setResult] = useState<unknown>(null);
  const [error, setError] = useState("");
  async function run() {
    setStatus("loading"); setError("");
    try {
      const res = await fetch("/api/ml-predicate", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ name: subject.name, entityType: subject.entityType, industry: subject.riskCategory }) });
      const data = (await res.json()) as unknown;
      setResult(data); setStatus("done");
    } catch (e) { setError(String(e)); setStatus("error"); }
  }
  return (
    <IntelSection title="ML Predicate Offence Classifier" icon="⚖️" status={status}>
      <div className="space-y-3">
        <div className="text-11 text-ink-3">AI classification of the most likely predicate offence(s) underlying suspected money laundering: fraud, corruption, drug trafficking, tax evasion, cybercrime — with probability distribution.</div>
        <RunBtn onClick={run} disabled={status === "loading"} />
        {error && <ErrorBox msg={error} />}
        {result && <JsonTree data={result} />}
      </div>
    </IntelSection>
  );
}

function EsgRiskSection({ subject }: { subject: Subject }) {
  const [status, setStatus] = useState<SectionStatus>("idle");
  const [result, setResult] = useState<unknown>(null);
  const [error, setError] = useState("");
  async function run() {
    setStatus("loading"); setError("");
    try {
      const res = await fetch("/api/esg-risk", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ name: subject.name, entityType: subject.entityType, industry: subject.riskCategory }) });
      const data = (await res.json()) as unknown;
      setResult(data); setStatus("done");
    } catch (e) { setError(String(e)); setStatus("error"); }
  }
  return (
    <IntelSection title="ESG Risk Overlay" icon="🌱" status={status}>
      <div className="space-y-3">
        <div className="text-11 text-ink-3">Environmental, Social, and Governance risk overlay: UNPRI red flags, ESG controversies, greenwashing indicators, forced labour supply chain exposure, and governance failures correlated with AML risk.</div>
        <RunBtn onClick={run} disabled={status === "loading"} />
        {error && <ErrorBox msg={error} />}
        {result && <JsonTree data={result} />}
      </div>
    </IntelSection>
  );
}

function CustomerLifecycleSection({ subject }: { subject: Subject }) {
  const [status, setStatus] = useState<SectionStatus>("idle");
  const [result, setResult] = useState<unknown>(null);
  const [error, setError] = useState("");
  async function run() {
    setStatus("loading"); setError("");
    try {
      const res = await fetch("/api/customer-lifecycle", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ name: subject.name, entityType: subject.entityType }) });
      const data = (await res.json()) as unknown;
      setResult(data); setStatus("done");
    } catch (e) { setError(String(e)); setStatus("error"); }
  }
  return (
    <IntelSection title="Customer Lifecycle Risk" icon="🔄" status={status}>
      <div className="space-y-3">
        <div className="text-11 text-ink-3">Map the full customer lifecycle risk profile: onboarding quality, CDD refresh history, risk tier changes, incident history, and predicted future risk trajectory based on entity type and activity pattern.</div>
        <RunBtn onClick={run} disabled={status === "loading"} />
        {error && <ErrorBox msg={error} />}
        {result && <JsonTree data={result} />}
      </div>
    </IntelSection>
  );
}

function OnboardingRiskTierSection({ subject }: { subject: Subject }) {
  const [status, setStatus] = useState<SectionStatus>("idle");
  const [result, setResult] = useState<unknown>(null);
  const [error, setError] = useState("");
  async function run() {
    setStatus("loading"); setError("");
    try {
      const res = await fetch("/api/onboarding-risk-tier", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ name: subject.name, entityType: subject.entityType, jurisdiction: subject.jurisdiction, industry: subject.riskCategory }) });
      const data = (await res.json()) as unknown;
      setResult(data); setStatus("done");
    } catch (e) { setError(String(e)); setStatus("error"); }
  }
  return (
    <IntelSection title="Onboarding Risk Tier" icon="🎚️" status={status}>
      <div className="space-y-3">
        <div className="text-11 text-ink-3">Assign the correct onboarding risk tier (Standard / Enhanced / PEP / Prohibited) based on all available intelligence, and generate the minimum required CDD documentation checklist.</div>
        <RunBtn onClick={run} disabled={status === "loading"} />
        {error && <ErrorBox msg={error} />}
        {result && <JsonTree data={result} />}
      </div>
    </IntelSection>
  );
}

function CddAdequacySection({ subject }: { subject: Subject }) {
  const [status, setStatus] = useState<SectionStatus>("idle");
  const [result, setResult] = useState<unknown>(null);
  const [error, setError] = useState("");
  async function run() {
    setStatus("loading"); setError("");
    try {
      const res = await fetch("/api/cdd-adequacy", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ name: subject.name, entityType: subject.entityType, jurisdiction: subject.jurisdiction }) });
      const data = (await res.json()) as unknown;
      setResult(data); setStatus("done");
    } catch (e) { setError(String(e)); setStatus("error"); }
  }
  return (
    <IntelSection title="CDD Adequacy Check" icon="📁" status={status}>
      <div className="space-y-3">
        <div className="text-11 text-ink-3">Assess completeness and adequacy of current Customer Due Diligence file against the required standard for the assigned risk tier. Highlight document gaps, expiries, and re-verification obligations.</div>
        <RunBtn onClick={run} disabled={status === "loading"} />
        {error && <ErrorBox msg={error} />}
        {result && <JsonTree data={result} />}
      </div>
    </IntelSection>
  );
}

function PepEddGeneratorSection({ subject }: { subject: Subject }) {
  const [status, setStatus] = useState<SectionStatus>("idle");
  const [result, setResult] = useState<unknown>(null);
  const [error, setError] = useState("");
  async function run() {
    setStatus("loading"); setError("");
    try {
      const res = await fetch("/api/pep-edd-generator", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ name: subject.name, pepRole: subject.pep?.tier, jurisdiction: subject.jurisdiction }) });
      const data = (await res.json()) as unknown;
      setResult(data); setStatus("done");
    } catch (e) { setError(String(e)); setStatus("error"); }
  }
  return (
    <IntelSection title="PEP Enhanced Due Diligence Generator" icon="📝" status={status}>
      <div className="space-y-3">
        <div className="text-11 text-ink-3">Generate a bespoke EDD framework for PEP subjects: senior management approval checklist, source of wealth verification plan, transaction monitoring parameters, and annual review triggers.</div>
        <RunBtn onClick={run} disabled={status === "loading"} />
        {error && <ErrorBox msg={error} />}
        {result && <JsonTree data={result} />}
      </div>
    </IntelSection>
  );
}

function VendorRiskSection({ subject }: { subject: Subject }) {
  const [status, setStatus] = useState<SectionStatus>("idle");
  const [result, setResult] = useState<unknown>(null);
  const [error, setError] = useState("");
  async function run() {
    setStatus("loading"); setError("");
    try {
      const res = await fetch("/api/vendor-risk", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ name: subject.name, entityType: subject.entityType, jurisdiction: subject.jurisdiction, industry: subject.riskCategory }) });
      const data = (await res.json()) as unknown;
      setResult(data); setStatus("done");
    } catch (e) { setError(String(e)); setStatus("error"); }
  }
  return (
    <IntelSection title="Vendor / Third-Party Risk" icon="🤝" status={status}>
      <div className="space-y-3">
        <div className="text-11 text-ink-3">Third-party and vendor risk assessment: supply chain AML exposure, sub-contractor screening, outsourced function risk, and third-party due diligence gaps per CBUAE and FATF guidance.</div>
        <RunBtn onClick={run} disabled={status === "loading"} />
        {error && <ErrorBox msg={error} />}
        {result && <JsonTree data={result} />}
      </div>
    </IntelSection>
  );
}

// ─── Main DeepIntelPanel ──────────────────────────────────────────────────────

export function DeepIntelPanel({ subject, screen, superBrain }: Props) {
  return (
    <div className="space-y-2 mt-4">
      <div className="text-12 text-ink-3 mb-4">
        Deep Intelligence workbench — 120 independent modules. Expand any section and click <strong className="text-ink-1">Run</strong> to trigger on demand.
      </div>

      {/* GROUP 1: Identity & Aliases */}
      <GroupHeader label="Identity & Aliases" />
      <NameVariantSection subject={subject} screen={screen} />
      <PepNetworkSection subject={subject} />
      <OsintSection subject={subject} />
      <EmailRepSection subject={subject} />
      <SmartDisambiguateSection subject={subject} />
      <IbanRiskSection subject={subject} />

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
      <SwiftLcSection subject={subject} />
      <CryptoTracingSection subject={subject} />
      <CryptoMixingSection subject={subject} />
      <TradeFinanceSection subject={subject} />
      <ShellDetectorSection subject={subject} />
      <HawalaDetectorSection subject={subject} />
      <LayeringDetectorSection subject={subject} />
      <CashIntensiveSection subject={subject} />
      <GhostCompanySection subject={subject} />

      {/* GROUP 4: Geopolitical & Regulatory */}
      <GroupHeader label="Geopolitical & Regulatory" />
      <GeoRiskSection subject={subject} />
      <SanctionsNarrativeSection subject={subject} />
      <RegulatoryDeadlinesSection subject={subject} />
      <SanctionsIndirectSection subject={subject} />
      <SanctionsExposureMapperSection subject={subject} />
      <DeRiskingImpactSection subject={subject} />
      <RmiAssessSection subject={subject} />
      <JurisdictionIntelSection subject={subject} />
      <SanctionsEvasionSection subject={subject} />

      {/* GROUP 5: AI Analysis */}
      <GroupHeader label="AI Analysis" />
      <AdversarialRedTeamSection subject={subject} screen={screen} />
      <DispositionPredictorSection subject={subject} screen={screen} superBrain={superBrain} />
      <BayesianTrajectorySection subject={subject} superBrain={superBrain} />
      <IndustryTypologySection subject={subject} />
      <NewsIntelSection subject={subject} />
      <SarNarrativeSection subject={subject} />
      <EddQuestionnaireSection subject={subject} />
      <MlroAdvisorSection />
      <OsintSynthesisSection subject={subject} />
      <TypologyMatchSection subject={subject} />

      {/* GROUP 6: Case Actions */}
      <GroupHeader label="Case Actions" />
      <DocumentIntelSection subject={subject} />
      <VoiceToCaseSection subject={subject} />
      <CrossCasePatternSection subject={subject} />
      <MultiJurisdictionFilingSection subject={subject} />
      <ContinuousMonitoringSection subject={subject} />
      <ReScreenSchedulerSection subject={subject} />
      <FourEyesSection subject={subject} />
      <WhistleblowerSection subject={subject} />
      <InterAgencyReferralSection subject={subject} />
      <InvestigationExpandSection subject={subject} />

      {/* GROUP 7: Corporate Structure */}
      <GroupHeader label="Corporate Structure" />
      <EntityGraphSection subject={subject} />
      <OwnershipSection subject={subject} />
      <TrustStructuresSection subject={subject} />
      <NomineeRiskSection subject={subject} />
      <EocnListSection />
      <CorruptionRiskSection subject={subject} />
      <HighNetWorthSection subject={subject} />
      <SowCalculatorSection subject={subject} />

      {/* GROUP 8: Financial Crime Patterns */}
      <GroupHeader label="Financial Crime Patterns" />
      <AssetTracerSection subject={subject} />
      <FreezeSeizureSection subject={subject} />

      {/* GROUP 9: Extended AI Analysis */}
      <GroupHeader label="Extended AI Analysis" />
      <EvidencePackSection subject={subject} />
      <LegalPrivilegeSection subject={subject} />
      <DomainIntelSection subject={subject} />

      {/* GROUP 10: Operations & Actions */}
      <GroupHeader label="Operations & Actions" />
      <InsiderThreatSection subject={subject} />
      <HumanTraffickingSection subject={subject} />

      {/* GROUP 11: Behavioral & Psychological Intelligence */}
      <GroupHeader label="Behavioral & Psychological Intelligence" />
      <BehavioralBaselineSection subject={subject} />
      <LinguisticRiskSection subject={subject} />
      <LifestyleWealthGapSection subject={subject} />
      <PlausibilityScoreSection subject={subject} />
      <AssociationTimelineSection subject={subject} />
      <ConfidenceDecaySection subject={subject} />
      <ExaminerSimSection subject={subject} />
      <BenfordSection subject={subject} />

      {/* GROUP 12: Legal & Regulatory Deep Intelligence */}
      <GroupHeader label="Legal & Regulatory Deep Intelligence" />
      <LitigationScanSection subject={subject} />
      <EnforcementActionsSection subject={subject} />
      <TaxAuthoritySection subject={subject} />
      <ExtraditionMapSection subject={subject} />
      <StatuteLimitationsSection subject={subject} />
      <RegArbitrageSection subject={subject} />
      <AuditReadinessSection subject={subject} />
      <AmlProgrammeGapSection />

      {/* GROUP 13: Sector-Specific Intelligence */}
      <GroupHeader label="Sector-Specific Intelligence" />
      <ArtMarketSection subject={subject} />
      <LuxuryGoodsSection subject={subject} />
      <AviationIntelSection subject={subject} />
      <FreeZoneRiskSection subject={subject} />
      <GamingRiskSection subject={subject} />
      <GoldPreciousMetalsSection subject={subject} />
      <NpoRiskSection subject={subject} />
      <VaspRiskSection subject={subject} />
      <EnvironmentalCrimeSection subject={subject} />

      {/* GROUP 14: Network & Graph Intelligence */}
      <GroupHeader label="Network & Graph Intelligence" />
      <SixDegreesSection subject={subject} />
      <HiddenControllerSection subject={subject} />
      <ClusterContaminationSection subject={subject} />
      <TimingCorrelationSection subject={subject} />
      <DarkMoneyFlowSection subject={subject} />
      <BeneficialOwnerVerifySection subject={subject} />
      <PepCorporateNexusSection subject={subject} />
      <CrossBorderWireSection subject={subject} />
      <CtrStructuringSection subject={subject} />

      {/* GROUP 15: Advanced AI Reasoning */}
      <GroupHeader label="Advanced AI Reasoning" />
      <CaseAnalogySection subject={subject} />
      <EvidenceSufficiencySection subject={subject} />
      <RedlineMonitorSection subject={subject} />
      <ProbabilityTreeSection subject={subject} />
      <AutonomousInvestigateSection subject={subject} />
      <CompetitorScreenSection subject={subject} />
      <AdverseClassifySection subject={subject} />
      <FalsePositiveOptimizerSection subject={subject} />
      <MixedFundsSection subject={subject} />
      <MlPredicateSection subject={subject} />
      <EsgRiskSection subject={subject} />
      <CustomerLifecycleSection subject={subject} />
      <OnboardingRiskTierSection subject={subject} />
      <CddAdequacySection subject={subject} />
      <PepEddGeneratorSection subject={subject} />
      <VendorRiskSection subject={subject} />
    </div>
  );
}
