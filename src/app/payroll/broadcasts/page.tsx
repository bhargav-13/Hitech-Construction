"use client";

import { useEffect, useMemo, useState } from "react";
import { PayrollShell, PayrollEmpty } from "@/components/payroll/PayrollShell";
import { Spinner } from "@/components/Spinner";
import { Drawer, DrawerField } from "@/components/Drawer";
import { ApiError, deleteBroadcast, getBroadcastAttachment, getBroadcasts, getPayrollPeople, sendBroadcast } from "@/lib/api";
import type { BroadcastApi, UserResponse } from "@/lib/api";
import { formatDateTimeIST } from "@/lib/datetime";
import { MAX_ATTACHMENT_BYTES, readFileAsDataUrl } from "@/lib/dataUrlFile";
import { Megaphone, Paperclip, Plus, Search, Send, Trash2 } from "lucide-react";
import { previewFile } from "@/lib/filePreview";
import { useRefreshTick } from "@/lib/autoRefresh";

/**
 * Broadcasts — PagarBook's "Send Message": one message to all staff or a chosen few. Each
 * recipient gets it on their notification bell and in Self Service → Inbox. Nothing is sent by
 * SMS or WhatsApp.
 */
export default function BroadcastsPage() {
  const [rows, setRows] = useState<BroadcastApi[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [composing, setComposing] = useState(false);

  const tick = useRefreshTick(); // silent re-load on the module auto-refresh
  useEffect(() => {
    let cancelled = false;
    getBroadcasts()
      .then((r) => { if (!cancelled) setRows(r); })
      .catch((err) => { if (!cancelled) setError(err instanceof ApiError ? err.message : "Unable to load broadcasts."); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [tick]);

  async function remove(b: BroadcastApi) {
    if (!confirm("Delete this broadcast from the list? Staff who already received it keep the notification.")) return;
    try {
      await deleteBroadcast(b.id);
      setRows((r) => r.filter((x) => x.id !== b.id));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Unable to delete.");
    }
  }

  return (
    <PayrollShell requireAdmin>
      <div className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold text-gray-800">Broadcasts</h2>
            <p className="mt-0.5 text-sm text-gray-500">Send a message to all staff or a few — it lands on their notification bell.</p>
          </div>
          <button onClick={() => setComposing(true)} className="flex items-center gap-1.5 rounded-lg bg-brand-accent px-3.5 py-2 text-sm font-semibold text-white hover:opacity-90">
            <Plus size={15} /> New Broadcast
          </button>
        </div>
        {error && <div className="rounded-lg bg-rose-50 px-4 py-2 text-sm text-rose-600">{error}</div>}

        {loading ? (
          <div className="flex items-center justify-center gap-2 py-16 text-sm text-gray-400"><Spinner size={16} className="text-brand-accent" /> Loading…</div>
        ) : rows.length === 0 ? (
          <PayrollEmpty icon={Megaphone} title="No broadcasts yet" hint="Announce a holiday, a policy change or a payday — staff see it in their Inbox." />
        ) : (
          <div className="space-y-2">
            {rows.map((b) => (
              <div key={b.id} className="rounded-xl border border-gray-200 bg-white p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    {b.title && <div className="font-medium text-gray-800">{b.title}</div>}
                    <p className="mt-0.5 text-sm whitespace-pre-line text-gray-700">{b.message}</p>
                    <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-gray-500">
                      <span>{b.all ? "All staff" : `${b.recipientCount} staff`}</span>
                      {b.sentAt && <span>{formatDateTimeIST(b.sentAt)}</span>}
                      {b.createdByName && <span>by {b.createdByName}</span>}
                      {b.hasAttachment && (
                        <button
                          onClick={async () => { const r = await getBroadcastAttachment(b.id); if (r.dataUrl) previewFile({ name: b.attachmentName ?? "attachment", url: r.dataUrl }); }}
                          className="flex items-center gap-1 text-brand-accent hover:underline"
                        >
                          <Paperclip size={12} /> {b.attachmentName ?? "Attachment"}
                        </button>
                      )}
                    </div>
                  </div>
                  <button onClick={() => remove(b)} title="Delete" className="rounded-md p-1.5 text-gray-400 hover:bg-rose-50 hover:text-rose-600"><Trash2 size={14} /></button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
      {composing && <ComposeDrawer onClose={() => setComposing(false)} onSent={(b) => { setRows((r) => [b, ...r]); setComposing(false); }} />}
    </PayrollShell>
  );
}

function ComposeDrawer({ onClose, onSent }: { onClose: () => void; onSent: (b: BroadcastApi) => void }) {
  const [users, setUsers] = useState<UserResponse[]>([]);
  const [title, setTitle] = useState("");
  const [message, setMessage] = useState("");
  const [all, setAll] = useState(true);
  const [picked, setPicked] = useState<Set<number>>(new Set());
  const [search, setSearch] = useState("");
  const [file, setFile] = useState<{ name: string; dataUrl: string } | null>(null);
  const [error, setError] = useState("");
  const [sending, setSending] = useState(false);

  useEffect(() => {
    getPayrollPeople().then((r) => setUsers(r.content.filter((u) => u.isActive !== false))).catch(() => setUsers([]));
  }, []);

  const shown = useMemo(() => {
    const q = search.trim().toLowerCase();
    return users.filter((u) => !q || u.fullName.toLowerCase().includes(q) || (u.departmentName ?? "").toLowerCase().includes(q));
  }, [users, search]);

  async function attach(f: File | undefined) {
    if (!f) return;
    if (f.size > MAX_ATTACHMENT_BYTES) { setError("Attachments can be up to 5 MB."); return; }
    setFile({ name: f.name, dataUrl: await readFileAsDataUrl(f) });
  }

  async function send() {
    if (!message.trim()) return setError("Write a message.");
    if (!all && picked.size === 0) return setError("Pick at least one person, or send to all staff.");
    setSending(true);
    setError("");
    try {
      onSent(await sendBroadcast({
        title: title.trim() || undefined, message: message.trim(), all, userIds: all ? [] : [...picked],
        attachmentName: file?.name ?? null, attachment: file?.dataUrl ?? null,
      }));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Unable to send.");
      setSending(false);
    }
  }

  return (
    <Drawer title="New Broadcast" onClose={onClose} onSave={send} saveLabel={sending ? "Sending…" : "Send"} width="max-w-xl">
      <div className="space-y-4">
        {error && <div className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-600">{error}</div>}
        <DrawerField label="Title"><input value={title} onChange={(e) => setTitle(e.target.value)} className="input" placeholder="e.g. Office closed on Friday" autoFocus /></DrawerField>
        <DrawerField label="Message" required>
          <textarea value={message} onChange={(e) => setMessage(e.target.value)} rows={5} className="input" placeholder="Write your message…" />
        </DrawerField>
        <div>
          <span className="mb-1 block text-[11px] font-medium tracking-wide text-gray-400 uppercase">Attachment</span>
          {file ? (
            <div className="flex items-center justify-between rounded-lg border border-gray-200 px-3 py-2 text-sm">
              <span className="flex items-center gap-1.5 truncate text-gray-700"><Paperclip size={13} /> {file.name}</span>
              <button onClick={() => setFile(null)} className="text-xs text-rose-600 hover:underline">Remove</button>
            </div>
          ) : (
            <label className="flex cursor-pointer items-center gap-1.5 rounded-lg border border-dashed border-gray-300 px-3 py-2 text-sm text-gray-500 hover:bg-gray-50">
              <Paperclip size={13} /> Attach a file (optional, up to 5 MB)
              <input type="file" className="hidden" onChange={(e) => attach(e.target.files?.[0])} />
            </label>
          )}
        </div>
        <div>
          <span className="mb-1 block text-[11px] font-medium tracking-wide text-gray-400 uppercase">Send to</span>
          <div className="flex rounded-lg border border-gray-200 p-0.5 text-sm">
            {[true, false].map((v) => (
              <button key={String(v)} type="button" onClick={() => setAll(v)} className={`flex-1 rounded-md px-3 py-1.5 font-medium ${all === v ? "bg-brand-accent text-white" : "text-gray-600 hover:bg-gray-50"}`}>
                {v ? "All staff" : `Selected staff${picked.size ? ` (${picked.size})` : ""}`}
              </button>
            ))}
          </div>
          {!all && (
            <div className="mt-2 rounded-lg border border-gray-200">
              <div className="flex items-center gap-2 border-b border-gray-100 px-3 py-2">
                <Search size={14} className="text-gray-400" />
                <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search staff" className="w-full text-sm outline-none" />
              </div>
              <div className="max-h-64 overflow-y-auto">
                {shown.map((u) => (
                  <label key={u.id} className="flex cursor-pointer items-center gap-2 px-3 py-1.5 text-sm hover:bg-gray-50">
                    <input
                      type="checkbox"
                      checked={picked.has(u.id)}
                      onChange={(e) => setPicked((p) => { const n = new Set(p); if (e.target.checked) n.add(u.id); else n.delete(u.id); return n; })}
                      className="h-4 w-4 accent-brand-accent"
                    />
                    <span className="text-gray-800">{u.fullName}</span>
                    {u.departmentName && <span className="text-xs text-gray-400">{u.departmentName}</span>}
                  </label>
                ))}
              </div>
            </div>
          )}
        </div>
        <p className="flex items-center gap-1.5 text-xs text-gray-500"><Send size={12} /> Delivered in the app only — no SMS or WhatsApp is sent.</p>
      </div>
    </Drawer>
  );
}
