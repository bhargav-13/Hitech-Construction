"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { WarehouseShell, WarehouseHeader, WarehouseEmpty } from "@/components/warehouse/WarehouseShell";
import { Select } from "@/components/Select";
import { useWarehouseStore, reportRefusal } from "@/lib/warehouseStore";
import { useWarehouseRights } from "@/lib/warehouseScope";
import { WAREHOUSE_ROLE_META, type WarehouseRole } from "@/lib/warehouseTypes";
import { WAREHOUSE_KIND_META } from "@/lib/warehouseConfig";
import { useUsers } from "@/lib/useUsers";
import { useAuthStore } from "@/lib/authStore";
import { Info, Lock, Search, ShieldCheck, Users } from "lucide-react";

/**
 * Who may work in which store.
 *
 * The second of two access layers, and the one the module could not work without. The first —
 * WAREHOUSE:VIEW / CREATE / EDIT / APPROVE, set per role in Settings — decides what a person may
 * *do*. It cannot decide *where*, because it is the same everywhere: give a store keeper
 * WAREHOUSE:CREATE so they can issue cement at the central store, and you have also let them issue
 * from a site store three hours away that they have never visited.
 *
 * So this grid: a member, a store, and how deeply they work in it. Both layers have to agree and
 * the narrower one wins.
 *
 * The one deliberate shortcut is a **site store on a project the member already runs**. A site
 * supervisor should not need a second grant to read the store on their own site, and requiring one
 * is exactly how every module ends up with everyone made an admin to make the friction stop.
 */
export default function WarehouseAccessPage() {
  const warehouses = useWarehouseStore((s) => s.warehouses);
  const members = useWarehouseStore((s) => s.members);
  const setMemberRole = useWarehouseStore((s) => s.setMemberRole);
  const rights = useWarehouseRights("all");
  const { users } = useUsers();
  const permissions = useAuthStore((s) => s.user?.permissions) ?? [];

  const [q, setQ] = useState("");
  const [showOnlyGranted, setShowOnlyGranted] = useState(false);

  const stores = useMemo(
    () => warehouses.filter((w) => w.isActive && w.kind !== "TRANSIT"),
    [warehouses],
  );

  const roleOf = (userId: string, warehouseId: string): WarehouseRole | "" =>
    members.find((m) => m.userId === userId && m.warehouseId === warehouseId)?.role ?? "";

  const rows = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return users
      .filter((u) => !needle || u.name.toLowerCase().includes(needle))
      .filter((u) => !showOnlyGranted || stores.some((w) => roleOf(u.id, w.id) !== ""))
      .sort((a, b) => a.name.localeCompare(b.name));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [users, q, showOnlyGranted, members, stores]);

  const grantedCount = useMemo(
    () => users.filter((u) => stores.some((w) => roleOf(u.id, w.id) !== "")).length,
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [users, stores, members],
  );

  /** Whether this person can reach Warehouse at all — the first layer, set by their role. */
  const moduleGate = permissions.includes("WAREHOUSE:VIEW");

  if (stores.length === 0) {
    return (
      <WarehouseShell>
        <WarehouseHeader title="Access" subtitle="Who may work in which store." />
        <WarehouseEmpty
          icon={Users}
          title="No stores to give access to"
          hint="Add a warehouse first — access is granted per store, so there is nothing to grant yet."
          action={
            <Link
              href="/warehouse/locations"
              className="rounded-lg bg-brand-accent px-4 py-2 text-sm font-medium text-white transition-opacity hover:opacity-90"
            >
              Set up warehouses
            </Link>
          }
        />
      </WarehouseShell>
    );
  }

  return (
    <WarehouseShell>
      <WarehouseHeader
        title="Access"
        subtitle={`${grantedCount} of ${users.length} members work in at least one store.`}
      />

      {/* The two layers, said once and plainly — this is the thing people get wrong. */}
      <div className="mb-4 flex items-start gap-2.5 rounded-xl border border-cyan-100 bg-cyan-50/50 px-4 py-3 text-sm text-gray-700">
        <Info size={16} className="mt-0.5 shrink-0 text-brand-accent" />
        <div className="space-y-1">
          <p>
            <strong>Two things decide what someone can do here.</strong> Their role carries the
            Warehouse permissions — view, create, approve — and that says <em>what</em>. This grid says{" "}
            <em>which store</em>. Both have to agree, and the narrower one wins.
          </p>
          <p className="text-xs text-gray-500">
            Set the first in{" "}
            <Link href="/settings" className="font-medium text-brand-accent hover:underline">
              Settings → Roles
            </Link>
            . A site store is also readable by whoever runs that project, without a grant here.
          </p>
        </div>
      </div>

      {!rights.canAdminister && (
        <div className="mb-3 flex items-center gap-2 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-800">
          <Lock size={14} className="shrink-0" />
          You can see who has access but not change it — that needs Warehouse edit rights.
        </div>
      )}

      <div className="mb-3 flex flex-wrap items-center gap-2">
        <div className="flex min-w-[220px] flex-1 items-center gap-2 rounded-lg border border-gray-200 bg-white px-3 py-2 focus-within:border-cyan-500">
          <Search size={15} className="text-gray-400" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search members…"
            className="w-full bg-transparent text-sm outline-none"
          />
        </div>
        <label className="flex cursor-pointer items-center gap-1.5 text-xs text-gray-600">
          <input
            type="checkbox"
            checked={showOnlyGranted}
            onChange={(e) => setShowOnlyGranted(e.target.checked)}
            className="accent-cyan-600"
          />
          Only members with access
        </label>
      </div>

      <div className="overflow-x-auto rounded-xl border border-gray-200 bg-white">
        <table className="w-full border-collapse text-sm" style={{ minWidth: 320 + stores.length * 190 }}>
          <thead>
            <tr className="border-b border-gray-200 bg-gray-50 text-left">
              <th className="sticky left-0 z-10 bg-gray-50 px-4 py-2.5 text-[11px] font-medium tracking-wide text-gray-500 uppercase">
                Member
              </th>
              {stores.map((w) => (
                <th key={w.id} className="px-3 py-2.5 text-[11px] font-medium text-gray-500">
                  <div className="flex items-center gap-1.5">
                    <span className="rounded bg-gray-200 px-1.5 py-0.5 font-mono text-[10px] font-semibold text-gray-600">
                      {w.code}
                    </span>
                    <span className="truncate normal-case">{w.name}</span>
                  </div>
                  <span
                    className={`mt-1 inline-block rounded px-1.5 py-0.5 text-[10px] font-medium ring-1 ring-inset ${
                      WAREHOUSE_KIND_META[w.kind].chip
                    }`}
                  >
                    {WAREHOUSE_KIND_META[w.kind].label}
                  </span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((u) => (
              <tr key={u.id} className="border-b border-gray-50 last:border-b-0 even:bg-gray-50/40">
                <td className="sticky left-0 z-10 bg-inherit px-4 py-2.5">
                  <div className="font-medium text-gray-800">{u.name}</div>
                  {u.role && <div className="text-[11px] text-gray-400">{u.role}</div>}
                </td>
                {stores.map((w) => {
                  const current = roleOf(u.id, w.id);
                  return (
                    <td key={w.id} className="px-3 py-2">
                      <Select
                        value={current}
                        onChange={(v) =>
                          void setMemberRole(w.id, u.id, v === "" ? null : (v as WarehouseRole)).catch(reportRefusal)
                        }
                        size="sm"
                        disabled={!rights.canAdminister}
                        placeholder="No access"
                        options={[
                          { value: "", label: "No access" },
                          ...(Object.keys(WAREHOUSE_ROLE_META) as WarehouseRole[]).map((r) => ({
                            value: r,
                            label: WAREHOUSE_ROLE_META[r].label,
                          })),
                        ]}
                      />
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* What each level actually permits, next to the grid that sets it. */}
      <div className="mt-4 grid gap-3 sm:grid-cols-3">
        {(Object.keys(WAREHOUSE_ROLE_META) as WarehouseRole[]).map((r) => (
          <div key={r} className="rounded-xl border border-gray-200 bg-white p-3">
            <div className="flex items-center gap-1.5 text-sm font-semibold text-gray-800">
              <ShieldCheck size={14} className="text-brand-accent" />
              {WAREHOUSE_ROLE_META[r].label}
            </div>
            <p className="mt-1 text-xs text-gray-500">{WAREHOUSE_ROLE_META[r].hint}</p>
          </div>
        ))}
      </div>

      {!moduleGate && (
        <p className="mt-3 text-xs text-amber-700">
          Note: your own role does not carry WAREHOUSE:VIEW, so grants made here will not let you into a
          store until that is added in Settings → Roles.
        </p>
      )}
    </WarehouseShell>
  );
}
