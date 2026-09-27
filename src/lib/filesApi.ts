import { API_BASE_URL, apiRequest } from "./api";

/**
 * Mirrors file-service (com.hitech.erp.files) — the project Files tab, and the upload path every
 * other module shares with it.
 *
 * Two things about this file are worth knowing before changing it.
 *
 * **File bytes never go through our own API.** `apiRequest` is used for metadata only. The actual
 * upload and download happen against a signed URL that points straight at object storage, via the
 * raw `fetch`/`XMLHttpRequest` calls below. That is deliberate and it is the whole performance
 * story: a 1 GB drawing costs the backend two small JSON round trips.
 *
 * **There is one upload path, not one per module.** `uploadFile` with a `source` is how Vyapar, a
 * task or a tender attaches a document; without a `source` it is a plain upload into the project's
 * folder tree. Both write one row to the same table, which is why the project Files tab can show
 * every document belonging to a project without anything being stored twice.
 */

const BASE = "/api/v1/files";

// ---------------------------------------------------------------- shapes

export type NodeKind = "FOLDER" | "FILE";
export type Visibility = "ALL" | "MANAGERS_ONLY";

/** Which module a file came from, when it wasn't a plain upload. */
export type SourceModule = "VYAPAR" | "TASK" | "TENDER" | "PROCUREMENT" | "WAREHOUSE" | "PAYROLL";

export interface FileNode {
  /** Null for a module's file, which lives in the registry but not in anyone's folder tree. */
  id: number | null;
  kind: NodeKind;
  name: string;
  parentId: number | null;
  depth: number;
  visibility: Visibility;
  /** Folders only — how many things are directly inside. */
  childCount: number | null;
  fileId: number | null;
  sizeBytes: number | null;
  contentType: string | null;
  hasThumb: boolean;
  sourceModule: SourceModule | null;
  sourceLabel: string | null;
  sourceParty: string | null;
  uploadedBy: number | null;
  createdAt: string | null;
  updatedAt: string | null;
}

export interface Crumb {
  id: number | null;
  name: string;
}

/** A read-only folder that is really a query over another module's attachments. */
export interface SmartFolder {
  module: SourceModule;
  name: string;
  count: number;
  sizeBytes: number;
}

export interface FolderListing {
  folderId: number | null;
  folderName: string;
  module: SourceModule | null;
  breadcrumbs: Crumb[];
  nodes: FileNode[];
  smartFolders: SmartFolder[];
  canUpload: boolean;
  canEdit: boolean;
  canDelete: boolean;
}

export interface StorageUsage {
  totalBytes: number;
  fileCount: number;
  backend: string;
}

export interface SignedUrl {
  url: string;
  expiresInSeconds: number;
}

/** Where a file came from, when another module is attaching it. */
export interface FileSource {
  module: SourceModule;
  type?: string;
  id?: number;
  label?: string;
  party?: string;
}

// ---------------------------------------------------------------- browsing

export function listFolder(projectId: number, parentId?: number | null) {
  const q = parentId == null ? "" : `?parent=${parentId}`;
  return apiRequest<FolderListing>(`/api/v1/projects/${projectId}/files${q}`);
}

export function listModuleFiles(projectId: number, module: SourceModule) {
  return apiRequest<FolderListing>(`/api/v1/projects/${projectId}/files/module/${module}`);
}

export function searchFiles(projectId: number, term: string) {
  return apiRequest<FileNode[]>(
    `/api/v1/projects/${projectId}/files/search?q=${encodeURIComponent(term)}`
  );
}

export function listTrash(projectId: number) {
  return apiRequest<FileNode[]>(`/api/v1/projects/${projectId}/files/trash`);
}

export function storageUsage(projectId: number) {
  return apiRequest<StorageUsage>(`/api/v1/projects/${projectId}/files/usage`);
}

// ---------------------------------------------------------------- folders

export function createFolder(projectId: number, name: string, parentId: number | null) {
  return apiRequest<FileNode>(`/api/v1/projects/${projectId}/files/folders`, {
    method: "POST",
    body: { name, parentId },
  });
}

export function renameNode(projectId: number, nodeId: number, name: string) {
  return apiRequest<FileNode>(`/api/v1/projects/${projectId}/files/nodes/${nodeId}/name`, {
    method: "PUT",
    body: { name },
  });
}

export function moveNode(projectId: number, nodeId: number, targetParentId: number | null) {
  return apiRequest<FileNode>(`/api/v1/projects/${projectId}/files/nodes/${nodeId}/parent`, {
    method: "PUT",
    body: { targetParentId },
  });
}

export function setVisibility(projectId: number, nodeId: number, visibility: Visibility) {
  return apiRequest<void>(`/api/v1/projects/${projectId}/files/nodes/${nodeId}/visibility`, {
    method: "PUT",
    body: { visibility },
  });
}

export function trashNode(projectId: number, nodeId: number) {
  return apiRequest<void>(`/api/v1/projects/${projectId}/files/nodes/${nodeId}`, {
    method: "DELETE",
  });
}

export function restoreNode(projectId: number, nodeId: number) {
  return apiRequest<void>(`/api/v1/projects/${projectId}/files/nodes/${nodeId}/restore`, {
    method: "POST",
  });
}

// ---------------------------------------------------------------- download

export async function fileUrl(fileId: number, inline = false) {
  const res = await apiRequest<SignedUrl>(`${BASE}/${fileId}/url?inline=${inline}`);
  return resolveStorageUrl(res.url);
}

/** Null rather than throwing: most files have no thumbnail and the grid must not care. */
export async function thumbUrl(fileId: number): Promise<string | null> {
  try {
    const res = await apiRequest<SignedUrl>(`${BASE}/${fileId}/thumb`);
    return resolveStorageUrl(res.url);
  } catch {
    return null;
  }
}

/**
 * Attachments on one record — for a bill drawer, a task, a work order. Pass `type` where a module's
 * ids aren't unique across its kinds of record (procurement QUOTE 12 vs PURCHASE_ORDER 12).
 */
export function attachmentsFor(module: SourceModule, sourceId: number, type?: string) {
  const t = type ? `&type=${encodeURIComponent(type)}` : "";
  return apiRequest<FileNode[]>(`${BASE}/attachments?module=${module}&sourceId=${sourceId}${t}`);
}

/**
 * Remove one attachment.
 *
 * Deliberately not the same call as deleting from the folder tree. An attachment belongs to its
 * record and goes when the record does; a document someone filed in a folder goes to the trash,
 * where it can be got back.
 */
export function deleteAttachment(fileId: number) {
  return apiRequest<void>(`${BASE}/attachments/${fileId}`, { method: "DELETE" });
}

// ---------------------------------------------------------------- upload

interface InitResponse {
  fileId: number;
  nodeId: number | null;
  mode: "DEDUPED" | "DIRECT" | "MULTIPART";
  uploadUrl: string | null;
  uploadId: string | null;
  partUrls: string[] | null;
  partSize: number;
}

/**
 * Turn whatever the server signed into something the browser can actually fetch.
 *
 * S3 signs an absolute URL at the bucket's own hostname, which needs nothing doing to it. The local
 * disk backend signs a path — `/api/v1/public/files/blob?...` — because it is served by the API
 * itself. A bare path resolves against the *page's* origin, which is the Next.js dev server, not
 * the API: the upload then 404s on a route the frontend has never heard of. A relative URL handed
 * back by the API means "relative to the API", so that is what it is resolved against.
 */
export function resolveStorageUrl(url: string): string {
  return /^https?:\/\//i.test(url) ? url : `${API_BASE_URL}${url}`;
}

export interface UploadHandle {
  /** 0–100. */
  onProgress?: (percent: number) => void;
  signal?: AbortSignal;
}

/** How many parts of a multipart upload run at once. Four saturates a site broadband line. */
const PARALLEL_PARTS = 4;

/** Below this, hashing costs more than the duplicate check can ever save. */
const HASH_LIMIT_BYTES = 200 * 1024 * 1024;

/**
 * Upload one file.
 *
 * The handshake is init → PUT → complete. The middle step is the only one that moves bytes and it
 * does not touch our backend at all.
 *
 * Passing `source` marks the file as another module's attachment: it lands in the same registry, is
 * visible in the project's Files tab under that module's folder, and is *not* filed into the user's
 * folder tree — the module's own record owns it.
 */
export async function uploadFile(
  file: File,
  opts: {
    projectId: number | null;
    parentId?: number | null;
    source?: FileSource;
  } & UploadHandle
): Promise<FileNode> {
  const { projectId, parentId = null, source, onProgress, signal } = opts;

  const sha256 = await hashFile(file);

  const init = await apiRequest<InitResponse>(`${BASE}/init`, {
    method: "POST",
    body: {
      projectId,
      parentId,
      name: file.name,
      size: file.size,
      contentType: file.type || "application/octet-stream",
      sha256,
      sourceModule: source?.module ?? null,
      sourceType: source?.type ?? null,
      sourceId: source?.id ?? null,
      sourceLabel: source?.label ?? null,
      sourceParty: source?.party ?? null,
    },
  });

  // We already held these exact bytes — the server filed a second reference and nothing moved.
  if (init.mode === "DEDUPED") {
    onProgress?.(100);
    return complete(init.fileId, parentId, null, null);
  }

  try {
    if (init.mode === "MULTIPART" && init.partUrls) {
      const etags = await putParts(file, init.partUrls, init.partSize, onProgress, signal);
      return await complete(init.fileId, parentId, init.uploadId, etags);
    }

    await putWhole(file, init.uploadUrl!, onProgress, signal);
    return await complete(init.fileId, parentId, null, null);
  } catch (err) {
    // Release the reservation so an abandoned upload doesn't sit in the table forever.
    void abandon(init.fileId, init.uploadId);
    throw err;
  }
}

function complete(
  fileId: number,
  parentId: number | null,
  uploadId: string | null,
  etags: string[] | null
) {
  const q = parentId == null ? "" : `?parent=${parentId}`;
  return apiRequest<FileNode>(`${BASE}/${fileId}/complete${q}`, {
    method: "POST",
    body: { uploadId, etags },
  });
}

function abandon(fileId: number, uploadId: string | null) {
  const q = uploadId ? `?uploadId=${encodeURIComponent(uploadId)}` : "";
  return apiRequest<void>(`${BASE}/${fileId}${q}`, { method: "DELETE" }).catch(() => {});
}

/**
 * A single PUT, with progress.
 *
 * `XMLHttpRequest` rather than `fetch` purely because it is the only one that reports *upload*
 * progress in every browser we care about — a site engineer pushing 400 MB over a phone connection
 * needs a bar that moves, not a spinner.
 */
function putWhole(
  body: Blob,
  url: string,
  onProgress?: (p: number) => void,
  signal?: AbortSignal
): Promise<string | null> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("PUT", resolveStorageUrl(url), true);
    if (body.type) xhr.setRequestHeader("Content-Type", body.type);

    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) onProgress?.(Math.round((e.loaded / e.total) * 100));
    };
    xhr.onload = () =>
      xhr.status >= 200 && xhr.status < 300
        ? resolve(xhr.getResponseHeader("ETag"))
        : reject(new Error(`Upload failed (${xhr.status})`));
    xhr.onerror = () => reject(new Error("Upload failed — check your connection."));
    xhr.onabort = () => reject(new DOMException("Upload cancelled", "AbortError"));

    signal?.addEventListener("abort", () => xhr.abort(), { once: true });
    xhr.send(body);
  });
}

/** Parts, a few at a time, with one shared progress figure across all of them. */
async function putParts(
  file: File,
  urls: string[],
  partSize: number,
  onProgress?: (p: number) => void,
  signal?: AbortSignal
): Promise<string[]> {
  const etags: string[] = new Array(urls.length);
  const done: number[] = new Array(urls.length).fill(0);

  const report = () => {
    const sent = done.reduce((a, b) => a + b, 0);
    onProgress?.(Math.min(99, Math.round((sent / file.size) * 100)));
  };

  let next = 0;
  const worker = async () => {
    while (next < urls.length) {
      const i = next++;
      const slice = file.slice(i * partSize, Math.min((i + 1) * partSize, file.size));
      const tag = await putWhole(
        slice,
        urls[i],
        (p) => {
          done[i] = (slice.size * p) / 100;
          report();
        },
        signal
      );
      // S3 needs the ETags in part order to reassemble the object.
      etags[i] = (tag ?? "").replace(/"/g, "");
      done[i] = slice.size;
      report();
    }
  };

  await Promise.all(Array.from({ length: Math.min(PARALLEL_PARTS, urls.length) }, worker));
  return etags;
}

/**
 * SHA-256 of the file, so the server can skip an upload it already holds — the same purchase order
 * genuinely does get uploaded into three folders by three people.
 *
 * Streamed through `SubtleCrypto` in one pass. Skipped above 200 MB, where reading the file twice
 * costs more than the duplicate it might catch, and skipped entirely on plain HTTP, where
 * `crypto.subtle` is not available at all.
 */
async function hashFile(file: File): Promise<string | null> {
  if (file.size > HASH_LIMIT_BYTES) return null;
  if (typeof crypto === "undefined" || !crypto.subtle) return null;
  try {
    const digest = await crypto.subtle.digest("SHA-256", await file.arrayBuffer());
    return Array.from(new Uint8Array(digest))
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------- display helpers

export function formatBytes(bytes: number | null | undefined): string {
  if (bytes == null) return "";
  if (bytes < 1024) return `${bytes} B`;
  const units = ["KB", "MB", "GB", "TB"];
  let value = bytes / 1024;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit++;
  }
  return `${value.toFixed(value >= 10 || unit === 0 ? 0 : 1)} ${units[unit]}`;
}

/** Coarse enough to pick an icon and decide whether we can preview it in the browser. */
export function fileKind(node: FileNode): "image" | "pdf" | "sheet" | "doc" | "archive" | "other" {
  const type = (node.contentType ?? "").toLowerCase();
  const ext = node.name.split(".").pop()?.toLowerCase() ?? "";

  if (type.startsWith("image/") || ["png", "jpg", "jpeg", "gif", "webp", "bmp"].includes(ext)) {
    return "image";
  }
  if (type === "application/pdf" || ext === "pdf") return "pdf";
  if (type.includes("spreadsheet") || ["xls", "xlsx", "csv"].includes(ext)) return "sheet";
  if (type.includes("word") || ["doc", "docx", "rtf", "txt"].includes(ext)) return "doc";
  if (["zip", "rar", "7z", "tar", "gz"].includes(ext)) return "archive";
  return "other";
}
