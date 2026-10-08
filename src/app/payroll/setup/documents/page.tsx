"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { PayrollShell, PayrollEmpty } from "@/components/payroll/PayrollShell";
import { Spinner } from "@/components/Spinner";
import { ApiError, addOrgDocument, deleteOrgDocument, getOrgDocument, getOrgDocuments } from "@/lib/api";
import type { OrgDocumentApi } from "@/lib/api";
import { formatDateIST } from "@/lib/datetime";
import { MAX_ATTACHMENT_BYTES, readFileAsDataUrl } from "@/lib/dataUrlFile";
import { ArrowLeft, Download, FileText, FolderOpen, Trash2, Upload } from "lucide-react";
import { previewFile } from "@/lib/filePreview";

/** Organisation documents — policies, handbooks and circulars every staff member can open. */
export default function OrgDocumentsPage() {
  const [docs, setDocs] = useState<OrgDocumentApi[]>([]);
  const [loading, setLoading] = useState(true);
  const [title, setTitle] = useState("");
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    getOrgDocuments()
      .then((r) => { if (!cancelled) setDocs(r); })
      .catch((err) => { if (!cancelled) setError(err instanceof ApiError ? err.message : "Unable to load documents."); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, []);

  async function upload(file: File | undefined) {
    if (!file) return;
    if (file.size > MAX_ATTACHMENT_BYTES) return setError("Documents can be up to 5 MB.");
    setUploading(true);
    setError("");
    try {
      const doc = await addOrgDocument({
        title: title.trim() || file.name.replace(/\.[^.]+$/, ""), fileName: file.name, dataUrl: await readFileAsDataUrl(file),
      });
      setDocs((d) => [doc, ...d]);
      setTitle("");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Unable to upload.");
    } finally {
      setUploading(false);
    }
  }

  async function remove(d: OrgDocumentApi) {
    if (!confirm(`Delete ${d.title}? Staff will no longer see it.`)) return;
    try {
      await deleteOrgDocument(d.id);
      setDocs((all) => all.filter((x) => x.id !== d.id));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Unable to delete.");
    }
  }

  return (
    <PayrollShell requireAdmin>
      <div className="space-y-4">
        <div className="flex items-center gap-3">
          <Link href="/payroll/setup" className="flex items-center gap-1 rounded-lg border border-gray-200 bg-white px-2.5 py-1.5 text-sm text-gray-600 hover:bg-gray-50">
            <ArrowLeft size={14} /> Setup
          </Link>
          <div>
            <h2 className="text-lg font-semibold text-gray-800">Organisation Documents</h2>
            <p className="mt-0.5 text-sm text-gray-500">Shown to every staff member under Self Service → Inbox &amp; Documents.</p>
          </div>
        </div>
        {error && <div className="rounded-lg bg-rose-50 px-4 py-2 text-sm text-rose-600">{error}</div>}

        <div className="flex flex-wrap items-center gap-2 rounded-xl border border-gray-200 bg-white p-3">
          <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Title (optional — defaults to the file name)" className="input min-w-[240px] flex-1" />
          <label className={`flex cursor-pointer items-center gap-1.5 rounded-lg bg-brand-accent px-3.5 py-2 text-sm font-semibold text-white hover:opacity-90 ${uploading ? "pointer-events-none opacity-50" : ""}`}>
            {uploading ? <Spinner size={14} /> : <Upload size={14} />} Upload document
            <input type="file" className="hidden" onChange={(e) => { void upload(e.target.files?.[0]); e.target.value = ""; }} />
          </label>
        </div>

        {loading ? (
          <div className="flex items-center justify-center gap-2 py-16 text-sm text-gray-400"><Spinner size={16} className="text-brand-accent" /> Loading…</div>
        ) : docs.length === 0 ? (
          <PayrollEmpty icon={FolderOpen} title="No documents yet" hint="Upload the leave policy, employee handbook or safety rules." />
        ) : (
          <div className="divide-y divide-gray-100 rounded-xl border border-gray-200 bg-white">
            {docs.map((d) => (
              <div key={d.id} className="flex items-center gap-3 px-4 py-3">
                <FileText size={18} className="shrink-0 text-gray-400" />
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-medium text-gray-800">{d.title}</div>
                  <div className="text-xs text-gray-500">{d.fileName}{d.createdAt ? ` · ${formatDateIST(d.createdAt)}` : ""}{d.createdByName ? ` · ${d.createdByName}` : ""}</div>
                </div>
                <button
                  onClick={async () => { const full = await getOrgDocument(d.id); if (full.dataUrl) previewFile({ name: full.fileName, url: full.dataUrl }); }}
                  title="Download"
                  className="rounded-md p-1.5 text-gray-400 hover:bg-gray-100 hover:text-brand-accent"
                >
                  <Download size={15} />
                </button>
                <button onClick={() => remove(d)} title="Delete" className="rounded-md p-1.5 text-gray-400 hover:bg-rose-50 hover:text-rose-600"><Trash2 size={15} /></button>
              </div>
            ))}
          </div>
        )}
      </div>
    </PayrollShell>
  );
}
