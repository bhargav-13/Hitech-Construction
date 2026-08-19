"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { VyaparEmpty } from "@/components/vyapar/VyaparShell";
import { Drawer, DrawerField } from "@/components/Drawer";
import { Select } from "@/components/Select";
import { Spinner } from "@/components/Spinner";
import { DatePicker } from "@/components/DatePicker";
import { InvoiceBuilder } from "@/components/vyapar/InvoiceBuilder";
import { UploadBillDialog, type BillAttachment } from "@/components/vyapar/UploadBillDialog";
import { ImportDialog } from "@/components/vyapar/ImportDialog";
import { documentImportConfig } from "@/lib/vyaparImportConfigs";
import { FilterTh, useColumnFilters } from "@/components/vyapar/ColumnFilter";
import { DateRangeFilter, defaultRange, inRange, type DateRange } from "@/components/vyapar/DateRangeFilter";
import { InvoiceHistoryDialog, TxnRowActions } from "@/components/vyapar/TxnRowActions";
import { useTableSort } from "@/lib/useTableSort";
import { inr, bookDate } from "@/lib/format";
import { useVyaparProjectId } from "@/lib/projectScope";
import { takePoDraft, type PoDraft } from "@/lib/poHandoff";
import { downloadInvoicePdf, downloadPdf, printRows } from "@/lib/vyaparExport";
import * as vyapar from "@/lib/vyaparApi";
import type { DocType, Invoice, Item, Party } from "@/lib/vyaparApi";
import { Download, FileText, Plus, Search, Upload } from "lucide-react";

const PAYMENT_TYPES = ["Cash", "Credit", "Bank", "UPI", "Cheque"];

/**
 * The Sale/Purchase workspace — a document list plus the invoice builder, driven entirely by
 * `docType`. Vyapar treats every document the same way, so one component covers sale invoices,
 * purchase bills, estimates and returns.
 */
export function InvoiceWorkspace({
  docType,
  title,
  accent = "brand",
  projectId: projectOverride,
}: {
  docType: DocType;
  title: string;
  accent?: "brand" | "rose";
  /** Pin to one project — set by the Project workspace, which embeds this surface. */
  projectId?: number;
}) {
  const params = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const projectId = useVyaparProjectId(projectOverride);
  // Estimates, proformas and sale orders are non-payment/planning docs — no payment status, a
  // Ref/Order No. instead of an invoice number, and a quotation/order summary, not received/balance.
  const isOrder = docType === "SALE_ORDER" || docType === "PURCHASE_ORDER";
  const NON_PAYMENT =
    docType === "ESTIMATE" || docType === "PROFORMA" || isOrder || docType === "DELIVERY_CHALLAN";
  const noun =
    docType === "PURCHASE" ? "Purchase"
      : docType === "ESTIMATE" ? "Estimate"
        : docType === "PROFORMA" ? "Proforma"
          : docType === "SALE_ORDER" ? "Sale Order"
            : docType === "PURCHASE_ORDER" ? "Purchase Order"
              : docType === "DELIVERY_CHALLAN" ? "Delivery Challan"
                : docType === "SALE_RETURN" ? "Credit Note"
                  : docType === "PURCHASE_RETURN" ? "Debit Note"
                    : "Sale";
  const numberColLabel =
    isOrder ? "Order no"
      : docType === "DELIVERY_CHALLAN" ? "Challan no"
        : docType === "SALE_RETURN" || docType === "PURCHASE_RETURN" ? "Return no"
          : docType === "ESTIMATE" || docType === "PROFORMA" ? "Ref no"
            : "Invoice no";
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [parties, setParties] = useState<Party[]>([]);
  const [items, setItems] = useState<Item[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<"All" | "Paid" | "Partial" | "Unpaid">("All");
  const [editing, setEditing] = useState<Invoice | null>(null);
  const [creating, setCreating] = useState(false);
  /** A purchase order carried over from an awarded RFQ, waiting for the builder to open. */
  const [prefill, setPrefill] = useState<PoDraft | null>(null);
  const [importing, setImporting] = useState(false);
  const [paying, setPaying] = useState<Invoice | null>(null);
  const [uploading, setUploading] = useState(false);
  /** The file chosen in Upload Bill, held until the Purchase form opens and takes it. */
  const [uploadedBill, setUploadedBill] = useState<BillAttachment | null>(null);
  const [history, setHistory] = useState<Invoice | null>(null);
  // Vyapar opens every transaction list on the current year, not on everything ever recorded.
  const [range, setRange] = useState<DateRange>(() => defaultRange("This Year"));

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const [inv, pty, itm] = await Promise.all([
        vyapar.getInvoices(docType, projectId),
        vyapar.getParties(undefined, projectId),
        vyapar.getItems(projectId),
      ]);
      setInvoices(inv);
      setParties(pty);
      setItems(itm);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't load documents.");
    } finally {
      setLoading(false);
    }
  }, [docType, projectId]);

  useEffect(() => {
    load();
  }, [load]);

  // ?new=1 opens the builder straight away (used by the dashboard's Add Sale/Purchase buttons).
  // ?new= opens the create form. The flag is stripped from the URL as soon as it's consumed:
  // leaving it there means the next Alt+<key> press (or another click on "Add Sale") pushes an
  // identical URL, `params` never changes, this effect never re-runs, and the shortcut looks dead.
  useEffect(() => {
    if (!params?.get("new")) return;
    // An award (from=rfq) or a subcon bill (from=wo) hands the whole document over rather than
    // pushing it through the URL; see poHandoff.
    // Reading it here (not in the builder) keeps the one-shot take tied to this one navigation.
    // Functional update, and deliberately so: Strict Mode runs this effect twice in development,
    // and a second bare take would return null (the draft is read once and cleared) and wipe the
    // one already in hand. Keeping what we hold makes the double-invoke harmless.
    if (params.get("from")) setPrefill((prev) => prev ?? takePoDraft());
    setCreating(true);
    const rest = new URLSearchParams(params.toString());
    rest.delete("new");
    rest.delete("from");
    const qs = rest.toString();
    router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
  }, [params, router, pathname]);

  // ?open=<id> opens a specific document — how party/item ledgers deep-link back to their source.
  useEffect(() => {
    const openId = params?.get("open");
    if (!openId) return;
    const found = invoices.find((i) => String(i.id) === openId);
    if (found) setEditing(found);
  }, [params, invoices]);

  const rows = useMemo(() => {
    const q = search.trim().toLowerCase();
    return invoices.filter((i) => {
      if (!inRange(i.invoiceDate, range)) return false;
      if (statusFilter !== "All" && i.status !== statusFilter) return false;
      if (!q) return true;
      return [i.invoiceNo, i.partyName, i.invoiceDate].some((f) => f?.toLowerCase().includes(q));
    });
  }, [invoices, search, statusFilter, range]);

  // Vyapar-style per-column funnels stack on top of the search/status filter.
  const columns = useMemo(
    () => ({
      date: { get: (i: Invoice) => i.invoiceDate ?? "", type: "text" as const },
      number: { get: (i: Invoice) => i.invoiceNo, type: "text" as const },
      party: { get: (i: Invoice) => i.partyName ?? "", type: "text" as const },
      paymentType: { get: (i: Invoice) => i.paymentType, type: "select" as const, options: PAYMENT_TYPES },
      amount: { get: (i: Invoice) => i.total, type: "number" as const },
      balance: { get: (i: Invoice) => i.balance, type: "number" as const },
      status: { get: (i: Invoice) => i.status, type: "select" as const, options: ["Paid", "Partial", "Unpaid"] },
    }),
    []
  );
  const { filtered, filters, setFilter } = useColumnFilters(rows, columns);

  // Sortable columns — defaults to newest first, like Vyapar's own lists.
  const { sorted, sortKey, sortDir, toggle } = useTableSort<Invoice>(
    filtered,
    {
      date: (i) => i.invoiceDate,
      number: (i) => i.invoiceNo,
      party: (i) => i.partyName,
      paymentType: (i) => i.paymentType,
      amount: (i) => i.total,
      balance: (i) => i.balance,
      status: (i) => i.status,
    },
    { key: "date", dir: "desc" },
  );

  const totals = useMemo(() => {
    // Cancelled documents stay in the list but stop counting towards the period's money.
    const live = filtered.filter((i) => !i.cancelled);
    const total = live.reduce((s, i) => s + i.total, 0);
    const received = live.reduce((s, i) => s + i.paidAmount, 0);

    /**
     * Vyapar's "▲ 69.01% vs last year" badge: the same span of days immediately before the
     * selected range. Needs an explicit range on both ends, so "All" shows no comparison.
     */
    let deltaPercent: number | null = null;
    if (range.from && range.to) {
      const from = new Date(range.from);
      const to = new Date(range.to);
      const span = to.getTime() - from.getTime();
      const prevTo = new Date(from.getTime() - 86_400_000);
      const prevFrom = new Date(prevTo.getTime() - span);
      const iso = (d: Date) => d.toISOString().slice(0, 10);
      const prevTotal = invoices
        .filter((i) => !i.cancelled && i.invoiceDate)
        .filter((i) => {
          const d = i.invoiceDate!.slice(0, 10);
          return d >= iso(prevFrom) && d <= iso(prevTo);
        })
        .reduce((s, i) => s + i.total, 0);
      // A jump from nothing isn't a percentage, so leave the badge off rather than show ∞.
      if (prevTotal > 0) deltaPercent = ((total - prevTotal) / prevTotal) * 100;
    }

    return { total, received, balance: total - received, deltaPercent };
  }, [filtered, invoices, range]);

  async function remove(inv: Invoice) {
    if (!confirm(`Delete ${inv.invoiceNo}? Stock and balances will be reversed.`)) return;
    try {
      await vyapar.deleteInvoice(inv.id);
      load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't delete this document.");
    }
  }

  /** Runs one of the row actions and refreshes, surfacing any failure in the page's error strip. */
  async function run(action: () => Promise<unknown>, failure: string) {
    try {
      await action();
      load();
    } catch (err) {
      setError(err instanceof Error ? err.message : failure);
    }
  }

  /**
   * Cancel keeps the document and its number but takes it out of the balances — Vyapar treats it
   * as distinct from delete, so the confirmation has to say which one this is.
   */
  function cancel(inv: Invoice) {
    if (!confirm(`Cancel ${inv.invoiceNo}? It stays in the books but stops counting towards balances and stock.`)) return;
    run(() => vyapar.cancelInvoice(inv.id), "Couldn't cancel this document.");
  }

  function reopen(inv: Invoice) {
    run(() => vyapar.reopenInvoice(inv.id), "Couldn't reopen this document.");
  }

  function duplicate(inv: Invoice) {
    run(() => vyapar.duplicateInvoice(inv.id), "Couldn't duplicate this document.");
  }

  function convertToReturn(inv: Invoice) {
    const noun = docType === "PURCHASE" ? "debit note" : "credit note";
    if (!confirm(`Raise a ${noun} against ${inv.invoiceNo}?`)) return;
    run(() => vyapar.convertToReturn(inv.id), "Couldn't convert this document.");
  }

  /** Print one document, using the same table renderer the list export uses. */
  function printOne(inv: Invoice) {
    printRows(
      `${noun} · ${inv.invoiceNo}`,
      ["Item", "Qty", "Rate", "Tax", "Amount"],
      inv.lines.map((l) => [l.itemName, l.quantity, inr(l.rate), inr(l.taxAmount), inr(l.amount)]),
      `${inv.partyName ?? "—"} · ${bookDate(inv.invoiceDate)} · Total ${inr(inv.total)}`
    );
  }

  const partyOf = (inv: Invoice) => parties.find((p) => p.id === inv.partyId);

  function exportCsv() {
    const head = ["Date", "Invoice no", "Party", "Payment Type", "Total", "Paid", "Balance", "Status"];
    const lines = filtered.map((i) => [
      i.invoiceDate ?? "", i.invoiceNo, i.partyName ?? "", i.paymentType,
      i.total, i.paidAmount, i.balance, i.status,
    ]);
    const csv = [head, ...lines].map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(",")).join("\n");
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = `${docType.toLowerCase()}-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  const addBtn = accent === "rose" ? "bg-rose-600 hover:bg-rose-700" : "bg-brand-accent hover:opacity-90";

  return (
    <div className="animate-fade-in space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-base font-semibold text-gray-800">{title}</h2>
        <div className="flex gap-2">
          <button
            onClick={exportCsv}
            disabled={filtered.length === 0}
            className="flex items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-600 transition-all duration-150 hover:bg-gray-50 active:scale-95 disabled:opacity-50"
          >
            <Download size={14} /> Export
          </button>
          <button
            onClick={() =>
              downloadPdf(
                title,
                ["Date", "Invoice no", "Party", "Payment Type", "Total", "Paid", "Balance", "Status"],
                filtered.map((i) => [i.invoiceDate ?? "", i.invoiceNo, i.partyName ?? "", i.paymentType, inr(i.total), inr(i.paidAmount), inr(i.balance), i.status]),
                { rightAlignFrom: 4 }
              )
            }
            disabled={filtered.length === 0}
            className="flex items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-600 transition-all duration-150 hover:bg-gray-50 active:scale-95 disabled:opacity-50"
          >
            <FileText size={14} className="text-rose-600" /> PDF
          </button>
          {docType === "PURCHASE" && (
            <button
              onClick={() => setUploading(true)}
              className="flex items-center gap-1.5 rounded-lg border border-rose-200 bg-white px-3 py-2 text-sm font-medium text-rose-600 transition-all duration-150 hover:bg-rose-50 active:scale-95"
            >
              <Upload size={14} /> Upload Bill
            </button>
          )}
          <button
            onClick={() => setImporting(true)}
            className="flex items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-600 transition-all duration-150 hover:bg-gray-50 active:scale-95"
          >
            <Upload size={14} /> Import
          </button>
          <button
            onClick={() => setCreating(true)}
            className={`flex items-center gap-1.5 rounded-lg px-3.5 py-2 text-sm font-semibold text-white transition-all duration-150 active:scale-95 ${addBtn}`}
          >
            <Plus size={15} /> Add {noun}
          </button>
        </div>
      </div>

      {/* Vyapar's filter bar sits directly under the title on every transaction list. */}
      <DateRangeFilter value={range} onChange={setRange} />

      {/* Purchase Bills uses Vyapar's older summary: three tiles read as a formula. */}
      {docType === "PURCHASE" ? (
        <div className="flex flex-wrap items-center gap-3">
          <Tile label="Paid" value={inr(totals.received)} tone="emerald" />
          <span className="text-xl font-semibold text-gray-400">+</span>
          <Tile label="Unpaid" value={inr(totals.balance)} tone="sky" />
          <span className="text-xl font-semibold text-gray-400">=</span>
          <Tile label="Total" value={inr(totals.total)} tone="amber" />
        </div>
      ) : (
      /* Totals card — Vyapar shows "Total Quotations" for estimates/proformas, "Total Sales Amount" otherwise */
      <div className="inline-flex flex-wrap gap-6 rounded-xl border border-gray-200 bg-white px-5 py-4">
        {NON_PAYMENT ? (
          <>
            <div>
              <div className="text-xs text-gray-500">
                {isOrder ? "Total Order Amount" : docType === "DELIVERY_CHALLAN" ? "Total Challan Amount" : "Total Quotations"}
              </div>
              <div className="mt-1 text-2xl font-semibold text-gray-800">{inr(totals.total)}</div>
            </div>
            <div className="border-l border-gray-100 pl-6 text-sm">
              <div className="text-gray-500">
                {isOrder ? "Completed" : "Converted"}: <span className="font-medium text-emerald-600">{inr(0)}</span>
              </div>
              <div className="mt-1 text-gray-500">
                Open: <span className="font-medium text-amber-600">{inr(totals.total)}</span>
              </div>
            </div>
          </>
        ) : (
          <>
            <div>
              {/* Purchase has its own tile strip above, so this branch is always sale-side. */}
              <div className="text-xs text-gray-500">Total Sales Amount</div>
              <div className="mt-1 flex items-baseline gap-2">
                <span className="text-2xl font-semibold text-gray-800">{inr(totals.total)}</span>
                {/* Vyapar shows how the period compares with the one before it. */}
                {totals.deltaPercent !== null && (
                  <span
                    className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${
                      totals.deltaPercent >= 0 ? "bg-emerald-50 text-emerald-700" : "bg-rose-50 text-rose-700"
                    }`}
                    title="Compared with the previous period of the same length"
                  >
                    {totals.deltaPercent >= 0 ? "▲" : "▼"} {Math.abs(totals.deltaPercent).toFixed(2)}%
                  </span>
                )}
              </div>
            </div>
            <div className="border-l border-gray-100 pl-6 text-sm">
              <div className="text-gray-500">
                Received: <span className="font-medium text-emerald-600">{inr(totals.received)}</span>
              </div>
              <div className="mt-1 text-gray-500">
                Balance: <span className="font-medium text-rose-600">{inr(totals.balance)}</span>
              </div>
            </div>
          </>
        )}
      </div>
      )}

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex min-w-[220px] flex-1 items-center gap-2 rounded-lg border border-gray-200 bg-white px-3 py-2 transition-colors duration-150 focus-within:border-cyan-500">
          <Search size={15} className="text-gray-400" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search invoice no or party…"
            className="w-full bg-transparent text-sm outline-none"
          />
        </div>
        {!NON_PAYMENT &&
          (["All", "Unpaid", "Partial", "Paid"] as const).map((s) => (
            <button
              key={s}
              onClick={() => setStatusFilter(s)}
              className={`rounded-full px-3.5 py-1.5 text-sm font-medium transition-all duration-150 ${
                statusFilter === s ? "bg-navy text-white shadow-sm" : "bg-white text-gray-600 ring-1 ring-gray-200 hover:bg-gray-50"
              }`}
            >
              {s}
            </button>
          ))}
      </div>

      {error && <div className="rounded-lg bg-rose-50 px-4 py-2 text-sm text-rose-600">{error}</div>}

      {loading ? (
        <div className="flex min-h-[240px] items-center justify-center gap-2 rounded-xl border border-dashed border-gray-300 bg-white text-sm text-gray-400">
          <Spinner size={16} className="text-brand-accent" /> Loading…
        </div>
      ) : filtered.length === 0 ? (
        <VyaparEmpty
          icon={FileText}
          title={invoices.length === 0 ? `No ${title.toLowerCase()} yet` : "Nothing matches"}
          hint={invoices.length === 0 ? "Create your first document to start billing." : "Try a different search or filter."}
          action={
            invoices.length === 0 ? (
              <button onClick={() => setCreating(true)} className={`rounded-lg px-4 py-2 text-sm font-medium text-white ${addBtn}`}>
                + Add {noun}
              </button>
            ) : null
          }
        />
      ) : (
        <div className="overflow-x-auto rounded-xl border border-gray-200 bg-white">
          <table className="w-full min-w-[900px] border-collapse text-sm">
            <thead>
              <tr className="border-b border-gray-100 bg-gray-50 text-left text-gray-500">
                <FilterTh label="Date" sortKey="date" activeKey={sortKey} dir={sortDir} onSort={toggle} filterKey="date" type="text" filter={filters.date} onApply={setFilter} />
                <FilterTh label={numberColLabel} sortKey="number" activeKey={sortKey} dir={sortDir} onSort={toggle} filterKey="number" type="text" filter={filters.number} onApply={setFilter} />
                <FilterTh label="Party Name" sortKey="party" activeKey={sortKey} dir={sortDir} onSort={toggle} filterKey="party" type="text" filter={filters.party} onApply={setFilter} />
                {/* Vyapar carries a Transaction column naming the document type on every list. */}
                <th className="px-4 py-2 text-left font-medium">Transaction</th>
                {!NON_PAYMENT && <FilterTh label="Payment Type" sortKey="paymentType" activeKey={sortKey} dir={sortDir} onSort={toggle} filterKey="paymentType" type="select" options={PAYMENT_TYPES} filter={filters.paymentType} onApply={setFilter} />}
                <FilterTh label="Amount" sortKey="amount" activeKey={sortKey} dir={sortDir} onSort={toggle} align="right" filterKey="amount" type="number" filter={filters.amount} onApply={setFilter} />
                {!NON_PAYMENT && <FilterTh label="Balance" sortKey="balance" activeKey={sortKey} dir={sortDir} onSort={toggle} align="right" filterKey="balance" type="number" filter={filters.balance} onApply={setFilter} />}
                {!NON_PAYMENT && <FilterTh label="Status" sortKey="status" activeKey={sortKey} dir={sortDir} onSort={toggle} filterKey="status" type="select" options={["Paid", "Partial", "Unpaid", "Cancelled"]} filter={filters.status} onApply={setFilter} />}
                <th className="w-32 px-4 py-2 text-left font-medium">Actions</th>
              </tr>
            </thead>
            <tbody>
              {sorted.map((i) => (
                <tr
                  key={i.id}
                  onClick={() => setEditing(i)}
                  className="cursor-pointer border-b border-gray-50 transition-colors duration-150 last:border-b-0 even:bg-gray-50/40 hover:bg-cyan-50/40"
                >
                  <td className="px-4 py-2.5 whitespace-nowrap text-gray-600">{bookDate(i.invoiceDate)}</td>
                  <td className={`px-4 py-2.5 font-medium text-gray-800 ${i.cancelled ? "line-through decoration-rose-400" : ""}`}>
                    {i.invoiceNo}
                  </td>
                  <td className="px-4 py-2.5 text-gray-700">{i.partyName ?? "—"}</td>
                  <td className="px-4 py-2.5 text-gray-600">{noun}</td>
                  {!NON_PAYMENT && <td className="px-4 py-2.5 text-gray-600">{i.paymentType}</td>}
                  <td className="px-4 py-2.5 text-right font-medium text-gray-800">{inr(i.total)}</td>
                  {!NON_PAYMENT && (
                    <td className={`px-4 py-2.5 text-right ${i.balance > 0 ? "font-medium text-rose-600" : "text-gray-400"}`}>
                      {inr(i.balance)}
                    </td>
                  )}
                  {!NON_PAYMENT && (
                    <td className="px-4 py-2.5">
                      <StatusText status={i.status} />
                    </td>
                  )}
                  <td className="px-4 py-2.5" onClick={(e) => e.stopPropagation()}>
                    <TxnRowActions
                      docType={docType}
                      cancelled={i.cancelled}
                      hasBalance={!NON_PAYMENT && i.balance > 0}
                      label={i.invoiceNo}
                      handlers={{
                        onEdit: () => setEditing(i),
                        onDelete: () => remove(i),
                        onPreview: () => setEditing(i),
                        onPrint: () => printOne(i),
                        onShare: () => downloadInvoicePdf(i, partyOf(i), items),
                        onHistory: () => setHistory(i),
                        onDuplicate: () => duplicate(i),
                        onCancel: () => cancel(i),
                        onReopen: () => reopen(i),
                        onConvertToReturn: () => convertToReturn(i),
                        onReceivePayment: () => setPaying(i),
                        onPreviewAsChallan: () => downloadInvoicePdf(i, partyOf(i), items),
                      }}
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {(creating || editing) && (
        <InvoiceBuilder
          docType={docType}
          existing={editing ?? undefined}
          parties={parties}
          items={items}
          projectId={projectOverride}
          initialAttachment={uploadedBill ?? undefined}
          prefill={prefill ?? undefined}
          // An inline-created master joins the local lists immediately, so the picker shows it
          // without waiting for a round trip.
          onItemCreated={(item) => setItems((prev) => [item, ...prev])}
          onPartyCreated={(party) => setParties((prev) => [party, ...prev])}
          onClose={() => { setCreating(false); setEditing(null); setUploadedBill(null); setPrefill(null); }}
          onSaved={(again) => {
            // The uploaded bill and the carried-over award both belong to the document just
            // saved; a Save & New starts clean.
            setUploadedBill(null);
            setPrefill(null);
            // Save & New keeps the builder open for the next document.
            if (!again) {
              setCreating(false);
              setEditing(null);
            }
            load();
          }}
        />
      )}

      {uploading && (
        <UploadBillDialog
          onClose={() => setUploading(false)}
          // The uploaded file rides into the new bill as its attachment, rather than being
          // previewed and then dropped on the way to a blank form.
          onContinue={(attachment) => {
            setUploadedBill(attachment);
            setUploading(false);
            setCreating(true);
          }}
        />
      )}

      {importing && (
        <ImportDialog
          config={documentImportConfig(docType)}
          onClose={() => setImporting(false)}
          onImported={() => { setImporting(false); load(); }}
        />
      )}

      {history && <InvoiceHistoryDialog invoice={history} onClose={() => setHistory(null)} />}

      {paying && (
        <PaymentDrawer
          invoice={paying}
          direction={docType === "PURCHASE" ? "OUT" : "IN"}
          onClose={() => setPaying(null)}
          onSaved={() => { setPaying(null); load(); }}
        />
      )}
    </div>
  );
}

/** One tile of Purchase Bills' `Paid + Unpaid = Total` strip. */
function Tile({ label, value, tone }: { label: string; value: string; tone: "emerald" | "sky" | "amber" }) {
  const cls =
    tone === "emerald"
      ? "bg-emerald-50 text-emerald-900"
      : tone === "sky"
        ? "bg-sky-50 text-sky-900"
        : "bg-amber-50 text-amber-900";
  return (
    <div className={`min-w-[150px] rounded-xl px-5 py-3.5 ${cls}`}>
      <div className="text-xs opacity-70">{label}</div>
      <div className="mt-0.5 text-xl font-semibold">{value}</div>
    </div>
  );
}

/** Vyapar renders status as coloured text, not a pill. */
function StatusText({ status }: { status: Invoice["status"] }) {
  const cls =
    status === "Paid" ? "text-emerald-600"
      : status === "Partial" ? "text-amber-600"
        : status === "Cancelled" ? "text-gray-400 line-through"
          : "text-rose-600";
  return <span className={`text-sm font-medium ${cls}`}>{status}</span>;
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-gray-500">{label}</span>
      <span className="font-medium text-gray-800">{value}</span>
    </div>
  );
}

/** Record a payment against an outstanding invoice. */
function PaymentDrawer({
  invoice,
  direction,
  onClose,
  onSaved,
}: {
  invoice: Invoice;
  direction: "IN" | "OUT";
  onClose: () => void;
  onSaved: () => void;
}) {
  const [amount, setAmount] = useState(invoice.balance);
  const [mode, setMode] = useState("Cash");
  const [reference, setReference] = useState("");
  const [paymentDate, setPaymentDate] = useState(new Date().toISOString().slice(0, 10));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  async function save() {
    setSaving(true);
    setError("");
    try {
      await vyapar.createPayment({
        direction,
        partyId: invoice.partyId,
        invoiceId: invoice.id,
        amount: Number(amount) || 0,
        mode,
        reference: reference || null,
        paymentDate,
      });
      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't record this payment.");
      setSaving(false);
    }
  }

  return (
    <Drawer title={`Record Payment · ${invoice.invoiceNo}`} onClose={onClose} onSave={save} saveLabel={saving ? "Saving…" : "Save"}>
      <div className="space-y-4">
        {error && <div className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-600">{error}</div>}
        <div className="rounded-xl border border-gray-200 bg-gray-50/60 p-4 text-sm">
          <Row label="Invoice total" value={inr(invoice.total)} />
          <Row label="Already paid" value={inr(invoice.paidAmount)} />
          <div className="mt-2 flex items-center justify-between border-t border-gray-200 pt-2">
            <span className="font-semibold text-gray-700">Outstanding</span>
            <span className="text-lg font-semibold text-rose-600">{inr(invoice.balance)}</span>
          </div>
        </div>
        <DrawerField label="Amount" required>
          <input type="number" value={amount} onChange={(e) => setAmount(Number(e.target.value))} className="input" />
        </DrawerField>
        <DrawerField label="Payment Date">
          <DatePicker value={paymentDate} onChange={setPaymentDate} placeholder="Payment date" />
        </DrawerField>
        <DrawerField label="Mode">
          <Select value={mode} onChange={setMode} options={PAYMENT_TYPES.map((t) => ({ value: t, label: t }))} />
        </DrawerField>
        <DrawerField label="Reference">
          <input value={reference} onChange={(e) => setReference(e.target.value)} className="input" placeholder="NEFT / cheque no" />
        </DrawerField>
      </div>
    </Drawer>
  );
}

