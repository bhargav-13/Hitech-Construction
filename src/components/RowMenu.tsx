"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { MoreVertical } from "lucide-react";

/**
 * A row/kebab action menu whose popup is rendered in a portal with fixed positioning. Because the
 * menu lives at the document root (not inside the table/card), no ancestor's `overflow-hidden` or
 * `overflow-x-auto` can ever clip it — this is the reusable fix for menus getting hidden behind a
 * container border. It also flips upward when there isn't room below, so it never runs off-screen.
 * Closes on outside-click, Escape, scroll or resize.
 */
export function RowMenu({
  children,
  align = "right",
  buttonLabel = "Actions",
  width = 208,
}: {
  children: (close: () => void) => React.ReactNode;
  align?: "left" | "right";
  buttonLabel?: string;
  width?: number;
}) {
  const [open, setOpen] = useState(false);
  // Start off-screen so the menu can be measured before it's shown in its final spot.
  const [pos, setPos] = useState<{ top: number; left: number }>({ top: -9999, left: -9999 });
  const btnRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const [mounted, setMounted] = useState(false);

  useEffect(() => setMounted(true), []);

  const place = useCallback(() => {
    const b = btnRef.current?.getBoundingClientRect();
    const menuH = menuRef.current?.offsetHeight ?? 0;
    if (!b) return;
    const left = align === "right" ? b.right - width : b.left;
    const spaceBelow = window.innerHeight - b.bottom;
    const openUp = menuH > 0 && spaceBelow < menuH + 12 && b.top > spaceBelow;
    const top = openUp ? b.top - menuH - 6 : b.bottom + 6;
    const maxLeft = window.innerWidth - width - 8;
    setPos({ top: Math.max(8, top), left: Math.min(Math.max(8, left), Math.max(8, maxLeft)) });
  }, [align, width]);

  // Measure + position once the menu is in the DOM.
  useLayoutEffect(() => {
    if (!open) return;
    place();
  }, [open, place]);

  useEffect(() => {
    if (!open) return;
    const close = () => setOpen(false);
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    const onDoc = (e: MouseEvent) => {
      if (
        menuRef.current &&
        !menuRef.current.contains(e.target as Node) &&
        btnRef.current &&
        !btnRef.current.contains(e.target as Node)
      ) {
        setOpen(false);
      }
    };
    window.addEventListener("scroll", close, true);
    window.addEventListener("resize", close);
    window.addEventListener("keydown", onKey);
    document.addEventListener("mousedown", onDoc);
    return () => {
      window.removeEventListener("scroll", close, true);
      window.removeEventListener("resize", close);
      window.removeEventListener("keydown", onKey);
      document.removeEventListener("mousedown", onDoc);
    };
  }, [open]);

  function toggle() {
    setPos({ top: -9999, left: -9999 }); // reset so it re-measures fresh each open
    setOpen((o) => !o);
  }

  return (
    <>
      <button
        ref={btnRef}
        type="button"
        aria-label={buttonLabel}
        onClick={toggle}
        className="rounded-md p-1 text-gray-400 transition-all duration-150 hover:bg-gray-100 hover:text-gray-600 active:scale-90"
      >
        <MoreVertical size={16} />
      </button>
      {open &&
        mounted &&
        createPortal(
          <div
            ref={menuRef}
            style={{ position: "fixed", top: pos.top, left: pos.left, width }}
            className="animate-menu-pop z-50 origin-top overflow-hidden rounded-xl border border-gray-100 bg-white p-1 text-left shadow-xl ring-1 ring-black/[0.03]"
          >
            {children(() => setOpen(false))}
          </div>,
          document.body
        )}
    </>
  );
}

/** Standard item inside a RowMenu. `tone` colours destructive/warning actions. */
export function RowMenuItem({
  icon: Icon,
  label,
  onClick,
  tone = "default",
}: {
  icon?: React.ComponentType<{ size?: number; className?: string }>;
  label: string;
  onClick: () => void;
  tone?: "default" | "warning" | "danger";
}) {
  const toneCls =
    tone === "danger"
      ? "font-medium text-rose-600 hover:bg-rose-50"
      : tone === "warning"
        ? "text-amber-600 hover:bg-gray-50"
        : "text-gray-700 hover:bg-gray-50";
  return (
    <button
      onClick={onClick}
      className={`flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-left text-sm transition-colors duration-150 ${toneCls}`}
    >
      {Icon && <Icon size={14} className={tone === "default" ? "text-gray-400" : ""} />}
      {label}
    </button>
  );
}

export function RowMenuDivider() {
  return <div className="my-1 border-t border-gray-100" />;
}
