import Link from "next/link";
import { ContactAvatar } from "@/components/shared/ContactAvatar";
import { Amount } from "@/components/money/Amount";
import { timeAgo } from "@/lib/format";
import type { DebtContactGroup } from "@/lib/store/selectors";

interface DebtByContactListProps {
  groups: DebtContactGroup[];
}

/**
 * Debt list collapsed to one row per customer.
 *
 * The underlying store keeps each debt as its own transaction (audit trail),
 * but the `/debt` page behaves like a khata book — one line per customer,
 * showing their running total. Tapping a row opens the contact detail page
 * where the individual transactions are listed.
 */
export function DebtByContactList({ groups }: DebtByContactListProps) {
  if (groups.length === 0) {
    return (
      <div className="rounded-[24px] bg-white/80 p-6 text-center ring-1 ring-black/5">
        <p className="text-sm text-muted-foreground">
          No outstanding debts. Tap the mic to record one.
        </p>
      </div>
    );
  }

  return (
    <ul className="space-y-2">
      {groups.map((g) => (
        <li key={g.contactId}>
          <Link
            href={`/contacts/${g.contactId}`}
            className="flex items-center gap-3 rounded-[22px] bg-white p-3.5 shadow-[0_6px_16px_-12px_rgba(0,0,0,0.15)] ring-1 ring-black/5 active:scale-[0.99] transition"
          >
            <ContactAvatar name={g.name} />
            <div className="flex-1 leading-tight min-w-0">
              <p className="truncate text-sm font-semibold">{g.name}</p>
              <p className="truncate text-[11px] text-muted-foreground">
                Debt · {timeAgo(g.latestDate)}
                {g.count > 1 ? ` · ${g.count} entries` : ""}
              </p>
            </div>
            <Amount value={g.total} tone="pending" size="md" />
          </Link>
        </li>
      ))}
    </ul>
  );
}
