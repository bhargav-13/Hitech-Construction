"use client";

import { Boxes, ShieldCheck, Users } from "lucide-react";
import { ProcurementShell, ProcurementHeader } from "@/components/procurement/ProcurementShell";
import { APPROVAL_RULES } from "@/lib/procurementTypes";
import { formatRupee } from "@/lib/projectHelpers";

export default function ProcurementSettingsPage() {
  return (
    <ProcurementShell>
      <ProcurementHeader title="Settings" subtitle="How approvals route, and where shared data comes from." />

      <div className="space-y-4">
        {/* Approval thresholds */}
        <section className="rounded-xl border border-gray-200 bg-white p-4">
          <h2 className="flex items-center gap-1.5 text-sm font-semibold text-gray-700">
            <ShieldCheck size={14} className="text-gray-400" /> Approval thresholds
          </h2>
          <p className="mt-0.5 text-xs text-gray-400">A purchase order routes to the first approver whose limit it fits within.</p>

          <div className="mt-3 overflow-x-auto">
            <table className="w-full min-w-[420px] border-collapse text-sm">
              <thead>
                <tr className="border-b border-gray-100 text-left text-gray-500">
                  <th className="py-2 pr-2 font-medium">Order value</th>
                  <th className="py-2 pl-2 font-medium">Approver</th>
                </tr>
              </thead>
              <tbody>
                {APPROVAL_RULES.map((r, i) => {
                  const prev = i === 0 ? 0 : APPROVAL_RULES[i - 1].upto ?? 0;
                  const range = r.upto === null ? `Above ${formatRupee(prev)}` : `${formatRupee(prev)} – ${formatRupee(r.upto)}`;
                  return (
                    <tr key={r.approver} className="border-b border-gray-50 last:border-b-0">
                      <td className="py-2.5 pr-2 tabular-nums text-gray-700">{range}</td>
                      <td className="py-2.5 pl-2">
                        <span className="inline-flex items-center gap-1.5 rounded-full bg-gray-50 px-2.5 py-1 text-xs font-medium text-gray-700">
                          <Users size={12} className="text-gray-400" /> {r.approver}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>

        {/* Shared data sources */}
        <section className="rounded-xl border border-gray-200 bg-white p-4">
          <h2 className="flex items-center gap-1.5 text-sm font-semibold text-gray-700">
            <Boxes size={14} className="text-gray-400" /> Shared data
          </h2>
          <p className="mt-0.5 text-xs text-gray-400">Procurement doesn't keep its own copies — it references what the rest of the ERP already owns.</p>

          <ul className="mt-3 divide-y divide-gray-50 text-sm">
            <SourceRow label="Vendors" source="Vyapar parties (supplier type)" />
            <SourceRow label="Items & rates" source="Shared item catalogue" />
            <SourceRow label="Projects & sites" source="Project module" />
            <SourceRow label="Purchase bills & payments" source="Vyapar" />
            <SourceRow label="Stock & receipts" source="Warehouse" />
          </ul>
        </section>

        <p className="text-xs text-gray-400">
          This is a seeded demo — settings are illustrative and not yet editable.
        </p>
      </div>
    </ProcurementShell>
  );
}

function SourceRow({ label, source }: { label: string; source: string }) {
  return (
    <li className="flex items-center justify-between gap-3 py-2.5">
      <span className="text-gray-700">{label}</span>
      <span className="text-xs text-gray-500">{source}</span>
    </li>
  );
}
