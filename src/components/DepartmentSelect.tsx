"use client";

import { useState } from "react";
import { Check, X } from "lucide-react";
import { Select } from "@/components/Select";
import { useDepartments } from "@/lib/useDepartments";
import { createDepartment } from "@/lib/departmentsApi";

/**
 * Department picker for the member forms. The list is the shared department master, and a
 * department that isn't there yet can be made in place ("+ Add department") instead of leaving the
 * form for Settings — it is created in the master, so every other picker sees it too.
 */
export function DepartmentSelect({
  value,
  onChange,
}: {
  value: number | "";
  onChange: (id: number | "") => void;
}) {
  const { departments, reload } = useDepartments();
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  async function add() {
    const clean = name.trim();
    if (!clean) return;
    // Picking an existing one beats creating a near-duplicate that differs only in case.
    const existing = departments.find((d) => d.name.trim().toLowerCase() === clean.toLowerCase());
    if (existing) {
      onChange(existing.id);
      close();
      return;
    }
    setSaving(true);
    setError("");
    try {
      const created = await createDepartment({ name: clean, isActive: true });
      await reload();
      onChange(created.id);
      close();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't add the department.");
    } finally {
      setSaving(false);
    }
  }

  function close() {
    setAdding(false);
    setName("");
    setError("");
  }

  if (adding) {
    return (
      <div>
        <div className="flex items-center gap-2">
          <input
            autoFocus
            className="input flex-1"
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                add();
              }
              if (e.key === "Escape") {
                e.preventDefault();
                e.stopPropagation();
                close();
              }
            }}
            placeholder="New department, e.g. Landscaping"
            disabled={saving}
          />
          <button
            type="button"
            onClick={add}
            disabled={saving || !name.trim()}
            aria-label="Add department"
            className="rounded-lg bg-brand-accent p-2 text-white transition-opacity disabled:opacity-40"
          >
            <Check size={16} />
          </button>
          <button
            type="button"
            onClick={close}
            aria-label="Cancel"
            className="rounded-lg border border-gray-200 p-2 text-gray-500 hover:bg-gray-50"
          >
            <X size={16} />
          </button>
        </div>
        {error && <p className="mt-1 text-xs text-rose-600">{error}</p>}
      </div>
    );
  }

  return (
    <Select
      value={value === "" ? "" : String(value)}
      onChange={(v) => onChange(v === "" ? "" : Number(v))}
      placeholder="No department"
      options={[
        { value: "", label: "No department" },
        ...departments.map((d) => ({ value: String(d.id), label: d.name })),
      ]}
      onCreate={() => setAdding(true)}
      createLabel="Add department"
    />
  );
}
