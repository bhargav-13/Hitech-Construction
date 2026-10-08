"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { BellRing, ChevronRight, RefreshCw, X } from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { useTaskStore } from "@/lib/taskStore";
import { useCan } from "@/lib/permissions";
import { useAgo, useTaskAutoRefresh } from "@/lib/useTaskAutoRefresh";
import { requestBrowserNotify, useBrowserNotify } from "@/lib/browserNotify";

const TABS = [
  { label: "Dashboard", href: "/taskopad" },
  { label: "Tasks", href: "/taskopad/tasks", feature: "TASKOPAD_TASKS" },
  { label: "Approvals", href: "/taskopad/approvals", feature: "TASKOPAD_APPROVALS" },
  { label: "Documents", href: "/taskopad/documents", feature: "TASKOPAD_DOCUMENTS" },
  { label: "Reports", href: "/taskopad/reports", feature: "TASKOPAD_REPORTS" },
  // Standalone routine board — see app/taskopad/checklist. Deliberately not tied to tasks.
  { label: "Checklist", href: "/taskopad/checklist", feature: "TASKOPAD_CHECKLIST" },
  { label: "Settings", href: "/taskopad/settings", feature: "TASKOPAD_SETTINGS" },
];

/**
 * Shared chrome for the Taskopad module: breadcrumb + horizontal section tabs. With `fill`, the
 * chrome stays put and the page body gets the remaining height to scroll inside.
 */
export function TaskopadShell({ children, fill = false }: { children: React.ReactNode; fill?: boolean }) {
  const pathname = usePathname();
  // A tab the role's Roles & Access features don't cover isn't shown.
  const can = useCan();
  const tabs = TABS.filter((t) => can(t.feature));
  const canSeeApprovals = can("TASKOPAD_APPROVALS");
  const active = TABS.slice().reverse().find((t) => pathname === t.href || pathname.startsWith(t.href + "/"));
  const approvalsCount = useTaskStore((s) => s.approvals.length);
  const loadApprovals = useTaskStore((s) => s.loadApprovals);
  // Background refresh every few minutes; waits while anyone is mid-edit (see useTaskAutoRefresh).
  const { refresh, busy } = useTaskAutoRefresh(canSeeApprovals);
  const lastLoadedAt = useTaskStore((s) => s.lastLoadedAt);
  const ago = useAgo(lastLoadedAt);
  // One-time invitation to turn on desktop alerts (browsers only let a click ask for permission).
  const desktop = useBrowserNotify();
  const [askDismissed, setAskDismissed] = useState(true);
  useEffect(() => {
    try {
      setAskDismissed(localStorage.getItem("hitech.browserNotify.asked") === "1");
    } catch {
      setAskDismissed(false);
    }
  }, []);
  const dismissAsk = () => {
    setAskDismissed(true);
    try {
      localStorage.setItem("hitech.browserNotify.asked", "1");
    } catch {
      /* ignore */
    }
  };

  // Keep the "Approvals" badge current whenever the module is open — for roles that have the queue.
  useEffect(() => {
    if (canSeeApprovals) loadApprovals();
  }, [loadApprovals, pathname, canSeeApprovals]);

  return (
    <AppShell title="Taskopad" fill={fill}>
      <div className={fill ? "flex h-full min-h-0 flex-col gap-5" : "space-y-5"}>
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-1.5 text-xs text-gray-400">
            <Link href="/taskopad" className="transition-colors duration-150 hover:text-gray-600 hover:underline">
              Taskopad
            </Link>
            <ChevronRight size={12} className="shrink-0" />
            <span className="font-medium text-gray-600">{active?.label ?? "Dashboard"}</span>
          </div>
          {/* No bell here: notifications live in the global header's bell, one feed for the whole app. */}
          {lastLoadedAt > 0 && (
            <button
              type="button"
              onClick={() => void refresh()}
              disabled={busy}
              title="Taskopad refreshes itself every 3 minutes (never while you are editing). Click to refresh now."
              className="flex items-center gap-1.5 rounded-md px-2 py-1 text-xs text-gray-400 transition-colors duration-150 hover:bg-gray-100 hover:text-gray-600 disabled:opacity-60"
            >
              <RefreshCw size={12} className={busy ? "animate-spin" : ""} />
              Updated {ago}
            </button>
          )}
        </div>

        {desktop.state === "default" && !askDismissed && (
          <div className="flex items-center gap-3 rounded-lg border border-cyan-100 bg-cyan-50/60 px-3 py-2 text-sm text-gray-700">
            <BellRing size={16} className="shrink-0 text-brand-accent" />
            <span className="min-w-0 flex-1">
              Get a desktop alert when a task is assigned to you, commented on, due or overdue — even when this tab isn&apos;t open.
            </span>
            <button
              type="button"
              onClick={() => void requestBrowserNotify().finally(dismissAsk)}
              className="shrink-0 rounded-md bg-brand-accent px-3 py-1 text-xs font-medium text-white hover:opacity-90"
            >
              Turn on
            </button>
            <button type="button" onClick={dismissAsk} aria-label="Not now" className="shrink-0 rounded p-1 text-gray-400 hover:bg-white hover:text-gray-600">
              <X size={14} />
            </button>
          </div>
        )}

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

        <div className={fill ? "min-h-0 min-w-0 flex-1" : "min-w-0"}>{children}</div>
      </div>
    </AppShell>
  );
}
