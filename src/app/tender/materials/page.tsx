"use client";

import { useMemo, useState } from "react";
import { TenderShell, TenderEmpty } from "@/components/tender/TenderShell";
import { SortTh } from "@/components/vyapar/SortTh";
import { ImportDialog } from "@/components/vyapar/ImportDialog";
import { materialImportConfig } from "@/lib/tenderImportConfigs";
import { exportRowsToCsv } from "@/lib/vyaparExport";
import { useTableSort } from "@/lib/useTableSort";
import { useTenderStore } from "@/lib/tenderStore";
import { tval } from "@/lib/tenderHelpers";
import type { MaterialParty } from "@/lib/tenderTypes";
import { Boxes, Download, Mail, Search, Upload } from "lucide-react";

export default function TenderMaterialsPage() {
  const materials = useTenderStore((s) => s.materials);
  const addMaterial = useTenderStore((s) => s.addMaterial);
  const [search, setSearch] = useState("");
  const [importing, setImporting] = useState(false);
  const importConfig = useMemo(() => materialImportConfig(addMaterial), [addMaterial]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return materials;
    return materials.filter((m) =>
      [m.party, m.manufacturerType, m.make, m.location, m.contact, m.email]
        .some((v) => (v ?? "").toLowerCase().includes(q)),
    );
  }, [materials, search]);

  const { sorted, sortKey, sortDir, toggle } = useTableSort<MaterialParty>(
    filtered,
    {
      party: (m) => m.party,
      manufacturerType: (m) => m.manufacturerType,
      make: (m) => m.make,
      location: (m) => m.location,
    },
    { key: "party", dir: "asc" },
  );

  return (
    <TenderShell>
      <div className="space-y-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-lg font-semibold text-gray-800">Material Party Directory</h1>
            <p className="text-sm text-gray-500">Suppliers and manufacturers for tender material sourcing.</p>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setImporting(true)}
              className="flex items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm font-medium text-gray-600 transition-colors duration-150 hover:bg-gray-50"
            >
              <Upload size={14} /> Import
            </button>
            <button
              onClick={() =>
                exportRowsToCsv(
                  "tender-material-parties",
                  ["Party", "Material / Type", "Make", "Location", "Contact", "Email"],
                  sorted.map((m) => [m.party, m.manufacturerType, m.make, m.location, m.contact, m.email]),
                )
              }
              className="flex items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm font-medium text-gray-600 transition-colors duration-150 hover:bg-gray-50"
            >
              <Download size={14} /> Export
            </button>
            <div className="text-sm text-gray-500">{filtered.length} parties</div>
          </div>
        </div>

        <div className="flex items-center gap-2 rounded-lg border border-gray-200 bg-white px-3 py-2 transition-colors duration-150 focus-within:border-cyan-500">
          <Search size={15} className="text-gray-400" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search party, material type, make or location"
            className="w-full bg-transparent text-sm outline-none"
          />
        </div>

        {filtered.length === 0 ? (
          <TenderEmpty icon={Boxes} title="No parties found" hint="Try a different search." />
        ) : (
          <div className="overflow-x-auto rounded-xl border border-gray-200 bg-white">
            <table className="w-full min-w-[840px] border-collapse text-sm">
              <thead>
                <tr className="border-b border-gray-100 bg-gray-50 text-left text-gray-500">
                  <SortTh label="Party" sortKey="party" activeKey={sortKey} dir={sortDir} onSort={toggle} />
                  <SortTh label="Material / Type" sortKey="manufacturerType" activeKey={sortKey} dir={sortDir} onSort={toggle} />
                  <SortTh label="Make" sortKey="make" activeKey={sortKey} dir={sortDir} onSort={toggle} />
                  <SortTh label="Location" sortKey="location" activeKey={sortKey} dir={sortDir} onSort={toggle} />
                  <th className="px-4 py-2 font-medium text-gray-500">Contact</th>
                  <th className="px-4 py-2 font-medium text-gray-500">Email</th>
                </tr>
              </thead>
              <tbody>
                {sorted.map((m) => (
                  <tr key={m.id} className="border-b border-gray-50 transition-colors duration-150 last:border-b-0 even:bg-gray-50/40 hover:bg-cyan-50/40">
                    <td className="px-4 py-2.5 font-medium text-gray-700">{tval(m.party)}</td>
                    <td className="px-4 py-2.5 text-gray-600">{tval(m.manufacturerType)}</td>
                    <td className="px-4 py-2.5 text-gray-600">{tval(m.make)}</td>
                    <td className="px-4 py-2.5 text-gray-600">{tval(m.location)}</td>
                    <td className="px-4 py-2.5 whitespace-pre-wrap text-gray-600">{tval(m.contact)}</td>
                    <td className="px-4 py-2.5 text-gray-600">
                      {m.email ? (
                        <a href={`mailto:${m.email}`} className="inline-flex items-center gap-1 text-brand-accent hover:underline">
                          <Mail size={12} /> {m.email}
                        </a>
                      ) : (
                        "—"
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
      {importing && <ImportDialog config={importConfig} onClose={() => setImporting(false)} onImported={() => setImporting(false)} />}
    </TenderShell>
  );
}
