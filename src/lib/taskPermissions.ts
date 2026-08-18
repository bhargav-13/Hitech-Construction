"use client";

import { useCallback } from "react";
import { useAuthStore } from "./authStore";
import type { Task } from "./taskTypes";

/**
 * Who may change what on a task.
 *
 * The rule the client asked for: a task's real data belongs to whoever raised it. Only the
 * **creator** and **Super Admin** can edit its fields or delete it. The **assignee** owns the work
 * rather than the record, so they can move status and progress and tick sub tasks off, but they
 * can't add, rename or remove sub tasks — the checklist itself is part of the record. Everyone who
 * can see the task — followers included — can always attach files and chat.
 *
 * The backend still enforces its own TASKOPAD:* matrix; this is the UI half, so controls a user
 * can't use are disabled rather than failing on save.
 */
export interface TaskRights {
  /** Creator or Super Admin — may edit every field, delete, pin and reassign. */
  canEditAll: boolean;
  /** Creator, Super Admin or the assignee — the work-progress fields. */
  canSetStatus: boolean;
  canSetProgress: boolean;
  /**
   * Creator, Super Admin or the assignee — ticking sub tasks off. Separate from `canEditAll`
   * because checking an item is doing the work, while adding or deleting one edits the record.
   */
  canToggleSubtasks: boolean;
  /** Deleting is a record-level act, so it tracks canEditAll. */
  canDelete: boolean;
  /** Approving a completion request is the creator's call (or Super Admin's). */
  canApprove: boolean;
  /** Why the editing controls are disabled — shown as a hint in the drawer. */
  reason: string | null;
}

const FULL_RIGHTS: TaskRights = {
  canEditAll: true,
  canSetStatus: true,
  canSetProgress: true,
  canToggleSubtasks: true,
  canDelete: true,
  canApprove: true,
  reason: null,
};

/** Role-name check, matching how Super Admin is identified elsewhere (Settings, TaskWorkspace). */
export function isSuperAdminRole(roleName: string | null | undefined): boolean {
  return (roleName ?? "").trim().toLowerCase() === "super admin";
}

/** Rights for one task. Pass `null` for the create form — a new task is yours by definition. */
export function computeTaskRights(
  task: Task | null | undefined,
  currentUserId: string | null,
  superAdmin: boolean
): TaskRights {
  // A task being created has no owner yet; the author gets the full form.
  if (!task) return FULL_RIGHTS;
  if (superAdmin) return FULL_RIGHTS;

  const isCreator = currentUserId != null && task.createdBy === currentUserId;
  if (isCreator) return FULL_RIGHTS;

  const isAssignee = currentUserId != null && task.assigneeId === currentUserId;
  if (isAssignee) {
    return {
      canEditAll: false,
      canSetStatus: true,
      canSetProgress: true,
      canToggleSubtasks: true,
      canDelete: false,
      canApprove: false,
      reason: "You're the assignee — you can update status and progress, tick sub tasks off, comment and attach files. Only the creator can change the task's details.",
    };
  }

  return {
    canEditAll: false,
    canSetStatus: false,
    canSetProgress: false,
    canToggleSubtasks: false,
    canDelete: false,
    canApprove: false,
    reason: "You can comment and attach files here. Only the task's creator can change its details.",
  };
}

/**
 * Hook form — reads the signed-in user once and returns a `rightsFor(task)` function, so a list
 * screen can ask about many rows without re-subscribing per row.
 */
export function useTaskRights() {
  const user = useAuthStore((s) => s.user);
  const currentUserId = user != null ? String(user.id) : null;
  const superAdmin = isSuperAdminRole(user?.role?.name);

  const rightsFor = useCallback(
    (task: Task | null | undefined) => computeTaskRights(task, currentUserId, superAdmin),
    [currentUserId, superAdmin]
  );

  return { rightsFor, currentUserId, superAdmin };
}
