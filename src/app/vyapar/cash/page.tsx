"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { VyaparShell } from "@/components/vyapar/VyaparShell";
import { TxnTable } from "@/app/vyapar/bank/page";
import { CashBankEntryDialog } from "@/components/vyapar/CashBankDialogs";
import { useCan } from "@/lib/permissions";
import { Spinner } from "@/components/Spinner";
import { inr } from "@/lib/format";
import { downloadPdf, bankStatementSheet } from "@/lib/vyaparExport";
import { ExportDialog, type ExportColumn } from "@/components/vyapar/ExportDialog";
import * as vyapar from "@/lib/vyaparApi";
import type { BankAccount, CashBankTxn } from "@/lib/vyaparApi";
import { SlidersHorizontal } from "lucide-react";
import { isBackgroundRefresh, useAutoRefresh } from "@/lib/autoRefresh";

/** Cash In Hand — running cash balance with its own ledger and the Adjust Cash dialog. */
export default function CashInHandPage() {
  const [txns, setTxns] = useState<CashBankTxn[]>([]);
  const [accounts, setAccounts] = useState<BankAccount[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [adjust, setAdjust] = useState(false);
  const [exporting, setExporting] = useState(false);
  const can = useCan();

  const load = useCallback(async () => {
    if (!isBackgroundRefresh()) setLoading(true);
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
  useAutoRefresh(load);

  useEffect(() => {
    load();
  }, [load]);

  async function removeTxn(t: CashBankTxn) {
    const transfer = /transfer|withdrawal|deposit/i.test(t.type);
    if (!confirm(`Delete this ${t.type} of ${inr(t.amount)}?${transfer ? " Both sides of the transfer are removed." : ""}

This can't be undone.`)) return;
    setError("");
    try {
      await vyapar.deleteCashBankEntry(t.id);
      void load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't delete this entry.");
    }
  }

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
            canEdit={can("VYAPAR_CASH_BANK:EDIT")}
            onSaved={() => void load()}
            onDelete={can("VYAPAR_CASH_BANK:DELETE") ? (t) => void removeTxn(t) : undefined}
            onExport={() => setExporting(true)}
            onPdf={() => {
              // Cash is an account like any other, so its PDF is Vyapar's bank-statement sheet.
              const sheet = bankStatementSheet("Cash In Hand", rows, balance);
              void downloadPdf(sheet.title, sheet.head, sheet.rows, { subtitle: sheet.subtitle, ...sheet.extras });
            }}
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
