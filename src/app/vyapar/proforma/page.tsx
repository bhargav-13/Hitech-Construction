"use client";

import { VyaparShell } from "@/components/vyapar/VyaparShell";
import { InvoiceWorkspace } from "@/components/vyapar/InvoiceWorkspace";

export default function Page() {
  return (
    <VyaparShell>
      <InvoiceWorkspace docType="PROFORMA" title="Proforma Invoices" accent="rose" />
    </VyaparShell>
  );
}
