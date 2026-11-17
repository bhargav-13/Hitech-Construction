"use client";

import { useState } from "react";
import { Download } from "lucide-react";
import { renderDocPdf } from "@/lib/docPdf";
import { rfqPrintModel, subconBillPrintModel, workOrderPrintModel, type PlaceInfo } from "@/lib/docModels";
import { getTemplate } from "@/lib/docTemplates";
import { getVendor } from "@/lib/purchaseApi";
import type { Rfq } from "@/lib/procurementApi";
import type { SubconBill, WorkOrder } from "@/lib/workOrderApi";

/**
 * "PDF" button for a designed document. The look comes from Templates; `build` only gathers the
 * data and renders. Shows its own busy state so a slow letterhead fetch doesn't read as a dead click.
 */
export function PdfButton({
  build,
  label = "PDF",
  size = "md",
  title = "Download in the design set under Templates",
}: {
  build: () => Promise<void>;
  label?: string;
  size?: "sm" | "md";
  title?: string;
}) {
  const [busy, setBusy] = useState(false);
  async function run(e: React.MouseEvent) {
    e.stopPropagation();
    setBusy(true);
    try {
      await build();
    } catch (err) {
      alert(err instanceof Error ? err.message : "Couldn't build the PDF.");
    } finally {
      setBusy(false);
    }
  }
  const cls =
    size === "sm"
      ? "px-3 py-1.5 text-xs font-medium"
      : "px-3 py-2 text-sm";
  return (
    <button
      type="button"
      onClick={run}
      disabled={busy}
      title={title}
      className={`flex items-center gap-1.5 rounded-lg border border-gray-200 bg-white text-gray-600 transition-colors duration-150 hover:border-brand-accent hover:text-brand-accent disabled:opacity-50 ${cls}`}
    >
      <Download size={size === "sm" ? 13 : 14} /> {busy ? "Preparing…" : label}
    </button>
  );
}

/** Download an RFQ as suppliers see it (Onsite's RFQ layout by default). */
export async function downloadRfqPdf(rfq: Rfq, project?: PlaceInfo | null) {
  await renderDocPdf(rfqPrintModel(rfq, project), { save: true });
}

/** Download a work order, with the subcontractor's GSTIN / address from the vendor record. */
export async function downloadWorkOrderPdf(w: WorkOrder, project?: PlaceInfo | null) {
  const party = await getVendor(w.vendorPartyId).catch(() => null);
  await renderDocPdf(workOrderPrintModel(w, { project, party }), { save: true });
}

/** KAN-99: one subcontractor bill, in the Work Order design, titled as a bill and without terms. */
export async function downloadSubconBillPdf(w: WorkOrder, bill: SubconBill, project?: PlaceInfo | null) {
  const [party, tpl] = await Promise.all([getVendor(w.vendorPartyId).catch(() => null), getTemplate("WORK_ORDER")]);
  await renderDocPdf(subconBillPrintModel(w, bill, { project, party }), {
    save: true,
    template: { ...tpl, title: "SUBCONTRACTOR BILL" },
  });
}
