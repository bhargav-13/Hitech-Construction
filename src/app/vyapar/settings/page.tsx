"use client";

import { useState } from "react";
import Link from "next/link";
import { VyaparShell } from "@/components/vyapar/VyaparShell";
import { Select } from "@/components/Select";
import { Spinner } from "@/components/Spinner";
import { useVyaparSettings } from "@/lib/useVyaparSettings";
import { usePartySettings } from "@/lib/usePartySettings";
import { useItemSettings } from "@/lib/useItemSettings";
import type { VyaparSettings } from "@/lib/vyaparApi";
import { Boxes, ChevronRight, Printer, Users } from "lucide-react";

/**
 * Vyapar's Settings screen: a left tab rail and a panel of switches.
 *
 * These aren't cosmetic preferences — they drive the forms. "More Transactions" decides which
 * document types exist at all, Round Off decides how a total is rounded, and the item switches
 * decide which columns the invoice grid renders. Our previous Settings page was three links, so
 * every one of those behaviours was hardcoded somewhere in the UI instead.
 *
 * Party and Item keep their own dedicated pages (they're backed by their own stores), so those
 * tabs summarise and link rather than duplicating the controls.
 */
const TABS = ["General", "Transaction", "Party", "Item", "Print"] as const;
type Tab = (typeof TABS)[number];

export default function VyaparSettingsPage() {
  const { settings, loading, save } = useVyaparSettings();
  const [tab, setTab] = useState<Tab>("General");
  /**
   * Edits live in a local copy so a half-made change doesn't reformat every amount on screen
   * mid-edit. Derived rather than synced in an effect: null means "untouched, follow the store",
   * which also makes it re-sync for free once a save lands.
   */
  const [edits, setEdits] = useState<VyaparSettings | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(false);

  const draft = edits ?? (loading ? null : settings);
  const dirty = edits != null && JSON.stringify(edits) !== JSON.stringify(settings);

  function set<K extends keyof VyaparSettings>(key: K, value: VyaparSettings[K]) {
    setEdits((d) => ({ ...(d ?? settings), [key]: value }));
    setSaved(false);
  }

  async function commit() {
    if (!edits) return;
    setSaving(true);
    setError("");
    try {
      await save(edits);
      setEdits(null); // fall back to the store, which now holds what we just saved
      setSaved(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't save settings.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <VyaparShell>
      <div className="animate-fade-in space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h2 className="text-base font-semibold text-gray-800">Settings</h2>
            <p className="mt-0.5 text-sm text-gray-500">Preferences for the Vyapar module.</p>
          </div>
          <div className="flex items-center gap-3">
            {saved && !dirty && <span className="text-sm font-medium text-emerald-600">Saved</span>}
            <button
              onClick={commit}
              disabled={!dirty || saving}
              className="rounded-lg bg-brand-accent px-5 py-2 text-sm font-semibold text-white transition-all duration-150 hover:opacity-90 active:scale-95 disabled:opacity-40"
            >
              {saving ? "Saving…" : "Save Changes"}
            </button>
          </div>
        </div>

        {error && <div className="rounded-lg bg-rose-50 px-4 py-2 text-sm text-rose-600">{error}</div>}

        <div className="grid grid-cols-1 gap-4 lg:grid-cols-[200px_minmax(0,1fr)]">
          {/* Tab rail */}
          <nav className="h-fit overflow-hidden rounded-xl border border-gray-200 bg-white p-1.5">
            {TABS.map((t) => (
              <button
                key={t}
                onClick={() => setTab(t)}
                className={`flex w-full items-center justify-between rounded-lg px-3 py-2 text-left text-sm transition-colors duration-150 ${
                  tab === t ? "bg-cyan-50 font-medium text-brand-accent" : "text-gray-600 hover:bg-gray-50"
                }`}
              >
                {t.toUpperCase()}
                {tab === t && <ChevronRight size={14} />}
              </button>
            ))}
          </nav>

          <div className="rounded-xl border border-gray-200 bg-white p-5">
            {loading || !draft ? (
              <div className="flex min-h-[280px] items-center justify-center gap-2 text-sm text-gray-400">
                <Spinner size={16} className="text-brand-accent" /> Loading settings…
              </div>
            ) : tab === "General" ? (
              <GeneralTab draft={draft} set={set} />
            ) : tab === "Transaction" ? (
              <TransactionTab draft={draft} set={set} />
            ) : tab === "Party" ? (
              <PartySummary />
            ) : tab === "Item" ? (
              <ItemSummary />
            ) : (
              <PrintSummary />
            )}
          </div>
        </div>
      </div>
    </VyaparShell>
  );
}

type Setter = <K extends keyof VyaparSettings>(key: K, value: VyaparSettings[K]) => void;

function GeneralTab({ draft, set }: { draft: VyaparSettings; set: Setter }) {
  return (
    <div className="grid gap-8 md:grid-cols-2">
      <Section title="Application">
        {/* This is the setting that makes every amount on every screen render like their books. */}
        <NumberRow
          label="Amount (upto Decimal Places)"
          hint="How many decimals every amount shows. This client's books run at 3."
          value={draft.amountDecimals}
          min={0}
          max={3}
          onChange={(v) => set("amountDecimals", v)}
        />
        <NumberRow
          label="Quantity (upto Decimal Places)"
          value={draft.quantityDecimals}
          min={0}
          max={3}
          onChange={(v) => set("quantityDecimals", v)}
        />
      </Section>

      <Section title="More Transactions" hint="Which document types appear in the module.">
        <Check label="Estimate / Quotation" checked={draft.estimateEnabled} onChange={(v) => set("estimateEnabled", v)} />
        <Check label="Proforma Invoice" checked={draft.proformaEnabled} onChange={(v) => set("proformaEnabled", v)} />
        <Check label="Sale / Purchase Order" checked={draft.ordersEnabled} onChange={(v) => set("ordersEnabled", v)} />
        <Check label="Delivery Challan" checked={draft.deliveryChallanEnabled} onChange={(v) => set("deliveryChallanEnabled", v)} />
      </Section>
    </div>
  );
}

function TransactionTab({ draft, set }: { draft: VyaparSettings; set: Setter }) {
  return (
    <div className="grid gap-8 md:grid-cols-2">
      <Section title="Taxes, Discount & Totals">
        <Check label="Transaction wise Tax" checked={draft.transactionWiseTax} onChange={(v) => set("transactionWiseTax", v)} />
        <Check
          label="Transaction wise Discount"
          checked={draft.transactionWiseDiscount}
          onChange={(v) => set("transactionWiseDiscount", v)}
        />
        <Check label="Round Off Total" checked={draft.roundOffEnabled} onChange={(v) => set("roundOffEnabled", v)} />
        {draft.roundOffEnabled && (
          <div className="mt-1 flex items-center gap-2 pl-6">
            <Select
              value={draft.roundOffMode}
              onChange={(v) => set("roundOffMode", v as VyaparSettings["roundOffMode"])}
              size="sm"
              className="w-32"
              options={[
                { value: "NEAREST", label: "Nearest" },
                { value: "UP", label: "Up" },
                { value: "DOWN", label: "Down" },
              ]}
            />
            <span className="text-sm text-gray-500">To</span>
            <Select
              value={String(draft.roundOffTo)}
              onChange={(v) => set("roundOffTo", Number(v))}
              size="sm"
              className="w-24"
              options={[
                { value: "1", label: "1" },
                { value: "10", label: "10" },
                { value: "100", label: "100" },
              ]}
            />
          </div>
        )}
      </Section>

      <Section title="Items Table">
        <Check label="Item wise Tax" checked={draft.itemWiseTax} onChange={(v) => set("itemWiseTax", v)} />
        <Check label="Item wise Discount" checked={draft.itemWiseDiscount} onChange={(v) => set("itemWiseDiscount", v)} />
        <Check
          label="Display Purchase Price of Items"
          checked={draft.displayPurchasePrice}
          onChange={(v) => set("displayPurchasePrice", v)}
        />
      </Section>

      <Section title="More Transaction Features">
        <Check
          label="Due Dates and Payment Terms"
          hint="Adds the Due Date field to the sale form."
          checked={draft.dueDatesEnabled}
          onChange={(v) => set("dueDatesEnabled", v)}
        />
        <Check
          label="Link Payments to Invoices"
          hint="Lets a receipt be spread across open bills; anything unlinked shows as Unused."
          checked={draft.linkPaymentsEnabled}
          onChange={(v) => set("linkPaymentsEnabled", v)}
        />
      </Section>
    </div>
  );
}

/** Party and Item settings live in their own stores, so these tabs summarise and link. */
function PartySummary() {
  const { settings } = usePartySettings();
  return (
    <LinkedSummary
      title="Party settings"
      href="/vyapar/parties/settings"
      icon={Users}
      rows={[
        ["Party grouping", settings.partyGrouping],
        ["Shipping address", settings.shippingAddress],
        ["Manage party status", settings.managePartyStatus],
        ["Payment reminder", settings.paymentReminder],
        ["Custom fields", settings.fieldsEnabled.filter(Boolean).length > 0],
      ]}
    />
  );
}

function ItemSummary() {
  const { settings } = useItemSettings();
  return (
    <LinkedSummary
      title="Item settings"
      href="/vyapar/items/settings"
      icon={Boxes}
      rows={[
        ["Item category", settings.itemCategory],
        ["Description", settings.description],
        ["Wholesale price", settings.wholesalePrice],
        ["Barcode scan", settings.barcodeScan],
        ["Stock maintenance", settings.stockMaintenance],
      ]}
    />
  );
}

function PrintSummary() {
  return (
    <div>
      <SectionHeading title="Print" />
      <p className="mt-2 max-w-lg text-sm text-gray-500">
        The firm profile stamped onto every PDF and print-out — business name, logo, GSTIN and
        address.
      </p>
      <Link
        href="/vyapar/settings/firm-profile"
        className="mt-4 inline-flex items-center gap-2 rounded-lg border border-gray-200 px-4 py-2 text-sm font-medium text-gray-700 transition-colors duration-150 hover:bg-gray-50"
      >
        <Printer size={15} /> Open Firm Profile <ChevronRight size={14} className="text-gray-300" />
      </Link>
      <p className="mt-6 max-w-lg text-xs text-gray-400">
        Vyapar also offers invoice themes, a thermal-printer profile and a live preview here. Those
        aren&apos;t built yet — see <code className="font-mono">docs/vyapar-parity.md</code> (H12).
      </p>
    </div>
  );
}

function LinkedSummary({
  title,
  href,
  icon: Icon,
  rows,
}: {
  title: string;
  href: string;
  icon: React.ComponentType<{ size?: number; className?: string }>;
  rows: [string, boolean][];
}) {
  return (
    <div>
      <div className="flex items-center justify-between">
        <SectionHeading title={title} />
        <Link
          href={href}
          className="flex items-center gap-1.5 rounded-lg border border-gray-200 px-3 py-1.5 text-sm font-medium text-gray-700 transition-colors duration-150 hover:bg-gray-50"
        >
          <Icon size={14} /> Edit
        </Link>
      </div>
      <div className="mt-4 max-w-md space-y-1.5">
        {rows.map(([label, on]) => (
          <div key={label} className="flex items-center justify-between text-sm">
            <span className="text-gray-600">{label}</span>
            <span
              className={`rounded-md px-2 py-0.5 text-[11px] font-medium ${
                on ? "bg-emerald-50 text-emerald-700" : "bg-gray-100 text-gray-400"
              }`}
            >
              {on ? "On" : "Off"}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

function SectionHeading({ title }: { title: string }) {
  return <h3 className="border-b border-gray-100 pb-2 text-sm font-semibold text-gray-800">{title}</h3>;
}

function Section({ title, hint, children }: { title: string; hint?: string; children: React.ReactNode }) {
  return (
    <section>
      <SectionHeading title={title} />
      {hint && <p className="mt-1.5 text-xs text-gray-400">{hint}</p>}
      <div className="mt-3 space-y-2.5">{children}</div>
    </section>
  );
}

function Check({
  label,
  hint,
  checked,
  onChange,
}: {
  label: string;
  hint?: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <label className="flex cursor-pointer items-start gap-2.5">
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="mt-0.5 h-4 w-4 shrink-0 accent-cyan-600"
      />
      <span className="min-w-0">
        <span className="block text-sm text-gray-700">{label}</span>
        {hint && <span className="block text-xs text-gray-400">{hint}</span>}
      </span>
    </label>
  );
}

function NumberRow({
  label,
  hint,
  value,
  min,
  max,
  onChange,
}: {
  label: string;
  hint?: string;
  value: number;
  min: number;
  max: number;
  onChange: (v: number) => void;
}) {
  return (
    <label className="block">
      <span className="block text-sm text-gray-700">{label}</span>
      {hint && <span className="block text-xs text-gray-400">{hint}</span>}
      <input
        type="number"
        min={min}
        max={max}
        value={value}
        onChange={(e) => onChange(Math.max(min, Math.min(max, Number(e.target.value) || 0)))}
        className="mt-1 w-24 rounded-md border border-gray-200 px-2 py-1 text-sm outline-none focus:border-cyan-500"
      />
    </label>
  );
}
