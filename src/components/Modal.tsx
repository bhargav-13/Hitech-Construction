"use client";

import { X } from "lucide-react";
import { useCallback, useEffect, useRef } from "react";
import { DISCARD_PROMPT, watchFormTouches } from "@/lib/formDirty";

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
  const panelRef = useRef<HTMLDivElement>(null);
  // Same contract as Drawer: once a field inside has been edited, Escape and the X ask before
  // throwing the work away. Nothing is lost to a mis-aimed key press.
  const touched = useRef(false);

  useEffect(() => {
    const el = panelRef.current;
    if (!el) return;
    return watchFormTouches(el, () => { touched.current = true; });
  }, []);

  const dismiss = useCallback(() => {
    if (guardOnClose && touched.current && !confirm(DISCARD_PROMPT)) return;
    onClose();
  }, [guardOnClose, onClose]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && dismiss();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [dismiss]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4 animate-overlay-in">
      <div
        ref={panelRef}
        className={`relative max-h-[90vh] w-full ${wide ? "max-w-3xl" : "max-w-md"} overflow-y-auto rounded-2xl bg-white shadow-xl animate-fade-in-scale`}
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
