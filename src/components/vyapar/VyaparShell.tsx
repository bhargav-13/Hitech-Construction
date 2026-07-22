"use client";

import { Suspense, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { AppShell } from "@/components/AppShell";
import { VYAPAR_NAV, DOC_CONFIGS } from "@/lib/vyaparConfig";
import type { NavNode } from "@/lib/vyaparConfig";
import { useUiStore } from "@/lib/uiStore";
import {
  BarChart3,
  Boxes,
  Building2,
  ChevronDown,
  ChevronRight,
  FileText,
  Home,
  PanelLeftClose,
  PanelLeftOpen,
  Plus,
  Search,
  Settings,
  ShoppingCart,
  Users,
  Wrench,
} from "lucide-react";

const ICONS: Record<string, React.ComponentType<{ size?: number; className?: string }>> = {
  home: Home,
  users: Users,
  boxes: Boxes,
  file: FileText,
  cart: ShoppingCart,
  bank: Building2,
  chart: BarChart3,
  tool: Wrench,
  settings: Settings,
};

/**
 * Vyapar's own chrome: a left rail with nested sections, a top bar with global search and the
 * Add Sale / Add Purchase / Add More quick-create menu.
 */
export function VyaparShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [addOpen, setAddOpen] = useState(false);
  // Persisted alongside the main sidebar so both survive route changes.
  const railCollapsed = useUiStore((s) => s.vyaparRailCollapsed);
  const toggleRail = useUiStore((s) => s.toggleVyaparRail);

  // Open the section containing the current route by default.
  const [open, setOpen] = useState<Record<string, boolean>>(() => {
    const init: Record<string, boolean> = {};
    for (const n of VYAPAR_NAV) {
      if (n.children?.some((c) => c.href && pathname.startsWith(c.href))) init[n.label] = true;
    }
    return init;
  });

  const isActive = (href?: string) =>
    !!href && (href === "/vyapar" ? pathname === "/vyapar" : pathname.startsWith(href));

  return (
    <AppShell title="Vyapar">
      <div className="animate-fade-in flex min-h-[calc(100vh-140px)] gap-4">
        {/* Vyapar's left rail */}
        <aside
          className={`hidden shrink-0 rounded-xl border border-gray-200 bg-white p-2 transition-[width] duration-200 lg:block ${
            railCollapsed ? "w-14" : "w-56"
          }`}
        >
          <button
            type="button"
            onClick={toggleRail}
            aria-label={railCollapsed ? "Expand Vyapar menu" : "Collapse Vyapar menu"}
            title={railCollapsed ? "Expand menu" : "Collapse menu"}
            className={`mb-1 flex h-8 items-center rounded-lg text-gray-400 transition-colors duration-150 hover:bg-gray-50 hover:text-brand-accent ${
              railCollapsed ? "w-full justify-center" : "w-full justify-end px-2"
            }`}
          >
            {railCollapsed ? <PanelLeftOpen size={15} /> : <PanelLeftClose size={15} />}
          </button>
          <nav className="space-y-0.5">
            {VYAPAR_NAV.map((node) => (
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

        <div className="min-w-0 flex-1 space-y-4">
          {/* Top bar */}
          <div className="flex flex-wrap items-center gap-2 rounded-xl border border-gray-200 bg-white px-3 py-2">
            <div className="flex min-w-[200px] flex-1 items-center gap-2 rounded-lg px-2 py-1.5 transition-colors duration-150 focus-within:bg-gray-50">
              <Search size={15} className="text-gray-400" />
              <input
                placeholder="Search Transactions"
                className="w-full bg-transparent text-sm outline-none"
                onKeyDown={(e) => {
                  if (e.key === "Enter") router.push("/vyapar/reports?r=transactions");
                }}
              />
            </div>

            <Link
              href="/vyapar/sale?new=1"
              className="flex items-center gap-1 rounded-lg bg-rose-50 px-3 py-1.5 text-sm font-semibold text-rose-600 transition-all duration-150 hover:bg-rose-100 active:scale-95"
            >
              <Plus size={14} /> Add Sale
            </Link>
            <Link
              href="/vyapar/purchase?new=1"
              className="flex items-center gap-1 rounded-lg bg-cyan-50 px-3 py-1.5 text-sm font-semibold text-brand-accent transition-all duration-150 hover:bg-cyan-100 active:scale-95"
            >
              <Plus size={14} /> Add Purchase
            </Link>

            {/* Add More — the full quick-create menu, mirroring Vyapar's Ctrl+Enter panel */}
            <div className="relative">
              <button
                onClick={() => setAddOpen((o) => !o)}
                className={`flex items-center gap-1 rounded-lg px-3 py-1.5 text-sm font-semibold transition-all duration-150 active:scale-95 ${
                  addOpen ? "bg-brand-accent text-white" : "bg-gray-100 text-gray-600 hover:bg-gray-200"
                }`}
              >
                <Plus size={14} /> Add More
              </button>
              {addOpen && (
                <>
                  <div className="fixed inset-0 z-30" onClick={() => setAddOpen(false)} />
                  <div className="animate-menu-pop absolute right-0 top-10 z-40 w-[560px] origin-top-right rounded-xl border border-gray-100 bg-white p-4 shadow-2xl ring-1 ring-black/[0.04]">
                    <div className="grid grid-cols-3 gap-4">
                      {(["SALE", "PURCHASE", "OTHERS"] as const).map((group) => (
                        <div key={group}>
                          <div className="mb-2 text-[11px] font-semibold tracking-wide text-gray-400 uppercase">
                            {group}
                          </div>
                          <div className="space-y-0.5">
                            {DOC_CONFIGS.filter((d) => d.group === group).map((d) => (
                              <Link
                                key={d.type}
                                href={`/vyapar/${d.slug}?new=1`}
                                onClick={() => setAddOpen(false)}
                                className="flex items-center justify-between rounded-lg px-2 py-1.5 text-sm text-gray-700 transition-colors duration-150 hover:bg-cyan-50 hover:text-brand-accent"
                              >
                                <span className="truncate">{d.label}</span>
                                <span className="ml-2 shrink-0 rounded bg-gray-100 px-1 text-[10px] text-gray-400">
                                  Alt+{d.shortcut}
                                </span>
                              </Link>
                            ))}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </>
              )}
            </div>
          </div>

          {/*
            Several Vyapar screens read ?new=1 via useSearchParams, which opts them into CSR.
            One boundary here covers every child, so the production build can still prerender
            the surrounding shell instead of failing the route.
          */}
          <Suspense fallback={null}>{children}</Suspense>
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
  node: NavNode;
  isActive: (href?: string) => boolean;
  open: boolean;
  onToggle: () => void;
  collapsed?: boolean;
}) {
  const Icon = ICONS[node.icon ?? ""] ?? FileText;
  const active = isActive(node.href);
  const childActive = node.children?.some((c) => isActive(c.href));

  // Collapsed: icon-only, with the label as a tooltip. A parent section links to its first child
  // so the rail stays navigable without room to expand the sub-list.
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
              {c.badge && (
                <span className="ml-1 shrink-0 rounded bg-emerald-100 px-1 text-[9px] font-semibold text-emerald-700">
                  {c.badge}
                </span>
              )}
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}

/** Shared empty state so every Vyapar list reads the same. */
export function VyaparEmpty({
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
