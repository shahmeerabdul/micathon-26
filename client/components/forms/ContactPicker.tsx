"use client";

import { useState, useMemo } from "react";
import { ChevronRight, Plus, Search, X, Check } from "lucide-react";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { ContactAvatar } from "@/components/shared/ContactAvatar";
import { useContacts, useContact } from "@/lib/store/selectors";
import { useLedgerStore } from "@/lib/store/ledger-store";
import { scoreContact } from "@/lib/fuzzy";
import { cn } from "@/lib/utils";
import type { Contact, Id, PakistanPhone } from "@/lib/types";

interface ContactPickerProps {
  value?: Id;
  onChange(id: Id | undefined): void;
  /** Allow clearing the selection (sales allow walk-in cash). */
  allowClear?: boolean;
  placeholder?: string;
}

/**
 * Bottom-sheet contact picker with search and inline "add new".
 * The selected value is the contact id; parent owns the rest.
 *
 * Inline-add uses a minimal name + phone form to stay frictionless —
 * the full contact editor lives at /contacts/new for richer fields.
 */
export function ContactPicker({
  value,
  onChange,
  allowClear,
  placeholder = "Select contact",
}: ContactPickerProps) {
  const selected = useContact(value);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [mode, setMode] = useState<"pick" | "add">("pick");
  const [newName, setNewName] = useState("");
  const [newPhone, setNewPhone] = useState("");
  const contacts = useContacts();
  const addContact = useLedgerStore((s) => s.addContact);

  const filtered = useMemo(() => {
    if (!query.trim()) return contacts;
    return contacts
      .map((c) => ({ c, s: scoreContact(query, c.name) }))
      .filter((x) => x.s > 0.2)
      .sort((a, b) => b.s - a.s)
      .map((x) => x.c);
  }, [contacts, query]);

  const handlePick = (c: Contact) => {
    onChange(c.id);
    setOpen(false);
  };

  const handleCreate = () => {
    const name = newName.trim();
    if (!name) return;
    const phone = (newPhone.trim() || "+92") as PakistanPhone;
    const created = addContact({ name, phone });
    onChange(created.id);
    setNewName("");
    setNewPhone("");
    setMode("pick");
    setOpen(false);
  };

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <div className="relative">
        <SheetTrigger
          className="flex w-full items-center gap-3 rounded-2xl bg-white px-4 py-3 ring-1 ring-border shadow-sm active:scale-[0.99] transition"
        >
          {selected ? (
            <>
              <ContactAvatar name={selected.name} size="sm" />
              <div className="flex-1 text-left leading-tight min-w-0">
                <p className="truncate text-sm font-semibold">{selected.name}</p>
                <p className="truncate text-[11px] text-muted-foreground">{selected.phone}</p>
              </div>
            </>
          ) : (
            <>
              <span className="flex size-8 items-center justify-center rounded-full bg-sage-soft">
                <Plus className="size-4" />
              </span>
              <span className="flex-1 text-left text-sm text-muted-foreground">
                {placeholder}
              </span>
            </>
          )}
          <ChevronRight className="size-4 text-muted-foreground" />
        </SheetTrigger>
        {allowClear && selected ? (
          <button
            type="button"
            onClick={() => onChange(undefined)}
            aria-label="Clear"
            className="absolute right-12 top-1/2 -translate-y-1/2 flex size-7 items-center justify-center rounded-full bg-muted z-10"
          >
            <X className="size-3.5" />
          </button>
        ) : null}
      </div>

      <SheetContent side="bottom" className="max-h-[85vh] rounded-t-[32px] p-0">
        <SheetHeader className="px-5 pt-5 pb-3 text-left">
          <SheetTitle>
            {mode === "pick" ? "Select contact" : "Add new contact"}
          </SheetTitle>
        </SheetHeader>

        {mode === "pick" ? (
          <div className="flex flex-col overflow-hidden">
            <div className="relative mx-5">
              <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
              <input
                autoFocus
                type="search"
                placeholder="Type to search"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                className="w-full rounded-full border-0 bg-muted pl-10 pr-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-ink"
              />
            </div>
            <button
              type="button"
              onClick={() => {
                setNewName(query);
                setMode("add");
              }}
              className="mx-5 mt-3 flex items-center gap-3 rounded-[20px] bg-sage-soft p-3 ring-1 ring-black/5 active:scale-[0.99] transition"
            >
              <span className="flex size-9 items-center justify-center rounded-full bg-white ring-1 ring-black/5">
                <Plus className="size-4" />
              </span>
              <span className="text-sm font-semibold">
                {query.trim() ? `Add "${query.trim()}"` : "Add new contact"}
              </span>
            </button>

            <ul className="mt-3 flex-1 overflow-y-auto px-5 pb-6 space-y-2">
              {filtered.map((c) => (
                <li key={c.id}>
                  <button
                    type="button"
                    onClick={() => handlePick(c)}
                    className={cn(
                      "flex w-full items-center gap-3 rounded-[18px] bg-white p-3 ring-1 ring-border shadow-sm active:scale-[0.99] transition",
                      value === c.id && "ring-2 ring-ink"
                    )}
                  >
                    <ContactAvatar name={c.name} size="sm" />
                    <div className="flex-1 text-left leading-tight min-w-0">
                      <p className="truncate text-sm font-semibold">{c.name}</p>
                      <p className="truncate text-[11px] text-muted-foreground">{c.phone}</p>
                    </div>
                    {value === c.id ? (
                      <Check className="size-4 text-money-in" />
                    ) : null}
                  </button>
                </li>
              ))}
              {filtered.length === 0 ? (
                <li className="pt-6 text-center text-sm text-muted-foreground">
                  No matches.
                </li>
              ) : null}
            </ul>
          </div>
        ) : (
          <div className="space-y-3 px-5 pb-6">
            <div>
              <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Name
              </label>
              <input
                autoFocus
                type="text"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                placeholder="e.g. Ahmed Khan"
                className="w-full rounded-2xl border-0 bg-white px-4 py-4 text-base shadow-sm ring-1 ring-border focus:outline-none focus:ring-2 focus:ring-ink"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Phone (optional)
              </label>
              <input
                type="tel"
                inputMode="tel"
                value={newPhone}
                onChange={(e) => setNewPhone(e.target.value)}
                placeholder="+923001234567"
                className="w-full rounded-2xl border-0 bg-white px-4 py-4 text-base shadow-sm ring-1 ring-border focus:outline-none focus:ring-2 focus:ring-ink"
              />
            </div>
            <div className="flex gap-2 pt-2">
              <button
                type="button"
                onClick={() => setMode("pick")}
                className="flex-1 rounded-2xl bg-muted px-4 py-3 text-sm font-semibold active:scale-95 transition"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleCreate}
                disabled={!newName.trim()}
                className="flex-1 rounded-2xl bg-ink px-4 py-3 text-sm font-semibold text-background active:scale-95 transition disabled:opacity-50"
              >
                Add contact
              </button>
            </div>
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}
