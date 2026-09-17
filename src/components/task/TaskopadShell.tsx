"use client";

import { useEffect } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { ChevronRight } from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { NotificationBell } from "@/components/task/NotificationBell";
import { useTaskStore } from "@/lib/taskStore";
import { useCan } from "@/lib/permissions";

const TABS = [
  { label: "Dashboard", href: "/taskopad" },
  { label: "Tasks", href: "/taskopad/tasks", feature: "TASKOPAD_TASKS" },
  { label: "Approvals", href: "/taskopad/approvals", feature: "TASKOPAD_APPROVALS" },
  { label: "Reports", href: "/taskopad/reports", feature: "TASKOPAD_REPORTS" },
  // Standalone routine board — see app/taskopad/checklist. Deliberately not tied to tasks.
  { label: "Checklist", href: "/taskopad/checklist", feature: "TASKOPAD_CHECKLIST" },
];

/** Shared chrome for the Taskopad module: breadcrumb + horizontal section tabs. */
export function TaskopadShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  // A tab the role's Roles & Access features don't cover isn't shown.
  const can = useCan();
  const tabs = TABS.filter((t) => can(t.feature));
  const canSeeApprovals = can("TASKOPAD_APPROVALS");
  const active = TABS.slice().reverse().find((t) => pathname === t.href || pathname.startsWith(t.href + "/"));
  const approvalsCount = useTaskStore((s) => s.approvals.length);
  const loadApprovals = useTaskStore((s) => s.loadApprovals);

  // Keep the "Approvals" badge current whenever the module is open — for roles that have the queue.
  useEffect(() => {
    if (canSeeApprovals) loadApprovals();
  }, [loadApprovals, pathname, canSeeApprovals]);

  return (
    <AppShell title="Taskopad">
      <div className="space-y-5">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-1.5 text-xs text-gray-400">
            <Link href="/taskopad" className="transition-colors duration-150 hover:text-gray-600 hover:underline">
              Taskopad
            </Link>
            <ChevronRight size={12} className="shrink-0" />
            <span className="font-medium text-gray-600">{active?.label ?? "Dashboard"}</span>
          </div>
          <NotificationBell />
        </div>

        <div className="flex gap-5 border-b border-gray-200">
          {tabs.map((t) => {
            const isActive = active?.href === t.href;
            return (
              <Link
                key={t.href}
                href={t.href}
                className={`relative -mb-px flex items-center gap-1.5 px-0.5 pb-3 text-sm font-medium transition-colors duration-150 ${
                  isActive ? "text-brand-accent" : "text-gray-500 hover:text-gray-800"
                }`}
              >
                {t.label}
                {t.label === "Approvals" && approvalsCount > 0 && (
                  <span className="inline-flex min-w-[18px] items-center justify-center rounded-full bg-rose-500 px-1.5 text-[10px] font-semibold text-white">
                    {approvalsCount}
                  </span>
                )}
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
