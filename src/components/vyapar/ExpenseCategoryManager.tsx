"use client";

import { useState } from "react";
import { Check, Pencil, Plus, Trash2, X } from "lucide-react";
import { Drawer } from "@/components/Drawer";
import * as vyapar from "@/lib/vyaparApi";
import type { ExpenseCategory } from "@/lib/vyaparApi";

/**
 * Add, rename and delete expense categories (Vyapar-28). Renaming moves the expenses filed under
 * the old name; a category still in use can't be deleted — the server says how many use it.
 */
export function ExpenseCategoryManager({
  categories,
  onChanged,
  onClose,
}: {
  categories: ExpenseCategory[];
  onChanged: () => void;
  onClose: () => void;
}) {
  const [newName, setNewName] = useState("");
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editName, setEditName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function run(action: () => Promise<unknown>) {
    setBusy(true);
    setError("");
    try {
      await action();
      onChanged();
      return true;
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't save the category.");
      return false;
    } finally {
      setBusy(false);
    }
  }

  async function add() {
    if (!newName.trim()) return;
    if (await run(() => vyapar.createExpenseCategory(newName))) setNewName("");
  }

  async function rename(id: number) {
    if (!editName.trim()) return;
    if (await run(() => vyapar.renameExpenseCategory(id, editName))) setEditingId(null);
  }

  return (
    <Drawer title="Expense Categories" onClose={onClose} guardOnClose={false} width="max-w-lg">
      <div className="space-y-4">
        {error && <div className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-600">{error}</div>}

        <div className="flex gap-2">
          <input
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && add()}
            placeholder="New category, e.g. Scaffolding Rent"
            className="input flex-1"
            autoFocus
          />
          <button
            type="button"
            onClick={add}
            disabled={busy || !newName.trim()}
            className="flex items-center gap-1 rounded-lg bg-brand-accent px-3 py-2 text-sm font-medium text-white transition-opacity duration-150 hover:opacity-90 disabled:opacity-40"
          >
            <Plus size={14} /> Add
          </button>
        </div>

        <ul className="divide-y divide-gray-100 rounded-xl border border-gray-200">
          {categories.map((c) => (
            <li key={c.id} className="flex items-center gap-2 px-3 py-2">
              {editingId === c.id ? (
                <>
                  <input
                    value={editName}
                    onChange={(e) => setEditName(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") rename(c.id);
                      if (e.key === "Escape") setEditingId(null);
                    }}
                    className="input flex-1"
                    autoFocus
                  />
                  <button
                    type="button"
                    onClick={() => rename(c.id)}
                    disabled={busy}
                    aria-label="Save name"
                    className="rounded-md p-1.5 text-emerald-600 transition-colors duration-150 hover:bg-emerald-50"
                  >
                    <Check size={15} />
                  </button>
                  <button
                    type="button"
                    onClick={() => setEditingId(null)}
                    aria-label="Cancel rename"
                    className="rounded-md p-1.5 text-gray-400 transition-colors duration-150 hover:bg-gray-100"
                  >
                    <X size={15} />
                  </button>
                </>
              ) : (
                <>
                  <span className="min-w-0 flex-1 truncate text-sm text-gray-800">{c.name}</span>
                  <span className="text-xs text-gray-400">
                    {c.expenseCount} expense{c.expenseCount === 1 ? "" : "s"}
                  </span>
                  <button
                    type="button"
                    onClick={() => {
                      setEditingId(c.id);
                      setEditName(c.name);
                    }}
                    aria-label={`Rename ${c.name}`}
                    title="Rename"
                    className="rounded-md p-1.5 text-gray-400 transition-colors duration-150 hover:bg-cyan-50 hover:text-brand-accent"
                  >
                    <Pencil size={14} />
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      if (confirm(`Delete the category "${c.name}"?`)) run(() => vyapar.deleteExpenseCategory(c.id));
                    }}
                    disabled={busy}
                    aria-label={`Delete ${c.name}`}
                    title={c.expenseCount > 0 ? "In use — rename it instead" : "Delete"}
                    className="rounded-md p-1.5 text-gray-400 transition-colors duration-150 hover:bg-rose-50 hover:text-rose-600"
                  >
                    <Trash2 size={14} />
                  </button>
                </>
              )}
            </li>
          ))}
          {categories.length === 0 && <li className="px-3 py-8 text-center text-sm text-gray-400">No categories yet.</li>}
        </ul>
      </div>
    </Drawer>
  );
}
