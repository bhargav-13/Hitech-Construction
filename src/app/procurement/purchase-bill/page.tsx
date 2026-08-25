"use client";

import { ProcurementShell, ProcurementHeader } from "@/components/procurement/ProcurementShell";
import { PurchaseDocumentList } from "@/components/procurement/PurchaseDocumentList";
import { usePurchaseBills } from "@/lib/purchaseApi";

/**
 * Purchase Bills — what suppliers actually invoiced, readable without Vyapar access.
 * Same reasoning as the Purchase Orders screen beside it.
 */
export default function ProcurementPurchaseBillsPage() {
  const { rows, loading, error } = usePurchaseBills();

  return (
    <ProcurementShell>
      <ProcurementHeader
        title="Purchase Bills"
        subtitle="What was invoiced against your orders, and how much of it is still outstanding."
      />
      <PurchaseDocumentList
        rows={rows}
        loading={loading}
        error={error}
        noun="purchase bill"
        emptyHint="Bills appear here as suppliers invoice against their orders."
        vyaparHref="/vyapar/purchase"
      />
    </ProcurementShell>
  );
}
