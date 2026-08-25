"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ExternalLink, Paperclip } from "lucide-react";
import { Drawer } from "@/components/Drawer";
import { Spinner } from "@/components/Spinner";
import { getPurchaseDocument } from "@/lib/purchaseApi";
import { inr } from "@/lib/format";
import type { Invoice } from "@/lib/vyaparApi";
import { DOC_STATUS_CLS } from "@/components/procurement/PurchaseDocumentList";

/**
 * One purchase order or bill in full, opened by clicking its row.
 *
 * <p>The list already carries most of a document, but not its lines — those come from the detail
 * endpoint. The row's own copy is shown immediately as a fallback so the drawer never opens blank
 * while that request is in flight.
 */
export function PurchaseDocumentDrawer({
  documentId,
  fallback,
  noun,
  canOpenVyapar,
  onClose,
}: {
  documentId: number;
  fallback: Invoice;
  noun: string;
  canOpenVyapar: boolean;
  onClose: () => void;
}) {
  const [doc, setDoc] = useState<Invoice>(fallback);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    getPurchaseDocument(documentId)
      .then((d) => { if (!cancelled) setDoc(d); })
      .catch(() => { /* keep the row's copy — it is the same record, just without lines */ })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [documentId]);

  const lines = doc.lines ?? [];

  return (
    <Drawer
      title={`${noun} ${doc.invoiceNo ?? ""}`.trim()}
      onClose={onClose}
      width="max-w-3xl"
      guardOnClose={false}
      footer={
        canOpenVyapar ? (
          <Link
            href={`/vyapar/${doc.docType === "PURCHASE_ORDER" ? "purchase-order" : "purchase"}`}
            className="flex items-center gap-1.5 text-sm font-medium text-brand-accent hover:underline"
          >
            Edit in Vyapar <ExternalLink size={13} />
          </Link>
        ) : (
          <span className="text-xs text-gray-400">
            Read-only here. Editing a purchase document happens in Vyapar.
          </span>
        )
      }
    >
      <div className="space-y-5">
        <div className="flex flex-wrap items-start justify-between gap-3 rounded-xl border border-gray-200 bg-gray-50/60 p-4">
          <div className="min-w-0">
            <div className="text-base font-semibold text-gray-900">{doc.partyName ?? doc.billingName ?? "—"}</div>
            <div className="mt-0.5 text-xs text-gray-500">
              {doc.invoiceNo ?? "—"} · {doc.invoiceDate ?? "—"}
              {doc.dueDate && <> · due {doc.dueDate}</>}
            </div>
          </div>
          <span
            className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-medium ring-1 ring-inset ${
              DOC_STATUS_CLS[doc.status ?? ""] ?? DOC_STATUS_CLS.Unpaid
            }`}
          >
            {doc.status ?? "—"}
          </span>
        </div>

        <div className="grid grid-cols-2 gap-x-6 gap-y-3 sm:grid-cols-4">
          <Fig label="Sub total" value={inr(doc.subTotal)} />
          <Fig label="Discount" value={inr(doc.discount)} />
          <Fig label="Tax" value={inr(doc.taxAmount)} />
          <Fig label="Total" value={inr(doc.total)} strong />
          <Fig label="Paid" value={inr(doc.paidAmount)} />
          <Fig label="Balance" value={inr(doc.balance)} tone={Number(doc.balance) > 0 ? "text-amber-700" : undefined} />
          <Fig label="Payment type" value={doc.paymentType ?? "—"} />
          <Fig label="Reference" value={doc.paymentReference ?? "—"} />
        </div>

        <div>
          <h4 className="mb-2 text-[11px] font-semibold tracking-wide text-gray-400 uppercase">
            Lines {loading && <Spinner size={11} className="ml-1 inline text-brand-accent" />}
          </h4>
          {lines.length === 0 ? (
            <p className="rounded-lg border border-dashed border-gray-200 px-3 py-6 text-center text-sm text-gray-400">
              {loading ? "Loading lines…" : "This document has no item lines."}
            </p>
          ) : (
            <div className="overflow-x-auto rounded-xl border border-gray-200">
              <table className="min-w-full text-sm">
                <thead className="border-b border-gray-200 bg-gray-50 text-left text-[11px] font-semibold tracking-wide text-gray-500 uppercase">
                  <tr>
                    <th className="px-3 py-2">Item</th>
                    <th className="px-3 py-2 text-right">Qty</th>
                    <th className="px-3 py-2 text-right">Rate</th>
                    <th className="px-3 py-2 text-right">Tax</th>
                    <th className="px-3 py-2 text-right">Amount</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {lines.map((l, i) => (
                    <tr key={l.id ?? i} className="even:bg-gray-50/40">
                      <td className="px-3 py-2">
                        <div className="text-gray-800">{l.itemName}</div>
                        {l.description && <div className="text-[11px] text-gray-400">{l.description}</div>}
                      </td>
                      <td className="px-3 py-2 text-right whitespace-nowrap text-gray-600 tabular-nums">
                        {l.quantity} {l.unit ?? ""}
                      </td>
                      <td className="px-3 py-2 text-right whitespace-nowrap text-gray-600 tabular-nums">{inr(l.rate)}</td>
                      <td className="px-3 py-2 text-right whitespace-nowrap text-gray-500 tabular-nums">
                        {l.taxCode ?? `${l.taxPercent}%`}
                      </td>
                      <td className="px-3 py-2 text-right font-medium whitespace-nowrap text-gray-800 tabular-nums">
                        {inr(l.amount ?? 0)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {(doc.notes || doc.terms || doc.description) && (
          <div className="space-y-2">
            {doc.notes && <Note label="Notes">{doc.notes}</Note>}
            {doc.terms && <Note label="Terms">{doc.terms}</Note>}
            {doc.description && <Note label="Description">{doc.description}</Note>}
          </div>
        )}

        {doc.documentDataUrl && (
          <a
            href={doc.documentDataUrl}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1.5 rounded-lg border border-gray-200 px-3 py-2 text-sm text-brand-accent transition-colors hover:bg-cyan-50/50"
          >
            <Paperclip size={14} /> {doc.documentName || "Attached document"}
          </a>
        )}
      </div>
    </Drawer>
  );
}

function Fig({ label, value, strong, tone }: { label: string; value: string; strong?: boolean; tone?: string }) {
  return (
    <div className="min-w-0">
      <div className="text-[11px] tracking-wide text-gray-400 uppercase">{label}</div>
      <div className={`mt-0.5 truncate tabular-nums ${strong ? "text-base font-semibold text-gray-900" : `font-medium ${tone ?? "text-gray-700"}`}`}>
        {value}
      </div>
    </div>
  );
}

function Note({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="rounded-lg bg-gray-50 px-3 py-2">
      <div className="text-[11px] tracking-wide text-gray-400 uppercase">{label}</div>
      <p className="mt-0.5 text-sm whitespace-pre-wrap text-gray-700">{children}</p>
    </div>
  );
}
