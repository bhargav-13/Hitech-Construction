"use client";

import Link from "next/link";
import { VyaparShell } from "@/components/vyapar/VyaparShell";
import { usePartySettings } from "@/lib/usePartySettings";
import { useItemSettings } from "@/lib/useItemSettings";
import { Boxes, ChevronRight, Printer, Users } from "lucide-react";

/** Vyapar Settings hub — the preference sections that are live in this ERP. */
const SECTIONS = [
  { key: "party", title: "Party", desc: "Grouping, shipping address, reminders and custom fields", href: "/vyapar/parties/settings", icon: Users },
  { key: "item", title: "Item", desc: "Categories, wholesale price, barcode and stock tracking", href: "/vyapar/items/settings", icon: Boxes },
  { key: "print", title: "Firm Profile", desc: "Business name, logo, GSTIN and address for every PDF", href: "/vyapar/settings/firm-profile", icon: Printer },
];

export default function VyaparSettingsPage() {
  const { settings: party } = usePartySettings();
  const { settings: item } = useItemSettings();

  return (
    <VyaparShell>
      <div className="animate-fade-in space-y-5">
        <div>
          <h2 className="text-base font-semibold text-gray-800">Settings</h2>
          <p className="mt-0.5 text-sm text-gray-500">Preferences for the Vyapar module.</p>
        </div>

        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {SECTIONS.map((s) => (
            <Link
              key={s.key}
              href={s.href}
              className="flex items-start gap-3 rounded-xl border border-gray-200 bg-white p-4 text-left transition-all duration-150 hover:-translate-y-0.5 hover:border-brand-accent hover:shadow-sm active:scale-[0.99]"
            >
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-cyan-50 text-brand-accent">
                <s.icon size={18} />
              </div>
              <div className="min-w-0 flex-1">
                <span className="text-sm font-semibold text-gray-800">{s.title}</span>
                <p className="mt-0.5 text-xs text-gray-400">{s.desc}</p>
              </div>
              <ChevronRight size={16} className="shrink-0 text-gray-300" />
            </Link>
          ))}
        </div>

        {/* Quick read-out of what's currently on, so Settings isn't just links. */}
        <div className="grid gap-4 lg:grid-cols-2">
          <Summary
            title="Party settings"
            href="/vyapar/parties/settings"
            rows={[
              ["Party grouping", party.partyGrouping],
              ["Shipping address", party.shippingAddress],
              ["Manage party status", party.managePartyStatus],
              ["Payment reminder", party.paymentReminder],
              ["Custom fields", party.fieldsEnabled.filter(Boolean).length > 0],
            ]}
          />
          <Summary
            title="Item settings"
            href="/vyapar/items/settings"
            rows={[
              ["Item category", item.itemCategory],
              ["Description", item.description],
              ["Wholesale price", item.wholesalePrice],
              ["Barcode scan", item.barcodeScan],
              ["Stock maintenance", item.stockMaintenance],
            ]}
          />
        </div>
      </div>
    </VyaparShell>
  );
}

function Summary({ title, href, rows }: { title: string; href: string; rows: [string, boolean][] }) {
  return (
    <section className="rounded-xl border border-gray-200 bg-white p-4">
      <div className="mb-3 flex items-center justify-between">
        <h3 className="text-sm font-semibold text-gray-800">{title}</h3>
        <Link href={href} className="text-xs font-medium text-brand-accent transition-colors duration-150 hover:underline">
          Edit
        </Link>
      </div>
      <div className="space-y-1.5">
        {rows.map(([label, on]) => (
          <div key={label} className="flex items-center justify-between text-sm">
            <span className="text-gray-600">{label}</span>
            <span className={`rounded-md px-2 py-0.5 text-[11px] font-medium ${on ? "bg-emerald-50 text-emerald-700" : "bg-gray-100 text-gray-400"}`}>
              {on ? "On" : "Off"}
            </span>
          </div>
        ))}
      </div>
    </section>
  );
}
