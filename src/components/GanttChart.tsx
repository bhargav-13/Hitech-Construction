import type { ScheduleTask } from "@/lib/types";

const MONTHS = [
  "May 2026", "Jun 2026", "Jul 2026", "Aug 2026", "Sep 2026", "Oct 2026",
  "Nov 2026", "Dec 2026", "Jan 2027", "Feb 2027", "Mar 2027", "Apr 2027",
];

const SNO_COL = "56px";
const TASK_COL = "260px";
const MONTH_COL = 90;

export function GanttChart({ tasks, crew }: { tasks: ScheduleTask[]; crew: string[] }) {
  const gridTemplateColumns = `${SNO_COL} ${TASK_COL} repeat(${MONTHS.length}, ${MONTH_COL}px)`;

  const rows: React.ReactNode[] = [];
  let rowIndex = 1;

  function rowLine(row: number) {
    rows.push(
      <div
        key={`line-${row}`}
        className="border-b border-gray-100"
        style={{ gridColumn: "1 / -1", gridRow: row }}
      />
    );
  }

  // Header row
  rowLine(rowIndex);
  rows.push(
    <div
      key="h-sno"
      className="sticky left-0 z-20 bg-gray-50 px-2 py-2 text-xs font-medium text-gray-500"
      style={{ gridColumn: 1, gridRow: rowIndex }}
    >
      S.No
    </div>
  );
  rows.push(
    <div
      key="h-task"
      className="sticky z-20 bg-gray-50 px-3 py-2 text-xs font-medium text-gray-500"
      style={{ gridColumn: 2, gridRow: rowIndex, left: SNO_COL }}
    >
      Task Name
    </div>
  );
  MONTHS.forEach((m, i) => {
    rows.push(
      <div
        key={`h-m-${i}`}
        className="border-l border-gray-100 bg-gray-50 px-2 py-2 text-center text-xs font-medium text-gray-500"
        style={{ gridColumn: 3 + i, gridRow: rowIndex }}
      >
        {m}
      </div>
    );
  });
  rowIndex++;

  crew.forEach((assignee) => {
    const crewTasks = tasks.filter((t) => t.assignee === assignee);
    if (crewTasks.length === 0) return;
    const groupStart = Math.min(...crewTasks.map((t) => t.startMonth));
    const groupEnd = Math.max(...crewTasks.map((t) => t.startMonth + t.span));

    rowLine(rowIndex);
    rows.push(<div key={`g-sno-${assignee}`} style={{ gridColumn: 1, gridRow: rowIndex }} className="sticky left-0 z-10 bg-white" />);
    rows.push(
      <div
        key={`g-task-${assignee}`}
        style={{ gridColumn: 2, gridRow: rowIndex, left: SNO_COL }}
        className="sticky z-10 bg-white"
      />
    );
    rows.push(
      <div
        key={`g-bar-${assignee}`}
        style={{ gridColumn: `${3 + groupStart} / span ${groupEnd - groupStart}`, gridRow: rowIndex }}
        className="m-1 flex items-center justify-center rounded bg-amber-400 text-xs font-medium text-white"
      >
        {assignee}
      </div>
    );
    rowIndex++;

    crewTasks.forEach((task, i) => {
      rowLine(rowIndex);
      rows.push(
        <div
          key={`t-sno-${task.id}`}
          style={{ gridColumn: 1, gridRow: rowIndex }}
          className="sticky left-0 z-10 bg-white px-2 py-2 text-xs text-gray-500"
        >
          {i + 1}
        </div>
      );
      rows.push(
        <div
          key={`t-name-${task.id}`}
          style={{ gridColumn: 2, gridRow: rowIndex, left: SNO_COL }}
          className="sticky z-10 truncate bg-white px-3 py-2 text-xs text-gray-700"
          title={`${task.code} ${task.name}`}
        >
          {task.code} {task.name}
        </div>
      );
      rows.push(
        <div
          key={`t-bar-${task.id}`}
          style={{ gridColumn: `${3 + task.startMonth} / span ${task.span}`, gridRow: rowIndex }}
          className="relative m-1 flex h-7 items-center justify-center overflow-hidden rounded bg-teal-500 text-xs font-medium text-white"
        >
          <div
            className="absolute top-0 left-0 h-full bg-teal-700/70"
            style={{ width: `${task.progress}%` }}
          />
          <span className="relative z-10">{task.progress}%</span>
        </div>
      );
      rowIndex++;
    });
  });

  return (
    <div className="w-full min-w-0 overflow-x-auto rounded-xl border border-gray-200 bg-white">
      <div className="grid" style={{ gridTemplateColumns, width: "max-content" }}>
        {rows}
      </div>
    </div>
  );
}
