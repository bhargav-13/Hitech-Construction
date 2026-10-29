"use client";

import { Suspense, useEffect, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { AppShell } from "@/components/AppShell";
import { VYAPAR_NAV, DOC_CONFIGS, docFeature } from "@/lib/vyaparConfig";
import { filterNav, useCan } from "@/lib/permissions";
import type { NavNode } from "@/lib/vyaparConfig";
import { useUiStore } from "@/lib/uiStore";
import { useVyaparSettings } from "@/lib/useVyaparSettings";
import { CalculatorPanel } from "@/components/vyapar/CalculatorPanel";
import { MENU_SHORTCUT, comboOf, useVyaparShortcuts } from "@/lib/vyaparShortcuts";
import {
  BarChart3,
  Boxes,
  Building2,
  Calculator,
  ChevronDown,
  ChevronRight,
  FileText,
  Home,
  Keyboard,
  PanelLeftClose,
  PanelLeftOpen,
  Pin,
  Plus,
  Search,
  Settings,
  ShoppingCart,
  Users,
  Wrench,
} from "lucide-react";
import { AutoRefreshBadge } from "@/components/AutoRefreshBadge";
import { useAutoRefreshClock } from "@/lib/autoRefresh";

const QUICK_ADD_KEY = "hlt.vyapar.quickAdd";
const DEFAULT_QUICK_ADD = ["SALE", "PURCHASE"];

/** Sale and Purchase keep their familiar colours; anything else pinned gets a neutral chip. */
const QUICK_ADD_TONE: Record<string, string> = {
  SALE: "bg-rose-50 text-rose-600 hover:bg-rose-100",
  PURCHASE: "bg-cyan-50 text-brand-accent hover:bg-cyan-100",
};

/** Shorter names for the top bar, where every character counts. */
const QUICK_ADD_LABEL: Record<string, string> = { SALE: "Sale", PURCHASE: "Purchase", EXPENSE: "Expense" };

/**
 * Which documents get a button of their own on the top bar, chosen from the Add More panel. Kept
 * in this browser: it's a personal layout preference, not something the firm shares.
 */
function useQuickAdd() {
  const [pinned, setPinned] = useState<string[]>(DEFAULT_QUICK_ADD);
  useEffect(() => {
    try {
      const raw = localStorage.getItem(QUICK_ADD_KEY);
      if (raw) setPinned(JSON.parse(raw));
    } catch {}
  }, []);
  const toggle = (type: string) =>
    setPinned((cur) => {
      const next = cur.includes(type) ? cur.filter((t) => t !== type) : [...cur, type];
      try {
        localStorage.setItem(QUICK_ADD_KEY, JSON.stringify(next));
      } catch {}
      return next;
    });
  return { pinned, toggle };
}

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
  // Every Vyapar screen refreshes itself every 3 minutes — never while someone is editing.
  useAutoRefreshClock();
  const pathname = usePathname();
  const router = useRouter();
  const [addOpen, setAddOpen] = useState(false);
  // Screens and quick-create entries the role's Roles & Access features don't cover are left out.
  const can = useCan();
  const nav = filterNav(VYAPAR_NAV, can);
  const canCreate = (type: string) => can(`${docFeature(type)}:CREATE`);
  const creatable = DOC_CONFIGS.filter((d) => canCreate(d.type));
  const [calcOpen, setCalcOpen] = useState(false);
  const quickAdd = useQuickAdd();
  // In pin order, so the newest pin lands at the end of the row.
  const quickButtons = quickAdd.pinned
    .map((t) => creatable.find((d) => d.type === t))
    .filter((d): d is (typeof creatable)[number] => !!d);
  // Persisted alongside the main sidebar so both survive route changes.
  const railCollapsed = useUiStore((s) => s.vyaparRailCollapsed);
  const toggleRail = useUiStore((s) => s.toggleVyaparRail);
  // Loaded once for the whole module. Reading it here is what pushes the decimal-places setting
  // into `inr`/`qty`, so every amount below the shell renders the way the books are configured.
  useVyaparSettings();

  // Vyapar's keyboard shortcuts (Alt+S Sale, Alt+P Purchase, … Ctrl+Enter this menu), editable
  // under Settings → Shortcuts. Capture phase, so a focused input can't swallow them first.
  const shortcuts = useVyaparShortcuts().map;
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.repeat || document.body.dataset.shortcutRecording) return;
      const combo = comboOf(e);
      if (!combo) return;
      const hit = Object.entries(shortcuts).find(([, c]) => c && c === combo)?.[0];
      if (!hit) return;
      if (hit === MENU_SHORTCUT) {
        if (!creatable.length) return;
        e.preventDefault();
        setAddOpen((o) => !o);
        return;
      }
      const doc = creatable.find((d) => d.type === hit);
      if (!doc) return;
      e.preventDefault();
      setAddOpen(false);
      router.push(`/vyapar/${doc.slug}?new=1`);
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [shortcuts, creatable, router]);
  useEffect(() => {
    if (!addOpen) return;
    const onEsc = (e: KeyboardEvent) => { if (e.key === "Escape") setAddOpen(false); };
    window.addEventListener("keydown", onEsc);
    return () => window.removeEventListener("keydown", onEsc);
  }, [addOpen]);

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
        {/* Vyapar's left rail. It sizes to its menu and stays in view while a long page scrolls
            (sticky inside AppShell's scrolling <main>) — stretched to the page's height it became an
            empty white column below the menu on every long ledger or list. */}
        <aside
          className={`hidden shrink-0 self-start rounded-xl border border-gray-200 bg-white p-2 transition-[width] duration-200 lg:sticky lg:top-0 lg:block lg:max-h-[calc(100dvh-7.5rem)] lg:overflow-y-auto ${
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

            {quickButtons.map((d) => (
              <Link
                key={d.type}
                href={`/vyapar/${d.slug}?new=1`}
                className={`flex items-center gap-1 rounded-lg px-3 py-1.5 text-sm font-semibold transition-all duration-150 active:scale-95 ${
                  QUICK_ADD_TONE[d.type] ?? "bg-gray-50 text-gray-700 ring-1 ring-gray-200 hover:bg-gray-100"
                }`}
              >
                <Plus size={14} /> Add {QUICK_ADD_LABEL[d.type] ?? d.label}
                {shortcuts[d.type] && <kbd className="ml-1 hidden rounded bg-white/70 px-1 text-[10px] font-medium text-gray-400 xl:inline">{shortcuts[d.type]}</kbd>}
              </Link>
            ))}

            <AutoRefreshBadge />

            {/* Vyapar puts a calculator in its title bar. Theirs launches the Windows Calculator;
                a web app can't, so this is our own — see CalculatorPanel. */}
            <div className="relative">
              <button
                onClick={() => setCalcOpen((o) => !o)}
                title="Calculator"
                aria-label="Calculator"
                aria-expanded={calcOpen}
                className={`flex items-center rounded-lg px-2.5 py-1.5 transition-all duration-150 active:scale-95 ${
                  calcOpen ? "bg-brand-accent text-white" : "bg-gray-100 text-gray-600 hover:bg-gray-200"
                }`}
              >
                <Calculator size={15} />
              </button>
              {calcOpen && <CalculatorPanel onClose={() => setCalcOpen(false)} />}
            </div>

            {/* Add More — the full quick-create menu, mirroring Vyapar's Ctrl+Enter panel */}
            {creatable.length > 0 && (
            <div className="relative">
              <button
                onClick={() => setAddOpen((o) => !o)}
                title={shortcuts[MENU_SHORTCUT] ? `Add More (${shortcuts[MENU_SHORTCUT]})` : "Add More"}
                className={`flex items-center gap-1 rounded-lg px-3 py-1.5 text-sm font-semibold transition-all duration-150 active:scale-95 ${
                  addOpen ? "bg-brand-accent text-white" : "bg-gray-100 text-gray-600 hover:bg-gray-200"
                }`}
              >
                <Plus size={14} /> Add More
              </button>
              {addOpen && (
                <>
                  <div className="fixed inset-0 z-30" onClick={() => setAddOpen(false)} />
                  <div className="animate-menu-pop absolute right-0 top-10 z-40 w-[760px] max-w-[calc(100vw-2rem)] origin-top-right rounded-xl border border-gray-100 bg-white p-4 shadow-2xl ring-1 ring-black/[0.04]">
                    <p className="mb-3 flex items-center gap-1.5 text-xs text-gray-400">
                      <Pin size={12} /> Pin an entry to keep it as a button on the top bar.
                      <Link href="/vyapar/settings?tab=Shortcuts" onClick={() => setAddOpen(false)} className="ml-auto inline-flex items-center gap-1 text-brand-accent hover:underline">
                        <Keyboard size={12} /> Customise shortcuts
                      </Link>
                    </p>
                    <div className="grid grid-cols-3 gap-4">
                      {(["SALE", "PURCHASE", "OTHERS"] as const).map((group) => (
                        <div key={group}>
                          <div className="mb-2 text-[11px] font-semibold tracking-wide text-gray-400 uppercase">
                            {group}
                          </div>
                          <div className="space-y-0.5">
                            {creatable.filter((d) => d.group === group).map((d) => {
                              const isPinned = quickAdd.pinned.includes(d.type);
                              return (
                                <div key={d.type} className="group/qa flex items-center rounded-lg hover:bg-cyan-50">
                                  <Link
                                    href={`/vyapar/${d.slug}?new=1`}
                                    onClick={() => setAddOpen(false)}
                                    className="min-w-0 flex-1 truncate px-2 py-1.5 text-sm text-gray-700 transition-colors duration-150 group-hover/qa:text-brand-accent"
                                  >
                                    {d.label}
                                  </Link>
                                  {shortcuts[d.type] && (
                                    <kbd className="shrink-0 px-1 text-[10px] font-medium tracking-wide text-gray-400 uppercase">{shortcuts[d.type].replace(/\+/g, " + ")}</kbd>
                                  )}
                                  <button
                                    type="button"
                                    onClick={() => quickAdd.toggle(d.type)}
                                    title={isPinned ? "Remove from top bar" : "Pin to top bar"}
                                    aria-label={isPinned ? `Unpin ${d.label}` : `Pin ${d.label}`}
                                    aria-pressed={isPinned}
                                    className={`mr-1 rounded p-1 transition-all duration-150 ${
                                      isPinned
                                        ? "text-brand-accent"
                                        : "text-gray-300 opacity-0 group-hover/qa:opacity-100 hover:text-brand-accent"
                                    }`}
                                  >
                                    <Pin size={13} className={isPinned ? "fill-current" : ""} />
                                  </button>
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      ))}
                    </div>
                    {shortcuts[MENU_SHORTCUT] && (
                      <div className="mt-4 flex items-center gap-1.5 rounded-lg bg-amber-100 px-3 py-2 text-xs text-gray-700">
                        Shortcut to open this menu:
                        {shortcuts[MENU_SHORTCUT].split("+").map((k, i) => (
                          <span key={i} className="flex items-center gap-1.5">
                            {i > 0 && <span>+</span>}
                            <kbd className="rounded bg-white px-1.5 py-0.5 font-semibold shadow-sm">{k}</kbd>
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                </>
              )}
            </div>
            )}
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
