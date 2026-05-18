import Link from "next/link";

export default function NotFound() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-bg-0">
      <div className="max-w-md text-center px-6">
        <div className="font-mono text-11 tracking-wide-8 uppercase text-ink-3 mb-3">
          404
        </div>
        <h1 className="font-display font-normal text-32 text-ink-0 mb-3">
          Page not found
        </h1>
        <p className="text-13 text-ink-2 mb-6 leading-relaxed">
          The page you are looking for does not exist or has been moved. If you
          followed a link from the compliance portal, please contact your system
          administrator.
        </p>
        <Link
          href="/"
          className="px-5 py-2 bg-ink-0 text-bg-0 text-13 font-semibold rounded hover:bg-ink-1 transition-colors inline-block"
        >
          Return to dashboard
        </Link>
      </div>
    </div>
  );
}
