import { create } from "zustand";
import { seededRandom } from "./random";
import { toIso } from "./taskTypes";
import type { Task, TaskPriority, TaskStatus, SubTask } from "./taskTypes";

// Seeded from the users/projects that already exist in the mock app store, so Taskopad
// reuses the same people (Roles & Access users) and projects rather than inventing new ones.
const USER_IDS = ["u-admin", "u-site-1", "u-site-2", "u-store-1", "u-store-2"];

const TITLES = [
  "Follow up land clearance approval",
  "Submit concrete sample to GERI lab",
  "Collect final bill documents",
  "Diesel stock reorder for site store",
  "Prepare running bill for RMC phase 2",
  "Site safety audit and report",
  "Verify pipe laying measurement sheet",
  "Client meeting - elevation drawing signoff",
  "Reconcile material issue register",
  "Update BOQ against actual execution",
  "Arrange JCB for excavation work",
  "Chase pending work order from RMC",
  "Quality check - MH construction",
  "Prepare monthly progress report",
  "Vendor payment follow-up",
  "Update attendance register for site crew",
  "Coordinate road cutting permission",
  "Inspect shuttering before pour",
];

const DESCRIPTIONS = [
  "Coordinate with the department and share the updated status by end of day.",
  "Attach the supporting documents once the site team confirms measurements.",
  "Blocked on approval — escalate if not cleared by the due date.",
  "Routine check, capture photos and upload them against this task.",
  "",
];

const STATUSES: TaskStatus[] = ["Pending", "In Progress", "On Hold", "Stuck", "Completed"];
const PRIORITIES: TaskPriority[] = ["Low", "Medium", "High"];
const PROJECT_IDS = ["proj-1", "proj-3", "proj-5", "proj-6", "proj-11", "proj-12", "proj-13", "proj-14"];

function seedTasks(): Task[] {
  const rng = seededRandom("taskopad-seed-v1");
  const today = new Date();

  return Array.from({ length: 26 }, (_, i) => {
    const status = STATUSES[Math.floor(rng() * STATUSES.length)];
    const priority = PRIORITIES[Math.floor(rng() * PRIORITIES.length)];
    // Spread due dates across -10..+20 days so "due today"/"past due" buckets are populated.
    const offset = Math.floor(rng() * 31) - 10;
    const due = new Date(today.getFullYear(), today.getMonth(), today.getDate() + offset);
    const assigneeId = USER_IDS[Math.floor(rng() * USER_IDS.length)];
    const progress = status === "Completed" ? 100 : status === "Pending" ? 0 : Math.floor(rng() * 90);

    const subtaskCount = Math.floor(rng() * 4);
    const subtasks: SubTask[] = Array.from({ length: subtaskCount }, (_, s) => ({
      id: `st-${i}-${s}`,
      title: ["Site visit", "Collect documents", "Get approval", "Upload photos"][s % 4],
      done: rng() > 0.5,
    }));

    const createdOffset = -(Math.floor(rng() * 40) + 1);
    const created = new Date(today.getFullYear(), today.getMonth(), today.getDate() + createdOffset);

    return {
      id: `task-${i + 1}`,
      code: `T-${1001 + i}`,
      title: TITLES[i % TITLES.length],
      description: DESCRIPTIONS[Math.floor(rng() * DESCRIPTIONS.length)],
      projectId: rng() > 0.12 ? PROJECT_IDS[Math.floor(rng() * PROJECT_IDS.length)] : null,
      assigneeId,
      followerIds: rng() > 0.6 ? [USER_IDS[Math.floor(rng() * USER_IDS.length)]] : [],
      clientId: null,
      status,
      priority,
      progress,
      dueDate: toIso(due),
      createdAt: toIso(created),
      isDraft: false,
      subtasks,
      comments:
        rng() > 0.6
          ? [
              {
                id: `c-${i}`,
                userId: USER_IDS[Math.floor(rng() * USER_IDS.length)],
                text: "Shared the latest update with the site team.",
                at: toIso(created),
              },
            ]
          : [],
      attachments: [],
      activity: [
        {
          id: `a-${i}`,
          text: "Task created",
          at: toIso(created),
          userId: assigneeId,
        },
      ],
    } satisfies Task;
  });
}

export interface TaskInput {
  title: string;
  description: string;
  projectId: string | null;
  assigneeId: string;
  followerIds: string[];
  clientId: string | null;
  status: TaskStatus;
  priority: TaskPriority;
  progress: number;
  dueDate: string;
  subtasks: SubTask[];
  isDraft?: boolean;
}

interface TaskState {
  tasks: Task[];
  projectsLinked: boolean;
  /** Re-points seeded tasks at real project-service ids once they've loaded (runs once). */
  linkProjects: (projectIds: string[]) => void;
  addTask: (input: TaskInput) => Task;
  updateTask: (id: string, updates: Partial<Task>) => void;
  deleteTask: (id: string) => void;
  toggleSubtask: (taskId: string, subtaskId: string) => void;
  addComment: (taskId: string, userId: string, text: string) => void;
}

export const useTaskStore = create<TaskState>((set, get) => ({
  tasks: seedTasks(),
  projectsLinked: false,

  linkProjects: (projectIds) => {
    if (get().projectsLinked || projectIds.length === 0) return;
    const rng = seededRandom("taskopad-project-link");
    set({
      projectsLinked: true,
      tasks: get().tasks.map((t) =>
        // Seeded tasks carry placeholder "proj-*" ids; real ones already point at the backend.
        t.projectId?.startsWith("proj-")
          ? { ...t, projectId: projectIds[Math.floor(rng() * projectIds.length)] }
          : t
      ),
    });
  },

  addTask: (input) => {
    const now = toIso(new Date());
    const task: Task = {
      id: `task-${Date.now()}`,
      code: `T-${1001 + get().tasks.length}`,
      title: input.title,
      description: input.description,
      projectId: input.projectId,
      assigneeId: input.assigneeId,
      followerIds: input.followerIds,
      clientId: input.clientId,
      status: input.status,
      priority: input.priority,
      progress: input.progress,
      dueDate: input.dueDate,
      createdAt: now,
      isDraft: input.isDraft ?? false,
      subtasks: input.subtasks,
      comments: [],
      attachments: [],
      activity: [{ id: `a-${Date.now()}`, text: "Task created", at: now, userId: input.assigneeId }],
    };
    set({ tasks: [task, ...get().tasks] });
    return task;
  },

  updateTask: (id, updates) => {
    set({
      tasks: get().tasks.map((t) => {
        if (t.id !== id) return t;
        const next = { ...t, ...updates };
        // Keep progress and status coherent — completing a task fills the bar and vice versa.
        if (updates.status === "Completed") next.progress = 100;
        if (updates.progress === 100 && t.status !== "Completed") next.status = "Completed";
        const changed = Object.keys(updates)[0];
        return {
          ...next,
          activity: [
            { id: `a-${Date.now()}`, text: `Updated ${changed}`, at: toIso(new Date()), userId: t.assigneeId },
            ...t.activity,
          ],
        };
      }),
    });
  },

  deleteTask: (id) => set({ tasks: get().tasks.filter((t) => t.id !== id) }),

  toggleSubtask: (taskId, subtaskId) => {
    set({
      tasks: get().tasks.map((t) =>
        t.id === taskId
          ? { ...t, subtasks: t.subtasks.map((s) => (s.id === subtaskId ? { ...s, done: !s.done } : s)) }
          : t
      ),
    });
  },

  addComment: (taskId, userId, text) => {
    set({
      tasks: get().tasks.map((t) =>
        t.id === taskId
          ? {
              ...t,
              comments: [...t.comments, { id: `c-${Date.now()}`, userId, text, at: toIso(new Date()) }],
            }
          : t
      ),
    });
  },
}));
