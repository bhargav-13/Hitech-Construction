"use client";

import { X } from "lucide-react";
import { useDrawerDismiss } from "@/lib/useDrawerDismiss";

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
   * Whether the form has unsaved edits. When true, dismissing asks first — Vyapar guards every
   * form with "Current changes will be discarded. Do you wish to continue?", and losing a
   * half-entered invoice to a stray click on the backdrop is exactly the complaint we heard.
   */
  dirty?: boolean;
  width?: string;
  children: React.ReactNode;
}) {
  const { closing, requestClose } = useDrawerDismiss(onClose);

  function dismiss() {
    if (dirty && !confirm("Current changes will be discarded. Do you wish to continue?")) return;
    requestClose();
  }

  return (
    <div
      className={`fixed inset-0 z-50 flex justify-end bg-black/40 ${
        closing ? "animate-overlay-out" : "animate-overlay-in"
      }`}
      onClick={dismiss}
    >
      <div
        className={`flex h-full w-full ${width} flex-col bg-white shadow-2xl ${
          closing ? "animate-slide-out-right" : "animate-slide-in-right"
        }`}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="h-1 w-full bg-gradient-to-r from-brand-accent to-cyan-400" />
        <div className="flex items-center justify-between border-b border-gray-100 px-6 py-4">
          <div className="flex items-center gap-3">
            <button
              onClick={dismiss}
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
