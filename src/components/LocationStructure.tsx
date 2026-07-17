"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import * as api from "@/lib/api";
import type { ProjectLocationResponse } from "@/lib/api";
import {
  Layers3,
  Plus,
  ChevronDown,
  ChevronRight,
  CornerDownRight,
  MoreVertical,
  Pencil,
  Trash2,
  X,
  Check,
  AlertTriangle,
} from "lucide-react";

interface TreeNode extends ProjectLocationResponse {
  children: TreeNode[];
}

function buildTree(flat: ProjectLocationResponse[]): TreeNode[] {
  const map = new Map<number, TreeNode>();
  flat.forEach((l) => map.set(l.id, { ...l, children: [] }));
  const roots: TreeNode[] = [];
  map.forEach((node) => {
    if (node.parentId != null && map.has(node.parentId)) map.get(node.parentId)!.children.push(node);
    else roots.push(node);
  });
  return roots;
}

export function LocationStructure({ projectId }: { projectId: number }) {
  const [locations, setLocations] = useState<ProjectLocationResponse[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [addingRoot, setAddingRoot] = useState(false);
  const [expanded, setExpanded] = useState<Set<number>>(new Set());

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await api.getProjectLocations(projectId);
      setLocations(data);
      setExpanded((prev) => new Set([...prev, ...data.map((l) => l.id)]));
    } catch (err) {
      setError(err instanceof api.ApiError ? err.message : "Couldn't load the location structure. Is the backend running?");
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  useEffect(() => {
    load();
  }, [load]);

  const tree = useMemo(() => buildTree(locations), [locations]);

  async function addLocation(name: string, parentId?: number) {
    const created = await api.createProjectLocation(projectId, { name, parentId });
    if (parentId) setExpanded((prev) => new Set(prev).add(parentId));
    setExpanded((prev) => new Set(prev).add(created.id));
    await load();
  }
  async function rename(id: number, name: string) {
    await api.updateProjectLocation(projectId, id, { name });
    await load();
  }
  async function remove(id: number) {
    await api.deleteProjectLocation(projectId, id);
    await load();
  }
  function toggle(id: number) {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  return (
    <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
      <div className="flex items-center justify-between border-b border-slate-100 bg-slate-50/70 px-5 py-3">
        <div className="flex items-center gap-2 text-sm font-semibold text-slate-700">
          <Layers3 size={16} className="text-brand-accent" />
          Location structure
        </div>
        <button
          onClick={() => setAddingRoot(true)}
          className="flex items-center gap-1.5 rounded-lg bg-brand-accent px-3 py-1.5 text-xs font-semibold text-white shadow-sm transition hover:bg-brand-accent-strong"
        >
          <Plus size={14} /> Location
        </button>
      </div>

      <div className="p-2">
        {error ? (
          <div className="flex flex-col items-center gap-2 py-12 text-center">
            <AlertTriangle size={22} className="text-rose-500" />
            <p className="text-sm text-rose-600">{error}</p>
            <button onClick={load} className="text-xs font-medium text-brand-accent hover:underline">Retry</button>
          </div>
        ) : loading ? (
          <div className="space-y-2 p-3">
            {[0, 1, 2].map((i) => <div key={i} className="h-10 animate-pulse rounded-lg bg-slate-100" />)}
          </div>
        ) : (
          <>
            {tree.length === 0 && !addingRoot && (
              <div className="flex flex-col items-center gap-2 py-12 text-center">
                <div className="flex h-12 w-12 items-center justify-center rounded-full bg-cyan-50 text-brand-accent">
                  <Layers3 size={22} />
                </div>
                <p className="text-sm font-medium text-slate-600">No locations yet</p>
                <p className="max-w-xs text-xs text-slate-400">Break the site into blocks, floors and units to tag tasks and attendance by location.</p>
                <button onClick={() => setAddingRoot(true)} className="mt-1 flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-600 hover:border-brand-accent hover:text-brand-accent">
                  <Plus size={13} /> Add first location
                </button>
              </div>
            )}

            {tree.map((node) => (
              <LocationNode key={node.id} node={node} depth={0} expanded={expanded} onToggle={toggle} onAdd={addLocation} onRename={rename} onRemove={remove} />
            ))}

            {addingRoot && (
              <InlineAdd
                placeholder="New location name"
                onCancel={() => setAddingRoot(false)}
                onSubmit={async (name) => {
                  await addLocation(name);
                  setAddingRoot(false);
                }}
              />
            )}
          </>
        )}
      </div>
    </div>
  );
}

function LocationNode({
  node,
  depth,
  expanded,
  onToggle,
  onAdd,
  onRename,
  onRemove,
}: {
  node: TreeNode;
  depth: number;
  expanded: Set<number>;
  onToggle: (id: number) => void;
  onAdd: (name: string, parentId?: number) => Promise<void>;
  onRename: (id: number, name: string) => Promise<void>;
  onRemove: (id: number) => Promise<void>;
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [editing, setEditing] = useState(false);
  const [addingChild, setAddingChild] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const isOpen = expanded.has(node.id);
  const hasChildren = node.children.length > 0;

  useEffect(() => {
    if (!menuOpen) return;
    const onDoc = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenuOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [menuOpen]);

  return (
    <div>
      <div className="group flex items-center gap-1 rounded-lg px-2 py-2 transition hover:bg-slate-50" style={{ paddingLeft: depth * 24 + 8 }}>
        {hasChildren ? (
          <button onClick={() => onToggle(node.id)} className="flex h-5 w-5 items-center justify-center rounded text-slate-400 hover:bg-slate-200 hover:text-slate-600">
            {isOpen ? <ChevronDown size={15} /> : <ChevronRight size={15} />}
          </button>
        ) : depth > 0 ? (
          <span className="flex h-5 w-5 items-center justify-center text-slate-300"><CornerDownRight size={14} /></span>
        ) : (
          <span className="h-5 w-5" />
        )}

        {editing ? (
          <InlineEdit
            initial={node.name}
            onCancel={() => setEditing(false)}
            onSubmit={async (name) => {
              await onRename(node.id, name);
              setEditing(false);
            }}
          />
        ) : (
          <>
            <span className={`rounded-md px-2 py-0.5 text-sm ${depth === 0 ? "bg-slate-100 font-semibold text-slate-800" : "font-medium text-slate-700"}`}>
              {node.name}
            </span>
            <button onClick={() => setAddingChild(true)} title="Add sub location" className="flex h-6 w-6 items-center justify-center rounded-full text-slate-400 opacity-0 transition group-hover:opacity-100 hover:bg-brand-accent/10 hover:text-brand-accent">
              <Plus size={15} />
            </button>

            <div className="relative ml-auto" ref={menuRef}>
              <button onClick={() => setMenuOpen((o) => !o)} className="flex h-7 w-7 items-center justify-center rounded-md text-slate-400 opacity-0 transition group-hover:opacity-100 hover:bg-slate-200 hover:text-slate-600">
                <MoreVertical size={16} />
              </button>
              {menuOpen && (
                <div className="absolute right-0 top-8 z-10 w-40 overflow-hidden rounded-lg border border-slate-200 bg-white py-1 shadow-lg">
                  <button onClick={() => { setMenuOpen(false); setAddingChild(true); }} className="flex w-full items-center gap-2 px-3 py-2 text-sm text-slate-600 hover:bg-slate-50">
                    <Plus size={14} /> Add sub location
                  </button>
                  <button onClick={() => { setMenuOpen(false); setEditing(true); }} className="flex w-full items-center gap-2 px-3 py-2 text-sm text-slate-600 hover:bg-slate-50">
                    <Pencil size={14} /> Rename
                  </button>
                  <button
                    onClick={() => {
                      setMenuOpen(false);
                      if (confirm(`Delete "${node.name}"${hasChildren ? " and its sub-locations" : ""}?`)) onRemove(node.id);
                    }}
                    className="flex w-full items-center gap-2 px-3 py-2 text-sm text-rose-600 hover:bg-rose-50"
                  >
                    <Trash2 size={14} /> Delete
                  </button>
                </div>
              )}
            </div>
          </>
        )}
      </div>

      {addingChild && (
        <InlineAdd
          placeholder={`Sub location of ${node.name}`}
          indent={(depth + 1) * 24 + 8}
          onCancel={() => setAddingChild(false)}
          onSubmit={async (name) => {
            await onAdd(name, node.id);
            setAddingChild(false);
          }}
        />
      )}

      {isOpen && node.children.map((child) => (
        <LocationNode key={child.id} node={child} depth={depth + 1} expanded={expanded} onToggle={onToggle} onAdd={onAdd} onRename={onRename} onRemove={onRemove} />
      ))}
    </div>
  );
}

function InlineAdd({ placeholder, indent = 8, onSubmit, onCancel }: { placeholder: string; indent?: number; onSubmit: (name: string) => Promise<void>; onCancel: () => void }) {
  const [name, setName] = useState("");
  const [saving, setSaving] = useState(false);
  async function submit() {
    if (!name.trim() || saving) return;
    setSaving(true);
    try {
      await onSubmit(name.trim());
    } catch {
      setSaving(false);
    }
  }
  return (
    <div className="flex items-center gap-2 py-1.5" style={{ paddingLeft: indent + 28 }}>
      <input
        autoFocus
        value={name}
        disabled={saving}
        onChange={(e) => setName(e.target.value)}
        onKeyDown={(e) => { if (e.key === "Enter") submit(); if (e.key === "Escape") onCancel(); }}
        placeholder={placeholder}
        className="w-64 rounded-lg border border-slate-200 px-2.5 py-1.5 text-sm outline-none focus:border-cyan-500 focus:ring-2 focus:ring-cyan-500/15"
      />
      <button onClick={submit} disabled={saving} className="flex h-7 w-7 items-center justify-center rounded-md bg-brand-accent text-white hover:bg-brand-accent-strong disabled:opacity-60">
        <Check size={15} />
      </button>
      <button onClick={onCancel} className="flex h-7 w-7 items-center justify-center rounded-md text-slate-400 hover:bg-slate-100 hover:text-slate-600">
        <X size={15} />
      </button>
    </div>
  );
}

function InlineEdit({ initial, onSubmit, onCancel }: { initial: string; onSubmit: (name: string) => Promise<void>; onCancel: () => void }) {
  const [name, setName] = useState(initial);
  const [saving, setSaving] = useState(false);
  async function submit() {
    if (!name.trim() || saving) return;
    setSaving(true);
    try {
      await onSubmit(name.trim());
    } catch {
      setSaving(false);
    }
  }
  return (
    <div className="flex items-center gap-2">
      <input
        autoFocus
        value={name}
        disabled={saving}
        onChange={(e) => setName(e.target.value)}
        onKeyDown={(e) => { if (e.key === "Enter") submit(); if (e.key === "Escape") onCancel(); }}
        className="w-56 rounded-lg border border-slate-200 px-2.5 py-1 text-sm outline-none focus:border-cyan-500 focus:ring-2 focus:ring-cyan-500/15"
      />
      <button onClick={submit} disabled={saving} className="flex h-7 w-7 items-center justify-center rounded-md bg-brand-accent text-white hover:bg-brand-accent-strong disabled:opacity-60">
        <Check size={15} />
      </button>
      <button onClick={onCancel} className="flex h-7 w-7 items-center justify-center rounded-md text-slate-400 hover:bg-slate-100 hover:text-slate-600">
        <X size={15} />
      </button>
    </div>
  );
}
