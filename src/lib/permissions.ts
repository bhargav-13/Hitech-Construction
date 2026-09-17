"use client";

import { useCallback } from "react";
import { useAuthStore } from "./authStore";

/**
 * Client-side permission checks, mirroring the backend's Roles & Access model (V69).
 *
 * A code is "FEATURE:ACTION" — "VYAPAR_SALE:CREATE" — or "MODULE:ACTION" for the module switch
 * ("VYAPAR:VIEW"). Pass just the feature and VIEW is assumed. The server still enforces every call;
 * this only keeps screens and buttons a role can't use out of sight.
 */
export type Need = string | string[];

function matches(perms: readonly string[], need: Need | undefined): boolean {
  if (!need) return true;
  const list = Array.isArray(need) ? need : [need];
  return list.some((n) => perms.includes(n.includes(":") ? n : `${n}:VIEW`));
}

export function useCan() {
  const perms = useAuthStore((s) => s.user?.permissions);
  // Until the session has loaded, don't hide anything: a flash of missing menu items on every page
  // load is worse than the server answering 403 to the rare click that lands before it arrives.
  return useCallback((need?: Need) => (perms ? matches(perms, need) : true), [perms]);
}

/**
 * A nav list with the items the user can't open removed. An item's `section` heading moves to the
 * next item that survives, and a group whose children are all hidden goes too.
 */
export function filterNav<T extends { feature?: Need; section?: string; children?: T[] }>(
  nodes: readonly T[],
  can: (need?: Need) => boolean,
): T[] {
  const out: T[] = [];
  let pendingSection: string | undefined;
  for (const node of nodes) {
    let next: T | null = can(node.feature) ? node : null;
    if (next && node.children) {
      const children = filterNav(node.children, can);
      next = children.length ? { ...node, children } : null;
    }
    if (!next) {
      pendingSection ??= node.section;
      continue;
    }
    if (pendingSection && !next.section) next = { ...next, section: pendingSection };
    pendingSection = undefined;
    out.push(next);
  }
  return out;
}
