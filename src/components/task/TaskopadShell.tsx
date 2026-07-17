"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ChevronRight } from "lucide-react";
import { AppShell } from "@/components/AppShell";

const TABS = [
  { label: "Dashboard", href: "/taskopad" },
  { label: "Tasks", href: "/taskopad/tasks" },
  { label: "Reports", href: "/taskopad/reports" },
];

/** Shared chrome for the Taskopad module: breadcrumb + horizontal section tabs. */
export function TaskopadShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const active = TABS.slice().reverse().find((t) => pathname === t.href || pathname.startsWith(t.href + "/"));

  return (
    <AppShell title="Taskopad">
      <div className="space-y-5">
        <div className="flex items-center gap-1.5 text-xs text-gray-400">
          <Link href="/taskopad" className="transition-colors duration-150 hover:text-gray-600 hover:underline">
            Taskopad
          </Link>
          <ChevronRight size={12} className="shrink-0" />
          <span className="font-medium text-gray-600">{active?.label ?? "Dashboard"}</span>
        </div>

        <div className="flex gap-5 border-b border-gray-200">
          {TABS.map((t) => {
            const isActive = active?.href === t.href;
            return (
              <Link
                key={t.href}
                href={t.href}
                className={`relative -mb-px px-0.5 pb-3 text-sm font-medium transition-colors duration-150 ${
                  isActive ? "text-brand-accent" : "text-gray-500 hover:text-gray-800"
                }`}
              >
                {t.label}
                <span
                  className={`absolute inset-x-0 -bottom-px h-0.5 rounded-full bg-brand-accent transition-all duration-200 ${
                    isActive ? "opacity-100" : "opacity-0"
                  }`}
                />
              </Link>
            );
          })}
        </div>

        <div className="min-w-0">{children}</div>
      </div>
    </AppShell>
  );
}
