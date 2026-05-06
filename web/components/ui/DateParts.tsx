"use client";

import { useState } from "react";

// Single-cell date input — emits and accepts "dd/mm/yyyy" strings.
// Auto-inserts "/" between day/month and month/year as the operator
// types so the field never feels broken. Shows a subtle red border
// when the typed value is non-empty but not a valid calendar date.

interface DatePartsProps {
  value: string;
  onChange: (next: string) => void;
  className?: string | undefined;
  ariaLabel?: string | undefined;
}

function formatPartial(raw: string): string {
  // Strip everything that isn't a digit, then re-insert separators
  // at positions 2 and 4 so typing "07112025" → "07/11/2025".
  const digits = raw.replace(/\D/g, "").slice(0, 8);
  if (digits.length <= 2) return digits;
  if (digits.length <= 4) return `${digits.slice(0, 2)}/${digits.slice(2)}`;
  return `${digits.slice(0, 2)}/${digits.slice(2, 4)}/${digits.slice(4)}`;
}

function isValid(value: string): boolean {
  if (!value) return true;
  const m = value.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (!m || !m[1] || !m[2] || !m[3]) return false;
  const day = Number.parseInt(m[1], 10);
  const month = Number.parseInt(m[2], 10);
  const year = Number.parseInt(m[3], 10);
  if (month < 1 || month > 12) return false;
  if (day < 1 || day > 31) return false;
  if (year < 1900 || year > 2100) return false;
  // Calendar check (handles 31-day months + leap years)
  const d = new Date(year, month - 1, day);
  return d.getFullYear() === year && d.getMonth() === month - 1 && d.getDate() === day;
}

export function DateParts({
  value,
  onChange,
  className = "",
  ariaLabel,
}: DatePartsProps) {
  const [touched, setTouched] = useState(false);
  const valid = isValid(value);
  const showError = touched && value.length > 0 && !valid;
  const base =
    className ||
    "border border-hair-2 rounded px-2 py-1.5 text-12 bg-bg-panel text-ink-0 w-full";
  const errCls = showError ? " border-red text-red" : "";
  return (
    <input
      type="text"
      inputMode="numeric"
      value={value}
      onChange={(e) => onChange(formatPartial(e.target.value))}
      onBlur={() => setTouched(true)}
      placeholder="dd/mm/yyyy"
      aria-label={ariaLabel}
      aria-invalid={showError || undefined}
      title={showError ? "Enter a valid date as dd/mm/yyyy" : undefined}
      className={`${base}${errCls}`}
      maxLength={10}
    />
  );
}
