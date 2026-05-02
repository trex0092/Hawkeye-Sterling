"use client";

import { useState, useEffect, FormEvent } from "react";
import { ModuleHero, ModuleLayout } from "@/components/layout/ModuleLayout";

interface UserProfile {
  id: string;
  name: string;
  email: string;
  username: string;
  role: string;
  roleLabel: string;
  active: boolean;
  modules: string[];
  lastLogin: string;
  sessionExp: number;
}

function sessionTimeLeft(exp: number): string {
  const secsLeft = exp - Math.floor(Date.now() / 1000);
  if (secsLeft <= 0) return "Expired";
  const h = Math.floor(secsLeft / 3600);
  const m = Math.floor((secsLeft % 3600) / 60);
  return h > 0 ? `${h}h ${m}m remaining` : `${m}m remaining`;
}

export default function ProfilePage() {
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loadError, setLoadError] = useState("");

  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState("");
  const [saveSuccess, setSaveSuccess] = useState(false);

  useEffect(() => {
    fetch("/api/auth/me")
      .then((r) => r.json())
      .then((d: { ok: boolean; user?: UserProfile; error?: string }) => {
        if (d.ok && d.user) setProfile(d.user);
        else setLoadError(d.error ?? "Failed to load profile");
      })
      .catch(() => setLoadError("Failed to load profile"));
  }, []);

  const handleChangePassword = async (e: FormEvent) => {
    e.preventDefault();
    setSaveError("");
    setSaveSuccess(false);

    if (newPassword !== confirmPassword) {
      setSaveError("New passwords do not match");
      return;
    }
    if (newPassword.length < 8) {
      setSaveError("New password must be at least 8 characters");
      return;
    }

    setSaving(true);
    try {
      const res = await fetch("/api/access/change-password", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ currentPassword, newPassword }),
      });
      const json = (await res.json()) as { ok: boolean; error?: string };
      if (!json.ok) {
        setSaveError(json.error ?? "Password change failed");
      } else {
        setSaveSuccess(true);
        setCurrentPassword("");
        setNewPassword("");
        setConfirmPassword("");
      }
    } catch {
      setSaveError("Network error — please try again");
    } finally {
      setSaving(false);
    }
  };

  return (
    <ModuleLayout engineLabel="Access control engine" asanaModule="profile" asanaLabel="Profile">
      <ModuleHero
        eyebrow="Account Settings"
        title="Your"
        titleEm="profile."
        moduleNumber={0}
        kpis={[]}
        intro="Manage your account credentials and view your session details."
      />

      <div className="space-y-8 max-w-2xl">

        {/* Profile info card */}
        <div className="rounded-xl border border-hair bg-bg-panel p-6 space-y-4">
          <h2 className="font-display text-17 font-normal text-ink-0">
            Account <em className="italic text-brand">details</em>
          </h2>

          {loadError && (
            <p className="text-13 text-red">{loadError}</p>
          )}

          {profile && (
            <div className="grid grid-cols-2 gap-4">
              <div>
                <div className="font-mono text-10 uppercase tracking-wide-4 text-ink-3 mb-1">Full name</div>
                <div className="text-14 text-ink-0 font-medium">{profile.name}</div>
              </div>
              <div>
                <div className="font-mono text-10 uppercase tracking-wide-4 text-ink-3 mb-1">Username</div>
                <div className="text-14 text-ink-0 font-medium">{profile.username}</div>
              </div>
              <div>
                <div className="font-mono text-10 uppercase tracking-wide-4 text-ink-3 mb-1">Department</div>
                <div className="text-14 text-ink-0">{profile.roleLabel}</div>
              </div>
              <div>
                <div className="font-mono text-10 uppercase tracking-wide-4 text-ink-3 mb-1">Last login</div>
                <div className="text-14 text-ink-0">
                  {new Date(profile.lastLogin).toLocaleString("en-GB", {
                    day: "2-digit", month: "short", year: "numeric",
                    hour: "2-digit", minute: "2-digit",
                  })}
                </div>
              </div>
              <div>
                <div className="font-mono text-10 uppercase tracking-wide-4 text-ink-3 mb-1">Session</div>
                <div className="text-14 text-ink-0">{sessionTimeLeft(profile.sessionExp)}</div>
              </div>
              <div>
                <div className="font-mono text-10 uppercase tracking-wide-4 text-ink-3 mb-1">Status</div>
                <span className={`inline-block px-2 py-0.5 rounded text-11 font-mono font-semibold ${profile.active ? "bg-green-dim text-green" : "bg-red-dim text-red"}`}>
                  {profile.active ? "ACTIVE" : "INACTIVE"}
                </span>
              </div>
              {profile.modules.length > 0 && (
                <div className="col-span-2">
                  <div className="font-mono text-10 uppercase tracking-wide-4 text-ink-3 mb-2">Module access</div>
                  <div className="flex flex-wrap gap-1.5">
                    {profile.modules.map((m) => (
                      <span key={m} className="px-2 py-0.5 rounded bg-bg-1 border border-hair text-11 text-ink-2 font-mono">
                        {m}
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Change password card */}
        <div className="rounded-xl border border-hair bg-bg-panel p-6">
          <h2 className="font-display text-17 font-normal text-ink-0 mb-1">
            Change <em className="italic text-brand">password</em>
          </h2>
          <p className="text-12 text-ink-3 mb-5">
            Minimum 8 characters. Changes take effect immediately.
          </p>

          <form onSubmit={(e) => void handleChangePassword(e)} className="space-y-4">
            <div>
              <label className="block font-mono text-10 uppercase tracking-wide-4 text-ink-3 mb-1.5">
                Current password
              </label>
              <input
                type="password"
                value={currentPassword}
                onChange={(e) => setCurrentPassword(e.target.value)}
                required
                autoComplete="current-password"
                className="w-full px-3 py-2.5 bg-bg-1 border border-hair-2 rounded-lg text-13 text-ink-0 placeholder-ink-3 outline-none focus:border-brand transition-colors"
                placeholder="••••••••"
              />
            </div>

            <div>
              <label className="block font-mono text-10 uppercase tracking-wide-4 text-ink-3 mb-1.5">
                New password
              </label>
              <input
                type="password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                required
                autoComplete="new-password"
                className="w-full px-3 py-2.5 bg-bg-1 border border-hair-2 rounded-lg text-13 text-ink-0 placeholder-ink-3 outline-none focus:border-brand transition-colors"
                placeholder="••••••••"
              />
            </div>

            <div>
              <label className="block font-mono text-10 uppercase tracking-wide-4 text-ink-3 mb-1.5">
                Confirm new password
              </label>
              <input
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                required
                autoComplete="new-password"
                className={`w-full px-3 py-2.5 bg-bg-1 border rounded-lg text-13 text-ink-0 placeholder-ink-3 outline-none focus:border-brand transition-colors ${
                  confirmPassword && confirmPassword !== newPassword
                    ? "border-red/60"
                    : "border-hair-2"
                }`}
                placeholder="••••••••"
              />
              {confirmPassword && confirmPassword !== newPassword && (
                <p className="mt-1 text-11 text-red">Passwords do not match</p>
              )}
            </div>

            {saveError && (
              <div className="p-3 rounded-lg bg-red-dim border border-red/30 text-12 text-red">
                {saveError}
              </div>
            )}

            {saveSuccess && (
              <div className="p-3 rounded-lg bg-green-dim border border-green/30 text-12 text-green">
                Password changed successfully.
              </div>
            )}

            <button
              type="submit"
              disabled={saving || !currentPassword || !newPassword || !confirmPassword || newPassword !== confirmPassword}
              className="w-full py-2.5 rounded-lg bg-brand text-white text-13 font-semibold hover:bg-brand/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {saving ? "Saving…" : "Change password"}
            </button>
          </form>
        </div>

        {/* Need help */}
        <div className="rounded-lg border border-hair p-4 bg-bg-1 flex items-start gap-3">
          <span className="text-18 shrink-0">🔒</span>
          <div>
            <div className="font-mono text-10 uppercase tracking-wide-4 text-ink-3 mb-1">Need help?</div>
            <p className="text-12 text-ink-2">
              If you are locked out or cannot remember your current password, contact your MLRO at{" "}
              <a href="mailto:compliance@hawkeye-sterling.ae" className="text-brand hover:underline">
                compliance@hawkeye-sterling.ae
              </a>{" "}
              to have your password reset.
            </p>
          </div>
        </div>

      </div>
    </ModuleLayout>
  );
}
