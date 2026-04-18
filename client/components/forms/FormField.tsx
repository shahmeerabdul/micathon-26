"use client";

import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

interface FormFieldProps {
  label: string;
  sublabel?: string;
  children: ReactNode;
  error?: string;
  className?: string;
}

export function FormField({ label, sublabel, children, error, className }: FormFieldProps) {
  return (
    <div className={cn("space-y-2", className)}>
      <div className="flex items-baseline justify-between">
        <label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          {label}
        </label>
        {sublabel ? (
          <span className="text-[10px] text-muted-foreground">{sublabel}</span>
        ) : null}
      </div>
      {children}
      {error ? (
        <p className="text-[11px] font-medium text-money-out">{error}</p>
      ) : null}
    </div>
  );
}

interface BigInputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  invalid?: boolean;
}

export function BigInput({ className, invalid, ...props }: BigInputProps) {
  return (
    <input
      {...props}
      className={cn(
        "w-full rounded-2xl border-0 bg-white px-4 py-4 text-base shadow-sm ring-1 ring-border",
        "focus:outline-none focus:ring-2 focus:ring-ink",
        invalid && "ring-money-out focus:ring-money-out",
        className
      )}
    />
  );
}

export function BigTextarea({
  className,
  ...props
}: React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return (
    <textarea
      {...props}
      rows={props.rows ?? 3}
      className={cn(
        "w-full rounded-2xl border-0 bg-white px-4 py-3 text-sm shadow-sm ring-1 ring-border",
        "focus:outline-none focus:ring-2 focus:ring-ink resize-none",
        className
      )}
    />
  );
}
