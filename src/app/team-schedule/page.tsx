"use client";

import { useState } from "react";
import { ChevronDown, Download, HardHat, Search } from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { GanttChart } from "@/components/GanttChart";
import { NewTimesheetModal } from "@/components/NewTimesheetModal";
import { useAppStore, CREW } from "@/lib/store";

export default function TeamSchedulePage() {
  const [tab, setTab] = useState<"Schedule" | "Timesheet">("Schedule");
  const scheduleTasks = useAppStore((s) => s.scheduleTasks);
  const timesheets = useAppStore((s) => s.timesheets);
  const [showNewTimesheet, setShowNewTimesheet] = useState(false);

  return (
    <AppShell title="Team Schedule">
      <div className="mb-4 flex gap-6 border-b border-gray-200">
        {(["Schedule", "Timesheet"] as const).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`border-b-2 px-1 py-2 text-sm font-medium ${
              tab === t
                ? "border-brand-accent text-brand-accent"
                : "border-transparent text-gray-500 hover:text-gray-700"
            }`}
          >
            {t}
          </button>
        ))}
      </div>

      {tab === "Schedule" ? (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 className="text-lg font-semibold text-gray-800">Team Gantt View</h2>
            <div className="flex flex-wrap items-center gap-2">
              <ToolbarSelect label="Month" />
              <div className="flex items-center gap-1 rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-400">
                From <span className="text-gray-300">–</span> To
              </div>
              <ToolbarSelect label="Filter by assignee" />
              <ToolbarSelect label="All statuses" />
              <ToolbarSelect label="Filter by project" />
              <button className="flex items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-600 hover:bg-gray-50">
                <Download size={14} />
                Export
              </button>
            </div>
          </div>
          <GanttChart tasks={scheduleTasks} crew={CREW} />
        </div>
      ) : (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <ToolbarSelect label="Party" />
              <ToolbarSelect label="Date Filter" />
              <div className="flex items-center gap-2 rounded-lg border border-gray-200 bg-white px-3 py-2">
                <input placeholder="search" className="w-32 text-sm outline-none" readOnly />
                <Search size={15} className="text-gray-400" />
              </div>
            </div>
            <button
              onClick={() => setShowNewTimesheet(true)}
              className="rounded-lg bg-brand-accent px-4 py-2.5 text-sm font-medium text-white hover:opacity-90"
            >
              + New Timesheet
            </button>
          </div>

          {timesheets.length === 0 ? (
            <div className="flex flex-col items-center justify-center rounded-xl border border-gray-200 bg-white py-20">
              <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-amber-50 text-amber-500">
                <HardHat size={32} />
              </div>
              <p className="text-sm text-gray-500">No Timesheet Available.</p>
              <p className="text-sm text-gray-500">Add New Timesheet.</p>
              <button
                onClick={() => setShowNewTimesheet(true)}
                className="mt-4 rounded-lg bg-brand-accent px-4 py-2.5 text-sm font-medium text-white hover:opacity-90"
              >
                + New Timesheet
              </button>
            </div>
          ) : (
            <div className="overflow-x-auto rounded-xl border border-gray-200 bg-white">
              <table className="w-full min-w-[600px] border-collapse text-sm">
                <thead>
                  <tr className="border-b border-gray-100 bg-gray-50 text-left text-xs font-medium text-gray-500">
                    <th className="px-4 py-3">Party</th>
                    <th className="px-4 py-3">Date</th>
                    <th className="px-4 py-3">Task</th>
                    <th className="px-4 py-3">Hours</th>
                    <th className="px-4 py-3">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {timesheets.map((ts) => (
                    <tr key={ts.id} className="border-b border-gray-50 last:border-b-0">
                      <td className="px-4 py-3 text-gray-700">{ts.party}</td>
                      <td className="px-4 py-3 text-gray-700">{ts.date}</td>
                      <td className="px-4 py-3 text-gray-700">{ts.task}</td>
                      <td className="px-4 py-3 text-gray-700">{ts.hours}</td>
                      <td className="px-4 py-3">
                        <span
                          className={`rounded-md px-2 py-1 text-xs font-medium ${
                            ts.status === "Approved"
                              ? "bg-green-100 text-green-700"
                              : "bg-amber-100 text-amber-700"
                          }`}
                        >
                          {ts.status}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {showNewTimesheet && <NewTimesheetModal onClose={() => setShowNewTimesheet(false)} />}
    </AppShell>
  );
}

function ToolbarSelect({ label }: { label: string }) {
  return (
    <button className="flex items-center gap-1 rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-600 hover:bg-gray-50">
      {label}
      <ChevronDown size={14} />
    </button>
  );
}
