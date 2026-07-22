"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { VyaparShell, VyaparEmpty } from "@/components/vyapar/VyaparShell";
import { Spinner } from "@/components/Spinner";
import { RowMenu, RowMenuItem } from "@/components/RowMenu";
import { inr } from "@/lib/format";
import { exportRowsToCsv, downloadPdf } from "@/lib/vyaparExport";
import * as vyapar from "@/lib/vyaparApi";
import type { Cheque } from "@/lib/vyaparApi";
import { CheckCircle2, FileSpreadsheet, FileText, RotateCcw, Search, Wallet } from "lucide-react";

const STATUS_STYLE: Record<string, string> = {
  OPEN: "bg-amber-50 text-amber-700",
  DEPOSITED: "bg-emerald-50 text-emerald-700",
  WITHDRAWN: "bg-rose-50 text-rose-700",
  REOPENED: "bg-blue-50 text-blue-700",
};

/** Cheques — open cheques received or issued, and their deposit / withdraw status. */
export default function ChequesPage() {
  const [cheques, setCheques] = useState<Cheque[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [tab, setTab] = useState<"OPEN" | "CLOSED">("OPEN");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      setCheques(await vyapar.getCheques());
    } catch {
      setCheques([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const rows = useMemo(() => {
    const q = search.trim().toLowerCase();
    return cheques.filter((c) => {
      const open = c.status === "OPEN" || c.status === "REOPENED";
      if (tab === "OPEN" ? !open : open) return false;
      if (!q) return true;
      return [c.chequeNo, c.partyName, c.invoiceNo].some((f) => f?.toLowerCase().includes(q));
    });
  }, [cheques, search, tab]);

  const totals = useMemo(
    () => ({
      in: rows.filter((c) => c.direction === "IN").reduce((s, c) => s + c.amount, 0),
      out: rows.filter((c) => c.direction === "OUT").reduce((s, c) => s + c.amount, 0),
    }),
    [rows]
  );

  async function setStatus(c: Cheque, status: Cheque["status"]) {
    try {
      await vyapar.updateCheque(c.id, { status, transferDate: new Date().toISOString().slice(0, 10) });
      load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't update this cheque.");
    }
  }

  const head = ["Cheque No", "Party", "Ref", "Direction", "Date", "Amount", "Status"];
  const data = rows.map((c) => [c.chequeNo, c.partyName ?? "", c.invoiceNo ?? "", c.direction, c.chequeDate ?? "", c.amount, c.status]);

  return (
    <VyaparShell>
      <div className="animate-fade-in space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h2 className="text-base font-semibold text-gray-800">Cheques</h2>
            <p className="mt-0.5 text-sm text-gray-500">
              To deposit <span className="font-medium text-emerald-600">{inr(totals.in)}</span> · To clear{" "}
              <span className="font-medium text-rose-600">{inr(totals.out)}</span>
            </p>
          </div>
          <RowMenu align="right" buttonLabel="Cheque export">
            {(close) => (
              <>
                <RowMenuItem icon={FileSpreadsheet} label="Export cheques" onClick={() => { close(); exportRowsToCsv("cheques", head, data); }} />
                <RowMenuItem
                  icon={FileText}
                  label="Download PDF"
                  onClick={() => {
                    close();
                    downloadPdf("Cheques", head, rows.map((c) => [c.chequeNo, c.partyName ?? "", c.invoiceNo ?? "", c.direction, c.chequeDate ?? "", inr(c.amount), c.status]), { rightAlignFrom: 5 });
                  }}
                />
              </>
            )}
          </RowMenu>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {(["OPEN", "CLOSED"] as const).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`rounded-full px-3.5 py-1.5 text-sm font-medium transition-all duration-150 active:scale-95 ${
                tab === t ? "bg-navy text-white shadow-sm" : "bg-white text-gray-600 ring-1 ring-gray-200 hover:bg-gray-50"
              }`}
            >
              {t === "OPEN" ? "Open" : "Closed"}
            </button>
          ))}
          <div className="flex min-w-[200px] flex-1 items-center gap-2 rounded-lg border border-gray-200 bg-white px-3 py-2 transition-colors duration-150 focus-within:border-cyan-500">
            <Search size={15} className="text-gray-400" />
            <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search cheque no / party" className="w-full bg-transparent text-sm outline-none" />
          </div>
        </div>

        {error && <div className="rounded-lg bg-rose-50 px-4 py-2 text-sm text-rose-600">{error}</div>}

        {loading ? (
          <div className="flex min-h-[240px] items-center justify-center gap-2 rounded-xl border border-dashed border-gray-300 bg-white text-sm text-gray-400">
            <Spinner size={16} className="text-brand-accent" /> Loading cheques…
          </div>
        ) : rows.length === 0 ? (
          <VyaparEmpty
            icon={Wallet}
            title={tab === "OPEN" ? "No open cheques" : "No closed cheques"}
            hint="Cheques recorded against invoices and payments appear here."
          />
        ) : (
          <div className="overflow-x-auto rounded-xl border border-gray-200 bg-white">
            <table className="w-full min-w-[760px] border-collapse text-sm">
              <thead>
                <tr className="border-b border-gray-100 bg-gray-50 text-left text-gray-500">
                  <th className="px-4 py-2 font-medium">Cheque No</th>
                  <th className="px-4 py-2 font-medium">Party</th>
                  <th className="px-4 py-2 font-medium">Ref</th>
                  <th className="px-4 py-2 font-medium">Date</th>
                  <th className="px-4 py-2 text-right font-medium">Amount</th>
                  <th className="px-4 py-2 font-medium">Status</th>
                  <th className="w-10 px-4 py-2" />
                </tr>
              </thead>
              <tbody>
                {rows.map((c) => (
                  <tr key={c.id} className="border-b border-gray-50 transition-colors duration-150 last:border-b-0 even:bg-gray-50/40 hover:bg-cyan-50/40">
                    <td className="px-4 py-2.5 font-mono text-xs text-gray-700">{c.chequeNo}</td>
                    <td className="px-4 py-2.5 text-gray-700">{c.partyName ?? "—"}</td>
                    <td className="px-4 py-2.5 font-mono text-xs text-gray-500">{c.invoiceNo ?? "—"}</td>
                    <td className="px-4 py-2.5 text-gray-600">{c.chequeDate ?? "—"}</td>
                    <td className={`px-4 py-2.5 text-right font-medium ${c.direction === "IN" ? "text-emerald-600" : "text-rose-600"}`}>{inr(c.amount)}</td>
                    <td className="px-4 py-2.5">
                      <span className={`rounded-md px-2 py-0.5 text-xs font-medium ${STATUS_STYLE[c.status] ?? "bg-gray-100 text-gray-600"}`}>{c.status}</span>
                    </td>
                    <td className="px-4 py-2.5">
                      <RowMenu align="right" buttonLabel={`Actions for ${c.chequeNo}`}>
                        {(close) =>
                          c.status === "OPEN" || c.status === "REOPENED" ? (
                            <RowMenuItem
                              icon={CheckCircle2}
                              label={c.direction === "IN" ? "Mark deposited" : "Mark withdrawn"}
                              onClick={() => { close(); setStatus(c, c.direction === "IN" ? "DEPOSITED" : "WITHDRAWN"); }}
                            />
                          ) : (
                            <RowMenuItem icon={RotateCcw} label="Reopen cheque" onClick={() => { close(); setStatus(c, "REOPENED"); }} />
                          )
                        }
                      </RowMenu>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </VyaparShell>
  );
}
