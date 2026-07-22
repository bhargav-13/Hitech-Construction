"use client";

import { VyaparShell } from "@/components/vyapar/VyaparShell";
import { InvoiceWorkspace } from "@/components/vyapar/InvoiceWorkspace";

export default function Page() {
  return (
    <VyaparShell>
      <InvoiceWorkspace docType="PURCHASE_ORDER" title="Purchase Orders" accent="brand" />
    </VyaparShell>
  );
}
