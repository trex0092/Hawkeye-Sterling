"use client";

import { useEffect, useRef, useState } from "react";
import { parseCsv, rowsToBulkImport, type BulkImportRow } from "@/lib/data/csv";
import { fetchJson } from "@/lib/api/fetchWithRetry";

interface Props {
  open: boolean;
  onClose: () => void;
  onImported: (rows: BulkImportRow[]) => void;
}

interface BatchSummary {
  total: number;
  critical: number;
  high: number;
  medium: number;
  low: number;
  clear: number;
  errors: number;
}

interface BatchResponse {
  ok: boolean;
  error?: string;
  summary?: BatchSummary;
}

export function BulkImportDialog({ open, onClose, onImported }: Props) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [pasted, setPasted] = useState("");
  const [parsedRows, setParsedRows] = useState<BulkImportRow[]>([]);
  const [parseErrors, setParseErrors] = useState<string[]>([]);
  const [headers, setHeaders] = useState<string[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<BatchSummary | null>(null);
  const [error, setError] = useState<string | null>(null);

  const mountedRef = useRef(true);
  useEffect(() => () => { mountedRef.current = false; }, []);

  if (!open) return null;

  const ingest = (text: string) => {
    setError(null);
    setResult(null);
    const parsed = parseCsv(text);
    setHeaders(parsed.headers);
    setParseErrors(parsed.errors);
    setParsedRows(rowsToBulkImport(parsed.rows));
  };

  const onFile = async (file: File) => {
    const text = await file.text();
    setPasted(text);
    ingest(text);
  };

  const onSubmit = async () => {
    if (parsedRows.length === 0) {
      setError("No rows to import — paste a CSV or pick a file.");
      return;
    }
    if (parsedRows.length > 500) {
      setError(`Batch capped at 500 rows; you supplied ${parsedRows.length}.`);
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetchJson<BatchResponse>("/api/batch-screen", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ rows: parsedRows }),
        label: "Bulk import failed",
        timeoutMs: 90_000,
      });
      if (!mountedRef.current) return;
      if (!res.ok || !res.data?.ok) {
        setError(res.error ?? res.data?.error ?? "Bulk import failed");
        return;
      }
      setResult(res.data.summary ?? null);
      onImported(parsedRows);
    } finally {
      if (mountedRef.current) setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/50">
      <div className="bg-bg-panel border border-hair-2 rounded-xl w-[720px] max-w-[95vw] max-h-[90vh] overflow-hidden flex flex-col">
        <div className="flex items-center justify-between px-5 py-3 border-b border-hair-2">
          <div>
            <div className="text-13 font-semibold text-ink-0">Bulk import subjects</div>
            <div className="text-11 text-ink-3 mt-0.5">
              CSV / TSV / semicolon-separated. Required column: <span className="font-mono">name</span>.
              Optional: <span className="font-mono">aliases · entityType · jurisdiction · dob · gender · idNumber</span>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-ink-3 hover:text-ink-0 text-18 leading-none px-2"
            aria-label="Close"
          >
            ×
          </button>
        </div>

        <div className="px-5 py-4 overflow-y-auto flex-1 space-y-4">
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              className="px-3 py-1.5 text-12 font-medium border border-hair-2 rounded text-ink-0 hover:border-hair-3"
            >
              Pick file
            </button>
            <input
              ref={fileRef}
              type="file"
              accept=".csv,.tsv,text/csv,text/tab-separated-values,text/plain"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) void onFile(f);
              }}
            />
            <span className="text-11 text-ink-3 self-center">
              or paste below — Excel "Save as CSV" works.
            </span>
          </div>

          <textarea
            value={pasted}
            onChange={(e) => { setPasted(e.target.value); ingest(e.target.value); }}
            placeholder={"name,aliases,entityType,jurisdiction\nMaria Lopez,M Lopez;ML,individual,VE\nNorth Star Trading LLC,,organisation,AE"}
            rows={6}
            className="w-full px-2.5 py-2 border border-hair-2 rounded text-12 font-mono bg-bg-1 text-ink-0 resize-y focus:outline-none focus:border-brand"
          />

          {headers.length > 0 && (
            <div className="text-11 text-ink-2">
              Headers detected: {headers.map((h) => (
                <span key={h} className="inline-flex items-center px-1.5 py-px rounded-sm font-mono text-10 bg-bg-2 text-ink-1 mr-1">{h}</span>
              ))}
            </div>
          )}

          {parsedRows.length > 0 && (
            <div className="border border-hair-2 rounded overflow-hidden">
              <div className="px-3 py-1.5 bg-bg-1 text-11 font-semibold uppercase tracking-wide-3 text-ink-2 border-b border-hair-2">
                Preview - first 8 of {parsedRows.length} rows
              </div>
              <table className="w-full text-11">
                <thead className="text-10 text-ink-3 uppercase tracking-wide-2">
                  <tr>
                    <th className="text-left px-2 py-1">Name</th>
                    <th className="text-left px-2 py-1">Type</th>
                    <th className="text-left px-2 py-1">Jurisdiction</th>
                    <th className="text-left px-2 py-1">Aliases</th>
                  </tr>
                </thead>
                <tbody>
                  {parsedRows.slice(0, 8).map((r, i) => (
                    <tr key={i} className="border-t border-hair">
                      <td className="px-2 py-1 text-ink-0 font-medium">{r.name}</td>
                      <td className="px-2 py-1 text-ink-2">{r.entityType ?? "—"}</td>
                      <td className="px-2 py-1 text-ink-2">{r.jurisdiction ?? "—"}</td>
                      <td className="px-2 py-1 text-ink-2">{(r.aliases ?? []).slice(0, 3).join(", ") || "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {parseErrors.length > 0 && (
            <div className="text-11 text-amber bg-amber-dim border border-amber/30 rounded p-2">
              <div className="font-semibold mb-1">Parse warnings:</div>
              <ul className="list-disc list-inside space-y-0.5">
                {parseErrors.slice(0, 5).map((e, i) => <li key={i}>{e}</li>)}
                {parseErrors.length > 5 && <li>…and {parseErrors.length - 5} more</li>}
              </ul>
            </div>
          )}

          {error && (
            <div className="text-11 text-red bg-red-dim border border-red/30 rounded p-2">
              {error}
            </div>
          )}

          {result && (
            <div className="text-11 text-green bg-green-dim border border-green/30 rounded p-2">
              <div className="font-semibold mb-1">Batch screened: {result.total} subject(s)</div>
              <div>critical {result.critical} · high {result.high} · medium {result.medium} · low {result.low} · clear {result.clear} · errors {result.errors}</div>
            </div>
          )}
        </div>

        <div className="flex justify-end gap-2 px-5 py-3 border-t border-hair-2 bg-bg-1">
          <button
            type="button"
            onClick={onClose}
            className="px-3 py-1.5 text-12 font-medium border border-hair-2 rounded text-ink-0 hover:border-hair-3"
          >
            Close
          </button>
          <button
            type="button"
            onClick={() => { void onSubmit(); }}
            disabled={submitting || parsedRows.length === 0}
            className="px-4 py-1.5 text-12 font-semibold rounded bg-brand text-white disabled:opacity-40 disabled:cursor-not-allowed hover:bg-brand-hover"
          >
            {submitting ? "Screening…" : `Import + screen (${parsedRows.length})`}
          </button>
        </div>
      </div>
    </div>
  );
}
