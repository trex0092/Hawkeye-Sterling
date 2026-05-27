"use client";

export default function BrainIntelligenceError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div className="min-h-screen bg-gray-950 flex items-center justify-center px-4">
      <div className="max-w-md w-full text-center">
        <div className="text-xs font-mono tracking-widest uppercase text-gray-500 mb-3">
          Brain Intelligence Hub
        </div>
        <h1 className="text-2xl font-bold text-white mb-3">Something went wrong</h1>
        <p className="text-sm text-gray-400 mb-6">
          {process.env.NODE_ENV !== "production"
            ? error.message || "An unexpected error occurred."
            : "An unexpected error occurred loading the Intelligence Hub. Please try again."}
        </p>
        <button
          type="button"
          onClick={reset}
          className="px-5 py-2 bg-purple-700 hover:bg-purple-600 text-white text-sm font-semibold rounded transition-colors"
        >
          Try again
        </button>
        {error.digest && (
          <p className="mt-4 font-mono text-xs text-gray-600">ref: {error.digest}</p>
        )}
      </div>
    </div>
  );
}
