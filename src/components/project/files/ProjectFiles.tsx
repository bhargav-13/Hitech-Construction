"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ChevronRight,
  FolderPlus,
  Grid2x2,
  Home,
  Layers,
  List,
  Search,
  Trash2,
  Upload,
  X,
} from "lucide-react";
import { Spinner } from "@/components/Spinner";
import * as cache from "@/lib/filesCache";
import {
  createFolder,
  listTrash,
  moveNode,
  renameNode,
  restoreNode,
  searchFiles,
  setVisibility,
  trashNode,
  uploadFile,
  type FileNode,
  type FolderListing,
  type SourceModule,
} from "@/lib/filesApi";
import { lastSeenAt, markSeen } from "@/lib/filesSeen";
import { msIST } from "@/lib/datetime";
import { FilePreviewDrawer } from "./FilePreviewDrawer";
import { NodeRow, NodeCard, SmartFolderCard } from "./FileViews";
import { UploadTray, type UploadJob } from "./UploadTray";

/**
 * Project → Files.
 *
 * <p>Two things this screen is built around.
 *
 * <p><b>Everything belonging to the project is here, and none of it is stored twice.</b> Beside the
 * folders people create there are smart folders — "Bills & Vouchers", "Task Attachments" — which
 * are queries over what other modules attached, not copies of them. Deleting a bill in Vyapar
 * removes its scan from here, with nothing to keep in step.
 *
 * <p><b>It has to be faster than the ERP it replaces.</b> Folder navigation never costs a page
 * load: the listing is cached, rendered from memory on a revisit, refreshed behind the paint, and
 * prefetched while the pointer is merely resting on a folder. See {@code lib/filesCache.ts}.
 */

type View = "grid" | "list";

interface Location {
  folderId: number | null;
  module: SourceModule | null;
  trash: boolean;
}

const ROOT: Location = { folderId: null, module: null, trash: false };

export function ProjectFiles({ projectId }: { projectId: number }) {
  const [loc, setLoc] = useState<Location>(() => readLocation());
  const [listing, setListing] = useState<FolderListing | null>(null);
  const [trashRows, setTrashRows] = useState<FileNode[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const [view, setView] = useState<View>("grid");
  const [query, setQuery] = useState("");
  const [hits, setHits] = useState<FileNode[] | null>(null);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [preview, setPreview] = useState<FileNode | null>(null);
  const [renaming, setRenaming] = useState<number | null>(null);
  const [creating, setCreating] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const [uploads, setUploads] = useState<UploadJob[]>([]);

  const fileInput = useRef<HTMLInputElement>(null);
  const jobSeq = useRef(0);

  /**
   * Everything uploaded after this counts as new.
   *
   * <p>Read once, on mount, and never recomputed: if it tracked the clock, a card would quietly
   * stop being new while the user was still looking at it. The tab is marked seen on the way out
   * instead, so what was new when you opened it stays new for the whole visit.
   */
  // A lazy useState initialiser rather than a ref: this is read during render to decide how each
  // card looks, which is exactly what refs are not for.
  const [newSince] = useState(() => lastSeenAt(projectId));
  useEffect(() => () => markSeen(projectId), [projectId]);

  const isNew = useCallback(
    (node: FileNode) =>
      // A first visit marks nothing — tinting every card the day someone opens the tab teaches
      // them to ignore the colour.
      newSince > 0 && node.kind === "FILE" && msIST(node.createdAt) > newSince,
    [newSince]
  );

  // ---- where we are -----------------------------------------------------------------------------

  // The folder lives in the URL so a link to a folder is a link to a folder, and the browser's own
  // back button walks back up the tree. replaceState rather than a router push: this is a tab
  // inside a client page, and a route change would remount the whole workspace.
  const go = useCallback((next: Location) => {
    setLoc(next);
    setSelected(new Set());
    setQuery("");
    setHits(null);
    writeLocation(next);
  }, []);

  useEffect(() => {
    const onPop = () => setLoc(readLocation());
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, []);

  // ---- loading ----------------------------------------------------------------------------------

  const refresh = useCallback(
    (quiet = false) => {
      if (loc.trash) {
        setLoading(!quiet);
        listTrash(projectId)
          .then(setTrashRows)
          .catch((e: unknown) => setError(message(e, "Couldn't load the trash.")))
          .finally(() => setLoading(false));
        return;
      }

      // Anything already known paints immediately; the fetch below replaces it when it lands. A
      // folder visited before therefore appears to open instantly.
      const known = cache.peek(projectId, loc.folderId, loc.module);
      if (known) {
        setListing(known);
        setLoading(false);
      } else if (!quiet) {
        setLoading(true);
      }

      setError("");
      cache
        .load(projectId, loc.folderId, loc.module)
        .then(setListing)
        .catch((e: unknown) => setError(message(e, "Couldn't load this folder.")))
        .finally(() => setLoading(false));
    },
    [projectId, loc]
  );

  useEffect(() => refresh(), [refresh]);

  // ---- search -----------------------------------------------------------------------------------

  useEffect(() => {
    const term = query.trim();
    if (!term) {
      setHits(null);
      return;
    }
    // Typing "purchase" is eight keystrokes; without this it is also eight queries.
    const timer = setTimeout(() => {
      searchFiles(projectId, term)
        .then(setHits)
        .catch(() => setHits([]));
    }, 250);
    return () => clearTimeout(timer);
  }, [query, projectId]);

  // ---- mutations --------------------------------------------------------------------------------

  const after = useCallback(
    (touched?: (number | null)[]) => {
      if (touched) touched.forEach((id) => cache.invalidate(projectId, id));
      else cache.invalidate(projectId);
      refresh(true);
    },
    [projectId, refresh]
  );

  const startUpload = useCallback(
    (files: FileList | File[]) => {
      const parentId = loc.folderId;
      for (const file of Array.from(files)) {
        const id = ++jobSeq.current;
        const controller = new AbortController();
        setUploads((u) => [
          ...u,
          { id, name: file.name, size: file.size, percent: 0, status: "running", controller },
        ]);

        void uploadFile(file, {
          projectId,
          parentId,
          signal: controller.signal,
          onProgress: (percent) =>
            setUploads((u) => u.map((j) => (j.id === id ? { ...j, percent } : j))),
        })
          .then(() => {
            setUploads((u) =>
              u.map((j) => (j.id === id ? { ...j, percent: 100, status: "done" } : j))
            );
            cache.invalidate(projectId, parentId);
            // Only repaint if the user is still looking at the folder they uploaded into.
            if (parentId === loc.folderId) refresh(true);
          })
          .catch((e: unknown) => {
            const aborted = e instanceof DOMException && e.name === "AbortError";
            setUploads((u) =>
              u.map((j) =>
                j.id === id
                  ? {
                      ...j,
                      status: aborted ? "cancelled" : "failed",
                      error: aborted ? "" : message(e, "Upload failed."),
                    }
                  : j
              )
            );
          });
      }
    },
    [projectId, loc.folderId, refresh]
  );

  const onCreateFolder = async (name: string) => {
    setCreating(false);
    if (!name.trim()) return;
    try {
      await createFolder(projectId, name.trim(), loc.folderId);
      after([loc.folderId]);
    } catch (e) {
      setError(message(e, "Couldn't create that folder."));
    }
  };

  const onRename = async (nodeId: number, name: string) => {
    setRenaming(null);
    try {
      await renameNode(projectId, nodeId, name);
      after([loc.folderId]);
    } catch (e) {
      setError(message(e, "Couldn't rename that."));
    }
  };

  const onDrop = async (nodeId: number, targetId: number | null) => {
    if (nodeId === targetId) return;
    try {
      await moveNode(projectId, nodeId, targetId);
      // A move touches two folders and the whole subtree beneath the thing moved, so the cheap
      // targeted invalidation isn't safe here — drop everything for this project.
      after();
    } catch (e) {
      setError(message(e, "Couldn't move that."));
    }
  };

  const onDelete = async (ids: number[]) => {
    try {
      await Promise.all(ids.map((id) => trashNode(projectId, id)));
      setSelected(new Set());
      after();
    } catch (e) {
      setError(message(e, "Couldn't delete that."));
    }
  };

  const onRestore = async (nodeId: number) => {
    try {
      await restoreNode(projectId, nodeId);
      after();
      listTrash(projectId).then(setTrashRows).catch(() => {});
    } catch (e) {
      setError(message(e, "Couldn't restore that."));
    }
  };

  const onToggleVisibility = async (node: FileNode) => {
    if (node.id == null) return;
    try {
      await setVisibility(
        projectId,
        node.id,
        node.visibility === "MANAGERS_ONLY" ? "ALL" : "MANAGERS_ONLY"
      );
      after([loc.folderId]);
    } catch (e) {
      setError(message(e, "Couldn't change who can see that."));
    }
  };

  // ---- selection --------------------------------------------------------------------------------

  const rows: FileNode[] = useMemo(() => {
    if (hits) return hits;
    if (loc.trash) return trashRows;
    return listing?.nodes ?? [];
  }, [hits, loc.trash, trashRows, listing]);

  const newCount = useMemo(() => rows.filter(isNew).length, [rows, isNew]);

  const toggleSelect = (node: FileNode, additive: boolean) => {
    if (node.id == null) return;
    setSelected((prev) => {
      const next = additive ? new Set(prev) : new Set<number>();
      if (prev.has(node.id!) && additive) next.delete(node.id!);
      else next.add(node.id!);
      return next;
    });
  };

  const open = (node: FileNode) => {
    if (node.kind === "FOLDER" && node.id != null) {
      go({ folderId: node.id, module: null, trash: false });
    } else {
      setPreview(node);
    }
  };

  const canUpload = !!listing?.canUpload && !loc.trash && !loc.module;
  const canEdit = !!listing?.canEdit && !loc.trash && !loc.module;
  const canDelete = !!listing?.canDelete && !loc.module;

  // ---- render -----------------------------------------------------------------------------------

  return (
    <div
      className="flex min-h-[28rem] flex-col"
      onDragOver={(e) => {
        if (!canUpload) return;
        e.preventDefault();
        setDragOver(true);
      }}
      onDragLeave={(e) => {
        if (e.currentTarget === e.target) setDragOver(false);
      }}
      onDrop={(e) => {
        if (!canUpload) return;
        e.preventDefault();
        setDragOver(false);
        if (e.dataTransfer.files?.length) startUpload(e.dataTransfer.files);
      }}
    >
      {/* ---- toolbar ---- */}
      <div className="flex flex-wrap items-center gap-2 border-b border-slate-200 pb-3">
        <Breadcrumbs listing={listing} loc={loc} onGo={go} />

        {newCount > 0 && (
          <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-medium text-emerald-700 ring-1 ring-emerald-600/20">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
            {newCount} new since you last looked
          </span>
        )}

        <div className="ml-auto flex items-center gap-2">
          <div className="relative">
            <Search size={15} className="absolute left-2.5 top-2.5 text-slate-400" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search this project"
              className="w-52 rounded-md border border-slate-200 py-1.5 pl-8 pr-7 text-sm outline-none focus:border-brand-accent"
            />
            {query && (
              <button
                type="button"
                onClick={() => setQuery("")}
                aria-label="Clear search"
                className="absolute right-1.5 top-2 rounded p-0.5 text-slate-400 hover:bg-slate-100"
              >
                <X size={14} />
              </button>
            )}
          </div>

          <button
            type="button"
            onClick={() => setView(view === "grid" ? "list" : "grid")}
            aria-label={view === "grid" ? "Switch to list" : "Switch to grid"}
            className="rounded-md border border-slate-200 p-2 text-slate-600 hover:bg-slate-50"
          >
            {view === "grid" ? <List size={15} /> : <Grid2x2 size={15} />}
          </button>

          <button
            type="button"
            onClick={() => go(loc.trash ? ROOT : { folderId: null, module: null, trash: true })}
            className={`inline-flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-sm ${
              loc.trash
                ? "border-brand-accent bg-brand-accent/5 text-brand-accent"
                : "border-slate-200 text-slate-600 hover:bg-slate-50"
            }`}
          >
            <Trash2 size={15} /> Trash
          </button>

          {canUpload && (
            <>
              <button
                type="button"
                onClick={() => setCreating(true)}
                className="inline-flex items-center gap-1.5 rounded-md border border-slate-200 px-3 py-1.5 text-sm text-slate-700 hover:bg-slate-50"
              >
                <FolderPlus size={15} /> New Folder
              </button>
              <button
                type="button"
                onClick={() => fileInput.current?.click()}
                className="inline-flex items-center gap-1.5 rounded-md bg-brand-accent px-3 py-1.5 text-sm font-medium text-white hover:opacity-90"
              >
                <Upload size={15} /> Upload
              </button>
              <input
                ref={fileInput}
                type="file"
                multiple
                hidden
                onChange={(e) => {
                  if (e.target.files?.length) startUpload(e.target.files);
                  e.target.value = "";
                }}
              />
            </>
          )}
        </div>
      </div>

      {/* ---- bulk bar ---- */}
      {selected.size > 0 && (
        <div className="mt-3 flex items-center gap-3 rounded-md bg-brand-accent/5 px-3 py-2 text-sm">
          <span className="font-medium text-brand-accent">{selected.size} selected</span>
          {canDelete && (
            <button
              type="button"
              onClick={() => onDelete(Array.from(selected))}
              className="inline-flex items-center gap-1.5 text-rose-600 hover:underline"
            >
              <Trash2 size={14} /> Delete
            </button>
          )}
          <button
            type="button"
            onClick={() => setSelected(new Set())}
            className="ml-auto text-slate-500 hover:underline"
          >
            Clear
          </button>
        </div>
      )}

      {error && (
        <p className="mt-3 rounded-md bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</p>
      )}

      {/* ---- body ---- */}
      <div className="relative flex-1 pt-4">
        {dragOver && (
          <div className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center rounded-lg border-2 border-dashed border-brand-accent bg-brand-accent/5">
            <p className="text-sm font-medium text-brand-accent">Drop files to upload here</p>
          </div>
        )}

        {loading && rows.length === 0 ? (
          <div className="flex justify-center py-16">
            <Spinner size={24} className="text-brand-accent" />
          </div>
        ) : (
          <>
            {/* Smart folders — the other modules' documents, at the project root only. */}
            {!loc.trash && !loc.module && !hits && (listing?.smartFolders.length ?? 0) > 0 && (
              <section className="mb-6">
                <h3 className="mb-2 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-slate-500">
                  <Layers size={13} /> From other modules
                </h3>
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
                  {listing!.smartFolders.map((f) => (
                    <SmartFolderCard
                      key={f.module}
                      folder={f}
                      onOpen={() => go({ folderId: null, module: f.module, trash: false })}
                    />
                  ))}
                </div>
              </section>
            )}

            {creating && <NewFolderRow onCancel={() => setCreating(false)} onSave={onCreateFolder} />}

            {rows.length === 0 && !creating ? (
              <EmptyState
                trash={loc.trash}
                searching={!!hits}
                canUpload={canUpload}
                onUpload={() => fileInput.current?.click()}
              />
            ) : view === "grid" ? (
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
                {rows.map((node) => (
                  <NodeCard
                    key={nodeKey(node)}
                    node={node}
                    isNew={isNew(node)}
                    selected={node.id != null && selected.has(node.id)}
                    renaming={renaming === node.id}
                    canEdit={canEdit}
                    canDelete={canDelete}
                    inTrash={loc.trash}
                    onOpen={() => open(node)}
                    onSelect={(additive) => toggleSelect(node, additive)}
                    onPrefetch={() =>
                      node.kind === "FOLDER" && node.id != null && cache.prefetch(projectId, node.id)
                    }
                    onRename={(name) => node.id != null && onRename(node.id, name)}
                    onStartRename={() => setRenaming(node.id)}
                    onCancelRename={() => setRenaming(null)}
                    onDropNode={(draggedId) => onDropOnNode(draggedId, node, onDrop)}
                    onDelete={() => node.id != null && onDelete([node.id])}
                    onRestore={() => node.id != null && onRestore(node.id)}
                    onToggleVisibility={() => onToggleVisibility(node)}
                  />
                ))}
              </div>
            ) : (
              <div className="overflow-hidden rounded-lg border border-slate-200">
                {rows.map((node) => (
                  <NodeRow
                    key={nodeKey(node)}
                    node={node}
                    isNew={isNew(node)}
                    selected={node.id != null && selected.has(node.id)}
                    canDelete={canDelete}
                    inTrash={loc.trash}
                    onOpen={() => open(node)}
                    onSelect={(additive) => toggleSelect(node, additive)}
                    onPrefetch={() =>
                      node.kind === "FOLDER" && node.id != null && cache.prefetch(projectId, node.id)
                    }
                    onDelete={() => node.id != null && onDelete([node.id])}
                    onRestore={() => node.id != null && onRestore(node.id)}
                  />
                ))}
              </div>
            )}
          </>
        )}
      </div>

      {uploads.length > 0 && (
        <UploadTray
          jobs={uploads}
          onDismiss={(id) => setUploads((u) => u.filter((j) => j.id !== id))}
          onClearFinished={() => setUploads((u) => u.filter((j) => j.status === "running"))}
        />
      )}

      {preview && <FilePreviewDrawer node={preview} onClose={() => setPreview(null)} />}
    </div>
  );
}

// ---------------------------------------------------------------- pieces

function Breadcrumbs({
  listing,
  loc,
  onGo,
}: {
  listing: FolderListing | null;
  loc: Location;
  onGo: (l: Location) => void;
}) {
  if (loc.trash) {
    return (
      <nav className="flex items-center gap-1 text-sm">
        <button type="button" onClick={() => onGo(ROOT)} className="text-slate-500 hover:underline">
          <Home size={15} />
        </button>
        <ChevronRight size={14} className="text-slate-300" />
        <span className="font-medium text-slate-800">Trash</span>
      </nav>
    );
  }

  const crumbs = listing?.breadcrumbs ?? [{ id: null, name: "Files" }];
  return (
    <nav className="flex flex-wrap items-center gap-1 text-sm">
      {crumbs.map((c, i) => {
        const last = i === crumbs.length - 1;
        return (
          <span key={`${c.id ?? "root"}-${i}`} className="flex items-center gap-1">
            {i > 0 && <ChevronRight size={14} className="text-slate-300" />}
            {last ? (
              <span className="font-medium text-slate-800">{c.name}</span>
            ) : (
              <button
                type="button"
                onClick={() => onGo({ folderId: c.id, module: null, trash: false })}
                className="text-slate-500 hover:text-brand-accent hover:underline"
              >
                {i === 0 ? <Home size={15} /> : c.name}
              </button>
            )}
          </span>
        );
      })}
    </nav>
  );
}

function NewFolderRow({
  onSave,
  onCancel,
}: {
  onSave: (name: string) => void;
  onCancel: () => void;
}) {
  const [name, setName] = useState("");
  return (
    <div className="mb-3 flex items-center gap-2 rounded-md border border-brand-accent/40 bg-brand-accent/5 px-3 py-2">
      <FolderPlus size={16} className="text-brand-accent" />
      <input
        autoFocus
        value={name}
        onChange={(e) => setName(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") onSave(name);
          if (e.key === "Escape") onCancel();
        }}
        placeholder="Folder name"
        className="flex-1 bg-transparent text-sm outline-none"
      />
      <button
        type="button"
        onClick={() => onSave(name)}
        className="rounded bg-brand-accent px-2.5 py-1 text-xs font-medium text-white"
      >
        Create
      </button>
      <button type="button" onClick={onCancel} className="text-xs text-slate-500 hover:underline">
        Cancel
      </button>
    </div>
  );
}

function EmptyState({
  trash,
  searching,
  canUpload,
  onUpload,
}: {
  trash: boolean;
  searching: boolean;
  canUpload: boolean;
  onUpload: () => void;
}) {
  return (
    <div className="flex flex-col items-center justify-center rounded-lg border border-dashed border-slate-200 py-16 text-center">
      <p className="text-sm text-slate-500">
        {searching
          ? "Nothing matched that."
          : trash
            ? "Nothing in the trash."
            : "This folder is empty."}
      </p>
      {!trash && !searching && canUpload && (
        <button
          type="button"
          onClick={onUpload}
          className="mt-3 inline-flex items-center gap-1.5 text-sm text-brand-accent hover:underline"
        >
          <Upload size={14} /> Upload a file, or drag one in
        </button>
      )}
    </div>
  );
}

// ---------------------------------------------------------------- helpers

/** A module's file has no node id, so it needs a key of its own. */
function nodeKey(node: FileNode) {
  return node.id != null ? `n${node.id}` : `f${node.fileId}`;
}

/** Dropping onto a folder files it there; dropping onto a file does nothing. */
function onDropOnNode(
  draggedId: number,
  target: FileNode,
  move: (nodeId: number, targetId: number | null) => void
) {
  if (target.kind !== "FOLDER" || target.id == null) return;
  move(draggedId, target.id);
}

function message(e: unknown, fallback: string) {
  return e instanceof Error && e.message ? e.message : fallback;
}

/** `?files=<folderId>`, `?files=m:VYAPAR` or `?files=trash` — the same `?open` idea used elsewhere. */
function readLocation(): Location {
  if (typeof window === "undefined") return ROOT;
  const raw = new URLSearchParams(window.location.search).get("files");
  if (!raw) return ROOT;
  if (raw === "trash") return { folderId: null, module: null, trash: true };
  if (raw.startsWith("m:")) {
    return { folderId: null, module: raw.slice(2) as SourceModule, trash: false };
  }
  const id = Number(raw);
  return Number.isFinite(id) && id > 0 ? { folderId: id, module: null, trash: false } : ROOT;
}

function writeLocation(loc: Location) {
  if (typeof window === "undefined") return;
  const params = new URLSearchParams(window.location.search);
  const value = loc.trash
    ? "trash"
    : loc.module
      ? `m:${loc.module}`
      : loc.folderId != null
        ? String(loc.folderId)
        : null;
  if (value) params.set("files", value);
  else params.delete("files");

  const search = params.toString();
  // pushState, so the browser's back button walks back up the folder tree. History, not routing:
  // a router navigation would remount the whole project workspace and lose the other tabs' state.
  window.history.pushState(null, "", `${window.location.pathname}${search ? `?${search}` : ""}`);
}
