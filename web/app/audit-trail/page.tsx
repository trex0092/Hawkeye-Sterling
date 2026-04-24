"use client";

import { ModuleLayout } from "@/components/layout/ModuleLayout";

interface AuditEntry {
  id: string;
  timestamp: string;
  actor: string;
  action: string;
  target: string;
  hash: string;
}

const ENTRIES: AuditEntry[] = [];

export default function AuditTrailPage() {
  return (
    <ModuleLayout>
      <div>
        <div className="mb-8">
          <div className="font-mono text-11 tracking-wide-8 uppercase text-ink-2 mb-2">
            MODULE 05 · IMMUTABLE RECORD
          </div>
          <h1 className="font-display font-normal text-48 leading-[1.1] tracking-tightest m-0 mb-2 text-ink-0">
            Audit <em className="italic text-brand">trail.</em>
          </h1>
          <p className="max-w-[68ch] text-ink-1 text-13.5 leading-[1.6] m-0 mt-3 border-l-2 border-brand pl-3.5">
            <strong>Ten-year retention · tamper-evident chain.</strong> Every disposition,
            escalation and STR is bound to the hash of the preceding event. The chain is
            exportable to goAML and the FIU on demand.
          </p>
        </div>

        <div className="bg-bg-panel border border-hair-2 rounded-xl overflow-hidden">
          <table className="w-full border-collapse text-12.5">
            <thead className="bg-bg-1 border-b border-hair-2">
              <tr>
                <th className="text-left px-4 py-2.5 text-11 font-semibold tracking-wide-3 uppercase text-ink-2">
                  Timestamp
                </th>
                <th className="text-left px-4 py-2.5 text-11 font-semibold tracking-wide-3 uppercase text-ink-2">
                  Actor
                </th>
                <th className="text-left px-4 py-2.5 text-11 font-semibold tracking-wide-3 uppercase text-ink-2">
                  Action
                </th>
                <th className="text-left px-4 py-2.5 text-11 font-semibold tracking-wide-3 uppercase text-ink-2">
                  Target
                </th>
                <th className="text-left px-4 py-2.5 text-11 font-semibold tracking-wide-3 uppercase text-ink-2">
                  Hash
                </th>
              </tr>
            </thead>
            <tbody>
              {ENTRIES.length === 0 ? (
                <tr>
                  <td
                    colSpan={5}
                    className="px-6 py-10 text-center text-12 text-ink-2"
                  >
                    Audit chain is empty. Entries are written automatically when
                    screenings are dispositioned, escalated, or filed.
                  </td>
                </tr>
              ) : (
                ENTRIES.map((entry, idx) => {
                  const isLast = idx === ENTRIES.length - 1;
                  return (
                    <tr key={entry.id} className="hover:bg-bg-1">
                      <td className={`px-4 py-3 font-mono text-11 text-ink-2 ${isLast ? "" : "border-b border-hair"}`}>
                        {entry.timestamp}
                      </td>
                      <td className={`px-4 py-3 ${isLast ? "" : "border-b border-hair"}`}>
                        {entry.actor}
                      </td>
                      <td className={`px-4 py-3 ${isLast ? "" : "border-b border-hair"}`}>
                        {entry.action}
                      </td>
                      <td className={`px-4 py-3 font-mono text-11 ${isLast ? "" : "border-b border-hair"}`}>
                        {entry.target}
                      </td>
                      <td className={`px-4 py-3 font-mono text-11 text-ink-3 ${isLast ? "" : "border-b border-hair"}`}>
                        {entry.hash}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </ModuleLayout>
  );
}
