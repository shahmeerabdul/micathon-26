"use client";

import { useEffect, useState } from "react";
import { WifiOff } from "lucide-react";

/**
 * Thin top-of-screen strip that appears only when the browser reports
 * offline. The rest of the app works fine offline (store is local), so the
 * banner is informational — it tells the shopkeeper that any WhatsApp /
 * external links will queue in their OS until they reconnect.
 */
export function OfflineBanner() {
  const [online, setOnline] = useState(true);

  useEffect(() => {
    if (typeof navigator === "undefined") return;
    const update = () => setOnline(navigator.onLine);
    update();
    window.addEventListener("online", update);
    window.addEventListener("offline", update);
    return () => {
      window.removeEventListener("online", update);
      window.removeEventListener("offline", update);
    };
  }, []);

  if (online) return null;

  return (
    <div className="flex items-center justify-center gap-2 bg-pending px-4 py-2 text-[11px] font-semibold text-white">
      <WifiOff className="size-3.5" />
      You&apos;re offline — entries are saved locally.
    </div>
  );
}
