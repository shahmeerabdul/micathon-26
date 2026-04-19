"use client";

import Link from "next/link";
import { Plus, Search } from "lucide-react";
import { useState } from "react";
import { AppHeader } from "@/components/layout/AppHeader";
import { MobileShell } from "@/components/layout/MobileShell";
import { ContactAvatar } from "@/components/shared/ContactAvatar";
import { ListSkeleton } from "@/components/shared/Skeleton";
import { useContacts } from "@/lib/store/selectors";
import { useLedgerStore } from "@/lib/store/ledger-store";
import { scoreContact } from "@/lib/fuzzy";

export default function ContactsPage() {
  const hasHydrated = useLedgerStore((s) => s.hasHydrated);
  const contacts = useContacts();
  const [query, setQuery] = useState("");

  const filtered = query.trim()
    ? contacts
        .map((c) => ({ c, s: scoreContact(query, c.name) }))
        .filter((x) => x.s > 0.2)
        .sort((a, b) => b.s - a.s)
        .map((x) => x.c)
    : contacts;

  return (
    <>
      <AppHeader
        variant="page"
        title="Contacts"
        urduTitle="رابطے"
        subtitle="Customers you transact with"
        backHref="/"
      />
      <MobileShell>
        <div className="relative mb-3">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
          <input
            type="search"
            placeholder="Search contacts"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="w-full rounded-full border-0 bg-white pl-10 pr-4 py-3 text-sm shadow-sm ring-1 ring-border focus:outline-none focus:ring-2 focus:ring-sage"
          />
        </div>

        <Link
          href="/contacts/new"
          className="mb-3 flex items-center gap-3 rounded-[22px] bg-sage-soft p-3.5 ring-1 ring-black/5 active:scale-[0.99] transition"
        >
          <span className="flex size-11 items-center justify-center rounded-full bg-white ring-1 ring-black/5">
            <Plus className="size-5" strokeWidth={2.25} />
          </span>
          <div className="flex-1 leading-tight">
            <p className="text-sm font-semibold">Add new contact</p>
            <p className="text-[11px] text-muted-foreground">Nay customer add karen</p>
          </div>
        </Link>

        {!hasHydrated ? (
          <ListSkeleton />
        ) : filtered.length === 0 ? (
          <div className="rounded-[24px] bg-white/80 p-6 text-center ring-1 ring-black/5">
            <p className="text-sm text-muted-foreground">
              {query ? "No matching contacts." : "No contacts yet."}
            </p>
          </div>
        ) : (
          <ul className="space-y-2">
            {filtered.map((c) => (
              <li key={c.id}>
                <Link
                  href={`/contacts/${c.id}`}
                  className="flex items-center gap-3 rounded-[22px] bg-white p-3.5 shadow-[0_6px_16px_-12px_rgba(0,0,0,0.15)] ring-1 ring-black/5 active:scale-[0.99] transition"
                >
                  <ContactAvatar name={c.name} />
                  <div className="flex-1 leading-tight min-w-0">
                    <p className="truncate text-sm font-semibold">{c.name}</p>
                    <p className="text-[11px] text-muted-foreground">{c.phone}</p>
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </MobileShell>
    </>
  );
}
