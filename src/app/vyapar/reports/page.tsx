"use client";

import { Suspense, useCallback, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { VyaparShell, VyaparEmpty } from "@/components/vyapar/VyaparShell";
import { VYAPAR_REPORTS, REPORT_GROUPS } from "@/lib/vyaparConfig";
import { Spinner } from "@/components/Spinner";
import { DatePicker } from "@/components/DatePicker";
import { inr } from "@/lib/format";
import { useVyaparBankId } from "@/lib/bankScope";
import * as vyapar from "@/lib/vyaparApi";
import type { CashBankTxn, Invoice, InvoiceLine, Item, Party, Payment } from "@/lib/vyaparApi";
import { ChevronRight, Download, FileText } from "lucide-react";

type ReportId = string;

/** A cash/bank movement tagged with the account it belongs to, for the Bank Statement report. */
type BankLedgerRow = CashBankTxn & { accountName: string };

/** An invoice line joined to its parent document and catalogue item — the basis of most reports. */
interface LineRow {
  inv: Invoice;
  line: InvoiceLine;
  item?: Item;
  /** Line value excluding tax. */
  taxable: number;
  tax: number;
  /** What the goods cost us: qty x the item's purchase price. */
  cost: number;
}

/**
 * useSearchParams() opts the tree into client-side rendering, which Next requires be fenced off
 * behind a Suspense boundary — without it the production build fails to prerender this route.
 */
export default function VyaparReportsPage() {
  return (
    <Suspense fallback={null}>
      <ReportsIndex />
    </Suspense>
  );
}

function ReportsIndex() {
  const params = useSearchParams();
  const [open, setOpen] = useState<ReportId | null>(null);

  useEffect(() => {
    const r = params?.get("r") as ReportId | null;
    if (r && VYAPAR_REPORTS.some((x) => x.id === r)) setOpen(r);
  }, [params]);

  return (
    <VyaparShell>
      {!open ? (
        <div className="animate-fade-in space-y-5">
          <div>
            <h2 className="text-base font-semibold text-gray-800">Reports</h2>
            <p className="mt-0.5 text-sm text-gray-500">
              {VYAPAR_REPORTS.length} reports, each built from your live books.
            </p>
          </div>
          {REPORT_GROUPS.map((group) => {
            const inGroup = VYAPAR_REPORTS.filter((r) => r.group === group);
            if (inGroup.length === 0) return null;
            return (
              <div key={group}>
                <div className="mb-2 text-[11px] font-semibold tracking-wide text-gray-400 uppercase">{group}</div>
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                  {inGroup.map((r) => (
                    <button
                      key={r.id}
                      onClick={() => setOpen(r.id as ReportId)}
                      className="flex items-center justify-between rounded-xl border border-gray-200 bg-white px-4 py-3 text-left text-sm font-medium text-gray-700 transition-all duration-150 hover:-translate-y-0.5 hover:border-brand-accent hover:text-brand-accent hover:shadow-sm active:scale-[0.99]"
                    >
                      <span className="truncate">{r.title}</span>
                      <ChevronRight size={15} className="shrink-0" />
                    </button>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <ReportDetail id={open} onBack={() => setOpen(null)} />
      )}
    </VyaparShell>
  );
}

function ReportDetail({ id, onBack }: { id: ReportId; onBack: () => void }) {
  const meta = VYAPAR_REPORTS.find((r) => r.id === id) ?? { title: "Report", group: "", id };
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [parties, setParties] = useState<Party[]>([]);
  const [items, setItems] = useState<Item[]>([]);
  const [payments, setPayments] = useState<Payment[]>([]);
  const [bankTxns, setBankTxns] = useState<BankLedgerRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const bankAccountId = useVyaparBankId();

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [inv, pty, itm, pay] = await Promise.all([
        vyapar.getInvoices(undefined, bankAccountId),
        vyapar.getParties(undefined, bankAccountId),
        vyapar.getItems(bankAccountId),
        vyapar.getPayments(undefined, bankAccountId),
      ]);
      setInvoices(inv);
      setParties(pty);
      setItems(itm);
      setPayments(pay);

      // Bank Statement needs the cash/bank ledger, which lives outside the documents API.
      if (id === "bank-statement") {
        const accounts = await vyapar.getBankAccounts().catch(() => []);
        const perAccount = await Promise.all(
          accounts.map((a) =>
            vyapar
              .getAccountTxns(a.id)
              .then((ts) => ts.map((t) => ({ ...t, accountName: a.name })))
              .catch(() => [] as BankLedgerRow[])
          )
        );
        const cash = await vyapar
          .getCashTxns()
          .then((ts) => ts.map((t) => ({ ...t, accountName: "Cash In Hand" })))
          .catch(() => [] as BankLedgerRow[]);
        setBankTxns([...perAccount.flat(), ...cash]);
      }
    } finally {
      setLoading(false);
    }
  }, [bankAccountId, id]);

  useEffect(() => {
    load();
  }, [load]);

  const inRange = useCallback(
    (date: string | null) => {
      if (!date) return true;
      const d = date.slice(0, 10);
      if (from && d < from) return false;
      if (to && d > to) return false;
      return true;
    },
    [from, to]
  );

  const sales = useMemo(() => invoices.filter((i) => i.docType === "SALE" && inRange(i.invoiceDate)), [invoices, inRange]);
  const purchases = useMemo(() => invoices.filter((i) => i.docType === "PURCHASE" && inRange(i.invoiceDate)), [invoices, inRange]);
  const paysInRange = useMemo(() => payments.filter((p) => inRange(p.paymentDate)), [payments, inRange]);

  function download(rows: (string | number)[][], head: string[]) {
    const csv = [head, ...rows].map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(",")).join("\n");
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = `vyapar-${id}-report.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="animate-fade-in space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <button onClick={onBack} className="rounded-lg border border-gray-200 px-2.5 py-1.5 text-sm text-gray-500 transition-all duration-150 hover:bg-gray-50 active:scale-95">
            ←
          </button>
          <h2 className="text-base font-semibold text-gray-800">{meta.title}</h2>
        </div>
        <div className="flex flex-wrap items-end gap-3">
          <label className="block">
            <span className="mb-1 block text-[11px] font-medium tracking-wide text-gray-400 uppercase">From</span>
            <DatePicker value={from} onChange={setFrom} placeholder="From" className="min-w-[150px] py-1.5" />
          </label>
          <label className="block">
            <span className="mb-1 block text-[11px] font-medium tracking-wide text-gray-400 uppercase">To</span>
            <DatePicker value={to} onChange={setTo} min={from || undefined} placeholder="To" className="min-w-[150px] py-1.5" />
          </label>
        </div>
      </div>

      {loading ? (
        <div className="flex min-h-[240px] items-center justify-center gap-2 rounded-xl border border-dashed border-gray-300 bg-white text-sm text-gray-400">
          <Spinner size={16} className="text-brand-accent" /> Loading…
        </div>
      ) : (
        <ReportBody
          id={id}
          sales={sales}
          purchases={purchases}
          parties={parties}
          items={items}
          payments={paysInRange}
          allInvoices={invoices.filter((i) => inRange(i.invoiceDate))}
          bankTxns={bankTxns.filter((t) => inRange(t.date))}
          onDownload={download}
        />
      )}
    </div>
  );
}

function ReportBody({
  id,
  sales,
  purchases,
  parties,
  items,
  payments,
  allInvoices,
  bankTxns,
  onDownload,
}: {
  id: ReportId;
  sales: Invoice[];
  purchases: Invoice[];
  parties: Party[];
  items: Item[];
  payments: Payment[];
  allInvoices: Invoice[];
  bankTxns: BankLedgerRow[];
  onDownload: (rows: (string | number)[][], head: string[]) => void;
}) {
  const TOOLTIP = { borderRadius: 8, border: "1px solid #eee", fontSize: 12 } as const;
  const itemById = useMemo(() => new Map(items.map((i) => [i.id, i])), [items]);

  /** Flatten documents into priced lines joined to the catalogue — the basis of most reports. */
  const lineRows = useCallback(
    (invs: Invoice[]): LineRow[] =>
      invs.flatMap((inv) =>
        inv.lines.map((line) => {
          const item = line.itemId != null ? itemById.get(line.itemId) : undefined;
          const taxable = line.taxPercent ? line.amount / (1 + line.taxPercent / 100) : line.amount;
          return {
            inv,
            line,
            item,
            taxable,
            tax: line.amount - taxable,
            cost: (item?.purchasePrice ?? 0) * line.quantity,
          };
        })
      ),
    [itemById]
  );

  const saleLines = useMemo(() => lineRows(sales), [lineRows, sales]);
  const purchaseLines = useMemo(() => lineRows(purchases), [lineRows, purchases]);
  const expenses = useMemo(() => allInvoices.filter((i) => i.docType === "EXPENSE"), [allInvoices]);

  const sum = (ns: number[]) => ns.reduce((a, b) => a + b, 0);
  const taxableOf = (i: Invoice) => i.total - i.taxAmount;

  // ---------------------------------------------------------------- Transaction

  if (id === "sale" || id === "purchase") {
    const rows = id === "sale" ? sales : purchases;
    const total = sum(rows.map((i) => i.total));
    const paid = sum(rows.map((i) => i.paidAmount));
    const byParty = new Map<string, number>();
    rows.forEach((i) => byParty.set(i.partyName ?? "—", (byParty.get(i.partyName ?? "—") ?? 0) + i.total));
    const chart = [...byParty.entries()].map(([name, value]) => ({ name: name.slice(0, 14), value })).slice(0, 10);

    return (
      <>
        <SummaryStrip
          stats={[
            { label: "Documents", value: String(rows.length) },
            { label: "Total", value: inr(total) },
            { label: id === "sale" ? "Received" : "Paid", value: inr(paid) },
            { label: "Outstanding", value: inr(total - paid) },
          ]}
          onDownload={() =>
            onDownload(
              rows.map((i) => [i.invoiceDate ?? "", i.invoiceNo, i.partyName ?? "", i.total, i.paidAmount, i.balance, i.status]),
              ["Date", "Invoice", "Party", "Total", "Paid", "Balance", "Status"]
            )
          }
        />
        <ChartCard title={`${id === "sale" ? "Sales" : "Purchases"} by party`}>
          <BarChart data={chart} margin={{ top: 5, right: 8, left: -18, bottom: 0 }}>
            <CartesianGrid vertical={false} stroke="#f1f1ef" />
            <XAxis dataKey="name" tick={{ fontSize: 10, fill: "#94a3b8" }} axisLine={false} tickLine={false} />
            <YAxis tick={{ fontSize: 10, fill: "#94a3b8" }} axisLine={false} tickLine={false} />
            <Tooltip contentStyle={TOOLTIP} formatter={(v) => [inr(Number(v)), "Amount"]} />
            <Bar dataKey="value" fill={id === "sale" ? "#e11d48" : "#6366f1"} radius={[5, 5, 0, 0]} maxBarSize={40} />
          </BarChart>
        </ChartCard>
        <SimpleTable
          head={["Date", "Invoice", "Party", "Total", "Paid", "Balance", "Status"]}
          rows={rows.map((i) => [fmt(i.invoiceDate), i.invoiceNo, i.partyName ?? "—", inr(i.total), inr(i.paidAmount), inr(i.balance), i.status])}
          alignRight={[3, 4, 5]}
        />
      </>
    );
  }

  if (id === "daybook") {
    // Everything that happened, documents and payments together, newest first.
    type Entry = { date: string | null; type: string; name: string; ref: string; in: number; out: number };
    const entries: Entry[] = [
      ...allInvoices.map((i) => ({
        date: i.invoiceDate,
        type: vyapar.DOC_LABEL[i.docType],
        name: i.partyName ?? "—",
        ref: i.invoiceNo,
        in: i.docType === "SALE" || i.docType === "PURCHASE_RETURN" ? i.total : 0,
        out: i.docType === "PURCHASE" || i.docType === "SALE_RETURN" || i.docType === "EXPENSE" ? i.total : 0,
      })),
      ...payments.map((p) => ({
        date: p.paymentDate,
        type: p.direction === "IN" ? "Payment-In" : "Payment-Out",
        name: p.partyName ?? "—",
        ref: p.reference ?? "—",
        in: p.direction === "IN" ? p.amount : 0,
        out: p.direction === "OUT" ? p.amount : 0,
      })),
    ].sort((a, b) => (b.date ?? "").localeCompare(a.date ?? ""));
    const inSum = sum(entries.map((e) => e.in));
    const outSum = sum(entries.map((e) => e.out));
    return (
      <>
        <SummaryStrip
          stats={[
            { label: "Entries", value: String(entries.length) },
            { label: "Money in", value: inr(inSum) },
            { label: "Money out", value: inr(outSum) },
            { label: "Net", value: inr(inSum - outSum) },
          ]}
          onDownload={() => onDownload(entries.map((e) => [e.date ?? "", e.type, e.name, e.ref, e.in, e.out]), ["Date", "Type", "Name", "Reference", "In", "Out"])}
        />
        <SimpleTable
          head={["Date", "Type", "Name", "Reference", "Money In", "Money Out"]}
          rows={entries.map((e) => [fmt(e.date), e.type, e.name, e.ref, e.in ? inr(e.in) : "—", e.out ? inr(e.out) : "—"])}
          alignRight={[4, 5]}
        />
      </>
    );
  }

  if (id === "profit-loss") {
    const saleTaxable = sum(sales.map(taxableOf));
    const saleReturnTaxable = sum(allInvoices.filter((i) => i.docType === "SALE_RETURN").map(taxableOf));
    const purchaseTaxable = sum(purchases.map(taxableOf));
    const purchaseReturnTaxable = sum(allInvoices.filter((i) => i.docType === "PURCHASE_RETURN").map(taxableOf));
    const expenseTaxable = sum(expenses.map(taxableOf));
    const netSales = saleTaxable - saleReturnTaxable;
    const netPurchases = purchaseTaxable - purchaseReturnTaxable;
    const grossProfit = netSales - netPurchases;
    const netProfit = grossProfit - expenseTaxable;
    const rows: [string, number, boolean][] = [
      ["Sales", saleTaxable, false],
      ["Less: Sale Returns", -saleReturnTaxable, false],
      ["Net Sales", netSales, true],
      ["Purchases", -purchaseTaxable, false],
      ["Less: Purchase Returns", purchaseReturnTaxable, false],
      ["Net Purchases", -netPurchases, true],
      ["Gross Profit", grossProfit, true],
      ["Indirect Expenses", -expenseTaxable, false],
      ["Net Profit", netProfit, true],
    ];
    return (
      <>
        <SummaryStrip
          stats={[
            { label: "Net sales", value: inr(netSales) },
            { label: "Gross profit", value: inr(grossProfit) },
            { label: "Expenses", value: inr(expenseTaxable) },
            { label: "Net profit", value: inr(netProfit) },
          ]}
          onDownload={() => onDownload(rows.map(([l, v]) => [l, v]), ["Line", "Amount"])}
        />
        <p className="px-1 text-xs text-gray-400">All figures exclude GST, which is a pass-through and not income or expense.</p>
        <div className="overflow-hidden rounded-xl border border-gray-200 bg-white">
          <table className="w-full border-collapse text-sm">
            <tbody>
              {rows.map(([label, value, strong]) => (
                <tr key={label} className={`border-b border-gray-50 last:border-b-0 ${strong ? "bg-gray-50/60" : ""}`}>
                  <td className={`px-4 py-2.5 ${strong ? "font-semibold text-gray-800" : "text-gray-600"}`}>{label}</td>
                  <td className={`px-4 py-2.5 text-right ${strong ? "font-semibold" : ""} ${value < 0 ? "text-rose-600" : "text-gray-800"}`}>
                    {inr(value)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </>
    );
  }

  if (id === "bill-wise-profit") {
    const rows = sales.map((inv) => {
      const ls = saleLines.filter((l) => l.inv.id === inv.id);
      const revenue = sum(ls.map((l) => l.taxable));
      const cost = sum(ls.map((l) => l.cost));
      return { inv, revenue, cost, profit: revenue - cost };
    });
    const totalProfit = sum(rows.map((r) => r.profit));
    const known = rows.filter((r) => r.cost > 0);
    return (
      <>
        <SummaryStrip
          stats={[
            { label: "Invoices", value: String(rows.length) },
            { label: "Revenue (excl. tax)", value: inr(sum(rows.map((r) => r.revenue))) },
            { label: "Cost of goods", value: inr(sum(rows.map((r) => r.cost))) },
            { label: "Profit", value: inr(totalProfit) },
          ]}
          onDownload={() => onDownload(rows.map((r) => [r.inv.invoiceDate ?? "", r.inv.invoiceNo, r.inv.partyName ?? "", r.revenue, r.cost, r.profit]), ["Date", "Invoice", "Party", "Revenue", "Cost", "Profit"])}
        />
        {known.length < rows.length && (
          <p className="px-1 text-xs text-amber-600">
            Cost is taken from each item&apos;s purchase price. {rows.length - known.length} invoice(s) have no costed items, so their profit equals revenue.
          </p>
        )}
        <SimpleTable
          head={["Date", "Invoice", "Party", "Revenue", "Cost", "Profit"]}
          rows={rows.map((r) => [fmt(r.inv.invoiceDate), r.inv.invoiceNo, r.inv.partyName ?? "—", inr(r.revenue), inr(r.cost), inr(r.profit)])}
          alignRight={[3, 4, 5]}
        />
      </>
    );
  }

  if (id === "cash-flow") {
    const byDate = new Map<string, { in: number; out: number }>();
    const bump = (d: string | null, dir: "in" | "out", amt: number) => {
      const key = (d ?? "").slice(0, 10) || "—";
      const cur = byDate.get(key) ?? { in: 0, out: 0 };
      cur[dir] += amt;
      byDate.set(key, cur);
    };
    payments.forEach((p) => bump(p.paymentDate, p.direction === "IN" ? "in" : "out", p.amount));
    const rows = [...byDate.entries()].sort((a, b) => b[0].localeCompare(a[0]));
    const inSum = sum(rows.map(([, v]) => v.in));
    const outSum = sum(rows.map(([, v]) => v.out));
    const chart = [...rows].reverse().map(([d, v]) => ({ name: d.slice(8, 10) + "/" + d.slice(5, 7), In: v.in, Out: v.out }));
    return (
      <>
        <SummaryStrip
          stats={[
            { label: "Money in", value: inr(inSum) },
            { label: "Money out", value: inr(outSum) },
            { label: "Net cash flow", value: inr(inSum - outSum) },
          ]}
          onDownload={() => onDownload(rows.map(([d, v]) => [d, v.in, v.out, v.in - v.out]), ["Date", "In", "Out", "Net"])}
        />
        {chart.length > 0 && (
          <ChartCard title="Cash in vs out">
            <BarChart data={chart} margin={{ top: 5, right: 8, left: -18, bottom: 0 }}>
              <CartesianGrid vertical={false} stroke="#f1f1ef" />
              <XAxis dataKey="name" tick={{ fontSize: 10, fill: "#94a3b8" }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fontSize: 10, fill: "#94a3b8" }} axisLine={false} tickLine={false} />
              <Tooltip contentStyle={TOOLTIP} formatter={(v) => [inr(Number(v)), ""]} />
              <Legend iconType="circle" wrapperStyle={{ fontSize: 11 }} />
              <Bar dataKey="In" fill="#0ca30c" radius={[5, 5, 0, 0]} maxBarSize={26} />
              <Bar dataKey="Out" fill="#e11d48" radius={[5, 5, 0, 0]} maxBarSize={26} />
            </BarChart>
          </ChartCard>
        )}
        <SimpleTable
          head={["Date", "Money In", "Money Out", "Net"]}
          rows={rows.map(([d, v]) => [fmt(d), inr(v.in), inr(v.out), inr(v.in - v.out)])}
          alignRight={[1, 2, 3]}
        />
      </>
    );
  }

  // ---------------------------------------------------------------- Party

  if (id === "party" || id === "all-parties") {
    const withBalance = parties.filter((p) => p.balance !== 0);
    const receivable = sum(withBalance.filter((p) => p.balance > 0).map((p) => p.balance));
    const payable = sum(withBalance.filter((p) => p.balance < 0).map((p) => Math.abs(p.balance)));
    const rows = id === "party" ? withBalance : parties;
    return (
      <>
        <SummaryStrip
          stats={[
            { label: id === "party" ? "Parties with balance" : "Parties", value: String(rows.length) },
            { label: "To receive", value: inr(receivable) },
            { label: "To pay", value: inr(payable) },
          ]}
          onDownload={() => onDownload(rows.map((p) => [p.name, p.partyType, p.phone ?? "", p.gstin ?? "", p.city ?? "", p.balance]), ["Party", "Type", "Phone", "GSTIN", "City", "Balance"])}
        />
        <SimpleTable
          head={["Party", "Type", "Phone", "GSTIN", "City", "Balance"]}
          rows={rows.map((p) => [
            p.name,
            p.partyType === "CUSTOMER" ? "Customer" : "Supplier",
            p.phone ?? "—",
            p.gstin ?? "—",
            p.city ?? "—",
            p.balance === 0 ? "—" : `${inr(Math.abs(p.balance))} ${p.balance > 0 ? "to receive" : "to pay"}`,
          ])}
          alignRight={[5]}
        />
      </>
    );
  }

  if (id === "sale-purchase-by-party" || id === "sale-purchase-by-group") {
    const byGroup = id === "sale-purchase-by-group";
    const key = (name: string | null) => {
      if (!byGroup) return name ?? "—";
      return parties.find((p) => p.name === name)?.partyGroup?.trim() || "Ungrouped";
    };
    const map = new Map<string, { sale: number; purchase: number }>();
    sales.forEach((i) => {
      const k = key(i.partyName);
      const cur = map.get(k) ?? { sale: 0, purchase: 0 };
      cur.sale += i.total;
      map.set(k, cur);
    });
    purchases.forEach((i) => {
      const k = key(i.partyName);
      const cur = map.get(k) ?? { sale: 0, purchase: 0 };
      cur.purchase += i.total;
      map.set(k, cur);
    });
    const rows = [...map.entries()].sort((a, b) => b[1].sale + b[1].purchase - (a[1].sale + a[1].purchase));
    return (
      <>
        <SummaryStrip
          stats={[
            { label: byGroup ? "Groups" : "Parties", value: String(rows.length) },
            { label: "Total sale", value: inr(sum(rows.map(([, v]) => v.sale))) },
            { label: "Total purchase", value: inr(sum(rows.map(([, v]) => v.purchase))) },
          ]}
          onDownload={() => onDownload(rows.map(([k, v]) => [k, v.sale, v.purchase]), [byGroup ? "Group" : "Party", "Sale", "Purchase"])}
        />
        <SimpleTable
          head={[byGroup ? "Party Group" : "Party", "Sale", "Purchase"]}
          rows={rows.map(([k, v]) => [k, inr(v.sale), inr(v.purchase)])}
          alignRight={[1, 2]}
        />
      </>
    );
  }

  if (id === "party-profit") {
    const map = new Map<string, { revenue: number; cost: number }>();
    saleLines.forEach((l) => {
      const k = l.inv.partyName ?? "—";
      const cur = map.get(k) ?? { revenue: 0, cost: 0 };
      cur.revenue += l.taxable;
      cur.cost += l.cost;
      map.set(k, cur);
    });
    const rows = [...map.entries()]
      .map(([name, v]) => ({ name, ...v, profit: v.revenue - v.cost }))
      .sort((a, b) => b.profit - a.profit);
    return (
      <>
        <SummaryStrip
          stats={[
            { label: "Parties", value: String(rows.length) },
            { label: "Revenue", value: inr(sum(rows.map((r) => r.revenue))) },
            { label: "Profit", value: inr(sum(rows.map((r) => r.profit))) },
          ]}
          onDownload={() => onDownload(rows.map((r) => [r.name, r.revenue, r.cost, r.profit]), ["Party", "Revenue", "Cost", "Profit"])}
        />
        <SimpleTable
          head={["Party", "Revenue (excl. tax)", "Cost", "Profit"]}
          rows={rows.map((r) => [r.name, inr(r.revenue), inr(r.cost), inr(r.profit)])}
          alignRight={[1, 2, 3]}
        />
      </>
    );
  }

  if (id === "party-by-item" || id === "item-by-party") {
    // Same join, pivoted the other way round.
    const byParty = id === "party-by-item";
    const map = new Map<string, { qty: number; value: number }>();
    [...saleLines, ...purchaseLines].forEach((l) => {
      const k = byParty
        ? `${l.inv.partyName ?? "—"}||${l.line.itemName}`
        : `${l.line.itemName}||${l.inv.partyName ?? "—"}`;
      const cur = map.get(k) ?? { qty: 0, value: 0 };
      cur.qty += l.line.quantity;
      cur.value += l.line.amount;
      map.set(k, cur);
    });
    const rows = [...map.entries()]
      .map(([k, v]) => {
        const [a, b] = k.split("||");
        return { a, b, ...v };
      })
      .sort((x, y) => y.value - x.value);
    const headA = byParty ? "Party" : "Item";
    const headB = byParty ? "Item" : "Party";
    return (
      <>
        <SummaryStrip
          stats={[
            { label: "Rows", value: String(rows.length) },
            { label: "Quantity", value: String(Math.round(sum(rows.map((r) => r.qty)) * 100) / 100) },
            { label: "Value", value: inr(sum(rows.map((r) => r.value))) },
          ]}
          onDownload={() => onDownload(rows.map((r) => [r.a, r.b, r.qty, r.value]), [headA, headB, "Qty", "Value"])}
        />
        <SimpleTable
          head={[headA, headB, "Qty", "Value"]}
          rows={rows.map((r) => [r.a, r.b, String(r.qty), inr(r.value)])}
          alignRight={[2, 3]}
        />
      </>
    );
  }

  // ---------------------------------------------------------------- GST

  if (id === "gstr1" || id === "gstr2") {
    const outward = id === "gstr1";
    const docs = outward ? sales : purchases;
    const rows = docs.map((i) => {
      const party = parties.find((p) => p.name === i.partyName);
      return { inv: i, gstin: party?.gstin ?? "", state: i.stateOfSupply ?? party?.state ?? "" };
    });
    const taxable = sum(docs.map(taxableOf));
    const tax = sum(docs.map((i) => i.taxAmount));
    const b2b = rows.filter((r) => r.gstin).length;
    return (
      <>
        <SummaryStrip
          stats={[
            { label: "Documents", value: String(rows.length) },
            { label: "B2B (with GSTIN)", value: String(b2b) },
            { label: "Taxable value", value: inr(taxable) },
            { label: "Total tax", value: inr(tax) },
          ]}
          onDownload={() => onDownload(rows.map((r) => [r.gstin, r.inv.partyName ?? "", r.inv.invoiceNo, r.inv.invoiceDate ?? "", r.inv.total, r.state, taxableOf(r.inv), r.inv.taxAmount]), ["GSTIN", "Party", "Invoice", "Date", "Invoice Value", "Place of Supply", "Taxable Value", "Tax"])}
        />
        <SimpleTable
          head={["GSTIN", "Party", "Invoice", "Date", "Place of Supply", "Taxable Value", "Tax", "Invoice Value"]}
          rows={rows.map((r) => [
            r.gstin || "—",
            r.inv.partyName ?? "—",
            r.inv.invoiceNo,
            fmt(r.inv.invoiceDate),
            r.state || "—",
            inr(taxableOf(r.inv)),
            inr(r.inv.taxAmount),
            inr(r.inv.total),
          ])}
          alignRight={[5, 6, 7]}
        />
      </>
    );
  }

  if (id === "gstr3b") {
    const outTaxable = sum(sales.map(taxableOf));
    const outTax = sum(sales.map((i) => i.taxAmount));
    const inTaxable = sum(purchases.map(taxableOf));
    const inTax = sum(purchases.map((i) => i.taxAmount));
    const rows: [string, string, number, number][] = [
      ["3.1(a)", "Outward taxable supplies", outTaxable, outTax],
      ["3.1(d)", "Inward supplies (reverse charge)", 0, 0],
      ["4(A)(5)", "ITC — All other ITC", inTaxable, inTax],
    ];
    return (
      <>
        <SummaryStrip
          stats={[
            { label: "Output tax", value: inr(outTax) },
            { label: "Input tax credit", value: inr(inTax) },
            { label: "Net payable", value: inr(Math.max(0, outTax - inTax)) },
          ]}
          onDownload={() => onDownload(rows.map((r) => [r[0], r[1], r[2], r[3]]), ["Section", "Nature of supply", "Taxable value", "Tax"])}
        />
        <p className="px-1 text-xs text-gray-400">
          Summary computed from posted sales and purchases. Reverse-charge supplies are shown as nil — they aren&apos;t tracked separately in the books.
        </p>
        <SimpleTable
          head={["Section", "Nature of supply", "Taxable value", "Tax"]}
          rows={rows.map((r) => [r[0], r[1], inr(r[2]), inr(r[3])])}
          alignRight={[2, 3]}
        />
      </>
    );
  }

  if (id === "hsn-summary" || id === "sac-report") {
    // HSN covers goods, SAC covers services — same grouping, different side of the catalogue.
    const wantService = id === "sac-report";
    const relevant = saleLines.filter((l) => (l.item ? l.item.isService === wantService : !wantService));
    const map = new Map<string, { desc: string; qty: number; taxable: number; tax: number }>();
    relevant.forEach((l) => {
      const code = l.item?.hsn?.trim() || "Unspecified";
      const cur = map.get(code) ?? { desc: l.line.itemName, qty: 0, taxable: 0, tax: 0 };
      cur.qty += l.line.quantity;
      cur.taxable += l.taxable;
      cur.tax += l.tax;
      map.set(code, cur);
    });
    const rows = [...map.entries()].sort((a, b) => b[1].taxable - a[1].taxable);
    return (
      <>
        <SummaryStrip
          stats={[
            { label: wantService ? "SAC codes" : "HSN codes", value: String(rows.length) },
            { label: "Taxable value", value: inr(sum(rows.map(([, v]) => v.taxable))) },
            { label: "Tax", value: inr(sum(rows.map(([, v]) => v.tax))) },
          ]}
          onDownload={() => onDownload(rows.map(([c, v]) => [c, v.desc, v.qty, v.taxable, v.tax]), [wantService ? "SAC" : "HSN", "Description", "Qty", "Taxable", "Tax"])}
        />
        <SimpleTable
          head={[wantService ? "SAC" : "HSN", "Description", "Qty", "Taxable Value", "Tax"]}
          rows={rows.map(([c, v]) => [c, v.desc, String(v.qty), inr(v.taxable), inr(v.tax)])}
          alignRight={[2, 3, 4]}
        />
      </>
    );
  }

  // ---------------------------------------------------------------- Item / Stock

  if (id === "stock" || id === "stock-detail" || id === "item-detail" || id === "low-stock") {
    const scoped = id === "low-stock" ? items.filter((i) => i.lowStock) : items;
    const value = sum(scoped.map((i) => i.stockValue));

    if (id === "item-detail") {
      return (
        <>
          <SummaryStrip
            stats={[
              { label: "Items", value: String(scoped.length) },
              { label: "Products", value: String(scoped.filter((i) => !i.isService).length) },
              { label: "Services", value: String(scoped.filter((i) => i.isService).length) },
            ]}
            onDownload={() => onDownload(scoped.map((i) => [i.name, i.itemCode ?? "", i.category ?? "", i.hsn ?? "", i.unit, i.salePrice, i.purchasePrice, i.taxPercent]), ["Item", "Code", "Category", "HSN/SAC", "Unit", "Sale Price", "Purchase Price", "Tax %"])}
          />
          <SimpleTable
            head={["Item", "Code", "Category", "HSN/SAC", "Unit", "Type", "Sale Price", "Purchase Price", "Tax %"]}
            rows={scoped.map((i) => [i.name, i.itemCode ?? "—", i.category ?? "—", i.hsn ?? "—", i.unit, i.isService ? "Service" : "Product", inr(i.salePrice), inr(i.purchasePrice), `${i.taxPercent}%`])}
            alignRight={[6, 7, 8]}
          />
        </>
      );
    }

    if (id === "stock-detail") {
      // Opening = current stock unwound by the movements in range.
      const rows = scoped
        .filter((i) => !i.isService)
        .map((i) => {
          const sold = sum(saleLines.filter((l) => l.item?.id === i.id).map((l) => l.line.quantity));
          const bought = sum(purchaseLines.filter((l) => l.item?.id === i.id).map((l) => l.line.quantity));
          return { i, sold, bought, opening: i.stockQty + sold - bought };
        });
      return (
        <>
          <SummaryStrip
            stats={[
              { label: "Products", value: String(rows.length) },
              { label: "Purchased", value: String(sum(rows.map((r) => r.bought))) },
              { label: "Sold", value: String(sum(rows.map((r) => r.sold))) },
              { label: "Stock value", value: inr(sum(rows.map((r) => r.i.stockValue))) },
            ]}
            onDownload={() => onDownload(rows.map((r) => [r.i.name, r.opening, r.bought, r.sold, r.i.stockQty, r.i.stockValue]), ["Item", "Opening", "Purchased", "Sold", "Closing", "Value"])}
          />
          <SimpleTable
            head={["Item", "Unit", "Opening", "Purchased", "Sold", "Closing", "Stock Value"]}
            rows={rows.map((r) => [r.i.name, r.i.unit, String(r.opening), String(r.bought), String(r.sold), String(r.i.stockQty), inr(r.i.stockValue)])}
            alignRight={[2, 3, 4, 5, 6]}
          />
        </>
      );
    }

    return (
      <>
        <SummaryStrip
          stats={[
            { label: "Items", value: String(scoped.length) },
            { label: "Stock value", value: inr(value) },
            { label: "Low on stock", value: String(items.filter((i) => i.lowStock).length) },
          ]}
          onDownload={() => onDownload(scoped.map((i) => [i.name, i.unit, i.stockQty, i.lowStockAlert, i.purchasePrice, i.stockValue]), ["Item", "Unit", "Qty", "Reorder At", "Rate", "Value"])}
        />
        {id === "stock" && (
          <ChartCard title="Stock value by item">
            <BarChart data={scoped.filter((i) => !i.isService).slice(0, 10).map((i) => ({ name: i.name.slice(0, 14), value: i.stockValue }))} margin={{ top: 5, right: 8, left: -18, bottom: 0 }}>
              <CartesianGrid vertical={false} stroke="#f1f1ef" />
              <XAxis dataKey="name" tick={{ fontSize: 10, fill: "#94a3b8" }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fontSize: 10, fill: "#94a3b8" }} axisLine={false} tickLine={false} />
              <Tooltip contentStyle={TOOLTIP} formatter={(v) => [inr(Number(v)), "Value"]} />
              <Bar dataKey="value" fill="#f59e0b" radius={[5, 5, 0, 0]} maxBarSize={40} />
            </BarChart>
          </ChartCard>
        )}
        <SimpleTable
          head={["Item", "Unit", "In Stock", "Reorder At", "Purchase Rate", "Stock Value"]}
          rows={scoped.map((i) => [i.name, i.unit, i.isService ? "—" : String(i.stockQty), i.lowStockAlert ? String(i.lowStockAlert) : "—", inr(i.purchasePrice), inr(i.stockValue)])}
          alignRight={[2, 3, 4, 5]}
        />
      </>
    );
  }

  if (id === "item-profit") {
    const map = new Map<string, { revenue: number; cost: number; qty: number }>();
    saleLines.forEach((l) => {
      const k = l.line.itemName;
      const cur = map.get(k) ?? { revenue: 0, cost: 0, qty: 0 };
      cur.revenue += l.taxable;
      cur.cost += l.cost;
      cur.qty += l.line.quantity;
      map.set(k, cur);
    });
    const rows = [...map.entries()].map(([name, v]) => ({ name, ...v, profit: v.revenue - v.cost })).sort((a, b) => b.profit - a.profit);
    return (
      <>
        <SummaryStrip
          stats={[
            { label: "Items sold", value: String(rows.length) },
            { label: "Revenue", value: inr(sum(rows.map((r) => r.revenue))) },
            { label: "Profit", value: inr(sum(rows.map((r) => r.profit))) },
          ]}
          onDownload={() => onDownload(rows.map((r) => [r.name, r.qty, r.revenue, r.cost, r.profit]), ["Item", "Qty", "Revenue", "Cost", "Profit"])}
        />
        <SimpleTable
          head={["Item", "Qty Sold", "Revenue (excl. tax)", "Cost", "Profit"]}
          rows={rows.map((r) => [r.name, String(r.qty), inr(r.revenue), inr(r.cost), inr(r.profit)])}
          alignRight={[1, 2, 3, 4]}
        />
      </>
    );
  }

  if (id === "item-category-profit" || id === "sale-purchase-by-category" || id === "stock-by-category") {
    const catOf = (i?: Item) => i?.category?.trim() || "Uncategorised";

    if (id === "stock-by-category") {
      const map = new Map<string, { count: number; qty: number; value: number }>();
      items.filter((i) => !i.isService).forEach((i) => {
        const k = catOf(i);
        const cur = map.get(k) ?? { count: 0, qty: 0, value: 0 };
        cur.count += 1;
        cur.qty += i.stockQty;
        cur.value += i.stockValue;
        map.set(k, cur);
      });
      const rows = [...map.entries()].sort((a, b) => b[1].value - a[1].value);
      return (
        <>
          <SummaryStrip
            stats={[
              { label: "Categories", value: String(rows.length) },
              { label: "Stock value", value: inr(sum(rows.map(([, v]) => v.value))) },
            ]}
            onDownload={() => onDownload(rows.map(([k, v]) => [k, v.count, v.qty, v.value]), ["Category", "Items", "Qty", "Value"])}
          />
          <SimpleTable
            head={["Category", "Items", "Total Qty", "Stock Value"]}
            rows={rows.map(([k, v]) => [k, String(v.count), String(v.qty), inr(v.value)])}
            alignRight={[1, 2, 3]}
          />
        </>
      );
    }

    if (id === "sale-purchase-by-category") {
      const map = new Map<string, { sale: number; purchase: number }>();
      saleLines.forEach((l) => {
        const k = catOf(l.item);
        const cur = map.get(k) ?? { sale: 0, purchase: 0 };
        cur.sale += l.line.amount;
        map.set(k, cur);
      });
      purchaseLines.forEach((l) => {
        const k = catOf(l.item);
        const cur = map.get(k) ?? { sale: 0, purchase: 0 };
        cur.purchase += l.line.amount;
        map.set(k, cur);
      });
      const rows = [...map.entries()].sort((a, b) => b[1].sale - a[1].sale);
      return (
        <>
          <SummaryStrip
            stats={[
              { label: "Categories", value: String(rows.length) },
              { label: "Sale", value: inr(sum(rows.map(([, v]) => v.sale))) },
              { label: "Purchase", value: inr(sum(rows.map(([, v]) => v.purchase))) },
            ]}
            onDownload={() => onDownload(rows.map(([k, v]) => [k, v.sale, v.purchase]), ["Category", "Sale", "Purchase"])}
          />
          <SimpleTable
            head={["Item Category", "Sale", "Purchase"]}
            rows={rows.map(([k, v]) => [k, inr(v.sale), inr(v.purchase)])}
            alignRight={[1, 2]}
          />
        </>
      );
    }

    const map = new Map<string, { revenue: number; cost: number }>();
    saleLines.forEach((l) => {
      const k = catOf(l.item);
      const cur = map.get(k) ?? { revenue: 0, cost: 0 };
      cur.revenue += l.taxable;
      cur.cost += l.cost;
      map.set(k, cur);
    });
    const rows = [...map.entries()].map(([name, v]) => ({ name, ...v, profit: v.revenue - v.cost })).sort((a, b) => b.profit - a.profit);
    return (
      <>
        <SummaryStrip
          stats={[
            { label: "Categories", value: String(rows.length) },
            { label: "Revenue", value: inr(sum(rows.map((r) => r.revenue))) },
            { label: "Profit", value: inr(sum(rows.map((r) => r.profit))) },
          ]}
          onDownload={() => onDownload(rows.map((r) => [r.name, r.revenue, r.cost, r.profit]), ["Category", "Revenue", "Cost", "Profit"])}
        />
        <SimpleTable
          head={["Item Category", "Revenue (excl. tax)", "Cost", "Profit"]}
          rows={rows.map((r) => [r.name, inr(r.revenue), inr(r.cost), inr(r.profit)])}
          alignRight={[1, 2, 3]}
        />
      </>
    );
  }

  if (id === "item-discount") {
    const map = new Map<string, { qty: number; gross: number; discount: number }>();
    saleLines.forEach((l) => {
      const k = l.line.itemName;
      const cur = map.get(k) ?? { qty: 0, gross: 0, discount: 0 };
      cur.qty += l.line.quantity;
      cur.gross += l.line.quantity * l.line.rate;
      cur.discount += l.line.discountAmount;
      map.set(k, cur);
    });
    const rows = [...map.entries()].sort((a, b) => b[1].discount - a[1].discount);
    return (
      <>
        <SummaryStrip
          stats={[
            { label: "Items", value: String(rows.length) },
            { label: "Gross value", value: inr(sum(rows.map(([, v]) => v.gross))) },
            { label: "Discount given", value: inr(sum(rows.map(([, v]) => v.discount))) },
          ]}
          onDownload={() => onDownload(rows.map(([k, v]) => [k, v.qty, v.gross, v.discount]), ["Item", "Qty", "Gross", "Discount"])}
        />
        <SimpleTable
          head={["Item", "Qty Sold", "Gross Value", "Discount", "Discount %"]}
          rows={rows.map(([k, v]) => [k, String(v.qty), inr(v.gross), inr(v.discount), v.gross ? `${((v.discount / v.gross) * 100).toFixed(1)}%` : "—"])}
          alignRight={[1, 2, 3, 4]}
        />
      </>
    );
  }

  // ---------------------------------------------------------------- Business status

  if (id === "bank-statement") {
    const rows = [...bankTxns].sort((a, b) => (b.date ?? "").localeCompare(a.date ?? ""));
    const inSum = sum(rows.filter((t) => t.direction === "in").map((t) => t.amount));
    const outSum = sum(rows.filter((t) => t.direction === "out").map((t) => t.amount));
    return (
      <>
        <SummaryStrip
          stats={[
            { label: "Entries", value: String(rows.length) },
            { label: "Deposits", value: inr(inSum) },
            { label: "Withdrawals", value: inr(outSum) },
            { label: "Net", value: inr(inSum - outSum) },
          ]}
          onDownload={() => onDownload(rows.map((t) => [t.date ?? "", t.accountName, t.type, t.name ?? "", t.direction, t.amount]), ["Date", "Account", "Type", "Description", "Direction", "Amount"])}
        />
        <SimpleTable
          head={["Date", "Account", "Type", "Description", "Deposit", "Withdrawal"]}
          rows={rows.map((t) => [
            fmt(t.date),
            t.accountName,
            t.type,
            t.name ?? "—",
            t.direction === "in" ? inr(t.amount) : "—",
            t.direction === "out" ? inr(t.amount) : "—",
          ])}
          alignRight={[4, 5]}
        />
      </>
    );
  }

  if (id === "discount-report") {
    const rows = allInvoices.filter((i) => i.discount > 0);
    return (
      <>
        <SummaryStrip
          stats={[
            { label: "Documents with discount", value: String(rows.length) },
            { label: "Total discount", value: inr(sum(rows.map((i) => i.discount))) },
          ]}
          onDownload={() => onDownload(rows.map((i) => [i.invoiceDate ?? "", vyapar.DOC_LABEL[i.docType], i.invoiceNo, i.partyName ?? "", i.discount, i.total]), ["Date", "Type", "Invoice", "Party", "Discount", "Total"])}
        />
        <SimpleTable
          head={["Date", "Type", "Invoice", "Party", "Discount", "Total"]}
          rows={rows.map((i) => [fmt(i.invoiceDate), vyapar.DOC_LABEL[i.docType], i.invoiceNo, i.partyName ?? "—", inr(i.discount), inr(i.total)])}
          alignRight={[4, 5]}
        />
      </>
    );
  }

  // ---------------------------------------------------------------- Taxes

  if (id === "gst-report" || id === "gst-rate") {
    if (id === "gst-rate") {
      const map = new Map<number, { taxable: number; tax: number; count: number }>();
      [...saleLines].forEach((l) => {
        const rate = l.line.taxPercent;
        const cur = map.get(rate) ?? { taxable: 0, tax: 0, count: 0 };
        cur.taxable += l.taxable;
        cur.tax += l.tax;
        cur.count += 1;
        map.set(rate, cur);
      });
      const rows = [...map.entries()].sort((a, b) => a[0] - b[0]);
      return (
        <>
          <SummaryStrip
            stats={[
              { label: "Rate slabs", value: String(rows.length) },
              { label: "Taxable value", value: inr(sum(rows.map(([, v]) => v.taxable))) },
              { label: "Tax", value: inr(sum(rows.map(([, v]) => v.tax))) },
            ]}
            onDownload={() => onDownload(rows.map(([r, v]) => [`${r}%`, v.count, v.taxable, v.tax]), ["GST Rate", "Lines", "Taxable", "Tax"])}
          />
          <SimpleTable
            head={["GST Rate", "Lines", "Taxable Value", "Tax"]}
            rows={rows.map(([r, v]) => [r ? `${r}%` : "Exempt / 0%", String(v.count), inr(v.taxable), inr(v.tax)])}
            alignRight={[1, 2, 3]}
          />
        </>
      );
    }

    const outTax = sum(sales.map((i) => i.taxAmount));
    const inTax = sum(purchases.map((i) => i.taxAmount));
    const rows: [string, number, number][] = [
      ["Sales (output tax)", sum(sales.map(taxableOf)), outTax],
      ["Sale returns", -sum(allInvoices.filter((i) => i.docType === "SALE_RETURN").map(taxableOf)), -sum(allInvoices.filter((i) => i.docType === "SALE_RETURN").map((i) => i.taxAmount))],
      ["Purchases (input tax)", sum(purchases.map(taxableOf)), inTax],
      ["Purchase returns", -sum(allInvoices.filter((i) => i.docType === "PURCHASE_RETURN").map(taxableOf)), -sum(allInvoices.filter((i) => i.docType === "PURCHASE_RETURN").map((i) => i.taxAmount))],
    ];
    return (
      <>
        <SummaryStrip
          stats={[
            { label: "Output tax (collected)", value: inr(outTax) },
            { label: "Input tax (paid)", value: inr(inTax) },
            { label: "Net GST payable", value: inr(Math.max(0, outTax - inTax)) },
          ]}
          onDownload={() => onDownload(rows.map((r) => [r[0], r[1], r[2]]), ["Nature", "Taxable value", "Tax"])}
        />
        <SimpleTable
          head={["Nature", "Taxable Value", "Tax"]}
          rows={rows.map((r) => [r[0], inr(r[1]), inr(r[2])])}
          alignRight={[1, 2]}
        />
      </>
    );
  }

  // ---------------------------------------------------------------- All transactions (default)

  return (
    <>
      <SummaryStrip
        stats={[
          { label: "Documents", value: String(allInvoices.length) },
          { label: "Sales", value: inr(sum(sales.map((i) => i.total))) },
          { label: "Purchases", value: inr(sum(purchases.map((i) => i.total))) },
        ]}
        onDownload={() => onDownload(allInvoices.map((i) => [i.invoiceDate ?? "", i.docType, i.invoiceNo, i.partyName ?? "", i.total, i.status]), ["Date", "Type", "Invoice", "Party", "Total", "Status"])}
      />
      <SimpleTable
        head={["Date", "Type", "Invoice", "Party", "Total", "Status"]}
        rows={allInvoices.map((i) => [fmt(i.invoiceDate), vyapar.DOC_LABEL[i.docType], i.invoiceNo, i.partyName ?? "—", inr(i.total), i.status])}
        alignRight={[4]}
      />
    </>
  );
}

function SummaryStrip({ stats, onDownload }: { stats: { label: string; value: string }[]; onDownload: () => void }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-4 rounded-xl border border-gray-200 bg-white p-4">
      <div className="flex flex-wrap gap-6">
        {stats.map((s) => (
          <div key={s.label}>
            <div className="text-xs text-gray-500">{s.label}</div>
            <div className="mt-0.5 text-lg font-semibold text-gray-800">{s.value}</div>
          </div>
        ))}
      </div>
      <button
        onClick={onDownload}
        className="flex items-center gap-1.5 rounded-lg bg-brand-accent px-3 py-2 text-sm font-medium text-white transition-all duration-150 hover:opacity-90 active:scale-95"
      >
        <Download size={14} /> Download
      </button>
    </div>
  );
}

function ChartCard({ title, children }: { title: string; children: React.ReactElement }) {
  return (
    <div className="rounded-xl border border-gray-200 bg-white p-4">
      <h3 className="mb-3 text-sm font-semibold text-gray-800">{title}</h3>
      <div className="h-56">
        <ResponsiveContainer width="100%" height="100%">
          {children}
        </ResponsiveContainer>
      </div>
    </div>
  );
}

function SimpleTable({ head, rows, alignRight = [] }: { head: string[]; rows: (string | number)[][]; alignRight?: number[] }) {
  if (rows.length === 0) return <VyaparEmpty icon={FileText} title="Nothing in this range" hint="Adjust the date filter to see more." />;
  return (
    <div className="overflow-x-auto rounded-xl border border-gray-200 bg-white">
      <table className="w-full min-w-[720px] border-collapse text-sm">
        <thead>
          <tr className="border-b border-gray-100 bg-gray-50 text-left text-gray-500">
            {head.map((h, i) => (
              <th key={h} className={`px-4 py-2 font-medium ${alignRight.includes(i) ? "text-right" : ""}`}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r, ri) => (
            <tr key={ri} className="border-b border-gray-50 last:border-b-0 even:bg-gray-50/40">
              {r.map((c, ci) => (
                <td key={ci} className={`px-4 py-2.5 ${alignRight.includes(ci) ? "text-right font-medium text-gray-800" : "text-gray-600"}`}>
                  {c}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function fmt(iso: string | null): string {
  if (!iso || iso.length < 10) return "—";
  const [y, m, d] = iso.slice(0, 10).split("-");
  return `${d}/${m}/${y}`;
}
