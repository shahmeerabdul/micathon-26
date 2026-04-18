import { cn } from "@/lib/utils";

export function Skeleton({ className }: { className?: string }) {
  return (
    <div
      className={cn(
        "animate-pulse rounded-[22px] bg-white/60 ring-1 ring-black/5",
        className
      )}
    />
  );
}

export function ListSkeleton({ count = 4 }: { count?: number }) {
  return (
    <ul className="space-y-2">
      {Array.from({ length: count }).map((_, i) => (
        <li key={i}>
          <Skeleton className="h-16 w-full" />
        </li>
      ))}
    </ul>
  );
}

export function DashboardSkeleton() {
  return (
    <div className="space-y-5">
      <Skeleton className="h-44 w-full rounded-[28px]" />
      <div className="flex gap-3">
        <Skeleton className="h-20 flex-1" />
        <Skeleton className="h-20 flex-1" />
      </div>
      <div className="space-y-3">
        <Skeleton className="h-16 w-full" />
        <Skeleton className="h-16 w-full" />
        <Skeleton className="h-16 w-full" />
      </div>
    </div>
  );
}
