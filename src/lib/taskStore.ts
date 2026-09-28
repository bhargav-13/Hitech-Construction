import { create } from "zustand";
import * as tasksApi from "./tasksApi";
import { useAuthStore } from "./authStore";
import { priorityToApi, statusToApi, taskFromApi } from "./taskTypes";
import type { SubTask, Task, TaskPriority, TaskStatus } from "./taskTypes";

// Backend-wired task store (project-service com.hitech.erp.task). Loads once, then keeps a local
// mirror that each mutation refreshes from the server response so activity/comments stay in sync.

export interface TaskInput {
  title: string;
  description: string;
  projectId: string | null;
  assigneeId: string;
  followerIds: string[];
  clientName: string | null;
  status: TaskStatus;
  priority: TaskPriority;
  progress: number;
  dueDate: string;
  subtasks: SubTask[];
  isDraft?: boolean;
  pinned?: boolean;
  reminderAt?: string | null;
  recurrenceRule?: string;
  recurrenceInterval?: number;
  recurrenceUntil?: string | null;
  departmentId?: string | null;
}

function toUpsert(input: TaskInput): tasksApi.TaskUpsertRequest {
  return {
    title: input.title,
    description: input.description || null,
    projectId: input.projectId ? Number(input.projectId) : null,
    assigneeId: Number(input.assigneeId),
    clientName: input.clientName,
    status: statusToApi(input.status),
    priority: priorityToApi(input.priority),
    progress: input.progress,
    dueDate: input.dueDate || null,
    draft: input.isDraft ?? false,
    pinned: input.pinned,
    reminderAt: input.reminderAt ?? null,
    recurrenceRule: input.recurrenceRule,
    recurrenceInterval: input.recurrenceInterval,
    recurrenceUntil: input.recurrenceUntil ?? null,
    departmentId: input.departmentId ? Number(input.departmentId) : undefined,
    followerIds: input.followerIds.map(Number),
    subtasks: input.subtasks.map((s) => ({
      title: s.title,
      done: s.done,
      assigneeId: s.assigneeId ? Number(s.assigneeId) : null,
    })),
  };
}

export type TaskScope = "MINE" | "ALL";

interface TaskState {
  tasks: Task[];
  loading: boolean;
  loaded: boolean;
  /**
   * Whose tasks `tasks` holds. The store lives for the whole tab, so without this a second person
   * signing in on the same browser saw the first person's list until a hard refresh.
   */
  ownerId: number | null;
  error: string | null;
  /** Server-side visibility mode: MINE = my involvement only, ALL = MINE ∪ subtree∩projects. */
  scope: TaskScope;
  setScope: (scope: TaskScope) => Promise<void>;
  load: (force?: boolean) => Promise<void>;
  createTask: (input: TaskInput) => Promise<Task>;
  saveTask: (id: string, input: TaskInput) => Promise<void>;
  /** Inline update from the list/kanban main view — status / priority / progress only (PATCH). */
  patchTask: (
    id: string,
    patch: {
      status?: TaskStatus;
      priority?: TaskPriority;
      progress?: number;
      pinned?: boolean;
      reminderAt?: string | null;
    }
  ) => Promise<void>;
  bulkPatch: (
    ids: string[],
    patch: { status?: TaskStatus; priority?: TaskPriority; pinned?: boolean; assigneeId?: string }
  ) => Promise<void>;
  bulkRemove: (ids: string[]) => Promise<void>;
  removeTask: (id: string) => Promise<void>;
  // ---- Completion approvals ----
  /** Tasks awaiting the signed-in user's approval. */
  approvals: Task[];
  approvalsLoaded: boolean;
  loadApprovals: () => Promise<void>;
  approve: (id: string) => Promise<void>;
  reject: (id: string, note?: string) => Promise<void>;
  toggleSubtask: (taskId: string, subtaskId: string) => Promise<void>;
  addComment: (taskId: string, text: string) => Promise<void>;
  addAttachment: (
    taskId: string,
    file: { name: string; sizeLabel?: string; contentType?: string; dataUrl?: string }
  ) => Promise<void>;
}

function upsertLocal(tasks: Task[], updated: Task): Task[] {
  const idx = tasks.findIndex((t) => t.id === updated.id);
  if (idx === -1) return [updated, ...tasks];
  const next = [...tasks];
  next[idx] = updated;
  return next;
}

export const useTaskStore = create<TaskState>((set, get) => ({
  tasks: [],
  loading: false,
  loaded: false,
  ownerId: null,
  error: null,
  scope: "MINE",

  setScope: async (scope) => {
    if (get().scope === scope) return;
    set({ scope, loaded: false });
    await get().load(true);
  },

  load: async (force = false) => {
    const me = useAuthStore.getState().user?.id ?? null;
    const sameUser = get().ownerId === me;
    if (get().loading && sameUser) return;
    if (get().loaded && !force && sameUser) return;
    // A different person: drop the previous list at once rather than show it while loading.
    set(sameUser ? { loading: true, error: null } : { tasks: [], loading: true, loaded: false, error: null, ownerId: me });
    try {
      const res = await tasksApi.listTasks({ scope: get().scope });
      // Signed out or switched while the request was in flight — this answer belongs to nobody here.
      if ((useAuthStore.getState().user?.id ?? null) !== me) return;
      set({ tasks: res.map(taskFromApi), loading: false, loaded: true, ownerId: me });
    } catch (err) {
      set({ loading: false, error: err instanceof Error ? err.message : "Failed to load tasks" });
    }
  },

  createTask: async (input) => {
    const created = taskFromApi(await tasksApi.createTask(toUpsert(input)));
    set({ tasks: [created, ...get().tasks] });
    return created;
  },

  saveTask: async (id, input) => {
    const updated = taskFromApi(await tasksApi.updateTask(Number(id), toUpsert(input)));
    set({ tasks: upsertLocal(get().tasks, updated) });
  },

  patchTask: async (id, patch) => {
    const updated = taskFromApi(
      await tasksApi.patchTask(Number(id), {
        status: patch.status ? statusToApi(patch.status) : undefined,
        priority: patch.priority ? priorityToApi(patch.priority) : undefined,
        progress: patch.progress,
        pinned: patch.pinned,
        reminderAt: patch.reminderAt,
      })
    );
    set({ tasks: upsertLocal(get().tasks, updated) });
  },

  bulkPatch: async (ids, patch) => {
    const updated = await tasksApi.bulkPatchTasks({
      taskIds: ids.map(Number),
      status: patch.status ? statusToApi(patch.status) : undefined,
      priority: patch.priority ? priorityToApi(patch.priority) : undefined,
      pinned: patch.pinned,
      assigneeId: patch.assigneeId ? Number(patch.assigneeId) : undefined,
    });
    set({ tasks: updated.map(taskFromApi).reduce((acc, t) => upsertLocal(acc, t), get().tasks) });
  },

  bulkRemove: async (ids) => {
    await tasksApi.bulkDeleteTasks(ids.map(Number));
    const gone = new Set(ids);
    set({ tasks: get().tasks.filter((t) => !gone.has(t.id)) });
  },

  removeTask: async (id) => {
    await tasksApi.deleteTask(Number(id));
    set({ tasks: get().tasks.filter((t) => t.id !== id) });
  },

  approvals: [],
  approvalsLoaded: false,

  loadApprovals: async () => {
    try {
      const res = await tasksApi.getPendingApprovals();
      set({ approvals: res.map(taskFromApi), approvalsLoaded: true });
    } catch {
      set({ approvals: [], approvalsLoaded: true });
    }
  },

  approve: async (id) => {
    const updated = taskFromApi(await tasksApi.approveTaskCompletion(Number(id)));
    set({
      tasks: upsertLocal(get().tasks, updated),
      approvals: get().approvals.filter((t) => t.id !== id),
    });
  },

  reject: async (id, note) => {
    const updated = taskFromApi(await tasksApi.rejectTaskCompletion(Number(id), note));
    set({
      tasks: upsertLocal(get().tasks, updated),
      approvals: get().approvals.filter((t) => t.id !== id),
    });
  },

  toggleSubtask: async (taskId, subtaskId) => {
    const updated = taskFromApi(await tasksApi.toggleSubtask(Number(taskId), Number(subtaskId)));
    set({ tasks: upsertLocal(get().tasks, updated) });
  },

  addComment: async (taskId, text) => {
    const updated = taskFromApi(await tasksApi.addComment(Number(taskId), text));
    set({ tasks: upsertLocal(get().tasks, updated) });
  },

  addAttachment: async (taskId, file) => {
    const updated = taskFromApi(
      await tasksApi.addAttachment(Number(taskId), {
        name: file.name,
        sizeLabel: file.sizeLabel,
        contentType: file.contentType,
        dataUrl: file.dataUrl,
      })
    );
    set({ tasks: upsertLocal(get().tasks, updated) });
  },
}));

// Sign-out / sign-in as someone else empties the list, so the next screen loads the new user's.
useAuthStore.subscribe((state, prev) => {
  if ((state.user?.id ?? null) !== (prev.user?.id ?? null)) {
    useTaskStore.setState({ tasks: [], loaded: false, loading: false, ownerId: null, scope: "MINE", error: null });
  }
});
