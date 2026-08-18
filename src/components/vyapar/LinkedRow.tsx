"use client";

import { useRouter } from "next/navigation";

/**
 * A table row that opens `href` when you click anywhere in it — not just on the one cell that
 * happened to be wrapped in a link.
 *
 * Ledgers were built with the link on the first column only, so most of a row looked clickable
 * (it highlights on hover) but wasn't. This makes the whole row the target while leaving the real
 * anchor in place inside the first cell, so middle-click, Ctrl+click and "open in new tab" keep
 * working — a row-level `onClick` alone would silently break all three.
 *
 * Clicks that start on something interactive (a row menu, a checkbox, a nested link) are left
 * alone: those elements have their own job and must not also navigate.
 */
export function LinkedRow({
  href,
  className = "",
  title,
  children,
}: {
  /** Null makes the row inert — a ledger line with no document behind it. */
  href: string | null;
  className?: string;
  title?: string;
  children: React.ReactNode;
}) {
  const router = useRouter();

  if (!href) return <tr className={className}>{children}</tr>;

  return (
    <tr
      className={`cursor-pointer ${className}`}
      title={title}
      onClick={(e) => {
        // Let nested controls handle their own clicks.
        if ((e.target as HTMLElement).closest("a,button,input,select,textarea,[role='button']")) return;
        router.push(href);
      }}
    >
      {children}
    </tr>
  );
}
