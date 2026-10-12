"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { ExternalLink, FileText, Search } from "lucide-react";
import { Spinner } from "@/components/Spinner";
import { Select } from "@/components/Select";
import { ProcurementEmpty } from "@/components/procurement/ProcurementShell";
import { PurchaseDocumentDrawer } from "@/components/procurement/PurchaseDocumentDrawer";
import { SortTh } from "@/components/vyapar/SortTh";
import { useAuthStore } from "@/lib/authStore";
import { inr } from "@/lib/format";
import { useProjects } from "@/lib/useProjects";
import { useTableSort, type SortDir } from "@/lib/useTableSort";
import type { Invoice } from "@/lib/vyaparApi";

/**
 * Newest-created first by default — the order Onsite opens its lists in, which is what the client's
 * team is used to (it is not the document date: a PO typed today for last week still comes first).
 */
const SORT_OPTIONS: { value: string; label: string; key: string; dir: SortDir }[] = [
  { value: "created-desc", label: "Newest first", key: "created", dir: "desc" },
  { value: "created-asc", label: "Oldest first", key: "created", dir: "asc" },
  { value: "date-desc", label: "Date: latest", key: "date", dir: "desc" },
  { value: "date-asc", label: "Date: earliest", key: "date", dir: "asc" },
  { value: "total-desc", label: "Amount: high to low", key: "total", dir: "desc" },
  { value: "total-asc", label: "Amount: low to high", key: "total", dir: "asc" },
  { value: "balance-desc", label: "Balance: high to low", key: "balance", dir: "desc" },
  { value: "vendor-asc", label: "Vendor A–Z", key: "vendor", dir: "asc" },
  { value: "number-asc", label: "Number", key: "number", dir: "asc" },
];

/** Vyapar's own paid/partial/unpaid wording, coloured to match the rest of Procurement. */
export const DOC_STATUS_CLS: Record<string, string> = {
  Paid: "bg-emerald-50 text-emerald-700 ring-emerald-600/20",
  Partial: "bg-amber-50 text-amber-700 ring-amber-600/20",
  Unpaid: "bg-rose-50 text-rose-700 ring-rose-600/20",
  Cancelled: "bg-gray-100 text-gray-500 ring-gray-400/20",
};

/**
 * The list behind both Purchase Orders and Purchase Bills — the two screens differ only in which
 * documents they load and what the columns are called, so they share everything else: search, a
 * status filter, totals, and a row that opens the document.
 */
export function PurchaseDocumentList({
  rows,
  loading,
  error,
  noun,
  emptyHint,
  vyaparHref,
}: {
  rows: Invoice[];
  loading: boolean;
  error: string;
  /** "purchase order" / "purchase bill", used in the empty state and the drawer title. */
  noun: string;
  emptyHint: string;
  /** Where the equivalent Vyapar screen lives — only offered to people who can actually open it. */
  vyaparHref: string;
}) {
  const [q, setQ] = useState("");
  const [status, setStatus] = useState("all");
  const [vendor, setVendor] = useState("all");
  const [project, setProject] = useState("all");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const { projects } = useProjects();
  /**
   * Whose documents to show.
   *
   * This screen used to list the firm's entire purchase ledger — 245 bills, nearly all of them cash
   * purchases and one-offs typed straight into Vyapar — so the module's own screen could not tell a
   * buyer what the module had actually produced. It now opens on documents raised *through*
   * procurement: an RFQ award, a subcontractor bill. Those carry a source stamp; everything older
   * does not, and rather than hide it behind a rule nobody can see, "Everything" stays one click
   * away and the count says how many are being left out.
   */
  const [source, setSource] = useState<"procurement" | "all">("procurement");
  const [open, setOpen] = useState<Invoice | null>(null);
  // Vyapar's screens are gated on VYAPAR:VIEW, so the handoff link is only shown to people who
  // would get through — the whole reason these screens exist is that most buyers would not.
  const canOpenVyapar = (useAuthStore((s) => s.user?.permissions) ?? []).includes("VYAPAR:VIEW");

  const statuses = useMemo(
    () => [...new Set(rows.map((r) => r.status).filter(Boolean))].sort() as string[],
    [rows],
  );

  const fromProcurement = useMemo(() => rows.filter((r) => r.sourceModule === "PROCUREMENT"), [rows]);

  const vendors = useMemo(
    () => [...new Set(rows.map((r) => r.partyName ?? "").filter(Boolean))].sort((a, b) => a.localeCompare(b)),
    [rows],
  );
  const projectIds = useMemo(() => new Set(rows.map((r) => r.projectId).filter((p) => p != null)), [rows]);

  const filtered = useMemo(() => {
    const query = q.trim().toLowerCase();
    const pool = source === "procurement" ? fromProcurement : rows;
    return pool.filter((r) => {
      if (status !== "all" && r.status !== status) return false;
      if (vendor !== "all" && (r.partyName ?? "") !== vendor) return false;
      if (project !== "all" && String(r.projectId ?? "") !== project) return false;
      if (from && (r.invoiceDate ?? "") < from) return false;
      if (to && (r.invoiceDate ?? "") > to) return false;
      if (!query) return true;
      return (
        (r.invoiceNo ?? "").toLowerCase().includes(query) ||
        (r.partyName ?? "").toLowerCase().includes(query) ||
        (r.notes ?? "").toLowerCase().includes(query)
      );
    });
  }, [rows, fromProcurement, source, q, status, vendor, project, from, to]);

  const accessors = useMemo(
    () => ({
      // Created time, with the id as the tie-break for rows that predate the field.
      created: (r: Invoice) => `${r.createdAt ?? ""}#${String(r.id).padStart(12, "0")}`,
      number: (r: Invoice) => r.invoiceNo ?? "",
      vendor: (r: Invoice) => r.partyName ?? r.billingName ?? "",
      date: (r: Invoice) => r.invoiceDate ?? "",
      total: (r: Invoice) => Number(r.total ?? 0),
      balance: (r: Invoice) => Number(r.balance ?? 0),
      status: (r: Invoice) => r.status ?? "",
    }),
    [],
  );
  const { sorted: visible, sortKey, sortDir, toggle, setSort } = useTableSort(filtered, accessors, {
    key: "created",
    dir: "desc",
  });
  const sortValue = SORT_OPTIONS.find((o) => o.key === sortKey && o.dir === sortDir)?.value ?? "custom";
  const filtersOn = vendor !== "all" || project !== "all" || !!from || !!to || status !== "all" || !!q;

  const totals = useMemo(
    () => ({
      value: visible.reduce((a, r) => a + Number(r.total ?? 0), 0),
      outstanding: visible.reduce((a, r) => a + Number(r.balance ?? 0), 0),
    }),
    [visible],
  );

  if (loading) {
    return (
      <div className="flex items-center justify-center gap-2 rounded-xl border border-dashed border-gray-300 bg-white py-16 text-sm text-gray-400">
        <Spinner size={16} className="text-brand-accent" /> Loading…
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {error && <div className="rounded-lg bg-rose-50 px-4 py-2 text-sm text-rose-600">{error}</div>}

      <div className="flex flex-wrap items-center gap-2">
        <div className="flex min-w-[220px] flex-1 items-center gap-2 rounded-lg border border-gray-200 bg-white px-3 py-2 focus-within:border-cyan-500">
          <Search size={15} className="text-gray-400" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder={`Search ${noun}s, vendor or note…`}
            className="w-full bg-transparent text-sm outline-none"
          />
        </div>
        <Select
          value={source}
          onChange={(v) => setSource(v as "procurement" | "all")}
          size="sm"
          className="w-52"
          options={[
            { value: "procurement", label: `Raised in Procurement (${fromProcurement.length})` },
            { value: "all", label: `Everything in the books (${rows.length})` },
          ]}
        />
        <Select
          value={status}
          onChange={setStatus}
          size="sm"
          className="w-44"
          options={[{ value: "all", label: "All statuses" }, ...statuses.map((s) => ({ value: s, label: s }))]}
        />
        <Select
          value={vendor}
          onChange={setVendor}
          size="sm"
          className="w-52"
          options={[{ value: "all", label: "All vendors" }, ...vendors.map((v) => ({ value: v, label: v }))]}
        />
        <Select
          value={project}
          onChange={setProject}
          size="sm"
          className="w-56"
          options={[
            { value: "all", label: "All projects" },
            ...projects
              .filter((p) => projectIds.has(Number(p.id)))
              .map((p) => ({ value: String(p.id), label: p.name })),
          ]}
        />
        <label className="flex items-center gap-1 text-xs text-gray-500">
          From
          <input
            type="date"
            value={from}
            onChange={(e) => setFrom(e.target.value)}
            className="rounded-lg border border-gray-200 bg-white px-2 py-1.5 text-xs"
          />
        </label>
        <label className="flex items-center gap-1 text-xs text-gray-500">
          To
          <input
            type="date"
            value={to}
            onChange={(e) => setTo(e.target.value)}
            className="rounded-lg border border-gray-200 bg-white px-2 py-1.5 text-xs"
          />
        </label>
        <Select
          value={sortValue}
          onChange={(v) => {
            const o = SORT_OPTIONS.find((x) => x.value === v);
            if (o) setSort(o.key, o.dir);
          }}
          size="sm"
          className="w-52"
          options={[
            ...SORT_OPTIONS.map((o) => ({ value: o.value, label: `Sort: ${o.label}` })),
            ...(sortValue === "custom" ? [{ value: "custom", label: "Sort: by column" }] : []),
          ]}
        />
        {filtersOn && (
          <button
            type="button"
            onClick={() => {
              setQ("");
              setStatus("all");
              setVendor("all");
              setProject("all");
              setFrom("");
              setTo("");
            }}
            className="text-xs text-gray-500 underline-offset-2 hover:text-brand-accent hover:underline"
          >
            Clear filters
          </button>
        )}
        {canOpenVyapar && (
          <Link
            href={vyaparHref}
            className="flex items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-600 transition-colors duration-150 hover:border-brand-accent hover:text-brand-accent"
          >
            Edit in Vyapar <ExternalLink size={13} />
          </Link>
        )}
      </div>

      <div className="flex flex-wrap gap-3 text-xs text-gray-500">
        <span>
          {visible.length} of {rows.length} {noun}
          {rows.length === 1 ? "" : "s"}
        </span>
        <span className="tabular-nums">
          Value <span className="font-semibold text-gray-800">{inr(totals.value)}</span>
        </span>
        <span className="tabular-nums">
          Outstanding <span className="font-semibold text-amber-700">{inr(totals.outstanding)}</span>
        </span>
      </div>

      {visible.length === 0 ? (
        <ProcurementEmpty
          icon={FileText}
          title={`No ${noun}s here`}
          // Say why the list is empty rather than implying nothing was ever bought: on a fresh
          // install nothing carries the stamp yet, and "Everything in the books" holds the history.
          hint={
            source === "procurement" && rows.length > 0
              ? `None of these ${noun}s were raised through Procurement. Switch to “Everything in the books” to see the ${rows.length} already in Vyapar.`
              : emptyHint
          }
        />
      ) : (
        <div className="overflow-x-auto rounded-xl border border-gray-200 bg-white">
          <table className="min-w-full text-sm">
            <thead className="border-b border-gray-200 bg-gray-50 text-left text-[11px] font-semibold tracking-wide text-gray-500 uppercase">
              <tr>
                <SortTh label="Number" sortKey="number" activeKey={sortKey} dir={sortDir} onSort={toggle} className="py-3" />
                <SortTh label="Vendor" sortKey="vendor" activeKey={sortKey} dir={sortDir} onSort={toggle} className="py-3" />
                <SortTh label="Date" sortKey="date" activeKey={sortKey} dir={sortDir} onSort={toggle} className="py-3" />
                <SortTh label="Total" sortKey="total" align="right" activeKey={sortKey} dir={sortDir} onSort={toggle} className="py-3" />
                <th className="px-4 py-3 text-right">Paid</th>
                <SortTh label="Balance" sortKey="balance" align="right" activeKey={sortKey} dir={sortDir} onSort={toggle} className="py-3" />
                <SortTh label="Status" sortKey="status" activeKey={sortKey} dir={sortDir} onSort={toggle} className="py-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {visible.map((d) => (
                <tr
                  key={d.id}
                  onClick={() => setOpen(d)}
                  title={`Open ${d.invoiceNo ?? noun}`}
                  className="cursor-pointer transition-colors duration-150 hover:bg-cyan-50/30"
                >
                  <td className="px-4 py-3">
                    <span className="font-medium text-brand-accent">{d.invoiceNo || "—"}</span>
                    {d.lines?.length > 0 && (
                      <div className="text-[11px] text-gray-400">
                        {d.lines.length} line{d.lines.length === 1 ? "" : "s"}
                      </div>
                    )}
                  </td>
                  <td className="px-4 py-3 text-gray-800">{d.partyName ?? d.billingName ?? "—"}</td>
                  <td className="px-4 py-3 text-xs text-gray-600">{d.invoiceDate ?? "—"}</td>
                  <td className="px-4 py-3 text-right font-medium whitespace-nowrap text-gray-800 tabular-nums">
                    {inr(d.total)}
                  </td>
                  <td className="px-4 py-3 text-right whitespace-nowrap text-gray-600 tabular-nums">{inr(d.paidAmount)}</td>
                  <td
                    className={`px-4 py-3 text-right font-medium whitespace-nowrap tabular-nums ${
                      Number(d.balance) > 0 ? "text-amber-700" : "text-gray-400"
                    }`}
                  >
                    {inr(d.balance)}
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className={`rounded-full px-2 py-0.5 text-[11px] font-medium ring-1 ring-inset ${
                        DOC_STATUS_CLS[d.status ?? ""] ?? DOC_STATUS_CLS.Unpaid
                      }`}
                    >
                      {d.status ?? "—"}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {open && (
        <PurchaseDocumentDrawer
          documentId={open.id}
          fallback={open}
          noun={noun}
          canOpenVyapar={canOpenVyapar}
          onClose={() => setOpen(null)}
        />
      )}
    </div>
  );
}
