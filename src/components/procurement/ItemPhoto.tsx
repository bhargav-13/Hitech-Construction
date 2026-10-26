"use client";

import { useEffect, useRef, useState } from "react";
import { ImagePlus, Loader2, X } from "lucide-react";
import { fileUrl, uploadFile } from "@/lib/filesApi";

/**
 * Signed URLs expire, so they are fetched on demand and cached per file id for the page's lifetime
 * (well inside the server's TTL). Shared by every thumbnail on the page.
 */
const urlCache = new Map<number, Promise<string | null>>();

function signedUrl(fileId: number): Promise<string | null> {
  let p = urlCache.get(fileId);
  if (!p) {
    p = fileUrl(fileId, true).catch(() => null);
    urlCache.set(fileId, p);
  }
  return p;
}

/** Resolves a file id to a viewable URL; null while loading or if it can't be signed. */
export function useFileUrl(fileId: number | null | undefined) {
  // Remember which file the URL belongs to, so a changed id reads as "loading" without a reset.
  const [signed, setSigned] = useState<{ id: number; url: string | null } | null>(null);
  useEffect(() => {
    let live = true;
    if (fileId) void signedUrl(fileId).then((u) => live && setSigned({ id: fileId, url: u }));
    return () => {
      live = false;
    };
  }, [fileId]);
  return fileId && signed?.id === fileId ? signed.url : null;
}

/** A small read-only thumbnail that opens the full photo in a new tab. */
export function ItemPhotoThumb({ fileId, size = 40, className = "" }: { fileId: number | null | undefined; size?: number; className?: string }) {
  const url = useFileUrl(fileId);
  if (!fileId) return null;
  return (
    <a
      href={url ?? undefined}
      target="_blank"
      rel="noreferrer"
      onClick={(e) => !url && e.preventDefault()}
      style={{ width: size, height: size }}
      className={`block shrink-0 overflow-hidden rounded-md border border-gray-200 bg-gray-50 ${className}`}
      title="Open photo"
    >
      {url ? <img src={url} alt="" className="h-full w-full object-cover" /> : <span className="block h-full w-full animate-pulse bg-gray-100" />}
    </a>
  );
}

/**
 * Photo slot on an RFQ line: pick → uploads to the shared file registry (no project, module
 * PROCUREMENT, type ITEM_IMAGE) → hands back the file id. The same file id is reused by later
 * enquiries for the same material, which is why it isn't tied to one RFQ or project.
 */
export function ItemPhotoPicker({
  fileId,
  itemName,
  onChange,
}: {
  fileId: number | null;
  itemName: string;
  onChange: (fileId: number | null) => void;
}) {
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState(0);

  async function pick(file: File | undefined) {
    if (!file) return;
    if (!file.type.startsWith("image/")) return alert("Pick an image file (JPG, PNG, WebP).");
    setBusy(true);
    setProgress(0);
    try {
      const node = await uploadFile(file, {
        projectId: null,
        source: { module: "PROCUREMENT", type: "ITEM_IMAGE", label: itemName || file.name },
        onProgress: setProgress,
      });
      onChange(node.fileId ?? node.id);
    } catch (e) {
      alert(e instanceof Error ? e.message : "Couldn't upload that photo.");
    } finally {
      setBusy(false);
      if (input.current) input.current.value = "";
    }
  }

  return (
    <div className="relative">
      <input ref={input} type="file" accept="image/*" className="hidden" onChange={(e) => void pick(e.target.files?.[0])} />
      {fileId ? (
        <div className="group relative">
          <ItemPhotoThumb fileId={fileId} size={56} />
          <button
            type="button"
            onClick={() => onChange(null)}
            title="Remove photo"
            className="absolute -top-1.5 -right-1.5 hidden rounded-full bg-white p-0.5 text-gray-500 shadow ring-1 ring-gray-200 group-hover:block hover:text-rose-600"
          >
            <X size={11} />
          </button>
          <button type="button" onClick={() => input.current?.click()} className="mt-0.5 block w-14 text-center text-[10px] text-gray-400 hover:text-brand-accent">
            Change
          </button>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => input.current?.click()}
          disabled={busy}
          title="Add a photo"
          className="flex h-14 w-14 flex-col items-center justify-center gap-0.5 rounded-md border border-dashed border-gray-300 text-[10px] text-gray-400 transition-colors hover:border-brand-accent hover:text-brand-accent disabled:opacity-60"
        >
          {busy ? <Loader2 size={14} className="animate-spin" /> : <ImagePlus size={15} />}
          {busy ? `${progress}%` : "Photo"}
        </button>
      )}
    </div>
  );
}
