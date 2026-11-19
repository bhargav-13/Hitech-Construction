"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Download, Mail, Pencil, Plus, Search, Trash2 } from "lucide-react";
import { TenderShell, TenderEmpty } from "@/components/tender/TenderShell";
import { Drawer, DrawerField } from "@/components/Drawer";
import { DatePicker } from "@/components/DatePicker";
import { Select } from "@/components/Select";
import { SortTh } from "@/components/vyapar/SortTh";
import { ModuleAttachments, PendingAttachmentList, usePendingAttachments } from "@/components/files/ModuleAttachments";
import { exportRowsToCsv } from "@/lib/vyaparExport";
import { useTableSort } from "@/lib/useTableSort";
import { useCan } from "@/lib/permissions";
import { tdate, tval } from "@/lib/tenderHelpers";
import {
  addLetterChannel,
  createLetter,
  deleteLetter,
  listLetterChannels,
  listLetters,
  removeLetterChannel,
  updateLetter,
  type LetterChannel,
  type TenderLetter,
  type TenderLetterInput,
} from "@/lib/tenderLettersApi";

/**
 * KAN-133: Tender → Letter correspondence. Letters received from departments and others — date,
 * reference number, description, how it came in (WhatsApp, Email or a channel you add) and notes,
 * with the scanned letter attached.
 */
export default function TenderLettersPage() {
  const can = useCan();
  const canCreate = can("TENDER_DOCUMENTS:CREATE");
  const canEdit = can("TENDER_DOCUMENTS:EDIT");
  const canDelete = can("TENDER_DOCUMENTS:DELETE");
  const [letters, setLetters] = useState<TenderLetter[]>([]);
  const [channels, setChannels] = useState<LetterChannel[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [editing, setEditing] = useState<TenderLetter | "new" | null>(null);

  const load = useCallback(async () => {
    try {
      const [l, c] = await Promise.all([listLetters(), listLetterChannels()]);
      setLetters(l);
      setChannels(c);
      setError("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't load letters.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    let off = false;
    Promise.all([listLetters(), listLetterChannels()])
      .then(([l, c]) => {
        if (off) return;
        setLetters(l);
        setChannels(c);
      })
      .catch((e) => !off && setError(e instanceof Error ? e.message : "Couldn't load letters."))
      .finally(() => !off && setLoading(false));
    return () => {
      off = true;
    };
  }, []);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return letters;
    return letters.filter((l) =>
      [l.referenceNo, l.description, l.receivedThrough, l.notes, l.tenderRef].some((v) => (v ?? "").toLowerCase().includes(q)),
    );
  }, [letters, search]);

  const { sorted, sortKey, sortDir, toggle } = useTableSort<TenderLetter>(
    filtered,
    {
      letterDate: (l) => l.letterDate,
      referenceNo: (l) => l.referenceNo,
      receivedThrough: (l) => l.receivedThrough,
    },
    { key: "letterDate", dir: "desc" },
  );

  async function remove(l: TenderLetter) {
    if (!window.confirm(`Delete letter ${l.referenceNo ?? ""}?`.trim())) return;
    try {
      await deleteLetter(l.id);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't delete the letter.");
    }
  }

  return (
    <TenderShell>
      <div className="space-y-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-lg font-semibold text-gray-800">Letter Correspondence</h1>
            <p className="text-sm text-gray-500">Letters received from departments and others, and how they came in.</p>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() =>
                exportRowsToCsv(
                  "tender-letters",
                  ["Date", "Reference No.", "Description", "Received Through", "Notes", "Tender"],
                  sorted.map((l) => [l.letterDate, l.referenceNo, l.description, l.receivedThrough, l.notes, l.tenderRef]),
                )
              }
              className="flex items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm font-medium text-gray-600 transition-colors duration-150 hover:bg-gray-50"
            >
              <Download size={14} /> Export
            </button>
            {canCreate && (
              <button
                onClick={() => setEditing("new")}
                className="flex items-center gap-1.5 rounded-lg bg-brand-accent px-3 py-2 text-sm font-medium text-white transition-all duration-150 hover:opacity-90 active:scale-95"
              >
                <Plus size={14} /> Add letter
              </button>
            )}
            <div className="text-sm text-gray-500">{filtered.length} letters</div>
          </div>
        </div>

        <div className="flex items-center gap-2 rounded-lg border border-gray-200 bg-white px-3 py-2 transition-colors duration-150 focus-within:border-cyan-500">
          <Search size={15} className="text-gray-400" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search reference no., description, notes or tender"
            className="w-full bg-transparent text-sm outline-none"
          />
        </div>

        {error && <div className="rounded-lg bg-rose-50 px-4 py-2 text-sm text-rose-600">{error}</div>}

        {loading ? (
          <div className="py-12 text-center text-sm text-gray-400">Loading…</div>
        ) : letters.length === 0 ? (
          <TenderEmpty icon={Mail} title="No letters yet" hint="Add a letter you received to keep a record of it." />
        ) : (
          <div className="overflow-x-auto rounded-xl border border-gray-200 bg-white">
            <table className="w-full min-w-[900px] border-collapse text-sm">
              <thead>
                <tr className="border-b border-gray-100 bg-gray-50 text-left text-gray-500">
                  <SortTh label="Date" sortKey="letterDate" activeKey={sortKey} dir={sortDir} onSort={toggle} />
                  <SortTh label="Reference No." sortKey="referenceNo" activeKey={sortKey} dir={sortDir} onSort={toggle} />
                  <th className="px-4 py-2 font-medium text-gray-500">Description</th>
                  <SortTh label="Received Through" sortKey="receivedThrough" activeKey={sortKey} dir={sortDir} onSort={toggle} />
                  <th className="px-4 py-2 font-medium text-gray-500">Notes</th>
                  <th className="px-4 py-2 font-medium text-gray-500">Actions</th>
                </tr>
              </thead>
              <tbody>
                {sorted.length === 0 && (
                  <tr>
                    <td colSpan={6} className="px-4 py-10 text-center text-sm text-gray-400">
                      No letters match &ldquo;{search.trim()}&rdquo;.
                    </td>
                  </tr>
                )}
                {sorted.map((l) => (
                  <tr
                    key={l.id}
                    onClick={() => setEditing(l)}
                    className="cursor-pointer border-b border-gray-50 align-top transition-colors duration-150 last:border-b-0 even:bg-gray-50/40 hover:bg-cyan-50/40"
                  >
                    <td className="px-4 py-2.5 whitespace-nowrap text-gray-600">{tdate(l.letterDate)}</td>
                    <td className="px-4 py-2.5 font-medium text-gray-800">{tval(l.referenceNo)}</td>
                    <td className="px-4 py-2.5 text-gray-700">
                      <span className="line-clamp-2 block max-w-[360px] whitespace-pre-wrap" title={l.description ?? ""}>
                        {tval(l.description)}
                      </span>
                    </td>
                    <td className="px-4 py-2.5">
                      {l.receivedThrough ? (
                        <span className="rounded-full bg-violet-50 px-2 py-0.5 text-xs font-medium text-violet-700">{l.receivedThrough}</span>
                      ) : (
                        <span className="text-gray-400">—</span>
                      )}
                    </td>
                    <td className="px-4 py-2.5 text-gray-600">
                      <span className="line-clamp-2 block max-w-[260px] whitespace-pre-wrap text-xs">{tval(l.notes)}</span>
                    </td>
                    <td className="px-4 py-2.5" onClick={(e) => e.stopPropagation()}>
                      <div className="flex items-center gap-1">
                        {canEdit && (
                          <button
                            onClick={() => setEditing(l)}
                            aria-label="Edit letter"
                            className="rounded p-1.5 text-gray-400 transition-colors hover:bg-cyan-50 hover:text-brand-accent"
                          >
                            <Pencil size={14} />
                          </button>
                        )}
                        {canDelete && (
                          <button
                            onClick={() => void remove(l)}
                            aria-label="Delete letter"
                            className="rounded p-1.5 text-gray-400 transition-colors hover:bg-rose-50 hover:text-rose-500"
                          >
                            <Trash2 size={14} />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {editing && (
        <LetterDrawer
          letter={editing === "new" ? null : editing}
          channels={channels}
          onChannels={setChannels}
          canEdit={editing === "new" ? canCreate : canEdit}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            void load();
          }}
        />
      )}
    </TenderShell>
  );
}

function LetterDrawer({
  letter,
  channels,
  onChannels,
  canEdit,
  onClose,
  onSaved,
}: {
  letter: TenderLetter | null;
  channels: LetterChannel[];
  onChannels: (c: LetterChannel[]) => void;
  canEdit: boolean;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [f, setF] = useState<TenderLetterInput>(() => ({
    letterDate: letter?.letterDate ?? new Date(Date.now() + 5.5 * 3600e3).toISOString().slice(0, 10),
    referenceNo: letter?.referenceNo ?? "",
    description: letter?.description ?? "",
    receivedThrough: letter?.receivedThrough ?? "",
    notes: letter?.notes ?? "",
    tenderRef: letter?.tenderRef ?? "",
  }));
  const set = (patch: Partial<TenderLetterInput>) => setF((p) => ({ ...p, ...patch }));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [adding, setAdding] = useState(false);
  const [newChannel, setNewChannel] = useState("");
  const pending = usePendingAttachments("TENDER", { type: "LETTER", label: "Letter" });

  async function save() {
    if (busy) return;
    if (!f.letterDate && !f.referenceNo?.trim() && !f.description?.trim()) {
      return setError("Enter at least the date, reference number or description.");
    }
    setBusy(true);
    setError("");
    try {
      const saved = letter ? await updateLetter(letter.id, f) : await createLetter(f);
      if (!letter) {
        try {
          await pending.flush(saved.id, null);
        } catch {
          // The letter is saved; the scan can be attached again from the letter.
        }
      }
      onSaved();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't save the letter.");
    } finally {
      setBusy(false);
    }
  }

  async function addChannel() {
    const name = newChannel.trim();
    if (!name) return;
    try {
      onChannels(await addLetterChannel(name));
      set({ receivedThrough: name });
      setNewChannel("");
      setAdding(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't add that option.");
    }
  }

  async function removeChannel(name: string) {
    if (!window.confirm(`Remove "${name}" from the list? Letters already saved with it keep it.`)) return;
    try {
      onChannels(await removeLetterChannel(name));
      if (f.receivedThrough === name) set({ receivedThrough: "" });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't remove that option.");
    }
  }

  // Options: the built-ins, the added ones, and a stored value whose option was since removed.
  const options = [
    { value: "", label: "Not set" },
    ...channels.map((c) => ({ value: c.name, label: c.name, removable: !c.builtIn })),
    ...(f.receivedThrough && !channels.some((c) => c.name === f.receivedThrough)
      ? [{ value: f.receivedThrough, label: f.receivedThrough }]
      : []),
  ];

  return (
    <Drawer
      title={letter ? "Letter" : "Add letter"}
      onClose={onClose}
      onSave={canEdit ? save : undefined}
      saveLabel={busy ? "Saving…" : letter ? "Save" : "Add letter"}
      width="max-w-lg"
    >
      <div className="space-y-4">
        {error && <div className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-600">{error}</div>}
        <div className="grid grid-cols-2 gap-3">
          <DrawerField label="Date">
            <DatePicker value={f.letterDate ?? ""} onChange={(v) => set({ letterDate: v || null })} disabled={!canEdit} />
          </DrawerField>
          <DrawerField label="Reference No.">
            <input
              value={f.referenceNo ?? ""}
              onChange={(e) => set({ referenceNo: e.target.value })}
              className="input"
              placeholder="e.g. PWD/2026/1452"
              disabled={!canEdit}
            />
          </DrawerField>
        </div>
        <DrawerField label="Description">
          <textarea
            value={f.description ?? ""}
            onChange={(e) => set({ description: e.target.value })}
            rows={3}
            className="input resize-none"
            placeholder="What the letter is about"
            disabled={!canEdit}
          />
        </DrawerField>
        <DrawerField label="Received Through">
          <Select
            value={f.receivedThrough ?? ""}
            onChange={(v) => set({ receivedThrough: v })}
            options={options}
            disabled={!canEdit}
            onCreate={canEdit ? () => setAdding(true) : undefined}
            createLabel="Add an option"
            onRemove={canEdit ? (v) => void removeChannel(v) : undefined}
          />
          {adding && (
            <div className="mt-2 flex gap-2">
              <input
                value={newChannel}
                onChange={(e) => setNewChannel(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && void addChannel()}
                className="input"
                placeholder="e.g. Courier, By hand, Post"
                autoFocus
              />
              <button
                type="button"
                onClick={() => void addChannel()}
                className="rounded-lg bg-brand-accent px-3 text-sm font-medium text-white hover:opacity-90"
              >
                Add
              </button>
            </div>
          )}
        </DrawerField>
        <DrawerField label="Notes">
          <textarea
            value={f.notes ?? ""}
            onChange={(e) => set({ notes: e.target.value })}
            rows={3}
            className="input resize-none"
            disabled={!canEdit}
          />
        </DrawerField>
        <DrawerField label="Tender (optional)" hint="The tender ID or number this letter is about.">
          <input
            value={f.tenderRef ?? ""}
            onChange={(e) => set({ tenderRef: e.target.value })}
            className="input"
            disabled={!canEdit}
          />
        </DrawerField>
        {letter ? (
          <ModuleAttachments module="TENDER" type="LETTER" sourceId={letter.id} projectId={null} label={`Letter ${letter.referenceNo ?? ""}`.trim()} canEdit={canEdit} />
        ) : (
          <PendingAttachmentList pending={pending} canEdit={canEdit} />
        )}
      </div>
    </Drawer>
  );
}
