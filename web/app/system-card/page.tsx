"use client";

import { ModuleHero, ModuleLayout } from "@/components/layout/ModuleLayout";

const SECTION: React.CSSProperties = {
  background: "#1a1a2e",
  border: "1px solid #2a2a4a",
  borderRadius: 10,
  padding: "20px 24px",
  marginBottom: 20,
};
const H2: React.CSSProperties = { fontSize: 14, fontWeight: 700, color: "#ccd6f6", marginBottom: 12, textTransform: "uppercase", letterSpacing: 1 };
const ROW: React.CSSProperties = { display: "flex", gap: 8, marginBottom: 8, fontSize: 13 };
const LABEL: React.CSSProperties = { color: "#8892b0", minWidth: 200, flexShrink: 0 };
const VALUE: React.CSSProperties = { color: "#ccd6f6" };
const BADGE = (color: string): React.CSSProperties => ({
  background: `${color}22`, border: `1px solid ${color}`, borderRadius: 4,
  padding: "2px 8px", fontSize: 11, fontWeight: 700, color, display: "inline-block",
});
const LIST_ITEM: React.CSSProperties = { color: "#ccd6f6", fontSize: 13, marginBottom: 6, paddingLeft: 16, position: "relative" };

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={ROW}>
      <span style={LABEL}>{label}</span>
      <span style={VALUE}>{children}</span>
    </div>
  );
}

export default function SystemCardPage() {
  return (
    <ModuleLayout>
      <ModuleHero
        eyebrow="🗂 AI Governance"
        title="System Card"
        intro="Public disclosure document for Hawkeye Sterling V2 as required by ISO/IEC 42001, EU AI Act Art.13, and UAE AI Governance guidelines."
      />

      {/* Identity */}
      <div style={SECTION}>
        <div style={H2}>AI System Identity</div>
        <Field label="System name">Hawkeye Sterling V2</Field>
        <Field label="System type">Agentic AI Compliance Platform</Field>
        <Field label="Deploying organisation">Fine Gold LLC — Abu Dhabi, UAE</Field>
        <Field label="Deployment context">AML/CFT/CPF compliance screening for UAE-licensed DPMS (Designated Non-Financial Business and Professions)</Field>
        <Field label="AI risk classification"><span style={BADGE("#e74c3c")}>HIGH RISK</span> — automated decisions affecting access to financial services (EU AI Act Annex III)</Field>
        <Field label="Primary model">Claude (Anthropic) — wave-5 brain configuration</Field>
        <Field label="MCP server version">1.0.0 (28 tools)</Field>
        <Field label="Governing law">UAE Federal Decree-Law No.(10) of 2025 · CR No.134/2025 · UAE PDPL · ISO/IEC 42001</Field>
        <Field label="Regulatory disclosure">This system is an AI tool. All outputs require human MLRO review before any compliance action is taken.</Field>
      </div>

      {/* Purpose */}
      <div style={SECTION}>
        <div style={H2}>Purpose and Authorised Use</div>
        <Field label="Primary purpose">Automated sanctions screening, PEP detection, adverse media analysis, and compliance reporting for UAE DPMS entities</Field>
        <Field label="Authorised use cases">
          <div>
            {["Sanctions list matching (OFAC, EU, UK, UAE, UN, CA, AU, JP, CH)", "Politically Exposed Person (PEP) detection and EDD initiation", "Adverse media analysis and GDELT live-feed lookback", "SAR/STR narrative generation (draft — not filed automatically)", "Compliance report generation for MLRO review", "Transaction anomaly detection and typology matching", "AI-assisted MLRO advisory (executor / advisor / challenger modes)"].map(u => (
              <div key={u} style={LIST_ITEM}>• {u}</div>
            ))}
          </div>
        </Field>
        <Field label="Out-of-scope uses">
          <div>
            {["Final criminal referral decisions", "Autonomous customer communication", "Court submissions or legal filings", "Autonomous fund freezing without MLRO sign-off", "Consumer credit or insurance scoring"].map(u => (
              <div key={u} style={{ ...LIST_ITEM, color: "#e74c3c" }}>✗ {u}</div>
            ))}
          </div>
        </Field>
      </div>

      {/* Data sources */}
      <div style={SECTION}>
        <div style={H2}>Data Sources</div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
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
            <div key={d.name} style={{ background: "#0d1117", borderRadius: 6, padding: "10px 14px", border: "1px solid #2a2a4a" }}>
              <div style={{ fontWeight: 700, color: "#ccd6f6", fontSize: 13, marginBottom: 4 }}>{d.name}</div>
              <div style={{ fontSize: 11, color: "#8892b0" }}>{d.type} · {d.frequency}</div>
              <div style={{ fontSize: 11, color: "#8892b0", marginTop: 2 }}>{d.coverage}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Capabilities and limitations */}
      <div style={SECTION}>
        <div style={H2}>Capabilities and Known Limitations</div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
          <div>
            <div style={{ color: "#2ecc71", fontSize: 12, fontWeight: 700, marginBottom: 8 }}>CAPABILITIES</div>
            {["Screens against 7+ official sanctions lists covering UN, OFAC, EU, UK, UAE, CA, AU, JP, CH", "Detects Tier 1–4 PEPs with role history and network mapping", "GDELT 10-year adverse media lookback with tone scoring", "GoAML-compatible SAR/STR XML generation (draft only)", "132 machine-enforceable compliance directives", "HMAC-signed immutable audit trail", "Arabic, Cyrillic, and CJK phonetic name matching"].map(c => (
              <div key={c} style={LIST_ITEM}>✓ {c}</div>
            ))}
          </div>
          <div>
            <div style={{ color: "#e74c3c", fontSize: 12, fontWeight: 700, marginBottom: 8 }}>KNOWN LIMITATIONS</div>
            {["Adverse media coverage limited to English-primary GDELT articles", "PEP database contains ~6 seed entries (OpenSanctions API supplements this per-request)", "Commercial KYC vendors not configured — free-tier providers only", "Crypto on-chain risk requires CHAINALYSIS or similar (not configured)", "Confidence scores are AI-derived estimates — not statistical certainty", "All supervised outputs require MLRO human review before action", "Not a substitute for legal advice or law enforcement referral"].map(l => (
              <div key={l} style={{ ...LIST_ITEM, color: "#f39c12" }}>⚠ {l}</div>
            ))}
          </div>
        </div>
      </div>

      {/* Safeguards */}
      <div style={SECTION}>
        <div style={H2}>Technical Safeguards Implemented</div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8 }}>
          {[
            { name: "Kill switch", detail: "MCP_ENABLED env var — disables all 28 tools instantly, no redeploy", control: "2.08/14.03" },
            { name: "Tool risk manifest", detail: "All 28 tools classified: read-only / supervised / action", control: "1.01/1.05" },
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
            <div key={s.name} style={{ background: "#0d1117", borderRadius: 6, padding: "10px 14px", border: "1px solid #2a2a4a" }}>
              <div style={{ fontWeight: 700, color: "#2ecc71", fontSize: 12, marginBottom: 4 }}>{s.name}</div>
              <div style={{ fontSize: 11, color: "#ccd6f6", marginBottom: 4 }}>{s.detail}</div>
              <div style={{ fontSize: 10, color: "#8892b0" }}>Control {s.control}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Human oversight */}
      <div style={SECTION}>
        <div style={H2}>Human Oversight Requirements</div>
        <div style={{ marginBottom: 12 }}>
          <div style={{ color: "#f39c12", fontSize: 13, fontWeight: 700, marginBottom: 8 }}>Where Hawkeye Sterling acts WITHOUT human review:</div>
          {["Sanctions list matching (exact match)", "System health monitoring", "Data retrieval (read-only tools)", "Error and anomaly logging"].map(i => (
            <div key={i} style={LIST_ITEM}>• {i}</div>
          ))}
        </div>
        <div style={{ marginBottom: 12 }}>
          <div style={{ color: "#e74c3c", fontSize: 13, fontWeight: 700, marginBottom: 8 }}>Where a human MLRO MUST intervene before action:</div>
          {["SAR/STR filing decisions (GoAML portal — separate human step required)", "Sanctions freeze actions", "EDD escalation decisions", "PEP relationship approval or rejection", "Any action with legal consequence for a third party", "All ai_decision and mlro_advisor outputs"].map(i => (
            <div key={i} style={{ ...LIST_ITEM, color: "#e74c3c" }}>✗ {i}</div>
          ))}
        </div>
        <Field label="MLRO accountability">All compliance decisions made using Hawkeye Sterling outputs remain the legal responsibility of the human MLRO. Hawkeye Sterling is a tool. It does not bear legal or moral responsibility.</Field>
        <Field label="Human override">Any MLRO may override, reject, or disregard any Hawkeye Sterling output at any time without restriction.</Field>
      </div>

      {/* Regulatory */}
      <div style={SECTION}>
        <div style={H2}>Regulatory Compliance Basis</div>
        {[
          { reg: "UAE FDL No.(10) of 2025", scope: "Primary AML/CFT/CPF law — Art.14 (PEP EDD), Art.19 (adverse media lookback), Art.32 (SAR filing)" },
          { reg: "CR No.134/2025", scope: "Executive Regulations — Art.12 (UBO 25% threshold), Art.18 (MLRO review before case action), Art.28 (sanctions screening)" },
          { reg: "MoE Circulars No.3/2025 + No.6/2025", scope: "DPMS-specific obligations — real-time sanctions screening, record retention, FIU reporting" },
          { reg: "FATF Recommendations R.6, R.10, R.12", scope: "Targeted financial sanctions, CDD, PEP Enhanced Due Diligence" },
          { reg: "ISO/IEC 42001:2023", scope: "AI Management System — risk assessment, controls, monitoring, continual improvement" },
          { reg: "EU AI Act (Reg. 2024/1689)", scope: "High-risk AI system disclosure obligations (if EU persons screened)" },
          { reg: "UAE PDPL", scope: "Personal data of screened individuals — access, purpose limitation, residency" },
        ].map(r => (
          <div key={r.reg} style={{ ...ROW, borderBottom: "1px solid #16213e", paddingBottom: 8, marginBottom: 8 }}>
            <span style={{ ...LABEL, color: "#5dade2", fontWeight: 600 }}>{r.reg}</span>
            <span style={{ ...VALUE, fontSize: 12 }}>{r.scope}</span>
          </div>
        ))}
      </div>

      {/* Contact */}
      <div style={SECTION}>
        <div style={H2}>Queries, Complaints, and Oversight</div>
        <Field label="Operator">Fine Gold LLC — Abu Dhabi, UAE</Field>
        <Field label="AI system accountable role">MLRO / Compliance Officer</Field>
        <Field label="Complaint mechanism">Submit via the GoAML portal or contact the UAE Financial Intelligence Unit (FIU) for concerns about automated screening decisions affecting your entity.</Field>
        <Field label="Right to human review">Any individual or entity that believes they have been incorrectly screened may request a human MLRO review. Contact the MLRO directly.</Field>
        <Field label="Document version">v2.0 — {new Date().toLocaleDateString("en-GB", { timeZone: "Asia/Dubai" })}</Field>
      </div>
    </ModuleLayout>
  );
}
