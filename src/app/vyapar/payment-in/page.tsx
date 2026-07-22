"use client";

import { VyaparShell } from "@/components/vyapar/VyaparShell";
import { PaymentWorkspace } from "@/components/vyapar/PaymentWorkspace";

export default function Page() {
  return (
    <VyaparShell>
      <PaymentWorkspace direction="IN" title="Payment-In" />
    </VyaparShell>
  );
}
