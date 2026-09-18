"use client";

import { useEffect, useMemo } from "react";
import { FileText, Loader2, ScanLine, X } from "lucide-react";

/** data:…;base64,… → Blob, so a PDF can be shown through an object URL (browsers block data: PDFs in frames). */
function dataUrlToBlob(dataUrl: string): Blob | null {
  const m = dataUrl.match(/^data:([^;,]+)?(;base64)?,([\s\S]*)$/);
  if (!m) return null;
  const mime = m[1] || "application/octet-stream";
  if (!m[2]) return new Blob([decodeURIComponent(m[3])], { type: mime });
  const bin = atob(m[3]);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new Blob([bytes], { type: mime });
}

export type ScanNote = { tone: "info" | "good" | "warn" | "bad"; text: string };

/**
 * The supplier's bill, shown beside the form it is being keyed (or scanned) into — the client's own
 * way of working, with the PDF open on one half of the screen and Vyapar on the other.
 */
export function BillPreviewPane({
  name,
  dataUrl,
  scanning,
  status,
  note,
  onRead,
  onClose,
}: {
  name: string;
  dataUrl: string;
  scanning: boolean;
  status?: string;
  note?: ScanNote | null;
  /** Re-run text extraction on this file. */
  onRead?: () => void;
  onClose: () => void;
}) {
  const isPdf = /^data:application\/pdf/i.test(dataUrl) || /\.pdf$/i.test(name);
  const src = useMemo(() => {
    if (!isPdf) return dataUrl;
    const blob = dataUrlToBlob(dataUrl);
    return blob ? URL.createObjectURL(blob) : dataUrl;
  }, [dataUrl, isPdf]);
  useEffect(() => () => {
    if (src.startsWith("blob:")) URL.revokeObjectURL(src);
  }, [src]);

  const noteClass = {
    info: "bg-cyan-50 text-brand-accent ring-cyan-600/20",
    good: "bg-emerald-50 text-emerald-700 ring-emerald-600/20",
    warn: "bg-amber-50 text-amber-800 ring-amber-600/20",
    bad: "bg-rose-50 text-rose-700 ring-rose-600/20",
  };

  return (
    <div className="flex min-h-[420px] flex-col overflow-hidden rounded-xl border border-gray-200 bg-gray-50 xl:sticky xl:top-0 xl:h-[calc(100vh-170px)]">
      <div className="flex items-center gap-2 border-b border-gray-200 bg-white px-3 py-2">
        <FileText size={15} className="shrink-0 text-rose-600" />
        <span className="min-w-0 flex-1 truncate text-sm font-medium text-gray-700" title={name}>
          {name}
        </span>
        {onRead && (
          <button
            type="button"
            onClick={onRead}
            disabled={scanning}
            className="flex items-center gap-1 rounded-md border border-gray-200 px-2 py-1 text-xs font-medium text-gray-600 transition-colors hover:border-brand-accent hover:text-brand-accent disabled:opacity-50"
          >
            {scanning ? <Loader2 size={12} className="animate-spin" /> : <ScanLine size={12} />}
            {scanning ? "Reading…" : "Read with OCR"}
          </button>
        )}
        <button
          type="button"
          onClick={onClose}
          aria-label="Hide bill"
          title="Hide bill"
          className="rounded-md p-1 text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-600"
        >
          <X size={15} />
        </button>
      </div>

      {(scanning || note) && (
        <div
          className={`mx-3 mt-3 rounded-lg px-3 py-2 text-xs ring-1 ring-inset ${
            scanning ? noteClass.info : noteClass[note!.tone]
          }`}
        >
          {scanning ? (
            <span className="flex items-center gap-2">
              <Loader2 size={12} className="animate-spin" /> {status || "Reading the bill…"}
            </span>
          ) : (
            note!.text
          )}
        </div>
      )}

      <div className="min-h-0 flex-1 p-3">
        {isPdf ? (
          <iframe src={src} title={name} className="h-full min-h-[380px] w-full rounded-lg border border-gray-200 bg-white" />
        ) : (
          <div className="h-full overflow-auto rounded-lg border border-gray-200 bg-white">
            {/* Data-URL image of the bill — next/image can't optimise data URLs. */}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={src} alt={name} className="w-full" />
          </div>
        )}
      </div>
    </div>
  );
}
