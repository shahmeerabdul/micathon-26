"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { Users, ChevronLeft, LogOut } from "lucide-react";
import { ContactAvatar } from "@/components/shared/ContactAvatar";
import { useAuthStore } from "@/lib/store/auth-store";

interface AppHeaderProps {
  variant?: "home" | "page";
  title?: string;
  /** Urdu-script name rendered next to the English title. */
  urduTitle?: string;
  subtitle?: string;
  backHref?: string;
}

export function AppHeader({
  variant = "home",
  title,
  urduTitle,
  subtitle,
  backHref,
}: AppHeaderProps) {
  const router = useRouter();
  const logout = useAuthStore((s) => s.logout);
  const handleLogout = () => {
    logout();
    router.replace("/login");
  };

  if (variant === "page") {
    return (
      <header className="flex items-center gap-3 px-5 pt-6 pb-3">
        <Link
          href={backHref ?? "/"}
          aria-label="Back"
          className="flex size-10 items-center justify-center rounded-full bg-white ring-1 ring-border shadow-sm active:scale-95 transition"
        >
          <ChevronLeft className="size-5" />
        </Link>
        <div className="min-w-0 flex-1">
          {title ? (
            <h1 className="flex items-baseline gap-2 text-lg font-bold leading-tight">
              <span className="truncate">{title}</span>
              {urduTitle ? (
                <span
                  lang="ur"
                  dir="rtl"
                  className="shrink-0 text-base font-semibold text-muted-foreground/80"
                >
                  {urduTitle}
                </span>
              ) : null}
            </h1>
          ) : null}
          {subtitle ? (
            <p className="text-xs text-muted-foreground">{subtitle}</p>
          ) : null}
        </div>
      </header>
    );
  }

  return (
    <header className="flex items-center justify-between gap-3 px-5 pt-6 pb-2">
      <Link href="/contacts" className="flex items-center gap-3">
        <ContactAvatar name="Shopkeeper" size="md" />
        <div className="leading-tight">
          <p className="flex items-baseline gap-1.5 text-xs text-muted-foreground">
            <span>Assalam-o-Alaikum</span>
            <span lang="ur" dir="rtl" className="text-[11px]">
              السلام علیکم
            </span>
          </p>
          <p className="flex items-baseline gap-1.5 text-sm font-semibold">
            <span>Shopkeeper</span>
            <span
              lang="ur"
              dir="rtl"
              className="text-xs font-medium text-muted-foreground/80"
            >
              دوکاندار
            </span>
          </p>
        </div>
      </Link>
      <div className="flex items-center gap-2">
        <Link
          href="/contacts"
          aria-label="Contacts"
          className="flex size-10 items-center justify-center rounded-full bg-white ring-1 ring-border shadow-sm active:scale-95 transition"
        >
          <Users className="size-5" />
        </Link>
        <button
          type="button"
          onClick={handleLogout}
          aria-label="Sign out"
          title="Sign out"
          className="flex size-10 items-center justify-center rounded-full bg-white ring-1 ring-border shadow-sm active:scale-95 transition"
        >
          <LogOut className="size-5" />
        </button>
      </div>
    </header>
  );
}
