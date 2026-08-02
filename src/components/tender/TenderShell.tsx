"use client";

import { Suspense, useMemo } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { AppShell } from "@/components/AppShell";
import { useUiStore } from "@/lib/uiStore";
import { useTenderStore } from "@/lib/tenderStore";
import { dueSoonCount, exposure } from "@/lib/tenderMetrics";
import { TENDER_NAV } from "@/lib/tenderConfig";
import type { TenderNavNode } from "@/lib/tenderConfig";
import {
  Boxes,
  CalendarDays,
  CheckSquare,
  FileText,
  Filter,
  Home,
  Landmark,
  PanelLeftClose,
  PanelLeftOpen,
  Search,
  Send,
  Settings,
  Truck,
} from "lucide-react";

const ICONS: Record<string, React.ComponentType<{ size?: number; className?: string }>> = {
  home: Home,
  search: Search,
  filter: Filter,
  send: Send,
  calendar: CalendarDays,
  bank: Landmark,
  check: CheckSquare,
  file: FileText,
  truck: Truck,
  boxes: Boxes,
  settings: Settings,
};

/**
 * Tender's own chrome: AppShell + a left rail for the pipeline (Sorting → Research → Applied) and
 * its trackers. Nav items carry live counters — tenders closing this week, and EMD that should have
 * come back — so the things that cost money are visible without opening a screen.
 * Flat, no role-gating: visibility is handled upstream by TENDER:VIEW.
 */
export function TenderShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const railCollapsed = useUiStore((s) => s.tenderRailCollapsed);
  const toggleRail = useUiStore((s) => s.toggleTenderRail);
  const tenders = useTenderStore((s) => s.tenders);

  const badges = useMemo(() => {
    const recoverable = exposure(tenders).emdRecoverable;
    return {
      "due:SORTING": dueSoonCount(tenders, "SORTING"),
      "due:RESEARCH": dueSoonCount(tenders, "RESEARCH"),
      "due:APPLIED": dueSoonCount(tenders, "APPLIED"),
      emd: recoverable > 0 ? tenders.filter((t) => t.emdState === "PAID" && !t.emdReleasedOn && (t.stage === "LOST")).length : 0,
    };
  }, [tenders]);

  const isActive = (href?: string) =>
    !!href && (href === "/tender" ? pathname === "/tender" : pathname.startsWith(href));

  return (
    <AppShell title="Tender">
      <div className="animate-fade-in flex min-h-[calc(100vh-140px)] gap-4">
        <aside
          className={`hidden shrink-0 rounded-xl border border-gray-200 bg-white p-2 transition-[width] duration-200 lg:block ${
            railCollapsed ? "w-14" : "w-56"
          }`}
        >
          <button
            type="button"
            onClick={toggleRail}
            aria-label={railCollapsed ? "Expand Tender menu" : "Collapse Tender menu"}
            title={railCollapsed ? "Expand menu" : "Collapse menu"}
            className={`mb-1 flex h-8 items-center rounded-lg text-gray-400 transition-colors duration-150 hover:bg-gray-50 hover:text-brand-accent ${
              railCollapsed ? "w-full justify-center" : "w-full justify-end px-2"
            }`}
          >
            {railCollapsed ? <PanelLeftOpen size={15} /> : <PanelLeftClose size={15} />}
          </button>
          <nav className="space-y-0.5">
            {TENDER_NAV.map((node) => (
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
  node: TenderNavNode;
  active: boolean;
  collapsed: boolean;
  count: number;
}) {
  const Icon = ICONS[node.icon ?? ""] ?? FileText;
  // EMD-to-recover is money going astray; deadlines are merely urgent.
  const tone = node.badge === "emd" ? "bg-rose-100 text-rose-700" : "bg-amber-100 text-amber-700";

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
          <span className={`absolute top-1 right-1 h-1.5 w-1.5 rounded-full ${node.badge === "emd" ? "bg-rose-500" : "bg-amber-500"}`} />
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
      {count > 0 && (
        <span className={`ml-auto rounded-full px-1.5 text-[10px] font-semibold ${tone}`}>{count}</span>
      )}
    </Link>
  );
}

/** Shared empty state so every Tender list reads the same. */
export function TenderEmpty({
  icon: Icon = FileText,
  title,
  hint,
}: {
  icon?: React.ComponentType<{ size?: number }>;
  title: string;
  hint?: string;
}) {
  return (
    <div className="animate-fade-in flex min-h-[280px] flex-col items-center justify-center rounded-xl border border-dashed border-gray-300 bg-white text-center">
      <div className="mb-3 flex h-14 w-14 items-center justify-center rounded-full bg-cyan-50 text-brand-accent">
        <Icon size={24} />
      </div>
      <div className="text-base font-semibold text-gray-700">{title}</div>
      {hint && <p className="mt-1 max-w-xs text-sm text-gray-400">{hint}</p>}
    </div>
  );
}
