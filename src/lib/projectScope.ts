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

/**
 * The scoped project as a number for Vyapar backend calls — "all" (or a non-numeric id) becomes
 * `undefined`, which every Vyapar API function treats as "every project". Vyapar was previously
 * scoped by bank account; it now shares the global project scope like the rest of the app.
 */
export function useVyaparProjectId(): number | undefined {
  const projectId = useProjectScope((s) => s.projectId);
  if (projectId === "all") return undefined;
  const n = Number(projectId);
  return Number.isFinite(n) ? n : undefined;
}
