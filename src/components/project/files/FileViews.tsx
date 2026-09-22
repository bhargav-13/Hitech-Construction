"use client";

import { useEffect, useRef, useState } from "react";
import {
  Eye,
  EyeOff,
  Layers,
  MoreVertical,
  Pencil,
  RotateCcw,
  Trash2,
} from "lucide-react";
import { formatBytes, type FileNode, type SmartFolder } from "@/lib/filesApi";
import { formatDateIST } from "@/lib/datetime";
import { NodeIcon, NodeThumb } from "./FileIcon";

/**
 * How one item looks, as a card and as a row.
 *
 * <p>The behaviour worth pointing at is {@code onPrefetch}: hovering a folder starts loading its
 * contents. A pointer rests on a card for roughly a third of a second before the button goes down,
 * which is longer than the request takes, so the folder is usually already in hand when the click
 * arrives and opening it costs nothing.
 */

interface CommonProps {
  node: FileNode;
  /** Arrived since this viewer last opened the project's files. */
  isNew: boolean;
  selected: boolean;
  inTrash: boolean;
  onOpen: () => void;
  onSelect: (additive: boolean) => void;
  onPrefetch: () => void;
  onDelete: () => void;
  onRestore: () => void;
}

export function NodeCard({
  node,
  isNew,
  selected,
  renaming,
  canEdit,
  canDelete,
  inTrash,
  onOpen,
  onSelect,
  onPrefetch,
  onRename,
  onStartRename,
  onCancelRename,
  onDropNode,
  onDelete,
  onRestore,
  onToggleVisibility,
}: CommonProps & {
  renaming: boolean;
  canEdit: boolean;
  canDelete: boolean;
  onRename: (name: string) => void;
  onStartRename: () => void;
  onCancelRename: () => void;
  onDropNode: (draggedId: number) => void;
  onToggleVisibility: () => void;
}) {
  const [dropTarget, setDropTarget] = useState(false);
  const isFolder = node.kind === "FOLDER";

  return (
    <div
      draggable={node.id != null && canEdit}
      onDragStart={(e) => {
        if (node.id == null) return;
        e.dataTransfer.setData("application/x-file-node", String(node.id));
        e.dataTransfer.effectAllowed = "move";
      }}
      onDragOver={(e) => {
        if (!isFolder || !canEdit) return;
        // Only intercept a node being dragged — a file dragged from the desktop must fall through
        // to the page-level handler, which uploads it.
        if (!e.dataTransfer.types.includes("application/x-file-node")) return;
        e.preventDefault();
        e.stopPropagation();
        setDropTarget(true);
      }}
      onDragLeave={() => setDropTarget(false)}
      onDrop={(e) => {
        const dragged = e.dataTransfer.getData("application/x-file-node");
        if (!dragged) return;
        e.preventDefault();
        e.stopPropagation();
        setDropTarget(false);
        onDropNode(Number(dragged));
      }}
      onMouseEnter={onPrefetch}
      onFocus={onPrefetch}
      onClick={(e) => {
        if (e.ctrlKey || e.metaKey || e.shiftKey) {
          e.preventDefault();
          onSelect(true);
        }
      }}
      onDoubleClick={onOpen}
      className={`group relative overflow-hidden rounded-lg border bg-white transition ${
        dropTarget
          ? "border-brand-accent ring-2 ring-brand-accent/30"
          : selected
            ? "border-brand-accent ring-1 ring-brand-accent/30"
            : isNew
              ? "border-emerald-300 hover:shadow-sm"
              : "border-slate-200 hover:border-slate-300 hover:shadow-sm"
      }`}
    >
      <button
        type="button"
        onClick={onOpen}
        className="block h-32 w-full cursor-pointer text-left"
        aria-label={`Open ${node.name}`}
      >
        {isFolder ? (
          <div className="flex h-full w-full items-center justify-center bg-slate-50">
            <NodeIcon node={node} size={40} />
          </div>
        ) : (
          <NodeThumb node={node} />
        )}
      </button>

      <div className="flex items-start gap-2 border-t border-slate-100 px-3 py-2">
        <NodeIcon node={node} size={16} />
        <div className="min-w-0 flex-1">
          {renaming ? (
            <RenameInput initial={node.name} onSave={onRename} onCancel={onCancelRename} />
          ) : (
            <p className="truncate text-sm text-slate-800" title={node.name}>
              {node.name}
            </p>
          )}
          <p className="truncate text-xs text-slate-400">
            {isFolder
              ? `${node.childCount ?? 0} item${node.childCount === 1 ? "" : "s"}`
              : [formatBytes(node.sizeBytes), node.sourceParty, node.createdAt ? formatDateIST(node.createdAt) : null]
                  .filter(Boolean)
                  .join(" · ")}
          </p>
        </div>

        <RowMenu
          items={[
            inTrash && { label: "Restore", icon: <RotateCcw size={14} />, onClick: onRestore },
            !inTrash &&
              canEdit &&
              node.id != null && {
                label: "Rename",
                icon: <Pencil size={14} />,
                onClick: onStartRename,
              },
            !inTrash &&
              canEdit &&
              isFolder && {
                label:
                  node.visibility === "MANAGERS_ONLY" ? "Make visible to all" : "Managers only",
                icon:
                  node.visibility === "MANAGERS_ONLY" ? <Eye size={14} /> : <EyeOff size={14} />,
                onClick: onToggleVisibility,
              },
            !inTrash &&
              canDelete &&
              node.id != null && {
                label: "Delete",
                icon: <Trash2 size={14} />,
                onClick: onDelete,
                danger: true,
              },
          ]}
        />
      </div>

      {node.sourceModule && (
        <span className="absolute left-2 top-2 rounded bg-slate-900/70 px-1.5 py-0.5 text-[10px] font-medium text-white">
          {node.sourceLabel ?? node.sourceModule}
        </span>
      )}

      {/* Top-right, opposite the source chip, so the two never sit on top of each other. */}
      {isNew && (
        <span className="absolute right-2 top-2 rounded bg-emerald-500 px-1.5 py-0.5 text-[10px] font-semibold tracking-wide text-white uppercase">
          New
        </span>
      )}
    </div>
  );
}

export function NodeRow({
  node,
  isNew,
  selected,
  canDelete,
  inTrash,
  onOpen,
  onSelect,
  onPrefetch,
  onDelete,
  onRestore,
}: CommonProps & { canDelete: boolean }) {
  return (
    <div
      onMouseEnter={onPrefetch}
      onClick={(e) => {
        if (e.ctrlKey || e.metaKey || e.shiftKey) onSelect(true);
        else onOpen();
      }}
      className={`flex cursor-pointer items-center gap-3 border-b border-slate-100 px-3 py-2 text-sm last:border-0 ${
        selected ? "bg-brand-accent/5" : "hover:bg-slate-50"
      }`}
    >
      <NodeIcon node={node} size={16} />
      <span className="min-w-0 flex-1 truncate text-slate-800">{node.name}</span>
      {isNew && (
        <span className="rounded bg-emerald-50 px-1.5 py-0.5 text-[10px] font-semibold tracking-wide text-emerald-700 uppercase ring-1 ring-emerald-600/20">
          New
        </span>
      )}
      {node.sourceLabel && (
        <span className="hidden truncate text-xs text-slate-400 sm:block">{node.sourceLabel}</span>
      )}
      <span className="w-20 text-right text-xs text-slate-400">
        {node.kind === "FOLDER" ? `${node.childCount ?? 0} items` : formatBytes(node.sizeBytes)}
      </span>
      <span className="hidden w-24 text-right text-xs text-slate-400 sm:block">
        {node.createdAt ? formatDateIST(node.createdAt) : ""}
      </span>
      <RowMenu
        items={[
          inTrash && { label: "Restore", icon: <RotateCcw size={14} />, onClick: onRestore },
          !inTrash &&
            canDelete &&
            node.id != null && {
              label: "Delete",
              icon: <Trash2 size={14} />,
              onClick: onDelete,
              danger: true,
            },
        ]}
      />
    </div>
  );
}

/**
 * A module's documents, shown as a folder.
 *
 * <p>It is a query, not a folder — which is why it has no menu. Renaming or deleting it would mean
 * nothing, because there is no row behind it to rename or delete; the files inside belong to the
 * bill or the task that carries them.
 */
export function SmartFolderCard({
  folder,
  onOpen,
}: {
  folder: SmartFolder;
  onOpen: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onOpen}
      className="flex items-center gap-3 rounded-lg border border-slate-200 bg-slate-50/60 px-3 py-3 text-left transition hover:border-slate-300 hover:bg-white hover:shadow-sm"
    >
      <span className="rounded-md bg-white p-2 ring-1 ring-slate-200">
        <Layers size={18} className="text-brand-accent" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-medium text-slate-800">{folder.name}</span>
        <span className="block text-xs text-slate-400">
          {folder.count} file{folder.count === 1 ? "" : "s"} · {formatBytes(folder.sizeBytes)}
        </span>
      </span>
    </button>
  );
}

// ---------------------------------------------------------------- bits

function RenameInput({
  initial,
  onSave,
  onCancel,
}: {
  initial: string;
  onSave: (name: string) => void;
  onCancel: () => void;
}) {
  const [value, setValue] = useState(initial);
  return (
    <input
      autoFocus
      value={value}
      onChange={(e) => setValue(e.target.value)}
      onClick={(e) => e.stopPropagation()}
      onBlur={() => onSave(value)}
      onKeyDown={(e) => {
        if (e.key === "Enter") onSave(value);
        if (e.key === "Escape") onCancel();
      }}
      className="w-full rounded border border-brand-accent px-1 py-0.5 text-sm outline-none"
    />
  );
}

type MenuItem =
  | false
  | undefined
  | null
  | { label: string; icon: React.ReactNode; onClick: () => void; danger?: boolean };

function RowMenu({ items }: { items: MenuItem[] }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const actions = items.filter(Boolean) as Exclude<MenuItem, false | null | undefined>[];

  useEffect(() => {
    if (!open) return;
    const onAway = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onAway);
    return () => document.removeEventListener("mousedown", onAway);
  }, [open]);

  if (actions.length === 0) return null;

  return (
    <div ref={ref} className="relative" onClick={(e) => e.stopPropagation()}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-label="More actions"
        className="rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
      >
        <MoreVertical size={15} />
      </button>
      {open && (
        <div className="absolute right-0 z-20 mt-1 w-44 overflow-hidden rounded-md border border-slate-200 bg-white py-1 shadow-lg">
          {actions.map((a) => (
            <button
              key={a.label}
              type="button"
              onClick={() => {
                setOpen(false);
                a.onClick();
              }}
              className={`flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm hover:bg-slate-50 ${
                a.danger ? "text-rose-600" : "text-slate-700"
              }`}
            >
              {a.icon}
              {a.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
