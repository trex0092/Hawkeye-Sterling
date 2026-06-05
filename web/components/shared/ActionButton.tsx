import { type ButtonHTMLAttributes } from "react";

// Futurist, color-coded sidebar action button. Mirrors the green ASANA
// report button's treatment (dim fill, hairline border, semibold label,
// pulsing status dot) so every module's "Actions" rail shares one look.
//
// Colour taxonomy (consistent across all modules):
//   ai        → pink   (brand)  — AI / inference actions
//   asana     → green  (green)  — Asana report actions
//   screening → blue   (blue)   — submit / run / screening actions
//   add       → orange (orange) — add / log / enrol / new actions
//   import    → purple (violet) — CSV / data import actions
export type ActionVariant = "ai" | "asana" | "screening" | "add" | "import";

const VARIANT_STYLES: Record<ActionVariant, { btn: string; dot: string }> = {
  ai: { btn: "bg-brand-dim text-brand border-brand/40 hover:bg-brand/20", dot: "bg-brand" },
  asana: { btn: "bg-green-dim text-green border-green/40 hover:bg-green/20", dot: "bg-green" },
  screening: { btn: "bg-blue-dim text-blue border-blue/40 hover:bg-blue/20", dot: "bg-blue" },
  add: { btn: "bg-orange-dim text-orange border-orange/40 hover:bg-orange/20", dot: "bg-orange" },
  import: { btn: "bg-violet-dim text-violet border-violet/40 hover:bg-violet/20", dot: "bg-violet" },
};

interface ActionButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant: ActionVariant;
  // Pulse the status dot (default true) — matches the live ASANA button.
  pulse?: boolean;
}

export function ActionButton({
  variant,
  pulse = true,
  className = "",
  children,
  ...rest
}: ActionButtonProps) {
  const v = VARIANT_STYLES[variant];
  return (
    <button
      {...rest}
      className={`w-full inline-flex items-center gap-1.5 px-2.5 py-1 rounded border text-11 font-semibold text-left transition-colors disabled:opacity-40 disabled:cursor-not-allowed ${v.btn} ${className}`}
    >
      <span
        className={`w-1.5 h-1.5 rounded-full shrink-0 ${v.dot}`}
        {...(pulse ? { style: { animation: "live-pulse 2s ease-in-out infinite" } } : {})}
      />
      {children}
    </button>
  );
}
