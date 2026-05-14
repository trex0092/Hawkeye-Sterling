"use client";

import { ModuleHero, ModuleLayout } from "@/components/layout/ModuleLayout";

function Section({ children }: { children: React.ReactNode }) {
  return (
    <div className="bg-panel border border-hair-2 rounded-xl p-5 mb-5">
      {children}
    </div>
  );
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <div className="font-mono text-11 font-semibold uppercase tracking-wide-4 text-ink-2 mb-4">
      {children}
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex gap-3 mb-2 text-13 leading-relaxed">
      <span className="text-ink-2 min-w-[200px] shrink-0">{label}</span>
      <span className="text-ink-0">{children}</span>
    </div>
  );
}

function ListItem({ children, tone = "neutral" }: { children: React.ReactNode; tone?: "green" | "red" | "amber" | "neutral" }) {
  const cls = tone === "green" ? "text-green" : tone === "red" ? "text-red" : tone === "amber" ? "text-amber" : "text-ink-0";
  return <div className={`text-13 mb-1.5 pl-4 relative leading-relaxed ${cls}`}>{children}</div>;
}

export default function SystemCardPage() {
  return (
    <ModuleLayout>
      <ModuleHero
        eyebrow="AI Governance"
        title="System Card"
        intro="Public disclosure document for Hawkeye Sterling as required by ISO/IEC 42001, EU AI Act Art.13, and UAE AI Governance guidelines."
      />

      {/* Identity */}
      <Section>
        <SectionTitle>AI System Identity</SectionTitle>
        <Field label="System name">Hawkeye Sterling</Field>
        <Field label="System type">Agentic AI Compliance Platform</Field>
        <Field label="Deployment context">AML/CFT/CPF compliance screening for UAE-licensed DPMS (Designated Non-Financial Business and Professions)</Field>
        <Field label="AI risk classification">
          <span className="inline-flex items-center gap-2">
            <span className="bg-red/10 border border-red/40 text-red rounded px-2 py-0.5 text-11 font-semibold font-mono">HIGH RISK</span>
            <span className="text-ink-1">— automated decisions affecting access to financial services (EU AI Act Annex III)</span>
          </span>
        </Field>
        <Field label="Primary model">Claude (Anthropic) — wave-5 brain configuration</Field>
        <Field label="MCP server version">2.0.0 — 24 tools (Section A refactor merged 14 tools → 7 composite; total surface reduced from 28)</Field>
        <Field label="Governing law">UAE Federal Decree-Law No.(10) of 2025 · CR No.134/2025 · UAE PDPL · ISO/IEC 42001</Field>
        <Field label="Regulatory disclosure">This system is an AI tool. All outputs require human MLRO review before any compliance action is taken.</Field>
      </Section>

      {/* Purpose */}
      <Section>
        <SectionTitle>Purpose and Authorised Use</SectionTitle>
        <Field label="Primary purpose">Automated sanctions screening, PEP detection, adverse media analysis, and compliance reporting for UAE DPMS entities</Field>
        <Field label="Authorised use cases">
          <div>
            {[
              "Sanctions list matching (OFAC, EU, UK, UAE, UN, CA, AU, JP, CH)",
              "Politically Exposed Person (PEP) detection and EDD initiation",
              "Adverse media analysis and GDELT live-feed lookback",
              "SAR/STR narrative generation (draft — not filed automatically)",
              "Compliance report generation for MLRO review",
              "Transaction anomaly detection and typology matching",
              "AI-assisted MLRO advisory (executor / advisor / challenger modes)",
            ].map(u => <ListItem key={u} tone="neutral">• {u}</ListItem>)}
          </div>
        </Field>
        <Field label="Out-of-scope uses">
          <div>
            {[
              "Final criminal referral decisions",
              "Autonomous customer communication",
              "Court submissions or legal filings",
              "Autonomous fund freezing without MLRO sign-off",
              "Consumer credit or insurance scoring",
            ].map(u => <ListItem key={u} tone="red">✗ {u}</ListItem>)}
          </div>
        </Field>
      </Section>

      {/* Data sources */}
      <Section>
        <SectionTitle>Data Sources</SectionTitle>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {[
            { name: "OFAC SDN", type: "Sanctions", frequency: "Daily cron (03:00 UTC)", coverage: "US primary sanctions" },
            { name: "EU Consolidated List", type: "Sanctions", frequency: "Daily cron", coverage: "EU targeted sanctions" },
            { name: "UK OFSI", type: "Sanctions", frequency: "Daily cron", coverage: "UK sanctions" },
            { name: "UN Consolidated", type: "Sanctions", frequency: "Daily cron", coverage: "UN 1267 + 1988" },
            { name: "UAE EOCN + LTL", type: "Sanctions", frequency: "Daily cron", coverage: "UAE domestic lists" },
            { name: "GDELT Project API", type: "Adverse media", frequency: "Per request", coverage: "10-year global news lookback" },
            { name: "Google News RSS", type: "News", frequency: "Per request", coverage: "7 locales, real-time" },
            { name: "OpenSanctions API", type: "PEP + Sanctions", frequency: "Per request", coverage: "1,400+ global sources" },
          ].map(d => (
            <div key={d.name} className="bg-bg-1 border border-hair rounded-lg px-4 py-3">
              <div className="font-semibold text-ink-0 text-13 mb-1">{d.name}</div>
              <div className="text-11 text-ink-2">{d.type} · {d.frequency}</div>
              <div className="text-11 text-ink-2 mt-0.5">{d.coverage}</div>
            </div>
          ))}
        </div>
      </Section>

      {/* Capabilities and limitations */}
      <Section>
        <SectionTitle>Capabilities and Known Limitations</SectionTitle>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div>
            <div className="text-12 font-semibold font-mono uppercase tracking-wide-4 text-green mb-3">Capabilities</div>
            {[
              "Screens against 11 primary sanctions lists (UN, OFAC SDN, OFAC Consolidated, EU, UK OFSI, CA OSFI, CH SECO, AU DFAT, JP MOF, UAE EOCN, UAE LTL) backstopped by 11 parallel LSEG CFS supplements covering the same regimes",
              "PEP screening across static curated corpus + OpenSanctions live + LSEG CFS World-Check bulk index",
              "Adverse media: GDELT 10-year lookback with tone scoring + LSEG CFS adverse-categorised index across 16 categories (money laundering, terrorism financing, fraud, corruption, narcotics, trafficking, organised crime, cybercrime, environmental crime, weapons proliferation, modern slavery, regulatory enforcement, litigation, tax evasion, sanctions evasion, financial crime)",
              "PII-guarded Anthropic client wraps every LLM call (sync + Batches API) — redaction in, rehydration out",
              "Detects Tier 1–4 PEPs with role history and network mapping",
              "GoAML-compatible SAR/STR XML generation (draft only)",
              "132 machine-enforceable compliance directives",
              "HMAC-signed immutable audit trail with build-time SHA in every provenance block",
              "Arabic, Cyrillic, and CJK phonetic name matching",
            ].map(c => <ListItem key={c} tone="neutral">✓ {c}</ListItem>)}
          </div>
          <div>
            <div className="text-12 font-semibold font-mono uppercase tracking-wide-4 text-amber mb-3">Known Limitations</div>
            {[
              "Vessel screening (IMO lookup, flag-state, ownership) not configured — Equasis ToS forbid programmatic access; commercial provider (Datalastic, Lloyd's, Marine Traffic) required",
              "Crypto on-chain risk requires CHAINALYSIS or similar (not configured)",
              "GDELT cache survives cold starts only when Upstash Redis is configured (UPSTASH_REDIS_REST_URL)",
              "LSEG CFS supplements depend on the 6-hour CFS poll cron + a successful /api/admin/import-cfs run — re-import after each fileset refresh to keep the supplement current",
              "Confidence scores are AI-derived estimates — not statistical certainty",
              "All supervised outputs require MLRO human review before action",
              "Not a substitute for legal advice or law enforcement referral",
            ].map(l => <ListItem key={l} tone="amber">⚠ {l}</ListItem>)}
          </div>
        </div>
      </Section>

      {/* Safeguards */}
      <Section>
        <SectionTitle>Technical Safeguards Implemented</SectionTitle>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {[
            { name: "Kill switch", detail: "MCP_ENABLED env var — disables all 24 tools instantly, no redeploy", control: "2.08/14.03" },
            { name: "Tool risk manifest", detail: "All 24 tools classified: read-only / supervised / action", control: "1.01/1.05" },
            { name: "MCP activity log", detail: "Every tool call logged to Netlify Blobs with full audit trail", control: "21.02" },
            { name: "Operator console", detail: "/operator — filterable activity log, CSV export, live stats", control: "29.04" },
            { name: "Rate limiting", detail: "Per-tool-class call limits: read-only 120/min, supervised 40/min, action 10/min", control: "20.06" },
            { name: "Circuit breakers", detail: "Auto-trip after 5 consecutive failures; reset after 60s", control: "20.02" },
            { name: "Per-class timeouts", detail: "read-only 15s · supervised 45s · action 55s", control: "2.03" },
            { name: "Prompt injection detection", detail: "Scans all tool inputs for injection patterns; blocks and logs", control: "13.03" },
            { name: "Confidence scores", detail: "All supervised outputs include confidenceScore + humanReviewRequired flag", control: "2.05" },
            { name: "Data provenance", detail: "All supervised outputs include _provenance: tool, version, sources, timestamp", control: "12.04" },
            { name: "Anomaly detection", detail: "Alerts when session exceeds 50 calls/5min or 5 action-level calls/5min", control: "21.08" },
            { name: "HMAC audit trail", detail: "Tamper-evident chain for all screening decisions", control: "12.03" },
          ].map(s => (
            <div key={s.name} className="bg-bg-1 border border-hair rounded-lg px-4 py-3">
              <div className="font-semibold text-green text-12 mb-1">{s.name}</div>
              <div className="text-11 text-ink-0 mb-1">{s.detail}</div>
              <div className="text-10 text-ink-2 font-mono">Control {s.control}</div>
            </div>
          ))}
        </div>
      </Section>

      {/* Human oversight */}
      <Section>
        <SectionTitle>Human Oversight Requirements</SectionTitle>
        <div className="mb-4">
          <div className="text-13 font-semibold text-amber mb-2">Where Hawkeye Sterling acts WITHOUT human review:</div>
          {["Sanctions list matching (exact match)", "System health monitoring", "Data retrieval (read-only tools)", "Error and anomaly logging"].map(i => (
            <ListItem key={i} tone="neutral">• {i}</ListItem>
          ))}
        </div>
        <div className="mb-4">
          <div className="text-13 font-semibold text-red mb-2">Where a human MLRO MUST intervene before action:</div>
          {[
            "SAR/STR filing decisions (GoAML portal — separate human step required)",
            "Sanctions freeze actions",
            "EDD escalation decisions",
            "PEP relationship approval or rejection",
            "Any action with legal consequence for a third party",
            "All disposition and mlro_analyze outputs",
          ].map(i => <ListItem key={i} tone="red">✗ {i}</ListItem>)}
        </div>
        <Field label="MLRO accountability">All compliance decisions made using Hawkeye Sterling outputs remain the legal responsibility of the human MLRO. Hawkeye Sterling is a tool. It does not bear legal or moral responsibility.</Field>
        <Field label="Human override">Any MLRO may override, reject, or disregard any Hawkeye Sterling output at any time without restriction.</Field>
      </Section>

      {/* Regulatory */}
      <Section>
        <SectionTitle>Regulatory Compliance Basis</SectionTitle>
        {[
          { reg: "UAE FDL No.(10) of 2025", scope: "Primary AML/CFT/CPF law — Art.14 (PEP EDD), Art.19 (adverse media lookback), Art.32 (SAR filing)" },
          { reg: "CR No.134/2025", scope: "Executive Regulations — Art.12 (UBO 25% threshold), Art.18 (MLRO review before case action), Art.28 (sanctions screening)" },
          { reg: "MoE Circulars No.3/2025 + No.6/2025", scope: "DPMS-specific obligations — real-time sanctions screening, record retention, FIU reporting" },
          { reg: "FATF Recommendations R.6, R.10, R.12", scope: "Targeted financial sanctions, CDD, PEP Enhanced Due Diligence" },
          { reg: "ISO/IEC 42001:2023", scope: "AI Management System — risk assessment, controls, monitoring, continual improvement" },
          { reg: "EU AI Act (Reg. 2024/1689)", scope: "High-risk AI system disclosure obligations (if EU persons screened)" },
          { reg: "UAE PDPL", scope: "Personal data of screened individuals — access, purpose limitation, residency" },
        ].map(r => (
          <div key={r.reg} className="flex gap-3 pb-2 mb-2 border-b border-hair last:border-0 last:mb-0 last:pb-0">
            <span className="text-blue text-13 font-semibold min-w-[200px] shrink-0">{r.reg}</span>
            <span className="text-ink-1 text-12 leading-relaxed">{r.scope}</span>
          </div>
        ))}
      </Section>

      {/* Contact */}
      <Section>
        <SectionTitle>Queries, Complaints, and Oversight</SectionTitle>
        <Field label="AI system accountable role">MLRO / Compliance Officer</Field>
        <Field label="Complaint mechanism">Submit via the GoAML portal or contact the UAE Financial Intelligence Unit (FIU) for concerns about automated screening decisions affecting your entity.</Field>
        <Field label="Right to human review">Any individual or entity that believes they have been incorrectly screened may request a human MLRO review. Contact the MLRO directly.</Field>
        <Field label="Document version">v2.0 — {new Date().toLocaleDateString("en-GB", { timeZone: "Asia/Dubai" })}</Field>
      </Section>
    </ModuleLayout>
  );
}
