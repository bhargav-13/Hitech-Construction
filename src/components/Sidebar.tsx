"use client";

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
  ChevronDown,
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

  return (
    <aside className="flex h-full w-64 flex-shrink-0 flex-col bg-sidebar-bg text-sidebar-text">
      <div className="flex items-center gap-3 px-5 py-5">
        <div className="flex h-9 w-9 items-center justify-center rounded-full bg-white text-sm font-bold text-sidebar-bg">
          HT
        </div>
        <div className="flex-1 min-w-0">
          <div className="truncate text-sm font-semibold text-white">
            Hi-Tech Construction
          </div>
          <div className="text-xs text-sidebar-text">Admin</div>
        </div>
        <ChevronDown size={16} className="text-sidebar-text" />
      </div>

      <nav className="flex-1 overflow-y-auto px-3 py-2">
        <ul className="space-y-1">
          {NAV_ITEMS.map((item) => {
            const Icon = ICONS[item.label] ?? LayoutGrid;
            const active =
              item.href === "/" ? pathname === "/" : pathname.startsWith(item.href);
            return (
              <li key={item.href} className={NAV_BREAK_AFTER.has(item.label) ? "mb-3" : ""}>
                <Link
                  href={item.href}
                  className={`flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors ${
                    active
                      ? "bg-sidebar-active text-white"
                      : "text-sidebar-text hover:bg-sidebar-active/50 hover:text-white"
                  }`}
                >
                  <Icon size={18} />
                  <span>{item.label}</span>
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>

      <div className="grid grid-cols-3 gap-2 border-t border-white/10 px-3 py-3">
        <QuickAction icon={FileSignature} label="MOM" />
        <QuickAction icon={CheckSquare} label="To Do" href="/todo" />
        <QuickAction icon={MessageCircle} label="Chat" />
      </div>

      <div className="border-t border-white/10 px-4 py-3 text-[11px] text-sidebar-text/70">
        © Hi-Tech Construction | v1.0.0
      </div>
    </aside>
  );
}

function QuickAction({
  icon: Icon,
  label,
  href,
}: {
  icon: React.ComponentType<{ size?: number }>;
  label: string;
  href?: string;
}) {
  const cls =
    "flex flex-col items-center gap-1 rounded-lg bg-sidebar-active px-2 py-2 text-[11px] text-white hover:bg-sidebar-active/80";
  if (href) {
    return (
      <Link href={href} className={cls}>
        <Icon size={16} />
        <span>{label}</span>
      </Link>
    );
  }
  return (
    <button className={cls}>
      <Icon size={16} />
      <span>{label}</span>
    </button>
  );
}
