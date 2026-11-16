"use client";

import { useEffect, useMemo, useState } from "react";
import { FileUp, Loader2 } from "lucide-react";
import { Modal } from "@/components/Modal";
import { Select } from "@/components/Select";
import { readBoq, type BoqRow } from "@/lib/boqPdf";
import { readBoqExcel } from "@/lib/boqExcel";
import { inr } from "@/lib/format";
import * as api from "@/lib/projectTargetApi";
import type { ApiBoqFamily } from "@/lib/projectTargetApi";

/**
 * KAN-113: upload a BOQ into a project — from Excel / CSV (read directly), or from a PDF or a photo
 * of the schedule (PDF text, or OCR with AI for a scan). The rows are shown before anything is
 * saved; they go under a new title, an existing one, or (when the file has headings) one title per
 * heading. Each line gets its target, as a line added by hand does.
 */
export function ProjectBoqImport({
  projectId,
  file,
  families,
  hasBoq,
  onClose,
  onDone,
}: {
  projectId: number;
  file: File;
  families: ApiBoqFamily[];
  /** False on a project with no BOQ yet — one is created first. */
  hasBoq: boolean;
  onClose: () => void;
  onDone: (added: number) => void;
}) {
  const isExcel = /\.(xlsx|xls|csv)$/i.test(file.name);
  const [progress, setProgress] = useState(isExcel ? "Reading sheet…" : "Opening file…");
  const [rows, setRows] = useState<BoqRow[] | null>(null);
  const [method, setMethod] = useState<string>("");
  const [error, setError] = useState("");
  const [target, setTarget] = useState("__new");
  const [newTitle, setNewTitle] = useState(file.name.replace(/\.[^.]+$/, ""));
  const [headingsAsTitles, setHeadingsAsTitles] = useState(false);
  const [saving, setSaving] = useState<string | null>(null);

  useEffect(() => {
    let live = true;
    (isExcel
      ? readBoqExcel(file).then((r) => ({ rows: r.rows, method: `Excel · sheet "${r.sheet}"` }))
      : readBoq(file, (m) => live && setProgress(m)).then((r) => ({
          rows: r.rows,
          method: r.method === "text" ? "from the PDF text" : "read with AI (OCR)",
        }))
    )
      .then((r) => {
        if (!live) return;
        setRows(r.rows);
        setMethod(r.method);
        if (r.rows.some((x) => x.heading)) setHeadingsAsTitles(true);
      })
      .catch((e) => live && setError(e instanceof Error ? e.message : "Couldn't read that file."));
    return () => {
      live = false;
    };
  }, [file, isExcel]);

  const items = useMemo(() => rows?.filter((r) => !r.heading) ?? [], [rows]);
  const headings = useMemo(() => rows?.filter((r) => r.heading) ?? [], [rows]);
  const total = items.reduce((s, r) => s + (r.amount ?? r.qty * r.rate), 0);

  async function save() {
    if (!rows) return;
    setError("");
    try {
      if (!hasBoq) {
        setSaving("Creating the BOQ…");
        await api.saveBoq(projectId, { title: newTitle.trim() || "BOQ", items: [], targets: [] });
      }
      // Which title each row goes under.
      const current = target;
      const known = new Map(families.map((f) => [f.label.trim().toLowerCase(), f.key]));
      async function titleKey(label: string): Promise<string> {
        const k = known.get(label.trim().toLowerCase());
        if (k) return k;
        const list = await api.saveFamily(projectId, { label: label.trim() });
        const made = list.find((f) => f.label.trim().toLowerCase() === label.trim().toLowerCase()) ?? list[list.length - 1];
        known.set(label.trim().toLowerCase(), made.key);
        return made.key;
      }
      // A new title is made only when an item lands before any heading — with headings as titles,
      // the file's own headings may cover every item.
      let currentKey: string | null = current === "__new" ? null : current;
      let added = 0;
      for (const r of rows) {
        if (r.heading) {
          if (headingsAsTitles) currentKey = await titleKey(r.description.slice(0, 120));
          continue;
        }
        if (currentKey == null) currentKey = await titleKey(newTitle.trim() || "Imported BOQ");
        setSaving(`Adding item ${added + 1} of ${items.length}…`);
        await api.addBoqItem(projectId, {
          groupKey: currentKey,
          srNo: r.srNo || null,
          description: r.description,
          unit: r.unit || null,
          qty: r.qty || 0,
          saleRate: r.rate || (r.amount && r.qty ? r.amount / r.qty : 0),
        });
        added++;
      }
      onDone(added);
    } catch (e) {
      setError(e instanceof Error ? e.message : "The import stopped part-way.");
      setSaving(null);
    }
  }

  return (
    <Modal onClose={onClose} wide guardOnClose={false}>
      <div className="w-[860px] max-w-full space-y-4 p-5">
        <div>
          <h2 className="flex items-center gap-2 text-base font-semibold text-gray-800">
            <FileUp size={16} className="text-brand-accent" /> Import BOQ
          </h2>
          <p className="mt-1 truncate text-xs text-gray-400">
            {file.name}
            {method && ` · ${method}`}
          </p>
        </div>

        {error && <p className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-600">{error}</p>}

        {!rows && !error ? (
          <div className="flex items-center gap-2 py-10 text-sm text-gray-500">
            <Loader2 size={16} className="animate-spin text-brand-accent" /> {progress}
          </div>
        ) : rows && items.length === 0 ? (
          <p className="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-700">
            No BOQ items found. An Excel sheet needs a header row naming the description and the quantity or rate
            columns; a scan needs AI scanning set up.
          </p>
        ) : rows ? (
          <>
            <div className="grid gap-2 sm:grid-cols-3">
              <Stat label="Items" value={String(items.length)} />
              <Stat label="Headings" value={String(headings.length)} />
              <Stat label="Amount" value={inr(total)} />
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <label className="block">
                <span className="mb-1 block text-[11px] font-medium tracking-wide text-gray-400 uppercase">Put the items under</span>
                <Select
                  value={target}
                  onChange={setTarget}
                  options={[{ value: "__new", label: "A new title" }, ...families.map((f) => ({ value: f.key, label: f.label }))]}
                />
              </label>
              {target === "__new" && (
                <label className="block">
                  <span className="mb-1 block text-[11px] font-medium tracking-wide text-gray-400 uppercase">New title</span>
                  <input value={newTitle} onChange={(e) => setNewTitle(e.target.value)} className="input" />
                </label>
              )}
            </div>
            {headings.length > 0 && (
              <label className="flex items-center gap-2 text-sm text-gray-700">
                <input type="checkbox" checked={headingsAsTitles} onChange={(e) => setHeadingsAsTitles(e.target.checked)} className="h-4 w-4 accent-cyan-600" />
                Make each heading in the file its own title ({headings.length})
              </label>
            )}

            <div className="max-h-[340px] overflow-auto rounded-lg border border-gray-200">
              <table className="min-w-full text-xs">
                <thead className="sticky top-0 bg-gray-50 text-left text-gray-500">
                  <tr>
                    <th className="px-2 py-1.5">Sr</th>
                    <th className="px-2 py-1.5">Description</th>
                    <th className="px-2 py-1.5">Unit</th>
                    <th className="px-2 py-1.5 text-right">Qty</th>
                    <th className="px-2 py-1.5 text-right">Rate</th>
                    <th className="px-2 py-1.5 text-right">Amount</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {rows.slice(0, 400).map((r, i) =>
                    r.heading ? (
                      <tr key={i} className="bg-gray-50/70">
                        <td className="px-2 py-1 text-gray-400">{r.srNo}</td>
                        <td colSpan={5} className="px-2 py-1 font-semibold text-gray-700">{r.description}</td>
                      </tr>
                    ) : (
                      <tr key={i}>
                        <td className="px-2 py-1 text-gray-400">{r.srNo}</td>
                        <td className="max-w-[420px] truncate px-2 py-1 text-gray-700" title={r.description}>{r.description}</td>
                        <td className="px-2 py-1 text-gray-500">{r.unit}</td>
                        <td className="px-2 py-1 text-right tabular-nums">{r.qty || "—"}</td>
                        <td className="px-2 py-1 text-right tabular-nums">{r.rate ? inr(r.rate) : "—"}</td>
                        <td className="px-2 py-1 text-right tabular-nums">{inr(r.amount ?? r.qty * r.rate)}</td>
                      </tr>
                    ),
                  )}
                </tbody>
              </table>
            </div>
          </>
        ) : null}

        <div className="flex items-center justify-end gap-2">
          {saving && <span className="mr-auto text-xs text-gray-500">{saving}</span>}
          <button onClick={onClose} disabled={!!saving} className="rounded-lg border border-gray-300 px-4 py-2 text-sm text-gray-700 hover:border-gray-400">
            Cancel
          </button>
          <button
            onClick={() => void save()}
            disabled={!rows || items.length === 0 || !!saving}
            className="rounded-lg bg-brand-accent px-4 py-2 text-sm font-semibold text-white hover:opacity-90 disabled:opacity-40"
          >
            Import {items.length} item{items.length === 1 ? "" : "s"}
          </button>
        </div>
      </div>
    </Modal>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg bg-gray-50 px-3 py-2">
      <div className="text-[11px] text-gray-400">{label}</div>
      <div className="text-sm font-semibold text-gray-800">{value}</div>
    </div>
  );
}
