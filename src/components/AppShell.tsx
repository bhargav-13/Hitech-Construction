"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { Sidebar } from "./Sidebar";
import { Topbar } from "./Topbar";
import { PageLoader } from "./Spinner";
import { useAppStore } from "@/lib/store";
import { AUTH_STORAGE_KEY } from "@/lib/auth";
import { useAuthStore } from "@/lib/authStore";

export function AppShell({
  title,
  children,
  /**
   * Drop the global module rail. Set on screens that are a workspace in their own right — the
   * project detail page runs its own tab bar across the full width, and a second level of
   * navigation beside it only takes room away from the BOQ tables that need it.
   */
  hideSidebar = false,
  /**
   * The page fills exactly the space under the top bar instead of scrolling as a whole, so it can
   * keep its own header still and scroll just one region (e.g. the Taskopad task list).
   */
  fill = false,
}: {
  title: string;
  children: React.ReactNode;
  hideSidebar?: boolean;
  fill?: boolean;
}) {
  const router = useRouter();
  const rehydrateAuth = useAppStore((s) => s.rehydrateAuth);
  const authUser = useAuthStore((s) => s.user);
  const authHydrated = useAuthStore((s) => s.hydrated);
  const hydrate = useAuthStore((s) => s.hydrate);

  // Restore the mock session (still backs the not-yet-migrated feature screens) and the
  // real backend session (the actual source of truth for whether we're logged in).
  useEffect(() => {
    const stored = typeof window !== "undefined" ? localStorage.getItem(AUTH_STORAGE_KEY) : null;
    if (stored) rehydrateAuth(stored);
    hydrate();
  }, [rehydrateAuth, hydrate]);

  useEffect(() => {
    if (authHydrated && !authUser) router.replace("/login");
  }, [authHydrated, authUser, router]);

  if (!authUser) {
    return <PageLoader />;
  }

  return (
    // h-dvh, not h-screen: on mobile browsers 100vh is taller than the visible area (it ignores the
    // address bar), which also lets the window itself scroll.
    <div className="flex h-dvh w-full overflow-hidden">
      {!hideSidebar && <Sidebar />}
      <div className="flex min-w-0 flex-1 flex-col">
        <Topbar title={title} />
        {/* `relative` makes main the containing block for absolutely-positioned bits inside pages
            (e.g. Tailwind's sr-only labels in long tables). Without it they anchor to the
            viewport, escape main's scroll clipping and stretch the document, so the whole window
            scrolls and drags the sidebar up — leaving a blank strip below it. */}
        <main className="relative min-w-0 flex-1 overflow-x-hidden overflow-y-auto bg-background p-6">
          <div className={`animate-fade-in ${fill ? "h-full" : ""}`}>{children}</div>
        </main>
      </div>
    </div>
  );
}
