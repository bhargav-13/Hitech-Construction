"use client";

import { AttachmentPreview } from "@/components/task/AttachmentPreview";
import { useFilePreview } from "@/lib/filePreview";

/** Renders whatever `previewFile()` / `useFilePreview().open()` asked for, anywhere in the app. */
export function GlobalFilePreview() {
  const files = useFilePreview((s) => s.files);
  const startId = useFilePreview((s) => s.startId);
  const close = useFilePreview((s) => s.close);
  if (!files.length || !startId) return null;
  return <AttachmentPreview key={startId} attachments={files} startId={startId} onClose={close} />;
}
