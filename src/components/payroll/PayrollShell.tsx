"use client";

import { Suspense, useEffect, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { AppShell } from "@/components/AppShell";
import { Spinner } from "@/components/Spinner";
import { useUiStore } from "@/lib/uiStore";
import { useAuthStore } from "@/lib/authStore";
import { usePayrollAccess } from "@/lib/payrollApi";
import { PAYROLL_NAV, PAYROLL_SELF_NAV } from "@/lib/payrollConfig";
import type { PayrollNavNode } from "@/lib/payrollConfig";
import {
  Banknote,
  BarChart3,
  CalendarDays,
  CheckSquare,
  ChevronDown,
  ChevronRight,
  Construction,
  FileText,
  Gift,
  Grid3x3,
  Home,
  Landmark,
  LayoutGrid,
  PanelLeftClose,
  PanelLeftOpen,
  Receipt,
  Shield,
  Trophy,
  Users,
  Wallet,
} from "lucide-react";

const ICONS: Record<string, React.ComponentType<{ size?: number; className?: string }>> = {
  home: Home,
  users: Users,
  calendar: CalendarDays,
  check: CheckSquare,
  wallet: Wallet,
  banknote: Banknote,
  receipt: Receipt,
  landmark: Landmark,
  chart: BarChart3,
  grid: LayoutGrid,
  file: FileText,
  shield: Shield,
  trophy: Trophy,
  gift: Gift,
  tiles: Grid3x3,
};

/**
 * Payroll's own chrome: a left rail with nested sections, matching PagarBook's layout. The rail
 * adapts to the signed-in user — HR admins get the full module, everyone else gets a self-service
 * rail scoped to their own records. Pass `requireAdmin` on admin-only pages so a self-service user
 * who lands on one (via a stale link) is bounced to their own dashboard.
 */
export function PayrollShell({ children, requireAdmin = false }: { children: React.ReactNode; requireAdmin?: boolean }) {
  const pathname = usePathname();
  const router = useRouter();
  const { isAdmin } = usePayrollAccess();
  // Wait for the session to hydrate before deciding access — on a hard page load permissions
  // aren't present for a tick, and acting early would wrongly bounce an admin off their own pages.
  const hydrated = useAuthStore((s) => s.hydrated);
  const railCollapsed = useUiStore((s) => s.payrollRailCollapsed);
  const toggleRail = useUiStore((s) => s.togglePayrollRail);

  const nav = isAdmin ? PAYROLL_NAV : PAYROLL_SELF_NAV;

  const [open, setOpen] = useState<Record<string, boolean>>(() => {
    const init: Record<string, boolean> = {};
    for (const n of nav) {
      if (n.children?.some((c) => c.href && pathname.startsWith(c.href))) init[n.label] = true;
    }
    return init;
  });

  // Self-service users must not reach admin pages — send them to their own dashboard. Only act
  // once the session has hydrated, so an admin isn't redirected during the pre-hydration tick.
  const denied = hydrated && requireAdmin && !isAdmin;
  useEffect(() => {
    if (denied) router.replace("/payroll");
  }, [denied, router]);
  // Hold admin content until we know the user is allowed (avoids a flash + the redirect race).
  const showContent = !requireAdmin || (hydrated && isAdmin);

  const isActive = (href?: string) =>
    !!href && (href === "/payroll" ? pathname === "/payroll" : pathname.startsWith(href));

  return (
    <AppShell title="Payroll">
      <div className="animate-fade-in mb-4 flex items-center gap-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-2.5 text-amber-800">
        <Construction size={18} className="shrink-0 text-amber-500" />
        <p className="text-[13px] leading-snug">
          <span className="font-semibold">Payroll — Coming Soon.</span>{" "}
          This module is a work-in-progress preview. Figures shown are sample data, not live payroll records.
        </p>
      </div>
      <div className="animate-fade-in flex min-h-[calc(100vh-140px)] gap-4">
        <aside
          className={`hidden shrink-0 rounded-xl border border-gray-200 bg-white p-2 transition-[width] duration-200 lg:block ${
            railCollapsed ? "w-14" : "w-56"
          }`}
        >
          <button
            type="button"
            onClick={toggleRail}
            aria-label={railCollapsed ? "Expand Payroll menu" : "Collapse Payroll menu"}
            title={railCollapsed ? "Expand menu" : "Collapse menu"}
            className={`mb-1 flex h-8 items-center rounded-lg text-gray-400 transition-colors duration-150 hover:bg-gray-50 hover:text-brand-accent ${
              railCollapsed ? "w-full justify-center" : "w-full justify-end px-2"
            }`}
          >
            {railCollapsed ? <PanelLeftOpen size={15} /> : <PanelLeftClose size={15} />}
          </button>
          <nav className="space-y-0.5">
            {nav.map((node) => (
              <NavItem
                key={node.label}
                node={node}
                isActive={isActive}
                collapsed={railCollapsed}
                open={!!open[node.label]}
                onToggle={() => setOpen((o) => ({ ...o, [node.label]: !o[node.label] }))}
              />
            ))}
          </nav>
        </aside>

        <div className="min-w-0 flex-1">
          {showContent ? (
            <Suspense fallback={null}>{children}</Suspense>
          ) : (
            <div className="flex min-h-[300px] items-center justify-center">
              <Spinner size={18} className="text-brand-accent" />
            </div>
          )}
        </div>
      </div>
    </AppShell>
  );
}

function NavItem({
  node,
  isActive,
  open,
  onToggle,
  collapsed = false,
}: {
  node: PayrollNavNode;
  isActive: (href?: string) => boolean;
  open: boolean;
  onToggle: () => void;
  collapsed?: boolean;
}) {
  const Icon = ICONS[node.icon ?? ""] ?? FileText;
  const active = isActive(node.href);
  const childActive = node.children?.some((c) => isActive(c.href));

  if (collapsed) {
    const href = node.href ?? node.children?.find((c) => c.href)?.href ?? "#";
    return (
      <Link
        href={href}
        title={node.label}
        aria-label={node.label}
        className={`flex h-9 items-center justify-center rounded-lg transition-colors duration-150 ${
          active || childActive ? "bg-cyan-50 text-brand-accent" : "text-gray-500 hover:bg-gray-50"
        }`}
      >
        <Icon size={17} />
      </Link>
    );
  }

  if (!node.children) {
    return (
      <Link
        href={node.href ?? "#"}
        className={`flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm transition-colors duration-150 ${
          active ? "bg-cyan-50 font-medium text-brand-accent" : "text-gray-600 hover:bg-gray-50"
        }`}
      >
        <Icon size={16} />
        {node.label}
        {node.badge && (
          <span className="ml-auto rounded-full bg-emerald-100 px-1.5 text-[9px] font-semibold text-emerald-700">{node.badge}</span>
        )}
      </Link>
    );
  }

  return (
    <div>
      <button
        onClick={onToggle}
        className={`flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-sm transition-colors duration-150 ${
          childActive ? "font-medium text-brand-accent" : "text-gray-600 hover:bg-gray-50"
        }`}
      >
        <Icon size={16} />
        <span className="flex-1 text-left">{node.label}</span>
        {open ? <ChevronDown size={14} className="text-gray-400" /> : <ChevronRight size={14} className="text-gray-400" />}
      </button>
      {open && (
        <div className="mt-0.5 space-y-0.5 pl-6">
          {node.children.map((c) => (
            <Link
              key={c.label}
              href={c.href ?? "#"}
              className={`flex items-center justify-between rounded-lg px-3 py-1.5 text-[13px] transition-colors duration-150 ${
                isActive(c.href) ? "bg-cyan-50 font-medium text-brand-accent" : "text-gray-500 hover:bg-gray-50 hover:text-gray-800"
              }`}
            >
              <span className="truncate">{c.label}</span>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}

/** Shared empty state so every Payroll list reads the same. */
export function PayrollEmpty({
  icon: Icon = FileText,
  title,
  hint,
  action,
}: {
  icon?: React.ComponentType<{ size?: number }>;
  title: string;
  hint?: string;
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

/** A compact stat card used across the Payroll dashboards. */
export function StatCard({
  label,
  value,
  accent = "gray",
  hint,
  icon: Icon,
}: {
  label: string;
  value: string | number;
  accent?: "gray" | "green" | "rose" | "amber" | "blue" | "cyan";
  hint?: string;
  icon?: React.ComponentType<{ size?: number; className?: string }>;
}) {
  const tone: Record<string, string> = {
    gray: "text-gray-800",
    green: "text-emerald-600",
    rose: "text-rose-600",
    amber: "text-amber-600",
    blue: "text-blue-600",
    cyan: "text-brand-accent",
  };
  const bg: Record<string, string> = {
    gray: "bg-gray-100 text-gray-500",
    green: "bg-emerald-50 text-emerald-600",
    rose: "bg-rose-50 text-rose-600",
    amber: "bg-amber-50 text-amber-600",
    blue: "bg-blue-50 text-blue-600",
    cyan: "bg-cyan-50 text-brand-accent",
  };
  return (
    <div className="rounded-xl border border-gray-200 bg-white p-4 transition-shadow duration-150 hover:shadow-sm">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="text-xs text-gray-500">{label}</div>
          <div className={`mt-1 text-2xl font-semibold ${tone[accent]}`}>{value}</div>
          {hint && <div className="mt-0.5 text-[11px] text-gray-400">{hint}</div>}
        </div>
        {Icon && (
          <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full ${bg[accent]}`}>
            <Icon size={17} />
          </div>
        )}
      </div>
    </div>
  );
}
