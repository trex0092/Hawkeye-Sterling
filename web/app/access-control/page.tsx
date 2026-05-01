"use client";

import { useState, useEffect, useCallback } from "react";
import { ModuleHero, ModuleLayout } from "@/components/layout/ModuleLayout";

// ─── Types ────────────────────────────────────────────────────────────────────

type UserRole = "viewer" | "analyst" | "supervisor" | "mlro" | "admin";

interface AccessUser {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  lastLogin: string;
  active: boolean;
  modules: string[];
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
  viewer: "bg-bg-2 text-ink-2",
  analyst: "bg-blue-dim text-blue",
  supervisor: "bg-amber-dim text-amber",
  mlro: "bg-brand/15 text-brand",
  admin: "bg-red-dim text-red",
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

const ROLES: UserRole[] = ["viewer", "analyst", "supervisor", "mlro", "admin"];

// Permission matrix: "full" | "read" | "none"
type AccessLevel = "full" | "read" | "none";
const MATRIX: Record<UserRole, Record<string, AccessLevel>> = {
  viewer: {
    Screening: "read",
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
  analyst: {
    Screening: "full",
    "STR Cases": "full",
    "MLRO Advisor": "none",
    Oversight: "none",
    "Responsible AI": "none",
    EWRA: "none",
    Playbook: "none",
    Investigation: "full",
    "Audit Trail": "read",
    "Access Control": "none",
  },
  supervisor: {
    Screening: "full",
    "STR Cases": "full",
    "MLRO Advisor": "read",
    Oversight: "full",
    "Responsible AI": "none",
    EWRA: "full",
    Playbook: "full",
    Investigation: "full",
    "Audit Trail": "full",
    "Access Control": "none",
  },
  mlro: {
    Screening: "full",
    "STR Cases": "full",
    "MLRO Advisor": "full",
    Oversight: "full",
    "Responsible AI": "full",
    EWRA: "full",
    Playbook: "full",
    Investigation: "full",
    "Audit Trail": "full",
    "Access Control": "none",
  },
  admin: {
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
};

// Demo sessions
interface Session {
  id: string;
  userId: string;
  userName: string;
  ip: string;
  started: string;
  lastActive: string;
  active: boolean;
}

const DEMO_SESSIONS: Session[] = [
  {
    id: "sess-001",
    userId: "usr-001",
    userName: "Luisa Fernanda",
    ip: "10.0.1.42",
    started: "2025-04-30T07:50:00Z",
    lastActive: "2025-04-30T09:15:22Z",
    active: true,
  },
  {
    id: "sess-002",
    userId: "usr-002",
    userName: "Ahmed Rahman",
    ip: "10.0.1.55",
    started: "2025-04-30T07:55:00Z",
    lastActive: "2025-04-30T09:10:05Z",
    active: true,
  },
  {
    id: "sess-003",
    userId: "usr-004",
    userName: "Tariq Ibrahim",
    ip: "10.0.1.61",
    started: "2025-04-30T09:00:00Z",
    lastActive: "2025-04-30T09:14:50Z",
    active: true,
  },
];

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
      {role}
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
  onRoleChanged: (updated: AccessUser) => void;
}

function UserSidePanel({ user, onClose, onRoleChanged }: SidePanelProps) {
  const [selectedRole, setSelectedRole] = useState<UserRole>(user.role);
  const [reason, setReason] = useState("");
  const [saving, setSaving] = useState(false);
  const [impact, setImpact] = useState<string | null>(null);
  const [aiLoading, setAiLoading] = useState(false);
  const [aiResult, setAiResult] = useState<RoleRecommendation | null>(null);
  const [aiError, setAiError] = useState<string | null>(null);

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
      const data = (await resp.json()) as RoleRecommendation & { ok?: boolean };
      setAiResult(data);
    } catch {
      setAiError("AI recommendation unavailable.");
    } finally {
      setAiLoading(false);
    }
  };

  const handleSave = async () => {
    if (selectedRole === user.role) return;
    if (!reason.trim()) return;
    setSaving(true);
    setImpact(null);
    try {
      const resp = await fetch("/api/access/assign-role", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userId: user.id,
          newRole: selectedRole,
          reason: reason.trim(),
          assignedBy: "System Administrator",
        }),
      });
      const data = (await resp.json()) as { ok: boolean; user?: AccessUser; impactAssessment?: string };
      if (data.ok && data.user) {
        setImpact(data.impactAssessment ?? null);
        onRoleChanged(data.user);
      }
    } catch {
      // silent
    } finally {
      setSaving(false);
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
                {aiLoading ? "Analysing…" : "AI Recommend Role"}
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
  const [sessions, setSessions] = useState<Session[]>(DEMO_SESSIONS);
  const [selectedUser, setSelectedUser] = useState<AccessUser | null>(null);
  const [loadingUsers, setLoadingUsers] = useState(false);
  const [loadingLog, setLoadingLog] = useState(false);

  // Load from localStorage or API
  const fetchUsers = useCallback(async () => {
    setLoadingUsers(true);
    try {
      const resp = await fetch("/api/access/users");
      const data = (await resp.json()) as { ok: boolean; users?: AccessUser[] };
      if (data.ok && data.users) {
        setUsers(data.users);
        localStorage.setItem("hawkeye.access.users", JSON.stringify(data.users));
      }
    } catch {
      try {
        const cached = localStorage.getItem("hawkeye.access.users");
        if (cached) setUsers(JSON.parse(cached) as AccessUser[]);
      } catch { /* corrupted cache — ignore */ }
    } finally {
      setLoadingUsers(false);
    }
  }, []);

  const fetchLog = useCallback(async () => {
    setLoadingLog(true);
    try {
      const resp = await fetch("/api/access/permission-log");
      const data = (await resp.json()) as { ok: boolean; log?: PermissionLogEntry[] };
      if (data.ok && data.log) {
        setLog(data.log);
        localStorage.setItem("hawkeye.access.log", JSON.stringify(data.log));
      }
    } catch {
      try {
        const cached = localStorage.getItem("hawkeye.access.log");
        if (cached) setLog(JSON.parse(cached) as PermissionLogEntry[]);
      } catch { /* corrupted cache — ignore */ }
    } finally {
      setLoadingLog(false);
    }
  }, []);

  useEffect(() => {
    // Hydrate from localStorage immediately (guarded against corrupted data)
    try {
      const cachedUsers = localStorage.getItem("hawkeye.access.users");
      if (cachedUsers) setUsers(JSON.parse(cachedUsers) as AccessUser[]);
      const cachedLog = localStorage.getItem("hawkeye.access.log");
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

  const handleRevokeSession = async (session: Session) => {
    try {
      await fetch("/api/access/revoke-session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId: session.userId, reason: "Manual session revocation by administrator." }),
      });
      setSessions((prev) => prev.map((s) => (s.id === session.id ? { ...s, active: false } : s)));
      setUsers((prev) => prev.map((u) => (u.id === session.userId ? { ...u, active: false } : u)));
      void fetchLog();
    } catch {
      // silent
    }
  };

  // KPIs
  const totalUsers = users.length;
  const activeSessions = sessions.filter((s) => s.active).length;
  const now = new Date();
  const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
  const roleChangesThisWeek = log.filter(
    (e) => e.action === "role_assigned" && new Date(e.timestamp) >= weekAgo,
  ).length;

  return (
    <ModuleLayout engineLabel="Access control engine" asanaModule="access-control" asanaLabel="Access & Permissions">
      <ModuleHero
        moduleNumber={34}
        eyebrow="Module 34 · Governance"
        title="Access &"
        titleEm="permissions."
        kpis={[
          { value: String(totalUsers), label: "Total users" },
          { value: String(activeSessions), label: "Active sessions" },
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
          </div>
          <div className="border border-hair-2 rounded-md overflow-hidden">
            <table className="w-full text-12">
              <thead>
                <tr className="border-b border-hair bg-bg-2">
                  <th className="text-left px-4 py-2.5 text-10 font-mono uppercase tracking-wide-4 text-ink-2">
                    Name
                  </th>
                  <th className="text-left px-4 py-2.5 text-10 font-mono uppercase tracking-wide-4 text-ink-2">
                    Email
                  </th>
                  <th className="text-left px-4 py-2.5 text-10 font-mono uppercase tracking-wide-4 text-ink-2">
                    Role
                  </th>
                  <th className="text-left px-4 py-2.5 text-10 font-mono uppercase tracking-wide-4 text-ink-2">
                    Last login
                  </th>
                  <th className="text-left px-4 py-2.5 text-10 font-mono uppercase tracking-wide-4 text-ink-2">
                    Status
                  </th>
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
                    <td colSpan={5} className="px-4 py-8 text-center text-ink-2 text-12">
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
      {activeTab === "👁️ Session Monitor" && (
        <div>
          <div className="mb-4">
            <h2 className="text-14 font-semibold text-ink-0 mb-1">Active sessions</h2>
            <p className="text-12 text-ink-2">
              {sessions.filter((s) => s.active).length} active of {sessions.length} total sessions.
            </p>
          </div>
          <div className="flex flex-col gap-3">
            {sessions.map((session) => (
              <div
                key={session.id}
                className={`border rounded-md p-4 flex items-center gap-4 ${
                  session.active ? "border-hair-2 bg-bg-panel" : "border-hair bg-bg-2 opacity-50"
                }`}
              >
                <div
                  className={`w-2.5 h-2.5 rounded-full flex-shrink-0 ${
                    session.active ? "bg-green" : "bg-red"
                  }`}
                />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-medium text-ink-0 text-13">{session.userName}</span>
                    <span className="text-10 font-mono text-ink-2 bg-bg-2 px-1.5 py-0.5 rounded">
                      {session.ip}
                    </span>
                    {session.active ? (
                      <span className="text-10 font-mono text-green uppercase tracking-wide">live</span>
                    ) : (
                      <span className="text-10 font-mono text-red uppercase tracking-wide">revoked</span>
                    )}
                  </div>
                  <div className="flex gap-4 mt-1 text-11 text-ink-2 flex-wrap">
                    <span>Started {fmtDate(session.started)}</span>
                    <span>Last active {fmtDate(session.lastActive)}</span>
                    <span className="font-mono text-ink-3">{session.id}</span>
                  </div>
                </div>
                {session.active && (
                  <button
                    onClick={() => void handleRevokeSession(session)}
                    className="flex-shrink-0 px-3 py-1.5 rounded border border-red text-red text-11 font-mono font-semibold hover:bg-red-dim transition-colors"
                  >
                    Revoke
                  </button>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── Tab 4: Audit Log ─────────────────────────────────────────────────── */}
      {activeTab === "📋 Audit Log" && (
        <div>
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-14 font-semibold text-ink-0">
              {loadingLog ? "Loading…" : `${log.length} permission events`}
            </h2>
            <button
              onClick={() => void fetchLog()}
              className="px-3 py-1.5 text-11 font-mono border border-hair-2 rounded text-ink-2 hover:text-ink-0 hover:border-ink-2 transition-colors"
            >
              Refresh
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
