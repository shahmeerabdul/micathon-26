import Link from "next/link";
import { ContactAvatar } from "@/components/shared/ContactAvatar";
import { Amount } from "@/components/money/Amount";
import { timeAgo } from "@/lib/format";
import type { PayableSupplierGroup } from "@/lib/store/selectors";

interface PayableBySupplierListProps {
  groups: PayableSupplierGroup[];
}

/**
 * Payables list collapsed to one row per supplier.
 *
 * Mirrors `DebtByContactList` on the receivables side. Individual
 * payable transactions remain in the store (audit trail) but the
 * `/payables` page rolls them up so "Bilal Wholesale Rs. 400" +
 * "Bilal Wholesale Rs. 5,000" render as a single Rs. 5,400 line.
 *
 * Tapping a grouped row links to the most recent underlying payable's
 * detail page so the shopkeeper can edit / settle / delete it.
 */
export function PayableBySupplierList({ groups }: PayableBySupplierListProps) {
  if (groups.length === 0) {
    return (
      <div className="rounded-[24px] bg-white/80 p-6 text-center ring-1 ring-black/5">
        <p className="text-sm text-muted-foreground">
          No outstanding payables. Tap the mic to log one.
        </p>
      </div>
    );
  }

  return (
    <ul className="space-y-2">
      {groups.map((g) => (
        <li key={g.key}>
          <Link
            href={`/entry/payable/${g.payableIds[0]}`}
            className="flex items-center gap-3 rounded-[22px] bg-white p-3.5 shadow-[0_6px_16px_-12px_rgba(0,0,0,0.15)] ring-1 ring-black/5 active:scale-[0.99] transition"
          >
            <ContactAvatar name={g.name} />
            <div className="flex-1 leading-tight min-w-0">
              <p className="truncate text-sm font-semibold">{g.name}</p>
              <p className="truncate text-[11px] text-muted-foreground">
                Payables · {timeAgo(g.latestDate)}
                {g.count > 1 ? ` · ${g.count} entries` : ""}
              </p>
            </div>
            <Amount value={g.total} tone="out" size="md" />
          </Link>
        </li>
      ))}
    </ul>
  );
}
