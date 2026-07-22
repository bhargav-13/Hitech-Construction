"use client";

import { VyaparShell } from "@/components/vyapar/VyaparShell";
import { InvoiceWorkspace } from "@/components/vyapar/InvoiceWorkspace";

export default function Page() {
  return (
    <VyaparShell>
      <InvoiceWorkspace docType="SALE_RETURN" title="Sale Return / Credit Note" accent="rose" />
    </VyaparShell>
  );
}
