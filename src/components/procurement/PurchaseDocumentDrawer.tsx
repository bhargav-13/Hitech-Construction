"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Download, ExternalLink, Pencil } from "lucide-react";
import { InvoiceBuilder } from "@/components/vyapar/InvoiceBuilder";
import { useCan } from "@/lib/permissions";
import { getItems } from "@/lib/vyaparApi";
import type { Item, Party } from "@/lib/vyaparApi";
import { Drawer } from "@/components/Drawer";
import { Spinner } from "@/components/Spinner";
import { getPurchaseDocument, getVendor, getVendors, updatePurchaseDocument } from "@/lib/purchaseApi";
import { downloadInvoicePdf } from "@/lib/vyaparExport";
import { DOC_APPROVAL_TYPE, useApprovalStates } from "@/lib/approvals";
import { ApprovalPanel } from "@/components/approval/ApprovalBadge";
import { inr } from "@/lib/format";
import type { Invoice } from "@/lib/vyaparApi";
import { DOC_STATUS_CLS } from "@/components/procurement/PurchaseDocumentList";
import { ModuleAttachments } from "@/components/files/ModuleAttachments";

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
  onSaved,
}: {
  documentId: number;
  fallback: Invoice;
  noun: string;
  canOpenVyapar: boolean;
  onClose: () => void;
  /** After an edit saved from here — the list reloads its row. */
  onSaved?: () => void;
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
  // The PO's approval ladder, as on Onsite's PO screen: who raised it, each level's decision, and
  // Recall for the person who raised it.
  const approvalType = DOC_APPROVAL_TYPE[doc.docType] ?? null;
  const { states: approvals, reload: reloadApproval } = useApprovalStates(approvalType, [documentId]);
  const approval = approvals[documentId] ?? null;
  const [pdfBusy, setPdfBusy] = useState(false);

  /**
   * Edit right here instead of "Edit in Vyapar" (client: a buyer shouldn't need Vyapar access).
   * The same Vyapar form opens, fed with Procurement's vendor list, and saves through Procurement's
   * own endpoint. Returns stay read-only — they belong to the books.
   */
  const can = useCan();
  const editable =
    (doc.docType === "PURCHASE_ORDER" || doc.docType === "PURCHASE") &&
    can(["PROCUREMENT_PURCHASES:EDIT", doc.docType === "PURCHASE_ORDER" ? "VYAPAR_PURCHASE_ORDER:EDIT" : "VYAPAR_PURCHASE_BILL:EDIT"]);
  const [editing, setEditing] = useState<{ parties: Party[]; items: Item[] } | null>(null);
  const [editLoading, setEditLoading] = useState(false);
  const [editError, setEditError] = useState("");
  async function startEdit() {
    setEditLoading(true);
    setEditError("");
    try {
      const [parties, items] = await Promise.all([getVendors(), getItems()]);
      setEditing({ parties, items });
    } catch (e) {
      setEditError(e instanceof Error ? e.message : "Couldn't open the editor.");
    } finally {
      setEditLoading(false);
    }
  }

  if (editing) {
    return (
      <InvoiceBuilder
        docType={doc.docType}
        existing={doc}
        parties={editing.parties}
        items={editing.items}
        saveExisting={updatePurchaseDocument}
        onClose={() => setEditing(null)}
        onSaved={() => {
          setEditing(null);
          setLoading(true);
          getPurchaseDocument(documentId)
            .then(setDoc)
            .catch(() => {})
            .finally(() => setLoading(false));
          onSaved?.();
        }}
      />
    );
  }

  async function downloadPdf() {
    setPdfBusy(true);
    try {
      // The vendor's GSTIN and address belong on the order; the procurement endpoint serves them
      // to buyers who can't open Vyapar's party screen.
      const party = doc.partyId ? await getVendor(doc.partyId).catch(() => null) : null;
      await downloadInvoicePdf(doc, party);
    } catch (e) {
      alert(e instanceof Error ? e.message : "Couldn't build the PDF.");
    } finally {
      setPdfBusy(false);
    }
  }

  return (
    <Drawer
      title={`${noun} ${doc.invoiceNo ?? ""}`.trim()}
      onClose={onClose}
      width="max-w-3xl"
      guardOnClose={false}
      footer={
        <div className="flex w-full flex-wrap items-center justify-between gap-2">
          {editable ? (
            <button
              onClick={() => void startEdit()}
              disabled={editLoading || loading}
              className="flex items-center gap-1.5 rounded-lg bg-brand-accent px-4 py-2 text-sm font-medium text-white transition-all hover:opacity-90 active:scale-95 disabled:opacity-60"
            >
              {editLoading ? <Spinner size={13} className="text-white" /> : <Pencil size={13} />} Edit {noun}
            </button>
          ) : (
            <span className="text-xs text-gray-400">
              {doc.docType === "PURCHASE_RETURN" ? "Debit notes are edited in Vyapar." : "Your role can view this but not edit it."}
            </span>
          )}
          {editError && <span className="text-xs text-rose-600">{editError}</span>}
          {canOpenVyapar && (
            <Link
              href={`/vyapar/${doc.docType === "PURCHASE_ORDER" ? "purchase-order" : doc.docType === "PURCHASE_RETURN" ? "purchase-return" : "purchase"}?open=${doc.id}`}
              className="flex items-center gap-1.5 text-xs text-gray-500 hover:text-brand-accent hover:underline"
            >
              Open in Vyapar <ExternalLink size={12} />
            </Link>
          )}
        </div>
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
          <div className="flex shrink-0 items-center gap-2">
            <button
              onClick={() => void downloadPdf()}
              disabled={pdfBusy || loading}
              className="flex items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-2.5 py-1 text-xs font-medium text-gray-600 transition-colors hover:border-brand-accent hover:text-brand-accent disabled:opacity-50"
              title="Download in the design set under Templates"
            >
              <Download size={13} /> {pdfBusy ? "Preparing…" : "PDF"}
            </button>
            <span
              className={`rounded-full px-2 py-0.5 text-[11px] font-medium ring-1 ring-inset ${
                DOC_STATUS_CLS[doc.status ?? ""] ?? DOC_STATUS_CLS.Unpaid
              }`}
            >
              {doc.status ?? "—"}
            </span>
          </div>
        </div>

        {approvalType && approval && (
          <ApprovalPanel
            entityType={approvalType}
            entityId={documentId}
            state={approval}
            onChanged={reloadApproval}
            allowRecall
            rejectHint="Rejecting cancels this document; it can be reopened after it's fixed."
          />
        )}

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

        {/*
          These are rows in the shared file registry, so a document attached to a purchase order
          here also appears in its project's Files tab under "Purchase Orders & RFQs" — the same
          row, read twice, not copied. `legacy` covers documents saved as a base64 data URL before
          the registry existed.
        */}
        <ModuleAttachments
          module="PROCUREMENT"
          type={doc.docType}
          sourceId={doc.id}
          projectId={doc.projectId ?? null}
          label={`${doc.docType.replace(/_/g, " ")} ${doc.invoiceNo}`.trim()}
          party={doc.partyName ?? undefined}
          legacy={
            doc.documentDataUrl
              ? [{ name: doc.documentName || "Attached document", dataUrl: doc.documentDataUrl }]
              : []
          }
        />
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
