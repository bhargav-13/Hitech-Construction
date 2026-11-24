"use client";

import { useState } from "react";
import { Plus } from "lucide-react";
import { ProcurementShell, ProcurementHeader } from "@/components/procurement/ProcurementShell";
import { PurchaseDocumentList } from "@/components/procurement/PurchaseDocumentList";
import { createPurchaseOrder, getVendors, usePurchaseOrders } from "@/lib/purchaseApi";
import { PoTrackingButtons } from "@/components/procurement/PoTrackingPanels";
import { InvoiceBuilder } from "@/components/vyapar/InvoiceBuilder";
import { getItems, type Item, type Party } from "@/lib/vyaparApi";
import { useCan } from "@/lib/permissions";

/**
 * Purchase Orders, inside Procurement.
 *
 * <p>The rail used to link straight to Vyapar's PO screen. That is the right screen for anyone who
 * can open it — and a dead end for a buyer holding only PROCUREMENT:*, which is most of the people
 * who raise these orders. This reads the same records through Procurement's own endpoint, so the
 * orders are visible to the module that produced them.
 *
 * <p>+ Create PO (client, 2026-11-23: "add PO button in procurement, not only in Vyapar") raises an
 * order here through Procurement's own endpoint, with Onsite's Save as Draft / Save (= publish for
 * approval). It is only receivable once approved.
 */
export default function ProcurementPurchaseOrdersPage() {
  const { rows, loading, error, refresh } = usePurchaseOrders();
  const can = useCan();
  const canCreate = can(["PROCUREMENT_PURCHASES:CREATE", "VYAPAR_PURCHASE_ORDER:CREATE"]);
  const [form, setForm] = useState<{ parties: Party[]; items: Item[] } | null>(null);
  const [opening, setOpening] = useState(false);
  const [openError, setOpenError] = useState("");

  async function openForm() {
    setOpening(true);
    setOpenError("");
    try {
      const [parties, items] = await Promise.all([getVendors(), getItems()]);
      setForm({ parties, items });
    } catch (e) {
      setOpenError(e instanceof Error ? e.message : "Couldn't open the purchase order form.");
    } finally {
      setOpening(false);
    }
  }

  return (
    <ProcurementShell>
      <ProcurementHeader
        title="Purchase Orders"
        subtitle="Orders raised on suppliers. Click a row for its lines, amounts and payment status."
        right={
          <div className="flex flex-wrap items-center gap-2">
            <PoTrackingButtons />
            {canCreate && (
              <button
                onClick={() => void openForm()}
                disabled={opening}
                className="flex items-center gap-1.5 rounded-lg bg-brand-accent px-3 py-2 text-sm font-medium text-white shadow-sm transition-all hover:opacity-90 active:scale-95 disabled:opacity-60"
              >
                <Plus size={15} /> {opening ? "Opening…" : "Create PO"}
              </button>
            )}
          </div>
        }
      />
      {openError && <p className="mb-3 rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700">{openError}</p>}
      <PurchaseDocumentList
        rows={rows}
        loading={loading}
        error={error}
        noun="purchase order"
        emptyHint="Orders appear here once one is created here, raised from a comparison or from material requests."
        onChanged={refresh}
        vyaparHref="/vyapar/purchase-order"
      />
      {form && (
        <InvoiceBuilder
          docType="PURCHASE_ORDER"
          parties={form.parties}
          items={form.items}
          // Stamped as Procurement's own, so it shows under the list's default "from procurement" view.
          createNew={(body, opts) => createPurchaseOrder({ ...body, sourceModule: body.sourceModule ?? "PROCUREMENT" }, opts)}
          onClose={() => setForm(null)}
          onPartyCreated={(p) => setForm((f) => (f ? { ...f, parties: [p, ...f.parties] } : f))}
          onItemCreated={(i) => setForm((f) => (f ? { ...f, items: [i, ...f.items] } : f))}
          onSaved={(again) => {
            if (!again) setForm(null);
            refresh();
          }}
        />
      )}
    </ProcurementShell>
  );
}
