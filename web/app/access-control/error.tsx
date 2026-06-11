"use client";

export default function AccessControlError({
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
          Access Control · Error
        </div>
        <h1 className="font-display font-normal text-32 text-ink-0 mb-3">
          Something went wrong
        </h1>
        <p className="text-13 text-ink-2 mb-6 leading-relaxed">
          {process.env.NODE_ENV !== "production"
            ? error.message || "An unexpected error occurred."
            : "An unexpected error occurred. Please try again or contact your system administrator."}
        </p>
        {error.stack && process.env.NODE_ENV !== "production" && (
          <pre className="text-left text-10 text-ink-3 bg-bg-1 border border-line-1 rounded p-4 mb-6 overflow-auto max-h-64 whitespace-pre-wrap break-all">
            {error.stack}
          </pre>
        )}
        <button
          type="button"
          onClick={reset}
          className="px-3 py-1.5 bg-ink-0 text-bg-0 text-12 font-semibold rounded hover:bg-ink-1 transition-colors"
        >
          Try again
        </button>
        {error.digest && (
          <p className="mt-4 font-mono text-10 text-ink-3">ref: {error.digest}</p>
        )}
      </div>
    </div>
  );
}
