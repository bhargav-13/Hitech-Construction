"use client";

import { useEffect } from "react";
import { X } from "lucide-react";

/**
 * Right-side slide-over drawer — Onsite's standard "add / edit record" form pattern.
 * Header shows a close (X), the title, and a primary Save action.
 */
export function Drawer({
  title,
  onClose,
  onSave,
  saveLabel = "Save",
  width = "max-w-xl",
  children,
}: {
  title: string;
  onClose: () => void;
  onSave?: () => void;
  saveLabel?: string;
  width?: string;
  children: React.ReactNode;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/40" onClick={onClose}>
      <div
        className={`flex h-full w-full ${width} flex-col bg-white shadow-2xl`}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="h-1 w-full bg-gradient-to-r from-brand-accent to-teal-400" />
        <div className="flex items-center justify-between border-b border-gray-100 px-6 py-4">
          <div className="flex items-center gap-3">
            <button onClick={onClose} className="rounded-full p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600">
              <X size={18} />
            </button>
            <h2 className="text-sm font-bold tracking-wide text-gray-800 uppercase">{title}</h2>
          </div>
          {onSave && (
            <button
              onClick={onSave}
              className="rounded-lg bg-brand-accent px-5 py-2 text-sm font-medium text-white hover:opacity-90"
            >
              {saveLabel}
            </button>
          )}
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
