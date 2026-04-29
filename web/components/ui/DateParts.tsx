"use client";

// Single-cell date input — emits and accepts "dd/mm/yyyy" strings.
// Replaced the split Day/Month/YYYY three-cell variant per UX requirement.

interface DatePartsProps {
  value: string;
  onChange: (next: string) => void;
  className?: string | undefined;
  ariaLabel?: string | undefined;
}

export function DateParts({
  value,
  onChange,
  className = "",
  ariaLabel,
}: DatePartsProps) {
  const cls =
    className ||
    "border border-hair-2 rounded px-2 py-1.5 text-12 bg-bg-panel text-ink-0 w-full";
  return (
    <input
      type="text"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder="dd/mm/yyyy"
      aria-label={ariaLabel}
      className={cls}
    />
  );
}
