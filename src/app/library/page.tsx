"use client";

import { useState } from "react";
import { AppShell } from "@/components/AppShell";
import { Select } from "@/components/Select";
import { MasterLibrary } from "@/components/library/MasterLibrary";
import { MaterialCategoryLibrary } from "@/components/library/MaterialCategoryLibrary";
import { MaterialLibrary } from "@/components/library/MaterialLibrary";
import { PartyLibrary } from "@/components/library/PartyLibrary";
import { MASTER_LIBRARIES, type MasterLibraryId } from "@/lib/masterLibraries";

/**
 * Library — the hub for shared master data, with the sub-library picked from the dropdown at the top.
 *
 * Three kinds sit behind that one dropdown:
 *  - "party" and "material" read records that already exist elsewhere (members + Vyapar parties,
 *    Vyapar items) rather than keeping a second copy;
 *  - "material-category" edits the category master the Vyapar item form shares;
 *  - everything else is schema-driven — see lib/masterLibraries.ts.
 */
type LibKey = MasterLibraryId | "party" | "material" | "material-category";

/** Dropdown order follows the reference list, not the code's grouping. */
const OPTIONS: { value: LibKey; label: string }[] = [
  { value: "asset-type", label: "Asset Type Library" },
  { value: "cost-code", label: "Cost Code Library" },
  { value: "deduction", label: "Deduction Library" },
  { value: "material-category", label: "Material Category Library" },
  { value: "material", label: "Material Library" },
  { value: "party", label: "Party Library" },
  { value: "progress", label: "Progress Library" },
  { value: "rate", label: "Rate Library" },
  { value: "subcontractor-rate", label: "Subcontractor Rate Library" },
  { value: "retention", label: "Retention Library" },
  { value: "todo", label: "Todo Library" },
  { value: "workforce", label: "Workforce Library" },
];

export default function LibraryPage() {
  const [lib, setLib] = useState<LibKey>("party");

  return (
    <AppShell title="Library">
      <div className="space-y-4">
        <Select
          value={lib}
          onChange={(v) => setLib(v as LibKey)}
          className="w-full sm:w-72"
          options={OPTIONS}
        />

        {lib === "party" ? (
          <PartyLibrary />
        ) : lib === "material" ? (
          <MaterialLibrary />
        ) : lib === "material-category" ? (
          <MaterialCategoryLibrary />
        ) : (
          <MasterLibrary key={lib} spec={MASTER_LIBRARIES[lib]} />
        )}
      </div>
    </AppShell>
  );
}
