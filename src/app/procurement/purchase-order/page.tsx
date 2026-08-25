"use client";

import { ProcurementShell, ProcurementHeader } from "@/components/procurement/ProcurementShell";
import { PurchaseDocumentList } from "@/components/procurement/PurchaseDocumentList";
import { usePurchaseOrders } from "@/lib/purchaseApi";

/**
 * Purchase Orders, inside Procurement.
 *
 * <p>The rail used to link straight to Vyapar's PO screen. That is the right screen for anyone who
 * can open it — and a dead end for a buyer holding only PROCUREMENT:*, which is most of the people
 * who raise these orders. This reads the same records through Procurement's own endpoint, so the
 * orders are visible to the module that produced them; editing still belongs in Vyapar, and the
 * link to it is shown only to people who can actually get in.
 */
export default function ProcurementPurchaseOrdersPage() {
  const { rows, loading, error } = usePurchaseOrders();

  return (
    <ProcurementShell>
      <ProcurementHeader
        title="Purchase Orders"
        subtitle="Orders raised on suppliers. Click a row for its lines, amounts and payment status."
      />
      <PurchaseDocumentList
        rows={rows}
        loading={loading}
        error={error}
        noun="purchase order"
        emptyHint="Orders appear here once a comparison is awarded and a PO is raised."
        vyaparHref="/vyapar/purchase-order"
      />
    </ProcurementShell>
  );
}
