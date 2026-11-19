"use client";

import { useCallback, useEffect, useState } from "react";
import { ChevronDown, ChevronRight, RotateCcw, Search, Trash2 } from "lucide-react";
import { apiRequest } from "@/lib/api";
import { formatDateTimeIST } from "@/lib/datetime";
import { useCompanies } from "@/lib/companyScope";

interface BinEntry {
  batch: number;
  deletedAt: string;
  deletedBy: number | null;
  deletedByName: string | null;
  companyId: number | null;
  kind: string;
  title: string;
  total: number;
  counts: Record<string, number>;
}

interface BinRow {
  table: string;
  kind: string;
  id: number | null;
  title: string;
}

const BASE = "/api/v1/recycle-bin";

/**
 * KAN-107: Setting → Recycle Bin (Super Admin). Everything deleted anywhere — documents, payments,
 * parties, tasks, attendance, tenders, files … — lands here with what went with it. Restore puts it
 * all back as it was; Delete permanently removes it for good. Kept until someone deletes it.
 */
export function RecycleBin() {
  const [entries, setEntries] = useState<BinEntry[] | null>(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState<number | null>(null);
  const [open, setOpen] = useState<number | null>(null);
  const [rows, setRows] = useState<Record<number, BinRow[]>>({});
  const [search, setSearch] = useState("");
  const { companies } = useCompanies();
  const companyName = (id: number | null) => (id == null ? "" : companies.find((c) => Number(c.id) === id)?.name ?? "");

  const load = useCallback(async () => {
    try {
      setEntries(await apiRequest<BinEntry[]>(BASE));
      setError("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't load the recycle bin.");
      setEntries([]);
    }
  }, []);

  useEffect(() => {
    let off = false;
    apiRequest<BinEntry[]>(BASE)
      .then((r) => !off && setEntries(r))
      .catch((e) => {
        if (off) return;
        setError(e instanceof Error ? e.message : "Couldn't load the recycle bin.");
        setEntries([]);
      });
    return () => {
      off = true;
    };
  }, []);

  async function toggle(batch: number) {
    if (open === batch) return setOpen(null);
    setOpen(batch);
    if (!rows[batch]) {
      try {
        const r = await apiRequest<BinRow[]>(`${BASE}/${batch}`);
        setRows((m) => ({ ...m, [batch]: r }));
      } catch {
        /* the summary is still there */
      }
    }
  }

  async function restore(e: BinEntry) {
    if (!window.confirm(`Restore ${e.kind.toLowerCase()} "${e.title}" and the ${e.total - 1} record(s) deleted with it?`)) return;
    setBusy(e.batch);
    setError("");
    setNotice("");
    try {
      const r = await apiRequest<{ restored: number }>(`${BASE}/${e.batch}/restore`, { method: "POST" });
      setNotice(`Restored ${e.kind.toLowerCase()} "${e.title}" (${r.restored} record${r.restored === 1 ? "" : "s"}).`);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't restore it.");
    } finally {
      setBusy(null);
    }
  }

  async function purge(e: BinEntry) {
    if (!window.confirm(`Delete "${e.title}" permanently? It will be removed from the database and can't be restored.`)) return;
    setBusy(e.batch);
    setError("");
    setNotice("");
    try {
      await apiRequest(`${BASE}/${e.batch}`, { method: "DELETE" });
      setNotice(`"${e.title}" deleted permanently.`);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't delete it.");
    } finally {
      setBusy(null);
    }
  }

  const q = search.trim().toLowerCase();
  const shown = (entries ?? []).filter(
    (e) => !q || [e.title, e.kind, e.deletedByName ?? ""].some((v) => v.toLowerCase().includes(q)),
  );

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-base font-semibold text-gray-800">Recycle Bin</h2>
        <p className="text-sm text-gray-500">
          Everything deleted in the ERP, with what was deleted along with it. Restore puts it back exactly as it was;
          delete permanently removes it from the database. Only Super Admin sees this.
        </p>
      </div>

      <div className="flex items-center gap-2 rounded-lg border border-gray-200 bg-white px-3 py-2 focus-within:border-cyan-500">
        <Search size={15} className="text-gray-400" />
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search by name, type or who deleted it"
          className="w-full bg-transparent text-sm outline-none"
        />
      </div>

      {error && <div className="rounded-lg bg-rose-50 px-4 py-2 text-sm text-rose-700">{error}</div>}
      {notice && <div className="rounded-lg bg-emerald-50 px-4 py-2 text-sm text-emerald-700">{notice}</div>}

      {entries === null ? (
        <div className="py-10 text-center text-sm text-gray-400">Loading…</div>
      ) : shown.length === 0 ? (
        <div className="rounded-xl border border-dashed border-gray-200 bg-white py-12 text-center text-sm text-gray-400">
          {entries.length === 0 ? "The recycle bin is empty." : "Nothing matches that search."}
        </div>
      ) : (
        <div className="overflow-hidden rounded-xl border border-gray-200 bg-white">
          {shown.map((e) => {
            const isOpen = open === e.batch;
            const others = Object.entries(e.counts).filter(([k]) => k !== e.kind || e.counts[k] > 1);
            return (
              <div key={e.batch} className="border-b border-gray-100 last:border-b-0">
                <div className="flex flex-wrap items-start gap-3 px-4 py-3">
                  <button onClick={() => void toggle(e.batch)} className="mt-0.5 rounded p-0.5 text-gray-400 hover:bg-gray-100" aria-label="Show details">
                    {isOpen ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
                  </button>
                  <button onClick={() => void toggle(e.batch)} className="min-w-0 flex-1 text-left">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="rounded-md bg-gray-100 px-2 py-0.5 text-[11px] font-medium text-gray-600">{e.kind}</span>
                      <span className="truncate text-sm font-medium text-gray-800">{e.title || "(no name)"}</span>
                      {companyName(e.companyId) && <span className="text-[11px] text-gray-400">· {companyName(e.companyId)}</span>}
                    </div>
                    <div className="mt-1 text-xs text-gray-500">
                      Deleted {formatDateTimeIST(e.deletedAt)}
                      {e.deletedByName ? ` by ${e.deletedByName}` : ""}
                      {e.total > 1 && ` · with ${others.map(([k, n]) => `${n} ${k.toLowerCase()}`).join(", ")}`}
                    </div>
                  </button>
                  <div className="flex shrink-0 gap-1.5">
                    <button
                      disabled={busy === e.batch}
                      onClick={() => void restore(e)}
                      className="flex items-center gap-1 rounded-lg border border-emerald-200 bg-emerald-50 px-2.5 py-1.5 text-xs font-medium text-emerald-700 hover:bg-emerald-100 disabled:opacity-50"
                    >
                      <RotateCcw size={13} /> Restore
                    </button>
                    <button
                      disabled={busy === e.batch}
                      onClick={() => void purge(e)}
                      className="flex items-center gap-1 rounded-lg border border-rose-200 bg-white px-2.5 py-1.5 text-xs font-medium text-rose-600 hover:bg-rose-50 disabled:opacity-50"
                    >
                      <Trash2 size={13} /> Delete permanently
                    </button>
                  </div>
                </div>
                {isOpen && (
                  <div className="border-t border-gray-100 bg-gray-50/50 px-4 py-2 sm:pl-11">
                    {!rows[e.batch] ? (
                      <div className="py-2 text-xs text-gray-400">Loading…</div>
                    ) : (
                      <ul className="max-h-64 space-y-0.5 overflow-y-auto text-xs">
                        {rows[e.batch].map((r, i) => (
                          <li key={i} className="flex gap-2 text-gray-600">
                            <span className="w-40 shrink-0 text-gray-400">{r.kind}</span>
                            <span className="truncate">{r.title || `#${r.id ?? ""}`}</span>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
