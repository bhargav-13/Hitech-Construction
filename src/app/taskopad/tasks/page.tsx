"use client";

import { Suspense } from "react";
import { TaskopadShell } from "@/components/task/TaskopadShell";
import { TaskWorkspace } from "@/components/task/TaskWorkspace";

/** All tasks across every project. The project-scoped view lives in the project workspace. */
export default function TaskopadTasksPage() {
  return (
    <TaskopadShell>
      {/* TaskWorkspace reads query params, which needs a boundary for the production build. */}
      <Suspense fallback={null}>
        <TaskWorkspace />
      </Suspense>
    </TaskopadShell>
  );
}
