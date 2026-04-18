import Link from "next/link";
import { Home, Compass } from "lucide-react";

export default function NotFound() {
  return (
    <main className="flex min-h-dvh items-center justify-center bg-sage p-6">
      <div className="flex w-full max-w-sm flex-col items-center gap-5 rounded-[32px] bg-white p-8 text-center shadow-[0_40px_80px_-30px_rgba(0,0,0,0.35)] ring-1 ring-black/5">
        <span className="flex size-16 items-center justify-center rounded-full bg-sage-soft">
          <Compass className="size-7" />
        </span>
        <div>
          <h1 className="text-lg font-bold">Page not found</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            This screen doesn&apos;t exist yet. Head back home.
          </p>
        </div>
        <Link
          href="/"
          className="flex items-center gap-2 rounded-2xl bg-ink px-5 py-3 text-sm font-semibold text-background active:scale-95 transition"
        >
          <Home className="size-4" />
          Go home
        </Link>
      </div>
    </main>
  );
}
