"use client";

import type { ReactNode } from "react";

export function ModuleShell({ children }: { children: ReactNode }) {
  return <div className="max-w-[1440px] mx-auto px-10 py-8">{children}</div>;
}

interface ModuleHeaderProps {
  title: string;
  subtitle?: string;
  dotColor?: "brand" | "amber" | "green" | "red";
  badge?: { label: string; tone?: "default" | "critical" };
  actions?: ReactNode;
}

const DOT_COLOR: Record<NonNullable<ModuleHeaderProps["dotColor"]>, string> = {
  brand: "bg-brand shadow-[0_0_10px_var(--brand)]",
  amber: "bg-amber shadow-[0_0_10px_var(--amber)]",
  green: "bg-green shadow-[0_0_10px_var(--green)]",
  red: "bg-red shadow-[0_0_10px_var(--red)]",
};

export function ModuleHeader({
  title,
  subtitle,
  dotColor = "brand",
  badge,
  actions,
}: ModuleHeaderProps) {
  return (
    <header className="flex items-start justify-between gap-6 pb-5 border-b border-hair-2 mb-7 flex-wrap">
      <div>
        <div className="flex items-center gap-3 mb-1">
          <span className={`w-2 h-2 rounded-full ${DOT_COLOR[dotColor]}`} />
          <h1 className="font-display font-normal text-36 leading-[1.1] tracking-tightest m-0 text-ink-0">
            {title}
          </h1>
        </div>
        {subtitle && (
          <p className="text-12 text-ink-2 max-w-[72ch] m-0 ml-5 border-l-2 border-brand-line pl-3">
            {subtitle}
          </p>
        )}
      </div>
      <div className="flex items-center gap-2 flex-wrap">
        {badge && (
          <span
            className={`font-mono text-10 uppercase tracking-wide-3 px-3 py-1.5 rounded-full border ${
              badge.tone === "critical"
                ? "border-red/30 bg-red-dim text-red"
                : "border-hair-3 bg-bg-2 text-ink-1"
            }`}
          >
            {badge.label}
          </span>
        )}
        {actions}
      </div>
    </header>
  );
}

interface ComplianceFlagProps {
  children: ReactNode;
  tone?: "green" | "amber" | "red";
}

const FLAG_TONE: Record<NonNullable<ComplianceFlagProps["tone"]>, string> = {
  green: "bg-green-dim text-green border-green/25",
  amber: "bg-amber-dim text-amber border-amber/25",
  red: "bg-red-dim text-red border-red/25",
};

export function ComplianceFlag({
  children,
  tone = "green",
}: ComplianceFlagProps) {
  return (
    <div
      className={`inline-flex items-center gap-2 font-mono text-10 uppercase tracking-wide-3 mb-6 px-3 py-1.5 rounded-full border ${FLAG_TONE[tone]}`}
    >
      <span className="w-1.5 h-1.5 rounded-full bg-current shadow-[0_0_6px_currentColor]" />
      {children}
    </div>
  );
}

interface KpiProps {
  value: string | number;
  label: string;
  tone?: "brand" | "amber" | "green" | "red";
}

const KPI_TONE: Record<NonNullable<KpiProps["tone"]>, string> = {
  brand: "bg-brand",
  amber: "bg-amber",
  green: "bg-green",
  red: "bg-red",
};

export function Kpi({ value, label, tone = "brand" }: KpiProps) {
  return (
    <div className="relative bg-bg-panel border border-hair-2 rounded-xl p-5 pl-6 overflow-hidden hover:border-hair-3 transition-colors">
      <span
        className={`absolute top-0 left-0 bottom-0 w-[3px] ${KPI_TONE[tone]} opacity-80`}
      />
      <div className="font-display text-36 leading-none tracking-tightest text-ink-0">
        {value}
      </div>
      <div className="font-mono text-10 uppercase tracking-wide-3 text-ink-2 mt-2">
        {label}
      </div>
    </div>
  );
}

export function KpiGrid({
  cols = 4,
  children,
}: {
  cols?: 3 | 4;
  children: ReactNode;
}) {
  return (
    <div
      className={`grid gap-3 mb-8 ${
        cols === 3
          ? "grid-cols-1 sm:grid-cols-2 md:grid-cols-3"
          : "grid-cols-1 sm:grid-cols-2 md:grid-cols-4"
      }`}
    >
      {children}
    </div>
  );
}

export function Card({ children }: { children: ReactNode }) {
  return (
    <div className="bg-bg-panel border border-hair-2 rounded-xl p-7">
      {children}
    </div>
  );
}

export function CardSection({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  return (
    <section className="pb-6 mb-6 border-b border-dashed border-hair last:border-0 last:mb-0 last:pb-0">
      <h3 className="font-mono text-10 uppercase tracking-wide-4 text-brand-deep m-0 mb-4 font-semibold">
        {title}
      </h3>
      {children}
    </section>
  );
}

export function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: ReactNode;
}) {
  return (
    <label className="flex flex-col gap-1.5 mb-4 last:mb-0">
      <span className="font-mono text-10 uppercase tracking-wide-3 text-ink-2 font-semibold">
        {label}
        {hint && (
          <span className="ml-1 font-normal text-ink-3 tracking-wide-2 normal-case">
            {hint}
          </span>
        )}
      </span>
      {children}
    </label>
  );
}

export const textInputCls =
  "w-full bg-transparent border border-hair-2 rounded px-3 py-2 text-13 text-ink-0 placeholder-ink-3 focus:outline-none focus:border-brand min-h-[40px]";
export const textareaCls =
  "w-full bg-transparent border border-hair-2 rounded px-3 py-2 text-13 text-ink-0 placeholder-ink-3 focus:outline-none focus:border-brand min-h-[96px] leading-[1.55]";

export function ActionRow({
  left,
  right,
}: {
  left: ReactNode;
  right?: ReactNode;
}) {
  return (
    <div className="flex items-center justify-between gap-4 pt-6 mt-6 border-t border-hair-2 flex-wrap">
      <div className="flex gap-2 flex-wrap">{left}</div>
      {right && (
        <div className="flex items-center gap-3 flex-wrap ml-auto">{right}</div>
      )}
    </div>
  );
}

export function Btn({
  children,
  variant = "primary",
  type = "button",
  onClick,
  disabled,
}: {
  children: ReactNode;
  variant?: "primary" | "ghost" | "secondary";
  type?: "button" | "submit";
  onClick?: () => void;
  disabled?: boolean;
}) {
  const base =
    "font-mono text-10.5 uppercase tracking-wide-3 font-medium px-4 py-2 rounded transition-colors border cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed";
  const variants: Record<string, string> = {
    primary:
      "bg-brand text-white border-brand hover:bg-brand-hover hover:border-brand-hover",
    ghost: "bg-brand-dim text-brand-deep border-brand-line hover:bg-brand/15",
    secondary:
      "bg-bg-panel text-ink-1 border-hair-2 hover:border-hair-3 hover:text-ink-0",
  };
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      className={`${base} ${variants[variant]}`}
    >
      {children}
    </button>
  );
}

export function Register({
  title,
  empty,
  children,
}: {
  title?: string;
  empty?: string;
  children?: ReactNode;
}) {
  if (children) return <>{children}</>;
  return (
    <div className="mt-8 p-10 text-center border border-dashed border-hair-3 rounded-xl text-ink-3">
      {title && (
        <div className="font-mono text-10 uppercase tracking-wide-4 text-ink-2 mb-3">
          {title}
        </div>
      )}
      <p className="text-12 text-ink-2 m-0">{empty ?? "No entries yet."}</p>
    </div>
  );
}
