"use client";

import { Modal } from "@/components/Modal";
import { AlertTriangle } from "lucide-react";

/** Confirmation for the moves that are awkward to walk back — creating a project, bulk drops. */
export function ConfirmDialog({
  title,
  body,
  confirmLabel,
  tone = "primary",
  busy,
  onCancel,
  onConfirm,
}: {
  title: string;
  body: React.ReactNode;
  confirmLabel: string;
  tone?: "primary" | "danger";
  busy?: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  return (
    <Modal onClose={onCancel}>
      <div className="p-5">
        <div className="mb-2 flex items-center gap-2">
          <span
            className={`flex h-8 w-8 items-center justify-center rounded-full ${
              tone === "danger" ? "bg-rose-50 text-rose-600" : "bg-cyan-50 text-brand-accent"
            }`}
          >
            <AlertTriangle size={16} />
          </span>
          <h2 className="text-base font-semibold text-gray-800">{title}</h2>
        </div>
        <div className="text-sm leading-relaxed text-gray-600">{body}</div>
        <div className="mt-5 flex justify-end gap-2">
          <button
            onClick={onCancel}
            className="rounded-lg border border-gray-200 px-3.5 py-2 text-sm text-gray-600 transition-colors duration-150 hover:bg-gray-50"
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            disabled={busy}
            className={`rounded-lg px-3.5 py-2 text-sm font-semibold text-white transition-all duration-150 active:scale-95 disabled:opacity-60 ${
              tone === "danger" ? "bg-rose-600 hover:bg-rose-700" : "bg-brand-accent hover:opacity-90"
            }`}
          >
            {busy ? "Working…" : confirmLabel}
          </button>
        </div>
      </div>
    </Modal>
  );
}
