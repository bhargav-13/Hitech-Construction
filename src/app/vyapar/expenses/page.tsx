"use client";

import { VyaparShell } from "@/components/vyapar/VyaparShell";
import { ExpenseWorkspace } from "@/components/vyapar/ExpenseWorkspace";

export default function Page() {
  return (
    <VyaparShell>
      <ExpenseWorkspace />
    </VyaparShell>
  );
}
