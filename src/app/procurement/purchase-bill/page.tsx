"use client";

import { useCallback, useEffect, useState } from "react";
import { Truck } from "lucide-react";
import { ProcurementShell, ProcurementHeader } from "@/components/procurement/ProcurementShell";
import { PurchaseDocumentList } from "@/components/procurement/PurchaseDocumentList";
import { BadgeButton } from "@/components/procurement/PoTrackingPanels";
import { UnbilledMaterialDrawer, countUnbilled } from "@/components/material/UnbilledMaterialDrawer";
import { usePurchaseBills } from "@/lib/purchaseApi";

/**
 * Purchase Bills — what suppliers actually invoiced, readable without Vyapar access.
 * Same reasoning as the Purchase Orders screen beside it.
 *
 * <p>Unbilled material (client 2026-11-23): every site's deliveries that no bill covers yet, so
 * accounts can bill them from here as well as from each project's Transaction tab.
 */
export default function ProcurementPurchaseBillsPage() {
  const { rows, loading, error, refresh } = usePurchaseBills();
  const [open, setOpen] = useState(false);
  const [count, setCount] = useState(0);
  const refreshCount = useCallback(() => {
    void countUnbilled(null).then(setCount);
  }, []);
  useEffect(() => {
    refreshCount();
  }, [refreshCount]);

  return (
    <ProcurementShell>
      <ProcurementHeader
        title="Purchase Bills"
        subtitle="What was invoiced against your orders, and how much of it is still outstanding."
        right={<BadgeButton icon={<Truck size={15} />} label="Unbilled material" count={count} onClick={() => setOpen(true)} />}
      />
      <PurchaseDocumentList
        rows={rows}
        loading={loading}
        error={error}
        noun="purchase bill"
        emptyHint="Bills appear here as suppliers invoice against their orders."
        onChanged={refresh}
        vyaparHref="/vyapar/purchase"
      />
      {open && (
        <UnbilledMaterialDrawer
          onClose={() => {
            setOpen(false);
            refreshCount();
          }}
          onBilled={() => {
            refresh();
            refreshCount();
          }}
        />
      )}
    </ProcurementShell>
  );
}
