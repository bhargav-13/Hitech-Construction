"use client";

import { ImportDialog } from "./ImportDialog";
import { itemImportConfig } from "@/lib/vyaparImportConfigs";

/** Import items from a CSV with auto-detected column mapping and a preview before committing. */
export function ItemImportDialog({ onClose, onImported }: { onClose: () => void; onImported: () => void }) {
  return <ImportDialog config={itemImportConfig} onClose={onClose} onImported={onImported} />;
}
