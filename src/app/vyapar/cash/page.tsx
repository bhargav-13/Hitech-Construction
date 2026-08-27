"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { VyaparShell } from "@/components/vyapar/VyaparShell";
import { TxnTable } from "@/app/vyapar/bank/page";
import { CashBankEntryDialog } from "@/components/vyapar/CashBankDialogs";
import { Spinner } from "@/components/Spinner";
import { inr } from "@/lib/format";
import { downloadPdf } from "@/lib/vyaparExport";
import { ExportDialog, type ExportColumn } from "@/components/vyapar/ExportDialog";
import * as vyapar from "@/lib/vyaparApi";
import type { BankAccount, CashBankTxn } from "@/lib/vyaparApi";
import { SlidersHorizontal } from "lucide-react";

/** Cash In Hand — running cash balance with its own ledger and the Adjust Cash dialog. */
export default function CashInHandPage() {
  const [txns, setTxns] = useState<CashBankTxn[]>([]);
  const [accounts, setAccounts] = useState<BankAccount[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [adjust, setAdjust] = useState(false);
  const [exporting, setExporting] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const [t, a] = await Promise.all([vyapar.getCashTxns(), vyapar.getBankAccounts().catch(() => [])]);
      setTxns(t);
      setAccounts(a);
    } catch {
      setTxns([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const balance = useMemo(
    () => txns.reduce((s, t) => s + (t.direction === "in" ? t.amount : -t.amount), 0),
    [txns]
  );

  const rows = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return txns;
    return txns.filter((t) => [t.type, t.name, t.date].some((f) => f?.toLowerCase().includes(q)));
  }, [txns, search]);

  const cashExportColumns: ExportColumn<CashBankTxn>[] = [
    { key: "type", label: "Type", value: (t) => t.type },
    { key: "name", label: "Name", value: (t) => t.name ?? "" },
    { key: "date", label: "Date", value: (t) => t.date ?? "" },
    { key: "direction", label: "Direction", value: (t) => (t.direction === "in" ? "In" : "Out") },
    { key: "amount", label: "Amount", value: (t) => t.amount },
    // Signed alongside the raw amount: a cash book that only carries magnitudes can't be summed
    // in Excel without re-deriving the direction by hand.
    { key: "signed", label: "Signed Amount", value: (t) => (t.direction === "in" ? t.amount : -t.amount) },
    { key: "note", label: "Note", value: (t) => t.note ?? "" },
  ];

  const head = ["Type", "Name", "Date", "Amount"];

  return (
    <VyaparShell>
      <div className="animate-fade-in space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-baseline gap-3">
            <h2 className="text-base font-semibold text-gray-800">Cash In Hand</h2>
            <span className={`text-xl font-semibold ${balance < 0 ? "text-rose-600" : "text-gray-900"}`}>{inr(balance)}</span>
          </div>
          <button
            onClick={() => setAdjust(true)}
            className="flex items-center gap-1.5 rounded-lg bg-rose-600 px-3.5 py-2 text-sm font-semibold text-white transition-all duration-150 hover:bg-rose-700 active:scale-95"
          >
            <SlidersHorizontal size={15} /> Adjust Cash
          </button>
        </div>

        {error && <div className="rounded-lg bg-rose-50 px-4 py-2 text-sm text-rose-600">{error}</div>}

        {loading ? (
          <div className="flex min-h-[260px] items-center justify-center gap-2 rounded-xl border border-dashed border-gray-300 bg-white text-sm text-gray-400">
            <Spinner size={16} className="text-brand-accent" /> Loading…
          </div>
        ) : (
          <TxnTable
            rows={rows}
            loading={false}
            search={search}
            onSearch={setSearch}
            onExport={() => setExporting(true)}
            onPdf={() =>
              downloadPdf("Cash In Hand", head, rows.map((r) => [r.type, r.name ?? "", r.date ?? "", inr(r.amount)]), {
                subtitle: `Balance ${inr(balance)}`,
                rightAlignFrom: 3,
              })
            }
          />
        )}
      </div>

      {exporting && (
        <ExportDialog
          title="cash book"
          filename="cash-in-hand"
          rows={rows}
          columns={cashExportColumns}
          onClose={() => setExporting(false)}
        />
      )}

      {adjust && (
        <CashBankEntryDialog
          kind="ADJUST_CASH"
          accounts={accounts}
          currentBalance={balance}
          onClose={() => setAdjust(false)}
          onDone={() => { setAdjust(false); load(); }}
        />
      )}
    </VyaparShell>
  );
}
