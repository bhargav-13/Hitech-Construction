"use client";

import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";

/**
 * Chrome/layout preferences that must survive route changes.
 *
 * Each page renders its own <AppShell>, so the shell (and the sidebars inside it) remount on every
 * navigation. Keeping "is the sidebar collapsed" in component state therefore reset it back to
 * expanded the moment you moved to another feature. Holding it here — persisted to localStorage —
 * keeps the choice stable across navigations and reloads.
 */
interface UiState {
  /** Main ERP left navigation. */
  sidebarCollapsed: boolean;
  toggleSidebar: () => void;
  /** Vyapar's own inner rail. */
  vyaparRailCollapsed: boolean;
  toggleVyaparRail: () => void;
}

export const useUiStore = create<UiState>()(
  persist(
    (set) => ({
      sidebarCollapsed: false,
      toggleSidebar: () => set((s) => ({ sidebarCollapsed: !s.sidebarCollapsed })),
      vyaparRailCollapsed: false,
      toggleVyaparRail: () => set((s) => ({ vyaparRailCollapsed: !s.vyaparRailCollapsed })),
    }),
    {
      name: "hitech.ui.v1",
      storage: createJSONStorage(() => localStorage),
    }
  )
);
