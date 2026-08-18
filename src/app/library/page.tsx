"use client";

import { useState } from "react";
import { AppShell } from "@/components/AppShell";
import { Select } from "@/components/Select";
import { MaterialCategoryLibrary } from "@/components/library/MaterialCategoryLibrary";
import { MaterialLibrary } from "@/components/library/MaterialLibrary";
import { PartyLibrary } from "@/components/library/PartyLibrary";

/**
 * Library — the hub for shared master data, with the sub-library picked from the dropdown at the top.
 *
 * Only libraries backed by real records are listed. There were nine more (cost codes, rates,
 * retention policies and so on) built as schema-driven tables over browser storage; they looked
 * finished but held seeded sample rows that lived on one machine and were never on the server, so
 * they have been removed rather than left to be mistaken for real data. They come back when they
 * have tables behind them.
 *
 * What remains reads records that already exist elsewhere instead of keeping a second copy:
 * parties from Members and Vyapar, materials from the Vyapar item catalogue, and the material
 * categories the Vyapar item form itself offers.
 */
type LibKey = "party" | "material" | "material-category";

const OPTIONS: { value: LibKey; label: string }[] = [
  { value: "party", label: "Party Library" },
  { value: "material", label: "Material Library" },
  { value: "material-category", label: "Material Category Library" },
];

export default function LibraryPage() {
  const [lib, setLib] = useState<LibKey>("party");

  return (
    <AppShell title="Library">
      <div className="space-y-4">
        <Select value={lib} onChange={(v) => setLib(v as LibKey)} className="w-full sm:w-72" options={OPTIONS} />

        {lib === "party" ? (
          <PartyLibrary />
        ) : lib === "material" ? (
          <MaterialLibrary />
        ) : (
          <MaterialCategoryLibrary />
        )}
      </div>
    </AppShell>
  );
}
