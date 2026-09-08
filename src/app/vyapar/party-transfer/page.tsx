"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { ArrowRight, ArrowRightLeft, Pencil, Plus, Trash2 } from "lucide-react";
import { VyaparShell } from "@/components/vyapar/VyaparShell";
import { PartyTransferDialog } from "@/components/vyapar/PartyTransferDialog";
import { Spinner } from "@/components/Spinner";
import { RowMenu, RowMenuDivider, RowMenuItem } from "@/components/RowMenu";
import { SortTh } from "@/components/vyapar/SortTh";
import { useTableSort } from "@/lib/useTableSort";
import { useVyaparProjectId } from "@/lib/projectScope";
import { inr } from "@/lib/format";
import * as vyapar from "@/lib/vyaparApi";
import { fullInvoiceNo } from "@/lib/vyaparApi";
import type { Invoice, Party } from "@/lib/vyaparApi";

/**
 * Party To Party Transfer — its own screen, not the shared document workspace.
 *
 * It used to render the invoice builder with the transfer's doc type on it, which produced a form
 * asking for items, tax and a received amount, and a document the backend had never heard of: it
 * was numbered like a sale, moved neither party's balance, and read as a sale in the books. That is
 * what the client meant by "party to party transfer not working, sale is creating in that only".
 *
 * A transfer is two parties and an amount. The list says so — from, to, how much — because that is
 * the whole document; there is nothing to drill into.
 */
export default function PartyTransferPage() {
  const projectId = useVyaparProjectId();
  const [rows, setRows] = useState<Invoice[]>([]);
  const [parties, setParties] = useState<Party[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<Invoice | null>(null);

  // No `setLoading(true)` up front: the first load starts in that state, and a reload after a save
  // or a project switch refreshes the table in place rather than flashing the loader over it.
  const load = useCallback(async () => {
    try {
      const [invoices, p] = await Promise.all([
        vyapar.getInvoices("PARTY_TRANSFER", projectId),
        vyapar.getParties(undefined, projectId),
      ]);
      setRows(invoices);
      setParties(p);
      setError("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't load transfers.");
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  useEffect(() => {
    load();
  }, [load]);

  const nameOf = useMemo(
    () => (id: number | null) => (id == null ? "—" : (parties.find((p) => p.id === id)?.name ?? "—")),
    [parties],
  );

  const { sorted, sortKey, sortDir, toggle } = useTableSort(rows, {
    date: (i) => i.invoiceDate ?? "",
    number: (i) => fullInvoiceNo(i),
    from: (i) => i.partyName ?? "",
    to: (i) => i.transferToPartyName ?? nameOf(i.transferToPartyId),
    amount: (i) => i.total,
  });

  const total = rows.filter((r) => !r.cancelled).reduce((a, r) => a + r.total, 0);

  async function remove(row: Invoice) {
    if (!confirm(`Delete transfer ${fullInvoiceNo(row)}? Both parties' balances go back to what they were.`)) return;
    try {
      await vyapar.deleteInvoice(row.id);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't delete this transfer.");
    }
  }

  return (
    <VyaparShell>
      <div className="space-y-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold text-gray-800">Party To Party Transfer</h2>
            <p className="mt-0.5 text-sm text-gray-500">
              Moves a balance between two parties. Nothing is billed and no money moves — what one owes
              simply becomes what the other owes.
            </p>
          </div>
          <button
            onClick={() => setCreating(true)}
            className="flex items-center gap-1.5 rounded-lg bg-brand-accent px-3.5 py-2 text-sm font-semibold text-white transition-all duration-150 hover:opacity-90 active:scale-95"
          >
            <Plus size={15} /> New Transfer
          </button>
        </div>

        {error && <div className="rounded-lg bg-rose-50 px-4 py-2 text-sm text-rose-600">{error}</div>}

        <div className="rounded-xl border border-gray-200 bg-white px-4 py-3">
          <div className="text-[11px] font-medium tracking-wide text-gray-400 uppercase">Total transferred</div>
          <div className="mt-0.5 text-xl font-semibold text-gray-900 tabular-nums">{inr(total)}</div>
        </div>

        <div className="overflow-x-auto rounded-xl border border-gray-200 bg-white">
          <table className="w-full min-w-[760px] border-collapse text-sm">
            <thead>
              <tr className="border-b border-gray-200 bg-gray-50 text-left text-[11px] font-medium tracking-wide text-gray-500 uppercase">
                <SortTh label="Date" sortKey="date" activeKey={sortKey} dir={sortDir} onSort={toggle} />
                <SortTh label="Ref No." sortKey="number" activeKey={sortKey} dir={sortDir} onSort={toggle} />
                <SortTh label="From" sortKey="from" activeKey={sortKey} dir={sortDir} onSort={toggle} />
                <SortTh label="To" sortKey="to" activeKey={sortKey} dir={sortDir} onSort={toggle} />
                <SortTh label="Amount" sortKey="amount" align="right" activeKey={sortKey} dir={sortDir} onSort={toggle} />
                <th className="w-10 px-3 py-2" />
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={6} className="px-4 py-12 text-center text-sm text-gray-400">
                    <span className="inline-flex items-center gap-2">
                      <Spinner size={15} className="text-brand-accent" /> Loading transfers…
                    </span>
                  </td>
                </tr>
              ) : sorted.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-4 py-12 text-center text-sm text-gray-400">
                    <ArrowRightLeft size={22} className="mx-auto mb-2 text-gray-300" />
                    No transfers yet.
                  </td>
                </tr>
              ) : (
                sorted.map((r) => (
                  <tr
                    key={r.id}
                    onClick={() => setEditing(r)}
                    className={`cursor-pointer border-b border-gray-50 last:border-b-0 hover:bg-cyan-50/30 ${
                      r.cancelled ? "opacity-50" : ""
                    }`}
                  >
                    <td className="px-3 py-2.5 text-gray-600">{r.invoiceDate ?? "—"}</td>
                    <td className="px-3 py-2.5 font-medium text-gray-800">{fullInvoiceNo(r)}</td>
                    <td className="px-3 py-2.5 text-gray-700">{r.partyName ?? "—"}</td>
                    <td className="px-3 py-2.5">
                      <span className="flex items-center gap-1.5 text-gray-700">
                        <ArrowRight size={13} className="shrink-0 text-gray-300" />
                        {/* A transfer saved before this screen existed has no destination and moves
                            nothing — say so rather than showing a dash that reads as "not loaded". */}
                        {r.transferToPartyName ?? nameOf(r.transferToPartyId) ?? "—"}
                        {r.transferToPartyId == null && (
                          <span className="rounded bg-amber-50 px-1.5 py-0.5 text-[11px] font-medium text-amber-700">
                            No destination — moves nothing
                          </span>
                        )}
                      </span>
                    </td>
                    <td className="px-3 py-2.5 text-right font-medium text-gray-800 tabular-nums">{inr(r.total)}</td>
                    <td className="px-3 py-2.5" onClick={(e) => e.stopPropagation()}>
                      <RowMenu align="right" buttonLabel={`Actions for ${fullInvoiceNo(r)}`}>
                        {(close) => (
                          <>
                            <RowMenuItem icon={Pencil} label="Edit" onClick={() => { close(); setEditing(r); }} />
                            <RowMenuDivider />
                            <RowMenuItem
                              icon={Trash2}
                              label="Delete"
                              tone="danger"
                              onClick={() => { close(); remove(r); }}
                            />
                          </>
                        )}
                      </RowMenu>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {(creating || editing) && (
        <PartyTransferDialog
          existing={editing ?? undefined}
          parties={parties}
          onPartyCreated={(created) => setParties((prev) => [created, ...prev])}
          onClose={() => {
            setCreating(false);
            setEditing(null);
          }}
          onSaved={async () => {
            setCreating(false);
            setEditing(null);
            await load();
          }}
        />
      )}
    </VyaparShell>
  );
}
