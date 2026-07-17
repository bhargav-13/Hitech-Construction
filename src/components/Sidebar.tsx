"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  LayoutGrid,
  FileText,
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
  FileSignature,
  CheckSquare,
  ListChecks,
  MessageCircle,
  PanelLeftClose,
  PanelLeftOpen,
  LogOut,
} from "lucide-react";
import { NAV_ITEMS, NAV_BREAK_AFTER } from "@/lib/nav";
import { useAppStore } from "@/lib/store";
import { useAuthStore } from "@/lib/authStore";
import { projectAvatarColor, projectInitials } from "@/lib/projectHelpers";
import { canAccess } from "@/lib/permissions";

const ICONS: Record<string, React.ComponentType<{ size?: number; className?: string }>> = {
  Dashboard: LayoutGrid,
  Report: FileText,
  Project: Building2,
  "Team Schedule": CalendarCheck,
  Finance: Wallet,
  Payroll: CreditCard,
  CRM: Contact,
  Procurement: ClipboardList,
  Warehouse: Warehouse,
  Equipment: Wrench,
  Asset: Tag,
  Library: BookOpen,
  Setting: Settings,
  Services: Layers,
  Taskopad: ListChecks,
};

export function Sidebar() {
  const pathname = usePathname();
  const router = useRouter();
  const [collapsed, setCollapsed] = useState(false);
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
  const navItems = mockUser
    ? NAV_ITEMS.filter((item) => canAccess(mockUser.role, item.href))
    : NAV_ITEMS;
  const isAdmin = mockUser?.role === "Admin" || authUser?.permissions.includes("USER_MANAGEMENT:VIEW");

  async function handleLogout() {
    await authLogout();
    logout();
    router.replace("/login");
  }

  return (
    <aside
      className={`flex h-full flex-shrink-0 flex-col border-r border-sidebar-border bg-sidebar-bg text-sidebar-text transition-all duration-200 ${
        collapsed ? "w-[76px]" : "w-64"
      }`}
    >
      <div className={`flex items-center px-4 py-4 ${collapsed ? "justify-center" : "gap-3"}`}>
        {!collapsed && (
          <>
            <div className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full bg-brand-accent text-sm font-bold text-white">
              HT
            </div>
            <div className="min-w-0 flex-1">
              <div className="truncate text-sm font-semibold text-white">
                Hi-Tech Construction
              </div>
              <div className="truncate text-xs text-sidebar-text">
                {displayRole || "Admin"}
              </div>
            </div>
          </>
        )}
        <button
          type="button"
          onClick={() => setCollapsed((c) => !c)}
          className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-md border border-sidebar-border text-sidebar-text transition-all duration-150 hover:bg-white/10 hover:text-white active:scale-90"
          aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
        >
          {collapsed ? <PanelLeftOpen size={15} /> : <PanelLeftClose size={15} />}
        </button>
      </div>

      <nav className="flex-1 overflow-y-auto px-3 py-2">
        <ul className="space-y-1">
          {navItems.flatMap((item, idx) => {
            const Icon = ICONS[item.label] ?? LayoutGrid;
            const active =
              item.href === "/" ? pathname === "/" : pathname.startsWith(item.href);
            const link = (
              <li key={item.href}>
                <Link
                  href={item.href}
                  title={collapsed ? item.label : undefined}
                  className={`flex items-center gap-3 rounded-r-lg border-l-[3px] py-2.5 pl-[9px] pr-3 text-sm transition-all duration-150 ease-out active:scale-[0.98] ${
                    active
                      ? "border-sidebar-active bg-sidebar-active/10 font-medium text-sidebar-active"
                      : "border-transparent text-sidebar-text hover:border-sidebar-active/30 hover:bg-white/5 hover:text-white"
                  }`}
                >
                  <Icon size={18} className="flex-shrink-0" />
                  {!collapsed && <span className="truncate">{item.label}</span>}
                </Link>
              </li>
            );
            if (NAV_BREAK_AFTER.has(item.label) && idx < navItems.length - 1) {
              return [
                link,
                <li key={`${item.href}-divider`} aria-hidden className="my-2 border-t border-sidebar-border" />,
              ];
            }
            return [link];
          })}
        </ul>
      </nav>

      {isAdmin && (
        <div
          className={`grid gap-2 border-t border-sidebar-border px-3 py-3 ${
            collapsed ? "grid-cols-1" : "grid-cols-3"
          }`}
        >
          <QuickAction icon={FileSignature} label="MOM" collapsed={collapsed} />
          <QuickAction icon={CheckSquare} label="To Do" href="/todo" collapsed={collapsed} />
          <QuickAction icon={MessageCircle} label="Chat" collapsed={collapsed} />
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
  );
}

function QuickAction({
  icon: Icon,
  label,
  href,
  collapsed,
}: {
  icon: React.ComponentType<{ size?: number }>;
  label: string;
  href?: string;
  collapsed: boolean;
}) {
  const cls =
    "flex flex-col items-center gap-1 rounded-lg border border-sidebar-border px-2 py-2 text-[11px] text-sidebar-text transition-all duration-150 hover:border-sidebar-active/40 hover:bg-sidebar-active/5 hover:text-sidebar-active active:scale-95";
  const content = (
    <>
      <Icon size={16} />
      {!collapsed && <span>{label}</span>}
    </>
  );
  if (href) {
    return (
      <Link href={href} className={cls} title={collapsed ? label : undefined}>
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
