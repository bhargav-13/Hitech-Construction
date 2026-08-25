"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { ExternalLink, Mail, MapPin, Phone, ShieldCheck } from "lucide-react";
import { Drawer } from "@/components/Drawer";
import { Spinner } from "@/components/Spinner";
import { getVendorLedger } from "@/lib/purchaseApi";
import { inr } from "@/lib/format";
import type { Party, PartyLedgerRow } from "@/lib/vyaparApi";

/**
 * A vendor's card and full history.
 *
 * <p>The point of a clickable vendor row is the ledger underneath it: every purchase document and
 * payment against them, newest first, with the running balance. Without it "Vendors" is a phone
 * book, and the question a buyer actually asks — *what have we bought from these people, and do we
 * owe them?* — still needed Vyapar.
 */
export function VendorDrawer({
  vendor,
  canOpenVyapar,
  onClose,
}: {
  vendor: Party;
  canOpenVyapar: boolean;
  onClose: () => void;
}) {
  const [ledger, setLedger] = useState<PartyLedgerRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    getVendorLedger(vendor.id)
      .then((rows) => { if (!cancelled) setLedger(rows); })
      .catch(() => { if (!cancelled) setError("Couldn't load this vendor's history."); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [vendor.id]);

  const totals = useMemo(() => {
    const bought = ledger.filter((r) => r.kind === "INVOICE").reduce((a, r) => a + Number(r.total ?? 0), 0);
    const paid = ledger.filter((r) => r.kind === "PAYMENT").reduce((a, r) => a + Number(r.total ?? 0), 0);
    return { bought, paid, docs: ledger.filter((r) => r.kind === "INVOICE").length };
  }, [ledger]);

  // A supplier balance is held negative (we owe them); show the magnitude with the direction named.
  const owed = -Number(vendor.balance ?? 0);

  return (
    <Drawer
      title={vendor.name}
      onClose={onClose}
      width="max-w-3xl"
      guardOnClose={false}
      footer={
        canOpenVyapar ? (
          <Link href="/vyapar/parties" className="flex items-center gap-1.5 text-sm font-medium text-brand-accent hover:underline">
            Edit in Vyapar <ExternalLink size={13} />
          </Link>
        ) : (
          <span className="text-xs text-gray-400">Read-only here. Vendor details are maintained in Vyapar.</span>
        )
      }
    >
      <div className="space-y-5">
        <div className="rounded-xl border border-gray-200 bg-gradient-to-r from-cyan-50/60 to-white p-4">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="text-base font-semibold text-gray-900">{vendor.name}</h3>
            <span className="rounded-md bg-orange-50 px-2 py-0.5 text-xs font-medium text-orange-700">Supplier</span>
            {!vendor.isActive && (
              <span className="rounded-md bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-500">Inactive</span>
            )}
          </div>
          <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-gray-600">
            {vendor.phone && (
              <span className="flex items-center gap-1.5"><Phone size={13} className="text-gray-400" /> {vendor.phone}</span>
            )}
            {vendor.email && (
              <span className="flex items-center gap-1.5"><Mail size={13} className="text-gray-400" /> {vendor.email}</span>
            )}
            {(vendor.city || vendor.state) && (
              <span className="flex items-center gap-1.5">
                <MapPin size={13} className="text-gray-400" /> {[vendor.city, vendor.state].filter(Boolean).join(", ")}
              </span>
            )}
            {vendor.gstin && (
              <span className="flex items-center gap-1.5 font-mono text-xs">
                <ShieldCheck size={13} className="text-gray-400" /> {vendor.gstin}
              </span>
            )}
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Stat label="We owe" value={inr(Math.abs(owed))} tone={owed > 0 ? "text-rose-600" : "text-gray-800"} hint={owed < 0 ? "in credit" : undefined} />
          <Stat label="Bought" value={inr(totals.bought)} />
          <Stat label="Paid" value={inr(totals.paid)} />
          <Stat label="Documents" value={String(totals.docs)} />
        </div>

        <div>
          <h4 className="mb-2 text-[11px] font-semibold tracking-wide text-gray-400 uppercase">History</h4>
          {error && <div className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-600">{error}</div>}
          {loading ? (
            <div className="flex items-center justify-center gap-2 py-10 text-sm text-gray-400">
              <Spinner size={14} className="text-brand-accent" /> Loading history…
            </div>
          ) : ledger.length === 0 ? (
            <p className="rounded-lg border border-dashed border-gray-200 px-3 py-8 text-center text-sm text-gray-400">
              Nothing has been booked against this vendor yet.
            </p>
          ) : (
            <div className="overflow-x-auto rounded-xl border border-gray-200">
              <table className="min-w-full text-sm">
                <thead className="border-b border-gray-200 bg-gray-50 text-left text-[11px] font-semibold tracking-wide text-gray-500 uppercase">
                  <tr>
                    <th className="px-3 py-2">Type</th>
                    <th className="px-3 py-2">Number</th>
                    <th className="px-3 py-2">Date</th>
                    <th className="px-3 py-2 text-right">Amount</th>
                    <th className="px-3 py-2 text-right">Balance</th>
                    <th className="px-3 py-2">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {ledger.map((r) => (
                    <tr key={`${r.kind}-${r.id}`} className="even:bg-gray-50/40">
                      <td className="px-3 py-2">
                        <span
                          className={`rounded-md px-1.5 py-0.5 text-[11px] font-medium ${
                            r.kind === "PAYMENT" ? "bg-emerald-50 text-emerald-700" : "bg-gray-100 text-gray-600"
                          }`}
                        >
                          {r.type}
                        </span>
                      </td>
                      <td className="px-3 py-2 text-gray-700">{r.number ?? "—"}</td>
                      <td className="px-3 py-2 text-xs text-gray-500">{r.date ?? "—"}</td>
                      <td className="px-3 py-2 text-right whitespace-nowrap text-gray-800 tabular-nums">{inr(r.total)}</td>
                      <td className="px-3 py-2 text-right whitespace-nowrap text-gray-500 tabular-nums">{inr(r.balance)}</td>
                      <td className="px-3 py-2 text-xs text-gray-500">{r.status ?? "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </Drawer>
  );
}

function Stat({ label, value, tone = "text-gray-800", hint }: { label: string; value: string; tone?: string; hint?: string }) {
  return (
    <div className="rounded-xl border border-gray-200 bg-white p-3">
      <div className="text-[11px] tracking-wide text-gray-400 uppercase">{label}</div>
      <div className={`mt-0.5 text-lg font-semibold tabular-nums ${tone}`}>{value}</div>
      {hint && <div className="text-[11px] text-gray-400">{hint}</div>}
    </div>
  );
}
