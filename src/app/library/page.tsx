"use client";

import { useState } from "react";
import { AppShell } from "@/components/AppShell";
import { Select } from "@/components/Select";
import { PartyLibrary } from "@/components/library/PartyLibrary";

/**
 * Library — the hub for shared master data. The sub-library is picked from the dropdown at the top;
 * Party Library is the only one built so far.
 *
 * The earlier seeded placeholders (Asset Type, Cost Code, Deduction, Material Category, Material,
 * Progress, Rate, Retention, Todo, Workforce) were static demo tables and have been removed — add
 * each back to LIBRARIES as it gets a real implementation.
 */
const LIBRARIES = ["Party Library"] as const;
type Lib = (typeof LIBRARIES)[number];

export default function LibraryPage() {
  const [lib, setLib] = useState<Lib>("Party Library");

  return (
    <AppShell title="Library">
      <div className="space-y-4">
        <Select
          value={lib}
          onChange={(v) => setLib(v as Lib)}
          className="w-full sm:w-64"
          options={LIBRARIES.map((l) => ({ value: l, label: l }))}
        />

        {lib === "Party Library" && <PartyLibrary />}
      </div>
    </AppShell>
  );
}
