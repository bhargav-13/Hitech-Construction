"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { ExternalLink, Mail, Phone, Search, Users } from "lucide-react";
import { ProcurementShell, ProcurementHeader, ProcurementEmpty } from "@/components/procurement/ProcurementShell";
import { VendorDrawer } from "@/components/procurement/VendorDrawer";
import { Spinner } from "@/components/Spinner";
import { Select } from "@/components/Select";
import { useVendors } from "@/lib/purchaseApi";
import { useAuthStore } from "@/lib/authStore";
import { projectAvatarColor } from "@/lib/projectHelpers";
import { inr } from "@/lib/format";
import type { Party } from "@/lib/vyaparApi";

/**
 * Vendors, inside Procurement.
 *
 * <p>Same story as Purchase Orders: the rail pointed at Vyapar's party list, which anyone without
 * VYAPAR:VIEW could not open. This is the supplier half of that list, read through Procurement's
 * own endpoint, with the row opening the vendor's full purchase history.
 */
export default function ProcurementVendorsPage() {
  const { rows, loading, error } = useVendors();
  const [q, setQ] = useState("");
  const [status, setStatus] = useState<"active" | "all">("active");
  const [open, setOpen] = useState<Party | null>(null);
  const canOpenVyapar = (useAuthStore((s) => s.user?.permissions) ?? []).includes("VYAPAR:VIEW");

  const visible = useMemo(() => {
    const query = q.trim().toLowerCase();
    return rows.filter((v) => {
      if (status === "active" && !v.isActive) return false;
      if (!query) return true;
      return (
        v.name.toLowerCase().includes(query) ||
        (v.phone ?? "").toLowerCase().includes(query) ||
        (v.gstin ?? "").toLowerCase().includes(query) ||
        (v.city ?? "").toLowerCase().includes(query)
      );
    });
  }, [rows, q, status]);

  // Supplier balances are held negative (money we owe); flip the sign for a readable payable total.
  const payable = useMemo(
    () => visible.reduce((a, v) => a + Math.max(0, -Number(v.balance ?? 0)), 0),
    [visible],
  );

  return (
    <ProcurementShell>
      <ProcurementHeader
        title="Vendors"
        subtitle="Every supplier you buy from. Click a row for their purchase history and balance."
        right={
          canOpenVyapar ? (
            <Link
              href="/vyapar/parties"
              className="flex items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-600 transition-colors duration-150 hover:border-brand-accent hover:text-brand-accent"
            >
              Manage in Vyapar <ExternalLink size={13} />
            </Link>
          ) : undefined
        }
      />

      {error && <div className="mb-3 rounded-lg bg-rose-50 px-4 py-2 text-sm text-rose-600">{error}</div>}

      <div className="mb-3 flex flex-wrap items-center gap-2">
        <div className="flex min-w-[220px] flex-1 items-center gap-2 rounded-lg border border-gray-200 bg-white px-3 py-2 focus-within:border-cyan-500">
          <Search size={15} className="text-gray-400" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search name, phone, GSTIN or city…"
            className="w-full bg-transparent text-sm outline-none"
          />
        </div>
        <Select
          value={status}
          onChange={(v) => setStatus(v as typeof status)}
          size="sm"
          className="w-40"
          options={[
            { value: "active", label: "Active only" },
            { value: "all", label: "All vendors" },
          ]}
        />
      </div>

      <div className="mb-3 flex flex-wrap gap-3 text-xs text-gray-500">
        <span>
          {visible.length} of {rows.length} vendor{rows.length === 1 ? "" : "s"}
        </span>
        <span className="tabular-nums">
          Payable <span className="font-semibold text-rose-600">{inr(payable)}</span>
        </span>
      </div>

      {loading ? (
        <div className="flex items-center justify-center gap-2 rounded-xl border border-dashed border-gray-300 bg-white py-16 text-sm text-gray-400">
          <Spinner size={16} className="text-brand-accent" /> Loading…
        </div>
      ) : visible.length === 0 ? (
        <ProcurementEmpty
          icon={Users}
          title="No vendors here"
          hint="Suppliers appear as they are added to the books, or created from an awarded enquiry."
        />
      ) : (
        <div className="overflow-x-auto rounded-xl border border-gray-200 bg-white">
          <table className="min-w-full text-sm">
            <thead className="border-b border-gray-200 bg-gray-50 text-left text-[11px] font-semibold tracking-wide text-gray-500 uppercase">
              <tr>
                <th className="px-4 py-3">Vendor</th>
                <th className="px-4 py-3">Contact</th>
                <th className="px-4 py-3">GSTIN</th>
                <th className="px-4 py-3">Location</th>
                <th className="px-4 py-3 text-right">Balance</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {visible.map((v) => {
                const owed = -Number(v.balance ?? 0);
                return (
                  <tr
                    key={v.id}
                    onClick={() => setOpen(v)}
                    title={`Open ${v.name}`}
                    className="cursor-pointer transition-colors duration-150 hover:bg-cyan-50/30"
                  >
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2.5">
                        <div
                          className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-[11px] font-semibold text-white ${projectAvatarColor(
                            String(v.id),
                          )}`}
                        >
                          {v.name.trim().slice(0, 2).toUpperCase()}
                        </div>
                        <div className="min-w-0">
                          <div className="font-medium text-gray-800">{v.name}</div>
                          {!v.isActive && <div className="text-[11px] text-gray-400">Inactive</div>}
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-xs text-gray-600">
                      {v.phone && (
                        <div className="flex items-center gap-1">
                          <Phone size={11} className="text-gray-400" /> {v.phone}
                        </div>
                      )}
                      {v.email && (
                        <div className="flex items-center gap-1 truncate">
                          <Mail size={11} className="text-gray-400" /> {v.email}
                        </div>
                      )}
                      {!v.phone && !v.email && "—"}
                    </td>
                    <td className="px-4 py-3 font-mono text-xs text-gray-600">{v.gstin ?? "—"}</td>
                    <td className="px-4 py-3 text-xs text-gray-600">
                      {[v.city, v.state].filter(Boolean).join(", ") || "—"}
                    </td>
                    <td
                      className={`px-4 py-3 text-right font-medium whitespace-nowrap tabular-nums ${
                        owed > 0 ? "text-rose-600" : owed < 0 ? "text-emerald-600" : "text-gray-400"
                      }`}
                    >
                      {inr(Math.abs(owed))}
                      <div className="text-[10px] font-normal text-gray-400">
                        {owed > 0 ? "we owe" : owed < 0 ? "in credit" : "settled"}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {open && <VendorDrawer vendor={open} canOpenVyapar={canOpenVyapar} onClose={() => setOpen(null)} />}
    </ProcurementShell>
  );
}
