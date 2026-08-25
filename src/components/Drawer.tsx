"use client";

import { useCallback, useEffect, useRef } from "react";
import { X } from "lucide-react";
import { useDrawerDismiss } from "@/lib/useDrawerDismiss";
import { DISCARD_PROMPT, watchFormTouches } from "@/lib/formDirty";

/**
 * Right-side slide-over drawer — Onsite's standard "add / edit record" form pattern.
 * Header shows a close (X), the title, and a primary Save action.
 */
export function Drawer({
  title,
  onClose,
  onSave,
  onSaveAndNew,
  saveLabel = "Save",
  saveAndNewLabel = "Save & New",
  dirty = false,
  width = "max-w-xl",
  guardOnClose = true,
  footer,
  children,
}: {
  title: string;
  onClose: () => void;
  onSave?: () => void;
  /** Vyapar keeps a "Save & New" beside Save on every add form, for entering a run of records. */
  onSaveAndNew?: () => void;
  saveLabel?: string;
  saveAndNewLabel?: string;
  /**
   * Force the discard confirmation on, regardless of what the user has touched. Rarely needed:
   * every drawer is guarded automatically the moment a field inside it is edited (see below). Pass
   * this when a drawer opens already holding unsaved work — a prefilled form, a staged import.
   */
  dirty?: boolean;
  /**
   * Opt a drawer out of the automatic guard. For read-only panels whose "fields" are filters or
   * search boxes, where a confirmation on close is just noise.
   */
  guardOnClose?: boolean;
  width?: string;
  /**
   * Optional sticky action bar pinned to the bottom of the drawer. Vyapar's document forms carry a
   * second row of actions down there (LINK PAYMENT on the left, Print ▾ on the right) separate from
   * the primary Save; this is where those go.
   */
  footer?: React.ReactNode;
  children: React.ReactNode;
}) {
  const panelRef = useRef<HTMLDivElement>(null);
  /**
   * Set as soon as anything inside the panel is edited. This is what makes the confirmation
   * universal: drawers no longer have to remember to pass `dirty`, which almost none of the ~50 of
   * them did — so every tender, procurement and payroll form silently discarded a half-filled page
   * on a stray backdrop click.
   */
  const touched = useRef(false);

  useEffect(() => {
    const el = panelRef.current;
    if (!el) return;
    return watchFormTouches(el, () => { touched.current = true; });
  }, []);

  // Consulted by the overlay/close button and, through useDrawerDismiss, by Escape.
  const canClose = useCallback(
    () => !(guardOnClose && (dirty || touched.current)) || confirm(DISCARD_PROMPT),
    [dirty, guardOnClose]
  );

  const { closing, requestClose } = useDrawerDismiss(onClose, undefined, canClose);

  return (
    <div
      className={`fixed inset-0 z-50 flex justify-end bg-black/40 ${
        closing ? "animate-overlay-out" : "animate-overlay-in"
      }`}
      onClick={requestClose}
    >
      <div
        ref={panelRef}
        className={`flex h-full w-full ${width} flex-col bg-white shadow-2xl ${
          closing ? "animate-slide-out-right" : "animate-slide-in-right"
        }`}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="h-1 w-full bg-gradient-to-r from-brand-accent to-cyan-400" />
        <div className="flex items-center justify-between border-b border-gray-100 px-6 py-4">
          <div className="flex items-center gap-3">
            <button
              onClick={requestClose}
              className="rounded-full p-1 text-gray-400 transition-all duration-150 hover:bg-gray-100 hover:text-gray-600 active:scale-90"
            >
              <X size={18} />
            </button>
            <h2 className="text-sm font-bold tracking-wide text-gray-800 uppercase">{title}</h2>
          </div>
          <div className="flex items-center gap-2">
            {onSaveAndNew && (
              <button
                onClick={onSaveAndNew}
                className="rounded-lg border border-brand-accent px-4 py-2 text-sm font-medium text-brand-accent transition-all duration-150 hover:bg-cyan-50 active:scale-95"
              >
                {saveAndNewLabel}
              </button>
            )}
            {onSave && (
              <button
                onClick={onSave}
                className="rounded-lg bg-brand-accent px-5 py-2 text-sm font-medium text-white transition-all duration-150 hover:opacity-90 active:scale-95"
              >
                {saveLabel}
              </button>
            )}
          </div>
        </div>
        <div className="flex-1 overflow-y-auto px-6 py-5">{children}</div>
        {footer && (
          <div className="flex flex-wrap items-center justify-between gap-2 border-t border-gray-200 bg-gray-50 px-6 py-3">
            {footer}
          </div>
        )}
      </div>
    </div>
  );
}

/** Uppercase-label form field wrapper matching Onsite's form style. */
export function DrawerField({
  label,
  required,
  children,
  className = "",
}: {
  label: string;
  required?: boolean;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <label className={`block ${className}`}>
      <span className="mb-1.5 block text-[11px] font-medium tracking-wide text-gray-400 uppercase">
        {label}
        {required && <span className="text-rose-500"> *</span>}
      </span>
      {children}
    </label>
  );
}
