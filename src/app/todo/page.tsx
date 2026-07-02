"use client";

import { useState } from "react";
import { CalendarDays, ChevronLeft, ChevronRight, Plus, UserRound } from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { Modal } from "@/components/Modal";
import { useAppStore, CREW } from "@/lib/store";
import type { TodoPriority, TodoStatus, TodoTask } from "@/lib/types";

const STATUSES: TodoStatus[] = ["To Do", "In Progress", "Done"];
const PRIORITIES: TodoPriority[] = ["High", "Medium", "Low"];

const PRIORITY_CLS: Record<TodoPriority, string> = {
  High: "bg-rose-100 text-rose-700",
  Medium: "bg-amber-100 text-amber-700",
  Low: "bg-gray-100 text-gray-600",
};

const COLUMN_ACCENT: Record<TodoStatus, string> = {
  "To Do": "border-t-gray-400",
  "In Progress": "border-t-blue-500",
  Done: "border-t-green-500",
};

export default function TodoPage() {
  const todos = useAppStore((s) => s.todos);
  const updateTodo = useAppStore((s) => s.updateTodo);
  const projects = useAppStore((s) => s.projects);
  const [showNew, setShowNew] = useState(false);

  const projectName = (id: string) => projects.find((p) => p.id === id)?.name ?? "—";

  function move(task: TodoTask, dir: 1 | -1) {
    const idx = STATUSES.indexOf(task.status);
    const next = STATUSES[idx + dir];
    if (!next) return;
    updateTodo(task.id, {
      status: next,
      completion: next === "Done" ? 100 : next === "In Progress" ? Math.max(task.completion, 10) : task.completion,
    });
  }

  return (
    <AppShell title="To Do">
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-lg font-semibold text-gray-800">Task Board</h2>
        <button
          onClick={() => setShowNew(true)}
          className="flex items-center gap-1.5 rounded-lg bg-brand-accent px-4 py-2.5 text-sm font-medium text-white hover:opacity-90"
        >
          <Plus size={15} />
          New Task
        </button>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        {STATUSES.map((status) => {
          const columnTasks = todos.filter((t) => t.status === status);
          return (
            <div
              key={status}
              className={`rounded-xl border border-gray-200 border-t-4 bg-white ${COLUMN_ACCENT[status]}`}
            >
              <div className="flex items-center justify-between border-b border-gray-100 px-4 py-3">
                <h3 className="text-sm font-semibold text-gray-700">{status}</h3>
                <span className="rounded-full bg-gray-100 px-2 py-0.5 text-xs text-gray-500">
                  {columnTasks.length}
                </span>
              </div>
              <div className="space-y-3 p-3">
                {columnTasks.length === 0 && (
                  <div className="py-8 text-center text-xs text-gray-300">No tasks</div>
                )}
                {columnTasks.map((task) => (
                  <div key={task.id} className="rounded-lg border border-gray-100 bg-gray-50/60 p-3">
                    <div className="mb-2 flex items-start justify-between gap-2">
                      <div className="text-sm font-medium text-gray-800">{task.title}</div>
                      <span
                        className={`shrink-0 rounded-md px-1.5 py-0.5 text-[10px] font-medium ${PRIORITY_CLS[task.priority]}`}
                      >
                        {task.priority}
                      </span>
                    </div>
                    <div className="mb-2 truncate text-xs text-gray-400">
                      {projectName(task.projectId)}
                    </div>
                    <div className="mb-2 flex items-center gap-3 text-xs text-gray-500">
                      <span className="inline-flex items-center gap-1">
                        <UserRound size={12} />
                        {task.assignee.split(" ").slice(0, 2).join(" ")}
                      </span>
                      <span className="inline-flex items-center gap-1">
                        <CalendarDays size={12} />
                        {task.dueDate}
                      </span>
                    </div>
                    <div className="mb-2 flex items-center gap-2">
                      <div className="h-1.5 flex-1 rounded-full bg-gray-200">
                        <div
                          className={`h-1.5 rounded-full ${task.completion >= 100 ? "bg-green-500" : "bg-brand-accent"}`}
                          style={{ width: `${task.completion}%` }}
                        />
                      </div>
                      <span className="text-[10px] text-gray-400">{task.completion}%</span>
                    </div>
                    <div className="flex justify-between">
                      <button
                        onClick={() => move(task, -1)}
                        disabled={status === "To Do"}
                        className="flex items-center gap-0.5 text-xs text-gray-400 hover:text-gray-600 disabled:invisible"
                      >
                        <ChevronLeft size={13} />
                        {STATUSES[STATUSES.indexOf(status) - 1]}
                      </button>
                      <button
                        onClick={() => move(task, 1)}
                        disabled={status === "Done"}
                        className="flex items-center gap-0.5 text-xs font-medium text-brand-accent hover:underline disabled:invisible"
                      >
                        {STATUSES[STATUSES.indexOf(status) + 1]}
                        <ChevronRight size={13} />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          );
        })}
      </div>

      {showNew && <NewTaskModal onClose={() => setShowNew(false)} />}
    </AppShell>
  );
}

function NewTaskModal({ onClose }: { onClose: () => void }) {
  const addTodo = useAppStore((s) => s.addTodo);
  const projects = useAppStore((s) => s.projects);
  const [title, setTitle] = useState("");
  const [projectId, setProjectId] = useState(projects[0]?.id ?? "");
  const [assignee, setAssignee] = useState(CREW[0]);
  const [priority, setPriority] = useState<TodoPriority>("Medium");
  const [dueDate, setDueDate] = useState("");

  function save() {
    if (!title.trim()) return;
    addTodo({
      title,
      projectId,
      assignee,
      priority,
      dueDate: dueDate || "10-Jul-2026",
      status: "To Do",
      completion: 0,
    });
    onClose();
  }

  return (
    <Modal onClose={onClose}>
      <div className="p-8">
        <h2 className="mb-6 text-lg font-semibold text-gray-800">New Task</h2>
        <div className="space-y-4">
          <label className="block">
            <span className="mb-1 block text-xs font-medium text-gray-500">Task Title</span>
            <input value={title} onChange={(e) => setTitle(e.target.value)} className="input" />
          </label>
          <label className="block">
            <span className="mb-1 block text-xs font-medium text-gray-500">Project</span>
            <select value={projectId} onChange={(e) => setProjectId(e.target.value)} className="input">
              {projects.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </label>
          <div className="grid grid-cols-2 gap-4">
            <label className="block">
              <span className="mb-1 block text-xs font-medium text-gray-500">Assignee</span>
              <select value={assignee} onChange={(e) => setAssignee(e.target.value)} className="input">
                {CREW.map((c) => (
                  <option key={c}>{c}</option>
                ))}
              </select>
            </label>
            <label className="block">
              <span className="mb-1 block text-xs font-medium text-gray-500">Priority</span>
              <select
                value={priority}
                onChange={(e) => setPriority(e.target.value as TodoPriority)}
                className="input"
              >
                {PRIORITIES.map((p) => (
                  <option key={p}>{p}</option>
                ))}
              </select>
            </label>
          </div>
          <label className="block">
            <span className="mb-1 block text-xs font-medium text-gray-500">Due Date</span>
            <input
              value={dueDate}
              onChange={(e) => setDueDate(e.target.value)}
              placeholder="e.g. 10-Jul-2026"
              className="input"
            />
          </label>
          <button
            onClick={save}
            className="w-full rounded-lg bg-brand-accent py-2.5 text-sm font-medium text-white hover:opacity-90"
          >
            Save Task
          </button>
        </div>
      </div>
    </Modal>
  );
}
