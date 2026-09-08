"use client";

import { X } from "lucide-react";
import { useCallback, useEffect } from "react";
import { useDiscardGuard } from "@/lib/formDirty";

export function Modal({
  onClose,
  children,
  wide,
  /** Set false on a modal that only reads or confirms, where a discard prompt would be noise. */
  guardOnClose = true,
}: {
  onClose: () => void;
  children: React.ReactNode;
  wide?: boolean;
  guardOnClose?: boolean;
}) {
  // Same contract as Drawer: once a field inside has been edited, Escape, the X and the backdrop
  // ask before throwing the work away. Nothing is lost to a mis-aimed click or key press.
  const { panelRef, confirmDiscard } = useDiscardGuard(guardOnClose);

  const dismiss = useCallback(() => {
    if (!confirmDiscard()) return;
    onClose();
  }, [confirmDiscard, onClose]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && dismiss();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [dismiss]);

  return (
    // Clicking the backdrop dismisses, through the same guard — Vyapar's behaviour, and what people
    // expect from a modal. Before this it did nothing at all, which read as the app being stuck.
    <div
      className="animate-overlay-in fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      onClick={dismiss}
    >
      <div
        ref={panelRef}
        onClick={(e) => e.stopPropagation()}
        className={`animate-fade-in-scale relative max-h-[90vh] w-full ${wide ? "max-w-3xl" : "max-w-md"} overflow-y-auto rounded-2xl bg-white shadow-xl`}
      >
        <button
          onClick={dismiss}
          className="absolute top-4 right-4 rounded-full p-1.5 text-gray-400 transition-all duration-150 hover:bg-gray-100 hover:text-gray-600 active:scale-90"
        >
          <X size={18} />
        </button>
        {children}
      </div>
    </div>
  );
}
