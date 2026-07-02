import type { UserRole } from "./types";

// Which nav routes each role may reach. Admin sees everything; other roles
// only get the features tied to their job.
export const ROLE_ROUTES: Record<UserRole, string[] | "all"> = {
  Admin: "all",
  "Store Keeper": ["/warehouse"],
  "Site In-charge": ["/warehouse", "/project", "/team-schedule"],
};

// Where each role lands after signing in.
export const ROLE_HOME: Record<UserRole, string> = {
  Admin: "/",
  "Store Keeper": "/warehouse",
  "Site In-charge": "/warehouse",
};

export function canAccess(role: UserRole, path: string): boolean {
  const routes = ROLE_ROUTES[role];
  if (routes === "all") return true;
  return routes.some((r) => path === r || (r !== "/" && path.startsWith(r + "/")));
}
