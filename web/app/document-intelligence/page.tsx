"use client";

// Document Intelligence — text extraction, entity recognition, KYC connectors
// Tab 1: Document Analysis (paste/upload text, classify + extract entities, cross-ref subject)
// Tab 2: Identity Verification (Jumio/Onfido KYC connector UI)

import { useEffect, useRef, useState } from "react";
import { ModuleHero, ModuleLayout } from "@/components/layout/ModuleLayout";
import type { DocumentAnalysis, ExtractedEntity } from "@/lib/server/document-intelligence";

// ─── Types ────────────────────────────────────────────────────────────────────

type Tab = "Document Analysis" | "Identity Verification";
const TABS: Tab[] = ["Document Analysis", "Identity Verification"];

interface KycStatus {
  available: boolean;
  provider?: "jumio" | "onfido";
  verified?: boolean;
  score?: number;
  details?: unknown;
  message?: string;
  kycVerifiedAt?: string;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

const ENTITY_TYPE_LABEL: Record<ExtractedEntity["type"], string> = {
  person_name: "Person Name",
  date: "Date",
  amount: "Amount",
  address: "Address",
  id_number: "ID Number",
  company_name: "Company",
  country: "Country",
};

const DOC_TYPE_LABEL: Record<string, string> = {
  passport: "Passport",
  national_id: "National ID",
  driving_license: "Driving License",
  utility_bill: "Utility Bill",
  bank_statement: "Bank Statement",
  corporate_certificate: "Corporate Certificate",
  tax_document: "Tax Document",
  source_of_wealth: "Source of Wealth",
  unknown: "Unknown",
};

const BADGE_CLS: Record<string, string> = {
  passport: "bg-brand/15 text-brand",
  national_id: "bg-blue-dim text-blue",
  driving_license: "bg-amber-dim text-amber",
  utility_bill: "bg-violet-dim text-violet",
  bank_statement: "bg-green-dim text-green",
  corporate_certificate: "bg-orange/10 text-orange",
  tax_document: "bg-amber-dim text-amber",
  source_of_wealth: "bg-green-dim text-green",
  unknown: "bg-bg-2 text-ink-2",
};

const FLAG_CLS: Record<string, string> = {
  EXPIRY_DATE_PAST: "bg-red-dim text-red border-red/20",
  LOW_CONFIDENCE: "bg-amber-dim text-amber border-amber/20",
  POSSIBLE_ALTERATION: "bg-orange/10 text-orange border-orange/20",
  UNCLASSIFIED_DOCUMENT: "bg-bg-2 text-ink-2 border-hair",
};

function ConfidenceBar({ value }: { value: number }) {
  const pct = Math.round(value * 100);
  const colour =
    pct >= 85 ? "bg-green" : pct >= 65 ? "bg-amber" : "bg-red";
  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 h-1.5 rounded-full bg-bg-2 overflow-hidden">
        <div className={`h-full rounded-full ${colour}`} style={{ width: `${pct}%` }} />
      </div>
      <span className="text-10 font-mono text-ink-2 w-8">{pct}%</span>
    </div>
  );
}

const INPUT_CLS =
  "w-full bg-bg-input border border-hair-2 rounded px-3 py-2 text-13 text-ink-0 placeholder:text-ink-3 focus:outline-none focus:border-brand";

// ─── Tab 1: Document Analysis ─────────────────────────────────────────────────

function DocumentAnalysisTab() {
  const [text, setText] = useState("");
  const [subjectId, setSubjectId] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [analysis, setAnalysis] = useState<DocumentAnalysis | null>(null);
  const mountedRef = useRef(true);
  useEffect(() => () => { mountedRef.current = false; }, []);

  async function handleAnalyse() {
    if (!text.trim()) {
      setError("Please paste the document text before analysing.");
      return;
    }
    setError(null);
    setLoading(true);
    setAnalysis(null);
    try {
      const res = await fetch("/api/document-intelligence/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: text.trim(), subjectId: subjectId.trim() || undefined }),
      });
      const data = (await res.json()) as { ok: boolean; analysis?: DocumentAnalysis; error?: string };
      if (!mountedRef.current) return;
      if (!res.ok || !data.ok) {
        setError(data.error ?? `HTTP ${res.status}`);
      } else {
        setAnalysis(data.analysis ?? null);
      }
    } catch (err) {
      if (!mountedRef.current) return;
      setError(err instanceof Error ? err.message : "Request failed");
    } finally {
      if (mountedRef.current) setLoading(false);
    }
  }

  return (
    <div className="flex flex-col gap-6">
      {/* Input card */}
      <div className="border border-hair-2 rounded-lg p-5 bg-bg-panel flex flex-col gap-4">
        <div className="text-11 font-mono uppercase tracking-wide-4 text-ink-2">
          Document text
        </div>
        <div>
          <label className="block text-10 font-mono uppercase tracking-wide text-ink-2 mb-1">
            Paste extracted text from scanned document
          </label>
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            rows={10}
            placeholder={`REPUBLIC OF EXAMPLE\nPASSPORT\nPassport Number: AB123456\nSurname: SMITH\nGiven Names: JOHN WILLIAM\nNationality: EXAMPLE\nDate of Birth: 01/01/1980\nSex: M\nDate of Expiry: 01/01/2030\nPlace of Issue: CAPITAL CITY`}
            className={`${INPUT_CLS} font-mono text-12 resize-y min-h-[180px]`}
          />
        </div>

        <div>
          <label className="block text-10 font-mono uppercase tracking-wide text-ink-2 mb-1">
            Link to subject (optional — for cross-reference)
          </label>
          <input
            type="text"
            value={subjectId}
            onChange={(e) => setSubjectId(e.target.value)}
            placeholder="Subject ID (e.g. subj-001)"
            className={INPUT_CLS}
          />
        </div>

        {error && (
          <div className="px-3 py-2 rounded border bg-red-dim text-red border-red/20 text-12">
            {error}
          </div>
        )}

        <button
          type="button"
          onClick={handleAnalyse}
          disabled={loading}
          className="self-start px-5 py-2 rounded bg-brand text-white text-12 font-semibold hover:bg-brand/90 transition-colors disabled:opacity-40"
        >
          {loading ? "Analysing…" : "Analyse Document"}
        </button>
      </div>

      {/* Results */}
      {analysis && (
        <div className="flex flex-col gap-5">
          {/* Header row */}
          <div className="flex items-center gap-3 flex-wrap">
            <span
              className={`inline-flex items-center px-2.5 py-1 rounded border text-11 font-mono font-semibold uppercase tracking-wide ${BADGE_CLS[analysis.documentType] ?? BADGE_CLS.unknown}`}
            >
              {DOC_TYPE_LABEL[analysis.documentType] ?? analysis.documentType}
            </span>
            <span className="text-11 font-mono text-ink-2">
              Lang: {analysis.language.toUpperCase()}
            </span>
            <span className="text-11 font-mono text-ink-2">
              Pages: {analysis.pageCount}
            </span>
            <span className="text-11 font-mono text-ink-2">
              Provider: {analysis.provider}
            </span>
            <span className="text-11 font-mono text-ink-3">
              {new Date(analysis.analysisAt).toLocaleString("en-GB")}
            </span>
          </div>

          {/* Validation flags */}
          {analysis.validationFlags.length > 0 && (
            <div className="flex flex-col gap-2">
              <div className="text-10 font-mono uppercase tracking-wide text-ink-2">
                Validation flags
              </div>
              <div className="flex flex-wrap gap-2">
                {analysis.validationFlags.map((flag) => (
                  <span
                    key={flag}
                    className={`inline-flex items-center px-2 py-0.5 rounded border text-10 font-mono font-semibold uppercase tracking-wide ${FLAG_CLS[flag] ?? "bg-bg-2 text-ink-2 border-hair"}`}
                  >
                    {flag.replace(/_/g, " ")}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Extracted entities */}
          {analysis.extractedEntities.length > 0 && (
            <div className="border border-hair-2 rounded-lg overflow-hidden">
              <div className="px-4 py-2.5 border-b border-hair bg-bg-2">
                <span className="text-11 font-mono uppercase tracking-wide-4 text-ink-2">
                  Extracted entities ({analysis.extractedEntities.length})
                </span>
              </div>
              <table className="w-full text-12">
                <thead>
                  <tr className="border-b border-hair bg-bg-1">
                    <th className="px-4 py-2 text-left text-10 font-mono uppercase tracking-wide text-ink-2">
                      Type
                    </th>
                    <th className="px-4 py-2 text-left text-10 font-mono uppercase tracking-wide text-ink-2">
                      Value
                    </th>
                    <th className="px-4 py-2 text-left text-10 font-mono uppercase tracking-wide text-ink-2 w-36">
                      Confidence
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {analysis.extractedEntities.map((entity, i) => (
                    <tr key={i} className="border-b border-hair last:border-0 hover:bg-bg-1 transition-colors">
                      <td className="px-4 py-2">
                        <span className="inline-flex items-center px-1.5 py-0.5 rounded bg-brand/10 text-brand text-10 font-mono">
                          {ENTITY_TYPE_LABEL[entity.type] ?? entity.type}
                        </span>
                      </td>
                      <td className="px-4 py-2 font-mono text-ink-0">{entity.value}</td>
                      <td className="px-4 py-2">
                        <ConfidenceBar value={entity.confidence} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* Cross-reference */}
          {analysis.crossReferenceMatches.length > 0 && (
            <div className="border border-hair-2 rounded-lg overflow-hidden">
              <div className="px-4 py-2.5 border-b border-hair bg-bg-2">
                <span className="text-11 font-mono uppercase tracking-wide-4 text-ink-2">
                  Cross-reference results
                </span>
              </div>
              <table className="w-full text-12">
                <thead>
                  <tr className="border-b border-hair bg-bg-1">
                    <th className="px-4 py-2 text-left text-10 font-mono uppercase tracking-wide text-ink-2">
                      Field
                    </th>
                    <th className="px-4 py-2 text-left text-10 font-mono uppercase tracking-wide text-ink-2">
                      Document value
                    </th>
                    <th className="px-4 py-2 text-left text-10 font-mono uppercase tracking-wide text-ink-2">
                      Subject value
                    </th>
                    <th className="px-4 py-2 text-center text-10 font-mono uppercase tracking-wide text-ink-2">
                      Match
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {analysis.crossReferenceMatches.map((m, i) => (
                    <tr key={i} className="border-b border-hair last:border-0 hover:bg-bg-1 transition-colors">
                      <td className="px-4 py-2 font-mono text-10 uppercase text-ink-2">
                        {m.field}
                      </td>
                      <td className="px-4 py-2 font-mono text-ink-0">{m.documentValue}</td>
                      <td className="px-4 py-2 font-mono text-ink-1">{m.subjectValue}</td>
                      <td className="px-4 py-2 text-center text-16 leading-none">
                        {m.match ? (
                          <span className="text-green" title="Match">✓</span>
                        ) : (
                          <span className="text-red" title="Mismatch">✕</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Tab 2: Identity Verification (KYC) ──────────────────────────────────────

function IdentityVerificationTab() {
  const [providerStatus, setProviderStatus] = useState<"loading" | "configured" | "unconfigured">("loading");
  const [providerName, setProviderName] = useState<string>("");
  const [documentBase64, setDocumentBase64] = useState("");
  const [faceBase64, setFaceBase64] = useState("");
  const [subjectId, setSubjectId] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<KycStatus | null>(null);
  const mountedRef = useRef(true);
  useEffect(() => () => { mountedRef.current = false; }, []);

  // Probe provider status by sending a dummy request and checking the response
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/document-intelligence/verify-identity", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ documentBase64: "probe", subjectId: "probe" }),
        });
        const data = (await res.json()) as { ok: boolean; available?: boolean; provider?: string; message?: string };
        if (cancelled) return;
        if (data.ok && data.available === false) {
          setProviderStatus("unconfigured");
        } else if (data.ok && data.available) {
          setProviderStatus("configured");
          setProviderName(data.provider ?? "");
        } else {
          // Auth failure or other — still show unconfigured UI
          setProviderStatus("unconfigured");
        }
      } catch {
        if (!cancelled) setProviderStatus("unconfigured");
      }
    })();
    return () => { cancelled = true; };
  }, []);

  async function handleVerify() {
    if (!documentBase64.trim()) {
      setError("Document base64 image is required.");
      return;
    }
    if (!subjectId.trim()) {
      setError("Subject ID is required to record the verification outcome.");
      return;
    }
    setError(null);
    setLoading(true);
    setResult(null);
    try {
      const res = await fetch("/api/document-intelligence/verify-identity", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          documentBase64: documentBase64.trim(),
          faceBase64: faceBase64.trim() || undefined,
          subjectId: subjectId.trim(),
        }),
      });
      const data = (await res.json()) as KycStatus & { ok: boolean; error?: string };
      if (!mountedRef.current) return;
      if (!res.ok || !data.ok) {
        setError(data.error ?? `HTTP ${res.status}`);
      } else {
        setResult(data);
      }
    } catch (err) {
      if (!mountedRef.current) return;
      setError(err instanceof Error ? err.message : "Request failed");
    } finally {
      if (mountedRef.current) setLoading(false);
    }
  }

  return (
    <div className="flex flex-col gap-6">
      {/* Provider status card */}
      <div className="border border-hair-2 rounded-lg p-5 bg-bg-panel flex flex-col gap-3">
        <div className="text-11 font-mono uppercase tracking-wide-4 text-ink-2">
          KYC provider status
        </div>

        {providerStatus === "loading" && (
          <div className="text-13 text-ink-2 animate-pulse">Checking provider…</div>
        )}

        {providerStatus === "configured" && (
          <div className="flex items-center gap-3">
            <span className="text-green text-16">●</span>
            <span className="text-13 text-ink-0 font-medium capitalize">
              {providerName} configured and active
            </span>
          </div>
        )}

        {providerStatus === "unconfigured" && (
          <div className="flex flex-col gap-3">
            <div className="flex items-center gap-3">
              <span className="text-ink-3 text-16">○</span>
              <span className="text-13 text-ink-2">No KYC provider configured</span>
            </div>
            <div className="border border-amber/20 rounded-md p-4 bg-amber-dim flex flex-col gap-2">
              <div className="text-11 font-mono uppercase tracking-wide text-amber font-semibold">
                Setup instructions
              </div>
              <p className="text-12 text-ink-1 leading-relaxed">
                To activate identity verification, add one of the following to your Netlify environment variables:
              </p>
              <div className="flex flex-col gap-2 mt-1">
                <div className="bg-bg-panel border border-hair rounded p-3">
                  <div className="text-10 font-mono uppercase text-amber mb-1">Jumio</div>
                  <code className="text-11 font-mono text-ink-0 block">JUMIO_API_KEY=your-api-key</code>
                  <code className="text-11 font-mono text-ink-0 block">JUMIO_API_SECRET=your-api-secret</code>
                  <code className="text-11 font-mono text-ink-3 block mt-1">
                    JUMIO_BASE_URL=https://netverify.com (optional)
                  </code>
                </div>
                <div className="bg-bg-panel border border-hair rounded p-3">
                  <div className="text-10 font-mono uppercase text-amber mb-1">Onfido</div>
                  <code className="text-11 font-mono text-ink-0 block">ONFIDO_API_TOKEN=your-api-token</code>
                  <code className="text-11 font-mono text-ink-3 block mt-1">
                    ONFIDO_BASE_URL=https://api.onfido.com (optional)
                  </code>
                </div>
              </div>
              <p className="text-11 text-ink-2 mt-1">
                Add these in Netlify Site Settings → Environment Variables, then redeploy.
                Jumio takes precedence when both are set.
              </p>
            </div>
          </div>
        )}
      </div>

      {/* Verification form — only when configured */}
      {providerStatus === "configured" && (
        <div className="border border-hair-2 rounded-lg p-5 bg-bg-panel flex flex-col gap-4">
          <div className="text-11 font-mono uppercase tracking-wide-4 text-ink-2">
            Submit for verification
          </div>

          <div>
            <label className="block text-10 font-mono uppercase tracking-wide text-ink-2 mb-1">
              Document image (base64)
            </label>
            <textarea
              value={documentBase64}
              onChange={(e) => setDocumentBase64(e.target.value)}
              rows={4}
              placeholder="Paste base64-encoded document image…"
              className={`${INPUT_CLS} font-mono text-11 resize-y min-h-[80px]`}
            />
          </div>

          <div>
            <label className="block text-10 font-mono uppercase tracking-wide text-ink-2 mb-1">
              Face / selfie image (base64, optional)
            </label>
            <textarea
              value={faceBase64}
              onChange={(e) => setFaceBase64(e.target.value)}
              rows={3}
              placeholder="Paste base64-encoded face image (optional for liveness check)…"
              className={`${INPUT_CLS} font-mono text-11 resize-y min-h-[60px]`}
            />
          </div>

          <div>
            <label className="block text-10 font-mono uppercase tracking-wide text-ink-2 mb-1">
              Subject ID
            </label>
            <input
              type="text"
              value={subjectId}
              onChange={(e) => setSubjectId(e.target.value)}
              placeholder="Subject ID (e.g. subj-001)"
              className={INPUT_CLS}
            />
          </div>

          {error && (
            <div className="px-3 py-2 rounded border bg-red-dim text-red border-red/20 text-12">
              {error}
            </div>
          )}

          <button
            type="button"
            onClick={handleVerify}
            disabled={loading}
            className="self-start px-5 py-2 rounded bg-brand text-white text-12 font-semibold hover:bg-brand/90 transition-colors disabled:opacity-40"
          >
            {loading ? "Verifying…" : "Verify Identity"}
          </button>

          {/* Result */}
          {result && (
            <div
              className={`mt-2 border rounded-lg p-4 flex flex-col gap-2 ${
                result.verified
                  ? "border-green/30 bg-green-dim"
                  : "border-red/30 bg-red-dim"
              }`}
            >
              <div className="flex items-center gap-2">
                <span className={`text-18 ${result.verified ? "text-green" : "text-red"}`}>
                  {result.verified ? "✓" : "✕"}
                </span>
                <span className={`text-13 font-semibold ${result.verified ? "text-green" : "text-red"}`}>
                  {result.verified ? "Identity verified" : "Verification failed"}
                </span>
                {result.score !== undefined && (
                  <span className="text-11 font-mono text-ink-2 ml-2">
                    Score: {typeof result.score === "number" ? `${Math.round(result.score * 100)}%` : String(result.score)}
                  </span>
                )}
              </div>
              {result.kycVerifiedAt && (
                <div className="text-11 font-mono text-ink-2">
                  Verified at: {new Date(result.kycVerifiedAt).toLocaleString("en-GB")}
                </div>
              )}
              {result.provider && (
                <div className="text-11 font-mono text-ink-2 capitalize">
                  Provider: {result.provider}
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function DocumentIntelligencePage() {
  const [activeTab, setActiveTab] = useState<Tab>("Document Analysis");

  return (
    <ModuleLayout>
      <div className="p-6 max-w-5xl mx-auto">
        <ModuleHero
          eyebrow="KYC"
          title="Document Intelligence"
          kpis={[
            { value: "7+", label: "Document types" },
            { value: "6", label: "Entity types" },
            { value: "2", label: "KYC providers" },
          ]}
          intro="Extract structured information from KYC documents: classify document type, recognise entities (names, dates, amounts, IDs), and cross-reference against the screening subject. Jumio and Onfido connectors activate when env vars are present."
        />

        {/* Tabs */}
        <div className="flex gap-0 border-b border-hair mb-6">
          {TABS.map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`px-4 py-2.5 text-12 font-medium transition-colors border-b-2 -mb-px ${
                activeTab === tab
                  ? "border-brand text-brand"
                  : "border-transparent text-ink-2 hover:text-ink-1"
              }`}
            >
              {tab}
            </button>
          ))}
        </div>

        {activeTab === "Document Analysis" && <DocumentAnalysisTab />}
        {activeTab === "Identity Verification" && <IdentityVerificationTab />}
      </div>
    </ModuleLayout>
  );
}
