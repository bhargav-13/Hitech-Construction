"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { VyaparShell, VyaparEmpty } from "@/components/vyapar/VyaparShell";
import { BankAccountDialog, CashBankEntryDialog } from "@/components/vyapar/CashBankDialogs";
import { RowMenu, RowMenuDivider, RowMenuItem } from "@/components/RowMenu";
import { Spinner } from "@/components/Spinner";
import { inr } from "@/lib/format";
import { exportRowsToCsv, printRows, downloadPdf } from "@/lib/vyaparExport";
import * as vyapar from "@/lib/vyaparApi";
import type { BankAccount, CashBankTxn } from "@/lib/vyaparApi";
import {
  ArrowLeftRight,
  Building2,
  ChevronDown,
  FileSpreadsheet,
  FileText,
  Pencil,
  Plus,
  Printer,
  Search,
  Trash2,
} from "lucide-react";

type EntryKind = "BANK_TO_CASH" | "CASH_TO_BANK" | "BANK_TO_BANK" | "ADJUST_BANK";

const ENTRY_LABELS: { kind: EntryKind; label: string }[] = [
  { kind: "BANK_TO_CASH", label: "Bank to Cash Transfer" },
  { kind: "CASH_TO_BANK", label: "Cash to Bank Transfer" },
  { kind: "BANK_TO_BANK", label: "Bank to Bank Transfer" },
  { kind: "ADJUST_BANK", label: "Adjust Bank Balance" },
];

/** Bank Accounts — Vyapar's master–detail with the Deposit/Withdraw menu. */
export default function BankAccountsPage() {
  const [accounts, setAccounts] = useState<BankAccount[]>([]);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [txns, setTxns] = useState<CashBankTxn[]>([]);
  const [txnLoading, setTxnLoading] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [txnSearch, setTxnSearch] = useState("");
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<BankAccount | null>(null);
  const [entry, setEntry] = useState<EntryKind | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const list = await vyapar.getBankAccounts();
      setAccounts(list);
      setSelectedId((cur) => (list.some((a) => a.id === cur) ? cur : list[0]?.id ?? null));
    } catch {
      // Endpoint not live yet — show the empty state rather than an error.
      setAccounts([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    if (selectedId == null) return;
    let cancelled = false;
    setTxnLoading(true);
    vyapar
      .getAccountTxns(selectedId)
      .then((r) => !cancelled && setTxns(r))
      .catch(() => !cancelled && setTxns([]))
      .finally(() => !cancelled && setTxnLoading(false));
    return () => {
      cancelled = true;
    };
  }, [selectedId]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return accounts;
    return accounts.filter((a) => [a.name, a.bankName, a.accountNumber].some((f) => f?.toLowerCase().includes(q)));
  }, [accounts, search]);

  const selected = accounts.find((a) => a.id === selectedId) ?? null;

  const rows = useMemo(() => {
    const q = txnSearch.trim().toLowerCase();
    if (!q) return txns;
    return txns.filter((t) => [t.type, t.name, t.date].some((f) => f?.toLowerCase().includes(q)));
  }, [txns, txnSearch]);

  const total = accounts.reduce((s, a) => s + a.balance, 0);
  const head = ["Type", "Name", "Date", "Amount"];
  const data = rows.map((r) => [r.type, r.name ?? "", r.date ?? "", r.amount]);

  async function remove(a: BankAccount) {
    if (!confirm(`Delete ${a.name}? This can't be undone.`)) return;
    try {
      await vyapar.deleteBankAccount(a.id);
      load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't delete this account.");
    }
  }

  return (
    <VyaparShell>
      <div className="animate-fade-in space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h2 className="text-base font-semibold text-gray-800">Banks</h2>
            <p className="mt-0.5 text-sm text-gray-500">
              {accounts.length} accounts · Total balance <span className="font-medium text-gray-700">{inr(total)}</span>
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <RowMenu align="right" buttonLabel="Bank export">
              {(close) => (
                <>
                  <RowMenuItem
                    icon={FileSpreadsheet}
                    label="Export accounts"
                    onClick={() => {
                      close();
                      exportRowsToCsv("bank-accounts", ["Account", "Bank", "Account No", "Balance"], accounts.map((a) => [a.name, a.bankName ?? "", a.accountNumber ?? "", a.balance]));
                    }}
                  />
                  <RowMenuItem
                    icon={FileText}
                    label="Download PDF"
                    onClick={() => {
                      close();
                      downloadPdf("Bank Accounts", ["Account", "Bank", "Account No", "Balance"], accounts.map((a) => [a.name, a.bankName ?? "", a.accountNumber ?? "", inr(a.balance)]), { rightAlignFrom: 3 });
                    }}
                  />
                  <RowMenuItem
                    icon={Printer}
                    label="Print"
                    onClick={() => {
                      close();
                      printRows("Bank Accounts", ["Account", "Bank", "Account No", "Balance"], accounts.map((a) => [a.name, a.bankName ?? "", a.accountNumber ?? "", inr(a.balance)]));
                    }}
                  />
                </>
              )}
            </RowMenu>
            <button
              onClick={() => setCreating(true)}
              className="flex items-center gap-1.5 rounded-lg bg-rose-600 px-3.5 py-2 text-sm font-semibold text-white transition-all duration-150 hover:bg-rose-700 active:scale-95"
            >
              <Plus size={15} /> Add Bank
            </button>
          </div>
        </div>

        {error && <div className="rounded-lg bg-rose-50 px-4 py-2 text-sm text-rose-600">{error}</div>}

        {loading ? (
          <div className="flex min-h-[300px] items-center justify-center gap-2 rounded-xl border border-dashed border-gray-300 bg-white text-sm text-gray-400">
            <Spinner size={16} className="text-brand-accent" /> Loading accounts…
          </div>
        ) : accounts.length === 0 ? (
          <VyaparEmpty
            icon={Building2}
            title="No bank accounts yet"
            hint="Add the accounts you receive and make payments from."
            action={
              <button onClick={() => setCreating(true)} className="rounded-lg bg-brand-accent px-4 py-2 text-sm font-medium text-white transition-all duration-150 hover:opacity-90 active:scale-95">
                + Add Bank
              </button>
            }
          />
        ) : (
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-[320px_minmax(0,1fr)]">
            {/* Accounts list */}
            <div className="overflow-hidden rounded-xl border border-gray-200 bg-white">
              <div className="border-b border-gray-100 p-3">
                <div className="flex items-center gap-2 rounded-lg border border-gray-200 px-3 py-2 transition-colors duration-150 focus-within:border-cyan-500">
                  <Search size={15} className="text-gray-400" />
                  <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search by Account/Amount" className="w-full bg-transparent text-sm outline-none" />
                </div>
              </div>
              <div className="flex items-center justify-between border-b border-gray-100 bg-gray-50 px-3 py-1.5 text-[11px] font-medium tracking-wide text-gray-500 uppercase">
                <span>Account Name</span>
                <span>Amount</span>
              </div>
              <div className="max-h-[560px] overflow-y-auto">
                {filtered.map((a) => {
                  const active = a.id === selectedId;
                  return (
                    <button
                      key={a.id}
                      onClick={() => setSelectedId(a.id)}
                      className={`flex w-full items-center justify-between gap-2 border-b border-gray-50 px-3 py-2.5 text-left transition-colors duration-150 last:border-b-0 ${active ? "bg-cyan-50" : "hover:bg-gray-50"}`}
                    >
                      <span className="min-w-0">
                        <span className={`block truncate text-sm ${active ? "font-medium text-brand-accent" : "text-gray-700"}`}>{a.name}</span>
                        {a.bankName && <span className="block truncate text-[11px] text-gray-400">{a.bankName}</span>}
                      </span>
                      <span className={`shrink-0 text-sm ${a.balance < 0 ? "text-rose-600" : a.balance > 0 ? "text-emerald-600" : "text-gray-400"}`}>
                        {inr(Math.abs(a.balance))}
                      </span>
                    </button>
                  );
                })}
                {filtered.length === 0 && <div className="px-3 py-10 text-center text-sm text-gray-400">No accounts match.</div>}
              </div>
            </div>

            {/* Detail */}
            {selected ? (
              <div className="space-y-4">
                <div className="flex flex-wrap items-start justify-between gap-3 rounded-xl border border-gray-200 bg-white p-4">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <h3 className="truncate text-lg font-semibold text-gray-800">{selected.name}</h3>
                      <button onClick={() => setEditing(selected)} title="Edit account" className="rounded-md p-1 text-gray-400 transition-colors duration-150 hover:bg-cyan-50 hover:text-brand-accent">
                        <Pencil size={14} />
                      </button>
                    </div>
                    <div className="mt-1.5 flex flex-wrap gap-x-6 gap-y-1 text-sm">
                      {selected.bankName && <Meta label="Bank" value={selected.bankName} />}
                      {selected.accountNumber && <Meta label="A/C" value={selected.accountNumber} mono />}
                      {selected.ifsc && <Meta label="IFSC" value={selected.ifsc} mono />}
                      {selected.upiId && <Meta label="UPI" value={selected.upiId} />}
                    </div>
                  </div>

                  <div className="flex shrink-0 items-center gap-2">
                    <div className="text-right">
                      <div className="text-[11px] tracking-wide text-gray-400 uppercase">Balance</div>
                      <div className={`text-xl font-semibold ${selected.balance < 0 ? "text-rose-600" : "text-gray-900"}`}>{inr(selected.balance)}</div>
                    </div>
                    {/* Deposit / Withdraw split menu */}
                    <div className="relative">
                      <button
                        onClick={() => setMenuOpen((o) => !o)}
                        className="flex items-center gap-1.5 rounded-lg border border-rose-300 px-3 py-2 text-sm font-medium text-rose-600 transition-all duration-150 hover:bg-rose-50 active:scale-95"
                      >
                        <ArrowLeftRight size={14} /> Deposit / Withdraw
                        <ChevronDown size={13} />
                      </button>
                      {menuOpen && (
                        <>
                          <div className="fixed inset-0 z-30" onClick={() => setMenuOpen(false)} />
                          <div className="animate-menu-pop absolute right-0 top-11 z-40 w-56 origin-top-right rounded-xl border border-gray-100 bg-white p-1 shadow-xl ring-1 ring-black/[0.03]">
                            {ENTRY_LABELS.map((e) => (
                              <button
                                key={e.kind}
                                onClick={() => {
                                  setMenuOpen(false);
                                  setEntry(e.kind);
                                }}
                                className="block w-full rounded-lg px-3 py-2 text-left text-sm text-gray-700 transition-colors duration-150 hover:bg-cyan-50 hover:text-brand-accent"
                              >
                                {e.label}
                              </button>
                            ))}
                          </div>
                        </>
                      )}
                    </div>
                    <RowMenu align="right" buttonLabel={`Actions for ${selected.name}`}>
                      {(close) => (
                        <>
                          <RowMenuItem icon={Pencil} label="Edit account" onClick={() => { close(); setEditing(selected); }} />
                          <RowMenuItem icon={FileSpreadsheet} label="Export statement" onClick={() => { close(); exportRowsToCsv(`${selected.name}-statement`, head, data); }} />
                          <RowMenuItem
                            icon={FileText}
                            label="Download PDF"
                            onClick={() => { close(); downloadPdf(`${selected.name} — Statement`, head, rows.map((r) => [r.type, r.name ?? "", r.date ?? "", inr(r.amount)]), { rightAlignFrom: 3 }); }}
                          />
                          <RowMenuDivider />
                          <RowMenuItem icon={Trash2} label="Delete account" tone="danger" onClick={() => { close(); remove(selected); }} />
                        </>
                      )}
                    </RowMenu>
                  </div>
                </div>

                <TxnTable
                  rows={rows}
                  loading={txnLoading}
                  search={txnSearch}
                  onSearch={setTxnSearch}
                  onExport={() => exportRowsToCsv(`${selected.name}-statement`, head, data)}
                  onPdf={() => downloadPdf(`${selected.name} — Statement`, head, rows.map((r) => [r.type, r.name ?? "", r.date ?? "", inr(r.amount)]), { rightAlignFrom: 3 })}
                />
              </div>
            ) : (
              <VyaparEmpty icon={Building2} title="Select an account" hint="Pick one on the left to see its statement." />
            )}
          </div>
        )}
      </div>

      {(creating || editing) && (
        <BankAccountDialog
          existing={editing ?? undefined}
          onClose={() => { setCreating(false); setEditing(null); }}
          onSaved={() => { setCreating(false); setEditing(null); load(); }}
        />
      )}
      {entry && (
        <CashBankEntryDialog
          kind={entry}
          accounts={accounts}
          currentAccountId={selectedId}
          currentBalance={selected?.balance}
          onClose={() => setEntry(null)}
          onDone={() => { setEntry(null); load(); if (selectedId) vyapar.getAccountTxns(selectedId).then(setTxns).catch(() => {}); }}
        />
      )}
    </VyaparShell>
  );
}

/** Shared statement table for bank and cash screens. */
export function TxnTable({
  rows,
  loading,
  search,
  onSearch,
  onExport,
  onPdf,
}: {
  rows: CashBankTxn[];
  loading: boolean;
  search: string;
  onSearch: (v: string) => void;
  onExport: () => void;
  onPdf: () => void;
}) {
  return (
    <div className="overflow-hidden rounded-xl border border-gray-200 bg-white">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-gray-100 px-4 py-3">
        <h4 className="text-sm font-semibold text-gray-800">Transactions</h4>
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1.5 rounded-lg border border-gray-200 px-2.5 py-1.5 transition-colors duration-150 focus-within:border-cyan-500">
            <Search size={13} className="text-gray-400" />
            <input value={search} onChange={(e) => onSearch(e.target.value)} placeholder="Search" className="w-28 bg-transparent text-sm outline-none" />
          </div>
          <button onClick={onPdf} title="Download PDF" className="rounded-lg p-1.5 text-rose-600 transition-colors duration-150 hover:bg-rose-50">
            <FileText size={15} />
          </button>
          <button onClick={onExport} title="Export to Excel" className="rounded-lg p-1.5 text-emerald-600 transition-colors duration-150 hover:bg-emerald-50">
            <FileSpreadsheet size={15} />
          </button>
        </div>
      </div>

      {loading ? (
        <div className="flex min-h-[150px] items-center justify-center gap-2 text-sm text-gray-400">
          <Spinner size={14} className="text-brand-accent" /> Loading…
        </div>
      ) : rows.length === 0 ? (
        <div className="px-4 py-12 text-center text-sm text-gray-400">No transactions yet.</div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[600px] border-collapse text-sm">
            <thead>
              <tr className="border-b border-gray-100 bg-gray-50 text-left text-gray-500">
                <th className="px-4 py-2 font-medium">Type</th>
                <th className="px-4 py-2 font-medium">Name</th>
                <th className="px-4 py-2 font-medium">Date</th>
                <th className="px-4 py-2 text-right font-medium">Amount</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((t) => (
                <tr key={t.id} className="border-b border-gray-50 transition-colors duration-150 last:border-b-0 even:bg-gray-50/40 hover:bg-cyan-50/40">
                  <td className="px-4 py-2.5 font-medium text-gray-700">{t.type}</td>
                  <td className="px-4 py-2.5 text-gray-600">{t.name ?? "—"}</td>
                  <td className="px-4 py-2.5 text-gray-600">{t.date ?? "—"}</td>
                  <td className={`px-4 py-2.5 text-right font-medium ${t.direction === "in" ? "text-emerald-600" : "text-rose-600"}`}>
                    {inr(t.amount)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function Meta({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex items-center gap-1.5">
      <span className="text-[11px] tracking-wide text-gray-400 uppercase">{label}</span>
      <span className={`text-gray-700 ${mono ? "font-mono text-xs" : ""}`}>{value}</span>
    </div>
  );
}
