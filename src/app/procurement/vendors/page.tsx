"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { ArrowUpRight, Phone, Search, Star, Users } from "lucide-react";
import { ProcurementShell, ProcurementEmpty, ProcurementHeader } from "@/components/procurement/ProcurementShell";
import { VENDOR_SEED } from "@/lib/procurementTypes";

export default function VendorsPage() {
  const [search, setSearch] = useState("");

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return VENDOR_SEED;
    return VENDOR_SEED.filter((v) => [v.name, v.type, v.category].some((x) => x.toLowerCase().includes(q)));
  }, [search]);

  return (
    <ProcurementShell>
      <ProcurementHeader
        title="Vendors"
        subtitle="Suppliers you buy from — the same records as Vyapar parties of supplier type."
        right={
          <Link href="/vyapar/parties" className="inline-flex items-center gap-1.5 rounded-lg border border-gray-200 px-3 py-2 text-sm font-medium text-brand-accent transition-colors duration-150 hover:bg-brand-accent/5">
            Manage in Vyapar <ArrowUpRight size={14} />
          </Link>
        }
      />

      <div className="mb-4 flex items-center gap-2 rounded-lg border border-gray-200 bg-white px-3 py-2 focus-within:border-cyan-500">
        <Search size={15} className="text-gray-400" />
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search vendor, type or category"
          className="w-full bg-transparent text-sm outline-none"
        />
      </div>

      {filtered.length === 0 ? (
        <ProcurementEmpty icon={Users} title="No vendors found" hint="Try a different search." />
      ) : (
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
          {filtered.map((v) => (
            <div key={v.name} className="rounded-xl border border-gray-200 bg-white p-4">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="truncate text-sm font-semibold text-gray-800">{v.name}</div>
                  <div className="mt-0.5 text-xs text-gray-400">{v.type} · {v.category}</div>
                </div>
                <span className="inline-flex shrink-0 items-center gap-0.5 rounded-full bg-amber-50 px-2 py-0.5 text-[11px] font-medium text-amber-600">
                  <Star size={11} className="fill-current" /> {v.rating.toFixed(1)}
                </span>
              </div>
              <div className="mt-3 flex items-center justify-between border-t border-gray-50 pt-3 text-xs text-gray-500">
                <span className="inline-flex items-center gap-1">
                  <Phone size={12} className="text-gray-400" /> {v.phone}
                </span>
                <span className="text-gray-400">{v.orders} orders</span>
              </div>
            </div>
          ))}
        </div>
      )}
    </ProcurementShell>
  );
}
