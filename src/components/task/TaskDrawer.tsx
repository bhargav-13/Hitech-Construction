"use client";

import { useRef, useState } from "react";
import { X, Paperclip, Bell, Plus, Trash2, Send, ListTree, FileText, Loader2 } from "lucide-react";
import { useAppStore } from "@/lib/store";
import { useAuthStore } from "@/lib/authStore";
import { useUsers } from "@/lib/useUsers";
import { useProjects } from "@/lib/useProjects";
import { useTaskStore } from "@/lib/taskStore";
import { TASK_PRIORITIES, TASK_STATUSES, formatTaskDate, toIso } from "@/lib/taskTypes";
import type { SubTask, Task, TaskPriority, TaskStatus } from "@/lib/taskTypes";
import { UserAvatar } from "./TaskBits";
import { Select } from "@/components/Select";

type Panel = "Comment" | "Attachment" | "Log Activity";

/**
 * Add / edit a task. TaskOPad shows this as a centre popup; we use a right slide-over to match the
 * rest of the ERP. Left = the task form, right = Comment / Attachment / Activity — all backed by the
 * real task API (project-service). People come from the real user-management-service.
 */
export function TaskDrawer({
  existing,
  defaultProjectId,
  onClose,
}: {
  existing?: Task;
  defaultProjectId?: string | null;
  onClose: () => void;
}) {
  const { projects } = useProjects();
  const { users } = useUsers();
  const authUser = useAuthStore((s) => s.user);
  const parties = useAppStore((s) => s.parties);

  const createTask = useTaskStore((s) => s.createTask);
  const saveTask = useTaskStore((s) => s.saveTask);
  const addComment = useTaskStore((s) => s.addComment);
  const addAttachment = useTaskStore((s) => s.addAttachment);
  // Re-read the live task from the store so newly added comments/attachments/activity show at once.
  const liveTask = useTaskStore((s) => (existing ? s.tasks.find((t) => t.id === existing.id) ?? existing : undefined));

  const defaultAssignee = existing?.assigneeId ?? (authUser ? String(authUser.id) : users[0]?.id ?? "");

  const [title, setTitle] = useState(existing?.title ?? "");
  const [description, setDescription] = useState(existing?.description ?? "");
  const [dueDate, setDueDate] = useState(existing?.dueDate ?? toIso(new Date()));
  const [status, setStatus] = useState<TaskStatus>(existing?.status ?? "Pending");
  const [priority, setPriority] = useState<TaskPriority>(existing?.priority ?? "Low");
  const [projectId, setProjectId] = useState<string>(existing?.projectId ?? defaultProjectId ?? "");
  const [assigneeId, setAssigneeId] = useState<string>(defaultAssignee);
  const [followerIds, setFollowerIds] = useState<string[]>(existing?.followerIds ?? []);
  const [clientName, setClientName] = useState<string>(existing?.clientName ?? "");
  const [progress, setProgress] = useState(existing?.progress ?? 0);
  const [subtasks, setSubtasks] = useState<SubTask[]>(existing?.subtasks ?? []);
  const [subtaskInput, setSubtaskInput] = useState("");
  const [panel, setPanel] = useState<Panel>("Comment");
  const [commentText, setCommentText] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [sendingComment, setSendingComment] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const clients = parties.filter((p) => p.type === "Client");

  async function save(asDraft: boolean) {
    if (!title.trim()) return setError("Task title is required.");
    if (!dueDate) return setError("Due date is required.");
    if (!assigneeId) return setError("An assignee is required.");

    const payload = {
      title: title.trim(),
      description: description.trim(),
      projectId: projectId || null,
      assigneeId,
      followerIds,
      clientName: clientName || null,
      status,
      priority,
      progress,
      dueDate,
      subtasks,
      isDraft: asDraft,
    };

    setSaving(true);
    setError("");
    try {
      if (existing) await saveTask(existing.id, payload);
      else await createTask(payload);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save the task.");
      setSaving(false);
    }
  }

  function addSubtask() {
    if (!subtaskInput.trim()) return;
    setSubtasks((s) => [...s, { id: `st-${Date.now()}`, title: subtaskInput.trim(), done: false }]);
    setSubtaskInput("");
  }

  async function sendComment() {
    if (!commentText.trim() || !existing) return;
    setSendingComment(true);
    try {
      await addComment(existing.id, commentText.trim());
      setCommentText("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not add comment.");
    } finally {
      setSendingComment(false);
    }
  }

  async function onUploadFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file || !existing) return;
    try {
      await addAttachment(existing.id, {
        name: file.name,
        sizeLabel: formatBytes(file.size),
        contentType: file.type || undefined,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not attach the file.");
    }
  }

  const userName = (id: string) => users.find((u) => u.id === id)?.name ?? "Unknown";

  return (
    <div className="animate-overlay-in fixed inset-0 z-50 flex justify-end bg-black/40" onClick={onClose}>
      <div
        className="animate-slide-in-right flex h-full w-full max-w-5xl flex-col overflow-hidden bg-white shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="h-1 w-full bg-gradient-to-r from-brand-accent to-cyan-400" />

        {/* Header */}
        <div className="flex items-center justify-between border-b border-gray-100 px-6 py-3">
          <div className="flex items-center gap-4">
            <h2 className="text-base font-semibold text-gray-800">
              {existing ? `Edit Task · ${existing.code}` : "Add Task"}
            </h2>
            <div className="flex items-center gap-2">
              <span className="text-xs text-gray-400">Progress</span>
              <input
                type="range"
                min={0}
                max={100}
                step={5}
                value={progress}
                onChange={(e) => setProgress(Number(e.target.value))}
                className="h-1 w-28 accent-cyan-600"
              />
              <span className="w-9 text-xs font-medium text-gray-700">{progress}%</span>
            </div>
          </div>
          <div className="flex items-center gap-1 text-gray-400">
            <button title="Reminder" className="rounded-md p-1.5 transition-colors duration-150 hover:bg-gray-100 hover:text-gray-600">
              <Bell size={16} />
            </button>
            <button
              onClick={onClose}
              className="rounded-full p-1.5 transition-all duration-150 hover:bg-gray-100 hover:text-gray-600 active:scale-90"
            >
              <X size={18} />
            </button>
          </div>
        </div>

        <div className="flex min-h-0 flex-1">
          {/* Form */}
          <div className="flex min-w-0 flex-1 flex-col border-r border-gray-100">
            <div className="flex-1 space-y-4 overflow-y-auto px-6 py-5">
              <input
                value={title}
                onChange={(e) => {
                  setTitle(e.target.value);
                  setError("");
                }}
                placeholder="Write your task"
                className="w-full border-b border-gray-200 pb-2 text-base font-medium text-gray-800 outline-none transition-colors duration-150 placeholder:text-gray-300 focus:border-cyan-500"
                autoFocus
              />

              <div className="flex flex-wrap items-center gap-3">
                <label className="flex items-center gap-2">
                  <span className="text-xs font-medium text-gray-400">Due Date *</span>
                  <input
                    type="date"
                    value={dueDate}
                    onChange={(e) => setDueDate(e.target.value)}
                    className="rounded-lg border border-gray-200 px-2 py-1.5 text-sm outline-none transition-colors duration-150 focus:border-cyan-500"
                  />
                </label>

                <Select
                  value={status}
                  onChange={(v) => setStatus(v as TaskStatus)}
                  size="sm"
                  options={TASK_STATUSES.map((s) => ({ value: s, label: s }))}
                />

                <Select
                  value={priority}
                  onChange={(v) => setPriority(v as TaskPriority)}
                  size="sm"
                  options={TASK_PRIORITIES.map((p) => ({ value: p, label: p }))}
                />
              </div>

              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                rows={3}
                placeholder="Task description"
                className="input resize-none"
              />

              <Field label="Project">
                <Select
                  value={projectId}
                  onChange={setProjectId}
                  placeholder="No project"
                  options={[
                    { value: "", label: "No project" },
                    ...projects.map((p) => ({ value: p.id, label: p.name })),
                  ]}
                />
              </Field>

              <Field label="Assignee *">
                <Select
                  value={assigneeId}
                  onChange={setAssigneeId}
                  placeholder="Select assignee"
                  options={users.map((u) => ({ value: u.id, label: `${u.name} · ${u.role}` }))}
                />
              </Field>

              <Field label="Client">
                <Select
                  value={clientName}
                  onChange={setClientName}
                  placeholder="No client"
                  options={[
                    { value: "", label: "No client" },
                    ...clients.map((c) => ({ value: c.name, label: c.name })),
                  ]}
                />
              </Field>

              <Field label="Followers">
                <div className="flex flex-wrap gap-2">
                  {users.map((u) => {
                    const on = followerIds.includes(u.id);
                    return (
                      <button
                        key={u.id}
                        onClick={() =>
                          setFollowerIds((ids) => (on ? ids.filter((i) => i !== u.id) : [...ids, u.id]))
                        }
                        className={`flex items-center gap-1.5 rounded-full border px-2 py-1 text-xs transition-all duration-150 active:scale-95 ${
                          on
                            ? "border-brand-accent bg-cyan-50 text-brand-accent"
                            : "border-gray-200 text-gray-500 hover:border-gray-300"
                        }`}
                      >
                        <UserAvatar id={u.id} name={u.name} size={18} />
                        {u.name.split(" ")[0]}
                      </button>
                    );
                  })}
                </div>
              </Field>

              {/* Subtasks */}
              <Field label={`Sub tasks (${subtasks.filter((s) => s.done).length}/${subtasks.length})`}>
                <div className="space-y-2">
                  {subtasks.map((s) => (
                    <div key={s.id} className="flex items-center gap-2 rounded-lg border border-gray-100 px-3 py-1.5">
                      <input
                        type="checkbox"
                        checked={s.done}
                        onChange={() =>
                          setSubtasks((list) =>
                            list.map((x) => (x.id === s.id ? { ...x, done: !x.done } : x))
                          )
                        }
                        className="h-3.5 w-3.5 accent-cyan-600"
                      />
                      <span className={`flex-1 text-sm ${s.done ? "text-gray-400 line-through" : "text-gray-700"}`}>
                        {s.title}
                      </span>
                      <button
                        onClick={() => setSubtasks((list) => list.filter((x) => x.id !== s.id))}
                        className="rounded p-1 text-gray-300 transition-colors duration-150 hover:bg-rose-50 hover:text-rose-500"
                      >
                        <Trash2 size={13} />
                      </button>
                    </div>
                  ))}
                  <div className="flex gap-2">
                    <input
                      value={subtaskInput}
                      onChange={(e) => setSubtaskInput(e.target.value)}
                      onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), addSubtask())}
                      placeholder="Add a sub task"
                      className="input flex-1"
                    />
                    <button
                      onClick={addSubtask}
                      className="flex items-center gap-1 rounded-lg border border-gray-200 px-3 text-sm text-gray-600 transition-all duration-150 hover:border-brand-accent hover:text-brand-accent active:scale-95"
                    >
                      <Plus size={14} />
                    </button>
                  </div>
                </div>
              </Field>

              {error && <div className="text-xs font-medium text-rose-600">{error}</div>}
            </div>

            {/* Footer */}
            <div className="flex justify-end gap-2 border-t border-gray-100 px-6 py-3">
              <button
                onClick={onClose}
                disabled={saving}
                className="rounded-lg border border-gray-200 px-4 py-2 text-sm font-medium text-gray-600 transition-all duration-150 hover:bg-gray-50 active:scale-95 disabled:opacity-50"
              >
                Close
              </button>
              <button
                onClick={() => save(true)}
                disabled={saving}
                className="rounded-lg border border-gray-200 px-4 py-2 text-sm font-medium text-gray-600 transition-all duration-150 hover:bg-gray-50 active:scale-95 disabled:opacity-50"
              >
                Draft
              </button>
              <button
                onClick={() => save(false)}
                disabled={saving}
                className="flex items-center gap-1.5 rounded-lg bg-brand-accent px-5 py-2 text-sm font-medium text-white transition-all duration-150 hover:opacity-90 active:scale-95 disabled:opacity-60"
              >
                {saving && <Loader2 size={14} className="animate-spin" />}
                {existing ? "Save" : "Submit"}
              </button>
            </div>
          </div>

          {/* Side panel */}
          <div className="hidden w-[340px] shrink-0 flex-col lg:flex">
            <div className="flex border-b border-gray-100">
              {(["Comment", "Attachment", "Log Activity"] as Panel[]).map((p) => (
                <button
                  key={p}
                  onClick={() => setPanel(p)}
                  className={`flex-1 border-b-2 py-3 text-xs font-medium transition-colors duration-150 ${
                    panel === p ? "border-brand-accent text-brand-accent" : "border-transparent text-gray-500 hover:text-gray-700"
                  }`}
                >
                  {p}
                </button>
              ))}
            </div>

            <div className="flex-1 overflow-y-auto px-4 py-3">
              {!existing || !liveTask ? (
                <p className="py-10 text-center text-xs text-gray-400">
                  Save the task to start a discussion, attach files and see its activity log.
                </p>
              ) : panel === "Comment" ? (
                liveTask.comments.length === 0 ? (
                  <p className="py-10 text-center text-xs text-gray-400">No comments yet.</p>
                ) : (
                  <div className="space-y-3">
                    {liveTask.comments.map((c) => (
                      <div key={c.id} className="flex gap-2">
                        <UserAvatar id={c.userId} name={userName(c.userId)} size={26} />
                        <div className="min-w-0 flex-1">
                          <div className="text-xs font-medium text-gray-700">{userName(c.userId)}</div>
                          <div className="text-sm text-gray-600">{c.text}</div>
                          <div className="text-[10px] text-gray-400">{formatTaskDate(c.at)}</div>
                        </div>
                      </div>
                    ))}
                  </div>
                )
              ) : panel === "Attachment" ? (
                <div className="space-y-3">
                  <button
                    onClick={() => fileRef.current?.click()}
                    className="flex w-full items-center justify-center gap-1.5 rounded-lg border border-dashed border-gray-300 py-3 text-sm text-gray-500 transition-colors duration-150 hover:border-brand-accent hover:text-brand-accent"
                  >
                    <Paperclip size={14} /> Upload a file
                  </button>
                  <input ref={fileRef} type="file" hidden onChange={onUploadFile} />
                  {liveTask.attachments.length === 0 ? (
                    <p className="py-6 text-center text-xs text-gray-400">No attachments yet.</p>
                  ) : (
                    liveTask.attachments.map((a) => (
                      <div key={a.id} className="flex items-center gap-2 rounded-lg border border-gray-100 px-3 py-2">
                        <FileText size={16} className="shrink-0 text-brand-accent" />
                        <div className="min-w-0 flex-1">
                          <div className="truncate text-sm text-gray-700">{a.name}</div>
                          <div className="text-[10px] text-gray-400">
                            {a.size} · {formatTaskDate(a.at)}
                          </div>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              ) : (
                <div className="space-y-3">
                  {liveTask.activity.map((a) => (
                    <div key={a.id} className="flex gap-2">
                      <div className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-brand-accent" />
                      <div>
                        <div className="text-sm text-gray-600">{a.text}</div>
                        <div className="text-[10px] text-gray-400">{formatTaskDate(a.at)}</div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {existing && liveTask && panel === "Comment" && (
              <div className="flex items-center gap-2 border-t border-gray-100 px-3 py-2">
                <input
                  value={commentText}
                  onChange={(e) => setCommentText(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && sendComment()}
                  placeholder="Type a message"
                  className="flex-1 rounded-full border border-gray-200 px-3 py-1.5 text-sm outline-none transition-colors duration-150 focus:border-cyan-500"
                />
                <button
                  onClick={sendComment}
                  disabled={sendingComment}
                  className="rounded-full bg-brand-accent p-2 text-white transition-all duration-150 hover:opacity-90 active:scale-90 disabled:opacity-60"
                >
                  {sendingComment ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />}
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1.5 flex items-center gap-1 text-[11px] font-medium tracking-wide text-gray-400 uppercase">
        {label.includes("Sub tasks") && <ListTree size={11} />}
        {label}
      </span>
      {children}
    </label>
  );
}
