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
}: {
  title: string;
  children: React.ReactNode;
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
    <div className="flex h-screen w-full overflow-hidden">
      <Sidebar />
      <div className="flex min-w-0 flex-1 flex-col">
        <Topbar title={title} />
        <main className="min-w-0 flex-1 overflow-x-hidden overflow-y-auto bg-background p-6">
          <div className="animate-fade-in">{children}</div>
        </main>
      </div>
    </div>
  );
}
