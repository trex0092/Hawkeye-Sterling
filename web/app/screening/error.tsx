"use client";

export default function ScreeningError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div className="min-h-screen flex items-center justify-center bg-bg-0">
      <div className="max-w-md text-center px-6">
        <div className="font-mono text-11 tracking-wide-8 uppercase text-ink-3 mb-3">
          Screening · Runtime Error
        </div>
        <h1 className="font-display font-normal text-32 text-ink-0 mb-3">
          Something went wrong
        </h1>
        <p className="text-13 text-ink-2 mb-6 leading-relaxed">
          {error.message || "An unexpected error occurred in the screening module."}
        </p>
        <button
          type="button"
          onClick={reset}
          className="px-5 py-2 bg-ink-0 text-bg-0 text-13 font-semibold rounded hover:bg-ink-1 transition-colors"
        >
          Reload screening
        </button>
        {error.digest && (
          <p className="mt-4 font-mono text-10 text-ink-3">ref: {error.digest}</p>
        )}
      </div>
    </div>
  );
}
