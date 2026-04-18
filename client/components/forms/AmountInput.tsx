"use client";

import { cn } from "@/lib/utils";
import { Delete } from "lucide-react";

interface AmountInputProps {
  value: string;
  onChange(v: string): void;
  /** Display label above the number pad. */
  label?: string;
  className?: string;
}

/**
 * Big, thumb-sized on-screen keypad for entering whole-rupee amounts.
 * Kept purely visual/string-based so the parent owns validation/formatting;
 * emit `""` when empty so parents can disable submit cleanly.
 *
 * Design: overrides the OS keyboard on mobile to keep the full form
 * visible while typing — critical for the one-handed shopkeeper flow.
 */
export function AmountInput({ value, onChange, label, className }: AmountInputProps) {
  const append = (ch: string) => {
    if (value.length >= 9) return;
    if (ch === "0" && value === "0") return;
    onChange(value === "0" ? ch : value + ch);
  };
  const backspace = () => onChange(value.slice(0, -1));

  const display = value ? Number(value).toLocaleString("en-PK") : "0";

  const keys: Array<string | "back"> = [
    "1", "2", "3",
    "4", "5", "6",
    "7", "8", "9",
    "00", "0", "back",
  ];

  return (
    <div className={cn("space-y-3", className)}>
      {label ? (
        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          {label}
        </p>
      ) : null}
      <div className="rounded-[24px] bg-white p-5 ring-1 ring-border shadow-sm">
        <p className="text-[11px] uppercase tracking-wider text-muted-foreground">
          Amount (Rs.)
        </p>
        <p className="tabular text-4xl font-bold tracking-tight">
          Rs. {display}
        </p>
      </div>
      <div className="grid grid-cols-3 gap-2">
        {keys.map((k) => (
          <button
            key={k}
            type="button"
            onClick={() => (k === "back" ? backspace() : append(k))}
            className={cn(
              "h-14 rounded-2xl bg-white text-xl font-semibold ring-1 ring-border shadow-sm active:scale-95 transition",
              k === "back" && "text-muted-foreground"
            )}
          >
            {k === "back" ? <Delete className="size-5 inline" /> : k}
          </button>
        ))}
      </div>
    </div>
  );
}
