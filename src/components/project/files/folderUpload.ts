/**
 * KAN-136: uploading a whole folder, and unpacking a ZIP, into Project → Files.
 *
 * Both turn into the same thing: a list of files, each with the folder path it belongs under
 * ("Drawings/Ground floor/plan.pdf"). The caller creates those folders (once each) and uploads the
 * files into them.
 */

/** One file and the folders it sits in, relative to where the upload started. */
export interface PathedFile {
  file: File;
  /** Folder names from the top down; empty = straight into the current folder. */
  dirs: string[];
}

export const isZip = (f: File) => /\.zip$/i.test(f.name) || f.type === "application/zip" || f.type === "application/x-zip-compressed";

/** Files picked with the "Upload folder" button carry their path in webkitRelativePath. */
export function fromFolderInput(list: FileList | File[]): PathedFile[] {
  return Array.from(list).map((file) => {
    const rel = (file as File & { webkitRelativePath?: string }).webkitRelativePath || file.name;
    const parts = rel.split("/").filter(Boolean);
    parts.pop();
    return { file, dirs: parts };
  });
}

/** Files and folders dragged in from the desktop — folders are walked with the entries API. */
export async function fromDrop(dt: DataTransfer): Promise<PathedFile[]> {
  const entries = Array.from(dt.items ?? [])
    .map((i) => i.webkitGetAsEntry())
    .filter((e): e is FileSystemEntry => !!e);
  if (entries.length === 0) return Array.from(dt.files ?? []).map((file) => ({ file, dirs: [] }));
  const out: PathedFile[] = [];
  async function walk(e: FileSystemEntry, dirs: string[]) {
    if (e.isFile) {
      const file = await new Promise<File>((ok, err) => (e as FileSystemFileEntry).file(ok, err));
      out.push({ file, dirs });
    } else if (e.isDirectory) {
      const reader = (e as FileSystemDirectoryEntry).createReader();
      // readEntries hands back the children in batches; keep reading until it returns none.
      for (;;) {
        const batch = await new Promise<FileSystemEntry[]>((ok, err) => reader.readEntries(ok, err));
        if (batch.length === 0) break;
        for (const child of batch) await walk(child, [...dirs, e.name]);
      }
    }
  }
  for (const e of entries) await walk(e, []);
  return out;
}

const MIME: Record<string, string> = {
  pdf: "application/pdf",
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  webp: "image/webp",
  gif: "image/gif",
  xls: "application/vnd.ms-excel",
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  doc: "application/msword",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  csv: "text/csv",
  txt: "text/plain",
  dwg: "application/acad",
};

/**
 * Unpack a ZIP in the browser into its files, keeping its folder structure. Junk the OS adds
 * (__MACOSX, .DS_Store, Thumbs.db) is skipped.
 */
export async function unzip(zip: File): Promise<PathedFile[]> {
  const { unzipSync } = await import("fflate");
  const entries = unzipSync(new Uint8Array(await zip.arrayBuffer()));
  const out: PathedFile[] = [];
  for (const [path, bytes] of Object.entries(entries)) {
    if (path.endsWith("/")) continue; // folder entry
    const parts = path.split("/").filter(Boolean);
    if (parts.some((p) => p === "__MACOSX") || /^(\.DS_Store|Thumbs\.db|desktop\.ini)$/i.test(parts[parts.length - 1] ?? "")) {
      continue;
    }
    const name = parts.pop()!;
    const ext = name.split(".").pop()?.toLowerCase() ?? "";
    out.push({
      file: new File([bytes as BlobPart], name, { type: MIME[ext] ?? "application/octet-stream" }),
      dirs: parts,
    });
  }
  return out;
}
