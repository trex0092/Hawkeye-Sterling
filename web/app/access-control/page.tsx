"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { ModuleHero, ModuleLayout } from "@/components/layout/ModuleLayout";
import { ModuleFamilyBar } from "@/components/layout/ModuleFamilyBar";
import { apiErrorMessage, caughtErrorMessage } from "@/lib/client/error-utils";

// ─── Types ────────────────────────────────────────────────────────────────────

type UserRole = "compliance" | "management" | "logistics" | "trading" | "accounts";

const ROLE_LABEL: Record<UserRole, string> = {
  compliance: "Compliance Department",
  management: "Management Department",
  logistics: "Logistic Department",
  trading: "Trading Department",
  accounts: "Accounts Department",
};

interface AccessUser {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  lastLogin: string;
  active: boolean;
  modules: string[];
  username?: string;
}

interface PermissionLogEntry {
  id: string;
  timestamp: string;
  actor: string;
  action: "role_assigned" | "role_revoked" | "session_revoked" | "manual";
  targetUserId: string;
  targetUserName: string;
  oldRole?: string;
  newRole?: string;
  reason: string;
}

interface RoleRecommendation {
  recommendedRole: string;
  rationale: string;
  suggestedModules: string[];
  risks: string[];
}

// ─── Constants ────────────────────────────────────────────────────────────────

const TABS = ["👥 Users", "🔑 Permission Matrix", "👁️ Session Monitor", "📋 Audit Log"] as const;
type Tab = (typeof TABS)[number];

const ROLE_COLORS: Record<UserRole, string> = {
  compliance: "bg-brand/15 text-brand",
  management: "bg-amber-dim text-amber",
  logistics: "bg-blue-dim text-blue",
  trading: "bg-green-dim text-green",
  accounts: "bg-violet-dim text-violet",
};

const ALL_MODULES = [
  "Screening",
  "STR Cases",
  "MLRO Advisor",
  "Oversight",
  "Responsible AI",
  "EWRA",
  "Playbook",
  "Investigation",
  "Audit Trail",
  "Access Control",
];

const ROLES: UserRole[] = ["compliance", "management", "logistics", "trading", "accounts"];

// Permission matrix: "full" | "read" | "none"
type AccessLevel = "full" | "read" | "none";
const MATRIX: Record<UserRole, Record<string, AccessLevel>> = {
  compliance: {
    Screening: "full",
    "STR Cases": "full",
    "MLRO Advisor": "full",
    Oversight: "full",
    "Responsible AI": "full",
    EWRA: "full",
    Playbook: "full",
    Investigation: "full",
    "Audit Trail": "full",
    "Access Control": "full",
  },
  management: {
    Screening: "full",
    "STR Cases": "full",
    "MLRO Advisor": "read",
    Oversight: "full",
    "Responsible AI": "none",
    EWRA: "full",
    Playbook: "none",
    Investigation: "none",
    "Audit Trail": "read",
    "Access Control": "none",
  },
  logistics: {
    Screening: "full",
    "STR Cases": "none",
    "MLRO Advisor": "none",
    Oversight: "none",
    "Responsible AI": "none",
    EWRA: "none",
    Playbook: "none",
    Investigation: "read",
    "Audit Trail": "read",
    "Access Control": "none",
  },
  trading: {
    Screening: "full",
    "STR Cases": "none",
    "MLRO Advisor": "none",
    Oversight: "none",
    "Responsible AI": "none",
    EWRA: "none",
    Playbook: "none",
    Investigation: "none",
    "Audit Trail": "read",
    "Access Control": "none",
  },
  accounts: {
    Screening: "full",
    "STR Cases": "none",
    "MLRO Advisor": "none",
    Oversight: "none",
    "Responsible AI": "none",
    EWRA: "none",
    Playbook: "none",
    Investigation: "none",
    "Audit Trail": "read",
    "Access Control": "none",
  },
};

interface AccessSession {
  id: string;
  userId: string;
  userName: string;
  role: string;
  ipDisplay: string;
  userAgent: string;
  started: string;
  lastActive: string;
  active: boolean;
}

function SessionMonitorTab() {
  const [sessions, setSessions] = useState<AccessSession[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [revoking, setRevoking] = useState<string | null>(null);

  const fetchSessions = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/access/sessions");
      if (!res.ok) {
        if (res.status === 401) throw new Error("Authentication required — please refresh the page.");
        throw new Error(apiErrorMessage(res.status));
      }
      const data = await res.json() as { ok: boolean; sessions?: AccessSession[]; error?: string };
      if (!data.ok) throw new Error(data.error ?? "Failed to load sessions");
      setSessions(data.sessions ?? []);
    } catch (e) {
      setError(caughtErrorMessage(e, "Network error"));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void fetchSessions(); }, [fetchSessions]);

  const revokeSession = async (id: string, userName: string) => {
    if (!confirm(`Revoke all sessions for ${userName}? This will immediately sign them out.`)) return;
    setRevoking(id);
    try {
      const res = await fetch(`/api/access/sessions?id=${encodeURIComponent(id)}`, { method: "DELETE" });
      if (!res.ok) throw new Error(apiErrorMessage(res.status));
      void fetchSessions();
    } catch (e) {
      alert(caughtErrorMessage(e, "Revoke failed"));
    } finally {
      setRevoking(null);
    }
  };

  const active = sessions.filter((s) => s.active);
  const inactive = sessions.filter((s) => !s.active);

  if (loading) return <p className="text-12 text-ink-3 py-6 text-center">Loading sessions…</p>;
  if (error) return <p role="alert" aria-live="assertive" className="text-12 text-red py-4">{error}</p>;

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-14 font-semibold text-ink-0">
          {active.length} active session{active.length !== 1 ? "s" : ""}
          {inactive.length > 0 && (
            <span className="ml-2 text-11 text-ink-3 font-normal">· {inactive.length} inactive</span>
          )}
        </h2>
        <button
          onClick={() => void fetchSessions()}
          disabled={loading}
          className="px-2 py-1 text-12 font-mono border border-green/40 rounded text-green bg-green-dim hover:bg-green-dim/70 transition-colors disabled:opacity-50"
        >
          ↻
        </button>
      </div>

      {sessions.length === 0 ? (
        <div className="rounded-lg border border-hair-2 bg-bg-2 px-5 py-8 text-center">
          <p className="text-12 text-ink-3">No sessions recorded yet.</p>
          <p className="text-11 text-ink-4 mt-1">Sessions are created on login and tracked here automatically.</p>
        </div>
      ) : (
        <div className="border border-hair-2 rounded-md overflow-hidden">
          <table className="w-full text-12">
            <thead>
              <tr className="border-b border-hair bg-bg-2">
                <th className="text-left px-4 py-2.5 text-10 font-mono uppercase tracking-wide-4 text-ink-2">User</th>
                <th className="text-left px-4 py-2.5 text-10 font-mono uppercase tracking-wide-4 text-ink-2">Role</th>
                <th className="text-left px-4 py-2.5 text-10 font-mono uppercase tracking-wide-4 text-ink-2">IP</th>
                <th className="text-left px-4 py-2.5 text-10 font-mono uppercase tracking-wide-4 text-ink-2">Started</th>
                <th className="text-left px-4 py-2.5 text-10 font-mono uppercase tracking-wide-4 text-ink-2">Last Active</th>
                <th className="text-left px-4 py-2.5 text-10 font-mono uppercase tracking-wide-4 text-ink-2">Status</th>
                <th className="px-4 py-2.5" />
              </tr>
            </thead>
            <tbody>
              {sessions.map((s, i) => (
                <tr key={s.id} className={`border-b border-hair last:border-0 ${i % 2 === 0 ? "" : "bg-bg-2/30"}`}>
                  <td className="px-4 py-2.5">
                    <div className="font-semibold text-ink-0">{s.userName}</div>
                    <div className="text-10 font-mono text-ink-4 truncate max-w-[180px]" title={s.id}>{s.id}</div>
                  </td>
                  <td className="px-4 py-2.5 font-mono text-ink-2 text-11">{s.role}</td>
                  <td className="px-4 py-2.5 font-mono text-ink-2">{s.ipDisplay}</td>
                  <td className="px-4 py-2.5 text-ink-2">{fmtDate(s.started)}</td>
                  <td className="px-4 py-2.5 text-ink-2">{fmtDate(s.lastActive)}</td>
                  <td className="px-4 py-2.5">
                    {s.active ? (
                      <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-9 font-bold uppercase bg-green-dim text-green border border-green/30">
                        <span className="w-1.5 h-1.5 rounded-full bg-green animate-pulse" />
                        active
                      </span>
                    ) : (
                      <span className="inline-flex items-center px-1.5 py-0.5 rounded text-9 font-bold uppercase bg-bg-2 text-ink-3 border border-hair">
                        inactive
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-2.5 text-right">
                    {s.active && (
                      <button
                        onClick={() => void revokeSession(s.id, s.userName)}
                        disabled={revoking === s.id}
                        className="px-2 py-1 text-10 font-mono border border-red/40 rounded text-red bg-red-dim hover:bg-red-dim/70 transition-colors disabled:opacity-50"
                      >
                        {revoking === s.id ? "…" : "Revoke"}
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {sessions.length > 0 && (
        <p className="text-10 text-ink-4 mt-3">
          IPs are partially masked for privacy. Revoking a session invalidates all active tokens for that user.
        </p>
      )}
    </div>
  );
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmtDate(iso: string) {
  try {
    return new Date(iso).toLocaleString("en-GB", {
      day: "2-digit",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return iso;
  }
}

function RoleBadge({ role }: { role: UserRole }) {
  return (
    <span
      className={`inline-flex items-center px-2 py-0.5 rounded text-10 font-mono font-semibold uppercase tracking-wide ${ROLE_COLORS[role]}`}
    >
      {ROLE_LABEL[role]}
    </span>
  );
}

function AccessCell({ level }: { level: AccessLevel }) {
  if (level === "full")
    return <span className="text-green font-semibold text-13">✓</span>;
  if (level === "read")
    return <span className="text-amber font-semibold text-13">◐</span>;
  return <span className="text-ink-3 text-13">—</span>;
}

// ─── Side Panel ───────────────────────────────────────────────────────────────

interface SidePanelProps {
  user: AccessUser;
  onClose: () => void;
  onRoleChanged: (_updated: AccessUser) => void;
}

function UserSidePanel({ user, onClose, onRoleChanged }: SidePanelProps) {
  const [selectedRole, setSelectedRole] = useState<UserRole>(user.role);
  const [reason, setReason] = useState("");
  const [saving, setSaving] = useState(false);
  const [roleError, setRoleError] = useState<string | null>(null);
  const [impact, setImpact] = useState<string | null>(null);
  const [aiLoading, setAiLoading] = useState(false);
  const [aiResult, setAiResult] = useState<RoleRecommendation | null>(null);
  const [aiError, setAiError] = useState<string | null>(null);
  const [newUsername, setNewUsername] = useState(user.username ?? "");
  const [newPassword, setNewPassword] = useState("");
  const [pwSaving, setPwSaving] = useState(false);
  const [pwMsg, setPwMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const mountedRef = useRef(true);
  useEffect(() => () => { mountedRef.current = false; }, []);

  const handleSetPassword = async () => {
    if (!newPassword.trim()) return;
    setPwSaving(true);
    setPwMsg(null);
    try {
      const resp = await fetch("/api/access/set-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId: user.id, newPassword: newPassword.trim(), username: newUsername.trim() || undefined }),
      });
      const data = await resp.json().catch(() => ({})) as { ok: boolean; error?: string };
      if (!mountedRef.current) return;
      if (!resp.ok || !data.ok) {
        setPwMsg({ ok: false, text: data.error ?? apiErrorMessage(resp.status) });
      } else {
        setPwMsg({ ok: true, text: "Credentials updated successfully." });
        setNewPassword("");
      }
    } catch {
      if (mountedRef.current) setPwMsg({ ok: false, text: "Network error — please try again." });
    } finally {
      if (mountedRef.current) setPwSaving(false);
    }
  };

  // AI Recommend
  const handleAiRecommend = async () => {
    setAiLoading(true);
    setAiError(null);
    setAiResult(null);
    try {
      const resp = await fetch("/api/access/ai-recommend", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userName: user.name,
          jobTitle: user.role,
          department: "Compliance",
          responsibilities: `Current role: ${user.role}. Modules: ${user.modules.join(", ")}.`,
        }),
      });
      const data = await resp.json().catch(() => ({})) as RoleRecommendation & { ok?: boolean };
      if (!resp.ok) throw new Error(apiErrorMessage(resp.status));
      if (mountedRef.current) setAiResult(data);
    } catch {
      if (mountedRef.current) setAiError("AI recommendation unavailable.");
    } finally {
      if (mountedRef.current) setAiLoading(false);
    }
  };

  const handleSave = async () => {
    if (selectedRole === user.role) return;
    if (!reason.trim()) return;
    setSaving(true);
    setImpact(null);
    setRoleError(null);
    try {
      const resp = await fetch("/api/access/assign-role", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userId: user.id,
          newRole: selectedRole,
          reason: reason.trim(),
        }),
      });
      const data = await resp.json().catch(() => ({})) as { ok: boolean; user?: AccessUser; impactAssessment?: string; error?: string };
      if (!mountedRef.current) return;
      if (!resp.ok || !data.ok || !data.user) {
        console.error("[hawkeye] access-control role-change rejected:", data);
        setRoleError(data.error ?? apiErrorMessage(resp.status));
      } else {
        setImpact(data.impactAssessment ?? null);
        onRoleChanged(data.user);
      } else {
        console.error("[hawkeye] access-control role-change rejected:", data);
        setRoleError(data.error ?? "Role change was rejected by the server.");
      }
    } catch (err) {
      console.error("[hawkeye] access-control role-change threw — UI may show stale role:", err);
      if (mountedRef.current) setRoleError("Network error — role change could not be saved. Please try again.");
    } finally {
      if (mountedRef.current) setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      {/* backdrop */}
      <button
        className="absolute inset-0 bg-black/40 cursor-default"
        onClick={onClose}
        aria-label="Close panel"
      />
      <aside className="relative w-[420px] bg-bg-panel border-l border-hair-2 h-full overflow-y-auto flex flex-col">
        {/* Header */}
        <div className="flex items-start justify-between px-6 pt-6 pb-4 border-b border-hair">
          <div>
            <div className="text-11 font-mono uppercase tracking-wide-4 text-ink-2 mb-1">User profile</div>
            <h2 className="text-20 font-display font-semibold text-ink-0">{user.name}</h2>
            <div className="text-12 text-ink-2 mt-0.5">{user.email}</div>
          </div>
          <button
            onClick={onClose}
            className="text-ink-2 hover:text-ink-0 text-20 leading-none mt-1 ml-4"
          >
            ✕
          </button>
        </div>

        <div className="flex-1 px-6 py-5 flex flex-col gap-6">
          {/* Status row */}
          <div className="flex items-center gap-3">
            <RoleBadge role={user.role} />
            <span
              className={`inline-flex items-center gap-1.5 text-11 font-mono uppercase tracking-wide ${user.active ? "text-green" : "text-red"}`}
            >
              <span
                className={`w-1.5 h-1.5 rounded-full ${user.active ? "bg-green" : "bg-red"}`}
              />
              {user.active ? "Active" : "Inactive"}
            </span>
            <span className="text-11 text-ink-2 ml-auto">
              Last login {fmtDate(user.lastLogin)}
            </span>
          </div>

          {/* Modules */}
          <div>
            <div className="text-11 font-mono uppercase tracking-wide-4 text-ink-2 mb-2">
              Module access
            </div>
            <div className="flex flex-wrap gap-1.5">
              {ALL_MODULES.map((mod) => {
                const has = user.modules.includes(mod);
                return (
                  <span
                    key={mod}
                    className={`px-2 py-0.5 rounded text-10 font-mono ${has ? "bg-brand/10 text-brand" : "bg-bg-2 text-ink-3"}`}
                  >
                    {mod}
                  </span>
                );
              })}
            </div>
          </div>

          {/* Role editor */}
          <div className="border border-hair-2 rounded-md p-4 flex flex-col gap-3 bg-bg-2">
            <div className="text-11 font-mono uppercase tracking-wide-4 text-ink-2">
              Change role
            </div>
            <div className="flex flex-wrap gap-2">
              {ROLES.map((r) => (
                <button
                  key={r}
                  onClick={() => setSelectedRole(r)}
                  className={`px-3 py-1.5 rounded text-11 font-mono uppercase font-semibold border transition-colors ${
                    selectedRole === r
                      ? "border-brand bg-brand/10 text-brand"
                      : "border-hair-2 text-ink-2 hover:border-ink-2"
                  }`}
                >
                  {r}
                </button>
              ))}
            </div>
            <input
              type="text"
              placeholder="Reason for change (required)"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              className="bg-bg-panel border border-hair-2 rounded px-3 py-2 text-12 text-ink-0 placeholder:text-ink-3 focus:outline-none focus:border-brand"
            />
            <div className="flex gap-2">
              <button
                onClick={handleSave}
                disabled={saving || selectedRole === user.role || !reason.trim()}
                className="flex-1 py-2 rounded bg-brand text-black text-12 font-semibold disabled:opacity-40 hover:bg-brand/90 transition-colors"
              >
                {saving ? "Saving…" : "Apply role change"}
              </button>
            </div>
            {roleError && (
              <div className="text-12 px-3 py-2 rounded border bg-red-dim text-red border-red/20">
                {roleError}
              </div>
            )}
            {impact && (
              <div className="text-12 text-ink-1 bg-bg-panel border border-hair rounded p-3 leading-relaxed">
                <span className="text-brand font-semibold text-10 uppercase font-mono tracking-wide block mb-1">
                  Impact assessment
                </span>
                {impact}
              </div>
            )}
          </div>

          {/* AI Recommend */}
          <div className="border border-hair-2 rounded-md p-4 flex flex-col gap-3 bg-bg-2">
            <div className="flex items-center justify-between">
              <div className="text-11 font-mono uppercase tracking-wide-4 text-ink-2">
                AI role recommendation
              </div>
              <button
                onClick={handleAiRecommend}
                disabled={aiLoading}
                className="px-3 py-1.5 rounded bg-bg-panel border border-brand text-brand text-11 font-mono font-semibold hover:bg-brand/10 transition-colors disabled:opacity-40"
              >
                {aiLoading ? "Analysing…" : "✦AI"}
              </button>
            </div>
            {aiError && <div className="text-red text-12">{aiError}</div>}
            {aiResult && (
              <div className="flex flex-col gap-2">
                <div className="flex items-center gap-2">
                  <span className="text-11 text-ink-2 font-mono uppercase tracking-wide">Recommended:</span>
                  <RoleBadge role={aiResult.recommendedRole as UserRole} />
                </div>
                <p className="text-12 text-ink-1 leading-relaxed">{aiResult.rationale}</p>
                <div>
                  <span className="text-10 font-mono uppercase text-ink-2 tracking-wide">Suggested modules</span>
                  <div className="flex flex-wrap gap-1 mt-1">
                    {aiResult.suggestedModules.map((m) => (
                      <span key={m} className="px-1.5 py-0.5 rounded text-10 font-mono bg-brand/10 text-brand">
                        {m}
                      </span>
                    ))}
                  </div>
                </div>
                <div>
                  <span className="text-10 font-mono uppercase text-ink-2 tracking-wide">Risks</span>
                  <ul className="mt-1 list-disc list-inside space-y-0.5">
                    {aiResult.risks.map((r, i) => (
                      <li key={i} className="text-12 text-ink-1">
                        {r}
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            )}
          </div>

          {/* Credentials management */}
          <div className="border border-hair-2 rounded-md p-4 flex flex-col gap-3 bg-bg-2">
            <div className="text-11 font-mono uppercase tracking-wide-4 text-ink-2">
              🔐 Login credentials
            </div>
            <div>
              <label className="block text-10 font-mono uppercase tracking-wide text-ink-2 mb-1">Username</label>
              <input
                type="text"
                value={newUsername}
                onChange={(e) => setNewUsername(e.target.value)}
                placeholder={user.username ?? "e.g. j.smith"}
                className="w-full bg-bg-panel border border-hair-2 rounded px-3 py-2 text-12 text-ink-0 font-mono placeholder:text-ink-3 focus:outline-none focus:border-brand"
              />
            </div>
            <div>
              <label className="block text-10 font-mono uppercase tracking-wide text-ink-2 mb-1">New password</label>
              <input
                type="password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                placeholder="Min. 8 characters"
                className="w-full bg-bg-panel border border-hair-2 rounded px-3 py-2 text-12 text-ink-0 placeholder:text-ink-3 focus:outline-none focus:border-brand"
              />
            </div>
            {pwMsg && (
              <div className={`text-12 px-3 py-2 rounded border ${pwMsg.ok ? "bg-green-dim text-green border-green/20" : "bg-red-dim text-red border-red/20"}`}>
                {pwMsg.text}
              </div>
            )}
            <button
              onClick={() => { void handleSetPassword(); }}
              disabled={pwSaving || !newPassword.trim()}
              className="py-2 rounded bg-bg-panel border border-hair-2 text-ink-1 text-12 font-semibold hover:border-brand hover:text-brand disabled:opacity-40 transition-colors"
            >
              {pwSaving ? "Saving…" : "Update credentials"}
            </button>
          </div>
        </div>
      </aside>
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function AccessControlPage() {
  const [activeTab, setActiveTab] = useState<Tab>("👥 Users");
  const [users, setUsers] = useState<AccessUser[]>([]);
  const [log, setLog] = useState<PermissionLogEntry[]>([]);
  const [selectedUser, setSelectedUser] = useState<AccessUser | null>(null);
  const [loadingUsers, setLoadingUsers] = useState(false);
  const [loadingLog, setLoadingLog] = useState(false);
  const [showAddForm, setShowAddForm] = useState(false);
  const [addForm, setAddForm] = useState({ name: "", email: "", role: "compliance" as UserRole, username: "", password: "" });
  const [addingUser, setAddingUser] = useState(false);
  const [addError, setAddError] = useState("");
  const [newUserCreds, setNewUserCreds] = useState<{ username: string; password: string } | null>(null);
  const [revokeError, setRevokeError] = useState<string | null>(null);
  const [revokingId, setRevokingId] = useState<string | null>(null);

  const mountedRef = useRef(true);
  useEffect(() => () => { mountedRef.current = false; }, []);

  const mountedRef = useRef(true);
  useEffect(() => () => { mountedRef.current = false; }, []);

  // Load from sessionStorage or API (sessionStorage so sensitive user lists don't persist across sessions)
  const fetchUsers = useCallback(async () => {
    setLoadingUsers(true);
    try {
      const resp = await fetch("/api/access/users");
      const data = await resp.json().catch(() => ({})) as { ok: boolean; users?: AccessUser[] } | null;
      if (resp.ok && data?.ok && Array.isArray(data.users) && mountedRef.current) {
        setUsers(data.users);
        sessionStorage.setItem("hawkeye.access.users", JSON.stringify(data.users));
      }
    } catch {
      try {
        const cached = sessionStorage.getItem("hawkeye.access.users");
        if (cached && mountedRef.current) setUsers(JSON.parse(cached) as AccessUser[]);
      } catch { /* corrupted cache — ignore */ }
    } finally {
      if (mountedRef.current) setLoadingUsers(false);
    }
  }, []);

  const fetchLog = useCallback(async () => {
    setLoadingLog(true);
    try {
      const resp = await fetch("/api/access/permission-log");
      const data = await resp.json().catch(() => ({})) as { ok: boolean; log?: PermissionLogEntry[] };
      if (resp.ok && data.ok && data.log && mountedRef.current) {
        setLog(data.log);
        sessionStorage.setItem("hawkeye.access.log", JSON.stringify(data.log));
      }
    } catch {
      try {
        const cached = sessionStorage.getItem("hawkeye.access.log");
        if (cached && mountedRef.current) setLog(JSON.parse(cached) as PermissionLogEntry[]);
      } catch { /* corrupted cache — ignore */ }
    } finally {
      if (mountedRef.current) setLoadingLog(false);
    }
  }, []);

  useEffect(() => {
    // Hydrate from sessionStorage immediately (guarded against corrupted data)
    try {
      const cachedUsers = sessionStorage.getItem("hawkeye.access.users");
      if (cachedUsers) setUsers(JSON.parse(cachedUsers) as AccessUser[]);
      const cachedLog = sessionStorage.getItem("hawkeye.access.log");
      if (cachedLog) setLog(JSON.parse(cachedLog) as PermissionLogEntry[]);
    } catch { /* corrupted cache — will be replaced by API response */ }

    void fetchUsers();
    void fetchLog();
  }, [fetchUsers, fetchLog]);

  const handleRoleChanged = (updated: AccessUser) => {
    setUsers((prev) => prev.map((u) => (u.id === updated.id ? updated : u)));
    setSelectedUser(updated);
    void fetchLog();
  };

  const handleAddUser = async (e: React.FormEvent) => {
    e.preventDefault();
    setAddError("");
    if (!addForm.name.trim() || !addForm.email.trim()) {
      setAddError("Name and email are required.");
      return;
    }
    setAddingUser(true);
    try {
      const resp = await fetch("/api/access/add-user", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(addForm),
      });
      const data = await resp.json().catch(() => ({})) as { ok: boolean; user?: AccessUser; error?: string; initialPassword?: string };
      if (!mountedRef.current) return;
      if (!resp.ok || !data.ok) { setAddError(data.error ?? apiErrorMessage(resp.status)); return; }
      if (data.user) {
        setUsers((prev) => [...prev, data.user!]);
        setNewUserCreds({ username: data.user!.username ?? "", password: data.initialPassword ?? "" });
      }
      setAddForm({ name: "", email: "", role: "compliance", username: "", password: "" });
      setShowAddForm(false);
      void fetchLog();
    } catch {
      if (mountedRef.current) setAddError("Network error — please try again.");
    } finally {
      if (mountedRef.current) setAddingUser(false);
    }
  };

  // KPIs
  const totalUsers = users.length;
  const now = new Date();
  const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
  const roleChangesThisWeek = log.filter(
    (e) => e.action === "role_assigned" && new Date(e.timestamp) >= weekAgo,
  ).length;
  const totalAuditEvents = log.length;

  return (
    <ModuleLayout engineLabel="Access control engine" asanaModule="access-control" asanaLabel="Access & Permissions">
      <ModuleFamilyBar suiteName="Security" modules={[
        { label: "Security Scan", href: "/security-scan", icon: "🛡️" },
        { label: "Audit Trail", href: "/audit-trail", icon: "🔒" },
        { label: "Access Control", href: "/access-control", icon: "🔐" },
        { label: "Analyst Behavior", href: "/analyst-behavior", icon: "👁️" },
      ]} />
      <ModuleHero

        eyebrow="Module 34 · Governance"
        title="Access &"
        titleEm="permissions."
        kpis={[
          { value: String(totalUsers), label: "Total users" },
          { value: String(totalAuditEvents), label: "Permission events" },
          { value: String(roleChangesThisWeek), label: "Role changes this week" },
          { value: String(ALL_MODULES.length), label: "Modules protected" },
        ]}
        intro="Manage platform users, roles, and module permissions. All access changes are logged in the immutable permission audit trail in accordance with UAE FDL 10/2025 Art.20 segregation-of-duties requirements."
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

      {/* ── Tab 1: Users ────────────────────────────────────────────────────── */}
      {activeTab === "👥 Users" && (
        <div>
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-14 font-semibold text-ink-0">
              {loadingUsers ? "Loading users…" : `${users.length} users`}
            </h2>
            <button
              type="button"
              onClick={() => { setShowAddForm((v) => !v); setAddError(""); }}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-brand text-white text-12 font-semibold rounded hover:bg-brand/90 transition-colors"
            >
              <span className="text-14 leading-none">+</span> Add user
            </button>
          </div>

          {/* Credentials display after adding a user */}
          {newUserCreds && (
            <div className="mb-5 border border-green/30 rounded-md p-4 bg-green-dim flex flex-col gap-2">
              <div className="flex items-center justify-between">
                <span className="text-11 font-mono uppercase tracking-wide text-green font-semibold">✓ User created — save these credentials</span>
                <button onClick={() => setNewUserCreds(null)} className="text-green/60 hover:text-green text-14 leading-none">✕</button>
              </div>
              <div className="flex gap-6 text-12 font-mono">
                <div>
                  <span className="text-green/60 text-10 uppercase block mb-0.5">Username</span>
                  <span className="text-green font-semibold">{newUserCreds.username}</span>
                </div>
                <div>
                  <span className="text-green/60 text-10 uppercase block mb-0.5">Temporary password</span>
                  <span className="text-green font-semibold">{newUserCreds.password}</span>
                </div>
              </div>
              <p className="text-11 text-green/70">Share these credentials securely with the user. They can change their password from their profile.</p>
            </div>
          )}

          {/* Add User form */}
          {showAddForm && (
            <form onSubmit={(e) => { void handleAddUser(e); }} className="mb-5 border border-hair-2 rounded-md p-4 bg-bg-1">
              <h3 className="text-13 font-semibold text-ink-0 mb-3">Add new user</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-3">
                <div>
                  <label className="block text-10 font-mono uppercase tracking-wide-4 text-ink-2 mb-1">Full name</label>
                  <input
                    type="text"
                    required
                    value={addForm.name}
                    onChange={(e) => setAddForm((f) => ({ ...f, name: e.target.value }))}
                    placeholder="e.g. Sara Al Maktoum"
                    className="w-full bg-bg-panel border border-hair-2 rounded px-3 py-1.5 text-12 text-ink-0 placeholder:text-ink-3 focus:outline-none focus:border-brand"
                  />
                </div>
                <div>
                  <label className="block text-10 font-mono uppercase tracking-wide-4 text-ink-2 mb-1">Email</label>
                  <input
                    type="email"
                    required
                    value={addForm.email}
                    onChange={(e) => setAddForm((f) => ({ ...f, email: e.target.value }))}
                    placeholder="e.g. s.almaktoum@hawkeyesterling.ae"
                    className="w-full bg-bg-panel border border-hair-2 rounded px-3 py-1.5 text-12 text-ink-0 placeholder:text-ink-3 focus:outline-none focus:border-brand"
                  />
                </div>
                <div>
                  <label className="block text-10 font-mono uppercase tracking-wide-4 text-ink-2 mb-1">Username <span className="text-ink-3 normal-case">(auto if blank)</span></label>
                  <input
                    type="text"
                    value={addForm.username}
                    onChange={(e) => setAddForm((f) => ({ ...f, username: e.target.value }))}
                    placeholder="e.g. s.almaktoum"
                    className="w-full bg-bg-panel border border-hair-2 rounded px-3 py-1.5 text-12 text-ink-0 font-mono placeholder:text-ink-3 focus:outline-none focus:border-brand"
                  />
                </div>
                <div>
                  <label className="block text-10 font-mono uppercase tracking-wide-4 text-ink-2 mb-1">Initial password <span className="text-ink-3 normal-case">(auto if blank)</span></label>
                  <input
                    type="text"
                    value={addForm.password}
                    onChange={(e) => setAddForm((f) => ({ ...f, password: e.target.value }))}
                    placeholder={`Hawkeye@${new Date().getFullYear()}!`}
                    className="w-full bg-bg-panel border border-hair-2 rounded px-3 py-1.5 text-12 text-ink-0 font-mono placeholder:text-ink-3 focus:outline-none focus:border-brand"
                  />
                </div>
                <div className="md:col-span-2">
                  <label className="block text-10 font-mono uppercase tracking-wide-4 text-ink-2 mb-1">Role</label>
                  <select
                    value={addForm.role}
                    onChange={(e) => setAddForm((f) => ({ ...f, role: e.target.value as UserRole }))}
                    className="w-full bg-bg-panel border border-hair-2 rounded px-3 py-1.5 text-12 text-ink-0 focus:outline-none focus:border-brand"
                  >
                    {ROLES.map((r) => (
                      <option key={r} value={r}>{ROLE_LABEL[r]}</option>
                    ))}
                  </select>
                </div>
              </div>
              {addError && <p className="text-11 text-red mb-2">{addError}</p>}
              <div className="flex gap-2">
                <button
                  type="submit"
                  disabled={addingUser}
                  className="px-4 py-1.5 bg-brand text-white text-12 font-semibold rounded hover:bg-brand/90 disabled:opacity-50 transition-colors"
                >
                  {addingUser ? "Adding…" : "Add user"}
                </button>
                <button
                  type="button"
                  onClick={() => { setShowAddForm(false); setAddError(""); setAddForm({ name: "", email: "", role: "compliance", username: "", password: "" }); }}
                  className="px-4 py-1.5 border border-hair-2 text-ink-2 text-12 rounded hover:text-ink-0 transition-colors"
                >
                  Cancel
                </button>
              </div>
            </form>
          )}

          <div className="border border-hair-2 rounded-md overflow-hidden">
            <table className="w-full text-12">
              <thead>
                <tr className="border-b border-hair bg-bg-2">
                  <th className="text-left px-4 py-2.5 text-10 font-mono uppercase tracking-wide-4 text-ink-2">Name</th>
                  <th className="text-left px-4 py-2.5 text-10 font-mono uppercase tracking-wide-4 text-ink-2">Username</th>
                  <th className="text-left px-4 py-2.5 text-10 font-mono uppercase tracking-wide-4 text-ink-2">Email</th>
                  <th className="text-left px-4 py-2.5 text-10 font-mono uppercase tracking-wide-4 text-ink-2">Role</th>
                  <th className="text-left px-4 py-2.5 text-10 font-mono uppercase tracking-wide-4 text-ink-2">Last login</th>
                  <th className="text-left px-4 py-2.5 text-10 font-mono uppercase tracking-wide-4 text-ink-2">Status</th>
                </tr>
              </thead>
              <tbody>
                {users.map((u, i) => (
                  <tr
                    key={u.id}
                    onClick={() => setSelectedUser(u)}
                    className={`border-b border-hair last:border-0 cursor-pointer hover:bg-bg-2 transition-colors ${
                      i % 2 === 0 ? "" : "bg-bg-1/30"
                    }`}
                  >
                    <td className="px-4 py-3 font-medium text-ink-0">{u.name}</td>
                    <td className="px-4 py-3 text-ink-1 font-mono text-11">{u.username ?? <span className="text-ink-3">—</span>}</td>
                    <td className="px-4 py-3 text-ink-2 font-mono text-11">{u.email}</td>
                    <td className="px-4 py-3">
                      <RoleBadge role={u.role} />
                    </td>
                    <td className="px-4 py-3 text-ink-2">{fmtDate(u.lastLogin)}</td>
                    <td className="px-4 py-3">
                      <span
                        className={`inline-flex items-center gap-1.5 text-11 font-mono uppercase ${
                          u.active ? "text-green" : "text-red"
                        }`}
                      >
                        <span
                          className={`w-1.5 h-1.5 rounded-full ${u.active ? "bg-green" : "bg-red"}`}
                        />
                        {u.active ? "Active" : "Inactive"}
                      </span>
                    </td>
                  </tr>
                ))}
                {users.length === 0 && !loadingUsers && (
                  <tr>
                    <td colSpan={6} className="px-4 py-8 text-center text-ink-2 text-12">
                      No users found.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
          <p className="text-11 text-ink-3 mt-3">
            Click any row to open the role editor and AI recommendation panel.
          </p>
        </div>
      )}

      {/* ── Tab 2: Permission Matrix ─────────────────────────────────────────── */}
      {activeTab === "🔑 Permission Matrix" && (
        <div>
          <div className="mb-4">
            <h2 className="text-14 font-semibold text-ink-0 mb-1">Permission matrix</h2>
            <p className="text-12 text-ink-2">
              <span className="text-green font-semibold">✓</span> Full access &nbsp;·&nbsp;
              <span className="text-amber font-semibold">◐</span> Read-only &nbsp;·&nbsp;
              <span className="text-ink-3">—</span> No access
            </p>
          </div>
          <div className="border border-hair-2 rounded-md overflow-x-auto">
            <table className="w-full text-12 min-w-[720px]">
              <thead>
                <tr className="border-b border-hair bg-bg-2">
                  <th className="text-left px-4 py-2.5 text-10 font-mono uppercase tracking-wide-4 text-ink-2 w-28">
                    Role
                  </th>
                  {ALL_MODULES.map((mod) => (
                    <th
                      key={mod}
                      className="px-2 py-2.5 text-10 font-mono uppercase tracking-wide text-ink-2 text-center min-w-[72px]"
                    >
                      {mod}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {ROLES.map((role, i) => (
                  <tr
                    key={role}
                    className={`border-b border-hair last:border-0 ${i % 2 === 0 ? "" : "bg-bg-1/30"}`}
                  >
                    <td className="px-4 py-3">
                      <RoleBadge role={role} />
                    </td>
                    {ALL_MODULES.map((mod) => (
                      <td key={mod} className="px-2 py-3 text-center">
                        <AccessCell level={MATRIX[role][mod] ?? "none"} />
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ── Tab 3: Session Monitor ───────────────────────────────────────────── */}
      {activeTab === "👁️ Session Monitor" && <SessionMonitorTab />}

      {/* ── Tab 4: Audit Log ─────────────────────────────────────────────────── */}
      {activeTab === "📋 Audit Log" && (
        <div>
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-14 font-semibold text-ink-0">
              {loadingLog ? "Loading…" : `${log.length} permission events`}
            </h2>
            <button
              onClick={() => void fetchLog()}
              disabled={loadingLog}
              className="px-2 py-1 text-12 font-mono border border-green/40 rounded text-green bg-green-dim hover:bg-green-dim/70 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loadingLog ? "…" : "↻"}
            </button>
          </div>
          <div className="border border-hair-2 rounded-md overflow-hidden">
            <table className="w-full text-12">
              <thead>
                <tr className="border-b border-hair bg-bg-2">
                  <th className="text-left px-4 py-2.5 text-10 font-mono uppercase tracking-wide-4 text-ink-2">
                    Timestamp
                  </th>
                  <th className="text-left px-4 py-2.5 text-10 font-mono uppercase tracking-wide-4 text-ink-2">
                    Actor
                  </th>
                  <th className="text-left px-4 py-2.5 text-10 font-mono uppercase tracking-wide-4 text-ink-2">
                    Action
                  </th>
                  <th className="text-left px-4 py-2.5 text-10 font-mono uppercase tracking-wide-4 text-ink-2">
                    Target user
                  </th>
                  <th className="text-left px-4 py-2.5 text-10 font-mono uppercase tracking-wide-4 text-ink-2">
                    Role change
                  </th>
                  <th className="text-left px-4 py-2.5 text-10 font-mono uppercase tracking-wide-4 text-ink-2">
                    Reason
                  </th>
                </tr>
              </thead>
              <tbody>
                {[...log].reverse().map((entry, i) => (
                  <tr
                    key={entry.id}
                    className={`border-b border-hair last:border-0 ${i % 2 === 0 ? "" : "bg-bg-1/30"}`}
                  >
                    <td className="px-4 py-3 text-ink-2 font-mono text-11 whitespace-nowrap">
                      {fmtDate(entry.timestamp)}
                    </td>
                    <td className="px-4 py-3 text-ink-1">{entry.actor}</td>
                    <td className="px-4 py-3">
                      <ActionBadge action={entry.action} />
                    </td>
                    <td className="px-4 py-3 font-medium text-ink-0">{entry.targetUserName}</td>
                    <td className="px-4 py-3">
                      {entry.oldRole && entry.newRole ? (
                        <span className="font-mono text-11">
                          <span className="text-ink-2">{entry.oldRole}</span>
                          <span className="text-ink-3 mx-1">→</span>
                          <span className="text-brand">{entry.newRole}</span>
                        </span>
                      ) : (
                        <span className="text-ink-3">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-ink-2 max-w-[240px] truncate" title={entry.reason}>
                      {entry.reason}
                    </td>
                  </tr>
                ))}
                {log.length === 0 && !loadingLog && (
                  <tr>
                    <td colSpan={6} className="px-4 py-8 text-center text-ink-2 text-12">
                      No permission events recorded.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Side panel */}
      {selectedUser && (
        <UserSidePanel
          user={selectedUser}
          onClose={() => setSelectedUser(null)}
          onRoleChanged={handleRoleChanged}
        />
      )}
    </ModuleLayout>
  );
}

// ─── Action badge helper ──────────────────────────────────────────────────────

const ACTION_TONE: Record<string, string> = {
  role_assigned: "bg-blue-dim text-blue",
  role_revoked: "bg-red-dim text-red",
  session_revoked: "bg-amber-dim text-amber",
  manual: "bg-bg-2 text-ink-2",
};

function ActionBadge({ action }: { action: string }) {
  const cls = ACTION_TONE[action] ?? "bg-bg-2 text-ink-2";
  const label = action.replace(/_/g, " ");
  return (
    <span
      className={`inline-flex items-center px-1.5 py-px rounded text-10 font-mono font-semibold uppercase ${cls}`}
    >
      {label}
    </span>
  );
}
