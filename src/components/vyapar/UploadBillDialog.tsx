"use client";

import { useState } from "react";
import { Modal } from "@/components/Modal";
import { FileText, Upload, X } from "lucide-react";

/**
 * Upload a purchase bill (photo or PDF), preview it, then continue to manual entry.
 * Automatic field extraction (OCR) needs the bill-scan service, so for now this is an
 * attach-and-review step that hands off to the Purchase form.
 */
export function UploadBillDialog({
  onClose,
  onContinue,
}: {
  onClose: () => void;
  onContinue: () => void;
}) {
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState("");

  function pick(f: File | null) {
    setFile(f);
    setPreview(f && f.type.startsWith("image/") ? URL.createObjectURL(f) : "");
  }

  return (
    <Modal onClose={onClose}>
      <div className="p-6">
        <h2 className="text-base font-semibold text-gray-800">Upload Purchase Bill</h2>
        <p className="mt-0.5 text-sm text-gray-500">Attach a photo or PDF of the bill, then enter its details.</p>

        <div className="mt-5">
          {!file ? (
            <label className="flex cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed border-gray-300 bg-gray-50/60 px-6 py-10 text-center transition-colors duration-150 hover:border-brand-accent hover:bg-cyan-50/40">
              <input
                type="file"
                accept="image/*,application/pdf"
                hidden
                onChange={(e) => pick(e.target.files?.[0] ?? null)}
              />
              <Upload size={26} className="text-brand-accent" />
              <span className="text-sm font-medium text-gray-700">Click to choose an image or PDF</span>
              <span className="text-xs text-gray-400">JPG, PNG or PDF up to ~10 MB</span>
            </label>
          ) : (
            <div className="relative overflow-hidden rounded-xl border border-gray-200 bg-white">
              <button
                onClick={() => pick(null)}
                className="absolute top-2 right-2 z-10 rounded-full bg-white/90 p-1 text-gray-500 shadow-sm transition hover:bg-rose-50 hover:text-rose-600"
                aria-label="Remove file"
              >
                <X size={15} />
              </button>
              {preview ? (
                <img src={preview} alt="Bill preview" className="max-h-72 w-full object-contain" />
              ) : (
                <div className="flex items-center gap-3 px-4 py-6">
                  <FileText size={28} className="shrink-0 text-rose-500" />
                  <div className="min-w-0">
                    <div className="truncate text-sm font-medium text-gray-800">{file.name}</div>
                    <div className="text-xs text-gray-400">{(file.size / 1024).toFixed(0)} KB · PDF</div>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        <p className="mt-3 text-[11px] text-gray-400">
          Automatic data extraction (OCR) arrives with the bill-scan service. For now, enter the bill details on the next screen.
        </p>

        <div className="mt-6 flex justify-end gap-2">
          <button
            onClick={onClose}
            className="rounded-lg border border-gray-200 px-4 py-2 text-sm font-medium text-gray-600 transition-all duration-150 hover:bg-gray-50 active:scale-95"
          >
            Cancel
          </button>
          <button
            onClick={onContinue}
            disabled={!file}
            className="rounded-lg bg-rose-600 px-4 py-2 text-sm font-medium text-white transition-all duration-150 hover:bg-rose-700 active:scale-95 disabled:opacity-50"
          >
            Enter Bill Details
          </button>
        </div>
      </div>
    </Modal>
  );
}
