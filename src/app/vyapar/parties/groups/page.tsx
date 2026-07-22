"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { VyaparShell, VyaparEmpty } from "@/components/vyapar/VyaparShell";
import { Spinner } from "@/components/Spinner";
import { inr } from "@/lib/format";
import { exportRowsToCsv, printRows, downloadPdf } from "@/lib/vyaparExport";
import * as vyapar from "@/lib/vyaparApi";
import type { Party } from "@/lib/vyaparApi";
import { usePartySettings } from "@/lib/usePartySettings";
import { useVyaparBankId } from "@/lib/bankScope";
import { FileSpreadsheet, FileText, Layers, Printer, Settings } from "lucide-react";

/**
 * Party Groups — rolls the party list up by its group so you can see which segment owes what.
 * Only meaningful once "Party Grouping" is enabled in Party Settings.
 */
export default function PartyGroupsPage() {
  const { settings } = usePartySettings();
  const [parties, setParties] = useState<Party[]>([]);
  const [loading, setLoading] = useState(true);
  const bankAccountId = useVyaparBankId();

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setParties(await vyapar.getParties(undefined, bankAccountId));
    } finally {
      setLoading(false);
    }
  }, [bankAccountId]);

  useEffect(() => {
    load();
  }, [load]);

  const groups = useMemo(() => {
    const map = new Map<string, Party[]>();
    for (const p of parties) {
      const key = p.partyGroup?.trim() || "Ungrouped";
      map.set(key, [...(map.get(key) ?? []), p]);
    }
    return [...map.entries()]
      .map(([name, members]) => ({
        name,
        members,
        receivable: members.filter((m) => m.balance > 0).reduce((s, m) => s + m.balance, 0),
        payable: members.filter((m) => m.balance < 0).reduce((s, m) => s + Math.abs(m.balance), 0),
      }))
      .sort((a, b) => b.members.length - a.members.length);
  }, [parties]);

  const head = ["Group", "Parties", "To Collect", "To Pay"];
  const rows = groups.map((g) => [g.name, g.members.length, g.receivable, g.payable]);

  return (
    <VyaparShell>
      <div className="animate-fade-in space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h2 className="text-base font-semibold text-gray-800">Party Groups</h2>
            <p className="mt-0.5 text-sm text-gray-500">{groups.length} groups across {parties.length} parties.</p>
          </div>
          <div className="flex gap-2">
            <button
              onClick={() => exportRowsToCsv("party-groups", head, rows)}
              className="flex items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-600 transition-all duration-150 hover:bg-gray-50 active:scale-95"
            >
              <FileSpreadsheet size={14} /> Export
            </button>
            <button
              onClick={() =>
                printRows("Party Groups", head, groups.map((g) => [g.name, g.members.length, inr(g.receivable), inr(g.payable)]))
              }
              className="flex items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-600 transition-all duration-150 hover:bg-gray-50 active:scale-95"
            >
              <Printer size={14} /> Print
            </button>
            <button
              onClick={() =>
                downloadPdf("Party Groups", head, groups.map((g) => [g.name, g.members.length, inr(g.receivable), inr(g.payable)]), { rightAlignFrom: 2 })
              }
              className="flex items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-600 transition-all duration-150 hover:bg-gray-50 active:scale-95"
            >
              <FileText size={14} /> PDF
            </button>
          </div>
        </div>

        {!settings.partyGrouping && (
          <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-amber-200 bg-amber-50 px-4 py-2.5 text-sm text-amber-800">
            <span>Party Grouping is off, so every party shows as “Ungrouped”.</span>
            <Link
              href="/vyapar/parties/settings"
              className="flex items-center gap-1 font-medium text-amber-900 underline-offset-2 hover:underline"
            >
              <Settings size={13} /> Turn it on
            </Link>
          </div>
        )}

        {loading ? (
          <div className="flex min-h-[240px] items-center justify-center gap-2 rounded-xl border border-dashed border-gray-300 bg-white text-sm text-gray-400">
            <Spinner size={16} className="text-brand-accent" /> Loading…
          </div>
        ) : groups.length === 0 ? (
          <VyaparEmpty icon={Layers} title="No parties yet" hint="Add parties first, then group them." />
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {groups.map((g) => (
              <div key={g.name} className="rounded-xl border border-gray-200 bg-white p-4 transition-shadow duration-150 hover:shadow-md">
                <div className="flex items-center justify-between">
                  <h3 className="truncate text-sm font-semibold text-gray-800">{g.name}</h3>
                  <span className="rounded-full bg-gray-100 px-2 py-0.5 text-[11px] font-medium text-gray-500">
                    {g.members.length}
                  </span>
                </div>
                <div className="mt-3 grid grid-cols-2 gap-2 text-sm">
                  <div>
                    <div className="text-[11px] tracking-wide text-gray-400 uppercase">To Collect</div>
                    <div className="font-medium text-emerald-600">{inr(g.receivable)}</div>
                  </div>
                  <div>
                    <div className="text-[11px] tracking-wide text-gray-400 uppercase">To Pay</div>
                    <div className="font-medium text-rose-600">{inr(g.payable)}</div>
                  </div>
                </div>
                <div className="mt-3 border-t border-gray-100 pt-2 text-xs text-gray-500">
                  {g.members.slice(0, 3).map((m) => m.name).join(", ")}
                  {g.members.length > 3 && ` +${g.members.length - 3} more`}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </VyaparShell>
  );
}
