"use client";

import { create } from "zustand";

/**
 * One file the app-wide viewer can show. `url` may be a data URL, a blob: URL or a signed http(s)
 * link; `contentType` is authoritative, the file name's extension the fallback.
 */
export interface PreviewFile {
  id: string;
  name: string;
  url: string | null;
  contentType?: string | null;
  size?: string;
  at?: string;
}

interface FilePreviewState {
  files: PreviewFile[];
  startId: string | null;
  open: (files: PreviewFile[], startId?: string) => void;
  close: () => void;
}

/**
 * The single place every screen opens documents from — images and PDFs are shown inline instead
 * of being downloaded straight away; the viewer still offers a Download button. Mounted once in
 * the root layout (`GlobalFilePreview`).
 */
export const useFilePreview = create<FilePreviewState>((set) => ({
  files: [],
  startId: null,
  open: (files, startId) => set({ files, startId: startId ?? files[0]?.id ?? null }),
  close: () => set({ files: [], startId: null }),
}));

/** Open one file in the viewer. */
export function previewFile(file: Omit<PreviewFile, "id"> & { id?: string }) {
  const id = file.id ?? `${file.name}-${Date.now()}`;
  useFilePreview.getState().open([{ ...file, id }], id);
}
