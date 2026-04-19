import Link from "next/link";
import { ArrowDownLeft, ArrowUpRight, ShoppingBag } from "lucide-react";
import { AppHeader } from "@/components/layout/AppHeader";
import { MobileShell } from "@/components/layout/MobileShell";

const options = [
  {
    href: "/new/debt",
    label: "Debt · Bakaya",
    sub: "Customer took on credit",
    icon: ArrowDownLeft,
    chip: "bg-pending-bg text-pending",
  },
  {
    href: "/new/payable",
    label: "Payable · Denay",
    sub: "You owe a supplier",
    icon: ArrowUpRight,
    chip: "bg-money-out-bg text-money-out",
  },
  {
    href: "/new/sale",
    label: "Sale · Bikri",
    sub: "Cash received",
    icon: ShoppingBag,
    chip: "bg-money-in-bg text-money-in",
  },
] as const;

export default function NewPage() {
  return (
    <>
      <AppHeader
        variant="page"
        title="New entry"
        urduTitle="نیا اندراج"
        subtitle="Pick a category"
        backHref="/"
      />
      <MobileShell>
        <ul className="space-y-3">
          {options.map((o) => {
            const Icon = o.icon;
            return (
              <li key={o.href}>
                <Link
                  href={o.href}
                  className="flex items-center gap-3 rounded-[22px] bg-white p-4 shadow-[0_8px_20px_-14px_rgba(0,0,0,0.15)] ring-1 ring-black/5 active:scale-[0.99] transition"
                >
                  <span className={`flex size-12 items-center justify-center rounded-full ${o.chip}`}>
                    <Icon className="size-5" strokeWidth={2.25} />
                  </span>
                  <div className="flex-1 leading-tight">
                    <p className="text-sm font-bold">{o.label}</p>
                    <p className="text-[11px] text-muted-foreground">{o.sub}</p>
                  </div>
                </Link>
              </li>
            );
          })}
        </ul>
      </MobileShell>
    </>
  );
}
