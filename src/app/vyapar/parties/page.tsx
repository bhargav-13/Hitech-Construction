"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { VyaparShell, VyaparEmpty } from "@/components/vyapar/VyaparShell";
import { PartyDialog } from "@/components/vyapar/PartyDialog";
import { PartyImportDialog } from "@/components/vyapar/PartyImportDialog";
import { RowMenu, RowMenuDivider, RowMenuItem } from "@/components/RowMenu";
import { Spinner } from "@/components/Spinner";
import { Select } from "@/components/Select";
import { inr } from "@/lib/format";
import { exportRowsToCsv, printRows, downloadPdf } from "@/lib/vyaparExport";
import * as vyapar from "@/lib/vyaparApi";
import type { Party, PartyLedgerRow } from "@/lib/vyaparApi";
import { usePartySettings } from "@/lib/usePartySettings";
import { useVyaparBankId } from "@/lib/bankScope";
import {
  ArrowUpDown,
  FileSpreadsheet,
  FileText,
  Mail,
  MapPin,
  Pencil,
  Phone,
  Plus,
  Printer,
  Search,
  Trash2,
  Upload,
  Users,
} from "lucide-react";

/**
 * Party Details — Vyapar's master–detail layout: a searchable party list on the left, and the
 * selected party's profile plus their full transaction ledger on the right.
 */
export default function PartiesPage() {
  const { settings } = usePartySettings();
  const [parties, setParties] = useState<Party[]>([]);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [ledger, setLedger] = useState<PartyLedgerRow[]>([]);
  const [ledgerLoading, setLedgerLoading] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState<"All" | vyapar.PartyType>("All");
  const [sortDesc, setSortDesc] = useState(false);
  const [editing, setEditing] = useState<Party | null>(null);
  const [creating, setCreating] = useState(false);
  const [importing, setImporting] = useState(false);
  const [ledgerSearch, setLedgerSearch] = useState("");
  const bankAccountId = useVyaparBankId();

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const list = await vyapar.getParties(undefined, bankAccountId);
      setParties(list);
      setSelectedId((cur) => cur ?? list[0]?.id ?? null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't load parties.");
    } finally {
      setLoading(false);
    }
  }, [bankAccountId]);

  useEffect(() => {
    load();
  }, [load]);

  // Pull the selected party's ledger. Falls back to empty if the endpoint isn't live yet.
  useEffect(() => {
    if (selectedId == null) return;
    let cancelled = false;
    setLedgerLoading(true);
    vyapar
      .getPartyLedger(selectedId)
      .then((rows) => !cancelled && setLedger(rows))
      .catch(() => !cancelled && setLedger([]))
      .finally(() => !cancelled && setLedgerLoading(false));
    return () => {
      cancelled = true;
    };
  }, [selectedId]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    const list = parties.filter((p) => {
      if (typeFilter !== "All" && p.partyType !== typeFilter) return false;
      if (!q) return true;
      return [p.name, p.phone, p.gstin, p.partyGroup].some((f) => f?.toLowerCase().includes(q));
    });
    return [...list].sort((a, b) => (sortDesc ? b.name.localeCompare(a.name) : a.name.localeCompare(b.name)));
  }, [parties, search, typeFilter, sortDesc]);

  const selected = parties.find((p) => p.id === selectedId) ?? null;

  const ledgerRows = useMemo(() => {
    const q = ledgerSearch.trim().toLowerCase();
    if (!q) return ledger;
    return ledger.filter((r) => [r.type, r.number, r.date].some((f) => f?.toLowerCase().includes(q)));
  }, [ledger, ledgerSearch]);

  const totals = useMemo(() => {
    const receivable = parties.filter((p) => p.balance > 0).reduce((s, p) => s + p.balance, 0);
    const payable = parties.filter((p) => p.balance < 0).reduce((s, p) => s + Math.abs(p.balance), 0);
    return { receivable, payable };
  }, [parties]);

  async function remove(p: Party) {
    if (!confirm(`Delete ${p.name}? This can't be undone.`)) return;
    try {
      await vyapar.deleteParty(p.id);
      if (selectedId === p.id) setSelectedId(null);
      load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't delete this party.");
    }
  }

  const ledgerHead = ["Type", "Number", "Date", "Total", "Balance"];
  const ledgerData = ledgerRows.map((r) => [r.type, r.number ?? "", r.date ?? "", r.total, r.balance]);

  return (
    <VyaparShell>
      <div className="animate-fade-in space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h2 className="text-base font-semibold text-gray-800">Parties</h2>
            <p className="mt-0.5 text-sm text-gray-500">
              {parties.length} parties · To collect{" "}
              <span className="font-medium text-emerald-600">{inr(totals.receivable)}</span> · To pay{" "}
              <span className="font-medium text-rose-600">{inr(totals.payable)}</span>
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button
              onClick={() => setImporting(true)}
              className="flex items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-600 transition-all duration-150 hover:bg-gray-50 active:scale-95"
            >
              <Upload size={14} /> Import from Excel
            </button>
            <RowMenu align="right" buttonLabel="Party reports and export">
              {(close) => (
                <>
                  <RowMenuItem
                    icon={FileSpreadsheet}
                    label="Export all parties"
                    onClick={() => {
                      close();
                      exportRowsToCsv(
                        "all-parties",
                        ["Name", "Type", "Phone", "GSTIN", "State", "Group", "Balance"],
                        parties.map((p) => [p.name, p.partyType, p.phone ?? "", p.gstin ?? "", p.state ?? "", p.partyGroup ?? "", p.balance])
                      );
                    }}
                  />
                  <RowMenuItem
                    icon={FileText}
                    label="Download PDF"
                    onClick={() => {
                      close();
                      downloadPdf(
                        "All Parties",
                        ["Name", "Phone", "GSTIN", "Balance"],
                        parties.map((p) => [p.name, p.phone ?? "", p.gstin ?? "", inr(p.balance)]),
                        { rightAlignFrom: 3 }
                      );
                    }}
                  />
                  <RowMenuItem
                    icon={Printer}
                    label="Print"
                    onClick={() => {
                      close();
                      printRows(
                        "All Parties",
                        ["Name", "Phone", "GSTIN", "Balance"],
                        parties.map((p) => [p.name, p.phone ?? "", p.gstin ?? "", inr(p.balance)])
                      );
                    }}
                  />
                  <RowMenuDivider />
                  <RowMenuItem icon={FileText} label="Party Statement (Report)" onClick={() => { close(); window.location.href = "/vyapar/reports?r=party"; }} />
                  <RowMenuItem icon={Users} label="All Parties (Report)" onClick={() => { close(); window.location.href = "/vyapar/reports?r=all-parties"; }} />
                </>
              )}
            </RowMenu>
            <button
              onClick={() => setCreating(true)}
              className="flex items-center gap-1.5 rounded-lg bg-rose-600 px-3.5 py-2 text-sm font-semibold text-white transition-all duration-150 hover:bg-rose-700 active:scale-95"
            >
              <Plus size={15} /> Add Party
            </button>
          </div>
        </div>

        {error && <div className="rounded-lg bg-rose-50 px-4 py-2 text-sm text-rose-600">{error}</div>}

        {loading ? (
          <div className="flex min-h-[300px] items-center justify-center gap-2 rounded-xl border border-dashed border-gray-300 bg-white text-sm text-gray-400">
            <Spinner size={16} className="text-brand-accent" /> Loading parties…
          </div>
        ) : parties.length === 0 ? (
          <VyaparEmpty
            icon={Users}
            title="No parties yet"
            hint="Add your customers and suppliers, or import them from an Excel sheet."
            action={
              <button
                onClick={() => setCreating(true)}
                className="rounded-lg bg-brand-accent px-4 py-2 text-sm font-medium text-white transition-all duration-150 hover:opacity-90 active:scale-95"
              >
                + Add Party
              </button>
            }
          />
        ) : (
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-[320px_minmax(0,1fr)]">
            {/* ---- Master list ---- */}
            <div className="overflow-hidden rounded-xl border border-gray-200 bg-white">
              <div className="space-y-2 border-b border-gray-100 p-3">
                <div className="flex items-center gap-2 rounded-lg border border-gray-200 px-3 py-2 transition-colors duration-150 focus-within:border-cyan-500">
                  <Search size={15} className="text-gray-400" />
                  <input
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    placeholder="Search Party Name"
                    className="w-full bg-transparent text-sm outline-none"
                  />
                </div>
                <div className="flex items-center gap-2">
                  <Select
                    value={typeFilter}
                    onChange={(v) => setTypeFilter(v as typeof typeFilter)}
                    size="sm"
                    className="flex-1"
                    options={[
                      { value: "All", label: "All parties" },
                      { value: "CUSTOMER", label: "Customers" },
                      { value: "SUPPLIER", label: "Suppliers" },
                    ]}
                  />
                  <button
                    onClick={() => setSortDesc((s) => !s)}
                    title={sortDesc ? "Sort Z→A" : "Sort A→Z"}
                    className="rounded-lg border border-gray-200 p-1.5 text-gray-400 transition-colors duration-150 hover:bg-gray-50 hover:text-gray-600"
                  >
                    <ArrowUpDown size={14} />
                  </button>
                </div>
              </div>

              <div className="flex items-center justify-between border-b border-gray-100 bg-gray-50 px-3 py-1.5 text-[11px] font-medium tracking-wide text-gray-500 uppercase">
                <span>Party Name</span>
                <span>Amount</span>
              </div>

              <div className="max-h-[560px] overflow-y-auto">
                {filtered.map((p) => {
                  const active = p.id === selectedId;
                  return (
                    <button
                      key={p.id}
                      onClick={() => setSelectedId(p.id)}
                      className={`flex w-full items-center justify-between gap-2 border-b border-gray-50 px-3 py-2.5 text-left transition-colors duration-150 last:border-b-0 ${
                        active ? "bg-cyan-50" : "hover:bg-gray-50"
                      }`}
                    >
                      <span className="min-w-0">
                        <span className={`block truncate text-sm ${active ? "font-medium text-brand-accent" : "text-gray-700"}`}>
                          {p.name}
                        </span>
                        {p.partyGroup && <span className="block truncate text-[11px] text-gray-400">{p.partyGroup}</span>}
                      </span>
                      <span
                        className={`shrink-0 text-sm ${
                          p.balance > 0 ? "text-emerald-600" : p.balance < 0 ? "text-rose-600" : "text-gray-400"
                        }`}
                      >
                        {inr(Math.abs(p.balance))}
                      </span>
                    </button>
                  );
                })}
                {filtered.length === 0 && (
                  <div className="px-3 py-10 text-center text-sm text-gray-400">No parties match “{search}”.</div>
                )}
              </div>
            </div>

            {/* ---- Detail ---- */}
            {selected ? (
              <div className="space-y-4">
                <div className="rounded-xl border border-gray-200 bg-white p-4">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <h3 className="truncate text-lg font-semibold text-gray-800">{selected.name}</h3>
                        <button
                          onClick={() => setEditing(selected)}
                          title="Edit party"
                          className="rounded-md p-1 text-gray-400 transition-colors duration-150 hover:bg-cyan-50 hover:text-brand-accent"
                        >
                          <Pencil size={14} />
                        </button>
                        <span
                          className={`rounded-md px-2 py-0.5 text-[11px] font-medium ${
                            selected.partyType === "CUSTOMER" ? "bg-cyan-50 text-brand-accent" : "bg-indigo-50 text-indigo-600"
                          }`}
                        >
                          {selected.partyType === "CUSTOMER" ? "Customer" : "Supplier"}
                        </span>
                      </div>
                      <div className="mt-2 grid grid-cols-1 gap-x-8 gap-y-1 text-sm sm:grid-cols-2">
                        <Meta label="GSTIN" value={selected.gstin} mono />
                        <Meta label="GST Type" value={selected.gstType} />
                        <Meta label="Phone" value={selected.phone} icon={Phone} />
                        <Meta label="Email" value={selected.email} icon={Mail} />
                        <Meta label="State" value={selected.state} />
                        {settings.partyGrouping && <Meta label="Group" value={selected.partyGroup} />}
                      </div>
                      {selected.billingAddress && (
                        <div className="mt-2 flex items-start gap-1.5 text-sm text-gray-600">
                          <MapPin size={14} className="mt-0.5 shrink-0 text-gray-400" />
                          <span>{selected.billingAddress}</span>
                        </div>
                      )}
                    </div>

                    <div className="flex shrink-0 flex-col items-end gap-2">
                      <div className="text-right">
                        <div className="text-[11px] tracking-wide text-gray-400 uppercase">
                          {selected.balance >= 0 ? "You'll Collect" : "You'll Pay"}
                        </div>
                        <div className={`text-xl font-semibold ${selected.balance >= 0 ? "text-emerald-600" : "text-rose-600"}`}>
                          {inr(Math.abs(selected.balance))}
                        </div>
                      </div>
                      {selected.creditLimit != null && (
                        <span
                          className={`rounded-md px-2 py-0.5 text-[11px] font-medium ${
                            selected.balance > selected.creditLimit ? "bg-rose-50 text-rose-600" : "bg-gray-100 text-gray-500"
                          }`}
                        >
                          Limit {inr(selected.creditLimit)}
                          {selected.balance > selected.creditLimit ? " · exceeded" : ""}
                        </span>
                      )}
                      <RowMenu align="right" buttonLabel={`Actions for ${selected.name}`}>
                        {(close) => (
                          <>
                            <RowMenuItem icon={Pencil} label="Edit party" onClick={() => { close(); setEditing(selected); }} />
                            <RowMenuItem
                              icon={FileSpreadsheet}
                              label="Export ledger"
                              onClick={() => { close(); exportRowsToCsv(`${selected.name}-ledger`, ledgerHead, ledgerData); }}
                            />
                            <RowMenuItem
                              icon={Printer}
                              label="Print"
                              onClick={() => {
                                close();
                                printRows(
                                  `${selected.name} — Statement`,
                                  ledgerHead,
                                  ledgerRows.map((r) => [r.type, r.number ?? "", r.date ?? "", inr(r.total), inr(r.balance)]),
                                  selected.gstin ? `GSTIN ${selected.gstin}` : undefined
                                );
                              }}
                            />
                            <RowMenuDivider />
                            <RowMenuItem icon={Trash2} label="Delete party" tone="danger" onClick={() => { close(); remove(selected); }} />
                          </>
                        )}
                      </RowMenu>
                    </div>
                  </div>

                  {settings.fieldsEnabled.some(Boolean) && (
                    <div className="mt-3 flex flex-wrap gap-x-8 gap-y-1 border-t border-gray-100 pt-3 text-sm">
                      {[selected.field1, selected.field2, selected.field3, selected.field4].map((v, i) =>
                        settings.fieldsEnabled[i] && v ? (
                          <Meta key={i} label={settings.fieldNames[i] || `Field ${i + 1}`} value={v} />
                        ) : null
                      )}
                    </div>
                  )}
                </div>

                {/* Ledger */}
                <div className="overflow-hidden rounded-xl border border-gray-200 bg-white">
                  <div className="flex flex-wrap items-center justify-between gap-2 border-b border-gray-100 px-4 py-3">
                    <h4 className="text-sm font-semibold text-gray-800">Transactions</h4>
                    <div className="flex items-center gap-2">
                      <div className="flex items-center gap-1.5 rounded-lg border border-gray-200 px-2.5 py-1.5 transition-colors duration-150 focus-within:border-cyan-500">
                        <Search size={13} className="text-gray-400" />
                        <input
                          value={ledgerSearch}
                          onChange={(e) => setLedgerSearch(e.target.value)}
                          placeholder="Search"
                          className="w-28 bg-transparent text-sm outline-none"
                        />
                      </div>
                      <button
                        onClick={() =>
                          printRows(
                            `${selected.name} — Statement`,
                            ledgerHead,
                            ledgerRows.map((r) => [r.type, r.number ?? "", r.date ?? "", inr(r.total), inr(r.balance)])
                          )
                        }
                        title="Print"
                        className="rounded-lg p-1.5 text-gray-400 transition-colors duration-150 hover:bg-gray-100 hover:text-gray-600"
                      >
                        <Printer size={15} />
                      </button>
                      <button
                        onClick={() =>
                          downloadPdf(
                            `${selected.name} — Statement`,
                            ledgerHead,
                            ledgerRows.map((r) => [r.type, r.number ?? "", r.date ?? "", inr(r.total), inr(r.balance)]),
                            { subtitle: `Balance ${inr(selected.balance)}`, rightAlignFrom: 3 }
                          )
                        }
                        title="Download PDF"
                        className="rounded-lg p-1.5 text-brand-accent transition-colors duration-150 hover:bg-cyan-50"
                      >
                        <FileText size={15} />
                      </button>
                      <button
                        onClick={() => exportRowsToCsv(`${selected.name}-ledger`, ledgerHead, ledgerData)}
                        title="Export to Excel"
                        className="rounded-lg p-1.5 text-emerald-600 transition-colors duration-150 hover:bg-emerald-50"
                      >
                        <FileSpreadsheet size={15} />
                      </button>
                    </div>
                  </div>

                  {ledgerLoading ? (
                    <div className="flex min-h-[160px] items-center justify-center gap-2 text-sm text-gray-400">
                      <Spinner size={14} className="text-brand-accent" /> Loading ledger…
                    </div>
                  ) : ledgerRows.length === 0 ? (
                    <div className="px-4 py-12 text-center text-sm text-gray-400">
                      No transactions for this party yet.
                    </div>
                  ) : (
                    <div className="overflow-x-auto">
                      <table className="w-full min-w-[600px] border-collapse text-sm">
                        <thead>
                          <tr className="border-b border-gray-100 bg-gray-50 text-left text-gray-500">
                            <th className="px-4 py-2 font-medium">Type</th>
                            <th className="px-4 py-2 font-medium">Number</th>
                            <th className="px-4 py-2 font-medium">Date</th>
                            <th className="px-4 py-2 text-right font-medium">Total</th>
                            <th className="px-4 py-2 text-right font-medium">Balance</th>
                          </tr>
                        </thead>
                        <tbody>
                          {ledgerRows.map((r) => (
                            <tr
                              key={`${r.kind}-${r.id}`}
                              className="border-b border-gray-50 transition-colors duration-150 last:border-b-0 even:bg-gray-50/40 hover:bg-cyan-50/40"
                            >
                              <td className="px-4 py-2.5 text-gray-700">{r.type}</td>
                              <td className="px-4 py-2.5 font-mono text-xs text-gray-500">{r.number ?? "—"}</td>
                              <td className="px-4 py-2.5 text-gray-600">{r.date ?? "—"}</td>
                              <td className="px-4 py-2.5 text-right text-gray-800">{inr(r.total)}</td>
                              <td className={`px-4 py-2.5 text-right ${r.balance > 0 ? "text-rose-600" : "text-gray-400"}`}>
                                {r.balance ? inr(r.balance) : "—"}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              </div>
            ) : (
              <VyaparEmpty icon={Users} title="Select a party" hint="Pick someone on the left to see their details and ledger." />
            )}
          </div>
        )}
      </div>

      {(creating || editing) && (
        <PartyDialog
          existing={editing ?? undefined}
          onClose={() => {
            setCreating(false);
            setEditing(null);
          }}
          onSaved={(saved, again) => {
            load();
            setSelectedId(saved.id);
            if (!again) {
              setCreating(false);
              setEditing(null);
            }
          }}
        />
      )}

      {importing && (
        <PartyImportDialog
          onClose={() => setImporting(false)}
          onImported={() => {
            setImporting(false);
            load();
          }}
        />
      )}
    </VyaparShell>
  );
}

function Meta({
  label,
  value,
  mono,
  icon: Icon,
}: {
  label: string;
  value: string | null | undefined;
  mono?: boolean;
  icon?: React.ComponentType<{ size?: number; className?: string }>;
}) {
  if (!value) return null;
  return (
    <div className="flex items-center gap-1.5">
      <span className="shrink-0 text-[11px] tracking-wide text-gray-400 uppercase">{label}</span>
      {Icon && <Icon size={12} className="shrink-0 text-gray-300" />}
      <span className={`truncate text-gray-700 ${mono ? "font-mono text-xs" : ""}`}>{value}</span>
    </div>
  );
}
