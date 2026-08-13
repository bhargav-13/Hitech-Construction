"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Spinner } from "@/components/Spinner";
import { Select } from "@/components/Select";
import { inr, bookDate } from "@/lib/format";
import * as vyapar from "@/lib/vyaparApi";
import type { OpenTxnRow, PaymentLink } from "@/lib/vyaparApi";
import { RotateCcw, Search, X, Zap } from "lucide-react";

/**
 * Vyapar's "Link Payment to Txns".
 *
 * A receipt isn't owned by one invoice: a lump sum is spread across whichever bills it settles, and
 * whatever is left shows as "Unused" on the party ledger. Our payments could only ever point at a
 * single invoice, so this dialog — and the Unused state it produces — had no equivalent.
 */
export function LinkPaymentDialog({
  partyId,
  partyName,
  received,
  paymentId,
  onClose,
  onDone,
}: {
  partyId: number;
  partyName: string;
  /** The receipt amount being spread. Editable here, as in Vyapar. */
  received: number;
  /** Set when re-linking a saved payment, so its own links show as already applied. */
  paymentId?: number;
  onClose: () => void;
  onDone: (links: Pick<PaymentLink, "invoiceId" | "amount">[], received: number) => void;
}) {
  const [rows, setRows] = useState<OpenTxnRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState("All");
  const [amount, setAmount] = useState(received);
  /** invoiceId → linked amount. Absent means unticked. */
  const [linked, setLinked] = useState<Record<number, number>>({});

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const list = await vyapar.getOpenTransactions(partyId, paymentId);
      setRows(list);
      // Pre-tick whatever this payment already settles.
      const seed: Record<number, number> = {};
      for (const r of list) if (r.linkedAmount > 0) seed[r.id] = r.linkedAmount;
      setLinked(seed);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't load open transactions.");
    } finally {
      setLoading(false);
    }
  }, [partyId, paymentId]);

  useEffect(() => {
    load();
  }, [load]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return rows.filter((r) => {
      if (typeFilter !== "All" && r.type !== typeFilter) return false;
      if (!q) return true;
      return [r.number, r.type, r.date].some((f) => f?.toLowerCase().includes(q));
    });
  }, [rows, search, typeFilter]);

  const types = useMemo(() => [...new Set(rows.map((r) => r.type))], [rows]);

  const totalLinked = useMemo(
    () => Object.values(linked).reduce((s, v) => s + (Number(v) || 0), 0),
    [linked]
  );
  const unused = Math.max(0, amount - totalLinked);

  /**
   * Vyapar's AUTO LINK: walk the open documents oldest first and pour the receipt into each until
   * it runs out. Oldest-first is what a bookkeeper expects — the longest-overdue bill clears first.
   */
  function autoLink() {
    let left = amount;
    const next: Record<number, number> = {};
    const oldestFirst = [...rows].sort((a, b) => (a.date ?? "").localeCompare(b.date ?? ""));
    for (const r of oldestFirst) {
      if (left <= 0) break;
      const take = Math.min(left, r.balance);
      if (take > 0) {
        next[r.id] = Number(take.toFixed(2));
        left -= take;
      }
    }
    setLinked(next);
  }

  function toggle(row: OpenTxnRow) {
    setLinked((prev) => {
      if (prev[row.id] != null) {
        const rest = { ...prev };
        delete rest[row.id];
        return rest;
      }
      // Ticking a row fills it with whatever of the receipt is still unspent, capped at its balance.
      const spent = Object.values(prev).reduce((s, v) => s + (Number(v) || 0), 0);
      const take = Math.min(Math.max(0, amount - spent), row.balance);
      return { ...prev, [row.id]: Number(take.toFixed(2)) };
    });
  }

  function setLinkAmount(row: OpenTxnRow, value: number) {
    const capped = Math.max(0, Math.min(value, row.balance));
    setLinked((prev) => ({ ...prev, [row.id]: capped }));
  }

  function done() {
    const links = Object.entries(linked)
      .filter(([, v]) => Number(v) > 0)
      .map(([invoiceId, v]) => ({ invoiceId: Number(invoiceId), amount: Number(v) }));
    onDone(links, amount);
  }

  return (
    <>
      <div className="fixed inset-0 z-40 bg-black/30" onClick={onClose} />
      <div className="animate-fade-in fixed left-1/2 top-1/2 z-50 flex max-h-[88vh] w-[min(880px,94vw)] -translate-x-1/2 -translate-y-1/2 flex-col rounded-xl border border-gray-200 bg-white shadow-2xl">
        <div className="flex items-center justify-between border-b border-gray-100 px-5 py-3">
          <h3 className="text-base font-semibold text-gray-800">Link Payment to Txns</h3>
          <button onClick={onClose} aria-label="Close" className="rounded-md p-1 text-gray-400 hover:bg-gray-100">
            <X size={16} />
          </button>
        </div>

        {/* Party · Received · Auto link */}
        <div className="flex flex-wrap items-end gap-5 border-b border-gray-100 px-5 py-3">
          <div>
            <div className="text-[11px] tracking-wide text-gray-400 uppercase">Party</div>
            <div className="mt-0.5 text-sm font-medium text-gray-800">{partyName}</div>
          </div>
          <div>
            <label className="block text-[11px] font-medium tracking-wide text-brand-accent uppercase">Received</label>
            <input
              type="number"
              value={amount}
              onChange={(e) => setAmount(Number(e.target.value) || 0)}
              className="mt-0.5 w-36 rounded-md border border-gray-200 px-2 py-1 text-right text-sm outline-none focus:border-cyan-500"
            />
          </div>
          <div className="ml-auto flex items-center gap-2">
            <button
              onClick={autoLink}
              className="flex items-center gap-1.5 rounded-lg bg-brand-accent px-3 py-1.5 text-sm font-semibold text-white transition-all duration-150 hover:opacity-90 active:scale-95"
            >
              <Zap size={14} /> Auto Link
            </button>
            <button
              onClick={() => setLinked({})}
              title="Reset"
              className="flex items-center gap-1.5 rounded-lg border border-gray-200 px-3 py-1.5 text-sm text-gray-600 transition-colors duration-150 hover:bg-gray-50"
            >
              <RotateCcw size={14} /> Reset
            </button>
          </div>
        </div>

        {/* Filters */}
        <div className="flex flex-wrap items-center gap-2 px-5 py-2.5">
          <Select
            value={typeFilter}
            onChange={setTypeFilter}
            size="sm"
            className="w-44"
            options={[{ value: "All", label: "All transactions" }, ...types.map((t) => ({ value: t, label: t }))]}
          />
          <div className="ml-auto flex items-center gap-1.5 rounded-lg border border-gray-200 px-2.5 py-1.5 focus-within:border-cyan-500">
            <Search size={14} className="text-gray-400" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search"
              className="w-40 bg-transparent text-sm outline-none"
            />
          </div>
        </div>

        {/* Rows */}
        <div className="min-h-[180px] flex-1 overflow-y-auto border-y border-gray-100">
          {error && <div className="px-5 py-4 text-sm text-rose-600">{error}</div>}
          {loading ? (
            <div className="flex min-h-[180px] items-center justify-center gap-2 text-sm text-gray-400">
              <Spinner size={14} className="text-brand-accent" /> Loading…
            </div>
          ) : filtered.length === 0 ? (
            <div className="px-5 py-12 text-center text-sm text-gray-400">
              Nothing outstanding for this party.
            </div>
          ) : (
            <table className="w-full border-collapse text-sm">
              <thead className="sticky top-0 bg-gray-50">
                <tr className="border-b border-gray-100 text-left text-gray-500">
                  <th className="w-10 px-4 py-2" />
                  <th className="px-3 py-2 font-medium">Date</th>
                  <th className="px-3 py-2 font-medium">Type</th>
                  <th className="px-3 py-2 font-medium">Ref/Inv No.</th>
                  <th className="px-3 py-2 text-right font-medium">Total</th>
                  <th className="px-3 py-2 text-right font-medium">Balance</th>
                  <th className="px-3 py-2 text-right font-medium">Linked Amount</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((r) => {
                  const on = linked[r.id] != null;
                  return (
                    <tr key={r.id} className="border-b border-gray-50 last:border-b-0 hover:bg-cyan-50/30">
                      <td className="px-4 py-2">
                        <input
                          type="checkbox"
                          checked={on}
                          onChange={() => toggle(r)}
                          aria-label={`Link to ${r.number ?? r.type}`}
                          className="h-4 w-4 accent-cyan-600"
                        />
                      </td>
                      <td className="px-3 py-2 whitespace-nowrap text-gray-600">{bookDate(r.date)}</td>
                      <td className="px-3 py-2 text-gray-700">{r.type}</td>
                      <td className="px-3 py-2 font-mono text-xs text-gray-500">{r.number ?? "—"}</td>
                      <td className="px-3 py-2 text-right text-gray-800">{inr(r.total)}</td>
                      <td className="px-3 py-2 text-right text-rose-600">{inr(r.balance)}</td>
                      <td className="px-3 py-2 text-right">
                        <input
                          type="number"
                          value={on ? linked[r.id] : ""}
                          disabled={!on}
                          onChange={(e) => setLinkAmount(r, Number(e.target.value) || 0)}
                          className="w-28 rounded-md border border-gray-200 px-2 py-1 text-right text-sm outline-none focus:border-cyan-500 disabled:bg-gray-50 disabled:text-gray-300"
                        />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>

        <div className="flex items-center justify-end gap-3 px-5 py-3">
          <span className="mr-auto text-sm text-gray-500">
            Unused Amount : <span className={`font-semibold ${unused > 0 ? "text-amber-600" : "text-emerald-600"}`}>{inr(unused)}</span>
          </span>
          <button onClick={onClose} className="rounded-lg border border-gray-200 px-4 py-2 text-sm text-gray-600 hover:bg-gray-50">
            Cancel
          </button>
          <button
            onClick={done}
            className="rounded-lg bg-navy px-5 py-2 text-sm font-semibold text-white transition-all duration-150 hover:opacity-90 active:scale-95"
          >
            Done
          </button>
        </div>
      </div>
    </>
  );
}
