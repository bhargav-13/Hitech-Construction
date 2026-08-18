"use client";

import { useState } from "react";
import { Modal } from "@/components/Modal";
import { FileText, Upload, X } from "lucide-react";

/** Attachments ride inside the invoice JSON, so keep them postable. */
const MAX_BILL_BYTES = 10 * 1024 * 1024;

/** A phone photo of a bill is several MB; 1400px is still readable and a fraction of the size. */
function downscaleImage(file: File, maxPx = 1400): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("Couldn't read that image."));
    reader.onload = () => {
      const img = new Image();
      img.onerror = () => reject(new Error("That file isn't a readable image."));
      img.onload = () => {
        const scale = Math.min(1, maxPx / Math.max(img.width, img.height));
        const canvas = document.createElement("canvas");
        canvas.width = Math.round(img.width * scale);
        canvas.height = Math.round(img.height * scale);
        const ctx = canvas.getContext("2d");
        if (!ctx) return reject(new Error("Couldn't process that image."));
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        resolve(canvas.toDataURL("image/jpeg", 0.82));
      };
      img.src = String(reader.result);
    };
    reader.readAsDataURL(file);
  });
}

function readAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("Couldn't read that file."));
    reader.onload = () => resolve(String(reader.result));
    reader.readAsDataURL(file);
  });
}

/** What the picked file becomes on the Purchase form — the same shape the form already stores. */
export interface BillAttachment {
  imageDataUrl: string | null;
  documentName: string | null;
  documentDataUrl: string | null;
}

/**
 * Upload a purchase bill (photo or PDF), preview it, then continue to entering its details.
 *
 * The file now travels with you: it arrives on the Purchase form as that bill's attachment, so the
 * supplier's own document stays filed against the bill it belongs to — which is what Vyapar does,
 * and what the client's own screenshot shows ("SalesBi….PDF added successfully" with a Download).
 * Previously the file was previewed and then silently dropped on the way to a blank form, which is
 * why "upload bill" appeared to do nothing.
 *
 * Automatic field extraction (OCR) still needs the bill-scan service; this is attach-and-key.
 */
export function UploadBillDialog({
  onClose,
  onContinue,
}: {
  onClose: () => void;
  onContinue: (attachment: BillAttachment) => void;
}) {
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  function pick(f: File | null) {
    setFile(f);
    setError("");
    setPreview(f && f.type.startsWith("image/") ? URL.createObjectURL(f) : "");
  }

  /** Read the file into a data URL, downscaling a photo so a phone snap doesn't bloat the bill. */
  async function handOff() {
    if (!file) return;
    if (file.size > MAX_BILL_BYTES) {
      setError(`"${file.name}" is larger than 10 MB. Attach a smaller file.`);
      return;
    }
    setBusy(true);
    try {
      if (file.type.startsWith("image/")) {
        onContinue({ imageDataUrl: await downscaleImage(file), documentName: null, documentDataUrl: null });
      } else {
        onContinue({ imageDataUrl: null, documentName: file.name, documentDataUrl: await readAsDataUrl(file) });
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't read that file.");
      setBusy(false);
    }
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

        {error && <div className="mt-3 rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-600">{error}</div>}

        <p className="mt-3 text-[11px] text-gray-400">
          The file is attached to the bill you enter next, so the supplier&apos;s own document stays with it.
          Automatic data extraction (OCR) arrives with the bill-scan service.
        </p>

        <div className="mt-6 flex justify-end gap-2">
          <button
            onClick={onClose}
            className="rounded-lg border border-gray-200 px-4 py-2 text-sm font-medium text-gray-600 transition-all duration-150 hover:bg-gray-50 active:scale-95"
          >
            Cancel
          </button>
          <button
            onClick={handOff}
            disabled={!file || busy}
            className="rounded-lg bg-rose-600 px-4 py-2 text-sm font-medium text-white transition-all duration-150 hover:bg-rose-700 active:scale-95 disabled:opacity-50"
          >
            {busy ? "Attaching…" : "Enter Bill Details"}
          </button>
        </div>
      </div>
    </Modal>
  );
}
