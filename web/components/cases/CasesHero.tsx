export function CasesHero() {
  return (
    <div className="mb-8">
      <div className="font-mono text-10 font-semibold text-amber tracking-wide-4 uppercase mb-1">
        MODULE 03
      </div>
      <div className="flex items-center gap-1.5 font-mono text-11 tracking-wide-8 uppercase text-ink-2 mb-2">
        <span className="w-1.5 h-1.5 rounded-full bg-brand shrink-0 shadow-[0_0_6px_var(--brand)] opacity-80" />
        MODULE 02 · CASE MANAGEMENT
      </div>
      <h1 className="font-display font-normal text-48 tracking-tightest m-0 mb-2 text-ink-0">
        Evidence <em className="italic text-brand">trail.</em>
      </h1>
      <p className="max-w-[68ch] text-ink-1 text-13.5 leading-[1.6] m-0 mt-3 border-l-2 border-brand pl-3.5">
        <strong>Immutable chain · ten-year retention · reasoning persistence.</strong>{" "}
        Every case carries a complete audit trail from first screening through MLRO
        disposition to FIU filing. Evidence vault, document chain, reasoning modes, and
        regulatory export.
      </p>
    </div>
  );
}
