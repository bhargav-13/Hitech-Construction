import { VYAPAR_NAV } from "./vyaparConfig";
import { PAYROLL_NAV } from "./payrollConfig";
import { TENDER_NAV } from "./tenderConfig";
import { PROCUREMENT_NAV } from "./procurementConfig";
import { WAREHOUSE_NAV } from "./warehouseConfig";
import type { Need } from "./permissions";

/**
 * The screens inside each module, for the main sidebar's sub-menu.
 *
 * Every module already describes its own menu (the rail inside Vyapar, Payroll, Tender …). The main
 * sidebar reads those same lists, so opening a module in the sidebar — or hovering its icon when the
 * sidebar is collapsed — shows exactly the screens that module's own rail does, and a screen added
 * to a module turns up here without anyone remembering to add it twice.
 */
export interface NavChild {
  label: string;
  /** Missing on a heading. */
  href?: string;
  feature?: Need;
  /** A small group title ("Sale", "Trackers") rather than a screen. */
  heading?: boolean;
}

interface ModuleNode {
  label: string;
  href?: string;
  feature?: Need;
  section?: string;
  children?: ModuleNode[];
}

function flatten(nodes: readonly ModuleNode[]): NavChild[] {
  const out: NavChild[] = [];
  for (const n of nodes) {
    if (n.section) out.push({ label: n.section, heading: true });
    if (n.children?.length) {
      out.push({ label: n.label, heading: true, feature: n.feature });
      // A group's own feature gates everything under it.
      out.push(...flatten(n.children).map((c) => (n.feature && !c.feature ? { ...c, feature: n.feature } : c)));
    } else if (n.href) {
      out.push({ label: n.label, href: n.href, feature: n.feature });
    }
  }
  return out;
}

const NAV_CHILDREN: Record<string, NavChild[]> = {
  "/tender": flatten(TENDER_NAV),
  "/taskopad": [
    { label: "Dashboard", href: "/taskopad" },
    { label: "Tasks", href: "/taskopad/tasks", feature: "TASKOPAD_TASKS" },
    { label: "Approvals", href: "/taskopad/approvals", feature: "TASKOPAD_APPROVALS" },
    { label: "Documents", href: "/taskopad/documents", feature: "TASKOPAD_DOCUMENTS" },
    { label: "Reports", href: "/taskopad/reports", feature: "TASKOPAD_REPORTS" },
    { label: "Checklist", href: "/taskopad/checklist", feature: "TASKOPAD_CHECKLIST" },
    { label: "Settings", href: "/taskopad/settings", feature: "TASKOPAD_SETTINGS" },
  ],
  "/vyapar": flatten(VYAPAR_NAV),
  "/procurement": flatten(PROCUREMENT_NAV),
  "/payroll": flatten(PAYROLL_NAV),
  "/warehouse": flatten(WAREHOUSE_NAV),
};

/** A module's screens this role can open. A heading with nothing left under it is dropped. */
export function childrenFor(moduleHref: string, can: (need?: Need) => boolean): NavChild[] {
  const all = (NAV_CHILDREN[moduleHref] ?? []).filter((c) => can(c.feature));
  return all.filter((c, i) => !c.heading || (all[i + 1] && !all[i + 1].heading));
}

/** Which of a module's screens the current page belongs to: the longest matching path. */
export function activeChild(children: readonly NavChild[], pathname: string, moduleHref: string): string | null {
  let best: string | null = null;
  for (const c of children) {
    if (!c.href) continue;
    const hit = c.href === moduleHref ? pathname === c.href : pathname === c.href || pathname.startsWith(`${c.href}/`);
    if (hit && (!best || c.href.length > best.length)) best = c.href;
  }
  return best;
}
