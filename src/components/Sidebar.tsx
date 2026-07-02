"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
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
} from "lucide-react";
import { NAV_ITEMS, NAV_BREAK_AFTER } from "@/lib/nav";

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
  const [collapsed, setCollapsed] = useState(false);

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
              <div className="truncate text-xs text-sidebar-text">Admin</div>
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
          {NAV_ITEMS.flatMap((item) => {
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
            if (NAV_BREAK_AFTER.has(item.label)) {
              return [
                link,
                <li key={`${item.href}-divider`} aria-hidden className="my-2 border-t border-sidebar-border" />,
              ];
            }
            return [link];
          })}
        </ul>
      </nav>

      <div
        className={`grid gap-2 border-t border-sidebar-border px-3 py-3 ${
          collapsed ? "grid-cols-1" : "grid-cols-3"
        }`}
      >
        <QuickAction icon={FileSignature} label="MOM" collapsed={collapsed} />
        <QuickAction icon={CheckSquare} label="To Do" href="/todo" collapsed={collapsed} />
        <QuickAction icon={MessageCircle} label="Chat" collapsed={collapsed} />
      </div>

      {!collapsed && (
        <div className="border-t border-sidebar-border px-4 py-3 text-[11px] text-sidebar-text/70">
          © Hi-Tech Construction | v1.0.0
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
