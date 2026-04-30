"use client";

import type { ScreeningFormData } from "@/components/screening/NewScreeningForm";

interface Props {
  entityType: "individual" | "organisation" | "vessel" | "aircraft" | "other";
  imo: string | undefined;
  mmsi: string | undefined;
  tail: string | undefined;
  patch: (p: Partial<ScreeningFormData>) => void;
}

// IMO/MMSI/tail-number fields. Visible only when entity type is vessel
// or aircraft. Validates lightly (IMO is 7 digits, MMSI is 9 digits, tail
// is the ICAO format) so the brain's vessel-check / aircraft-lookup paths
// receive well-formed identifiers.
export function VesselAircraftFields({ entityType, imo, mmsi, tail, patch }: Props) {
  const inputCls =
    "w-full bg-transparent border border-hair-2 rounded px-2.5 py-1.5 text-13 text-ink-0 placeholder-ink-3 focus:outline-none focus:border-brand focus:bg-bg-panel font-mono";

  if (entityType === "vessel") {
    const imoOk = !imo || /^\d{7}$/.test(imo);
    const mmsiOk = !mmsi || /^\d{9}$/.test(mmsi);
    return (
      <div className="grid grid-cols-2 gap-4">
        <label className="block">
          <span className="text-11 font-semibold uppercase tracking-wide-3 text-ink-2 mb-1 block">IMO number</span>
          <input
            value={imo ?? ""}
            onChange={(e) => patch({ vesselImo: e.target.value.trim() })}
            placeholder="9876543"
            className={inputCls}
          />
          {imo && !imoOk && <p className="text-10 text-amber mt-1">IMO is 7 digits.</p>}
        </label>
        <label className="block">
          <span className="text-11 font-semibold uppercase tracking-wide-3 text-ink-2 mb-1 block">MMSI</span>
          <input
            value={mmsi ?? ""}
            onChange={(e) => patch({ vesselMmsi: e.target.value.trim() })}
            placeholder="123456789"
            className={inputCls}
          />
          {mmsi && !mmsiOk && <p className="text-10 text-amber mt-1">MMSI is 9 digits.</p>}
        </label>
      </div>
    );
  }

  if (entityType === "aircraft") {
    const tailOk = !tail || /^[A-Z0-9-]{2,7}$/.test(tail.toUpperCase());
    return (
      <label className="block">
        <span className="text-11 font-semibold uppercase tracking-wide-3 text-ink-2 mb-1 block">Tail number / ICAO 24-bit</span>
        <input
          value={tail ?? ""}
          onChange={(e) => patch({ aircraftTail: e.target.value.toUpperCase().trim() })}
          placeholder="A6-EVE / N12345"
          className={inputCls}
        />
        {tail && !tailOk && <p className="text-10 text-amber mt-1">Tail format looks unusual.</p>}
      </label>
    );
  }

  return null;
}
