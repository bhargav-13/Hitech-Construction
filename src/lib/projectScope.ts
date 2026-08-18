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
 *
 * @param override pins the scope to one project regardless of the header dropdown. Used by the
 *   Project workspace, which embeds the very same Vyapar surfaces inside a single project — the
 *   tab must show that project's books, not whatever the header happens to be set to, and it must
 *   not mutate the global scope on the way past (the user would find it changed on return).
 */
export function useVyaparProjectId(override?: number): number | undefined {
  const projectId = useProjectScope((s) => s.projectId);
  if (override !== undefined && Number.isFinite(override)) return override;
  if (projectId === "all") return undefined;
  const n = Number(projectId);
  return Number.isFinite(n) ? n : undefined;
}
