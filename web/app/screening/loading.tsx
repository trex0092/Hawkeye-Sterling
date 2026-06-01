// MISSING-LOAD-006 (forensic audit batch 3) — segment loading state for
// the primary Screening queue. Sister error.tsx already exists.
export default function Loading() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-bg-0">
      <div className="flex flex-col items-center gap-4">
        <div className="w-8 h-8 border-2 border-ink-3 border-t-ink-0 rounded-full animate-spin" />
        <p className="text-13 text-ink-2">Loading screening queue…</p>
      </div>
    </div>
  );
}
