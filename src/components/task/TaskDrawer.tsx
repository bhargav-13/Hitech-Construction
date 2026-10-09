"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  X,
  Paperclip,
  Bell,
  Plus,
  Trash2,
  Send,
  ListTree,
  FileText,
  Loader2,
  Lock,
  Zap,
  Repeat,
  ClipboardPaste,
  Search,
  CirclePause,
  CirclePlay,
} from "lucide-react";
import { useAppStore } from "@/lib/store";
import { useAuthStore } from "@/lib/authStore";
import { useUsers } from "@/lib/useUsers";
import { useDepartments } from "@/lib/useDepartments";
import { useProjects } from "@/lib/useProjects";
import { isOwnStamp, useTaskStore } from "@/lib/taskStore";
import { ApiError } from "@/lib/api";
import { useEditLock } from "@/lib/editLock";
import { useTaskSeen } from "@/lib/taskNotifications";
import { useTaskStatuses } from "@/lib/useTaskStatuses";
import * as tasksApi from "@/lib/tasksApi";
import { TASK_PRIORITIES, formatTaskDateTime, toIso } from "@/lib/taskTypes";
import { dateKeyIST, formatChatStampIST, msIST, todayIST } from "@/lib/datetime";
import type {
  ReminderFrequency,
  ReminderRecipients,
  SubTask,
  Task,
  TaskAttachment,
  TaskComment,
  TaskPriority,
  TaskStatus,
} from "@/lib/taskTypes";
import { attachmentsFor, fileUrl, formatBytes, uploadFile } from "@/lib/filesApi";
import type { FileNode } from "@/lib/filesApi";
import { UserAvatar, PeopleSelect, PeopleMultiSelect, ClientSelect } from "./TaskBits";
import type { Person } from "./TaskBits";
import { AttachmentPreview, canPreview } from "./AttachmentPreview";
import { ModuleAttachments } from "@/components/files/ModuleAttachments";
import { Select } from "@/components/Select";
import { DatePicker, WeekdayPicker } from "@/components/DatePicker";
import type { RecurrenceRule } from "@/components/DatePicker";
import { useDrawerDismiss } from "@/lib/useDrawerDismiss";
// The timeline now lives at components/ActivityTimeline so Tender renders the identical feed.
import { ActivityTimeline } from "@/components/ActivityTimeline";
import { useTaskRights } from "@/lib/taskPermissions";
import { previewFile } from "@/lib/filePreview";

type Panel = "Comment" | "Attachment" | "Log Activity";

/** One file in the chat: an old inline (base64) attachment, or a file in the shared registry. */
type ChatFile = TaskAttachment & { fileId?: number };

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

const RECIPIENTS: { value: ReminderRecipients; label: string }[] = [
  { value: "ALL", label: "All" },
  { value: "OWNER", label: "Owner" },
  { value: "ASSIGNEES", label: "Assignees" },
  { value: "FOLLOWERS", label: "Followers" },
];
const FREQUENCIES: { value: ReminderFrequency; label: string }[] = [
  { value: "ONCE", label: "Once" },
  { value: "DAILY", label: "Daily" },
  { value: "HOURLY", label: "Hourly" },
  { value: "WEEKLY", label: "Weekly" },
];
const SUB_STATUSES: TaskStatus[] = ["Pending", "In Progress", "On Hold", "Stuck", "Completed"];

/**
 * WhatsApp-style discussion thread for a task. Merges comments and files into one timeline sorted by
 * time; the current user's messages bubble right in accent colour, everyone else's bubble left.
 */
type ChatEntry =
  | { kind: "comment"; id: string; sourceId: string; userId: string; at: string; text: string }
  | { kind: "attachment"; id: string; sourceId: string; userId: string; at: string; att: ChatFile };

function ChatThread({
  comments,
  attachments,
  userName,
  meId,
  onOpenAttachment,
  onRemove,
}: {
  comments: TaskComment[];
  attachments: ChatFile[];
  userName: (id: string) => string;
  meId: string;
  onOpenAttachment: (att: ChatFile) => void;
  /** Set only while composing a new task, where nothing has been sent yet and can still be pulled back. */
  onRemove?: (kind: "comment" | "attachment", id: string) => void;
}) {
  const entries = useMemo<ChatEntry[]>(() => {
    const merged: ChatEntry[] = [
      ...comments.map((c) => ({ kind: "comment" as const, id: `c-${c.id}`, sourceId: c.id, userId: c.userId, at: c.at, text: c.text })),
      ...attachments.map((a) => ({ kind: "attachment" as const, id: `a-${a.id}`, sourceId: a.id, userId: a.userId, at: a.at, att: a })),
    ];
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
              {!mine && <span className="mb-0.5 px-1 text-[10px] font-medium text-gray-500">{userName(e.userId)}</span>}
              {e.kind === "comment" ? (
                <div
                  className={`whitespace-pre-wrap break-words rounded-2xl px-3 py-1.5 text-sm shadow-sm ${
                    mine ? "rounded-br-sm bg-brand-accent text-white" : "rounded-bl-sm bg-gray-100 text-gray-800"
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
                    <button onClick={() => onRemove(e.kind, e.sourceId)} title="Remove" className="text-gray-400 transition-colors duration-150 hover:text-rose-500">
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

/** One attached file inside the chat. Images show as a thumbnail; everything else as a compact card. */
function AttachmentBubble({ att, mine, onOpen }: { att: ChatFile; mine: boolean; onOpen: (att: ChatFile) => void }) {
  const previewable = att.fileId != null || canPreview(att);
  const isImage = (att.contentType ?? "").startsWith("image/");
  const bubble = mine ? "rounded-br-sm bg-brand-accent text-white" : "rounded-bl-sm bg-gray-100 text-gray-800";

  if (isImage && att.url && att.fileId == null) {
    return (
      <button
        onClick={() => onOpen(att)}
        title={`Preview ${att.name}`}
        className={`max-w-[240px] overflow-hidden rounded-2xl shadow-sm transition-opacity duration-150 hover:opacity-90 ${bubble}`}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={att.url} alt={att.name} className="max-h-44 w-full object-cover" />
        <span className="block px-2.5 py-1 text-left text-[10px] opacity-80">{att.size || "Image"}</span>
      </button>
    );
  }

  return (
    <button
      onClick={() => onOpen(att)}
      disabled={!previewable && !att.url}
      title={`Open ${att.name}`}
      className={`flex max-w-[240px] items-center gap-2 rounded-2xl px-2.5 py-1.5 text-left text-sm shadow-sm transition-opacity duration-150 hover:opacity-90 disabled:cursor-default ${bubble}`}
    >
      <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${mine ? "bg-white/20" : "bg-white"}`}>
        <FileText size={14} />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-xs font-medium">{att.name}</span>
        <span className={`block truncate text-[10px] ${mine ? "text-white/80" : "text-gray-500"}`}>
          {att.size || "File"} · {att.fileId != null ? "Tap to open" : att.url ? "Tap to preview" : "No file data"}
        </span>
      </span>
    </button>
  );
}

/**
 * Add / edit a task. TaskOPad shows this as a centre popup; we use a right slide-over to match the
 * rest of the ERP. Left = the task form, right = Comment / Attachment / Activity — all backed by the
 * real task API (project-service).
 */
export function TaskDrawer({
  existing,
  defaultProjectId,
  onClose,
  onReload,
}: {
  existing?: Task;
  defaultProjectId?: string | null;
  onClose: () => void;
  /** Reopen the drawer on a fresher copy of the task (someone else changed it meanwhile). */
  onReload?: (fresh: Task) => void;
}) {
  // While this drawer is open, Taskopad's background refresh waits.
  useEditLock();
  // The version of the task this form started from. A save sends it back so the server can refuse
  // to overwrite someone else's newer edit; "Keep my changes" moves it forward on purpose.
  const [baseline, setBaseline] = useState<string | null>(existing?.updatedAt ?? null);
  const live = useTaskStore((s) => (existing ? s.tasks.find((t) => t.id === existing.id) : undefined));
  const changedElsewhere =
    !!existing && !!live && !!baseline && live.updatedAt !== baseline && !isOwnStamp(live.id, live.updatedAt);
  const [conflict, setConflict] = useState("");
  const changedByName = (t: Task) => {
    const last = [...(t.activity ?? [])].sort((a, b) => a.at.localeCompare(b.at)).pop();
    return (last && users.find((u) => u.id === last.userId)?.name) || "Someone";
  };
  const lastAsDraft = useRef(false);
  // The list refresh waits while this drawer is open, so watch just this one task instead: a light
  // re-read every minute that updates the list's copy (never this form) and raises the banner below.
  const refreshOne = useTaskStore((s) => s.refreshOne);
  useEffect(() => {
    if (!existing) return;
    const t = window.setInterval(() => {
      if (!document.hidden) void refreshOne(existing.id);
    }, 60_000);
    return () => window.clearInterval(t);
  }, [existing, refreshOne]);
  /** Throw away this form and reopen on the server's latest copy. */
  async function reloadLatest() {
    if (!existing || !onReload) return;
    await refreshOne(existing.id);
    const fresh = useTaskStore.getState().tasks.find((t) => t.id === existing.id);
    if (fresh) onReload(fresh);
  }
  const { projects } = useProjects();
  const { users } = useUsers();
  const { departments } = useDepartments();
  const authUser = useAuthStore((s) => s.user);
  const parties = useAppStore((s) => s.parties);
  const addParty = useAppStore((s) => s.addParty);
  // Closing a new task that has something typed in asks first; closing anyway keeps it as a draft
  // instead of throwing the work away. `closeConfirmed` lets the save's own close through.
  const [confirmClose, setConfirmClose] = useState(false);
  const confirmOpen = useRef(false);
  const closeConfirmed = useRef(false);
  const { closing, requestClose } = useDrawerDismiss(onClose, undefined, () => {
    if (closeConfirmed.current || existing || createdId || !hasTypedSomething()) return true;
    // Escape (or a second click outside) while the question is up just goes back to the form.
    confirmOpen.current = !confirmOpen.current;
    setConfirmClose(confirmOpen.current);
    return false;
  });
  const { active: statusRows, rowFor } = useTaskStatuses();
  const markTaskSeen = useTaskSeen((s) => s.markTaskSeen);
  const allTasks = useTaskStore((s) => s.tasks);

  const createTask = useTaskStore((s) => s.createTask);
  const saveTask = useTaskStore((s) => s.saveTask);
  const patchTask = useTaskStore((s) => s.patchTask);
  const addComment = useTaskStore((s) => s.addComment);
  const toggleSubtask = useTaskStore((s) => s.toggleSubtask);
  const patchSubtask = useTaskStore((s) => s.patchSubtask);
  const setRecurrenceStopped = useTaskStore((s) => s.setRecurrenceStopped);
  // Re-read the live task from the store so newly added comments/attachments/activity show at once.
  const liveTask = useTaskStore((s) => (existing ? s.tasks.find((t) => t.id === existing.id) ?? existing : undefined));

  const meId = authUser ? String(authUser.id) : "";
  const defaultAssignee = existing?.assigneeId ?? (meId || users[0]?.id || "");

  const [title, setTitle] = useState(existing?.title ?? "");
  const [description, setDescription] = useState(existing?.description ?? "");
  const [dueDate, setDueDate] = useState(existing?.dueDate ?? toIso(new Date()));
  const [status, setStatus] = useState<TaskStatus>(existing?.status ?? "Pending");
  const [statusId, setStatusId] = useState<string | null>(existing?.statusId ?? null);
  const [priority, setPriority] = useState<TaskPriority>(existing?.priority ?? "Low");
  const [projectId, setProjectId] = useState<string>(existing?.projectId ?? defaultProjectId ?? "");
  const [assigneeId, setAssigneeId] = useState<string>(defaultAssignee);
  // New tasks may go to several people (one linked copy each); an existing task has one assignee.
  const [assigneeIds, setAssigneeIds] = useState<string[]>(defaultAssignee ? [defaultAssignee] : []);
  const [followerIds, setFollowerIds] = useState<string[]>(existing?.followerIds ?? []);
  const [clientName, setClientName] = useState<string>(existing?.clientName ?? "");
  const [serviceName, setServiceName] = useState<string>(existing?.serviceName ?? "");
  const [progress, setProgress] = useState(existing?.progress ?? 0);
  const [subtasks, setSubtasks] = useState<SubTask[]>(existing?.subtasks ?? []);
  const [subtasksMandatory, setSubtasksMandatory] = useState(existing?.subtasksMandatory ?? false);
  const [importingSubs, setImportingSubs] = useState(false);
  const [recurrenceRule, setRecurrenceRule] = useState<RecurrenceRule>((existing?.recurrenceRule as RecurrenceRule) ?? "NONE");
  const [recurrenceInterval, setRecurrenceInterval] = useState(existing?.recurrenceInterval ?? 1);
  const [recurrenceDays, setRecurrenceDays] = useState(existing?.recurrenceDays ?? "");
  const [recurrenceExcludeDays, setRecurrenceExcludeDays] = useState(existing?.recurrenceExcludeDays ?? "");
  const [recurrenceUntil, setRecurrenceUntil] = useState(existing?.recurrenceUntil ?? "");
  const [reminderOn, setReminderOn] = useState(!!existing?.reminderAt);
  const [reminderDate, setReminderDate] = useState(() => splitReminder(existing?.reminderAt).date);
  const [reminderTime, setReminderTime] = useState(() => splitReminder(existing?.reminderAt).time);
  const [reminderFrequency, setReminderFrequency] = useState<ReminderFrequency>(existing?.reminderFrequency ?? "ONCE");
  const [reminderRecipients, setReminderRecipients] = useState<ReminderRecipients>(existing?.reminderRecipients ?? "ALL");
  const [reminderDays, setReminderDays] = useState(existing?.reminderDays ?? "");
  const [departmentId, setDepartmentId] = useState<string>(existing?.departmentId ?? "");
  const [panel, setPanel] = useState<Panel>("Comment");
  const [commentText, setCommentText] = useState("");
  // Comments and files added while composing a brand-new task. The API can only hang them off a
  // task id, which doesn't exist yet, so they're held here and posted right after the create call.
  const [draftComments, setDraftComments] = useState<TaskComment[]>([]);
  const [draftFiles, setDraftFiles] = useState<{ id: string; file: File; at: string }[]>([]);
  // Set once the create succeeds. Guards against a second create if posting the drafted
  // comments/files then fails and the user hits Submit again.
  const [createdId, setCreatedId] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [sendingComment, setSendingComment] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [togglingSubtaskId, setTogglingSubtaskId] = useState<string | null>(null);
  const [previewId, setPreviewId] = useState<string | null>(null);
  const [regFiles, setRegFiles] = useState<FileNode[]>([]);
  const [projectMembers, setProjectMembers] = useState<string[] | null>(null);
  const [quickReplies, setQuickReplies] = useState<tasksApi.QuickReplyDto[]>([]);
  const [showQuick, setShowQuick] = useState(false);
  // Search and date filter over the side panel (comments, files, activity) — Taskopad's 🔍 and 📅.
  const [panelSearchOpen, setPanelSearchOpen] = useState(false);
  const [panelQuery, setPanelQuery] = useState("");
  const [panelDate, setPanelDate] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);
  const draftSeq = useRef(0);

  // Who may change what. A task's details belong to its creator (and Super Admin); the assignee
  // owns the work, so they get status and progress. Everyone else can still chat and attach.
  const { rightsFor } = useTaskRights();
  const rights = rightsFor(existing);
  const readOnlyFields = !rights.canEditAll;

  const clients = parties.filter((p) => p.type === "Client");
  const isRepeating = recurrenceRule !== "NONE";
  const userName = (id: string) => users.find((u) => u.id === id)?.name ?? "Unknown";

  // Opening a task clears its "new comments" badge in the list.
  useEffect(() => {
    if (existing) markTaskSeen(existing.id);
  }, [existing, markTaskSeen]);

  // Files on this task in the shared registry — the same rows the project's Files tab shows.
  const refreshFiles = useCallback(async () => {
    if (!existing) return;
    try {
      setRegFiles(await attachmentsFor("TASK", Number(existing.id)));
    } catch {
      /* registry unavailable — the old inline attachments still show */
    }
  }, [existing]);
  useEffect(() => {
    void refreshFiles();
  }, [refreshFiles]);

  // Task lists come without attachment contents (they used to carry every inline photo); fetch this
  // task once, in full, when one of its older inline attachments still has no data loaded.
  const [inlineData, setInlineData] = useState<Record<string, string | null>>({});
  const needsInline = (liveTask?.attachments ?? []).some((a) => a.hasData && !a.url && !(a.id in inlineData));
  useEffect(() => {
    if (!existing || !needsInline) return;
    let cancelled = false;
    tasksApi
      .getTask(Number(existing.id))
      .then((full) => {
        if (!cancelled) setInlineData(Object.fromEntries((full.attachments ?? []).map((a) => [String(a.id), a.dataUrl])));
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [existing, needsInline]);

  useEffect(() => {
    tasksApi
      .getQuickReplies()
      .then(setQuickReplies)
      .catch(() => {});
  }, []);

  // A task on a project can only go to that project's members (Taskopad does the same).
  useEffect(() => {
    if (!projectId) {
      setProjectMembers(null);
      return;
    }
    let cancelled = false;
    tasksApi
      .getProjectMembers(Number(projectId))
      .then((ids) => !cancelled && setProjectMembers(ids.map(String)))
      .catch(() => !cancelled && setProjectMembers(null));
    return () => {
      cancelled = true;
    };
  }, [projectId]);

  // People for the pickers: scoped by department and project; followers exclude whoever is assigned.
  const allPeople: Person[] = users.map((u) => ({ id: u.id, name: u.name, role: u.role }));
  const assigneePeople: Person[] = users
    // The task's current assignee always stays listed, even if they sit outside the chosen department.
    .filter((u) => (departmentId ? String(u.departmentId ?? "") === departmentId || u.id === assigneeId : true))
    .filter((u) => (projectMembers ? projectMembers.includes(u.id) || u.id === assigneeId : true))
    .map((u) => ({ id: u.id, name: u.name, role: u.role }));
  const chosenAssignees = existing ? [assigneeId] : assigneeIds;
  const followerPeople = allPeople.filter((p) => !chosenAssignees.includes(p.id));
  const servicesKnown = useMemo(
    () => [...new Set(allTasks.map((t) => t.serviceName).filter((s): s is string => !!s))].sort(),
    [allTasks]
  );

  // The status picker over company statuses. Awaiting Approval is reached by completing, never picked.
  const currentStatusRow = rowFor({ status, statusId });
  const statusChoices = statusRows.filter((r) => r.base !== "Awaiting Approval");

  /** Anything worth keeping in a new task — the defaults alone (due today, assigned to me) aren't. */
  function hasTypedSomething() {
    return (
      !!title.trim() ||
      !!description.trim() ||
      subtasks.length > 0 ||
      followerIds.length > 0 ||
      !!clientName ||
      !!serviceName.trim() ||
      draftComments.length > 0 ||
      draftFiles.length > 0
    );
  }

  function keepEditing() {
    confirmOpen.current = false;
    setConfirmClose(false);
  }

  /** "Close" on the question: keep the new task as a draft (titled "Untitled task" if blank). */
  async function closeAsDraft() {
    keepEditing();
    await save(true, false, "Untitled task");
  }

  function validate(asDraft: boolean, taskTitle: string): string | null {
    if (!taskTitle) return "Task title is required.";
    if (!dueDate) return "Due date is required.";
    if (chosenAssignees.filter(Boolean).length === 0) return "An assignee is required.";
    if (!existing && !asDraft && dueDate < todayIST()) return "The due date can't be in the past.";
    if (reminderOn && !isRepeating && !reminderDate) return "Pick the reminder date, or switch the reminder off.";
    if (reminderOn && !reminderTime && (isRepeating || reminderFrequency !== "ONCE")) return "Pick the reminder time.";
    if (!asDraft) {
      // Taskopad won't submit a task with a half-filled sub-task; a draft may keep one.
      for (const s of subtasks) {
        if (!s.title.trim()) return "Every sub-task needs a title (or delete the empty one).";
        if (!s.assigneeId) return `Sub-task "${s.title}" needs an assignee.`;
        if (!s.dueDate) return `Sub-task "${s.title}" needs a due date.`;
      }
    } else if (subtasks.some((s) => !s.title.trim())) {
      return "Every sub-task needs a title (or delete the empty one).";
    }
    return null;
  }

  async function save(asDraft: boolean, overwrite = false, fallbackTitle = "") {
    lastAsDraft.current = asDraft;
    const taskTitle = title.trim() || fallbackTitle;
    // An assignee may move the work along but not rewrite the record, so their save is a narrow
    // PATCH of just those two fields rather than a full PUT of the (disabled) form.
    if (existing && !rights.canEditAll) {
      if (!rights.canSetStatus && !rights.canSetProgress) return;
      setSaving(true);
      setError("");
      try {
        await patchTask(existing.id, { ...(statusId ? { statusId } : { status }), progress });
        requestClose();
      } catch (err) {
        setError(err instanceof Error ? err.message : "Could not save the task.");
        setSaving(false);
      }
      return;
    }

    const problem = validate(asDraft, taskTitle);
    if (problem) return setError(problem);

    const payload = {
      title: taskTitle,
      description: description.trim(),
      projectId: projectId || null,
      assigneeId: existing ? assigneeId : assigneeIds[0],
      assigneeIds: existing ? undefined : assigneeIds,
      followerIds: followerIds.filter((f) => !chosenAssignees.includes(f)),
      clientName: clientName || null,
      serviceName: serviceName.trim() || null,
      status,
      statusId,
      priority,
      progress,
      dueDate,
      subtasks,
      subtasksMandatory,
      isDraft: asDraft,
      pinned: existing?.pinned ?? false,
      reminderAt: reminderOn ? joinReminder(reminderDate, reminderTime, isRepeating) : "",
      reminderFrequency,
      reminderRecipients,
      reminderDays: reminderFrequency === "WEEKLY" ? reminderDays : "",
      recurrenceRule,
      recurrenceInterval,
      recurrenceDays: recurrenceRule === "WEEKLY" ? recurrenceDays : "",
      recurrenceExcludeDays: recurrenceRule === "CUSTOM" ? recurrenceExcludeDays : "",
      recurrenceUntil: isRepeating ? recurrenceUntil || "" : "",
      departmentId: departmentId || null,
      expectedUpdatedAt: existing && !overwrite ? baseline : null,
    };

    setSaving(true);
    setError("");
    setConflict("");
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
      // each call returns the whole task and the store mirrors the last response.
      await flushDrafts(taskId);
      closeConfirmed.current = true;
      requestClose();
    } catch (err) {
      if (err instanceof ApiError && err.status === 409) {
        // Someone saved this task after it was opened here — ask instead of overwriting them.
        setConflict(err.message);
        if (existing) void refreshOne(existing.id);
      } else {
        setError(err instanceof Error ? err.message : "Could not save the task.");
      }
      setSaving(false);
    }
  }

  /** Posts the comments/files drafted before the task existed. Throws on the first failure. */
  async function flushDrafts(taskId: string) {
    for (const c of draftComments) {
      await addComment(taskId, c.text);
      setDraftComments((list) => list.filter((x) => x.id !== c.id));
    }
    for (const f of draftFiles) {
      await uploadFile(f.file, {
        projectId: projectId ? Number(projectId) : null,
        source: { module: "TASK", id: Number(taskId), label: `Task: ${title.trim()}` },
      });
      setDraftFiles((list) => list.filter((x) => x.id !== f.id));
    }
  }

  // ---- Sub-tasks ----
  function addSubtask(titleText = "") {
    setSubtasks((s) => [
      ...s,
      {
        id: `st-${Date.now()}-${++draftSeq.current}`,
        title: titleText,
        done: false,
        status: "Pending",
        priority: "Low",
        // Prefilled so a sub-task is submittable at once — Taskopad requires both.
        assigneeId: chosenAssignees[0] || undefined,
        dueDate: dueDate || null,
      },
    ]);
  }
  function updateSub(id: string, patch: Partial<SubTask>) {
    setSubtasks((list) =>
      list.map((x) => {
        if (x.id !== id) return x;
        const next = { ...x, ...patch };
        if (patch.status) next.done = patch.status === "Completed";
        return next;
      })
    );
  }

  /**
   * Tick a sub task off. For the creator this rides along with Save like any field; anyone else
   * (the assignee, or whoever the sub-task was given to) persists it on its own.
   */
  async function onToggleSubtask(s: SubTask) {
    const next = !s.done;
    updateSub(s.id, { status: next ? "Completed" : "Pending" });
    if (rights.canEditAll || !existing) return;
    setTogglingSubtaskId(s.id);
    try {
      await toggleSubtask(existing.id, s.id);
    } catch (err) {
      updateSub(s.id, { status: next ? "Pending" : "Completed" });
      setError(err instanceof Error ? err.message : "Could not update the sub task.");
    } finally {
      setTogglingSubtaskId(null);
    }
  }

  /** A sub-task's own status, changed by its assignee without rewriting the parent. */
  async function onSubStatus(s: SubTask, st: TaskStatus) {
    updateSub(s.id, { status: st });
    if (rights.canEditAll || !existing) return;
    try {
      await patchSubtask(existing.id, s.id, { status: st });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not update the sub task.");
    }
  }

  // ---- Chat ----
  async function sendComment() {
    const text = commentText.trim();
    if (!text) return;
    if (!existing) {
      setDraftComments((list) => [...list, { id: `draft-${++draftSeq.current}`, userId: meId, text, at: new Date().toISOString() }]);
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

  /**
   * Attach a file. It goes into the shared file registry against this task — the one copy the
   * project's Files tab ("Tasks") and Taskopad's Documents both read. Nothing is stored twice.
   */
  async function onUploadFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    if (!existing) {
      setDraftFiles((list) => [...list, { id: `draft-${++draftSeq.current}`, file, at: new Date().toISOString() }]);
      return;
    }
    setUploading(true);
    try {
      await uploadFile(file, {
        projectId: projectId ? Number(projectId) : null,
        source: { module: "TASK", id: Number(existing.id), label: `Task: ${existing.title}` },
      });
      await refreshFiles();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not attach the file.");
    } finally {
      setUploading(false);
    }
  }

  function removeDraft(kind: "comment" | "attachment", id: string) {
    if (kind === "comment") setDraftComments((list) => list.filter((c) => c.id !== id));
    else setDraftFiles((list) => list.filter((a) => a.id !== id));
  }

  async function openFile(att: ChatFile) {
    if (att.fileId != null) {
      try {
        const url = await fileUrl(att.fileId, true);
        previewFile({ name: att.name, url, contentType: att.contentType });
      } catch (err) {
        setError(err instanceof Error ? err.message : "Could not open the file.");
      }
      return;
    }
    if (canPreview(att)) setPreviewId(att.id);
    else if (att.url) previewFile({ name: att.name, url: att.url, contentType: att.contentType });
  }

  // A task being composed has no server-side thread yet, so the side panel runs off local drafts.
  const isDrafting = !existing;
  const panelComments = liveTask ? liveTask.comments : draftComments;
  const regNames = new Set(regFiles.map((f) => f.name));
  // Old inline attachments whose file has since been copied into the registry would show twice.
  const legacyAttachments = (liveTask?.attachments ?? [])
    .filter((a) => !regNames.has(a.name))
    .map((a) => (a.url || !(a.id in inlineData) ? a : { ...a, url: inlineData[a.id] }));
  const chatFiles: ChatFile[] = isDrafting
    ? draftFiles.map((f) => ({
        id: f.id,
        name: f.file.name,
        size: formatBytes(f.file.size),
        at: f.at,
        url: null,
        userId: meId,
        contentType: f.file.type || null,
      }))
    : [
        ...legacyAttachments,
        ...regFiles.map((f) => ({
          id: `f-${f.fileId}`,
          fileId: f.fileId ?? undefined,
          name: f.name,
          size: formatBytes(f.sizeBytes),
          at: f.createdAt ?? "",
          url: null,
          userId: String(f.uploadedBy ?? ""),
          contentType: f.contentType,
        })),
      ];

  const panelFiltering = !!panelQuery.trim() || !!panelDate;
  const pq = panelQuery.trim().toLowerCase();
  const onDay = (at: string) => !panelDate || dateKeyIST(at) === panelDate;
  const hit = (...texts: (string | null | undefined)[]) => !pq || texts.some((t) => (t ?? "").toLowerCase().includes(pq));
  const shownComments = panelComments.filter((c) => onDay(c.at) && hit(c.text, userName(c.userId)));
  const shownFiles = chatFiles.filter((f) => onDay(f.at) && hit(f.name, userName(f.userId)));
  const shownActivity = (liveTask?.activity ?? []).filter((a) => onDay(a.at) && hit(a.text, userName(a.userId)));

  const series = existing && existing.recurrenceRule && existing.recurrenceRule !== "NONE";

  return (
    <div className={`fixed inset-0 z-50 flex justify-end bg-black/40 ${closing ? "animate-overlay-out" : "animate-overlay-in"}`} onClick={requestClose}>
      <div
        className={`flex h-full w-full max-w-6xl flex-col overflow-hidden bg-white shadow-2xl ${closing ? "animate-slide-out-right" : "animate-slide-in-right"}`}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="h-1 w-full bg-gradient-to-r from-brand-accent to-cyan-400" />

        {/* Header */}
        <div className="flex items-center justify-between border-b border-gray-100 px-6 py-3">
          <div className="flex items-center gap-4">
            <h2 className="text-base font-semibold text-gray-800">{existing ? `Edit Task · ${existing.code}` : "Add Task"}</h2>
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
            {series && rights.canEditAll && (
              <button
                onClick={() => void setRecurrenceStopped(existing!.id, !existing!.recurrenceStopped)}
                title={existing!.recurrenceStopped ? "Resume the recurring series" : "Stop the recurring series"}
                className="flex items-center gap-1 rounded-md px-2 py-1.5 text-xs font-medium transition-colors duration-150 hover:bg-gray-100 hover:text-gray-700"
              >
                {existing!.recurrenceStopped ? <CirclePlay size={15} /> : <CirclePause size={15} />}
                {existing!.recurrenceStopped ? "Resume series" : "Stop series"}
              </button>
            )}
            <button onClick={requestClose} className="rounded-full p-1.5 transition-all duration-150 hover:bg-gray-100 hover:text-gray-600 active:scale-90">
              <X size={18} />
            </button>
          </div>
        </div>

        <div className="flex min-h-0 flex-1">
          {/* Form */}
          <div className="flex min-w-0 flex-1 flex-col border-r border-gray-100">
            <div className="flex-1 space-y-4 overflow-y-auto px-6 py-5">
              {changedElsewhere && live && !conflict && (
                <div className="flex flex-wrap items-center gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
                  <span className="min-w-0 flex-1">
                    <b>{changedByName(live)}</b> updated this task at {formatTaskDateTime(live.updatedAt)} while you had it open.
                  </span>
                  {onReload && (
                    <button
                      type="button"
                      onClick={() => void reloadLatest()}
                      className="rounded-md border border-amber-300 bg-white px-2.5 py-1 font-medium hover:bg-amber-100"
                    >
                      Reload
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => setBaseline(live.updatedAt)}
                    className="rounded-md px-2.5 py-1 font-medium hover:bg-amber-100"
                  >
                    Keep my changes
                  </button>
                </div>
              )}
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
              {existing?.recurrenceStopped && (
                <div className="flex items-center gap-2 rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-xs text-gray-600">
                  <Repeat size={13} className="shrink-0" /> This recurring series is stopped — completing it won&apos;t create the next one.
                </div>
              )}

              {/* Due date (with recurrence) · Status · Priority */}
              <div className="flex flex-wrap items-end gap-x-4 gap-y-3">
                <div>
                  <div className="mb-1 text-[11px] font-medium uppercase tracking-wide text-gray-400">Due Date *</div>
                  <DatePicker
                    value={dueDate}
                    onChange={setDueDate}
                    min={existing ? undefined : todayIST()}
                    placeholder="Due date"
                    className="py-1.5"
                    disabled={readOnlyFields}
                    recurrence={recurrenceRule}
                    onRecurrenceChange={setRecurrenceRule}
                    recurrenceInterval={recurrenceInterval}
                    onRecurrenceIntervalChange={setRecurrenceInterval}
                    recurrenceDays={recurrenceDays}
                    onRecurrenceDaysChange={setRecurrenceDays}
                    recurrenceExcludeDays={recurrenceExcludeDays}
                    onRecurrenceExcludeDaysChange={setRecurrenceExcludeDays}
                    recurrenceUntil={recurrenceUntil}
                    onRecurrenceUntilChange={setRecurrenceUntil}
                  />
                </div>
                <div>
                  <div className="mb-1 text-[11px] font-medium uppercase tracking-wide text-gray-400">Status</div>
                  <Select
                    value={currentStatusRow.id}
                    onChange={(id) => {
                      const row = statusChoices.find((r) => r.id === id);
                      if (!row) return;
                      setStatus(row.base);
                      setStatusId(row.id.startsWith("base:") ? null : row.id);
                    }}
                    size="sm"
                    disabled={!rights.canSetStatus}
                    options={(statusChoices.some((r) => r.id === currentStatusRow.id) ? statusChoices : [currentStatusRow, ...statusChoices]).map((r) => ({
                      value: r.id,
                      label: r.name,
                      disabled: r.base === "Awaiting Approval",
                    }))}
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

              {/* Reminder */}
              <ReminderEditor
                on={reminderOn}
                setOn={setReminderOn}
                repeating={isRepeating}
                date={reminderDate}
                setDate={setReminderDate}
                time={reminderTime}
                setTime={setReminderTime}
                frequency={reminderFrequency}
                setFrequency={setReminderFrequency}
                recipients={reminderRecipients}
                setRecipients={setReminderRecipients}
                days={reminderDays}
                setDays={setReminderDays}
                dueDate={dueDate}
                disabled={readOnlyFields}
              />

              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                rows={3}
                placeholder="Task description"
                readOnly={readOnlyFields}
                className="input resize-none read-only:cursor-default read-only:bg-gray-50 read-only:text-gray-500"
              />

              <div className="grid gap-4 md:grid-cols-2">
                <Field label="Project">
                  <Select
                    value={projectId}
                    onChange={setProjectId}
                    placeholder="No project"
                    disabled={readOnlyFields}
                    options={[{ value: "", label: "No project" }, ...projects.map((p) => ({ value: p.id, label: p.name }))]}
                  />
                </Field>
                <Field label="Department">
                  <Select
                    value={departmentId}
                    onChange={(v) => {
                      setDepartmentId(v);
                      if (v) {
                        const inDept = (id: string) => users.some((u) => u.id === id && String(u.departmentId ?? "") === v);
                        if (existing) {
                          if (!inDept(assigneeId)) setAssigneeId("");
                        } else {
                          setAssigneeIds((ids) => ids.filter(inDept));
                        }
                      }
                    }}
                    placeholder="Any department"
                    disabled={readOnlyFields}
                    options={[
                      { value: "", label: "Any department" },
                      ...departments.map((d) => ({ value: String(d.id), label: `${d.name}${d.memberCount ? ` · ${d.memberCount}` : ""}` })),
                    ]}
                  />
                </Field>
              </div>

              <Field label={existing ? "Assignee *" : "Assignees * (one task each)"}>
                {existing ? (
                  <PeopleSelect
                    people={assigneePeople}
                    value={assigneeId}
                    onChange={setAssigneeId}
                    disabled={readOnlyFields}
                    placeholder={projectMembers ? "Select from this project's members" : "Select assignee"}
                  />
                ) : (
                  <PeopleMultiSelect
                    people={assigneePeople}
                    values={assigneeIds}
                    onChange={setAssigneeIds}
                    placeholder={projectMembers ? "Add this project's members…" : "Search and add assignees…"}
                  />
                )}
                {projectMembers && (
                  <p className="mt-1 text-[11px] text-gray-400">Only members of the chosen project are listed.</p>
                )}
                {!existing && assigneeIds.length > 1 && (
                  <p className="mt-1 text-[11px] text-indigo-600">{assigneeIds.length} people — each gets their own linked copy.</p>
                )}
              </Field>

              <Field label="Followers">
                <PeopleMultiSelect
                  people={followerPeople}
                  values={followerIds.filter((f) => !chosenAssignees.includes(f))}
                  onChange={setFollowerIds}
                  disabled={readOnlyFields}
                  placeholder="Search and add followers…"
                />
              </Field>

              <div className="grid gap-4 md:grid-cols-2">
                <Field label="Client">
                  <ClientSelect
                    clients={clients.map((c) => c.name)}
                    value={clientName}
                    onChange={setClientName}
                    disabled={readOnlyFields}
                    onAddClient={(name) => addParty({ name, type: "Client", phone: "", gstin: "", rating: 0, toReceive: 0, toPay: 0 })}
                  />
                </Field>
                <Field label="Service">
                  <input
                    value={serviceName}
                    onChange={(e) => setServiceName(e.target.value)}
                    list="taskopad-services"
                    readOnly={readOnlyFields}
                    placeholder="e.g. Plumbing, Billing, Site survey"
                    className="input read-only:bg-gray-50"
                  />
                  <datalist id="taskopad-services">
                    {servicesKnown.map((s) => (
                      <option key={s} value={s} />
                    ))}
                  </datalist>
                </Field>
              </div>

              {/* Sub-tasks */}
              <div>
                <div className="mb-1.5 flex items-center justify-between">
                  <span className="flex items-center gap-1 text-[11px] font-medium uppercase tracking-wide text-gray-400">
                    <ListTree size={11} /> Sub tasks ({subtasks.filter((s) => s.done).length}/{subtasks.length})
                  </span>
                  <label className={`flex items-center gap-1.5 text-xs text-gray-600 ${readOnlyFields ? "opacity-60" : ""}`}>
                    <input
                      type="checkbox"
                      checked={subtasksMandatory}
                      onChange={(e) => setSubtasksMandatory(e.target.checked)}
                      disabled={readOnlyFields}
                      className="h-3.5 w-3.5 accent-cyan-600"
                    />
                    Mark as mandatory
                  </label>
                </div>
                <div className="space-y-2">
                  {subtasks.map((s) => (
                    <SubtaskRow
                      key={s.id}
                      s={s}
                      people={allPeople}
                      editable={!readOnlyFields}
                      canStatus={rights.canToggleSubtasks || s.assigneeId === meId}
                      busy={togglingSubtaskId === s.id}
                      onToggle={() => onToggleSubtask(s)}
                      onStatus={(st) => onSubStatus(s, st)}
                      onChange={(patch) => updateSub(s.id, patch)}
                      onRemove={() => setSubtasks((list) => list.filter((x) => x.id !== s.id))}
                    />
                  ))}
                  {!readOnlyFields && (
                    <div className="flex items-center gap-3">
                      <button onClick={() => addSubtask()} className="flex items-center gap-1 text-sm font-medium text-brand-accent hover:underline">
                        <Plus size={14} /> Add Sub Task
                      </button>
                      <span className="text-gray-300">|</span>
                      <button onClick={() => setImportingSubs(true)} className="flex items-center gap-1 text-sm font-medium text-brand-accent hover:underline">
                        <ClipboardPaste size={13} /> Import Subtask
                      </button>
                    </div>
                  )}
                  {readOnlyFields && subtasks.length === 0 && <p className="text-xs text-gray-400">No sub tasks.</p>}
                  {subtasksMandatory && subtasks.length > 0 && (
                    <p className="text-[11px] text-amber-600">The task can&apos;t be completed until every sub-task is done.</p>
                  )}
                </div>
              </div>

              {error && <div className="text-xs font-medium text-rose-600">{error}</div>}
              {conflict && (
                <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2.5 text-xs text-amber-800">
                  <p className="font-medium">{conflict}</p>
                  <p className="mt-0.5">Saving now would replace their changes.</p>
                  <div className="mt-2 flex gap-2">
                    {live && onReload && (
                      <button
                        type="button"
                        onClick={() => void reloadLatest()}
                        className="rounded-md border border-amber-300 bg-white px-2.5 py-1 font-medium hover:bg-amber-100"
                      >
                        Reload their version
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => void save(lastAsDraft.current, true)}
                      className="rounded-md bg-amber-600 px-2.5 py-1 font-medium text-white hover:bg-amber-700"
                    >
                      Save mine anyway
                    </button>
                  </div>
                </div>
              )}
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
          <div className="hidden w-[360px] shrink-0 flex-col lg:flex">
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

            <div className="flex items-center justify-end gap-1.5 border-b border-gray-100 px-3 py-1.5">
              {panelSearchOpen ? (
                <div className="flex flex-1 items-center gap-1.5 rounded-lg border border-gray-200 px-2 py-1 focus-within:border-cyan-500">
                  <Search size={13} className="text-gray-400" />
                  <input
                    autoFocus
                    value={panelQuery}
                    onChange={(e) => setPanelQuery(e.target.value)}
                    placeholder={panel === "Comment" ? "Search messages…" : panel === "Attachment" ? "Search files…" : "Search activity…"}
                    className="w-full bg-transparent text-xs outline-none"
                  />
                  <button
                    onClick={() => {
                      setPanelQuery("");
                      setPanelSearchOpen(false);
                    }}
                    className="text-gray-300 hover:text-gray-500"
                    title="Close search"
                  >
                    <X size={12} />
                  </button>
                </div>
              ) : (
                <button onClick={() => setPanelSearchOpen(true)} title="Search" className="rounded-md p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-700">
                  <Search size={15} />
                </button>
              )}
              <DatePicker value={panelDate} onChange={setPanelDate} placeholder="Any date" className="!py-1 text-xs" />
              {panelFiltering && (
                <button
                  onClick={() => {
                    setPanelQuery("");
                    setPanelDate("");
                    setPanelSearchOpen(false);
                  }}
                  className="text-[11px] font-medium text-gray-400 hover:text-rose-600"
                >
                  Clear
                </button>
              )}
            </div>

            <div className="flex-1 overflow-y-auto px-4 py-3">
              {panel === "Comment" && panelFiltering && shownComments.length + shownFiles.length === 0 ? (
                <p className="py-10 text-center text-xs text-gray-400">No messages match.</p>
              ) : panel === "Comment" ? (
                <ChatThread
                  comments={shownComments}
                  attachments={shownFiles}
                  userName={userName}
                  meId={meId}
                  onOpenAttachment={(a) => void openFile(a)}
                  onRemove={isDrafting ? removeDraft : undefined}
                />
              ) : panel === "Attachment" ? (
                <div className="space-y-3">
                  {/*
                    Files go to the shared registry against this task — the same row the project's
                    Files tab lists under "Tasks" and Taskopad's Documents page lists. Old inline
                    attachments without a registry copy show read-only underneath.
                  */}
                  {existing && panelFiltering ? (
                    shownFiles.length === 0 ? (
                      <p className="py-6 text-center text-xs text-gray-400">No files match.</p>
                    ) : (
                      shownFiles.map((f) => (
                        <button
                          key={f.id}
                          onClick={() => void openFile(f)}
                          className="flex w-full items-center gap-2.5 rounded-lg border border-gray-100 px-3 py-2 text-left hover:border-cyan-200 hover:bg-cyan-50/30"
                        >
                          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-cyan-50 text-brand-accent">
                            <FileText size={16} />
                          </div>
                          <div className="min-w-0 flex-1">
                            <div className="truncate text-sm font-medium text-gray-700">{f.name}</div>
                            <div className="text-[10px] text-gray-400">
                              {f.size} · {userName(f.userId)} · {formatTaskDateTime(f.at)}
                            </div>
                          </div>
                        </button>
                      ))
                    )
                  ) : existing ? (
                    <ModuleAttachments
                      module="TASK"
                      sourceId={Number(existing.id)}
                      projectId={projectId ? Number(projectId) : null}
                      label={`Task: ${title || existing.title}`}
                      legacy={legacyAttachments.filter((a) => a.url).map((a) => ({ name: a.name, dataUrl: a.url! }))}
                    />
                  ) : (
                    <>
                      <button
                        onClick={() => fileRef.current?.click()}
                        className="flex w-full items-center justify-center gap-1.5 rounded-lg border border-dashed border-gray-300 py-3 text-sm text-gray-500 transition-colors duration-150 hover:border-brand-accent hover:text-brand-accent"
                      >
                        <Paperclip size={14} /> Upload a file
                      </button>
                      {draftFiles.length === 0 ? (
                        <p className="py-6 text-center text-xs text-gray-400">No attachments yet.</p>
                      ) : (
                        draftFiles.map((f) => (
                          <div key={f.id} className="flex items-center gap-2.5 rounded-lg border border-gray-100 px-3 py-2">
                            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-cyan-50 text-brand-accent">
                              <FileText size={16} />
                            </div>
                            <div className="min-w-0 flex-1">
                              <div className="truncate text-sm font-medium text-gray-700">{f.file.name}</div>
                              <div className="text-[10px] text-gray-400">{formatBytes(f.file.size)} · Uploaded when you create the task</div>
                            </div>
                            <button
                              onClick={() => removeDraft("attachment", f.id)}
                              className="shrink-0 rounded-lg border border-gray-200 bg-white p-1.5 text-gray-400 transition-all duration-150 hover:border-rose-200 hover:bg-rose-50 hover:text-rose-500 active:scale-95"
                            >
                              <Trash2 size={13} />
                            </button>
                          </div>
                        ))
                      )}
                    </>
                  )}
                </div>
              ) : liveTask ? (
                shownActivity.length === 0 && panelFiltering ? (
                  <p className="py-10 text-center text-xs text-gray-400">No activity matches.</p>
                ) : (
                  <ActivityTimeline items={shownActivity} userName={userName} />
                )
              ) : (
                <p className="py-10 text-center text-xs text-gray-400">The activity log starts once the task is created.</p>
              )}
            </div>

            {panel === "Comment" && (
              <div className="relative border-t border-gray-100 px-3 py-2">
                {showQuick && (
                  <div className="animate-menu-pop absolute bottom-full left-3 right-3 mb-2 max-h-60 overflow-y-auto rounded-xl border border-gray-100 bg-white py-1 shadow-xl">
                    <div className="flex items-center justify-between px-3 py-1.5 text-[11px] font-medium uppercase tracking-wide text-gray-400">
                      Quick replies
                      <a href="/taskopad/settings?tab=quick-replies" className="normal-case text-brand-accent hover:underline">
                        Manage
                      </a>
                    </div>
                    {quickReplies.length === 0 ? (
                      <p className="px-3 py-3 text-xs text-gray-400">No quick replies yet. Add some under More → Quick Reply.</p>
                    ) : (
                      quickReplies.map((q) => (
                        <button
                          key={q.id}
                          onClick={() => {
                            setCommentText((t) => (t ? `${t} ${q.message}` : q.message));
                            setShowQuick(false);
                          }}
                          className="block w-full px-3 py-2 text-left hover:bg-cyan-50"
                        >
                          <span className="block text-xs font-medium text-gray-800">{q.title}</span>
                          <span className="block truncate text-[11px] text-gray-500">{q.message}</span>
                        </button>
                      ))
                    )}
                  </div>
                )}
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setShowQuick((s) => !s)}
                    title="Quick replies"
                    className={`rounded-full border p-2 transition-all duration-150 active:scale-90 ${
                      showQuick ? "border-brand-accent text-brand-accent" : "border-gray-200 text-gray-500 hover:border-brand-accent hover:text-brand-accent"
                    }`}
                  >
                    <Zap size={14} />
                  </button>
                  <input
                    value={commentText}
                    onChange={(e) => setCommentText(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && sendComment()}
                    placeholder={isDrafting ? "Type a message — sent on create" : "Type a message"}
                    className="flex-1 rounded-full border border-gray-200 px-3 py-1.5 text-sm outline-none transition-colors duration-150 focus:border-cyan-500"
                  />
                  <button
                    onClick={() => fileRef.current?.click()}
                    disabled={uploading}
                    title="Attach a file"
                    className="rounded-full border border-gray-200 p-2 text-gray-500 transition-all duration-150 hover:border-brand-accent hover:text-brand-accent active:scale-90 disabled:opacity-60"
                  >
                    {uploading ? <Loader2 size={14} className="animate-spin" /> : <Paperclip size={14} />}
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
              </div>
            )}
          </div>
        </div>
      </div>

      {previewId && legacyAttachments.length > 0 && (
        <AttachmentPreview attachments={legacyAttachments} startId={previewId} onClose={() => setPreviewId(null)} />
      )}
      {confirmClose && (
        <div
          className="animate-overlay-in fixed inset-0 z-[60] flex items-center justify-center bg-black/40 p-4"
          onClick={(e) => {
            e.stopPropagation();
            keepEditing();
          }}
        >
          <div className="w-full max-w-sm rounded-xl bg-white p-5 shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-sm font-semibold text-gray-800">Close this new task?</h3>
            <p className="mt-1.5 text-sm text-gray-500">
              It hasn&apos;t been submitted yet. If you close it, it will be saved as a <strong>draft</strong> so nothing
              you typed is lost — you can open it from the task list and submit it later.
            </p>
            <div className="mt-4 flex justify-end gap-2">
              <button
                type="button"
                onClick={keepEditing}
                autoFocus
                className="rounded-lg border border-gray-200 px-4 py-2 text-sm font-medium text-gray-600 transition-all duration-150 hover:bg-gray-50 active:scale-95"
              >
                Keep editing
              </button>
              <button
                type="button"
                onClick={() => void closeAsDraft()}
                className="rounded-lg bg-brand-accent px-4 py-2 text-sm font-medium text-white transition-all duration-150 hover:opacity-90 active:scale-95"
              >
                Close &amp; save draft
              </button>
            </div>
          </div>
        </div>
      )}
      {importingSubs && (
        <ImportSubtasksDialog
          onClose={() => setImportingSubs(false)}
          onImport={(lines) => {
            lines.forEach((l) => addSubtask(l));
            setImportingSubs(false);
          }}
        />
      )}
    </div>
  );
}

/**
 * The reminder settings Taskopad offers: when it starts, how often it repeats, who hears it, and on
 * which weekdays. The server sends it on time as an in-app notification (header bell).
 */
function ReminderEditor({
  on,
  setOn,
  repeating,
  date,
  setDate,
  time,
  setTime,
  frequency,
  setFrequency,
  recipients,
  setRecipients,
  days,
  setDays,
  dueDate,
  disabled,
}: {
  on: boolean;
  setOn: (v: boolean) => void;
  repeating: boolean;
  date: string;
  setDate: (v: string) => void;
  time: string;
  setTime: (v: string) => void;
  frequency: ReminderFrequency;
  setFrequency: (v: ReminderFrequency) => void;
  recipients: ReminderRecipients;
  setRecipients: (v: ReminderRecipients) => void;
  days: string;
  setDays: (v: string) => void;
  dueDate: string;
  disabled: boolean;
}) {
  return (
    <div className={`rounded-xl border px-4 py-3 ${on ? "border-orange-200 bg-orange-50/40" : "border-gray-200"}`}>
      <div className="flex items-center justify-between">
        <span className="flex items-center gap-1.5 text-sm font-medium text-gray-700">
          <Bell size={14} className={on ? "text-orange-500" : "text-gray-400"} /> Remind on
        </span>
        <button
          type="button"
          role="switch"
          aria-checked={on}
          disabled={disabled}
          onClick={() => {
            const next = !on;
            setOn(next);
            if (next && !repeating && !date) setDate(dueDate || toIso(new Date()));
            if (next && !time) setTime("10:00");
          }}
          className={`relative h-5 w-9 rounded-full transition-colors duration-200 disabled:opacity-50 ${on ? "bg-orange-500" : "bg-gray-200"}`}
        >
          <span className={`absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition-all duration-200 ${on ? "left-[18px]" : "left-0.5"}`} />
        </button>
      </div>
      {on && (
        <div className="mt-3 space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            {!repeating && <DatePicker value={date} onChange={setDate} placeholder="Reminder start date" className="py-1.5" disabled={disabled} />}
            <input
              type="time"
              value={time}
              onChange={(e) => setTime(e.target.value)}
              disabled={disabled}
              className="rounded-lg border border-gray-200 bg-white px-2 py-1.5 text-sm text-gray-700 outline-none focus:border-cyan-500 disabled:opacity-60"
            />
            {repeating && <span className="text-[11px] text-gray-500">on each occurrence&apos;s due date</span>}
          </div>
          <div>
            <div className="mb-1 text-[11px] font-medium text-gray-500">Reminder get</div>
            <Segmented value={recipients} options={RECIPIENTS} onChange={setRecipients} disabled={disabled} />
          </div>
          <div>
            <div className="mb-1 text-[11px] font-medium text-gray-500">Frequency</div>
            <Segmented value={frequency} options={FREQUENCIES} onChange={setFrequency} disabled={disabled} />
          </div>
          {frequency === "WEEKLY" && (
            <div>
              <div className="mb-1 text-[11px] font-medium text-gray-500">On these days</div>
              <WeekdayPicker value={days} onChange={setDays} />
            </div>
          )}
          <p className="text-[11px] text-gray-400">Sent as a notification in the bell at the top of the app, until the task is completed.</p>
        </div>
      )}
    </div>
  );
}

function Segmented<T extends string>({
  value,
  options,
  onChange,
  disabled,
}: {
  value: T;
  options: { value: T; label: string }[];
  onChange: (v: T) => void;
  disabled?: boolean;
}) {
  return (
    <div className="inline-flex overflow-hidden rounded-lg border border-gray-200 bg-white text-xs">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          disabled={disabled}
          onClick={() => onChange(o.value)}
          className={`border-r border-gray-100 px-3 py-1.5 last:border-r-0 disabled:cursor-not-allowed ${
            value === o.value ? "bg-cyan-50 font-medium text-brand-accent" : "text-gray-600 hover:bg-gray-50"
          }`}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

/** One sub-task: its own title, status, priority, assignee and due date (Taskopad parity). */
function SubtaskRow({
  s,
  people,
  editable,
  canStatus,
  busy,
  onToggle,
  onStatus,
  onChange,
  onRemove,
}: {
  s: SubTask;
  people: Person[];
  editable: boolean;
  canStatus: boolean;
  busy: boolean;
  onToggle: () => void;
  onStatus: (st: TaskStatus) => void;
  onChange: (patch: Partial<SubTask>) => void;
  onRemove: () => void;
}) {
  const missing = !s.title.trim() || !s.assigneeId || !s.dueDate;
  return (
    <div className={`rounded-lg border px-3 py-2 ${missing && editable ? "border-amber-200 bg-amber-50/30" : "border-gray-100"}`}>
      <div className="flex items-center gap-2">
        <input
          type="checkbox"
          checked={s.done}
          disabled={!canStatus || busy}
          onChange={onToggle}
          className="h-3.5 w-3.5 accent-cyan-600 disabled:cursor-not-allowed disabled:opacity-50"
        />
        <input
          value={s.title}
          onChange={(e) => onChange({ title: e.target.value })}
          readOnly={!editable}
          placeholder="Write your sub task"
          className={`min-w-0 flex-1 bg-transparent text-sm outline-none ${s.done ? "text-gray-400 line-through" : "text-gray-700"}`}
        />
        {editable && (
          <button onClick={onRemove} title="Delete sub-task" className="rounded p-1 text-gray-300 transition-colors duration-150 hover:bg-rose-50 hover:text-rose-500">
            <Trash2 size={13} />
          </button>
        )}
      </div>
      <div className="mt-2 grid grid-cols-2 gap-2 lg:grid-cols-4">
        <Select
          value={s.status ?? (s.done ? "Completed" : "Pending")}
          onChange={(v) => onStatus(v as TaskStatus)}
          size="sm"
          disabled={!canStatus}
          options={SUB_STATUSES.map((st) => ({ value: st, label: st }))}
        />
        <Select
          value={s.priority ?? "Low"}
          onChange={(v) => onChange({ priority: v as TaskPriority })}
          size="sm"
          disabled={!editable}
          options={TASK_PRIORITIES.map((p) => ({ value: p, label: p }))}
        />
        <PeopleSelect people={people} value={s.assigneeId ?? ""} onChange={(id) => onChange({ assigneeId: id || undefined })} disabled={!editable} placeholder="Assignee" />
        <DatePicker value={s.dueDate ?? ""} onChange={(d) => onChange({ dueDate: d || null })} placeholder="Due date" className="py-1.5" disabled={!editable} />
      </div>
    </div>
  );
}

/** "Import Subtask": paste a list, one sub-task per line. */
function ImportSubtasksDialog({ onClose, onImport }: { onClose: () => void; onImport: (lines: string[]) => void }) {
  const [text, setText] = useState("");
  const lines = text
    .split(/\r?\n/)
    .map((l) => l.replace(/^[\s\-*•\d.)]+/, "").trim())
    .filter(Boolean);
  return (
    <div className="animate-overlay-in fixed inset-0 z-[60] flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div className="w-full max-w-md rounded-2xl bg-white p-5 shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="mb-3 flex items-center justify-between">
          <h3 className="text-base font-semibold text-gray-800">Import Subtask</h3>
          <button onClick={onClose} className="rounded-full p-1 text-gray-400 hover:bg-gray-100">
            <X size={16} />
          </button>
        </div>
        <p className="mb-2 text-xs text-gray-500">Paste one sub-task per line — from Excel, WhatsApp or a list. Bullets and numbers are removed.</p>
        <textarea value={text} onChange={(e) => setText(e.target.value)} rows={8} autoFocus className="input resize-none" placeholder={"Check scaffolding\nCheck fire extinguishers\nUpdate site register"} />
        <div className="mt-4 flex justify-end gap-2">
          <button onClick={onClose} className="rounded-lg border border-gray-200 px-4 py-2 text-sm font-medium text-gray-600 hover:bg-gray-50">
            Cancel
          </button>
          <button
            disabled={lines.length === 0}
            onClick={() => onImport(lines)}
            className="rounded-lg bg-brand-accent px-4 py-2 text-sm font-medium text-white hover:opacity-90 disabled:opacity-40"
          >
            Add {lines.length || ""} sub-task{lines.length === 1 ? "" : "s"}
          </button>
        </div>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="block">
      <span className="mb-1.5 flex items-center gap-1 text-[11px] font-medium tracking-wide text-gray-400 uppercase">{label}</span>
      {children}
    </div>
  );
}
