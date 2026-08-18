"use client";

import { useEffect, useMemo, useState } from "react";
import { ChevronLeft, ChevronRight, Download, FileText, Loader2, X } from "lucide-react";
import type { TaskAttachment } from "@/lib/taskTypes";
import { formatTaskDateTime } from "@/lib/taskTypes";

/** What we can render inline; anything else falls back to a download prompt. */
type PreviewKind = "image" | "pdf" | "video" | "audio" | "text" | "none";

const EXT_KIND: Record<string, PreviewKind> = {
  png: "image", jpg: "image", jpeg: "image", gif: "image", webp: "image", bmp: "image", svg: "image", avif: "image",
  pdf: "pdf",
  mp4: "video", webm: "video", mov: "video", m4v: "video",
  mp3: "audio", wav: "audio", m4a: "audio", aac: "audio", oga: "audio",
  txt: "text", csv: "text", json: "text", md: "text", log: "text", xml: "text", yml: "text", yaml: "text",
};

/**
 * Decide how to show a file. The MIME type is authoritative, but attachments uploaded before
 * contentType was stored have none — so the extension is the fallback.
 */
export function previewKindOf(att: TaskAttachment): PreviewKind {
  const mime = (att.contentType ?? "").toLowerCase();
  if (mime.startsWith("image/")) return "image";
  if (mime === "application/pdf") return "pdf";
  if (mime.startsWith("video/")) return "video";
  if (mime.startsWith("audio/")) return "audio";
  if (mime.startsWith("text/") || mime === "application/json") return "text";

  const ext = att.name.split(".").pop()?.toLowerCase() ?? "";
  return EXT_KIND[ext] ?? "none";
}

/** True when the file can be shown inline rather than only downloaded. */
export function canPreview(att: TaskAttachment): boolean {
  return att.url != null && previewKindOf(att) !== "none";
}

/**
 * Turn a stored data URL into a blob: URL. Browsers refuse to frame `data:` documents (so PDFs
 * never render), and inlining megabytes of base64 into the DOM is wasteful for media — a blob URL
 * sidesteps both. Revoked when the previewed file changes or the viewer closes.
 */
function useBlobUrl(dataUrl: string | null): { blobUrl: string | null; failed: boolean } {
  const [state, setState] = useState<{ blobUrl: string | null; failed: boolean }>({
    blobUrl: null,
    failed: false,
  });

  // The URL must be minted and revoked together inside the effect. Creating it in a useMemo and
  // revoking it in a cleanup looks tidier but breaks: React re-runs effects on remount (Strict
  // Mode does this on every mount in dev) while the memo keeps its old value, so the cleanup
  // revokes the URL and nothing ever recreates it — the file renders blank.
  useEffect(() => {
    if (!dataUrl) {
      setState({ blobUrl: null, failed: false });
      return;
    }
    let url: string | null = null;
    try {
      const [header, base64] = dataUrl.split(",");
      const mime = header.match(/:(.*?);/)?.[1] ?? "application/octet-stream";
      const binary = atob(base64);
      const bytes = new Uint8Array(binary.length);
      for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
      url = URL.createObjectURL(new Blob([bytes], { type: mime }));
      setState({ blobUrl: url, failed: false });
    } catch {
      // A malformed or non-base64 data URL — fall back to offering the raw link.
      setState({ blobUrl: null, failed: true });
    }
    return () => {
      if (url) URL.revokeObjectURL(url);
    };
  }, [dataUrl]);

  return state;
}

/** Decode a text file's data URL so it can be shown as plain text. */
function useDecodedText(dataUrl: string | null, enabled: boolean): string | null {
  return useMemo(() => {
    if (!enabled || !dataUrl) return null;
    try {
      const base64 = dataUrl.split(",")[1] ?? "";
      const binary = atob(base64);
      const bytes = new Uint8Array(binary.length);
      for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
      return new TextDecoder().decode(bytes);
    } catch {
      return null;
    }
  }, [dataUrl, enabled]);
}

/**
 * Full-screen attachment viewer. Opens on the file you clicked and steps through the rest of that
 * task's previewable attachments with the arrow keys, so you can flip through site photos without
 * downloading each one. Esc closes.
 */
export function AttachmentPreview({
  attachments,
  startId,
  onClose,
}: {
  attachments: TaskAttachment[];
  startId: string;
  onClose: () => void;
}) {
  // Only files that can actually be shown take part in the strip.
  const items = useMemo(() => attachments.filter(canPreview), [attachments]);
  const [index, setIndex] = useState(() => {
    const at = items.findIndex((a) => a.id === startId);
    return at >= 0 ? at : 0;
  });

  const current: TaskAttachment | undefined = items[index];
  const kind = current ? previewKindOf(current) : "none";
  const { blobUrl, failed } = useBlobUrl(current?.url ?? null);
  const text = useDecodedText(current?.url ?? null, kind === "text");

  // Bound in the capture phase so Escape reaches this viewer before the task drawer's own
  // Escape-to-close (also on window, registered earlier). Without stopping it there, one press
  // would dismiss the preview *and* the drawer behind it.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") {
        e.stopImmediatePropagation();
        onClose();
      }
      if (e.key === "ArrowRight") setIndex((i) => Math.min(i + 1, items.length - 1));
      if (e.key === "ArrowLeft") setIndex((i) => Math.max(i - 1, 0));
    }
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [onClose, items.length]);

  if (!current) return null;

  const hasPrev = index > 0;
  const hasNext = index < items.length - 1;

  return (
    <div
      className="animate-overlay-in fixed inset-0 z-[60] flex flex-col bg-black/80"
      // The viewer is mounted inside the task drawer, whose own overlay closes on click — swallow
      // the event so dismissing the preview doesn't also close the drawer behind it.
      onClick={(e) => {
        e.stopPropagation();
        onClose();
      }}
    >
      {/* Header — name, meta and the actions that stay available whatever the file type. */}
      <div
        className="flex shrink-0 items-center justify-between gap-3 px-4 py-3 text-white"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="min-w-0">
          <div className="truncate text-sm font-medium">{current.name}</div>
          <div className="text-[11px] text-white/60">
            {current.size}
            {current.size && " · "}
            {formatTaskDateTime(current.at)}
            {items.length > 1 && ` · ${index + 1} of ${items.length}`}
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-1.5">
          <a
            href={current.url ?? undefined}
            download={current.name}
            onClick={(e) => e.stopPropagation()}
            className="flex items-center gap-1.5 rounded-lg bg-white/10 px-3 py-1.5 text-xs font-medium transition-colors duration-150 hover:bg-white/20"
          >
            <Download size={13} /> Download
          </a>
          <button
            onClick={onClose}
            title="Close (Esc)"
            className="rounded-lg bg-white/10 p-2 transition-all duration-150 hover:bg-white/20 active:scale-90"
          >
            <X size={16} />
          </button>
        </div>
      </div>

      {/* Stage */}
      <div className="relative flex min-h-0 flex-1 items-center justify-center px-4 pb-4">
        {hasPrev && (
          <button
            onClick={(e) => {
              e.stopPropagation();
              setIndex((i) => i - 1);
            }}
            title="Previous (←)"
            className="absolute left-3 z-10 rounded-full bg-white/10 p-2.5 text-white transition-all duration-150 hover:bg-white/25 active:scale-90"
          >
            <ChevronLeft size={20} />
          </button>
        )}

        <div
          className="flex max-h-full min-h-0 w-full max-w-5xl items-center justify-center"
          onClick={(e) => e.stopPropagation()}
        >
          {failed ? (
            <FallbackCard att={current} message="This file couldn't be decoded for preview." />
          ) : !blobUrl && kind !== "text" ? (
            <div className="flex items-center gap-2 text-sm text-white/70">
              <Loader2 size={16} className="animate-spin" /> Preparing preview…
            </div>
          ) : kind === "image" ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={blobUrl ?? undefined}
              alt={current.name}
              className="max-h-full max-w-full rounded-lg object-contain shadow-2xl"
            />
          ) : kind === "pdf" ? (
            <iframe
              src={blobUrl ?? undefined}
              title={current.name}
              className="h-full min-h-[70vh] w-full rounded-lg border-0 bg-white shadow-2xl"
            />
          ) : kind === "video" ? (
            <video src={blobUrl ?? undefined} controls className="max-h-full max-w-full rounded-lg shadow-2xl" />
          ) : kind === "audio" ? (
            <div className="w-full max-w-md rounded-xl bg-white p-5 shadow-2xl">
              <div className="mb-3 truncate text-sm font-medium text-gray-700">{current.name}</div>
              <audio src={blobUrl ?? undefined} controls className="w-full" />
            </div>
          ) : kind === "text" ? (
            <pre className="max-h-full w-full overflow-auto rounded-lg bg-white p-4 text-xs leading-relaxed whitespace-pre-wrap text-gray-800 shadow-2xl">
              {text ?? "Could not read this file as text."}
            </pre>
          ) : (
            <FallbackCard att={current} message="This file type can't be previewed." />
          )}
        </div>

        {hasNext && (
          <button
            onClick={(e) => {
              e.stopPropagation();
              setIndex((i) => i + 1);
            }}
            title="Next (→)"
            className="absolute right-3 z-10 rounded-full bg-white/10 p-2.5 text-white transition-all duration-150 hover:bg-white/25 active:scale-90"
          >
            <ChevronRight size={20} />
          </button>
        )}
      </div>
    </div>
  );
}

function FallbackCard({ att, message }: { att: TaskAttachment; message: string }) {
  return (
    <div className="rounded-xl bg-white px-6 py-8 text-center shadow-2xl">
      <FileText size={32} className="mx-auto text-gray-300" />
      <div className="mt-3 truncate text-sm font-medium text-gray-700">{att.name}</div>
      <p className="mt-1 text-xs text-gray-400">{message}</p>
      <a
        href={att.url ?? undefined}
        download={att.name}
        className="mt-4 inline-flex items-center gap-1.5 rounded-lg bg-brand-accent px-4 py-2 text-xs font-medium text-white transition-opacity duration-150 hover:opacity-90"
      >
        <Download size={13} /> Download instead
      </a>
    </div>
  );
}
