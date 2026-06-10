// Hawkeye Sterling — deterministic module status-card graphic for the
// Asana compliance attestation (CCL-2026-023).
//
// composeStatusCardSvg() is a pure function: identical inputs render an
// identical SVG byte-for-byte, mirroring buildReport()'s determinism so the
// graphic carries the same audit-reproducibility guarantee as the narrative
// it accompanies. renderPng() rasterises via @resvg/resvg-js — local
// WASM/native rendering, no network egress.

import { Resvg } from "@resvg/resvg-js";

/** One day of attestation history: C clean · A active · E exception · M manual. */
export type AttestationState = "C" | "A" | "E" | "M";

export interface StatusCardInput {
  num: string;
  label: string;
  group: string;
  /** ISO date (YYYY-MM-DD) the attestation covers. */
  date: string;
  /** HS-ATT-… / HS-MAN-… reference, identical to the narrative's §1. */
  ref: string;
  state: AttestationState;
  /** Narrative §3 control status line (e.g. "Operational"). */
  statusLine: string;
  /** First sentence of §5 findings, trimmed for the card. */
  findingsLine: string;
  riskRating?: string | undefined;
  cadence: string;
  owner: string;
  retention: string;
  /** Up to 7 prior days, oldest first; today is appended by the caller. */
  history: Array<{ date: string; state: AttestationState }>;
}

const GROUP_HEX: Record<string, string> = {
  onboarding: "#b03a64",
  riskops: "#b03228",
  governance: "#5b3a9b",
  kyc: "#1f5fb0",
  intelligence: "#1e7a52",
};

const STATE_META: Record<AttestationState, { hex: string; label: string }> = {
  C: { hex: "#1e7a52", label: "CLEAN — COMPLIANT" },
  A: { hex: "#b8860b", label: "ACTIVE — MONITORING" },
  E: { hex: "#b03228", label: "EXCEPTION — ACTION REQUIRED" },
  M: { hex: "#475569", label: "MANUAL ATTESTATION" },
};

function esc(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function clip(s: string, max: number): string {
  return s.length <= max ? s : `${s.slice(0, max - 1)}…`;
}

export function composeStatusCardSvg(input: StatusCardInput): string {
  const group = GROUP_HEX[input.group] ?? "#0f2740";
  const state = STATE_META[input.state];

  // 7-slot history strip (oldest → today). Unfilled slots render hollow.
  const slots: Array<{ date: string; state: AttestationState } | null> = [
    ...input.history.slice(-6),
    { date: input.date, state: input.state },
  ];
  while (slots.length < 7) slots.unshift(null);
  const strip = slots
    .map((s, i) => {
      const x = 470 + i * 38;
      if (!s) return `<circle cx="${x}" cy="118" r="9" fill="none" stroke="#cbd5e1" stroke-width="1.5"/>`;
      const c = STATE_META[s.state].hex;
      const day = s.date.slice(8, 10);
      return (
        `<circle cx="${x}" cy="118" r="9" fill="${c}"/>` +
        `<text x="${x}" y="140" font-size="8" fill="#64748b" text-anchor="middle">${day}</text>`
      );
    })
    .join("");

  return (
    `<svg xmlns="http://www.w3.org/2000/svg" width="760" height="240" viewBox="0 0 760 240" font-family="Helvetica,Arial,sans-serif">` +
    `<rect width="760" height="240" fill="#ffffff"/>` +
    `<rect width="760" height="46" fill="${group}"/>` +
    `<text x="18" y="29" font-size="15" font-weight="bold" fill="#ffffff">${esc(input.num)} · ${esc(clip(input.label, 46))}</text>` +
    `<text x="742" y="29" font-size="11" fill="#ffffff" text-anchor="end">HAWKEYE STERLING — COMPLIANCE ATTESTATION</text>` +
    `<rect x="18" y="62" width="270" height="30" rx="15" fill="${state.hex}"/>` +
    `<text x="153" y="82" font-size="12" font-weight="bold" fill="#ffffff" text-anchor="middle">${state.label}</text>` +
    `<text x="306" y="82" font-size="11" fill="#334155">Status: ${esc(clip(input.statusLine, 34))}` +
    `${input.riskRating ? `   ·   Risk: ${esc(input.riskRating)}` : ""}</text>` +
    `<text x="18" y="118" font-size="10.5" fill="#1e293b">${esc(clip(input.findingsLine, 78))}</text>` +
    `<text x="470" y="96" font-size="9" font-weight="bold" fill="#64748b">7-DAY ATTESTATION HISTORY</text>` +
    strip +
    `<line x1="18" y1="156" x2="742" y2="156" stroke="#e2e8f0" stroke-width="1"/>` +
    `<text x="18" y="178" font-size="9.5" fill="#475569"><tspan font-weight="bold">CADENCE</tspan>  ${esc(clip(input.cadence, 58))}</text>` +
    `<text x="18" y="196" font-size="9.5" fill="#475569"><tspan font-weight="bold">OWNER</tspan>  ${esc(clip(input.owner, 58))}</text>` +
    `<text x="470" y="178" font-size="9.5" fill="#475569"><tspan font-weight="bold">RETENTION</tspan>  ${esc(clip(input.retention, 34))} · archive, never delete</text>` +
    `<text x="470" y="196" font-size="9.5" fill="#475569"><tspan font-weight="bold">REF</tspan>  ${esc(input.ref)}</text>` +
    `<rect x="0" y="214" width="760" height="26" fill="#f1f5f9"/>` +
    `<text x="18" y="231" font-size="8.5" fill="#64748b">${esc(input.date)} · 09:30 GST · Evidence on the append-only hash-linked audit chain — Federal Decree-Law No. 10 of 2025 Art.24 · Internal — Compliance</text>` +
    `</svg>`
  );
}

/** Daily run summary grid (88 modules) attached to the Inbox governance task. */
export function composeSummaryGridSvg(
  date: string,
  entries: Array<{ num: string; state: AttestationState }>,
): string {
  const counts = { C: 0, A: 0, E: 0, M: 0 };
  for (const e of entries) counts[e.state]++;
  const cols = 11;
  const cells = entries
    .map((e, i) => {
      const x = 18 + (i % cols) * 66;
      const y = 92 + Math.floor(i / cols) * 30;
      const c = STATE_META[e.state].hex;
      return (
        `<rect x="${x}" y="${y}" width="58" height="22" rx="4" fill="${c}" fill-opacity="0.14" stroke="${c}" stroke-width="1"/>` +
        `<text x="${x + 29}" y="${y + 15}" font-size="9.5" font-weight="bold" fill="${c}" text-anchor="middle">${esc(e.num)}</text>`
      );
    })
    .join("");
  const rows = Math.ceil(entries.length / cols);
  const h = 92 + rows * 30 + 40;
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" width="760" height="${h}" viewBox="0 0 760 ${h}" font-family="Helvetica,Arial,sans-serif">` +
    `<rect width="760" height="${h}" fill="#ffffff"/>` +
    `<rect width="760" height="46" fill="#0f2740"/>` +
    `<text x="18" y="29" font-size="15" font-weight="bold" fill="#ffffff">DAILY ATTESTATION SUMMARY — ${esc(date)}</text>` +
    `<text x="742" y="29" font-size="11" fill="#9fb6cc" text-anchor="end">${entries.length} MODULE BOARDS</text>` +
    `<text x="18" y="72" font-size="10.5" fill="#334155">` +
    `<tspan fill="#1e7a52" font-weight="bold">${counts.C} clean</tspan>   ·   ` +
    `<tspan fill="#b8860b" font-weight="bold">${counts.A} active</tspan>   ·   ` +
    `<tspan fill="#b03228" font-weight="bold">${counts.E} exception</tspan>` +
    `${counts.M ? `   ·   <tspan fill="#475569" font-weight="bold">${counts.M} manual</tspan>` : ""}</text>` +
    cells +
    `<text x="18" y="${h - 12}" font-size="8.5" fill="#64748b">09:30 GST business-day attestation · FDL No.10/2025 Art.24 · Internal — Compliance</text>` +
    `</svg>`
  );
}

export function renderPng(svg: string): Buffer {
  const resvg = new Resvg(svg, { fitTo: { mode: "width", value: 1140 } });
  return Buffer.from(resvg.render().asPng());
}
