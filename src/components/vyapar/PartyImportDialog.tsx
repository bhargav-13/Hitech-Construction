"use client";

import { ImportDialog } from "./ImportDialog";
import { partyImportConfig } from "@/lib/vyaparImportConfigs";

/**
 * Import parties from an Excel/CSV sheet with auto-detected column mapping and a preview before
 * committing. Thin wrapper over the shared {@link ImportDialog}.
 */
export function PartyImportDialog({ onClose, onImported }: { onClose: () => void; onImported: () => void }) {
  return <ImportDialog config={partyImportConfig} onClose={onClose} onImported={onImported} />;
}
