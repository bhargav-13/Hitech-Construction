"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutGrid,
  FileText,
  Gavel,
  Building2,
  CalendarCheck,
  Wallet,
  CreditCard,
  Contact,
  ClipboardList,
  Warehouse,
  Wrench,
  Tag,
  BookOpen,
  Settings,
  Layers,
  ListChecks,
  ScrollText,
  Receipt,
  MapPin,
  ListTodo,
  LocateFixed,
  LogOut,
  BadgeCheck,
  LifeBuoy,
  LayoutTemplate,
  ChevronDown,
  ChevronRight,
  ChevronUp,
} from "lucide-react";
import { NAV_ITEMS, NAV_BREAK_AFTER, NAV_MODULE, NAV_ANY_MODULE } from "@/lib/nav";
import { useAppStore } from "@/lib/store";
import { useAuthStore } from "@/lib/authStore";
import { useNotifications } from "@/lib/notifications";
import { useCan } from "@/lib/permissions";
import { activeChild, childrenFor, type NavChild } from "@/lib/navChildren";
import { useApprovalInboxCount } from "@/lib/approvals";
import { useTaskStore } from "@/lib/taskStore";
import { projectAvatarColor, projectInitials } from "@/lib/projectHelpers";
import { CompanySwitcher } from "@/components/CompanySwitcher";
import { useCompanies, companyAccent } from "@/lib/companyScope";

const ICONS: Record<string, React.ComponentType<{ size?: number; className?: string }>> = {
  Dashboard: LayoutGrid,
  Tender: Gavel,
  Report: FileText,
  Project: Building2,
  "Team Schedule": CalendarCheck,
  Finance: Wallet,
  Payroll: CreditCard,
  "Live Map": LocateFixed,
  CRM: Contact,
  Procurement: ClipboardList,
  Warehouse: Warehouse,
  Equipment: Wrench,
  Asset: Tag,
  Library: BookOpen,
  Setting: Settings,
  Services: Layers,
  Taskopad: ListChecks,
  Audit: ScrollText,
  Vyapar: Receipt,
  Approvals: BadgeCheck,
  Help: LifeBuoy,
  Templates: LayoutTemplate,
};

export function Sidebar() {
  const pathname = usePathname();
  // The sidebar is a rail of icons that takes 76px of the page. Resting the pointer on it slides
  // the whole menu open *over* the page — names, sub-menus and all — and moving away folds it
  // back, so the page never jumps sideways (the way a browser's vertical tab strip behaves). There
  // is no button to expand or collapse it: hovering is the only way in, and it is always enough.
  const [peek, setPeek] = useState(false);
  const peekTimer = useRef<number | null>(null);
  const setPeekSoon = (open: boolean) => {
    if (peekTimer.current) window.clearTimeout(peekTimer.current);
    // A short wait both ways: brushing past the rail does not open it, and slipping off the edge
    // for a moment does not close it.
    peekTimer.current = window.setTimeout(() => setPeek(open), open ? 140 : 240);
  };
  /** Showing as the icon rail right now. Everything below draws from this. */
  const collapsed = !peek;
  const currentUserId = useAppStore((s) => s.currentUserId);
  const users = useAppStore((s) => s.users);
  const logout = useAppStore((s) => s.logout);
  const authUser = useAuthStore((s) => s.user);
  const authLogout = useAuthStore((s) => s.logout);
  const mockUser = users.find((u) => u.id === currentUserId);
  // Prefer the real backend session for display/gating; fall back to the mock user for the
  // not-yet-migrated feature screens if the real session hasn't loaded yet.
  const currentUser = mockUser;
  const displayName = authUser?.fullName ?? mockUser?.name ?? "";
  const displayRole = authUser?.role.name ?? mockUser?.role ?? "";
  // Show a nav item only if the signed-in user's role has "<MODULE>:VIEW". No permission → the
  // item isn't rendered at all (e.g. no DASHBOARD:VIEW means no Dashboard link in the sidebar).
  const perms = authUser?.permissions ?? [];
  const can = useCan();
  const navItems = authUser
    ? NAV_ITEMS.filter((item) => {
        const any = NAV_ANY_MODULE[item.href];
        if (any) return authUser.role.name === "Super Admin" || any.some((m) => perms.includes(`${m}:VIEW`));
        const module = NAV_MODULE[item.href];
        return !module || perms.includes(`${module}:VIEW`);
      })
    : NAV_ITEMS;
  // The one item to highlight: the longest href the path starts with, so /payroll/live lights up
  // Live Map and not Payroll as well.
  const activeHref = navItems
    .filter((item) => (item.href === "/" ? pathname === "/" : pathname.startsWith(item.href)))
    .reduce<string | null>((best, item) => (!best || item.href.length > best.length ? item.href : best), null);
  // Unread task-notification count — the bell's number. Only the Taskopad badge's fallback now.
  const { unread: taskUnread } = useNotifications();
  // Tasks waiting on this user's approval — the same list as Taskopad › Approvals, so the sidebar
  // badge and that tab always agree. The badge used to show unread notifications (99+) while the
  // tab said 5. Approve / reject update this store at once; the rest is kept fresh below.
  const canApproveTasks = can("TASKOPAD_APPROVALS");
  const taskApprovals = useTaskStore((s) => s.approvals.length);
  const loadTaskApprovals = useTaskStore((s) => s.loadApprovals);
  useEffect(() => {
    if (!authUser || !canApproveTasks) return;
    void loadTaskApprovals();
    const t = window.setInterval(() => void loadTaskApprovals(), 30_000);
    const onVisible = () => {
      if (document.visibilityState === "visible") void loadTaskApprovals();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      window.clearInterval(t);
      document.removeEventListener("visibilitychange", onVisible);
    };
    // Re-read on every page change too, so moving around the app never shows a stale number.
  }, [authUser, canApproveTasks, loadTaskApprovals, pathname]);
  // Requests waiting on this user, across every approval chain.
  const approvalCount = useApprovalInboxCount((s) => s.count);
  const refreshApprovals = useApprovalInboxCount((s) => s.refresh);
  useEffect(() => {
    if (!authUser) return;
    void refreshApprovals();
    const t = window.setInterval(() => void refreshApprovals(), 60_000);
    return () => window.clearInterval(t);
  }, [authUser, refreshApprovals]);
  // The firm currently being worked in. Its accent paints the strip down the sidebar's outer edge:
  // with two companies behind one login, "which books am I in?" has to be answerable at a glance.
  const { active: activeCompany } = useCompanies();
  const accentBar = companyAccent(activeCompany).bar;

  // ---- "There is more" hints -------------------------------------------------------------
  // The menu scrolls without a scrollbar (the operating system's bar looked out of place on the
  // dark rail), so something else has to say there is more above or below: a fade over the edge
  // and a small arrow that scrolls a screenful when pressed.
  const navRef = useRef<HTMLElement>(null);
  const [more, setMore] = useState({ up: false, down: false });
  const measureMore = useCallback(() => {
    const el = navRef.current;
    if (!el) return;
    const up = el.scrollTop > 4;
    const down = el.scrollTop + el.clientHeight < el.scrollHeight - 4;
    setMore((m) => (m.up === up && m.down === down ? m : { up, down }));
  }, []);
  useEffect(() => {
    const el = navRef.current;
    if (!el) return;
    // Fires once on observe and again whenever the rail or the window changes height.
    const watch = new ResizeObserver(measureMore);
    watch.observe(el);
    if (el.firstElementChild) watch.observe(el.firstElementChild);
    // And once on arrival, without waiting for a paint: a tab opened in the background draws no
    // frames, so the observer alone would leave the hint off until the first scroll.
    const first = window.setTimeout(measureMore, 0);
    return () => {
      watch.disconnect();
      window.clearTimeout(first);
    };
    // Measured again when the menu changes: the rail collapsing, or a role's modules arriving.
  }, [measureMore, collapsed, navItems.length]);
  const scrollNav = (by: number) => navRef.current?.scrollBy({ top: by, behavior: "smooth" });

  // ---- Sub-menus --------------------------------------------------------------------------
  // Expanded: a module with screens of its own opens in place, its screens hanging off a tree
  // line. The module being worked in starts open; the arrow opens or closes any of them.
  const [openGroups, setOpenGroups] = useState<Record<string, boolean>>({});
  const isOpen = (href: string) => openGroups[href] ?? href === activeHref;
  const toggleGroup = (href: string) => setOpenGroups((g) => ({ ...g, [href]: !(g[href] ?? href === activeHref) }));

  async function handleLogout() {
    await authLogout();
    logout();
    // A full page load, not a client-side route change: every in-memory store (tasks, checklist,
    // notifications, caches) is dropped with it, so the next person to sign in on this browser
    // never sees what the last one had loaded.
    window.location.replace("/login");
  }

  return (
    // The outer box is what the page is laid out against: 76px while collapsed, however wide the
    // menu inside it is being shown. The sidebar itself floats in it, so opening on hover covers
    // the page instead of shoving it across.
    <div
      className="relative z-40 h-full w-[76px] flex-shrink-0"
      onMouseEnter={() => setPeekSoon(true)}
      // Keyboard: tabbing into the rail opens it, tabbing out closes it.
      onFocus={() => setPeekSoon(true)}
      onBlur={() => setPeekSoon(false)}
      onMouseLeave={() => setPeekSoon(false)}
    >
    <aside
      className={`absolute inset-y-0 left-0 flex flex-col overflow-hidden border-r border-sidebar-border bg-sidebar-bg text-sidebar-text transition-[width,box-shadow] duration-200 ease-out ${
        collapsed ? "w-[76px]" : "w-64"
      } ${peek ? "shadow-[8px_0_32px_rgba(0,0,0,0.35)]" : ""}`}
    >
      {/* Per-company accent down the outer edge. Cheap, always visible, and the thing that stops
          someone raising one firm's invoice while looking at the other's books. */}
      <span aria-hidden className={`absolute inset-y-0 left-0 w-[3px] ${accentBar}`} />
      {/* The firm's name used to be printed here. It's now the company switcher — the subtitle
          carries GSTIN/city rather than the user's role, which the user card at the foot of this
          sidebar already shows. */}
      <div className="px-3 py-4">
        <CompanySwitcher collapsed={collapsed} />
      </div>

      <div className="relative flex min-h-0 flex-1 flex-col">
      <nav
        ref={navRef}
        onScroll={() => {
          measureMore();
        }}
        className="no-scrollbar flex-1 overflow-y-auto px-3 py-2"
      >
        <ul className="space-y-1">
          {navItems.flatMap((item, idx) => {
            const Icon = ICONS[item.label] ?? LayoutGrid;
            const active = item.href === activeHref;
            // Taskopad: tasks awaiting this user's approval (matches the Approvals tab). A user who
            // can't approve has no such tab, so they keep the unread-notification count.
            const count =
              item.href === "/taskopad"
                ? canApproveTasks
                  ? taskApprovals
                  : taskUnread
                : item.href === "/approvals"
                  ? approvalCount
                  : 0;
            const target = item.landing && can(item.landingFeature) ? item.landing : item.href;
            const kids = childrenFor(item.href, can);
            const open = kids.length > 0 && isOpen(item.href);
            const link = collapsed ? (
              // Collapsed rail: one rounded square per module, lit when it is the current one or
              // the one being hovered.
              <li key={item.href} className="flex justify-center">
                <Link
                  href={target}
                  aria-label={item.label}
                  title={item.label}
                  className={`group relative flex h-11 w-11 items-center justify-center rounded-xl transition-all duration-150 ease-out active:scale-95 ${
                    active
                      ? "bg-sidebar-active/15 text-sidebar-active"
                      : "text-sidebar-text hover:bg-white/10 hover:text-white"
                  }`}
                >
                  <Icon size={19} className="flex-shrink-0 transition-transform duration-200 ease-out group-hover:scale-110" />
                  {count > 0 && (
                    <span className="absolute -top-0.5 -right-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-rose-500 px-1 text-[9px] font-semibold text-white">
                      {count > 9 ? "9+" : count}
                    </span>
                  )}
                </Link>
              </li>
            ) : (
              <li key={item.href}>
                <div
                  className={`group flex items-center rounded-xl transition-colors duration-150 ${
                    active ? "bg-sidebar-active/10 text-white" : "text-sidebar-text hover:bg-white/5 hover:text-white"
                  }`}
                >
                  <Link href={target} className="flex min-w-0 flex-1 items-center gap-3 py-2.5 pr-2 pl-3 text-sm transition-transform duration-150 active:scale-[0.98]">
                    <Icon size={18} className={`flex-shrink-0 ${active ? "text-sidebar-active" : ""}`} />
                    <span className={`truncate ${active ? "font-medium" : ""}`}>{item.label}</span>
                    {count > 0 && (
                      <span className="ml-auto flex h-5 min-w-5 items-center justify-center rounded-md bg-rose-500 px-1.5 text-[10px] font-semibold text-white">
                        {count > 99 ? "99+" : count}
                      </span>
                    )}
                    {!count && item.badge && (
                      <span className="ml-auto rounded-full bg-amber-400/20 px-1.5 py-0.5 text-[9px] font-semibold tracking-wide text-amber-300 uppercase">
                        {item.badge}
                      </span>
                    )}
                  </Link>
                  {kids.length > 0 && (
                    <button
                      type="button"
                      onClick={() => toggleGroup(item.href)}
                      aria-expanded={open}
                      aria-label={`${open ? "Hide" : "Show"} ${item.label} screens`}
                      className="mr-1.5 flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-lg text-sidebar-text transition-colors duration-150 hover:bg-white/10 hover:text-white"
                    >
                      <ChevronDown size={15} className={`transition-transform duration-200 ${open ? "rotate-180" : ""}`} />
                    </button>
                  )}
                </div>
                {kids.length > 0 && (
                  // Opens by growing its row from nothing to its natural height, so it eases open.
                  <div className={`grid transition-[grid-template-rows] duration-200 ease-out ${open ? "grid-rows-[1fr]" : "grid-rows-[0fr]"}`}>
                    <div className="overflow-hidden">
                      <SubMenu items={kids} current={activeChild(kids, pathname, item.href)} inert={!open} />
                    </div>
                  </div>
                )}
              </li>
            );
            const next = navItems[idx + 1];
            const nextInGroup = !!next && next.href.startsWith(`${item.href}/`);
            if (NAV_BREAK_AFTER.has(item.label) && next && !nextInGroup) {
              return [
                link,
                <li key={`${item.href}-divider`} aria-hidden className={`my-2 border-t border-sidebar-border ${collapsed ? "mx-2" : ""}`} />,
              ];
            }
            return [link];
          })}
        </ul>
      </nav>
        {/* More above / below: a fade over the edge and an arrow to get there. */}
        <div
          aria-hidden={!more.up}
          className={`pointer-events-none absolute inset-x-0 top-0 flex h-9 items-start justify-center bg-gradient-to-b from-sidebar-bg via-sidebar-bg/80 to-transparent transition-opacity duration-200 ${more.up ? "opacity-100" : "opacity-0"}`}
        >
          <button
            type="button"
            tabIndex={more.up ? 0 : -1}
            onClick={() => scrollNav(-220)}
            title="More above"
            className={`mt-0.5 flex h-5 w-8 items-center justify-center rounded-full bg-white/10 text-white/80 transition-colors hover:bg-white/20 hover:text-white ${more.up ? "pointer-events-auto" : ""}`}
          >
            <ChevronUp size={14} />
          </button>
        </div>
        <div
          aria-hidden={!more.down}
          className={`pointer-events-none absolute inset-x-0 bottom-0 flex h-11 items-end justify-center bg-gradient-to-t from-sidebar-bg via-sidebar-bg/85 to-transparent transition-opacity duration-200 ${more.down ? "opacity-100" : "opacity-0"}`}
        >
          <button
            type="button"
            tabIndex={more.down ? 0 : -1}
            onClick={() => scrollNav(220)}
            title="More below"
            className={`mb-1 flex h-5 items-center justify-center gap-1 rounded-full bg-white/10 px-2 text-[10px] font-medium text-white/80 transition-colors hover:bg-white/20 hover:text-white ${more.down ? "pointer-events-auto" : ""}`}
          >
            {!collapsed && <span>More</span>}
            <ChevronDown size={14} className="animate-bounce" />
          </button>
        </div>
      </div>

      {/* Self-service actions every signed-in person gets, not just admins: Punch, and a private
          To-Do list (board, calendar, reminders) that nobody else can read — Taskopad stays the
          team's task system. */}
      {(authUser || currentUser) && (
        <div className={`grid gap-2 border-t border-sidebar-border px-3 py-3 ${collapsed ? "grid-cols-1" : "grid-cols-2"}`}>
          <QuickAction icon={MapPin} label="Punch" href="/punch" collapsed={collapsed} active={pathname.startsWith("/punch")} />
          <QuickAction icon={ListTodo} label="To-Do" href="/todo" collapsed={collapsed} active={pathname.startsWith("/todo")} />
        </div>
      )}

      {(authUser || currentUser) && (
        <div className={`border-t border-sidebar-border p-3 ${collapsed ? "flex justify-center" : ""}`}>
          {collapsed ? (
            <button
              onClick={handleLogout}
              title={`Log out — ${displayName}`}
              className="flex h-9 w-9 items-center justify-center rounded-lg text-sidebar-text transition-all duration-150 hover:bg-rose-500/15 hover:text-rose-300 active:scale-90"
            >
              <LogOut size={16} />
            </button>
          ) : (
            <div className="flex items-center gap-3">
              <div
                className={`flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full text-xs font-semibold text-white ${projectAvatarColor(String(authUser?.id ?? currentUser?.id ?? ""))}`}
              >
                {projectInitials(displayName)}
              </div>
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm font-medium text-white">{displayName}</div>
                <div className="truncate text-[11px] text-sidebar-text">{displayRole}</div>
              </div>
              <button
                onClick={handleLogout}
                title="Log out"
                className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg text-sidebar-text transition-all duration-150 hover:bg-rose-500/15 hover:text-rose-300 active:scale-90"
              >
                <LogOut size={16} />
              </button>
            </div>
          )}
        </div>
      )}
    </aside>
    </div>
  );
}

/**
 * A module's screens, hanging off a tree line: a rule down the left with a short branch to each
 * screen, the current one on a lit pill with an arrow. Used under an open module in the expanded
 * sidebar and on the hover card of the collapsed one.
 */
function SubMenu({
  items,
  current,
  onNavigate,
  inert = false,
  flush = false,
}: {
  items: NavChild[];
  current: string | null;
  onNavigate?: () => void;
  /** Closed and out of sight: keep its links out of the tab order. */
  inert?: boolean;
  /** No indent — on the hover card, where there is no icon column to line up under. */
  flush?: boolean;
}) {
  return (
    <ul className={`relative my-1 space-y-0.5 border-l border-white/10 ${flush ? "ml-2.5" : "ml-[21px]"}`}>
      {items.map((c, i) =>
        c.heading || !c.href ? (
          <li key={`h-${i}-${c.label}`} className="px-4 pt-2 pb-0.5 text-[10px] font-semibold tracking-wider text-white/35 uppercase">
            {c.label}
          </li>
        ) : (
          <li key={c.href} className="relative pl-3">
            <span aria-hidden className="absolute top-1/2 left-0 h-px w-2.5 bg-white/10" />
            <Link
              href={c.href}
              onClick={onNavigate}
              tabIndex={inert ? -1 : undefined}
              className={`flex items-center justify-between gap-2 rounded-lg px-3 py-2 text-[13px] transition-colors duration-150 ${
                current === c.href ? "bg-sidebar-active/15 font-medium text-white" : "text-sidebar-text hover:bg-white/5 hover:text-white"
              }`}
            >
              <span className="truncate">{c.label}</span>
              {current === c.href && <ChevronRight size={14} className="flex-shrink-0 text-sidebar-active" />}
            </Link>
          </li>
        ),
      )}
    </ul>
  );
}

function QuickAction({
  icon: Icon,
  label,
  href,
  collapsed,
  active = false,
  onTip,
  offTip,
}: {
  icon: React.ComponentType<{ size?: number; className?: string }>;
  label: string;
  href?: string;
  collapsed: boolean;
  active?: boolean;
  /** Collapsed rail: slide this action's name out beside it while it is hovered. */
  onTip?: (el: HTMLElement, label: string) => void;
  offTip?: () => void;
}) {
  const cls = `group flex flex-col items-center gap-1 rounded-lg border px-2 py-2 text-[11px] transition-all duration-150 hover:border-sidebar-active/40 hover:bg-sidebar-active/5 hover:text-sidebar-active active:scale-95 ${
    active ? "border-sidebar-active/50 bg-sidebar-active/10 text-sidebar-active" : "border-sidebar-border text-sidebar-text"
  }`;
  const content = (
    <>
      <Icon size={16} className={`transition-transform duration-200 ease-out ${collapsed ? "group-hover:scale-[1.3]" : ""}`} />
      {!collapsed && <span>{label}</span>}
    </>
  );
  if (href) {
    return (
      <Link
        href={href}
        className={cls}
        aria-label={collapsed ? label : undefined}
        onMouseEnter={(e) => onTip?.(e.currentTarget, label)}
        onMouseLeave={offTip}
        onClick={offTip}
      >
        {content}
      </Link>
    );
  }
  return (
    <button className={cls} title={collapsed ? label : undefined}>
      {content}
    </button>
  );
}
