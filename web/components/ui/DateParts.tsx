"use client";

// Split Day / Month / YYYY date input. Emits a single "dd/mm/yyyy"
// string so existing call-sites that stored the value as one string
// don't need to change their state shape. Invalid / incomplete
// combinations produce "" (caller decides how to handle that).

const MONTHS = [
  "01",
  "02",
  "03",
  "04",
  "05",
  "06",
  "07",
  "08",
  "09",
  "10",
  "11",
  "12",
];

const DAYS = Array.from({ length: 31 }, (_, i) =>
  String(i + 1).padStart(2, "0"),
);

function parse(value: string): { day: string; month: string; year: string } {
  const m = value.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (!m) return { day: "", month: "", year: "" };
  return { day: m[1]!, month: m[2]!, year: m[3]! };
}

function format(day: string, month: string, year: string): string {
  if (!day && !month && !year) return "";
  const dd = day.padStart(2, "0");
  const mm = month.padStart(2, "0");
  const yyyy = year.padStart(4, "0");
  return `${dd}/${mm}/${yyyy}`;
}

interface DatePartsProps {
  value: string;
  onChange: (next: string) => void;
  className?: string;
  ariaLabel?: string;
}

export function DateParts({
  value,
  onChange,
  className = "",
  ariaLabel,
}: DatePartsProps) {
  const { day, month, year } = parse(value);

  const emit = (d: string, m: string, y: string) => {
    // Only emit a formatted string when all three are populated. Any
    // partial state clears the value so downstream validators don't
    // accept "dd//yyyy"-style strings.
    if (d && m && y && y.length === 4) {
      onChange(format(d, m, y));
    } else {
      onChange("");
    }
  };

  const selectCls = className || "border border-hair-2 rounded px-2 py-1.5 text-12 bg-white text-ink-0";
  const inputCls = className || "border border-hair-2 rounded px-2 py-1.5 text-12 bg-white text-ink-0";

  return (
    <div className="grid grid-cols-3 gap-2" aria-label={ariaLabel}>
      <select
        value={day}
        onChange={(e) => emit(e.target.value, month, year)}
        className={selectCls}
        aria-label="Day"
      >
        <option value="">Day</option>
        {DAYS.map((d) => (
          <option key={d} value={d}>
            {d}
          </option>
        ))}
      </select>
      <select
        value={month}
        onChange={(e) => emit(day, e.target.value, year)}
        className={selectCls}
        aria-label="Month"
      >
        <option value="">Month</option>
        {MONTHS.map((m) => (
          <option key={m} value={m}>
            {m}
          </option>
        ))}
      </select>
      <input
        value={year}
        onChange={(e) =>
          emit(day, month, e.target.value.replace(/\D/g, "").slice(0, 4))
        }
        placeholder="YYYY"
        maxLength={4}
        inputMode="numeric"
        className={inputCls}
        aria-label="Year"
      />
    </div>
  );
}
