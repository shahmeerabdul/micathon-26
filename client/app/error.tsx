"use client";

import { useEffect } from "react";
import { AlertTriangle, RotateCcw } from "lucide-react";

/**
 * Top-level error boundary. Next.js surfaces unhandled render/runtime errors
 * here; we show a friendly card with a reset button. Logs the raw error to
 * the console so the teammate can grab it from DevTools during the demo.
 */
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("[Khata] Unhandled error:", error);
  }, [error]);

  return (
    <main className="flex min-h-dvh items-center justify-center bg-sage p-6">
      <div className="flex w-full max-w-sm flex-col items-center gap-5 rounded-[32px] bg-white p-8 text-center shadow-[0_40px_80px_-30px_rgba(0,0,0,0.35)] ring-1 ring-black/5">
        <span className="flex size-16 items-center justify-center rounded-full bg-pending-bg text-pending">
          <AlertTriangle className="size-7" />
        </span>
        <div>
          <h1 className="text-lg font-bold">Something went wrong</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {error.message || "An unexpected error occurred."}
          </p>
        </div>
        <button
          type="button"
          onClick={reset}
          className="flex items-center gap-2 rounded-2xl bg-ink px-5 py-3 text-sm font-semibold text-background active:scale-95 transition"
        >
          <RotateCcw className="size-4" />
          Try again
        </button>
      </div>
    </main>
  );
}
