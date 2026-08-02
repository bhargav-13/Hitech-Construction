"use client";

import { ArrowDown, ArrowUp, ChevronsUpDown } from "lucide-react";
import type { SortDir } from "@/lib/useTableSort";

/**
 * A sortable table header cell. Pairs with `useTableSort`: clicking cycles the sort onto this
 * column (asc → desc). The active column shows a direction arrow; inactive columns show a faint
 * up/down hint so it's discoverable that the header is clickable.
 */
export function SortTh({
  label,
  sortKey,
  activeKey,
  dir,
  onSort,
  align = "left",
  className = "",
}: {
  label: string;
  sortKey: string;
  activeKey: string | null;
  dir: SortDir;
  onSort: (key: string) => void;
  align?: "left" | "right";
  className?: string;
}) {
  const active = activeKey === sortKey;
  return (
    <th className={`px-4 py-2 font-medium ${align === "right" ? "text-right" : "text-left"} ${className}`}>
      <button
        type="button"
        onClick={() => onSort(sortKey)}
        className={`group inline-flex items-center gap-1 transition-colors duration-150 hover:text-gray-700 ${
          align === "right" ? "flex-row-reverse" : ""
        } ${active ? "text-brand-accent" : "text-gray-500"}`}
      >
        <span>{label}</span>
        {active ? (
          dir === "asc" ? <ArrowUp size={12} /> : <ArrowDown size={12} />
        ) : (
          <ChevronsUpDown size={12} className="text-gray-300 group-hover:text-gray-400" />
        )}
      </button>
    </th>
  );
}
