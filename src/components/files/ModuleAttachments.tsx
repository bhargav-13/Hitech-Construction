"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Eye, Paperclip, Trash2, Upload } from "lucide-react";
import { Spinner } from "@/components/Spinner";
import {
  attachmentsFor,
  deleteAttachment,
  fileUrl,
  formatBytes,
  uploadFile,
  type FileNode,
  type FileSource,
  type SourceModule,
} from "@/lib/filesApi";
import { previewFile } from "@/lib/filePreview";

/**
 * Files attached to one record — a purchase bill, a task, a tender, a work order.
 *
 * <p>This is the one component every module uses for attachments, and it is the reason a document
 * entered anywhere in the ERP turns up in its project's Files tab without being stored twice. It
 * writes to the same registry the Files tab reads: one row, tagged with the record it belongs to.
 * There is no copy, no sync and nothing to keep in step — delete the bill and its scan leaves the
 * Files tab on its own.
 *
 * <p>It replaces the base64 data-URL fields each module grew separately
 * ({@code vyapar_invoices.document_data_url}, {@code task_attachments.data_url}). Those columns are
 * still read for records saved before the change — see {@code legacy} — so nothing that already
 * exists disappears while the backfill is pending.
 *
 * <p><b>Records that don't exist yet.</b> An attachment needs the id of the thing it is attached
 * to, which a create form doesn't have until it saves. Use {@link usePendingAttachments} for those:
 * it holds the chosen files in memory and uploads them once the record has an id.
 */

export function ModuleAttachments({
  module,
  type,
  sourceId,
  projectId,
  label,
  party,
  legacy,
  canEdit = true,
  compact = false,
  matchType = false,
}: {
  module: SourceModule;
  /** The record's kind within that module — PURCHASE, PAYMENT_OUT, WORK_ORDER… */
  type?: string;
  /** The record's id. Null means it hasn't been saved yet; nothing renders. */
  sourceId: number | null;
  /** Which project the file belongs to. Null files it under no project. */
  projectId: number | null;
  /** Caption shown on the card in the project's Files tab: "Purchase Bill #1042". */
  label?: string;
  /** Vendor or party name, so the Files tab can group bills by who sent them. */
  party?: string;
  /**
   * Anything this record already holds as a base64 data URL, from before the registry existed.
   * Shown read-only beneath the real attachments so old records don't look empty.
   */
  legacy?: { name: string; dataUrl: string }[];
  canEdit?: boolean;
  compact?: boolean;
  /** List only this `type`'s files — for a module whose record ids repeat across kinds. */
  matchType?: boolean;
}) {
  const [items, setItems] = useState<FileNode[]>([]);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [percent, setPercent] = useState(0);
  const [error, setError] = useState("");
  const input = useRef<HTMLInputElement>(null);

  const reload = useCallback(() => {
    if (sourceId == null) return;
    setLoading(true);
    attachmentsFor(module, sourceId, matchType ? type : undefined)
      .then(setItems)
      .catch(() => setItems([]))
      .finally(() => setLoading(false));
  }, [module, sourceId, matchType, type]);

  useEffect(() => reload(), [reload]);

  const onPick = async (files: FileList | null) => {
    if (!files?.length || sourceId == null) return;
    setBusy(true);
    setError("");
    try {
      for (const file of Array.from(files)) {
        await uploadFile(file, {
          projectId,
          source: { module, type, id: sourceId, label, party },
          onProgress: setPercent,
        });
      }
      reload();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't attach that file.");
    } finally {
      setBusy(false);
      setPercent(0);
    }
  };

  const onRemove = async (fileId: number) => {
    setError("");
    try {
      await deleteAttachment(fileId);
      setItems((list) => list.filter((i) => i.fileId !== fileId));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't remove that file.");
    }
  };

  if (sourceId == null) return null;

  const hasLegacy = (legacy?.length ?? 0) > 0;

  return (
    <div className={compact ? "" : "rounded-md border border-slate-200 p-3"}>
      <div className="flex items-center gap-2">
        <Paperclip size={14} className="text-slate-400" />
        <span className="text-xs font-medium uppercase tracking-wide text-slate-500">
          Attachments
        </span>
        {loading && <Spinner size={12} className="text-slate-400" />}
        {canEdit && (
          <>
            <button
              type="button"
              disabled={busy}
              onClick={() => input.current?.click()}
              className="ml-auto inline-flex items-center gap-1 text-xs text-brand-accent hover:underline disabled:opacity-50"
            >
              <Upload size={12} />
              {busy ? `Uploading ${percent}%` : "Add file"}
            </button>
            <input
              ref={input}
              type="file"
              multiple
              hidden
              onChange={(e) => {
                void onPick(e.target.files);
                e.target.value = "";
              }}
            />
          </>
        )}
      </div>

      {error && <p className="mt-2 text-xs text-rose-600">{error}</p>}

      {items.length === 0 && !hasLegacy && !loading && (
        <p className="mt-2 text-xs text-slate-400">
          Nothing attached. Files added here also appear in the project&apos;s Files tab.
        </p>
      )}

      <ul className="mt-2 space-y-1">
        {items.map((item) => (
          <li
            key={item.fileId}
            className="flex items-center gap-2 rounded bg-slate-50 px-2 py-1.5 text-xs"
          >
            <span className="min-w-0 flex-1 truncate text-slate-700" title={item.name}>
              {item.name}
            </span>
            <span className="text-slate-400">{formatBytes(item.sizeBytes)}</span>
            <button
              type="button"
              onClick={async () =>
                item.fileId != null &&
                previewFile({ name: item.name, url: await fileUrl(item.fileId, true), contentType: item.contentType })
              }
              aria-label={`Open ${item.name}`}
              className="rounded p-0.5 text-slate-400 hover:bg-slate-200 hover:text-slate-600"
            >
              <Eye size={13} />
            </button>
            {canEdit && (
              <button
                type="button"
                onClick={() => item.fileId != null && onRemove(item.fileId)}
                aria-label={`Remove ${item.name}`}
                className="rounded p-0.5 text-slate-400 hover:bg-rose-50 hover:text-rose-600"
              >
                <Trash2 size={13} />
              </button>
            )}
          </li>
        ))}

        {/* Saved before the registry existed. Read-only: the backfill moves these across. */}
        {legacy?.map((l) => (
          <li
            key={l.name}
            className="flex items-center gap-2 rounded bg-amber-50/60 px-2 py-1.5 text-xs"
          >
            <span className="min-w-0 flex-1 truncate text-slate-600" title={l.name}>
              {l.name}
            </span>
            <span className="text-[10px] uppercase tracking-wide text-amber-600">legacy</span>
            <button
              type="button"
              onClick={() => previewFile({ name: l.name, url: l.dataUrl })}
              className="rounded p-0.5 text-slate-400 hover:bg-slate-200 hover:text-slate-600"
              aria-label={`Open ${l.name}`}
            >
              <Eye size={13} />
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

/**
 * Attachments chosen on a form that hasn't saved yet.
 *
 * <p>A file has to be attached *to* something, and a new bill has no id until it is saved. So the
 * chosen files are held here — as `File` objects, not base64, so nothing is read into memory
 * twice — and {@link PendingAttachments.flush} uploads them once the record exists.
 */
export interface PendingAttachments {
  files: File[];
  add: (files: FileList | File[] | null) => void;
  remove: (index: number) => void;
  /** Call with the new record's id, right after it saves. Resolves when every file is stored. */
  flush: (sourceId: number, projectId: number | null) => Promise<void>;
  clear: () => void;
}

export function usePendingAttachments(
  module: SourceModule,
  opts: { type?: string; label?: string; party?: string } = {}
): PendingAttachments {
  const [files, setFiles] = useState<File[]>([]);

  const add = useCallback((picked: FileList | File[] | null) => {
    if (!picked) return;
    setFiles((list) => [...list, ...Array.from(picked)]);
  }, []);

  const remove = useCallback((index: number) => {
    setFiles((list) => list.filter((_, i) => i !== index));
  }, []);

  const clear = useCallback(() => setFiles([]), []);

  const flush = useCallback(
    async (sourceId: number, projectId: number | null) => {
      if (files.length === 0) return;
      const source: FileSource = { module, id: sourceId, ...opts };
      for (const file of files) {
        await uploadFile(file, { projectId, source });
      }
      setFiles([]);
    },
    // `opts` is a fresh object each render, so spreading its fields keeps this from re-creating
    // the callback on every keystroke in the form above.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [files, module, opts.type, opts.label, opts.party]
  );

  return { files, add, remove, flush, clear };
}

/** The picked-but-not-yet-uploaded list, for a create form. */
export function PendingAttachmentList({
  pending,
  canEdit = true,
}: {
  pending: PendingAttachments;
  canEdit?: boolean;
}) {
  const input = useRef<HTMLInputElement>(null);

  return (
    <div>
      <div className="flex items-center gap-2">
        <Paperclip size={14} className="text-slate-400" />
        <span className="text-xs font-medium uppercase tracking-wide text-slate-500">
          Attachments
        </span>
        {canEdit && (
          <>
            <button
              type="button"
              onClick={() => input.current?.click()}
              className="ml-auto inline-flex items-center gap-1 text-xs text-brand-accent hover:underline"
            >
              <Upload size={12} /> Add file
            </button>
            <input
              ref={input}
              type="file"
              multiple
              hidden
              onChange={(e) => {
                pending.add(e.target.files);
                e.target.value = "";
              }}
            />
          </>
        )}
      </div>

      {pending.files.length === 0 ? (
        <p className="mt-2 text-xs text-slate-400">
          Files are uploaded when you save, and appear in the project&apos;s Files tab.
        </p>
      ) : (
        <ul className="mt-2 space-y-1">
          {pending.files.map((file, i) => (
            <li
              key={`${file.name}-${i}`}
              className="flex items-center gap-2 rounded bg-slate-50 px-2 py-1.5 text-xs"
            >
              <span className="min-w-0 flex-1 truncate text-slate-700">{file.name}</span>
              <span className="text-slate-400">{formatBytes(file.size)}</span>
              {canEdit && (
                <button
                  type="button"
                  onClick={() => pending.remove(i)}
                  aria-label={`Remove ${file.name}`}
                  className="rounded p-0.5 text-slate-400 hover:bg-rose-50 hover:text-rose-600"
                >
                  <Trash2 size={13} />
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
