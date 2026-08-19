"use client";

import { Suspense, useMemo } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { AppShell } from "@/components/AppShell";
import { useUiStore } from "@/lib/uiStore";
import { useRfqs } from "@/lib/useRfqs";
import { PROCUREMENT_NAV } from "@/lib/procurementConfig";
import type { ProcNavNode } from "@/lib/procurementConfig";
import {
  ClipboardList,
  FileText,
  Hammer,
  Home,
  PanelLeftClose,
  PanelLeftOpen,
  Scale,
  Send,
  Settings,
  Truck,
  Users,
} from "lucide-react";

const ICONS: Record<string, React.ComponentType<{ size?: number; className?: string }>> = {
  home: Home,
  clipboard: ClipboardList,
  send: Send,
  scale: Scale,
  file: FileText,
  hammer: Hammer,
  truck: Truck,
  users: Users,
  settings: Settings,
};

/**
 * Procurement's own chrome: AppShell + a left rail for the buying chain (Indent → RFQ → Comparison
 * → PO → Goods Receipt). Nav items carry live counters — open indents, RFQs still awaiting quotes,
 * POs pending approval, and part-received orders — so the things that stall the flow are visible
 * without opening a screen. Flat, no role-gating (that's handled upstream by PROCUREMENT:VIEW).
 */
export function ProcurementShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const railCollapsed = useUiStore((s) => s.procurementRailCollapsed);
  const toggleRail = useUiStore((s) => s.toggleProcurementRail);
  const { rfqs } = useRfqs();

  // One counter left: enquiries sent with nothing back. The others counted purchase orders and
  // receipts, which this module no longer holds.
  const badges = useMemo(
    () => ({ rfq: rfqs.filter((r) => r.status === "Sent").length }),
    [rfqs],
  );

  const isActive = (href?: string) =>
    !!href && (href === "/procurement" ? pathname === "/procurement" : pathname.startsWith(href));

  return (
    <AppShell title="Procurement">
      <div className="animate-fade-in flex min-h-[calc(100vh-140px)] gap-4">
        <aside
          className={`hidden shrink-0 rounded-xl border border-gray-200 bg-white p-2 transition-[width] duration-200 lg:block ${
            railCollapsed ? "w-14" : "w-56"
          }`}
        >
          <button
            type="button"
            onClick={toggleRail}
            aria-label={railCollapsed ? "Expand Procurement menu" : "Collapse Procurement menu"}
            title={railCollapsed ? "Expand menu" : "Collapse menu"}
            className={`mb-1 flex h-8 items-center rounded-lg text-gray-400 transition-colors duration-150 hover:bg-gray-50 hover:text-brand-accent ${
              railCollapsed ? "w-full justify-center" : "w-full justify-end px-2"
            }`}
          >
            {railCollapsed ? <PanelLeftOpen size={15} /> : <PanelLeftClose size={15} />}
          </button>

          {!railCollapsed && (
            <div className="mb-2 flex items-center gap-1.5 rounded-lg bg-amber-50 px-3 py-2 text-[11px] font-medium text-amber-700 ring-1 ring-inset ring-amber-600/20">
              <span className="h-1.5 w-1.5 rounded-full bg-amber-500" />
              Demo — data is seeded
            </div>
          )}

          <nav className="space-y-0.5">
            {PROCUREMENT_NAV.map((node) => (
              <div key={node.label}>
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

        <div className="min-w-0 flex-1">
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
  node: ProcNavNode;
  active: boolean;
  collapsed: boolean;
  count: number;
}) {
  const Icon = ICONS[node.icon ?? ""] ?? FileText;
  const tone = "bg-amber-100 text-amber-700";

  if (collapsed) {
    return (
      <Link
        href={node.href ?? "#"}
        title={count > 0 ? `${node.label} (${count})` : node.label}
        aria-label={node.label}
        className={`relative flex h-9 items-center justify-center rounded-lg transition-colors duration-150 ${
          active ? "bg-cyan-50 text-brand-accent" : "text-gray-500 hover:bg-gray-50"
        }`}
      >
        <Icon size={17} />
        {count > 0 && (
          <span
            className="absolute top-1 right-1 h-1.5 w-1.5 rounded-full bg-amber-500"
          />
        )}
      </Link>
    );
  }

  return (
    <Link
      href={node.href ?? "#"}
      className={`flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm transition-colors duration-150 ${
        active ? "bg-cyan-50 font-medium text-brand-accent" : "text-gray-600 hover:bg-gray-50"
      }`}
    >
      <Icon size={16} />
      {node.label}
      {count > 0 && <span className={`ml-auto rounded-full px-1.5 text-[10px] font-semibold ${tone}`}>{count}</span>}
    </Link>
  );
}

/** Shared empty state so every Procurement list reads the same. */
export function ProcurementEmpty({
  icon: Icon = FileText,
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
      {hint && <p className="mt-1 max-w-xs text-sm text-gray-400">{hint}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

/** Page header used across the module — title, subtitle, and an optional right-side slot. */
export function ProcurementHeader({
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
