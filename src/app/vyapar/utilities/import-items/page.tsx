"use client";

import { useState } from "react";
import { VyaparShell, VyaparEmpty } from "@/components/vyapar/VyaparShell";
import { ItemImportDialog } from "@/components/vyapar/ItemImportDialog";
import { useRouter } from "next/navigation";
import { FileSpreadsheet } from "lucide-react";

/** Utilities → Import Items. Vyapar offers barcode/Excel/library; we import from Excel (CSV). */
export default function ImportItemsPage() {
  const router = useRouter();
  const [open, setOpen] = useState(true);
  return (
    <VyaparShell>
      <VyaparEmpty
        icon={FileSpreadsheet}
        title="Import Items from Excel"
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
      {open && <ItemImportDialog onClose={() => setOpen(false)} onImported={() => router.push("/vyapar/items")} />}
    </VyaparShell>
  );
}
