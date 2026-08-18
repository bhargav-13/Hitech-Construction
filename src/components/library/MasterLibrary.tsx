"use client";

import { useMemo, useState } from "react";
import { Pencil, RotateCcw, Search, Trash2 } from "lucide-react";
import { Drawer, DrawerField } from "@/components/Drawer";
import { RowMenu, RowMenuDivider, RowMenuItem } from "@/components/RowMenu";
import { Select } from "@/components/Select";
import { SortTh } from "@/components/vyapar/SortTh";
import { Spinner } from "@/components/Spinner";
import { formatRupee } from "@/lib/projectHelpers";
import { useTableSort } from "@/lib/useTableSort";
import { useMasterLibrary } from "@/lib/useMasterLibrary";
import { isNumericField, type MasterField, type MasterLibrarySpec, type MasterRow } from "@/lib/masterLibraries";

/**
 * One screen for every schema-driven master library. The spec (see lib/masterLibraries.ts) decides
 * the columns, the form fields and the seed rows; everything here — search, sort, add/edit drawer,
 * delete — is shared, so a new library is a spec entry rather than another page.
 */
export function MasterLibrary({ spec }: { spec: MasterLibrarySpec }) {
  const { rows, ready, add, update, remove, reset } = useMasterLibrary(spec);
  const [search, setSearch] = useState("");
  const [drawer, setDrawer] = useState<{ mode: "create" } | { mode: "edit"; row: MasterRow } | null>(null);

  /** Columns shown in the table — `formOnly` fields (long text) stay in the drawer. */
  const columns = useMemo(() => spec.fields.filter((f) => !f.formOnly), [spec]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter((r) => spec.fields.some((f) => String(r[f.key] ?? "").toLowerCase().includes(q)));
  }, [rows, search, spec]);

  // Numeric columns sort numerically; the accessor hands useTableSort the raw value either way.
  const accessors = useMemo(
    () =>
      Object.fromEntries(
        columns.map((f) => [f.key, (r: MasterRow) => (isNumericField(f) ? Number(r[f.key] ?? 0) : String(r[f.key] ?? ""))]),
      ),
    [columns],
  );
  const { sorted, sortKey, sortDir, toggle } = useTableSort(filtered, accessors, { key: columns[0]?.key });

  function save(values: Omit<MasterRow, "id">) {
    if (drawer?.mode === "edit") update(drawer.row.id, values);
    else add(values);
    setDrawer(null);
  }

  return (
    <div className="animate-fade-in space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <p className="max-w-xl text-sm text-gray-500">{spec.blurb}</p>
        <button
          onClick={() => setDrawer({ mode: "create" })}
          className="shrink-0 rounded-lg bg-brand-accent px-4 py-2 text-sm font-medium text-white transition-all duration-150 hover:opacity-90 active:scale-95"
        >
          + Add {spec.noun}
        </button>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs text-gray-400">
          {filtered.length} of {rows.length} {rows.length === 1 ? "entry" : "entries"}
        </p>
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center gap-2 rounded-lg border border-gray-200 px-3 py-1.5 transition-colors duration-150 focus-within:border-cyan-400">
            <Search size={14} className="text-gray-400" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={`Search ${spec.noun.toLowerCase()}…`}
              className="w-52 bg-transparent text-sm outline-none"
            />
          </div>
          <button
            onClick={() => {
              if (confirm(`Restore the default ${spec.label} entries? Your changes to this library will be lost.`)) reset();
            }}
            title="Restore defaults"
            className="flex items-center gap-1.5 rounded-lg border border-gray-200 px-3 py-1.5 text-xs text-gray-500 transition-colors duration-150 hover:border-gray-300 hover:text-gray-700"
          >
            <RotateCcw size={13} /> Defaults
          </button>
        </div>
      </div>

      {!ready ? (
        <div className="flex items-center justify-center gap-2 rounded-xl border border-dashed border-gray-300 bg-white py-16 text-sm text-gray-400">
          <Spinner size={16} className="text-brand-accent" />
          Loading…
        </div>
      ) : sorted.length === 0 ? (
        <div className="rounded-xl border border-dashed border-gray-300 bg-white py-12 text-center text-sm text-gray-400">
          {rows.length === 0 ? `No ${spec.noun.toLowerCase()} entries yet.` : "No entries match."}
        </div>
      ) : (
        <div className="w-full min-w-0 overflow-x-auto rounded-xl border border-gray-200 bg-white">
          <table className="w-full min-w-[640px] border-collapse text-sm">
            <thead>
              <tr className="border-b border-gray-100 bg-gray-50 text-left text-xs font-medium text-gray-500">
                {columns.map((f) => (
                  <SortTh
                    key={f.key}
                    label={f.label}
                    sortKey={f.key}
                    activeKey={sortKey}
                    dir={sortDir}
                    onSort={toggle}
                    align={isNumericField(f) ? "right" : "left"}
                  />
                ))}
                <th className="w-10 px-2 py-2" />
              </tr>
            </thead>
            <tbody>
              {sorted.map((row) => (
                <tr
                  key={row.id}
                  className="border-b border-gray-50 transition-colors duration-150 last:border-b-0 even:bg-gray-50/50 hover:bg-cyan-50/40"
                >
                  {columns.map((f, i) => (
                    <td
                      key={f.key}
                      className={`px-4 py-2.5 ${isNumericField(f) ? "text-right tabular-nums" : ""} ${
                        i === 0 ? "font-medium text-gray-800" : "text-gray-600"
                      }`}
                    >
                      {renderValue(f, row[f.key])}
                    </td>
                  ))}
                  <td className="px-2 py-2.5">
                    <RowMenu align="right" buttonLabel={`${spec.noun} actions`}>
                      {(close) => (
                        <>
                          <RowMenuItem
                            icon={Pencil}
                            label="Edit"
                            onClick={() => {
                              close();
                              setDrawer({ mode: "edit", row });
                            }}
                          />
                          <RowMenuDivider />
                          <RowMenuItem
                            icon={Trash2}
                            label="Delete"
                            tone="danger"
                            onClick={() => {
                              close();
                              if (confirm(`Delete "${row[columns[0].key]}" from ${spec.label}?`)) remove(row.id);
                            }}
                          />
                        </>
                      )}
                    </RowMenu>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {drawer && (
        <MasterRowDrawer
          spec={spec}
          existing={drawer.mode === "edit" ? drawer.row : undefined}
          onClose={() => setDrawer(null)}
          onSave={save}
        />
      )}
    </div>
  );
}

/** Money and percent columns are stored as plain numbers — the type only decides how they read. */
function renderValue(field: MasterField, value: string | number | undefined): string {
  if (value === undefined || value === null || value === "") return "—";
  if (field.type === "currency") return formatRupee(Number(value));
  if (field.type === "percent") return `${value}%`;
  return String(value);
}

/** Add / edit form for one row, built from the spec's field list. */
function MasterRowDrawer({
  spec,
  existing,
  onClose,
  onSave,
}: {
  spec: MasterLibrarySpec;
  existing?: MasterRow;
  onClose: () => void;
  onSave: (values: Omit<MasterRow, "id">) => void;
}) {
  const [values, setValues] = useState<Record<string, string>>(() =>
    Object.fromEntries(spec.fields.map((f) => [f.key, existing ? String(existing[f.key] ?? "") : ""])),
  );
  const [dirty, setDirty] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function set(key: string, value: string) {
    setValues((v) => ({ ...v, [key]: value }));
    setDirty(true);
  }

  function submit() {
    const missing = spec.fields.find((f) => f.required && !values[f.key]?.trim());
    if (missing) {
      setError(`${missing.label} is required.`);
      return;
    }
    // Numeric fields go back to the store as numbers so sorting and totals stay honest.
    const out: Omit<MasterRow, "id"> = {};
    for (const f of spec.fields) {
      const raw = values[f.key]?.trim() ?? "";
      out[f.key] = isNumericField(f) ? (raw === "" ? 0 : Number(raw)) : raw;
    }
    onSave(out);
  }

  const input =
    "w-full rounded-lg border border-gray-200 px-3 py-2 text-sm outline-none transition-colors duration-150 focus:border-cyan-500";

  return (
    <Drawer
      title={existing ? `Edit ${spec.noun}` : `Add ${spec.noun}`}
      onClose={onClose}
      onSave={submit}
      dirty={dirty}
      width="max-w-lg"
    >
      <div className="space-y-4">
        {error && <div className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-600">{error}</div>}

        {spec.fields.map((f) => (
          <DrawerField key={f.key} label={f.label} required={f.required}>
            {f.type === "select" ? (
              <Select
                value={values[f.key] ?? ""}
                onChange={(v) => set(f.key, v)}
                placeholder="Select…"
                options={(f.options ?? []).map((o) => ({ value: o, label: o }))}
              />
            ) : f.type === "textarea" ? (
              <textarea
                value={values[f.key] ?? ""}
                onChange={(e) => set(f.key, e.target.value)}
                placeholder={f.placeholder}
                rows={4}
                className={input}
              />
            ) : (
              <div className="relative">
                <input
                  type={isNumericField(f) ? "number" : "text"}
                  inputMode={isNumericField(f) ? "decimal" : undefined}
                  value={values[f.key] ?? ""}
                  onChange={(e) => set(f.key, e.target.value)}
                  placeholder={f.placeholder}
                  className={`${input} ${f.type === "currency" ? "pl-7" : ""} ${f.type === "percent" ? "pr-8" : ""}`}
                />
                {f.type === "currency" && (
                  <span className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-sm text-gray-400">₹</span>
                )}
                {f.type === "percent" && (
                  <span className="pointer-events-none absolute top-1/2 right-3 -translate-y-1/2 text-sm text-gray-400">%</span>
                )}
              </div>
            )}
          </DrawerField>
        ))}
      </div>
    </Drawer>
  );
}
