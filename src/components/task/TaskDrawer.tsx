"use client";

import { useMemo, useRef, useState } from "react";
import {
  X,
  Paperclip,
  Download,
  Bell,
  Plus,
  Trash2,
  Send,
  ListTree,
  FileText,
  Loader2,
  CheckCircle2,
  Eye,
  Lock,
  Image as ImageIcon,
  MessageSquare,
  ClipboardCheck,
} from "lucide-react";
import { useAppStore } from "@/lib/store";
import { useAuthStore } from "@/lib/authStore";
import { useUsers } from "@/lib/useUsers";
import { useDepartments } from "@/lib/useDepartments";
import { useProjects } from "@/lib/useProjects";
import { useTaskStore } from "@/lib/taskStore";
import { TASK_PRIORITIES, TASK_STATUSES, formatTaskDateTime, toIso } from "@/lib/taskTypes";
import { formatChatStampIST, msIST } from "@/lib/datetime";
import type { SubTask, Task, TaskAttachment, TaskComment, TaskPriority, TaskStatus } from "@/lib/taskTypes";
import { UserAvatar, PeopleSelect, PeopleMultiSelect, ClientSelect } from "./TaskBits";
import type { Person } from "./TaskBits";
import { AttachmentPreview, canPreview } from "./AttachmentPreview";
import { Select } from "@/components/Select";
import { DatePicker } from "@/components/DatePicker";
import type { RecurrenceRule } from "@/components/DatePicker";
import { useDrawerDismiss } from "@/lib/useDrawerDismiss";
import { useTaskRights } from "@/lib/taskPermissions";

type Panel = "Comment" | "Attachment" | "Log Activity";

/** Reminder shortcuts, expressed relative to the task's due date. */
const REMINDER_PRESETS: { label: string; from: (dueDate: string) => string }[] = [
  { label: "On due", from: (d) => d || toIso(new Date()) },
  { label: "1d before", from: (d) => shiftDays(d, -1) },
  { label: "3d before", from: (d) => shiftDays(d, -3) },
];

function shiftDays(dateStr: string, days: number): string {
  const base = dateStr ? new Date(dateStr) : new Date();
  if (Number.isNaN(base.getTime())) return toIso(new Date());
  base.setDate(base.getDate() + days);
  return toIso(base);
}

/**
 * `reminderAt` holds a time-of-day ("HH:mm") for repeating tasks — a fixed calendar date would be
 * meaningless once the task rolls to its next occurrence — and a date ("YYYY-MM-DD"), optionally
 * with a time ("YYYY-MM-DDTHH:mm"), for one-off tasks.
 */
function splitReminder(value: string | null | undefined): { date: string; time: string } {
  if (!value) return { date: "", time: "" };
  if (/^\d{1,2}:\d{2}$/.test(value)) return { date: "", time: value };
  const [date, time] = value.split("T");
  return { date: date ?? "", time: (time ?? "").slice(0, 5) };
}

/** Recombine the two inputs into the single stored value. */
function joinReminder(date: string, time: string, repeating: boolean): string | null {
  if (repeating) return time || null;
  if (!date) return null;
  return time ? `${date}T${time}` : date;
}

type ActivityItem = { id: number | string; text: string; at: string; userId?: string };

function activityIcon(text: string) {
  const t = text.toLowerCase();
  if (t.includes("attach")) return ImageIcon;
  if (t.includes("comment")) return MessageSquare;
  if (t.includes("creat")) return ClipboardCheck;
  return CheckCircle2;
}

/**
 * WhatsApp-style discussion thread for a task. Merges comments and attachments into one timeline
 * sorted by time; the current user's messages bubble right in accent colour, everyone else's
 * bubble left on a light background. Attachments render as a compact file card inside a bubble
 * so uploads show up in the conversation instead of being hidden away in the Attachment tab.
 */
// `id` is prefixed so a comment and an attachment can't collide as React keys; `sourceId` keeps the
// unprefixed id around for callers that need to act on the underlying record.
type ChatEntry =
  | { kind: "comment"; id: string; sourceId: string; userId: string; at: string; text: string }
  | { kind: "attachment"; id: string; sourceId: string; userId: string; at: string; att: TaskAttachment };

function ChatThread({
  comments,
  attachments,
  userName,
  meId,
  onOpenAttachment,
  onRemove,
}: {
  comments: TaskComment[];
  attachments: TaskAttachment[];
  userName: (id: string) => string;
  meId: string;
  onOpenAttachment: (att: TaskAttachment) => void;
  /** Set only while composing a new task, where nothing has been sent yet and can still be pulled back. */
  onRemove?: (kind: "comment" | "attachment", id: string) => void;
}) {
  const entries = useMemo<ChatEntry[]>(() => {
    const merged: ChatEntry[] = [
      ...comments.map((c) => ({ kind: "comment" as const, id: `c-${c.id}`, sourceId: c.id, userId: c.userId, at: c.at, text: c.text })),
      ...attachments.map((a) => ({ kind: "attachment" as const, id: `a-${a.id}`, sourceId: a.id, userId: a.userId, at: a.at, att: a })),
    ];
    // Oldest first — matches WhatsApp reading order; the composer sits below. Sorted on the resolved
    // instant rather than the raw string, since drafted entries and saved ones are spelled
    // differently (`…Z` vs `…+05:30`) and would not sort against each other as text.
    merged.sort((x, y) => msIST(x.at) - msIST(y.at));
    return merged;
  }, [comments, attachments]);

  if (entries.length === 0) {
    return <p className="py-10 text-center text-xs text-gray-400">No messages yet. Say hi 👋</p>;
  }

  return (
    <div className="flex flex-col gap-2">
      {entries.map((e) => {
        const mine = e.userId === meId;
        return (
          <div key={e.id} className={`flex items-end gap-1.5 ${mine ? "justify-end" : "justify-start"}`}>
            {!mine && <UserAvatar id={e.userId} name={userName(e.userId)} size={22} />}
            <div className={`flex max-w-[78%] flex-col ${mine ? "items-end" : "items-start"}`}>
              {!mine && (
                <span className="mb-0.5 px-1 text-[10px] font-medium text-gray-500">
                  {userName(e.userId)}
                </span>
              )}
              {e.kind === "comment" ? (
                <div
                  className={`whitespace-pre-wrap break-words rounded-2xl px-3 py-1.5 text-sm shadow-sm ${
                    mine
                      ? "rounded-br-sm bg-brand-accent text-white"
                      : "rounded-bl-sm bg-gray-100 text-gray-800"
                  }`}
                >
                  {e.text}
                </div>
              ) : (
                <AttachmentBubble att={e.att} mine={mine} onOpen={onOpenAttachment} />
              )}
              <span className="mt-0.5 flex items-center gap-1 px-1 text-[10px] text-gray-400">
                {onRemove ? (
                  <>
                    <span title="Sent when you create the task">Not sent yet</span>
                    <button
                      onClick={() => onRemove(e.kind, e.sourceId)}
                      title="Remove"
                      className="text-gray-400 transition-colors duration-150 hover:text-rose-500"
                    >
                      <X size={11} />
                    </button>
                  </>
                ) : (
                  <span title={formatTaskDateTime(e.at)}>{formatChatStampIST(e.at)}</span>
                )}
              </span>
            </div>
          </div>
        );
      })}
    </div>
  );
}

/**
 * One attached file inside the chat. Images show as a real thumbnail so the conversation reads at a
 * glance; everything else keeps the compact file card. Clicking opens the preview rather than
 * downloading — downloading is still available from inside the viewer.
 */
function AttachmentBubble({
  att,
  mine,
  onOpen,
}: {
  att: TaskAttachment;
  mine: boolean;
  onOpen: (att: TaskAttachment) => void;
}) {
  const previewable = canPreview(att);
  const isImage = previewable && (att.contentType ?? "").startsWith("image/");
  const bubble = mine ? "rounded-br-sm bg-brand-accent text-white" : "rounded-bl-sm bg-gray-100 text-gray-800";

  if (isImage && att.url) {
    return (
      <button
        onClick={() => onOpen(att)}
        title={`Preview ${att.name}`}
        className={`max-w-[240px] overflow-hidden rounded-2xl shadow-sm transition-opacity duration-150 hover:opacity-90 ${bubble}`}
      >
        {/* Stored as a data URL, so next/image can't optimise it. */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={att.url} alt={att.name} className="max-h-44 w-full object-cover" />
        <span className="block px-2.5 py-1 text-left text-[10px] opacity-80">{att.size || "Image"}</span>
      </button>
    );
  }

  const body = (
    <>
      <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${mine ? "bg-white/20" : "bg-white"}`}>
        <FileText size={14} />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-xs font-medium">{att.name}</span>
        <span className={`block truncate text-[10px] ${mine ? "text-white/80" : "text-gray-500"}`}>
          {att.size || "File"}
          {!att.url ? " · No file data" : previewable ? " · Tap to preview" : " · Tap to download"}
        </span>
      </span>
    </>
  );
  const shell = `flex max-w-[240px] items-center gap-2 rounded-2xl px-2.5 py-1.5 text-left text-sm shadow-sm transition-opacity duration-150 ${bubble}`;

  if (previewable) {
    return (
      <button onClick={() => onOpen(att)} title={`Preview ${att.name}`} className={`${shell} cursor-pointer hover:opacity-90`}>
        {body}
      </button>
    );
  }
  // Nothing to render inline, but the bytes are there — keep the plain download.
  if (att.url) {
    return (
      <a href={att.url} download={att.name} title={`Download ${att.name}`} className={`${shell} cursor-pointer hover:opacity-90`}>
        {body}
      </a>
    );
  }
  return <span className={`${shell} cursor-default`}>{body}</span>;
}

/**
 * Single-column vertical activity timeline. Each entry is one row: icon + text + actor + time,
 * connected by a subtle dotted line down the left. No side-alternation, no measured curve.
 */
function ActivityTimeline({
  items,
  userName,
}: {
  items: ActivityItem[];
  userName?: (id: string) => string;
}) {
  if (items.length === 0) {
    return <p className="py-10 text-center text-xs text-gray-400">No activity yet.</p>;
  }
  return (
    <ol className="relative pl-6">
      <span
        aria-hidden
        className="absolute left-[11px] top-3 bottom-3 w-px border-l border-dashed border-cyan-200"
      />
      {items.map((a) => {
        const Icon = activityIcon(a.text);
        const actor = a.userId && userName ? userName(a.userId) : null;
        return (
          <li key={a.id} className="relative py-2.5">
            <span className="absolute -left-6 top-2.5 flex h-6 w-6 items-center justify-center rounded-full border border-cyan-200 bg-white text-brand-accent shadow-sm">
              <Icon size={12} />
            </span>
            <div className="text-sm leading-snug text-gray-700">{a.text}</div>
            <div className="mt-0.5 text-[10px] text-gray-400">
              {actor && <span className="mr-1 font-medium text-gray-500">{actor}</span>}
              {formatTaskDateTime(a.at)}
            </div>
          </li>
        );
      })}
    </ol>
  );
}

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
  const { departments } = useDepartments();
  const authUser = useAuthStore((s) => s.user);
  const parties = useAppStore((s) => s.parties);
  const addParty = useAppStore((s) => s.addParty);
  const { closing, requestClose } = useDrawerDismiss(onClose);

  const createTask = useTaskStore((s) => s.createTask);
  const saveTask = useTaskStore((s) => s.saveTask);
  const patchTask = useTaskStore((s) => s.patchTask);
  const addComment = useTaskStore((s) => s.addComment);
  const addAttachment = useTaskStore((s) => s.addAttachment);
  const toggleSubtask = useTaskStore((s) => s.toggleSubtask);
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
  const [reminderDate, setReminderDate] = useState(() => splitReminder(existing?.reminderAt).date);
  const [reminderTime, setReminderTime] = useState(() => splitReminder(existing?.reminderAt).time);
  const [recurrenceRule, setRecurrenceRule] = useState<RecurrenceRule>(
    (existing?.recurrenceRule as RecurrenceRule) ?? "NONE"
  );
  const [recurrenceInterval, setRecurrenceInterval] = useState(existing?.recurrenceInterval ?? 1);
  const [departmentId, setDepartmentId] = useState<string>(existing?.departmentId ?? "");
  const [panel, setPanel] = useState<Panel>("Comment");
  const [commentText, setCommentText] = useState("");
  // Comments and files added while composing a brand-new task. The API can only hang them off a
  // task id, which doesn't exist yet, so they're held here and posted right after the create call.
  const [draftComments, setDraftComments] = useState<TaskComment[]>([]);
  const [draftAttachments, setDraftAttachments] = useState<TaskAttachment[]>([]);
  // Set once the create succeeds. Guards against a second create if posting the drafted
  // comments/files then fails and the user hits Submit again.
  const [createdId, setCreatedId] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [sendingComment, setSendingComment] = useState(false);
  const [togglingSubtaskId, setTogglingSubtaskId] = useState<string | null>(null);
  const [previewId, setPreviewId] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  // Ids for drafted chat/files. A counter rather than Date.now(), which repeats within a millisecond
  // and would hand two entries the same React key.
  const draftSeq = useRef(0);

  // Who may change what. A task's details belong to its creator (and Super Admin); the assignee
  // owns the work, so they get status and progress. Everyone else can still chat and attach.
  const { rightsFor } = useTaskRights();
  const rights = rightsFor(existing);
  const readOnlyFields = !rights.canEditAll;

  const clients = parties.filter((p) => p.type === "Client");
  // A repeating task reminds at a time of day on each occurrence, so it carries no reminder date.
  const isRepeating = recurrenceRule !== "NONE";

  // People for the searchable pickers. Assignee is scoped to the chosen department; followers span all.
  const allPeople: Person[] = users.map((u) => ({ id: u.id, name: u.name, role: u.role }));
  const assigneePeople: Person[] = departmentId
    ? users.filter((u) => String(u.departmentId ?? "") === departmentId).map((u) => ({ id: u.id, name: u.name, role: u.role }))
    : allPeople;

  async function save(asDraft: boolean) {
    // An assignee may move the work along but not rewrite the record, so their save is a narrow
    // PATCH of just those two fields rather than a full PUT of the (disabled) form.
    if (existing && !rights.canEditAll) {
      if (!rights.canSetStatus && !rights.canSetProgress) return;
      setSaving(true);
      setError("");
      try {
        await patchTask(existing.id, { status, progress });
        requestClose();
      } catch (err) {
        setError(err instanceof Error ? err.message : "Could not save the task.");
        setSaving(false);
      }
      return;
    }

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
      pinned: existing?.pinned ?? false,
      reminderAt: joinReminder(reminderDate, reminderTime, isRepeating),
      recurrenceRule,
      recurrenceInterval,
      departmentId: departmentId || null,
    };

    setSaving(true);
    setError("");
    try {
      const targetId = existing?.id ?? createdId;
      let taskId: string;
      if (targetId) {
        await saveTask(targetId, payload);
        taskId = targetId;
      } else {
        const created = await createTask(payload);
        setCreatedId(created.id);
        taskId = created.id;
      }
      // Drafted chat and files can only be posted now that the task has an id. Sequential, because
      // each call returns the whole task and the store mirrors the last response — parallel writes
      // would race and drop entries. Each item is cleared as it lands, so a retry after a failure
      // only resends what's left.
      await flushDrafts(taskId);
      requestClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save the task.");
      setSaving(false);
    }
  }

  /** Posts the comments/attachments drafted before the task existed. Throws on the first failure. */
  async function flushDrafts(taskId: string) {
    for (const c of draftComments) {
      await addComment(taskId, c.text);
      setDraftComments((list) => list.filter((x) => x.id !== c.id));
    }
    for (const a of draftAttachments) {
      await addAttachment(taskId, {
        name: a.name,
        sizeLabel: a.size,
        contentType: a.contentType ?? undefined,
        dataUrl: a.url ?? undefined,
      });
      setDraftAttachments((list) => list.filter((x) => x.id !== a.id));
    }
  }

  function addSubtask() {
    if (!subtaskInput.trim()) return;
    setSubtasks((s) => [...s, { id: `st-${Date.now()}`, title: subtaskInput.trim(), done: false }]);
    setSubtaskInput("");
  }

  /**
   * Tick a sub task off.
   *
   * For the creator/Super Admin this is just another edited field — it rides along with Save like
   * the title or the due date. The assignee has no full-save path (their Save is a narrow PATCH of
   * status and progress), so their tick has to persist on its own through the dedicated toggle
   * endpoint, and is rolled back if that call fails.
   */
  async function onToggleSubtask(s: SubTask) {
    const next = !s.done;
    setSubtasks((list) => list.map((x) => (x.id === s.id ? { ...x, done: next } : x)));
    if (rights.canEditAll || !existing) return;
    setTogglingSubtaskId(s.id);
    try {
      await toggleSubtask(existing.id, s.id);
    } catch (err) {
      setSubtasks((list) => list.map((x) => (x.id === s.id ? { ...x, done: !next } : x)));
      setError(err instanceof Error ? err.message : "Could not update the sub task.");
    } finally {
      setTogglingSubtaskId(null);
    }
  }

  async function sendComment() {
    const text = commentText.trim();
    if (!text) return;
    // Composing a new task: hold the message until there's a task to hang it off.
    if (!existing) {
      setDraftComments((list) => [
        ...list,
        { id: `draft-${++draftSeq.current}`, userId: meId, text, at: new Date().toISOString() },
      ]);
      setCommentText("");
      return;
    }
    setSendingComment(true);
    try {
      await addComment(existing.id, text);
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
    if (!file) return;
    // Store the file contents as a data URL so it can actually be downloaded later.
    const MAX_BYTES = 8 * 1024 * 1024; // 8 MB
    if (file.size > MAX_BYTES) {
      setError("File is too large to attach (max 8 MB).");
      return;
    }
    try {
      const dataUrl = await readAsDataUrl(file);
      // Composing a new task: keep the file locally until the create call gives us an id.
      if (!existing) {
        setDraftAttachments((list) => [
          ...list,
          {
            id: `draft-${++draftSeq.current}`,
            name: file.name,
            size: formatBytes(file.size),
            at: new Date().toISOString(),
            url: dataUrl,
            userId: meId,
            contentType: file.type || null,
          },
        ]);
        return;
      }
      await addAttachment(existing.id, {
        name: file.name,
        sizeLabel: formatBytes(file.size),
        contentType: file.type || undefined,
        dataUrl,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not attach the file.");
    }
  }

  function removeDraft(kind: "comment" | "attachment", id: string) {
    if (kind === "comment") setDraftComments((list) => list.filter((c) => c.id !== id));
    else setDraftAttachments((list) => list.filter((a) => a.id !== id));
  }

  const userName = (id: string) => users.find((u) => u.id === id)?.name ?? "Unknown";
  const meId = authUser ? String(authUser.id) : "";

  // A task being composed has no server-side thread yet, so the side panel runs off the local
  // drafts instead. Everything below reads these rather than `liveTask` directly.
  const isDrafting = !existing;
  const panelComments = liveTask ? liveTask.comments : draftComments;
  const panelAttachments = liveTask ? liveTask.attachments : draftAttachments;

  return (
    <div
      className={`fixed inset-0 z-50 flex justify-end bg-black/40 ${
        closing ? "animate-overlay-out" : "animate-overlay-in"
      }`}
      onClick={requestClose}
    >
      <div
        className={`flex h-full w-full max-w-5xl flex-col overflow-hidden bg-white shadow-2xl ${
          closing ? "animate-slide-out-right" : "animate-slide-in-right"
        }`}
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
                disabled={!rights.canSetProgress}
                className="h-1 w-28 accent-cyan-600 disabled:cursor-not-allowed disabled:opacity-50"
              />
              <span className="w-9 text-xs font-medium text-gray-700">{progress}%</span>
            </div>
          </div>
          <div className="flex items-center gap-1 text-gray-400">
            <button title="Reminder" className="rounded-md p-1.5 transition-colors duration-150 hover:bg-gray-100 hover:text-gray-600">
              <Bell size={16} />
            </button>
            <button
              onClick={requestClose}
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
                readOnly={readOnlyFields}
                className="w-full border-b border-gray-200 pb-2 text-base font-medium text-gray-800 outline-none transition-colors duration-150 placeholder:text-gray-300 read-only:cursor-default read-only:text-gray-500 focus:border-cyan-500"
                autoFocus={!readOnlyFields}
              />

              {rights.reason && (
                <div className="flex items-start gap-2 rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-xs text-gray-600">
                  <Lock size={13} className="mt-0.5 shrink-0 text-gray-400" />
                  <span>{rights.reason}</span>
                </div>
              )}

              {existing?.status === "Awaiting Approval" && (
                <div className="flex items-center gap-2 rounded-lg border border-cyan-200 bg-cyan-50 px-3 py-2 text-xs font-medium text-cyan-800">
                  <Bell size={13} className="shrink-0" /> Completion requested — awaiting your manager&apos;s approval.
                </div>
              )}
              {existing?.completionNote && existing.status !== "Awaiting Approval" && existing.status !== "Completed" && (
                <div className="flex items-start gap-2 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-700">
                  <X size={13} className="mt-0.5 shrink-0" />
                  <span>Completion was sent back: {existing.completionNote}</span>
                </div>
              )}

              {/*
                Compact meta row: Due Date + Reminder (date + time + presets) on one line, Status and
                Priority on the next. A repeating task's reminder is a time of day only — it fires on
                each occurrence's own due date, so pinning it to one calendar date would be wrong.
              */}
              <div className="flex flex-wrap items-end gap-x-4 gap-y-3">
                <div>
                  <div className="mb-1 text-[11px] font-medium uppercase tracking-wide text-gray-400">Due Date *</div>
                  <DatePicker
                    value={dueDate}
                    onChange={setDueDate}
                    placeholder="Due date"
                    className="py-1.5"
                    disabled={readOnlyFields}
                    recurrence={recurrenceRule}
                    onRecurrenceChange={setRecurrenceRule}
                    recurrenceInterval={recurrenceInterval}
                    onRecurrenceIntervalChange={setRecurrenceInterval}
                  />
                </div>

                <div>
                  <div className="mb-1 flex items-center gap-1 text-[11px] font-medium uppercase tracking-wide text-gray-400">
                    <Bell size={11} /> Reminder
                  </div>
                  <div className="flex items-center gap-1.5">
                    {!isRepeating && (
                      <DatePicker
                        value={reminderDate}
                        onChange={setReminderDate}
                        placeholder="Date"
                        className="py-1.5"
                        disabled={readOnlyFields}
                      />
                    )}
                    <input
                      type="time"
                      value={reminderTime}
                      onChange={(e) => setReminderTime(e.target.value)}
                      disabled={readOnlyFields}
                      aria-label={isRepeating ? "Reminder time for each occurrence" : "Reminder time"}
                      className="rounded-lg border border-gray-200 px-2 py-1.5 text-sm text-gray-700 outline-none transition-colors duration-150 focus:border-cyan-500 disabled:cursor-not-allowed disabled:bg-gray-50 disabled:opacity-70"
                    />
                    {isRepeating && <span className="text-[10px] text-gray-400">each occurrence</span>}
                    {(isRepeating ? reminderTime : reminderDate || reminderTime) ? (
                      <button
                        type="button"
                        onClick={() => { setReminderDate(""); setReminderTime(""); }}
                        hidden={readOnlyFields}
                        title="Clear reminder"
                        className="rounded-md p-1 text-gray-400 transition-colors duration-150 hover:bg-rose-50 hover:text-rose-600"
                      >
                        <X size={13} />
                      </button>
                    ) : (
                      !isRepeating && !readOnlyFields && (
                        <div className="flex gap-1">
                          {REMINDER_PRESETS.map((p) => (
                            <button
                              key={p.label}
                              type="button"
                              onClick={() => setReminderDate(p.from(dueDate))}
                              className="rounded-md border border-gray-200 px-1.5 py-1 text-[10px] font-medium text-gray-500 transition-all duration-150 hover:border-brand-accent hover:text-brand-accent active:scale-95"
                            >
                              {p.label}
                            </button>
                          ))}
                        </div>
                      )
                    )}
                  </div>
                </div>
              </div>

              {/* Status + Priority on their own line — keeps the date row clean. */}
              <div className="flex flex-wrap items-end gap-x-4 gap-y-3">
                <div>
                  <div className="mb-1 text-[11px] font-medium uppercase tracking-wide text-gray-400">Status</div>
                  <Select
                    value={status}
                    onChange={(v) => setStatus(v as TaskStatus)}
                    size="sm"
                    disabled={!rights.canSetStatus}
                    options={TASK_STATUSES.map((s) => ({ value: s, label: s }))}
                  />
                </div>

                <div>
                  <div className="mb-1 text-[11px] font-medium uppercase tracking-wide text-gray-400">Priority</div>
                  <Select
                    value={priority}
                    onChange={(v) => setPriority(v as TaskPriority)}
                    size="sm"
                    disabled={readOnlyFields}
                    options={TASK_PRIORITIES.map((p) => ({ value: p, label: p }))}
                  />
                </div>
              </div>

              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                rows={3}
                placeholder="Task description"
                readOnly={readOnlyFields}
                className="input resize-none read-only:cursor-default read-only:bg-gray-50 read-only:text-gray-500"
              />

              <Field label="Project">
                <Select
                  value={projectId}
                  onChange={setProjectId}
                  placeholder="No project"
                  disabled={readOnlyFields}
                  options={[
                    { value: "", label: "No project" },
                    ...projects.map((p) => ({ value: p.id, label: p.name })),
                  ]}
                />
              </Field>

              <Field label="Department">
                <Select
                  value={departmentId}
                  onChange={(v) => {
                    setDepartmentId(v);
                    // If the current assignee isn't in the newly picked department, clear them so
                    // the list below only offers people who actually belong to that team.
                    if (v) {
                      const stillValid = users.some(
                        (u) => u.id === assigneeId && String(u.departmentId ?? "") === v
                      );
                      if (!stillValid) setAssigneeId("");
                    }
                  }}
                  placeholder="Any department"
                  disabled={readOnlyFields}
                  options={[
                    { value: "", label: "Any department" },
                    ...departments.map((d) => ({
                      value: String(d.id),
                      label: `${d.name}${d.memberCount ? ` · ${d.memberCount}` : ""}`,
                    })),
                  ]}
                />
              </Field>

              <Field label="Assignee *">
                <PeopleSelect
                  people={assigneePeople}
                  value={assigneeId}
                  onChange={setAssigneeId}
                  disabled={readOnlyFields}
                  placeholder={departmentId ? "Select from this department" : "Select assignee"}
                />
              </Field>

              <Field label="Client">
                <ClientSelect
                  clients={clients.map((c) => c.name)}
                  value={clientName}
                  onChange={setClientName}
                  disabled={readOnlyFields}
                  onAddClient={(name) =>
                    addParty({ name, type: "Client", phone: "", gstin: "", rating: 0, toReceive: 0, toPay: 0 })
                  }
                />
              </Field>

              <Field label="Followers">
                <PeopleMultiSelect
                  people={allPeople}
                  values={followerIds}
                  onChange={setFollowerIds}
                  disabled={readOnlyFields}
                  placeholder="Search and add followers…"
                />
              </Field>

              {/* Subtasks */}
              <Field label={`Sub tasks (${subtasks.filter((s) => s.done).length}/${subtasks.length})`}>
                <div className="space-y-2">
                  {subtasks.map((s) => (
                    <div key={s.id} className="flex items-center gap-2 rounded-lg border border-gray-100 px-3 py-1.5">
                      <input
                        type="checkbox"
                        checked={s.done}
                        disabled={!rights.canToggleSubtasks || togglingSubtaskId === s.id}
                        title={
                          rights.canToggleSubtasks
                            ? undefined
                            : "Only the task's creator or assignee can tick sub tasks off"
                        }
                        onChange={() => onToggleSubtask(s)}
                        className="h-3.5 w-3.5 accent-cyan-600 disabled:cursor-not-allowed disabled:opacity-50"
                      />
                      <span className={`flex-1 text-sm ${s.done ? "text-gray-400 line-through" : "text-gray-700"}`}>
                        {s.title}
                      </span>
                      <button
                        onClick={() => setSubtasks((list) => list.filter((x) => x.id !== s.id))}
                        hidden={readOnlyFields}
                        className="rounded p-1 text-gray-300 transition-colors duration-150 hover:bg-rose-50 hover:text-rose-500"
                      >
                        <Trash2 size={13} />
                      </button>
                    </div>
                  ))}
                  {!readOnlyFields && (
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
                  )}
                  {readOnlyFields && subtasks.length === 0 && (
                    <p className="text-xs text-gray-400">No sub tasks.</p>
                  )}
                </div>
              </Field>

              {error && <div className="text-xs font-medium text-rose-600">{error}</div>}
            </div>

            {/* Footer */}
            <div className="flex justify-end gap-2 border-t border-gray-100 px-6 py-3">
              <button
                onClick={requestClose}
                disabled={saving}
                className="rounded-lg border border-gray-200 px-4 py-2 text-sm font-medium text-gray-600 transition-all duration-150 hover:bg-gray-50 active:scale-95 disabled:opacity-50"
              >
                Close
              </button>
              {rights.canEditAll && (
                <button
                  onClick={() => save(true)}
                  disabled={saving}
                  className="rounded-lg border border-gray-200 px-4 py-2 text-sm font-medium text-gray-600 transition-all duration-150 hover:bg-gray-50 active:scale-95 disabled:opacity-50"
                >
                  Draft
                </button>
              )}
              {/* Nothing to save for a pure viewer — the chat and attachments save themselves. */}
              {(rights.canEditAll || rights.canSetStatus || rights.canSetProgress) && (
                <button
                  onClick={() => save(false)}
                  disabled={saving}
                  className="flex items-center gap-1.5 rounded-lg bg-brand-accent px-5 py-2 text-sm font-medium text-white transition-all duration-150 hover:opacity-90 active:scale-95 disabled:opacity-60"
                >
                  {saving && <Loader2 size={14} className="animate-spin" />}
                  {existing ? "Save" : "Submit"}
                </button>
              )}
            </div>
          </div>

          {/* Side panel */}
          <div className="hidden w-[340px] shrink-0 flex-col lg:flex">
            {/* Hidden file input, shared by the Attachment tab's "Upload a file" button and the
                Comment tab's paper-clip in the composer. Kept at the top so it stays mounted
                whichever tab is active. */}
            <input ref={fileRef} type="file" hidden onChange={onUploadFile} />
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
              {panel === "Comment" ? (
                <ChatThread
                  comments={panelComments}
                  attachments={panelAttachments}
                  userName={userName}
                  meId={meId}
                  onOpenAttachment={(a) => setPreviewId(a.id)}
                  onRemove={isDrafting ? removeDraft : undefined}
                />
              ) : panel === "Attachment" ? (
                <div className="space-y-3">
                  <button
                    onClick={() => fileRef.current?.click()}
                    className="flex w-full items-center justify-center gap-1.5 rounded-lg border border-dashed border-gray-300 py-3 text-sm text-gray-500 transition-colors duration-150 hover:border-brand-accent hover:text-brand-accent"
                  >
                    <Paperclip size={14} /> Upload a file
                  </button>
                  {panelAttachments.length === 0 ? (
                    <p className="py-6 text-center text-xs text-gray-400">No attachments yet.</p>
                  ) : (
                    panelAttachments.map((a) => {
                      const previewable = canPreview(a);
                      const isImage = previewable && (a.contentType ?? "").startsWith("image/");
                      return (
                        <div
                          key={a.id}
                          className="group flex items-center gap-2.5 rounded-lg border border-gray-100 px-3 py-2 transition-colors duration-150 hover:border-cyan-200 hover:bg-cyan-50/30"
                        >
                          {/* An image thumbnail identifies the file far faster than a generic icon. */}
                          {isImage && a.url ? (
                            <button
                              onClick={() => setPreviewId(a.id)}
                              title={`Preview ${a.name}`}
                              className="h-9 w-9 shrink-0 overflow-hidden rounded-lg transition-transform duration-150 hover:scale-105"
                            >
                              {/* eslint-disable-next-line @next/next/no-img-element */}
                              <img src={a.url} alt={a.name} className="h-full w-full object-cover" />
                            </button>
                          ) : (
                            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-cyan-50 text-brand-accent">
                              <FileText size={16} />
                            </div>
                          )}
                          <div className="min-w-0 flex-1">
                            <div className="truncate text-sm font-medium text-gray-700">{a.name}</div>
                            <div className="text-[10px] text-gray-400">
                              {a.size} · {isDrafting ? "Uploaded when you create the task" : formatTaskDateTime(a.at)}
                            </div>
                          </div>
                          {isDrafting ? (
                            <button
                              onClick={() => removeDraft("attachment", a.id)}
                              title={`Remove ${a.name}`}
                              className="shrink-0 rounded-lg border border-gray-200 bg-white p-1.5 text-gray-400 transition-all duration-150 hover:border-rose-200 hover:bg-rose-50 hover:text-rose-500 active:scale-95"
                            >
                              <Trash2 size={13} />
                            </button>
                          ) : a.url ? (
                            <div className="flex shrink-0 items-center gap-1">
                              {previewable && (
                                <button
                                  onClick={() => setPreviewId(a.id)}
                                  title={`Preview ${a.name}`}
                                  className="flex items-center gap-1 rounded-lg border border-gray-200 bg-white px-2.5 py-1.5 text-xs font-medium text-gray-600 transition-all duration-150 hover:border-brand-accent hover:bg-cyan-50 hover:text-brand-accent active:scale-95"
                                >
                                  <Eye size={13} /> Preview
                                </button>
                              )}
                              <a
                                href={a.url}
                                download={a.name}
                                title={`Download ${a.name}`}
                                className="flex items-center gap-1 rounded-lg border border-gray-200 bg-white p-1.5 text-gray-500 transition-all duration-150 hover:border-brand-accent hover:bg-cyan-50 hover:text-brand-accent active:scale-95"
                              >
                                <Download size={13} />
                              </a>
                            </div>
                          ) : (
                            <span
                              title="This file was attached before download support was added, so its contents weren't stored. Re-upload it to enable download."
                              className="shrink-0 cursor-help rounded-md bg-gray-50 px-2 py-1 text-[10px] font-medium text-gray-400"
                            >
                              No file data
                            </span>
                          )}
                        </div>
                      );
                    })
                  )}
                </div>
              ) : liveTask ? (
                <ActivityTimeline items={liveTask.activity} userName={userName} />
              ) : (
                <p className="py-10 text-center text-xs text-gray-400">
                  The activity log starts once the task is created.
                </p>
              )}
            </div>

            {panel === "Comment" && (
              <div className="flex items-center gap-2 border-t border-gray-100 px-3 py-2">
                <input
                  value={commentText}
                  onChange={(e) => setCommentText(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && sendComment()}
                  placeholder={isDrafting ? "Type a message — sent on create" : "Type a message"}
                  className="flex-1 rounded-full border border-gray-200 px-3 py-1.5 text-sm outline-none transition-colors duration-150 focus:border-cyan-500"
                />
                <button
                  onClick={() => fileRef.current?.click()}
                  title="Attach a file"
                  className="rounded-full border border-gray-200 p-2 text-gray-500 transition-all duration-150 hover:border-brand-accent hover:text-brand-accent active:scale-90"
                >
                  <Paperclip size={14} />
                </button>
                <button
                  onClick={sendComment}
                  disabled={sendingComment}
                  title="Send message"
                  className="rounded-full bg-brand-accent p-2 text-white transition-all duration-150 hover:opacity-90 active:scale-90 disabled:opacity-60"
                >
                  {sendingComment ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />}
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      {previewId && panelAttachments.length > 0 && (
        <AttachmentPreview
          attachments={panelAttachments}
          startId={previewId}
          onClose={() => setPreviewId(null)}
        />
      )}
    </div>
  );
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function readAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(new Error("Could not read the file."));
    reader.readAsDataURL(file);
  });
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
