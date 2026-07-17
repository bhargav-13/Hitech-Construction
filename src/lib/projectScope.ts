import { create } from "zustand";

/**
 * The project selected in the global header dropdown (next to every page title). "all" = no scope.
 * Feature pages read this to scope their data to one project. Compulsory for all future modules
 * except Projects itself. Kept in a store (not URL) so it persists as the user moves between tabs.
 */
interface ProjectScopeState {
  projectId: string | "all";
  setProjectId: (id: string | "all") => void;
}

export const useProjectScope = create<ProjectScopeState>((set) => ({
  projectId: "all",
  setProjectId: (id) => set({ projectId: id }),
}));
