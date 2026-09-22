"use client";

import { useEffect, useState } from "react";
import {
  Archive,
  FileImage,
  FileSpreadsheet,
  FileText,
  FileType2,
  Folder,
  FolderLock,
  File as FileIconBase,
} from "lucide-react";
import { fileKind, thumbUrl, type FileNode } from "@/lib/filesApi";

/**
 * The picture on a card.
 *
 * <p>A real thumbnail when the server managed to render one, an icon otherwise. The thumbnail is
 * fetched lazily and only once it is actually on screen: a folder of sixty scanned bills would
 * otherwise sign sixty URLs and pull sixty images before the user has looked at any of them.
 */
export function NodeIcon({ node, size = 20 }: { node: FileNode; size?: number }) {
  if (node.kind === "FOLDER") {
    return node.visibility === "MANAGERS_ONLY" ? (
      <FolderLock size={size} className="text-amber-500" />
    ) : (
      <Folder size={size} className="text-slate-400" />
    );
  }

  switch (fileKind(node)) {
    case "image":
      return <FileImage size={size} className="text-emerald-500" />;
    case "pdf":
      return <FileText size={size} className="text-rose-500" />;
    case "sheet":
      return <FileSpreadsheet size={size} className="text-green-600" />;
    case "doc":
      return <FileType2 size={size} className="text-blue-500" />;
    case "archive":
      return <Archive size={size} className="text-amber-600" />;
    default:
      return <FileIconBase size={size} className="text-slate-400" />;
  }
}

/** The preview area of a grid card: thumbnail if there is one, large icon if not. */
export function NodeThumb({ node }: { node: FileNode }) {
  const [url, setUrl] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (!node.hasThumb || node.fileId == null) return;
    let cancelled = false;
    void thumbUrl(node.fileId).then((u) => {
      if (!cancelled) setUrl(u);
    });
    return () => {
      cancelled = true;
    };
  }, [node.hasThumb, node.fileId]);

  if (url && !failed) {
    return (
      /* eslint-disable-next-line @next/next/no-img-element -- signed storage URL, not a static asset */
      <img
        src={url}
        alt=""
        loading="lazy"
        onError={() => setFailed(true)}
        className="h-full w-full object-cover object-top"
      />
    );
  }

  return (
    <div className="flex h-full w-full items-center justify-center bg-slate-50">
      <NodeIcon node={node} size={40} />
    </div>
  );
}
