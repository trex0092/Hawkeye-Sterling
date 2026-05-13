"use client";

// /admin/brain-catalogue
//
// MLRO catalogue review UI (Section E, Art.18 CR 134/2025).
//
// Lets the MLRO:
//   1. View current brain soul stats (faculties, reasoning modes, skills,
//      meta-cognition) and the last review date.
//   2. Sign off the review — calls POST /api/admin/mark-catalogue-reviewed,
//      which persists the timestamp to Netlify Blobs and appends to the
//      audit-log history store.
//
// Auth: requires ADMIN_TOKEN via the sign-off form. The page itself renders
// without auth so the MLRO can read the stats before deciding to sign off.

import React, { useEffect, useState } from "react";

// ─── types ────────────────────────────────────────────────────────────────────

interface CatalogueStats {
  faculties: number;
  reasoningModes: number;
  metaCognition: number;
  skills: number;
}

interface StatusSnapshot {
  feedVersions?: {
    brain?: string;
    reviewedAt?: string;
    commitSha?: string;
  };
  brainSoul?: {
    catalogue?: CatalogueStats;
    charterHash?: string;
    catalogueHash?: string;
    compositeHash?: string;
    amplificationPercent?: number;
    amplificationFactor?: number;
    directiveCount?: number;
    status?: string;
  };
  warnings?: string[];
}

// ─── styles ──────────────────────────────────────────────────────────────────

const BG     = "#0a0e1a";
const CARD   = "#0d1117";
const BORDER = "#1a1f35";
const GREEN  = "#2ecc71";
const AMBER  = "#f39c12";
const RED    = "#e74c3c";
const BLUE   = "#3498db";
const MUTED  = "#8892b0";
const TEXT   = "#ccd6f6";

const SECTION: React.CSSProperties = {
  background: CARD,
  border: `1px solid ${BORDER}`,
  borderRadius: 8,
  padding: "20px 24px",
  marginBottom: 16,
};
const H2: React.CSSProperties = {
  fontSize: 13,
  fontWeight: 700,
  color: TEXT,
  textTransform: "uppercase",
  letterSpacing: 1,
  marginBottom: 16,
};
const STAT: React.CSSProperties = {
  background: BG,
  border: `1px solid ${BORDER}`,
  borderRadius: 6,
  padding: "14px 18px",
  textAlign: "center" as const,
};
const INPUT_STYLE: React.CSSProperties = {
  background: BG,
  border: `1px solid ${BORDER}`,
  borderRadius: 4,
  color: TEXT,
  padding: "8px 12px",
  fontSize: 13,
  width: "100%",
  boxSizing: "border-box" as const,
};
const BTN: React.CSSProperties = {
  background: GREEN,
  color: "#000",
  fontWeight: 700,
  fontSize: 13,
  padding: "10px 24px",
  borderRadius: 6,
  border: "none",
  cursor: "pointer",
};

// ─── helpers ─────────────────────────────────────────────────────────────────

function daysSince(dateStr: string | undefined): number | null {
  if (!dateStr) return null;
  const d = Date.parse(dateStr);
  if (isNaN(d)) return null;
  return Math.floor((Date.now() - d) / 86_400_000);
}

function staleness(days: number | null): { label: string; color: string } {
  if (days === null) return { label: "Unknown", color: MUTED };
  if (days <= 30)   return { label: `${days}d ago — current`, color: GREEN };
  if (days <= 60)   return { label: `${days}d ago — due soon`, color: AMBER };
  return { label: `${days}d ago — OVERDUE`, color: RED };
}

// ─── component ───────────────────────────────────────────────────────────────

export default function BrainCataloguePage() {
  const [snapshot, setSnapshot] = useState<StatusSnapshot | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  // sign-off form state
  const [adminToken, setAdminToken] = useState("");
  const [reviewer, setReviewer] = useState("");
  const [note, setNote] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [submitResult, setSubmitResult] = useState<{ ok: boolean; message: string } | null>(null);

  useEffect(() => {
    fetch("/api/status")
      .then((r) => r.json())
      .then((d: StatusSnapshot) => setSnapshot(d))
      .catch((e: Error) => setLoadError(e.message));
  }, []);

  const catalogue = snapshot?.brainSoul?.catalogue;
  const reviewedAt = snapshot?.feedVersions?.reviewedAt;
  const days = daysSince(reviewedAt);
  const { label: staleLabel, color: staleColor } = staleness(days);
  const soul = snapshot?.brainSoul;

  const catalogueChecklist: Array<{ label: string; count: number; guidance: string; threshold: number }> = [
    { label: "Faculties", count: catalogue?.faculties ?? 0, guidance: "Verify coverage vs CR 134/2025 — expected ≥15", threshold: 15 },
    { label: "Reasoning modes", count: catalogue?.reasoningModes ?? 0, guidance: "Stubs expected; verify no deprecated modes under FDL 10/2025", threshold: 1 },
    { label: "Meta-cognition entries", count: catalogue?.metaCognition ?? 0, guidance: "Verify alignment with Art.18 oversight requirements", threshold: 1 },
    { label: "MLRO skills", count: catalogue?.skills ?? 0, guidance: "Flag any deprecated skills under FDL 10/2025", threshold: 1 },
  ];

  async function handleSignOff(e: React.FormEvent) {
    e.preventDefault();
    if (!adminToken.trim()) {
      setSubmitResult({ ok: false, message: "Admin token required" });
      return;
    }
    setSubmitting(true);
    setSubmitResult(null);
    const params = new URLSearchParams();
    if (reviewer.trim()) params.set("reviewer", reviewer.trim());
    if (note.trim()) params.set("note", note.trim());
    try {
      const res = await fetch(`/api/admin/mark-catalogue-reviewed?${params.toString()}`, {
        method: "POST",
        headers: { authorization: `Bearer ${adminToken.trim()}` },
      });
      const body = await res.json().catch(() => ({})) as { ok?: boolean; hint?: string; error?: string };
      if (res.ok && body.ok) {
        setSubmitResult({ ok: true, message: body.hint ?? "Review recorded. Page will reflect new date on next reload." });
        // Re-fetch status to update displayed date
        fetch("/api/status")
          .then((r) => r.json())
          .then((d: StatusSnapshot) => setSnapshot(d))
          .catch(() => null);
      } else {
        setSubmitResult({ ok: false, message: body.error ?? `HTTP ${res.status}` });
      }
    } catch (err) {
      setSubmitResult({ ok: false, message: err instanceof Error ? err.message : "Network error" });
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div style={{ fontFamily: "monospace", background: BG, minHeight: "100vh", padding: 24, color: TEXT }}>
      <h1 style={{ fontSize: 18, fontWeight: 700, color: TEXT, marginBottom: 4 }}>
        Brain Catalogue Review
      </h1>
      <p style={{ color: MUTED, fontSize: 12, marginBottom: 24 }}>
        MLRO sign-off per CR 134/2025 Art.18 · UAE FDL 10/2025 · ISO/IEC 42001
      </p>

      {/* Review status banner */}
      <div style={{ ...SECTION, borderColor: staleColor }}>
        <div style={H2}>Review Status</div>
        <div style={{ display: "flex", gap: 24, flexWrap: "wrap" as const }}>
          <div>
            <div style={{ color: MUTED, fontSize: 11, marginBottom: 4 }}>Last reviewed</div>
            <div style={{ fontSize: 16, fontWeight: 700, color: TEXT }}>{reviewedAt ?? "—"}</div>
          </div>
          <div>
            <div style={{ color: MUTED, fontSize: 11, marginBottom: 4 }}>Staleness</div>
            <div style={{ fontSize: 14, fontWeight: 700, color: staleColor }}>{staleLabel}</div>
          </div>
          <div>
            <div style={{ color: MUTED, fontSize: 11, marginBottom: 4 }}>Brain version</div>
            <div style={{ fontSize: 13, color: TEXT }}>{snapshot?.feedVersions?.brain ?? "—"}</div>
          </div>
          <div>
            <div style={{ color: MUTED, fontSize: 11, marginBottom: 4 }}>Commit</div>
            <div style={{ fontSize: 13, color: BLUE }}>{snapshot?.feedVersions?.commitSha ?? "—"}</div>
          </div>
        </div>
        {snapshot?.warnings?.some((w) => w.includes("catalogue")) && (
          <div style={{ marginTop: 12, padding: "8px 12px", background: `${RED}22`, borderLeft: `3px solid ${RED}`, borderRadius: 4, fontSize: 12, color: RED }}>
            {snapshot.warnings.find((w) => w.includes("catalogue"))}
          </div>
        )}
      </div>

      {/* Brain soul stats */}
      <div style={SECTION}>
        <div style={H2}>Brain Soul — Integrity</div>
        {loadError && (
          <div style={{ color: RED, fontSize: 12, marginBottom: 12 }}>Failed to load status: {loadError}</div>
        )}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 8, marginBottom: 16 }}>
          <div style={STAT}>
            <div style={{ fontSize: 22, fontWeight: 700, color: GREEN }}>{soul?.amplificationFactor?.toFixed(2) ?? "—"}×</div>
            <div style={{ fontSize: 10, color: MUTED, marginTop: 4 }}>Amplification</div>
          </div>
          <div style={STAT}>
            <div style={{ fontSize: 22, fontWeight: 700, color: BLUE }}>{soul?.directiveCount ?? "—"}</div>
            <div style={{ fontSize: 10, color: MUTED, marginTop: 4 }}>Directives</div>
          </div>
          <div style={STAT}>
            <div style={{ fontSize: 22, fontWeight: 700, color: soul?.status === "intact" ? GREEN : AMBER }}>
              {soul?.status ?? "—"}
            </div>
            <div style={{ fontSize: 10, color: MUTED, marginTop: 4 }}>Soul status</div>
          </div>
          <div style={STAT}>
            <div style={{ fontSize: 16, fontWeight: 700, color: TEXT, fontFamily: "monospace" }}>
              {soul?.compositeHash?.slice(0, 8) ?? "—"}
            </div>
            <div style={{ fontSize: 10, color: MUTED, marginTop: 4 }}>Composite hash</div>
          </div>
        </div>

        {/* Catalogue counts + checklist */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
          {catalogueChecklist.map(({ label, count, guidance, threshold }) => {
            const ok = count >= threshold;
            return (
              <div key={label} style={{ background: BG, border: `1px solid ${ok ? BORDER : AMBER}`, borderRadius: 6, padding: "12px 14px" }}>
                <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
                  <span style={{ fontWeight: 700, fontSize: 13, color: TEXT }}>{label}</span>
                  <span style={{ fontWeight: 700, fontSize: 18, color: ok ? GREEN : AMBER }}>{count}</span>
                </div>
                <div style={{ fontSize: 11, color: MUTED }}>{guidance}</div>
              </div>
            );
          })}
        </div>

        <div style={{ marginTop: 12, display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
          {[
            { label: "Charter hash",   value: soul?.charterHash },
            { label: "Catalogue hash", value: soul?.catalogueHash },
          ].map(({ label, value }) => (
            <div key={label} style={{ background: BG, border: `1px solid ${BORDER}`, borderRadius: 4, padding: "8px 12px" }}>
              <div style={{ fontSize: 10, color: MUTED, marginBottom: 2 }}>{label}</div>
              <div style={{ fontSize: 12, color: BLUE, fontFamily: "monospace" }}>{value ?? "—"}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Sign-off form */}
      <div style={SECTION}>
        <div style={H2}>MLRO Sign-Off</div>
        <p style={{ fontSize: 12, color: MUTED, marginBottom: 16 }}>
          Signing off confirms you have reviewed the brain catalogue counts, integrity hashes, and soul status above,
          and that the system remains compliant with CR 134/2025 Art.18 and FDL 10/2025.
        </p>
        <form onSubmit={(e) => { void handleSignOff(e); }} style={{ display: "grid", gap: 12 }}>
          <div>
            <label style={{ display: "block", fontSize: 11, color: MUTED, marginBottom: 4 }}>
              Admin token (ADMIN_TOKEN) *
            </label>
            <input
              type="password"
              value={adminToken}
              onChange={(e) => setAdminToken(e.target.value)}
              placeholder="Bearer token"
              style={INPUT_STYLE}
              required
            />
          </div>
          <div>
            <label style={{ display: "block", fontSize: 11, color: MUTED, marginBottom: 4 }}>
              Reviewer name
            </label>
            <input
              type="text"
              value={reviewer}
              onChange={(e) => setReviewer(e.target.value)}
              placeholder="e.g. Jane Smith, MLRO"
              style={INPUT_STYLE}
            />
          </div>
          <div>
            <label style={{ display: "block", fontSize: 11, color: MUTED, marginBottom: 4 }}>
              Review note (optional)
            </label>
            <textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="e.g. 'All 15 faculties confirmed. No deprecated skills identified. Reasoning modes reviewed — stubs noted as expected.'"
              rows={3}
              style={{ ...INPUT_STYLE, resize: "vertical" as const }}
            />
          </div>
          <div>
            <button type="submit" disabled={submitting} style={{ ...BTN, opacity: submitting ? 0.6 : 1 }}>
              {submitting ? "Submitting…" : "Sign off catalogue review"}
            </button>
          </div>
          {submitResult && (
            <div style={{
              padding: "10px 14px",
              borderRadius: 6,
              fontSize: 12,
              background: submitResult.ok ? `${GREEN}22` : `${RED}22`,
              borderLeft: `3px solid ${submitResult.ok ? GREEN : RED}`,
              color: submitResult.ok ? GREEN : RED,
            }}>
              {submitResult.message}
            </div>
          )}
        </form>
      </div>

      {/* Regulatory anchor */}
      <div style={{ fontSize: 11, color: MUTED, marginTop: 8 }}>
        Regulatory basis: CR No.134/2025 Art.18 (MLRO review before case action) ·
        UAE FDL No.10/2025 Art.14, 26-27 · ISO/IEC 42001 §6.1.2
      </div>
    </div>
  );
}
