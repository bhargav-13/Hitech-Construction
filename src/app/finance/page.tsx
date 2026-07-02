"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowDownCircle,
  ArrowUpCircle,
  FileText,
  Package,
  ShoppingCart,
  Users,
} from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { InvoiceModal } from "@/components/InvoiceModal";
import { PaymentModal } from "@/components/PaymentModal";
import { PartyModal } from "@/components/PartyModal";
import { ItemModal } from "@/components/ItemModal";
import { useAppStore } from "@/lib/store";
import { formatRupee } from "@/lib/projectHelpers";
import type { PaymentDirection } from "@/lib/types";

const TABS = ["Overview", "Sale Invoices", "Purchases", "Payments", "Party Ledger", "Parties", "Items"] as const;
type Tab = (typeof TABS)[number];

export default function FinancePage() {
  const router = useRouter();
  const parties = useAppStore((s) => s.parties);
  const items = useAppStore((s) => s.items);
  const projects = useAppStore((s) => s.projects);
  const saleInvoices = useAppStore((s) => s.saleInvoices);
  const purchaseEntries = useAppStore((s) => s.purchaseEntries);
  const payments = useAppStore((s) => s.payments);

  const [tab, setTab] = useState<Tab>("Overview");
  const [modal, setModal] = useState<
    "sale" | "purchase" | "in" | "out" | "party" | "item" | null
  >(null);

  const partyName = (id: string) => parties.find((p) => p.id === id)?.name ?? "—";
  const projectName = (id: string) => projects.find((p) => p.id === id)?.name ?? "—";

  const totals = useMemo(() => {
    const totalSales = saleInvoices.reduce((sum, i) => sum + i.total, 0);
    const totalPurchases = purchaseEntries.reduce((sum, p) => sum + p.total, 0);
    const totalIn = payments.filter((p) => p.direction === "In").reduce((sum, p) => sum + p.amount, 0);
    const totalOut = payments.filter((p) => p.direction === "Out").reduce((sum, p) => sum + p.amount, 0);
    return { totalSales, totalPurchases, totalIn, totalOut };
  }, [saleInvoices, purchaseEntries, payments]);

  return (
    <AppShell title="Finance">
      <div className="mb-4 grid grid-cols-4 gap-4">
        <SummaryCard label="Total Sales" value={formatRupee(totals.totalSales)} color="text-indigo-600" />
        <SummaryCard label="Total Purchases" value={formatRupee(totals.totalPurchases)} color="text-amber-600" />
        <SummaryCard label="Payment In" value={formatRupee(totals.totalIn)} color="text-green-600" />
        <SummaryCard label="Payment Out" value={formatRupee(totals.totalOut)} color="text-rose-600" />
      </div>

      <div className="mb-4 grid grid-cols-3 gap-3 sm:grid-cols-6">
        <ActionTile icon={FileText} label="Sale Invoice" onClick={() => router.push("/finance/new-sale")} />
        <ActionTile icon={ShoppingCart} label="Purchase Entry" onClick={() => setModal("purchase")} />
        <ActionTile icon={ArrowDownCircle} label="Payment In" onClick={() => setModal("in")} tint="text-green-600" />
        <ActionTile icon={ArrowUpCircle} label="Payment Out" onClick={() => setModal("out")} tint="text-rose-600" />
        <ActionTile icon={Users} label="Party" onClick={() => setModal("party")} />
        <ActionTile icon={Package} label="Item" onClick={() => setModal("item")} />
      </div>

      <div className="mb-4 flex gap-6 border-b border-gray-200">
        {TABS.map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`border-b-2 px-1 py-2 text-sm font-medium whitespace-nowrap ${
              tab === t
                ? "border-brand-accent text-brand-accent"
                : "border-transparent text-gray-500 hover:text-gray-700"
            }`}
          >
            {t}
          </button>
        ))}
      </div>

      {tab === "Overview" && (
        <div className="rounded-xl border border-gray-200 bg-white">
          <h3 className="border-b border-gray-100 px-4 py-3 text-sm font-semibold text-gray-700">
            Recent Activity
          </h3>
          <div className="divide-y divide-gray-50">
            {[
              ...saleInvoices.map((i) => ({
                key: `inv-${i.id}`,
                text: `Sale Invoice ${i.invoiceNumber} — ${partyName(i.partyId)}`,
                amount: i.total,
                positive: true,
                date: i.date,
              })),
              ...purchaseEntries.map((p) => ({
                key: `pur-${p.id}`,
                text: `Purchase ${p.billNumber} — ${partyName(p.partyId)}`,
                amount: p.total,
                positive: false,
                date: p.date,
              })),
              ...payments.map((p) => ({
                key: `pay-${p.id}`,
                text: `Payment ${p.direction} — ${partyName(p.partyId)}`,
                amount: p.amount,
                positive: p.direction === "In",
                date: p.date,
              })),
            ]
              .sort((a, b) => (a.key < b.key ? 1 : -1))
              .slice(0, 10)
              .map((row) => (
                <div key={row.key} className="flex items-center justify-between px-4 py-3 text-sm">
                  <div>
                    <div className="text-gray-700">{row.text}</div>
                    <div className="text-xs text-gray-400">{row.date}</div>
                  </div>
                  <div className={row.positive ? "font-medium text-green-600" : "font-medium text-rose-600"}>
                    {row.positive ? "+" : "-"}
                    {formatRupee(row.amount)}
                  </div>
                </div>
              ))}
          </div>
        </div>
      )}

      {tab === "Sale Invoices" && (
        <Table
          columns={["Invoice #", "Client", "Project", "Date", "Total", "Received", "Balance", "Status"]}
          rows={saleInvoices.map((i) => [
            i.invoiceNumber,
            partyName(i.partyId),
            projectName(i.projectId),
            i.date,
            formatRupee(i.total),
            formatRupee(i.received),
            formatRupee(Math.max(0, i.total - i.received)),
            <StatusBadge key={i.id} status={i.status} />,
          ])}
        />
      )}

      {tab === "Party Ledger" && (
        <Table
          columns={["Party", "Type", "Total Billed", "Total Paid", "Balance"]}
          rows={parties.map((p) => {
            const billed =
              p.type === "Client"
                ? saleInvoices.filter((i) => i.partyId === p.id).reduce((s, i) => s + i.total, 0)
                : purchaseEntries.filter((e) => e.partyId === p.id).reduce((s, e) => s + e.total, 0);
            const paid = payments
              .filter((pay) => pay.partyId === p.id)
              .reduce((s, pay) => s + pay.amount, 0);
            const balance = billed - paid;
            return [
              p.name,
              p.type,
              formatRupee(billed),
              formatRupee(paid),
              <span
                key={p.id}
                className={balance > 0 ? "font-medium text-rose-600" : "font-medium text-green-600"}
              >
                {formatRupee(Math.abs(balance))} {balance > 0 ? "Due" : balance < 0 ? "Adv" : ""}
              </span>,
            ];
          })}
        />
      )}

      {tab === "Purchases" && (
        <Table
          columns={["Bill #", "Vendor", "Project", "Date", "Total"]}
          rows={purchaseEntries.map((p) => [
            p.billNumber,
            partyName(p.partyId),
            projectName(p.projectId),
            p.date,
            formatRupee(p.total),
          ])}
        />
      )}

      {tab === "Payments" && (
        <Table
          columns={["Date", "Direction", "Party", "Project", "Amount", "Mode", "Note"]}
          rows={payments.map((p) => [
            p.date,
            <DirectionBadge key={p.id} direction={p.direction} />,
            partyName(p.partyId),
            projectName(p.projectId),
            formatRupee(p.amount),
            p.mode,
            p.note,
          ])}
        />
      )}

      {tab === "Parties" && (
        <Table
          columns={["Name", "Type", "Phone", "GSTIN"]}
          rows={parties.map((p) => [p.name, p.type, p.phone, p.gstin || "—"])}
        />
      )}

      {tab === "Items" && (
        <Table
          columns={["Item Name", "Unit", "Rate", "GST %"]}
          rows={items.map((it) => [it.name, it.unit, formatRupee(it.rate), `${it.gstRate}%`])}
        />
      )}

      {modal === "purchase" && <InvoiceModal mode="purchase" onClose={() => setModal(null)} />}
      {modal === "in" && <PaymentModal direction={"In" as PaymentDirection} onClose={() => setModal(null)} />}
      {modal === "out" && <PaymentModal direction={"Out" as PaymentDirection} onClose={() => setModal(null)} />}
      {modal === "party" && <PartyModal onClose={() => setModal(null)} />}
      {modal === "item" && <ItemModal onClose={() => setModal(null)} />}
    </AppShell>
  );
}

function SummaryCard({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <div className="rounded-xl border border-gray-200 bg-white p-4">
      <div className="text-sm text-gray-500">{label}</div>
      <div className={`mt-1 text-xl font-semibold ${color}`}>{value}</div>
    </div>
  );
}

function ActionTile({
  icon: Icon,
  label,
  onClick,
  tint = "text-brand-accent",
}: {
  icon: React.ComponentType<{ size?: number }>;
  label: string;
  onClick: () => void;
  tint?: string;
}) {
  return (
    <button
      onClick={onClick}
      className="flex flex-col items-center gap-2 rounded-xl border border-gray-200 bg-white p-4 text-center hover:bg-gray-50"
    >
      <Icon size={22} />
      <span className={`text-xs font-medium ${tint}`}>+ {label}</span>
    </button>
  );
}

function Table({ columns, rows }: { columns: string[]; rows: React.ReactNode[][] }) {
  return (
    <div className="w-full min-w-0 overflow-x-auto rounded-xl border border-gray-200 bg-white">
      <table className="w-full min-w-[700px] border-collapse text-sm">
        <thead>
          <tr className="border-b border-gray-100 bg-gray-50 text-left text-xs font-medium text-gray-500">
            {columns.map((c) => (
              <th key={c} className="px-4 py-3 whitespace-nowrap">
                {c}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 ? (
            <tr>
              <td colSpan={columns.length} className="px-4 py-10 text-center text-sm text-gray-400">
                No records yet.
              </td>
            </tr>
          ) : (
            rows.map((row, i) => (
              <tr key={i} className="border-b border-gray-50 last:border-b-0">
                {row.map((cell, j) => (
                  <td key={j} className="px-4 py-3 whitespace-nowrap text-gray-700">
                    {cell}
                  </td>
                ))}
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );
}

function StatusBadge({ status }: { status: "Paid" | "Partial" | "Pending" | "Overdue" }) {
  const cls =
    status === "Paid"
      ? "bg-green-100 text-green-700"
      : status === "Partial"
        ? "bg-blue-100 text-blue-700"
        : status === "Pending"
          ? "bg-amber-100 text-amber-700"
          : "bg-rose-100 text-rose-700";
  return <span className={`rounded-md px-2 py-1 text-xs font-medium ${cls}`}>{status}</span>;
}

function DirectionBadge({ direction }: { direction: "In" | "Out" }) {
  return (
    <span
      className={`rounded-md px-2 py-1 text-xs font-medium ${
        direction === "In" ? "bg-green-100 text-green-700" : "bg-rose-100 text-rose-700"
      }`}
    >
      {direction}
    </span>
  );
}
