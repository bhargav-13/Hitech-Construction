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
  MessageCircle,
  PanelLeftClose,
  PanelLeftOpen,
  LogOut,
} from "lucide-react";
import { NAV_ITEMS, NAV_BREAK_AFTER } from "@/lib/nav";
import { useAppStore } from "@/lib/store";
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
};

export function Sidebar() {
  const pathname = usePathname();
  const router = useRouter();
  const [collapsed, setCollapsed] = useState(false);
  const currentUserId = useAppStore((s) => s.currentUserId);
  const users = useAppStore((s) => s.users);
  const logout = useAppStore((s) => s.logout);
  const currentUser = users.find((u) => u.id === currentUserId);
  const navItems = currentUser
    ? NAV_ITEMS.filter((item) => canAccess(currentUser.role, item.href))
    : NAV_ITEMS;
  const isAdmin = currentUser?.role === "Admin";

  function handleLogout() {
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
            <div className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full bg-sidebar-active text-sm font-bold text-white">
              HT
            </div>
            <div className="min-w-0 flex-1">
              <div className="truncate text-sm font-semibold text-gray-800">
                Hi-Tech Construction
              </div>
              <div className="truncate text-xs text-sidebar-text">
                {currentUser?.role ?? "Admin"}
              </div>
            </div>
          </>
        )}
        <button
          type="button"
          onClick={() => setCollapsed((c) => !c)}
          className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-md border border-sidebar-border text-sidebar-text transition-colors hover:bg-gray-50 hover:text-gray-700"
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
                  className={`flex items-center gap-3 rounded-r-lg border-l-[3px] py-2.5 pl-[9px] pr-3 text-sm transition-colors ${
                    active
                      ? "border-sidebar-active bg-sidebar-active/5 font-medium text-sidebar-active"
                      : "border-transparent text-sidebar-text hover:bg-gray-50 hover:text-gray-800"
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

      {currentUser && (
        <div className={`border-t border-sidebar-border p-3 ${collapsed ? "flex justify-center" : ""}`}>
          {collapsed ? (
            <button
              onClick={handleLogout}
              title={`Log out — ${currentUser.name}`}
              className="flex h-9 w-9 items-center justify-center rounded-lg text-sidebar-text hover:bg-rose-50 hover:text-rose-600"
            >
              <LogOut size={16} />
            </button>
          ) : (
            <div className="flex items-center gap-3">
              <div
                className={`flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full text-xs font-semibold text-white ${projectAvatarColor(currentUser.id)}`}
              >
                {projectInitials(currentUser.name)}
              </div>
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm font-medium text-gray-800">{currentUser.name}</div>
                <div className="truncate text-[11px] text-sidebar-text">{currentUser.role}</div>
              </div>
              <button
                onClick={handleLogout}
                title="Log out"
                className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg text-sidebar-text hover:bg-rose-50 hover:text-rose-600"
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
    "flex flex-col items-center gap-1 rounded-lg border border-sidebar-border px-2 py-2 text-[11px] text-sidebar-text transition-colors hover:border-sidebar-active/40 hover:text-sidebar-active";
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
