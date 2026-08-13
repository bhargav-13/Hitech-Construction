"use client";

import { useEffect, useState } from "react";
import { RowMenu, RowMenuDivider, RowMenuItem } from "@/components/RowMenu";
import { downloadInvoicePdf } from "@/lib/vyaparExport";
import * as vyapar from "@/lib/vyaparApi";
import type { Invoice, Party } from "@/lib/vyaparApi";
import {
  Ban,
  Copy,
  Eye,
  FileText,
  History,
  Link2,
  Printer,
  RotateCcw,
  Share2,
  Trash2,
  Truck,
  Wallet,
} from "lucide-react";

/**
 * The `Actions` cell on a transaction row, as Vyapar renders it: an inline print button, an inline
 * share button, and a `⋮` whose contents depend on the document type.
 *
 * A sale carries eleven actions (cancel, duplicate, preview, convert to return, receive payment,
 * view history …); a payment carries seven — the invoice-only ones simply aren't offered. Our lists
 * previously showed four, which is the gap the client kept pointing at.
 */
export type TxnKind = "INVOICE" | "PAYMENT";

export interface TxnActionHandlers {
  onEdit: () => void;
  onDelete: () => void;
  onPreview?: () => void;
  onPrint: () => void;
  onShare: () => void;
  onHistory?: () => void;
  /** Payments only — opens "Link Payment to Txns". */
  onLink?: () => void;
  onDuplicate?: () => void;
  onCancel?: () => void;
  onReopen?: () => void;
  onConvertToReturn?: () => void;
  onReceivePayment?: () => void;
  onPreviewAsChallan?: () => void;
}

/**
 * Which of Vyapar's actions apply to a given row.
 *
 * Payments get a smaller set than documents. Vyapar offers seven actions on a payment row; the
 * three we don't list here (Duplicate, Preview, View History) have no backing behaviour on our
 * side yet, and a menu item that does the wrong thing is worse than one that isn't there. "Link
 * Payment" takes the place of View/Edit, because spreading a receipt across bills *is* how you
 * edit a payment in this module.
 */
export function actionsFor(docType: string | null | undefined, kind: TxnKind) {
  const isInvoiceDoc = kind === "INVOICE";
  const isSaleOrPurchase = docType === "SALE" || docType === "PURCHASE";
  return {
    cancel: isInvoiceDoc,
    duplicate: isInvoiceDoc,
    preview: isInvoiceDoc,
    print: true,
    // Vyapar only offers the challan preview on sale-side documents.
    previewAsChallan: docType === "SALE" || docType === "SALE_ORDER",
    convertToReturn: isSaleOrPurchase,
    receivePayment: isInvoiceDoc,
    history: isInvoiceDoc,
    link: !isInvoiceDoc,
  };
}

export function TxnRowActions({
  docType,
  kind = "INVOICE",
  cancelled = false,
  hasBalance = false,
  label,
  handlers,
}: {
  docType?: string | null;
  kind?: TxnKind;
  cancelled?: boolean;
  hasBalance?: boolean;
  label: string;
  handlers: TxnActionHandlers;
}) {
  const can = actionsFor(docType, kind);

  return (
    <div className="flex items-center justify-end gap-0.5">
      <button
        onClick={handlers.onPrint}
        title="Print"
        aria-label={`Print ${label}`}
        className="rounded-md p-1.5 text-gray-400 transition-colors duration-150 hover:bg-gray-100 hover:text-gray-700"
      >
        <Printer size={15} />
      </button>
      <button
        onClick={handlers.onShare}
        title="Share"
        aria-label={`Share ${label}`}
        className="rounded-md p-1.5 text-gray-400 transition-colors duration-150 hover:bg-cyan-50 hover:text-brand-accent"
      >
        <Share2 size={15} />
      </button>
      <RowMenu align="right" buttonLabel={`Actions for ${label}`}>
        {(close) => (
          <>
            <RowMenuItem
              icon={can.link ? Link2 : FileText}
              label={can.link ? "Link Payment" : "View/Edit"}
              onClick={() => { close(); (can.link ? handlers.onLink ?? handlers.onEdit : handlers.onEdit)(); }}
            />
            {can.cancel &&
              (cancelled ? (
                <RowMenuItem icon={RotateCcw} label="Reopen Invoice" onClick={() => { close(); handlers.onReopen?.(); }} />
              ) : (
                <RowMenuItem icon={Ban} label="Cancel Invoice" tone="warning" onClick={() => { close(); handlers.onCancel?.(); }} />
              ))}
            <RowMenuItem icon={Trash2} label="Delete" tone="danger" onClick={() => { close(); handlers.onDelete(); }} />
            {can.duplicate && (
              <RowMenuItem icon={Copy} label="Duplicate" onClick={() => { close(); handlers.onDuplicate?.(); }} />
            )}
            <RowMenuDivider />
            <RowMenuItem icon={FileText} iconClassName="text-rose-600" label="Open PDF" onClick={() => { close(); handlers.onShare(); }} />
            {can.preview && handlers.onPreview && (
              <RowMenuItem icon={Eye} label="Preview" onClick={() => { close(); handlers.onPreview?.(); }} />
            )}
            {can.print && <RowMenuItem icon={Printer} label="Print" onClick={() => { close(); handlers.onPrint(); }} />}
            {can.previewAsChallan && (
              <RowMenuItem
                icon={Truck}
                label="Preview As Delivery Challan"
                onClick={() => { close(); handlers.onPreviewAsChallan?.(); }}
              />
            )}
            {(can.convertToReturn || (can.receivePayment && hasBalance)) && <RowMenuDivider />}
            {can.convertToReturn && !cancelled && (
              <RowMenuItem
                icon={RotateCcw}
                label="Convert To Return"
                onClick={() => { close(); handlers.onConvertToReturn?.(); }}
              />
            )}
            {can.receivePayment && hasBalance && !cancelled && (
              <RowMenuItem icon={Wallet} label="Receive Payment" onClick={() => { close(); handlers.onReceivePayment?.(); }} />
            )}
            {can.history && handlers.onHistory && (
              <>
                <RowMenuDivider />
                <RowMenuItem icon={History} label="View History" onClick={() => { close(); handlers.onHistory?.(); }} />
              </>
            )}
          </>
        )}
      </RowMenu>
    </div>
  );
}

/** Vyapar's "View History" — the document's audit trail, newest first. */
export function InvoiceHistoryDialog({ invoice, onClose }: { invoice: Invoice; onClose: () => void }) {
  const [rows, setRows] = useState<vyapar.InvoiceHistoryRow[] | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    let alive = true;
    vyapar
      .getInvoiceHistory(invoice.id)
      .then((r) => alive && setRows(r))
      .catch((e) => alive && setError(e instanceof Error ? e.message : "Couldn't load history."));
    return () => {
      alive = false;
    };
  }, [invoice.id]);

  return (
    <>
      <div className="fixed inset-0 z-40 bg-black/30" onClick={onClose} />
      <div className="animate-fade-in fixed left-1/2 top-1/2 z-50 w-[min(560px,92vw)] -translate-x-1/2 -translate-y-1/2 rounded-xl border border-gray-200 bg-white shadow-2xl">
        <div className="flex items-center justify-between border-b border-gray-100 px-5 py-3">
          <h3 className="text-sm font-semibold text-gray-800">History · {invoice.invoiceNo}</h3>
          <button onClick={onClose} className="rounded-md px-2 py-1 text-sm text-gray-400 hover:bg-gray-100">
            Close
          </button>
        </div>
        <div className="max-h-[60vh] overflow-y-auto p-2">
          {error && <div className="px-3 py-4 text-sm text-rose-600">{error}</div>}
          {!error && rows === null && <div className="px-3 py-6 text-center text-sm text-gray-400">Loading…</div>}
          {rows?.length === 0 && (
            <div className="px-3 py-8 text-center text-sm text-gray-400">Nothing recorded for this document yet.</div>
          )}
          {rows?.map((r) => (
            <div key={r.id} className="flex items-start justify-between gap-3 rounded-lg px-3 py-2 hover:bg-gray-50">
              <div className="min-w-0">
                <div className="text-sm font-medium text-gray-800">{r.action}</div>
                {r.detail && <div className="truncate text-xs text-gray-500">{r.detail}</div>}
              </div>
              <div className="shrink-0 text-xs text-gray-400">{r.at ?? "—"}</div>
            </div>
          ))}
        </div>
      </div>
    </>
  );
}

/** Shared PDF/share handler, so every list opens the same document. */
export function shareInvoice(invoice: Invoice, parties: Party[]) {
  return downloadInvoicePdf(invoice, parties.find((p) => p.id === invoice.partyId));
}
