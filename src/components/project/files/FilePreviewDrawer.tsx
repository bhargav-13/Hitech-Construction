"use client";

import { useEffect, useState } from "react";
import { Download, ExternalLink, X } from "lucide-react";
import { Spinner } from "@/components/Spinner";
import { fileKind, fileUrl, formatBytes, type FileNode } from "@/lib/filesApi";
import { NodeIcon } from "./FileIcon";
import { formatDateTimeIST } from "@/lib/datetime";

/**
 * Look at a file without leaving the folder.
 *
 * <p>Images and PDFs render from the signed URL directly — the browser already has readers for
 * both, and shipping a PDF library to re-implement one would cost more than the whole module. For a
 * DWG or a spreadsheet there is nothing honest to show, so the drawer says so and offers the
 * download rather than a broken frame.
 */
export function FilePreviewDrawer({ node, onClose }: { node: FileNode; onClose: () => void }) {
  const [url, setUrl] = useState<string | null>(null);
  const [error, setError] = useState("");
  const kind = fileKind(node);
  const previewable = kind === "image" || kind === "pdf";

  useEffect(() => {
    if (node.fileId == null) return;
    let cancelled = false;
    setUrl(null);
    setError("");
    fileUrl(node.fileId, true)
      .then((u) => {
        if (!cancelled) setUrl(u);
      })
      .catch((e: unknown) => {
        if (!cancelled) setError(e instanceof Error ? e.message : "Couldn't open this file.");
      });
    return () => {
      cancelled = true;
    };
  }, [node.fileId]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const download = async () => {
    if (node.fileId == null) return;
    // A fresh URL with an attachment disposition, rather than reusing the inline one.
    window.location.href = await fileUrl(node.fileId, false);
  };

  return (
    <div className="fixed inset-0 z-50 flex" role="dialog" aria-modal="true">
      <button
        type="button"
        aria-label="Close preview"
        onClick={onClose}
        className="flex-1 cursor-default bg-slate-900/50"
      />
      <aside className="flex w-full max-w-3xl flex-col bg-white shadow-xl">
        <header className="flex items-center gap-3 border-b border-slate-200 px-4 py-3">
          <NodeIcon node={node} />
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium text-slate-800">{node.name}</p>
            <p className="text-xs text-slate-500">
              {formatBytes(node.sizeBytes)}
              {node.createdAt ? ` · ${formatDateTimeIST(node.createdAt)}` : ""}
              {node.sourceLabel ? ` · ${node.sourceLabel}` : ""}
            </p>
          </div>
          <button
            type="button"
            onClick={download}
            className="inline-flex items-center gap-1.5 rounded-md border border-slate-200 px-3 py-1.5 text-sm text-slate-700 hover:bg-slate-50"
          >
            <Download size={15} /> Download
          </button>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="rounded-md p-1.5 text-slate-500 hover:bg-slate-100"
          >
            <X size={18} />
          </button>
        </header>

        <div className="flex flex-1 items-center justify-center overflow-auto bg-slate-100">
          {error ? (
            <p className="px-6 text-sm text-rose-600">{error}</p>
          ) : !url ? (
            <Spinner size={24} className="text-brand-accent" />
          ) : !previewable ? (
            <div className="px-6 text-center">
              <NodeIcon node={node} size={48} />
              <p className="mt-3 text-sm text-slate-600">
                No preview for this kind of file — download it to open.
              </p>
              <a
                href={url}
                target="_blank"
                rel="noreferrer"
                className="mt-3 inline-flex items-center gap-1.5 text-sm text-brand-accent hover:underline"
              >
                Open in a new tab <ExternalLink size={14} />
              </a>
            </div>
          ) : kind === "image" ? (
            /* eslint-disable-next-line @next/next/no-img-element -- signed storage URL */
            <img src={url} alt={node.name} className="max-h-full max-w-full object-contain" />
          ) : (
            <iframe src={url} title={node.name} className="h-full w-full border-0 bg-white" />
          )}
        </div>
      </aside>
    </div>
  );
}
