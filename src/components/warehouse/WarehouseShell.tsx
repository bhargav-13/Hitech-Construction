"use client";

import { Suspense, useEffect, useMemo } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { AppShell } from "@/components/AppShell";
import { Select } from "@/components/Select";
import { useUiStore } from "@/lib/uiStore";
import { WAREHOUSE_NAV, type WarehouseNavNode } from "@/lib/warehouseConfig";
import { useWarehouseStore, checkoutsOf, stockByItem } from "@/lib/warehouseStore";
import { useWarehouseScope } from "@/lib/warehouseScope";
import {
  ArrowLeftRight,
  Boxes,
  ClipboardList,
  FileText,
  Handshake,
  Home,
  PanelLeftClose,
  PanelLeftOpen,
  TriangleAlert,
  Users,
  Warehouse as WarehouseIcon,
} from "lucide-react";

const ICONS: Record<string, React.ComponentType<{ size?: number; className?: string }>> = {
  home: Home,
  boxes: Boxes,
  arrows: ArrowLeftRight,
  clipboard: ClipboardList,
  handshake: Handshake,
  warehouse: WarehouseIcon,
  users: Users,
};

/**
 * Warehouse's own chrome: the app shell, a store picker, and a left rail split between what is done
 * daily and what is set up once.
 *
 * The store picker sits in the header rather than on each screen because **which store** is the
 * question behind every number in this module — 400 bags is meaningless until you know where. It is
 * the same reasoning as the project scope in the top bar, and it stays put as you move between
 * screens so a keeper working the central store never has to re-choose it.
 *
 * Rail counters are the things that stall work: requests waiting on a decision, items under their
 * reorder level, returnables still out. Those are the reasons someone opens this module unprompted.
 */
export function WarehouseShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const railCollapsed = useUiStore((s) => s.procurementRailCollapsed);
  const toggleRail = useUiStore((s) => s.toggleProcurementRail);

  const warehouses = useWarehouseStore((s) => s.warehouses);
  const movements = useWarehouseStore((s) => s.movements);
  const requests = useWarehouseStore((s) => s.requests);
  const settings = useWarehouseStore((s) => s.settings);
  const load = useWarehouseStore((s) => s.load);
  const loadError = useWarehouseStore((s) => s.error);
  const { warehouseId, setWarehouseId, warehouse } = useWarehouseScope();

  // Every screen in the module sits inside this shell, so one load here covers all of them. The
  // store ignores a second call while one is in flight, which is what makes that safe.
  useEffect(() => {
    void load();
  }, [load]);

  const badges = useMemo(() => {
    const scoped = warehouseId === "all" ? movements : movements.filter((m) => m.warehouseId === warehouseId);
    const pending = requests.filter(
      (r) => (warehouseId === "all" || r.warehouseId === warehouseId) && r.status === "PENDING",
    ).length;

    // Low stock only counts stores where a reorder level has actually been set — everything reads
    // as "below zero" otherwise, which would light the rail up permanently and teach people to
    // ignore it.
    let low = 0;
    for (const w of warehouses) {
      if (warehouseId !== "all" && w.id !== warehouseId) continue;
      const onHand = stockByItem(movements, w.id);
      for (const s of settings) {
        if (s.warehouseId !== w.id || s.reorderLevel <= 0) continue;
        if ((onHand.get(s.itemId) ?? 0) <= s.reorderLevel) low++;
      }
    }

    return {
      requests: pending,
      low,
      out: checkoutsOf(scoped, warehouseId === "all" ? undefined : warehouseId).length,
    };
  }, [movements, requests, settings, warehouses, warehouseId]);

  const isActive = (href: string) =>
    href === "/warehouse" ? pathname === "/warehouse" : pathname.startsWith(href);

  const storeOptions = [
    { value: "all", label: "All stores" },
    ...warehouses
      .filter((w) => w.isActive && w.kind !== "TRANSIT")
      .map((w) => ({ value: w.id, label: `${w.code} · ${w.name}` })),
  ];

  return (
    <AppShell title="Warehouse">
      <div className="animate-fade-in flex min-h-[calc(100vh-140px)] gap-4">
        <aside
          className={`hidden shrink-0 rounded-xl border border-gray-200 bg-white p-2 transition-[width] duration-200 lg:block ${
            railCollapsed ? "w-14" : "w-56"
          }`}
        >
          <button
            type="button"
            onClick={toggleRail}
            aria-label={railCollapsed ? "Expand Warehouse menu" : "Collapse Warehouse menu"}
            className={`mb-1 flex h-8 items-center rounded-lg text-gray-400 transition-colors duration-150 hover:bg-gray-50 hover:text-brand-accent ${
              railCollapsed ? "w-full justify-center" : "w-full justify-end px-2"
            }`}
          >
            {railCollapsed ? <PanelLeftOpen size={15} /> : <PanelLeftClose size={15} />}
          </button>

          <nav className="space-y-0.5">
            {WAREHOUSE_NAV.map((node) => (
              <div key={node.href}>
                {node.section && !railCollapsed && (
                  <div className="mt-3 mb-1 px-3 text-[10px] font-semibold tracking-wide text-gray-300 uppercase">
                    {node.section}
                  </div>
                )}
                {node.section && railCollapsed && <div className="my-2 border-t border-gray-100" />}
                <NavItem
                  node={node}
                  active={isActive(node.href)}
                  collapsed={railCollapsed}
                  count={node.badge ? badges[node.badge] : 0}
                />
              </div>
            ))}
          </nav>
        </aside>

        <div className="min-w-0 flex-1 space-y-4">
          {/*
            Said at the top of every screen when it happens, because the screens below would
            otherwise read as an empty warehouse rather than as one we failed to fetch — and someone
            who trusts that reading will go and receive stock that is already there.
          */}
          {loadError && (
            <div className="flex items-start gap-2.5 rounded-xl border border-rose-200 bg-rose-50/70 px-4 py-2.5 text-sm text-rose-900">
              <TriangleAlert size={16} className="mt-0.5 shrink-0" />
              <p>
                <strong>Couldn&apos;t load the warehouse.</strong> {loadError} Figures below may be
                out of date or missing — reload before recording anything.
              </p>
            </div>
          )}

          {/* Which store — the question behind every figure in this module. */}
          <div className="flex flex-wrap items-center gap-2 rounded-xl border border-gray-200 bg-white px-3 py-2">
            <WarehouseIcon size={15} className="shrink-0 text-gray-400" />
            <Select value={warehouseId} onChange={setWarehouseId} options={storeOptions} size="sm" className="w-64" />
            {warehouse?.kind === "SITE" && (
              <span className="rounded-md bg-violet-50 px-2 py-0.5 text-[11px] font-medium text-violet-700">
                Site store
              </span>
            )}
            {warehouseId === "all" && (
              <span className="text-xs text-gray-400">
                Figures below are every store combined — pick one to receive or issue.
              </span>
            )}
          </div>

          <Suspense fallback={null}>{children}</Suspense>
        </div>
      </div>
    </AppShell>
  );
}

function NavItem({
  node,
  active,
  collapsed,
  count,
}: {
  node: WarehouseNavNode;
  active: boolean;
  collapsed: boolean;
  count: number;
}) {
  const Icon = ICONS[node.icon] ?? FileText;

  if (collapsed) {
    return (
      <Link
        href={node.href}
        title={count > 0 ? `${node.label} (${count})` : node.label}
        aria-label={node.label}
        className={`relative flex h-9 items-center justify-center rounded-lg transition-colors duration-150 ${
          active ? "bg-cyan-50 text-brand-accent" : "text-gray-500 hover:bg-gray-50"
        }`}
      >
        <Icon size={17} />
        {count > 0 && <span className="absolute top-1 right-1 h-1.5 w-1.5 rounded-full bg-amber-500" />}
      </Link>
    );
  }

  return (
    <Link
      href={node.href}
      className={`flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm transition-colors duration-150 ${
        active ? "bg-cyan-50 font-medium text-brand-accent" : "text-gray-600 hover:bg-gray-50"
      }`}
    >
      <Icon size={16} className="shrink-0" />
      <span className="min-w-0 flex-1">
        <span className="block truncate">{node.label}</span>
        {node.hint && <span className="block truncate text-[11px] text-gray-400">{node.hint}</span>}
      </span>
      {count > 0 && (
        <span className="shrink-0 rounded-md bg-amber-100 px-1.5 py-0.5 text-[11px] font-semibold text-amber-700">
          {count}
        </span>
      )}
    </Link>
  );
}

export function WarehouseHeader({
  title,
  subtitle,
  right,
}: {
  title: string;
  subtitle?: string;
  right?: React.ReactNode;
}) {
  return (
    <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
      <div>
        <h1 className="text-lg font-semibold text-gray-800">{title}</h1>
        {subtitle && <p className="text-sm text-gray-500">{subtitle}</p>}
      </div>
      {right}
    </div>
  );
}

export function WarehouseEmpty({
  icon: Icon = Boxes,
  title,
  hint,
  action,
}: {
  icon?: React.ComponentType<{ size?: number }>;
  title: string;
  hint?: string;
  /** The one thing to do from here — an empty screen should offer a way out of being empty. */
  action?: React.ReactNode;
}) {
  return (
    <div className="animate-fade-in flex min-h-[280px] flex-col items-center justify-center rounded-xl border border-dashed border-gray-300 bg-white text-center">
      <div className="mb-3 flex h-14 w-14 items-center justify-center rounded-full bg-cyan-50 text-brand-accent">
        <Icon size={24} />
      </div>
      <div className="text-base font-semibold text-gray-700">{title}</div>
      {hint && <p className="mt-1 max-w-sm text-sm text-gray-400">{hint}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}
