"use client";

import { useState } from "react";
import { VyaparShell, VyaparEmpty } from "@/components/vyapar/VyaparShell";
import { PartyImportDialog } from "@/components/vyapar/PartyImportDialog";
import { useRouter } from "next/navigation";
import { Users } from "lucide-react";

/** Utilities → Import Parties from an Excel/CSV sheet. */
export default function ImportPartiesPage() {
  const router = useRouter();
  const [open, setOpen] = useState(true);
  return (
    <VyaparShell>
      <VyaparEmpty
        icon={Users}
        title="Import Parties from Excel"
        hint="Upload a CSV, map the columns, preview, then import."
        action={
          <button
            onClick={() => setOpen(true)}
            className="rounded-lg bg-brand-accent px-4 py-2 text-sm font-medium text-white transition-all duration-150 hover:opacity-90 active:scale-95"
          >
            Start import
          </button>
        }
      />
      {open && <PartyImportDialog onClose={() => setOpen(false)} onImported={() => router.push("/vyapar/parties")} />}
    </VyaparShell>
  );
}
