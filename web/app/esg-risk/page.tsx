"use client";

import { useEffect, useRef, useState } from "react";
import { ModuleHero, ModuleLayout } from "@/components/layout/ModuleLayout";
import { ActionButton } from "@/components/shared/ActionButton";
import type { EsgRiskResult, EsgRating, MlRiskLevel } from "@/app/api/esg-risk/route";
import { apiErrorMessage, caughtErrorMessage } from "@/lib/client/error-utils";

// ─────────────────────────────────────────────────────────────────────────────
// History helpers (localStorage)
// ─────────────────────────────────────────────────────────────────────────────

const HISTORY_KEY = "hawkeye.esg.history";

interface HistoryEntry {
  entity: string;
  score: number;
  rating: EsgRating;
  mlRisk: MlRiskLevel;
  ratedAt: string;
}

function loadHistory(): HistoryEntry[] {
  try {
    const raw = localStorage.getItem(HISTORY_KEY);
    return raw ? (JSON.parse(raw) as HistoryEntry[]) : [];
  } catch { return []; }
}

function saveHistory(entries: HistoryEntry[]): void {
  try { localStorage.setItem(HISTORY_KEY, JSON.stringify(entries.slice(0, 20))); } catch { /* noop */ }
}

function appendHistory(entry: HistoryEntry): void {
  const existing = loadHistory();
  saveHistory([entry, ...existing]);
}

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

interface FormData {
  entity: string;
  sector: string;
  jurisdiction: string;
  operations: string;
  supplierCountries: string;
  employeeCount: string;
  notes: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// Style maps
// ─────────────────────────────────────────────────────────────────────────────

const ESG_RATING_STYLES: Record<EsgRating, { bg: string; text: string; label: string }> = {
  AAA: { bg: "bg-green/10 border-green/30", text: "text-green", label: "Excellent" },
  AA: { bg: "bg-green/8 border-green/20", text: "text-green", label: "Very Good" },
  A: { bg: "bg-blue/10 border-blue/30", text: "text-blue", label: "Good" },
  BBB: { bg: "bg-blue/8 border-blue/20", text: "text-blue", label: "Adequate" },
  BB: { bg: "bg-amber/10 border-amber/30", text: "text-amber", label: "Moderate Risk" },
  B: { bg: "bg-orange/10 border-orange/30", text: "text-orange", label: "High Risk" },
  CCC: { bg: "bg-red/10 border-red/30", text: "text-red", label: "Critical Risk" },
};

const ML_RISK_STYLES: Record<MlRiskLevel, { badge: string; dot: string }> = {
  low: { badge: "bg-green/10 text-green border-green/20", dot: "bg-green" },
  medium: { badge: "bg-amber/10 text-amber border-amber/20", dot: "bg-amber" },
  high: { badge: "bg-red/10 text-red border-red/20", dot: "bg-red" },
};

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

function scoreColor(score: number): string {
  if (score >= 70) return "bg-green";
  if (score >= 50) return "bg-blue";
  if (score >= 35) return "bg-amber";
  return "bg-red";
}

function scoreTextColor(score: number): string {
  if (score >= 70) return "text-green";
  if (score >= 50) return "text-blue";
  if (score >= 35) return "text-amber";
  return "text-red";
}

// ─────────────────────────────────────────────────────────────────────────────
// Sub-components
// ─────────────────────────────────────────────────────────────────────────────

function ScoreBar({ score }: { score: number }) {
  return (
    <div className="flex items-center gap-3">
      <div className="flex-1 h-2 bg-bg-2 rounded-full overflow-hidden">
        <div
          className={`h-full rounded-full transition-all ${scoreColor(score)}`}
          style={{ width: `${score}%` }}
        />
      </div>
      <span className={`font-mono text-12 w-8 text-right font-semibold ${scoreTextColor(score)}`}>
        {score}
      </span>
    </div>
  );
}

function DimensionCard({
  icon,
  label,
  score,
  risks,
  opportunities,
}: {
  icon: string;
  label: string;
  score: number;
  risks: string[];
  opportunities: string[];
}) {
  return (
    <div className="bg-bg-panel border border-hair-2 rounded-lg p-5">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <span className="text-18">{icon}</span>
          <span className="text-13 font-semibold text-ink-0">{label}</span>
        </div>
        <span className={`text-20 font-display font-semibold ${scoreTextColor(score)}`}>
          {score}
        </span>
      </div>
      <ScoreBar score={score} />

      {risks.length > 0 && (
        <div className="mt-4">
          <div className="text-10 font-mono uppercase tracking-wide-3 text-red mb-2">Risks</div>
          <ul className="space-y-1.5">
            {risks.map((r, i) => (
              <li key={i} className="flex items-start gap-2">
                <span className="text-red font-mono text-12 mt-0.5 shrink-0">!</span>
                <span className="text-12 text-ink-1 leading-snug">{r}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {opportunities.length > 0 && (
        <div className="mt-3">
          <div className="text-10 font-mono uppercase tracking-wide-3 text-green mb-2">
            Opportunities
          </div>
          <ul className="space-y-1.5">
            {opportunities.map((o, i) => (
              <li key={i} className="flex items-start gap-2">
                <span className="text-green font-mono text-12 mt-0.5 shrink-0">+</span>
                <span className="text-12 text-ink-1 leading-snug">{o}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Sector benchmark bar
// ─────────────────────────────────────────────────────────────────────────────

function SectorBenchmarkBar({
  entityScore,
  sectorAvg,
  entityVsAvg,
  percentile,
}: {
  entityScore: number;
  sectorAvg: number;
  entityVsAvg: string;
  percentile: number;
}) {
  const compColor = entityVsAvg === "above" ? "text-green" : entityVsAvg === "below" ? "text-red" : "text-amber";
  const compLabel = entityVsAvg === "above" ? "Above sector average" : entityVsAvg === "below" ? "Below sector average" : "At sector average";
  return (
    <div className="bg-bg-panel border border-hair-2 rounded-lg p-4">
      <div className="flex items-center gap-2 mb-3">
        <span className="text-16">📊</span>
        <h3 className="text-13 font-semibold text-ink-0">Sector Benchmark</h3>
        <span className={`ml-auto text-11 font-semibold ${compColor}`}>{compLabel} · {percentile}th percentile</span>
      </div>
      <div className="space-y-2">
        <div className="flex items-center gap-3">
          <span className="text-10 text-ink-3 w-24 shrink-0">This entity</span>
          <div className="flex-1 h-2.5 bg-bg-2 rounded-full overflow-hidden">
            <div className={`h-full rounded-full ${scoreColor(entityScore)}`} style={{ width: `${entityScore}%` }} />
          </div>
          <span className={`text-11 font-mono font-semibold w-8 text-right ${scoreTextColor(entityScore)}`}>{entityScore}</span>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-10 text-ink-3 w-24 shrink-0">Sector avg</span>
          <div className="flex-1 h-2.5 bg-bg-2 rounded-full overflow-hidden">
            <div className="h-full rounded-full bg-ink-3" style={{ width: `${sectorAvg}%` }} />
          </div>
          <span className="text-11 font-mono font-semibold w-8 text-right text-ink-3">{sectorAvg}</span>
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// FATF typology bridge
// ─────────────────────────────────────────────────────────────────────────────

function FatfTypologyBridge({ typologies }: { typologies: EsgRiskResult["fatfTypologies"] }) {
  if (!typologies.length) return null;
  return (
    <div className="bg-bg-panel border border-hair-2 rounded-lg p-5">
      <div className="flex items-center gap-2 mb-4">
        <span className="text-16">⚖️</span>
        <h3 className="text-13 font-semibold text-ink-0">FATF Typology Bridge</h3>
        <span className="text-11 text-ink-3">ESG failures mapped to ML predicate offences</span>
      </div>
      <div className="space-y-3">
        {typologies.map((t, i) => (
          <div key={i} className="flex gap-3 items-start border-b border-hair last:border-b-0 pb-3 last:pb-0">
            <span className="text-amber font-mono text-10 shrink-0 pt-0.5">{t.fatfRef}</span>
            <div>
              <div className="text-12 font-semibold text-ink-0 mb-0.5">{t.typology}</div>
              <div className="text-11 text-ink-2">{t.recommendation}</div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// UN SDG violations
// ─────────────────────────────────────────────────────────────────────────────

const SDG_COLORS: Record<number, string> = {
  1: "bg-red/15 text-red", 2: "bg-amber/15 text-amber", 3: "bg-green/15 text-green",
  4: "bg-red/15 text-red", 5: "bg-orange/15 text-orange", 6: "bg-blue/15 text-blue",
  7: "bg-amber/15 text-amber", 8: "bg-red/15 text-red", 9: "bg-orange/15 text-orange",
  10: "bg-red/15 text-red", 11: "bg-amber/15 text-amber", 12: "bg-amber/15 text-amber",
  13: "bg-green/15 text-green", 14: "bg-blue/15 text-blue", 15: "bg-green/15 text-green",
  16: "bg-blue/15 text-blue", 17: "bg-blue/15 text-blue",
};

function SdgViolationsPanel({ violations }: { violations: EsgRiskResult["sdgViolations"] }) {
  if (!violations.length) return null;
  return (
    <div className="bg-bg-panel border border-hair-2 rounded-lg p-5">
      <div className="flex items-center gap-2 mb-4">
        <span className="text-16">🌐</span>
        <h3 className="text-13 font-semibold text-ink-0">UN SDG Violations</h3>
      </div>
      <div className="flex flex-wrap gap-3">
        {violations.map((v, i) => (
          <div key={i} className={`rounded-lg px-3 py-2 ${SDG_COLORS[v.sdgNumber] ?? "bg-bg-2 text-ink-2"}`}>
            <div className="text-11 font-bold">SDG {v.sdgNumber}</div>
            <div className="text-10 font-semibold">{v.sdgName}</div>
            <div className="text-9 mt-0.5 opacity-80">{v.concern}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Supply chain propagation
// ─────────────────────────────────────────────────────────────────────────────

const SC_RISK_CLS: Record<string, string> = {
  low: "bg-green/10 text-green border-green/20",
  medium: "bg-amber/10 text-amber border-amber/20",
  high: "bg-red/10 text-red border-red/20",
};

function SupplyChainPanel({ risks }: { risks: EsgRiskResult["supplyChainRisks"] }) {
  if (!risks.length) return null;
  return (
    <div className="bg-bg-panel border border-hair-2 rounded-lg p-5">
      <div className="flex items-center gap-2 mb-4">
        <span className="text-16">🔗</span>
        <h3 className="text-13 font-semibold text-ink-0">Supply Chain ESG</h3>
        <span className="text-11 text-ink-3">Upstream risk propagation</span>
      </div>
      <div className="space-y-2">
        {risks.map((r, i) => (
          <div key={i} className="flex items-start gap-3">
            <span className={`text-10 font-semibold px-2 py-0.5 rounded border capitalize shrink-0 ${SC_RISK_CLS[r.riskLevel] ?? SC_RISK_CLS.medium}`}>
              {r.riskLevel}
            </span>
            <div>
              <span className="text-12 font-medium text-ink-0">{r.country}</span>
              <span className="text-11 text-ink-3 ml-2">{r.concern}</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Historical trend
// ─────────────────────────────────────────────────────────────────────────────

function HistoryPanel({ history }: { history: HistoryEntry[] }) {
  if (!history.length) return null;
  const ML_DOT: Record<MlRiskLevel, string> = { low: "bg-green", medium: "bg-amber", high: "bg-red" };
  return (
    <div className="bg-bg-panel border border-hair-2 rounded-lg p-5">
      <div className="flex items-center gap-2 mb-3">
        <span className="text-16">📈</span>
        <h3 className="text-13 font-semibold text-ink-0">Rating History</h3>
        <span className="text-11 text-ink-3">Last {history.length} assessment{history.length !== 1 ? "s" : ""}</span>
      </div>
      <div className="space-y-1.5">
        {history.map((h, i) => (
          <div key={i} className="flex items-center gap-3">
            <span className={`text-11 font-mono font-bold w-10 ${scoreTextColor(h.score)}`}>{h.score}</span>
            <div className="flex-1 h-1.5 bg-bg-2 rounded-full overflow-hidden">
              <div className={`h-full rounded-full ${scoreColor(h.score)}`} style={{ width: `${h.score}%` }} />
            </div>
            <span className={`text-9 font-bold w-8 ${scoreTextColor(h.score)}`}>{h.rating}</span>
            <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${ML_DOT[h.mlRisk]}`} />
            <span className="text-10 text-ink-2 truncate max-w-28">{h.entity}</span>
            <span className="text-9 text-ink-3 shrink-0">{new Date(h.ratedAt).toLocaleDateString("en-GB")}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// CSV import parser
// ─────────────────────────────────────────────────────────────────────────────

function parseCsvRow(line: string): string[] {
  const result: string[] = [];
  let cur = "";
  let inQ = false;
  for (const ch of line) {
    if (ch === '"') { inQ = !inQ; continue; }
    if (ch === "," && !inQ) { result.push(cur.trim()); cur = ""; continue; }
    cur += ch;
  }
  result.push(cur.trim());
  return result;
}

function AccordionItem({ title, children }: { title: string; children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="border border-hair-2 rounded-lg overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center justify-between px-4 py-3 bg-bg-1 text-12.5 font-medium text-ink-0 hover:bg-bg-2 transition-colors text-left"
      >
        {title}
        <span className="text-10 text-ink-3">{open ? "▲" : "▼"}</span>
      </button>
      {open && <div className="px-4 py-3 bg-bg-panel">{children}</div>}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Form
// ─────────────────────────────────────────────────────────────────────────────

const EMPTY_FORM: FormData = {
  entity: "",
  sector: "",
  jurisdiction: "",
  operations: "",
  supplierCountries: "",
  employeeCount: "",
  notes: "",
};

const SECTOR_OPTIONS = [
  "Precious Metals & Stones",
  "Financial Services",
  "Real Estate",
  "Mining & Extractives",
  "Manufacturing",
  "Trading & Distribution",
  "Technology",
  "Energy",
  "Agriculture",
  "Construction",
  "Other",
];

const JURISDICTION_OPTIONS = [
  "UAE",
  "United Kingdom",
  "United States",
  "Switzerland",
  "Singapore",
  "Hong Kong",
  "Cayman Islands",
  "BVI",
  "Luxembourg",
  "Germany",
  "France",
  "Netherlands",
  "Other",
];

// ─────────────────────────────────────────────────────────────────────────────
// KPIs
// ─────────────────────────────────────────────────────────────────────────────

const KPIS = [
  { value: "12", label: "Entities Rated" },
  { value: "3", label: "Critical ESG Alerts", tone: "red" as const },
  { value: "28", label: "Regulatory Exposures", tone: "amber" as const },
  { value: "5", label: "ML-Linked ESG Risks" },
];

// ─────────────────────────────────────────────────────────────────────────────
// Page
// ─────────────────────────────────────────────────────────────────────────────

export default function EsgRiskPage() {
  const [form, setForm] = useState<FormData>(EMPTY_FORM);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<EsgRiskResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const [csvError, setCsvError] = useState<string | null>(null);
  const [csvQueue, setCsvQueue] = useState<string[] | null>(null); // entity names pending batch run
  const fileInputRef = useRef<HTMLInputElement>(null);

  const mountedRef = useRef(true);
  useEffect(() => () => { mountedRef.current = false; }, []);
  useEffect(() => { setHistory(loadHistory()); }, []);

  const setField = <K extends keyof FormData>(key: K, val: FormData[K]) => {
    setForm((f) => ({ ...f, [key]: val }));
  };

  const generate = async () => {
    if (!form.entity.trim()) {
      setError("Please enter an entity name.");
      return;
    }
    setError(null);
    setLoading(true);
    setResult(null);
    try {
      const res = await fetch("/api/esg-risk", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          entity: form.entity.trim(),
          sector: form.sector,
          jurisdiction: form.jurisdiction,
          operations: form.operations,
          supplierCountries: form.supplierCountries
            .split(",")
            .map((s) => s.trim())
            .filter(Boolean),
          employeeCount: form.employeeCount ? parseInt(form.employeeCount, 10) : undefined,
          notes: form.notes || undefined,
        }),
        signal: AbortSignal.timeout(60_000),
      });
      // Read the body once as text — Netlify 502s return HTML, not JSON. We
      // surface a clean error in that case rather than letting the user see
      // a raw "Unexpected token '<'" SyntaxError.
      const raw = await res.text().catch(() => "");
      const isHtml = raw.trimStart().toLowerCase().startsWith("<");
      if (!mountedRef.current) return;
      if (!res.ok || isHtml) {
        const detail = isHtml
          ? `Server returned HTML (HTTP ${res.status}) — likely a Netlify 502 / function timeout. Please retry; if it persists, set ANTHROPIC_API_KEY in the deployment.`
          : raw.slice(0, 240) || apiErrorMessage(res.status, "ESG scorer");
        setError(`ESG scorer unavailable: ${detail}`);
        return;
      }
      let data: EsgRiskResult;
      try { data = JSON.parse(raw) as EsgRiskResult; }
      catch { setError("ESG scorer returned a malformed response. Please retry."); return; }
      setResult(data);
      appendHistory({ entity: form.entity.trim(), score: data.overallEsgScore, rating: data.esgRating, mlRisk: data.mlRiskOverlay.overallMlRisk, ratedAt: new Date().toISOString() });
      setHistory(loadHistory());
    } catch (e) {
      const isTimeout = e instanceof Error && (e.name === "AbortError" || e.name === "TimeoutError");
      if (mountedRef.current) setError(isTimeout
        ? "ESG scorer timed out after 60s — please retry."
        : caughtErrorMessage(e, "Request failed — please retry"));
    } finally {
      if (mountedRef.current) setLoading(false);
    }
  };

  const ratingStyle = result ? ESG_RATING_STYLES[result.esgRating] : null;
  const mlStyle = result ? ML_RISK_STYLES[result.mlRiskOverlay.overallMlRisk] : null;

  // Pre-fill a representative ESG entity so the operator can demo the
  // scoring pipeline without typing — moved out of the inline JSX so the
  // sidebarActions handler stays a one-liner.
  const fillSampleEntity = () => {
    setField("entity", "Meridian Resources Ltd");
    setField("sector", "mining");
    setField("jurisdiction", "GH");
    setField("employeeCount", "850");
    setField(
      "operations",
      "Gold mining and refining operations across West Africa, with downstream LBMA-accredited refinery in Dubai. Tier-1 suppliers include artisanal mining cooperatives in DRC and Ghana.",
    );
    setField("supplierCountries", "Ghana, DRC, Mali, Burkina Faso");
    setField(
      "notes",
      "Recent CAHRA exposure flagged in 2024 conflict-minerals audit; remediation plan in progress.",
    );
  };

  const aiSuggestEntity = async () => {
    setError(null);
    try {
      const res = await fetch("/api/mlro-advisor-quick", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          question:
            "Suggest a representative high-risk ESG entity profile to assess. Return ONLY a JSON object with fields: entityName, sector, jurisdiction (ISO-2), employeeCount (number), operations (string, 2 sentences), supplierCountries (comma-separated string), notes (string).",
          redTeamMode: false,
        }),
      });
      const data = (await res.json().catch(() => ({}))) as {
        answer?: string; message?: string; error?: string;
      };
      if (!res.ok) {
        if (!mountedRef.current) return;
        throw new Error(data.error ?? apiErrorMessage(res.status, "AI suggest"));
      }
      if (!mountedRef.current) return;
      const text = data.answer ?? data.message ?? "";
      const jsonMatch = text.match(/\{[\s\S]*\}/);
      if (!jsonMatch) return;
      const parsed = JSON.parse(jsonMatch[0]) as Record<string, string | number>;
      const entityVal = parsed.entityName ?? parsed.entity;
      if (entityVal) setField("entity", String(entityVal));
      if (parsed.sector) setField("sector", String(parsed.sector).toLowerCase());
      if (parsed.jurisdiction) setField("jurisdiction", String(parsed.jurisdiction).toUpperCase());
      if (parsed.employeeCount) setField("employeeCount", String(parsed.employeeCount));
      if (parsed.operations) setField("operations", String(parsed.operations));
      if (parsed.supplierCountries) setField("supplierCountries", String(parsed.supplierCountries));
      if (parsed.notes) setField("notes", String(parsed.notes));
    } catch (err) {
      if (mountedRef.current) setError(caughtErrorMessage(err, "AI suggest failed — please retry"));
    }
  };

  return (
    <ModuleLayout
      asanaModule="esg-risk"
      asanaLabel="ESG Risk"
      engineLabel="ESG risk engine"
      onRun={() => void generate()}
      onSync={() => void generate()}
      sidebarActions={
        <>
          <ActionButton
            variant="add"
            type="button"
            onClick={fillSampleEntity}
            title="Pre-fill with a sample entity profile"
          >
            + Add
          </ActionButton>
          <ActionButton
            variant="ai"
            type="button"
            onClick={() => void aiSuggestEntity()}
            disabled={loading}
            title="AI-suggest a representative entity profile"
          >
            ✨ AI
          </ActionButton>
          <ActionButton
            variant="import"
            type="button"
            onClick={() => fileInputRef.current?.click()}
            title="Import entities from CSV (entityName column required)"
          >
            📥 CSV Import
          </ActionButton>
        </>
      }
    >
      <ModuleHero

        eyebrow=""
        title="ESG"
        titleEm="risk."
        kpis={KPIS}
        intro="AI-powered ESG scoring with money laundering risk overlay — maps environmental, social, and governance failures to financial crime exposure under FATF, UAE FDL, and international ESG frameworks."
      />

      {/* CSV import */}
      <input
        ref={fileInputRef}
        type="file"
        accept=".csv,text/csv"
        className="hidden"
        onChange={(e) => {
          setCsvError(null);
          const file = e.target.files?.[0];
          if (!file) return;
          const reader = new FileReader();
          reader.onload = (ev) => {
            const text = ev.target?.result as string;
            const lines = text.split("\n").map((l) => l.trim()).filter(Boolean);
            if (!lines.length) { setCsvError("CSV file is empty."); return; }
            // Expect header row: entityName,sector,jurisdiction,...
            const header = parseCsvRow(lines[0]!.toLowerCase());
            const nameIdx = header.indexOf("entityname") !== -1 ? header.indexOf("entityname") : header.indexOf("entity");
            if (nameIdx === -1) { setCsvError("CSV must have an 'entityName' column."); return; }
            const names = lines.slice(1).map((l) => parseCsvRow(l)[nameIdx]?.trim()).filter(Boolean) as string[];
            if (!names.length) { setCsvError("No entity rows found in CSV."); return; }
            setCsvQueue(names);
            // Pre-fill first entity from CSV
            setField("entity", names[0]!);
          };
          reader.readAsText(file);
          // Reset so same file can be re-imported
          e.target.value = "";
        }}
      />

      {/* Quick-action buttons — + Add / ✨ AI / 📥 CSV Import moved to sidebar Actions.
          Only the conditional Export-PDF action remains inline because it
          depends on the in-page result render position. */}
      <div className="flex items-center gap-3 mb-4 flex-wrap">
        {result && (
          <button
            type="button"
            onClick={() => window.print()}
            className="px-4 py-2 rounded-lg border-2 border-hair-1 bg-bg-1 text-ink-2 text-13 font-semibold hover:bg-bg-2 whitespace-nowrap transition-colors"
            title="Export ESG report to PDF via browser print"
          >
            📄 Export PDF
          </button>
        )}
      </div>

      {/* CSV queue banner */}
      {csvQueue && csvQueue.length > 0 && (
        <div className="mb-4 px-4 py-2.5 bg-brand/10 border border-brand/30 rounded-lg flex items-center justify-between gap-3">
          <span className="text-12 text-ink-0">
            CSV imported · <strong>{csvQueue.length}</strong> entit{csvQueue.length === 1 ? "y" : "ies"} queued — run score for each in sequence
          </span>
          <button type="button" onClick={() => setCsvQueue(null)} className="text-10 text-ink-3 hover:text-ink-0">✕</button>
        </div>
      )}
      {csvError && (
        <div className="mb-4 px-3 py-2 bg-red/10 border border-red/20 rounded text-12 text-red">{csvError}</div>
      )}

      {/* Input Form */}
      <div className="bg-bg-panel border border-hair-2 rounded-lg p-6 mb-6">
        <h2 className="text-14 font-semibold text-ink-0 mb-4">Entity Details</h2>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
          <div>
            <label className="block text-11 font-mono uppercase tracking-wide-3 text-ink-3 mb-1">
              Entity Name *
            </label>
            <input
              placeholder="e.g. Meridian Resources Ltd"
              value={form.entity}
              onChange={(e) => setField("entity", e.target.value)}
              className="w-full bg-bg-1 border border-hair-2 rounded-lg px-3 py-2 text-13 text-ink-0 outline-none focus:border-brand"
            />
          </div>
          <div>
            <label className="block text-11 font-mono uppercase tracking-wide-3 text-ink-3 mb-1">
              Sector
            </label>
            <select
              value={form.sector}
              onChange={(e) => setField("sector", e.target.value)}
              className="w-full bg-bg-1 border border-hair-2 rounded-lg px-3 py-2 text-13 text-ink-0 outline-none focus:border-brand"
            >
              <option value="">Select sector...</option>
              {SECTOR_OPTIONS.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-11 font-mono uppercase tracking-wide-3 text-ink-3 mb-1">
              Primary Jurisdiction
            </label>
            <select
              value={form.jurisdiction}
              onChange={(e) => setField("jurisdiction", e.target.value)}
              className="w-full bg-bg-1 border border-hair-2 rounded-lg px-3 py-2 text-13 text-ink-0 outline-none focus:border-brand"
            >
              <option value="">Select jurisdiction...</option>
              {JURISDICTION_OPTIONS.map((j) => (
                <option key={j} value={j}>
                  {j}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-11 font-mono uppercase tracking-wide-3 text-ink-3 mb-1">
              Employee Count
            </label>
            <input
              type="text"
              inputMode="numeric"
              placeholder="e.g. 250"
              value={form.employeeCount}
              onChange={(e) => setField("employeeCount", e.target.value.replace(/[^0-9]/g, ""))}
              className="w-full bg-bg-1 border border-hair-2 rounded-lg px-3 py-2 text-13 text-ink-0 outline-none focus:border-brand"
            />
          </div>
        </div>

        <div className="mb-4">
          <label className="block text-11 font-mono uppercase tracking-wide-3 text-ink-3 mb-1">
            Operations Description
          </label>
          <textarea
            rows={3}
            placeholder="Describe the entity's operations, products, services, and supply chain..."
            value={form.operations}
            onChange={(e) => setField("operations", e.target.value)}
            className="w-full bg-bg-1 border border-hair-2 rounded-lg px-3 py-2 text-13 text-ink-0 outline-none focus:border-brand resize-none"
          />
        </div>

        <div className="mb-4">
          <label className="block text-11 font-mono uppercase tracking-wide-3 text-ink-3 mb-1">
            Supplier Countries (comma-separated)
          </label>
          <input
            placeholder="e.g. Ghana, DRC, Kazakhstan, India"
            value={form.supplierCountries}
            onChange={(e) => setField("supplierCountries", e.target.value)}
            className="w-full bg-bg-1 border border-hair-2 rounded-lg px-3 py-2 text-13 text-ink-0 outline-none focus:border-brand"
          />
        </div>

        <div className="mb-5">
          <label className="block text-11 font-mono uppercase tracking-wide-3 text-ink-3 mb-1">
            Notes
          </label>
          <textarea
            rows={2}
            placeholder="Any additional notes or context..."
            value={form.notes}
            onChange={(e) => setField("notes", e.target.value)}
            className="w-full bg-bg-1 border border-hair-2 rounded-lg px-3 py-2 text-13 text-ink-0 outline-none focus:border-brand resize-none"
          />
        </div>

        {error && (
          <div className="mb-4 px-3 py-2 bg-red/10 border border-red/20 rounded text-12 text-red">
            {error}
          </div>
        )}

        <button
          type="button"
          onClick={() => void generate()}
          disabled={loading}
          className="w-full py-3 rounded-lg bg-brand text-white text-13 font-semibold hover:bg-brand/90 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {loading ? "Generating ESG Score with Claude..." : "📊 Generate ESG Score"}
        </button>
      </div>

      {/* Results */}
      {result && ratingStyle && mlStyle && (
        <div className="space-y-5">
          {/* Rating Hero */}
          <div className={`rounded-xl border-2 p-6 ${ratingStyle.bg}`}>
            <div className="flex items-center gap-6">
              <div className="text-center">
                <div className={`text-72 font-display font-bold leading-none ${ratingStyle.text}`}>
                  {result.esgRating}
                </div>
                <div className={`text-12 font-semibold mt-1 ${ratingStyle.text}`}>
                  {ESG_RATING_STYLES[result.esgRating].label}
                </div>
              </div>
              <div className="flex-1">
                <div className="flex items-center gap-3 mb-2">
                  <span className="text-13 font-medium text-ink-0">Overall ESG Score</span>
                  <span className={`text-24 font-display font-semibold ${scoreTextColor(result.overallEsgScore)}`}>
                    {result.overallEsgScore}
                    <span className="text-13 text-ink-3 font-mono">/100</span>
                  </span>
                </div>
                <ScoreBar score={result.overallEsgScore} />
                <div className="mt-3 flex items-center gap-2">
                  <span className="text-11 text-ink-3">ML Risk Overlay:</span>
                  <span
                    className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-11 font-semibold border ${mlStyle.badge}`}
                  >
                    <span className={`w-1.5 h-1.5 rounded-full ${mlStyle.dot}`} />
                    {result.mlRiskOverlay.overallMlRisk.toUpperCase()} ML RISK
                  </span>
                </div>
              </div>
            </div>
          </div>

          {/* E / S / G Dimension Cards */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <DimensionCard
              icon="🌍"
              label="Environmental"
              score={result.dimensions.environmental.score}
              risks={result.dimensions.environmental.risks}
              opportunities={result.dimensions.environmental.opportunities}
            />
            <DimensionCard
              icon="👥"
              label="Social"
              score={result.dimensions.social.score}
              risks={result.dimensions.social.risks}
              opportunities={result.dimensions.social.opportunities}
            />
            <DimensionCard
              icon="⚖️"
              label="Governance"
              score={result.dimensions.governance.score}
              risks={result.dimensions.governance.risks}
              opportunities={result.dimensions.governance.opportunities}
            />
          </div>

          {/* ML Risk Overlay */}
          <div className="bg-bg-panel border border-hair-2 rounded-lg p-5">
            <div className="flex items-center gap-2 mb-4">
              <span className="text-16">🔗</span>
              <h3 className="text-13 font-semibold text-ink-0">ML Risk Overlay</h3>
              <span className="text-11 text-ink-3">
                How ESG failures translate into money laundering risk
              </span>
            </div>
            <div className="space-y-4">
              <div>
                <div className="text-11 font-mono uppercase tracking-wide-3 text-green mb-1">
                  Environmental Crime Linkage
                </div>
                <p className="text-12.5 text-ink-1 leading-relaxed">
                  {result.mlRiskOverlay.environmentalCrimeLinkage}
                </p>
              </div>
              <div className="border-t border-hair pt-4">
                <div className="text-11 font-mono uppercase tracking-wide-3 text-orange mb-1">
                  Labour Exploitation Risk
                </div>
                <p className="text-12.5 text-ink-1 leading-relaxed">
                  {result.mlRiskOverlay.laborExploitationRisk}
                </p>
              </div>
              <div className="border-t border-hair pt-4">
                <div className="text-11 font-mono uppercase tracking-wide-3 text-amber mb-1">
                  Corruption Risk
                </div>
                <p className="text-12.5 text-ink-1 leading-relaxed">
                  {result.mlRiskOverlay.corruptionRisk}
                </p>
              </div>
            </div>
          </div>

          {/* Red Flags */}
          {result.redFlags.length > 0 && (
            <div className="bg-red/5 border border-red/20 rounded-lg p-5">
              <div className="flex items-center gap-2 mb-3">
                <span className="text-16">🚩</span>
                <h3 className="text-13 font-semibold text-red">Red Flags</h3>
              </div>
              <ul className="space-y-2">
                {result.redFlags.map((f, i) => (
                  <li key={i} className="flex items-start gap-2">
                    <span className="text-red font-mono text-12 mt-0.5 shrink-0">✕</span>
                    <span className="text-12.5 text-ink-0">{f}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Regulatory Exposure (Accordion) */}
          {result.regulatoryExposure.length > 0 && (
            <div className="bg-bg-panel border border-hair-2 rounded-lg p-5">
              <div className="flex items-center gap-2 mb-4">
                <span className="text-16">📋</span>
                <h3 className="text-13 font-semibold text-ink-0">Regulatory Exposure</h3>
              </div>
              <div className="space-y-2">
                {result.regulatoryExposure.map((reg, i) => (
                  <AccordionItem key={i} title={`${reg.regulation} · ${reg.jurisdiction}`}>
                    <div className="text-12 text-ink-1">{reg.compliance}</div>
                  </AccordionItem>
                ))}
              </div>
            </div>
          )}

          {/* Sector Benchmark */}
          {result.sectorBenchmark && (
            <SectorBenchmarkBar
              entityScore={result.overallEsgScore}
              sectorAvg={result.sectorBenchmark.sectorAvgScore}
              entityVsAvg={result.sectorBenchmark.entityVsAvg}
              percentile={result.sectorBenchmark.percentile}
            />
          )}

          {/* FATF Typology Bridge */}
          <FatfTypologyBridge typologies={result.fatfTypologies ?? []} />

          {/* UN SDG Violations */}
          <SdgViolationsPanel violations={result.sdgViolations ?? []} />

          {/* Supply Chain ESG */}
          <SupplyChainPanel risks={result.supplyChainRisks ?? []} />

          {/* Recommendation */}
          <div className="bg-amber/5 border border-amber/20 rounded-lg p-5">
            <div className="text-11 font-semibold text-amber mb-1">Recommendation</div>
            <p className="text-13 text-ink-0">{result.recommendation}</p>
          </div>

          {/* Summary */}
          <div className="bg-bg-panel border border-hair-2 rounded-lg p-5">
            <div className="text-11 font-semibold text-ink-0 mb-1">Executive Summary</div>
            <p className="text-13 text-ink-1 leading-relaxed">{result.summary}</p>
          </div>
        </div>
      )}
      {/* Rating history (session + localStorage) */}
      <HistoryPanel history={history} />

    </ModuleLayout>
  );
}
