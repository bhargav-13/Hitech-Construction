"use client";

import { useEffect, useMemo, useState } from "react";
import {
  Clock,
  Download,
  ExternalLink,
  FileImage,
  FileSpreadsheet,
  FileText,
  Folder,
  FolderOpen,
  HardDrive,
  LayoutGrid,
  List as ListIcon,
  Loader2,
  Search,
  UserRound,
  Files,
} from "lucide-react";
import { TaskopadShell } from "@/components/task/TaskopadShell";
import { TaskDrawer } from "@/components/task/TaskDrawer";
import { UserAvatar } from "@/components/task/TaskBits";
import { useTaskStore } from "@/lib/taskStore";
import { useUsers } from "@/lib/useUsers";
import { useProjects } from "@/lib/useProjects";
import { useProjectScope } from "@/lib/projectScope";
import { useAuthStore } from "@/lib/authStore";
import * as tasksApi from "@/lib/tasksApi";
import { fileUrl, formatBytes, thumbUrl } from "@/lib/filesApi";
import { formatDateTimeIST, msIST } from "@/lib/datetime";
import type { Task } from "@/lib/taskTypes";
import { getTask } from "@/lib/tasksApi";
import { previewFile } from "@/lib/filePreview";

/**
 * Taskopad Documents — every file attached to every task you can see, in one place.
 *
 * Nothing here is a copy. Files live once in the shared registry against their task; this page and
 * the project's Files tab ("Tasks" folder) both read that same row. Older attachments stored inline
 * on the task, from before the registry, are listed too until they are moved across.
 */
export default function TaskopadDocumentsPage() {
  return (
    <TaskopadShell>
      <Documents />
    </TaskopadShell>
  );
}

type Section = "all" | "recent" | "mine" | "projects";

interface Doc {
  key: string;
  name: string;
  sizeBytes: number;
  contentType: string | null;
  uploadedBy: string | null;
  createdAt: string | null;
  taskId: string;
  taskCode: string;
  taskTitle: string;
  projectId: string | null;
  fileId: number | null;
  /** Old inline attachment (data URL) — opened directly. */
  dataUrl: string | null;
  hasThumb: boolean;
}

function kindOf(d: Doc): "image" | "sheet" | "doc" {
  const t = (d.contentType ?? "").toLowerCase();
  const n = d.name.toLowerCase();
  if (t.startsWith("image/")) return "image";
  if (t.includes("sheet") || t.includes("excel") || n.endsWith(".csv") || n.endsWith(".xlsx") || n.endsWith(".xls")) return "sheet";
  return "doc";
}

/** "120 KB" / "1.4 MB" / "512 B" → bytes (task lists no longer carry the file itself). */
function sizeFromLabel(label: string | null | undefined): number {
  const m = /([\d.]+)\s*(B|KB|MB|GB)/i.exec(label ?? "");
  if (!m) return 0;
  const mult = { B: 1, KB: 1024, MB: 1024 ** 2, GB: 1024 ** 3 }[m[2].toUpperCase() as "B" | "KB" | "MB" | "GB"];
  return Math.round(Number(m[1]) * mult);
}

function sizeOfDataUrl(url: string): number {
  const comma = url.indexOf(",");
  return comma < 0 ? 0 : Math.floor(((url.length - comma - 1) * 3) / 4);
}

function Documents() {
  const tasks = useTaskStore((s) => s.tasks);
  const load = useTaskStore((s) => s.load);
  const { users } = useUsers();
  const { projects } = useProjects();
  const scope = useProjectScope((s) => s.projectId);
  const me = useAuthStore((s) => (s.user ? String(s.user.id) : ""));
  const [docs, setDocs] = useState<tasksApi.TaskDocumentDto[] | null>(null);
  const [error, setError] = useState("");
  const [section, setSection] = useState<Section>("all");
  const [projectFolder, setProjectFolder] = useState<string | null>(null);
  const [q, setQ] = useState("");
  const [grid, setGrid] = useState(false);
  const [openTask, setOpenTask] = useState<Task | null>(null);

  useEffect(() => {
    load();
    tasksApi
      .getTaskDocuments()
      .then(setDocs)
      .catch((err) => {
        setError(err instanceof Error ? err.message : "Could not load documents.");
        setDocs([]);
      });
  }, [load]);

  const all = useMemo<Doc[]>(() => {
    const reg: Doc[] = (docs ?? []).map((d) => ({
      key: `f-${d.fileId}`,
      name: d.name,
      sizeBytes: d.sizeBytes,
      contentType: d.contentType,
      uploadedBy: d.uploadedBy != null ? String(d.uploadedBy) : null,
      createdAt: d.createdAt,
      taskId: String(d.taskId),
      taskCode: d.taskCode,
      taskTitle: d.taskTitle,
      projectId: d.projectId != null ? String(d.projectId) : null,
      fileId: d.fileId,
      dataUrl: null,
      hasThumb: d.hasThumb,
    }));
    const inRegistry = new Set(reg.map((d) => `${d.taskId}|${d.name}`));
    const legacy: Doc[] = tasks.flatMap((t) =>
      t.attachments
        .filter((a) => (a.url || a.hasData) && !inRegistry.has(`${t.id}|${a.name}`))
        .map((a) => ({
          key: `a-${a.id}`,
          name: a.name,
          sizeBytes: a.url ? sizeOfDataUrl(a.url) : sizeFromLabel(a.size),
          contentType: a.contentType,
          uploadedBy: a.userId || null,
          createdAt: a.at,
          taskId: t.id,
          taskCode: t.code,
          taskTitle: t.title,
          projectId: t.projectId,
          fileId: null,
          dataUrl: a.url,
          hasThumb: false,
        }))
    );
    return [...reg, ...legacy]
      .filter((d) => (scope !== "all" ? d.projectId === scope : true))
      .sort((a, b) => msIST(b.createdAt ?? "") - msIST(a.createdAt ?? ""));
  }, [docs, tasks, scope]);

  const weekAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
  const inSection = all.filter((d) => {
    if (section === "recent") return msIST(d.createdAt ?? "") >= weekAgo;
    if (section === "mine") return d.uploadedBy === me;
    if (section === "projects" && projectFolder !== null) return (d.projectId ?? "none") === projectFolder;
    return true;
  });
  const shown = inSection.filter(
    (d) => !q || d.name.toLowerCase().includes(q.toLowerCase()) || d.taskTitle.toLowerCase().includes(q.toLowerCase()) || d.taskCode.toLowerCase().includes(q.toLowerCase())
  );
  const totalBytes = all.reduce((s, d) => s + d.sizeBytes, 0);

  const folders = useMemo(() => {
    const m = new Map<string, { count: number; bytes: number }>();
    for (const d of all) {
      const k = d.projectId ?? "none";
      const cur = m.get(k) ?? { count: 0, bytes: 0 };
      m.set(k, { count: cur.count + 1, bytes: cur.bytes + d.sizeBytes });
    }
    return [...m.entries()].map(([id, v]) => ({ id, name: id === "none" ? "No project" : projects.find((p) => p.id === id)?.name ?? "Project", ...v }));
  }, [all, projects]);

  const userName = (id: string | null) => (id ? users.find((u) => u.id === id)?.name ?? "Unknown" : "—");
  const projectName = (id: string | null) => (id ? projects.find((p) => p.id === id)?.name ?? "—" : "No project");

  async function openDoc(d: Doc, download = false) {
    try {
      if (d.fileId != null) {
        const url = await fileUrl(d.fileId, !download);
        if (download) window.open(url, "_blank", "noopener");
        else previewFile({ name: d.name, url, contentType: d.contentType });
      } else {
        // An older inline attachment: lists don't carry the file, so fetch its task once.
        let data = d.dataUrl;
        if (!data && d.key.startsWith("a-")) {
          const full = await getTask(Number(d.taskId));
          data = full.attachments?.find((x) => `a-${x.id}` === d.key)?.dataUrl ?? null;
        }
        if (!data) throw new Error("This file has no contents.");
        if (download) {
          const a = document.createElement("a");
          a.href = data;
          a.download = d.name;
          a.click();
        } else {
          previewFile({ name: d.name, url: data, contentType: d.contentType });
        }
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not open the file.");
    }
  }

  const nav: { key: Section; label: string; icon: React.ComponentType<{ size?: number }> }[] = [
    { key: "all", label: "All Documents", icon: Files },
    { key: "recent", label: "Recent", icon: Clock },
    { key: "mine", label: "Uploaded by me", icon: UserRound },
    { key: "projects", label: "By Project", icon: Folder },
  ];

  return (
    <div className="flex flex-col gap-4 lg:flex-row">
      {/* Left rail */}
      <aside className="w-full shrink-0 space-y-3 lg:w-56">
        <nav className="space-y-0.5 rounded-xl border border-gray-200 bg-white p-2">
          {nav.map((n) => (
            <button
              key={n.key}
              onClick={() => {
                setSection(n.key);
                setProjectFolder(null);
              }}
              className={`flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-sm transition-colors ${
                section === n.key ? "bg-cyan-50 font-medium text-brand-accent" : "text-gray-600 hover:bg-gray-50"
              }`}
            >
              <n.icon size={15} /> {n.label}
            </button>
          ))}
        </nav>
        <div className="rounded-xl bg-gradient-to-br from-brand-accent to-cyan-400 p-4 text-white">
          <div className="flex items-center gap-2 text-sm font-semibold">
            <HardDrive size={15} /> Task files
          </div>
          <div className="mt-2 text-xl font-semibold">{formatBytes(totalBytes)}</div>
          <div className="text-xs text-white/80">{all.length} file{all.length === 1 ? "" : "s"} across {folders.length} project folder{folders.length === 1 ? "" : "s"}</div>
        </div>
        <p className="px-1 text-[11px] leading-relaxed text-gray-400">
          These are the same files you see in each project&apos;s Files → Tasks folder. One copy, shown in both places.
        </p>
      </aside>

      {/* Main */}
      <section className="min-w-0 flex-1 space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          <h2 className="mr-2 text-lg font-semibold text-gray-800">
            {section === "projects" && projectFolder !== null ? (
              <button onClick={() => setProjectFolder(null)} className="hover:text-brand-accent">
                By Project <span className="text-gray-400">/</span> {projectName(projectFolder === "none" ? null : projectFolder)}
              </button>
            ) : (
              nav.find((n) => n.key === section)?.label
            )}
          </h2>
          <div className="flex min-w-[200px] flex-1 items-center gap-2 rounded-lg border border-gray-200 bg-white px-3 py-2">
            <Search size={15} className="text-gray-400" />
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search files or tasks…" className="w-full bg-transparent text-sm outline-none" />
          </div>
          <div className="flex overflow-hidden rounded-lg border border-gray-200">
            <button onClick={() => setGrid(false)} className={`p-2 ${!grid ? "bg-cyan-50 text-brand-accent" : "bg-white text-gray-500"}`} title="List">
              <ListIcon size={15} />
            </button>
            <button onClick={() => setGrid(true)} className={`p-2 ${grid ? "bg-cyan-50 text-brand-accent" : "bg-white text-gray-500"}`} title="Grid">
              <LayoutGrid size={15} />
            </button>
          </div>
        </div>

        {error && <div className="rounded-lg border border-rose-200 bg-rose-50 px-4 py-2 text-sm text-rose-700">{error}</div>}

        {docs == null ? (
          <div className="flex min-h-[240px] items-center justify-center rounded-xl border border-gray-200 bg-white text-gray-400">
            <Loader2 className="mr-2 animate-spin" size={18} /> Loading documents…
          </div>
        ) : section === "projects" && projectFolder === null ? (
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {folders.length === 0 && <Empty />}
            {folders.map((f) => (
              <button
                key={f.id}
                onClick={() => setProjectFolder(f.id)}
                className="flex items-center gap-3 rounded-xl border border-gray-200 bg-white p-4 text-left transition-shadow hover:shadow-md"
              >
                <FolderOpen size={28} className="shrink-0 text-amber-400" />
                <div className="min-w-0">
                  <div className="truncate text-sm font-medium text-gray-800">{f.name}</div>
                  <div className="text-xs text-gray-400">
                    {f.count} file{f.count === 1 ? "" : "s"} · {formatBytes(f.bytes)}
                  </div>
                </div>
              </button>
            ))}
          </div>
        ) : shown.length === 0 ? (
          <Empty />
        ) : grid ? (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {shown.map((d) => (
              <div key={d.key} className="group overflow-hidden rounded-xl border border-gray-200 bg-white transition-shadow hover:shadow-md">
                <button onClick={() => void openDoc(d)} className="flex h-32 w-full items-center justify-center bg-gray-50">
                  <Thumb d={d} />
                </button>
                <div className="p-3">
                  <div className="truncate text-sm font-medium text-gray-800" title={d.name}>
                    {d.name}
                  </div>
                  <button onClick={() => setOpenTask(tasks.find((t) => t.id === d.taskId) ?? null)} className="block truncate text-xs text-brand-accent hover:underline">
                    {d.taskCode} · {d.taskTitle}
                  </button>
                  <div className="mt-1 flex items-center justify-between text-[11px] text-gray-400">
                    <span>{formatBytes(d.sizeBytes)}</span>
                    <button onClick={() => void openDoc(d, true)} className="rounded p-1 hover:bg-gray-100 hover:text-gray-700" title="Download">
                      <Download size={13} />
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="overflow-x-auto rounded-xl border border-gray-200 bg-white">
            <table className="w-full min-w-[760px] text-sm">
              <thead>
                <tr className="border-b border-gray-100 bg-gray-50 text-left text-xs text-gray-500">
                  <th className="px-4 py-2 font-medium">File Name</th>
                  <th className="px-4 py-2 font-medium">Task</th>
                  <th className="px-4 py-2 font-medium">Project</th>
                  <th className="px-4 py-2 font-medium">Owner</th>
                  <th className="px-4 py-2 font-medium">Date</th>
                  <th className="px-4 py-2 text-right font-medium">Size</th>
                  <th className="px-4 py-2" />
                </tr>
              </thead>
              <tbody>
                {shown.map((d) => (
                  <tr key={d.key} className="border-t border-gray-50 hover:bg-cyan-50/30">
                    <td className="px-4 py-2.5">
                      <button onClick={() => void openDoc(d)} className="flex items-center gap-2 text-left font-medium text-gray-800 hover:text-brand-accent">
                        <KindIcon d={d} />
                        <span className="truncate">{d.name}</span>
                      </button>
                    </td>
                    <td className="px-4 py-2.5">
                      <button onClick={() => setOpenTask(tasks.find((t) => t.id === d.taskId) ?? null)} className="text-left text-xs text-brand-accent hover:underline">
                        {d.taskCode} · {d.taskTitle}
                      </button>
                    </td>
                    <td className="px-4 py-2.5 text-gray-600">{projectName(d.projectId)}</td>
                    <td className="px-4 py-2.5">
                      <div className="flex items-center gap-2">
                        {d.uploadedBy && <UserAvatar id={d.uploadedBy} name={userName(d.uploadedBy)} size={20} />}
                        <span className="text-gray-600">{userName(d.uploadedBy)}</span>
                      </div>
                    </td>
                    <td className="px-4 py-2.5 text-xs text-gray-500">{d.createdAt ? formatDateTimeIST(d.createdAt) : "—"}</td>
                    <td className="px-4 py-2.5 text-right text-xs text-gray-500">{formatBytes(d.sizeBytes)}</td>
                    <td className="px-4 py-2.5 text-right">
                      <div className="flex justify-end gap-1">
                        <button onClick={() => void openDoc(d)} className="rounded-md p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-700" title="Open">
                          <ExternalLink size={14} />
                        </button>
                        <button onClick={() => void openDoc(d, true)} className="rounded-md p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-700" title="Download">
                          <Download size={14} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
      {openTask && <TaskDrawer existing={openTask} onClose={() => setOpenTask(null)} />}
    </div>
  );
}

function KindIcon({ d }: { d: Doc }) {
  const k = kindOf(d);
  if (k === "image") return <FileImage size={16} className="shrink-0 text-violet-500" />;
  if (k === "sheet") return <FileSpreadsheet size={16} className="shrink-0 text-emerald-600" />;
  return <FileText size={16} className="shrink-0 text-brand-accent" />;
}

function Thumb({ d }: { d: Doc }) {
  const [src, setSrc] = useState<string | null>(d.dataUrl && kindOf(d) === "image" ? d.dataUrl : null);
  useEffect(() => {
    if (d.fileId == null || !d.hasThumb) return;
    let cancelled = false;
    thumbUrl(d.fileId)
      .then((u) => !cancelled && setSrc(u))
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [d.fileId, d.hasThumb]);
  if (src) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={src} alt={d.name} className="h-full w-full object-cover" />;
  }
  const k = kindOf(d);
  const Icon = k === "image" ? FileImage : k === "sheet" ? FileSpreadsheet : FileText;
  return <Icon size={36} className="text-gray-300" />;
}

function Empty() {
  return (
    <div className="flex min-h-[240px] flex-col items-center justify-center rounded-xl border border-dashed border-gray-300 bg-white text-center">
      <Files size={28} className="mb-2 text-gray-300" />
      <div className="text-sm font-medium text-gray-600">No documents here</div>
      <p className="mt-1 max-w-xs text-xs text-gray-400">Files attached to tasks — from the chat or the Attachment tab — appear here automatically.</p>
    </div>
  );
}
