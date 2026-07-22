"use client";

import Link from "next/link";
import { VyaparShell } from "@/components/vyapar/VyaparShell";
import { usePartySettings } from "@/lib/usePartySettings";
import { useItemSettings } from "@/lib/useItemSettings";
import {
  Boxes,
  ChevronRight,
  FileText,
  Landmark,
  Percent,
  Printer,
  Settings as SettingsIcon,
  Users,
} from "lucide-react";

/**
 * Vyapar Settings hub, mirroring the sections Vyapar groups its preferences under. Party and Item
 * are live; the rest are listed so the full surface is visible rather than hidden.
 */
const SECTIONS = [
  { key: "party", title: "Party", desc: "Grouping, shipping address, reminders and custom fields", href: "/vyapar/parties/settings", icon: Users, built: true },
  { key: "item", title: "Item", desc: "Categories, wholesale price, barcode and stock tracking", href: "/vyapar/items/settings", icon: Boxes, built: true },
  { key: "general", title: "General", desc: "Company profile, financial year and number format", href: null, icon: SettingsIcon, built: false },
  { key: "transaction", title: "Transaction", desc: "Invoice numbering, due dates and payment terms", href: null, icon: FileText, built: false },
  { key: "print", title: "Firm Profile", desc: "Business name, logo, GSTIN and address for every PDF", href: "/vyapar/settings/firm-profile", icon: Printer, built: true },
  { key: "taxes", title: "Taxes & GST", desc: "GST slabs, HSN and place of supply defaults", href: null, icon: Percent, built: false },
  { key: "accounting", title: "Accounting", desc: "Opening balances and closing-book rules", href: null, icon: Landmark, built: false },
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
          {SECTIONS.map((s) => {
            const body = (
              <>
                <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full ${s.built ? "bg-cyan-50 text-brand-accent" : "bg-gray-100 text-gray-400"}`}>
                  <s.icon size={18} />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className={`text-sm font-semibold ${s.built ? "text-gray-800" : "text-gray-500"}`}>{s.title}</span>
                    {!s.built && <span className="rounded-full bg-gray-100 px-1.5 py-0.5 text-[9px] font-medium text-gray-400">soon</span>}
                  </div>
                  <p className="mt-0.5 text-xs text-gray-400">{s.desc}</p>
                </div>
                {s.built && <ChevronRight size={16} className="shrink-0 text-gray-300" />}
              </>
            );
            const base = "flex items-start gap-3 rounded-xl border bg-white p-4 text-left transition-all duration-150";
            return s.href ? (
              <Link key={s.key} href={s.href} className={`${base} border-gray-200 hover:-translate-y-0.5 hover:border-brand-accent hover:shadow-sm active:scale-[0.99]`}>
                {body}
              </Link>
            ) : (
              <div key={s.key} className={`${base} cursor-not-allowed border-dashed border-gray-200`}>
                {body}
              </div>
            );
          })}
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
