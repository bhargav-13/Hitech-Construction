"use client";

import { useEffect, useState } from "react";
import { PayrollShell } from "@/components/payroll/PayrollShell";
import { Spinner } from "@/components/Spinner";
import { ApiError, getBroadcastAttachment, getOrgDocument, getOrgDocuments, myBroadcasts } from "@/lib/api";
import type { BroadcastApi, OrgDocumentApi } from "@/lib/api";
import { formatDateIST, formatDateTimeIST } from "@/lib/datetime";
import { Download, FileText, Megaphone, Paperclip } from "lucide-react";
import { previewFile } from "@/lib/filePreview";
import { useRefreshTick } from "@/lib/autoRefresh";

/** Self-service: messages HR has sent me, and the organisation's documents. */
export default function MyInboxPage() {
  const [messages, setMessages] = useState<BroadcastApi[]>([]);
  const [docs, setDocs] = useState<OrgDocumentApi[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const tick = useRefreshTick(); // silent re-load on the module auto-refresh
  useEffect(() => {
    let cancelled = false;
    Promise.all([myBroadcasts(), getOrgDocuments()])
      .then(([m, d]) => { if (!cancelled) { setMessages(m); setDocs(d); } })
      .catch((err) => { if (!cancelled) setError(err instanceof ApiError ? err.message : "Unable to load."); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [tick]);

  return (
    <PayrollShell>
      <div className="space-y-4">
        <div>
          <h2 className="text-lg font-semibold text-gray-800">Inbox &amp; Documents</h2>
          <p className="mt-0.5 text-sm text-gray-500">Messages from HR and the organisation&apos;s policies.</p>
        </div>
        {error && <div className="rounded-lg bg-rose-50 px-4 py-2 text-sm text-rose-600">{error}</div>}
        {loading ? (
          <div className="flex items-center justify-center gap-2 py-16 text-sm text-gray-400"><Spinner size={16} className="text-brand-accent" /> Loading…</div>
        ) : (
          <div className="grid gap-4 lg:grid-cols-[1fr_360px]">
            <section className="rounded-xl border border-gray-200 bg-white">
              <div className="flex items-center gap-2 border-b border-gray-100 px-4 py-2 text-sm font-semibold text-gray-800"><Megaphone size={15} /> Messages</div>
              {messages.length === 0 ? (
                <div className="py-10 text-center text-sm text-gray-400">No messages yet.</div>
              ) : (
                <div className="divide-y divide-gray-100">
                  {messages.map((b) => (
                    <div key={b.id} className="px-4 py-3">
                      <div className="flex items-baseline justify-between gap-3">
                        <span className="font-medium text-gray-800">{b.title ?? "Message from HR"}</span>
                        {b.sentAt && <span className="shrink-0 text-xs text-gray-400">{formatDateTimeIST(b.sentAt)}</span>}
                      </div>
                      <p className="mt-1 text-sm whitespace-pre-line text-gray-700">{b.message}</p>
                      {b.hasAttachment && (
                        <button
                          onClick={async () => { const r = await getBroadcastAttachment(b.id); if (r.dataUrl) previewFile({ name: b.attachmentName ?? "attachment", url: r.dataUrl }); }}
                          className="mt-1 flex items-center gap-1 text-xs text-brand-accent hover:underline"
                        >
                          <Paperclip size={12} /> {b.attachmentName ?? "Attachment"}
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </section>
            <section className="rounded-xl border border-gray-200 bg-white">
              <div className="flex items-center gap-2 border-b border-gray-100 px-4 py-2 text-sm font-semibold text-gray-800"><FileText size={15} /> Organisation documents</div>
              {docs.length === 0 ? (
                <div className="py-10 text-center text-sm text-gray-400">No documents published.</div>
              ) : (
                <div className="divide-y divide-gray-100">
                  {docs.map((d) => (
                    <button
                      key={d.id}
                      onClick={async () => { const full = await getOrgDocument(d.id); if (full.dataUrl) previewFile({ name: full.fileName, url: full.dataUrl }); }}
                      className="flex w-full items-center gap-3 px-4 py-2.5 text-left hover:bg-gray-50"
                    >
                      <FileText size={16} className="shrink-0 text-gray-400" />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-medium text-gray-800">{d.title}</span>
                        <span className="block text-xs text-gray-500">{d.createdAt ? formatDateIST(d.createdAt) : d.fileName}</span>
                      </span>
                      <Download size={14} className="shrink-0 text-gray-400" />
                    </button>
                  ))}
                </div>
              )}
            </section>
          </div>
        )}
      </div>
    </PayrollShell>
  );
}
