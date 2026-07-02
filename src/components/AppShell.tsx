"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Sidebar } from "./Sidebar";
import { Topbar } from "./Topbar";
import { useAppStore } from "@/lib/store";
import { AUTH_STORAGE_KEY } from "@/lib/auth";

export function AppShell({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  const router = useRouter();
  const currentUserId = useAppStore((s) => s.currentUserId);
  const rehydrateAuth = useAppStore((s) => s.rehydrateAuth);
  const [checked, setChecked] = useState(false);

  // Restore the session from localStorage before deciding to redirect.
  useEffect(() => {
    const stored = typeof window !== "undefined" ? localStorage.getItem(AUTH_STORAGE_KEY) : null;
    if (stored) rehydrateAuth(stored);
    setChecked(true);
  }, [rehydrateAuth]);

  useEffect(() => {
    if (checked && !currentUserId) router.replace("/login");
  }, [checked, currentUserId, router]);

  if (!currentUserId) {
    return (
      <div className="flex h-screen w-full items-center justify-center bg-background text-sm text-gray-400">
        Loading…
      </div>
    );
  }

  return (
    <div className="flex h-screen w-full overflow-hidden">
      <Sidebar />
      <div className="flex min-w-0 flex-1 flex-col">
        <Topbar title={title} />
        <main className="min-w-0 flex-1 overflow-x-hidden overflow-y-auto bg-background p-6">
          {children}
        </main>
      </div>
    </div>
  );
}
