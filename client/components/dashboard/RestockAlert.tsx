"use client";

import { AlertTriangle, MessageCircle } from "lucide-react";
import { useMemo } from "react";
import { cn } from "@/lib/utils";
import { useLowStock } from "@/lib/store/selectors";
import { useLedgerStore } from "@/lib/store/ledger-store";

interface RestockAlertProps {
  className?: string;
  /** Default wholesaler phone used for the WhatsApp deep-link. */
  defaultWholesalerPhone?: string;
}

/**
 * Compact card that appears when any inventory item is at/below its restock
 * threshold. Tapping it opens a prefilled WhatsApp message to the wholesaler.
 * Hidden entirely when there's nothing to warn about (so it doesn't hog
 * dashboard space in the common case).
 */
export function RestockAlert({
  className,
  defaultWholesalerPhone = "923000000000",
}: RestockAlertProps) {
  const hasHydrated = useLedgerStore((s) => s.hasHydrated);
  const lowStock = useLowStock();

  const waLink = useMemo(() => {
    if (lowStock.length === 0) return "";
    const lines = lowStock.map(
      (i) => `• ${i.name} — ${i.quantity} left (restock to ${i.threshold + 5})`
    );
    const msg = encodeURIComponent(
      `Assalam-o-Alaikum. Kindly send the following restock:\n${lines.join(
        "\n"
      )}\nJazakAllah.`
    );
    return `https://wa.me/${defaultWholesalerPhone}?text=${msg}`;
  }, [lowStock, defaultWholesalerPhone]);

  if (!hasHydrated || lowStock.length === 0) return null;

  return (
    <a
      href={waLink}
      target="_blank"
      rel="noreferrer"
      className={cn(
        "flex items-center gap-3 rounded-[22px] bg-pending-bg p-3.5 ring-1 ring-pending/20 active:scale-[0.99] transition",
        className
      )}
    >
      <span className="flex size-11 items-center justify-center rounded-full bg-white ring-1 ring-pending/20">
        <AlertTriangle className="size-5 text-pending" strokeWidth={2.25} />
      </span>
      <div className="flex-1 leading-tight min-w-0">
        <p className="text-sm font-semibold text-pending">
          Low stock — {lowStock.length} item{lowStock.length === 1 ? "" : "s"}
        </p>
        <p className="truncate text-[11px] text-muted-foreground">
          {lowStock
            .slice(0, 3)
            .map((i) => `${i.name} (${i.quantity})`)
            .join(", ")}
          {lowStock.length > 3 ? "…" : ""}
        </p>
      </div>
      <span className="flex size-9 items-center justify-center rounded-full bg-[#25D366] text-white shadow-sm">
        <MessageCircle className="size-4" strokeWidth={2.5} />
      </span>
    </a>
  );
}
