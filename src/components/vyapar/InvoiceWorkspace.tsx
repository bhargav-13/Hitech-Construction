"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { VyaparEmpty } from "@/components/vyapar/VyaparShell";
import { Drawer, DrawerField } from "@/components/Drawer";
import { Select } from "@/components/Select";
import { Spinner } from "@/components/Spinner";
import { DatePicker } from "@/components/DatePicker";
import { RowMenu, RowMenuDivider, RowMenuItem } from "@/components/RowMenu";
import { InvoiceBuilder } from "@/components/vyapar/InvoiceBuilder";
import { UploadBillDialog } from "@/components/vyapar/UploadBillDialog";
import { inr } from "@/lib/format";
import { useVyaparBankId } from "@/lib/bankScope";
import { downloadInvoicePdf, downloadPdf } from "@/lib/vyaparExport";
import * as vyapar from "@/lib/vyaparApi";
import type { DocType, Invoice, Item, Party } from "@/lib/vyaparApi";
import { Download, FileText, Plus, Search, Trash2, Upload, Wallet, X } from "lucide-react";

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
}: {
  docType: DocType;
  title: string;
  accent?: "brand" | "rose";
}) {
  const params = useSearchParams();
  const bankAccountId = useVyaparBankId();
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
  const [paying, setPaying] = useState<Invoice | null>(null);
  const [uploading, setUploading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const [inv, pty, itm] = await Promise.all([
        vyapar.getInvoices(docType, bankAccountId),
        vyapar.getParties(undefined, bankAccountId),
        vyapar.getItems(bankAccountId),
      ]);
      setInvoices(inv);
      setParties(pty);
      setItems(itm);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't load documents.");
    } finally {
      setLoading(false);
    }
  }, [docType, bankAccountId]);

  useEffect(() => {
    load();
  }, [load]);

  // ?new=1 opens the builder straight away (used by the dashboard's Add Sale/Purchase buttons).
  useEffect(() => {
    if (params?.get("new") === "1") setCreating(true);
  }, [params]);

  const rows = useMemo(() => {
    const q = search.trim().toLowerCase();
    return invoices.filter((i) => {
      if (statusFilter !== "All" && i.status !== statusFilter) return false;
      if (!q) return true;
      return [i.invoiceNo, i.partyName, i.invoiceDate].some((f) => f?.toLowerCase().includes(q));
    });
  }, [invoices, search, statusFilter]);

  const totals = useMemo(() => {
    const total = rows.reduce((s, i) => s + i.total, 0);
    const received = rows.reduce((s, i) => s + i.paidAmount, 0);
    return { total, received, balance: total - received };
  }, [rows]);

  async function remove(inv: Invoice) {
    if (!confirm(`Delete ${inv.invoiceNo}? Stock and balances will be reversed.`)) return;
    try {
      await vyapar.deleteInvoice(inv.id);
      load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't delete this document.");
    }
  }

  function exportCsv() {
    const head = ["Date", "Invoice no", "Party", "Payment Type", "Total", "Paid", "Balance", "Status"];
    const lines = rows.map((i) => [
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
            disabled={rows.length === 0}
            className="flex items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-600 transition-all duration-150 hover:bg-gray-50 active:scale-95 disabled:opacity-50"
          >
            <Download size={14} /> Export
          </button>
          <button
            onClick={() =>
              downloadPdf(
                title,
                ["Date", "Invoice no", "Party", "Payment Type", "Total", "Paid", "Balance", "Status"],
                rows.map((i) => [i.invoiceDate ?? "", i.invoiceNo, i.partyName ?? "", i.paymentType, inr(i.total), inr(i.paidAmount), inr(i.balance), i.status]),
                { rightAlignFrom: 4 }
              )
            }
            disabled={rows.length === 0}
            className="flex items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-600 transition-all duration-150 hover:bg-gray-50 active:scale-95 disabled:opacity-50"
          >
            <FileText size={14} /> PDF
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
            onClick={() => setCreating(true)}
            className={`flex items-center gap-1.5 rounded-lg px-3.5 py-2 text-sm font-semibold text-white transition-all duration-150 active:scale-95 ${addBtn}`}
          >
            <Plus size={15} /> Add {noun}
          </button>
        </div>
      </div>

      {/* Totals card — Vyapar shows "Total Quotations" for estimates/proformas, "Total Sales Amount" otherwise */}
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
              <div className="text-xs text-gray-500">Total {docType === "PURCHASE" ? "Purchase" : "Sales"} Amount</div>
              <div className="mt-1 text-2xl font-semibold text-gray-800">{inr(totals.total)}</div>
            </div>
            <div className="border-l border-gray-100 pl-6 text-sm">
              <div className="text-gray-500">
                {docType === "PURCHASE" ? "Paid" : "Received"}: <span className="font-medium text-emerald-600">{inr(totals.received)}</span>
              </div>
              <div className="mt-1 text-gray-500">
                Balance: <span className="font-medium text-rose-600">{inr(totals.balance)}</span>
              </div>
            </div>
          </>
        )}
      </div>

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
      ) : rows.length === 0 ? (
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
                <th className="px-4 py-2 font-medium">Date</th>
                <th className="px-4 py-2 font-medium">{numberColLabel}</th>
                <th className="px-4 py-2 font-medium">Party Name</th>
                {!NON_PAYMENT && <th className="px-4 py-2 font-medium">Payment Type</th>}
                <th className="px-4 py-2 text-right font-medium">Amount</th>
                {!NON_PAYMENT && <th className="px-4 py-2 text-right font-medium">Balance</th>}
                {!NON_PAYMENT && <th className="px-4 py-2 font-medium">Status</th>}
                <th className="w-10 px-4 py-2" />
              </tr>
            </thead>
            <tbody>
              {rows.map((i) => (
                <tr
                  key={i.id}
                  onClick={() => setEditing(i)}
                  className="cursor-pointer border-b border-gray-50 transition-colors duration-150 last:border-b-0 even:bg-gray-50/40 hover:bg-cyan-50/40"
                >
                  <td className="px-4 py-2.5 whitespace-nowrap text-gray-600">{formatDate(i.invoiceDate)}</td>
                  <td className="px-4 py-2.5 font-medium text-gray-800">{i.invoiceNo}</td>
                  <td className="px-4 py-2.5 text-gray-700">{i.partyName ?? "—"}</td>
                  {!NON_PAYMENT && <td className="px-4 py-2.5 text-gray-600">{i.paymentType}</td>}
                  <td className="px-4 py-2.5 text-right font-medium text-gray-800">{inr(i.total)}</td>
                  {!NON_PAYMENT && (
                    <td className={`px-4 py-2.5 text-right ${i.balance > 0 ? "font-medium text-rose-600" : "text-gray-400"}`}>
                      {inr(i.balance)}
                    </td>
                  )}
                  {!NON_PAYMENT && (
                    <td className="px-4 py-2.5">
                      <StatusPill status={i.status} />
                    </td>
                  )}
                  <td className="px-4 py-2.5 text-right" onClick={(e) => e.stopPropagation()}>
                    <div className="inline-flex">
                      <RowMenu align="right" buttonLabel={`Actions for ${i.invoiceNo}`}>
                        {(close) => (
                          <>
                            <RowMenuItem icon={FileText} label="Open / Edit" onClick={() => { close(); setEditing(i); }} />
                            {!NON_PAYMENT && i.balance > 0 && (
                              <RowMenuItem icon={Wallet} label="Record Payment" onClick={() => { close(); setPaying(i); }} />
                            )}
                            <RowMenuItem icon={Download} label="Download PDF" onClick={() => { close(); downloadInvoicePdf(i, parties.find((p) => p.id === i.partyId)); }} />
                            <RowMenuDivider />
                            <RowMenuItem icon={Trash2} label="Delete" tone="danger" onClick={() => { close(); remove(i); }} />
                          </>
                        )}
                      </RowMenu>
                    </div>
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
          onClose={() => { setCreating(false); setEditing(null); }}
          onSaved={() => { setCreating(false); setEditing(null); load(); }}
        />
      )}

      {uploading && (
        <UploadBillDialog
          onClose={() => setUploading(false)}
          onContinue={() => { setUploading(false); setCreating(true); }}
        />
      )}

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

function StatusPill({ status }: { status: Invoice["status"] }) {
  const cls =
    status === "Paid" ? "bg-emerald-50 text-emerald-700"
      : status === "Partial" ? "bg-amber-50 text-amber-700"
        : "bg-rose-50 text-rose-700";
  return <span className={`rounded-md px-2 py-0.5 text-xs font-medium ${cls}`}>{status}</span>;
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

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
function formatDate(iso: string | null): string {
  if (!iso || iso.length < 10) return "—";
  const [y, m, d] = iso.slice(0, 10).split("-");
  return `${d}/${m}/${y}`;
}
