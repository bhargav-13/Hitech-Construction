"use client";

import { useState } from "react";
import { Modal } from "./Modal";
import { useAppStore, CREW } from "@/lib/store";

export function NewTimesheetModal({ onClose }: { onClose: () => void }) {
  const addTimesheet = useAppStore((s) => s.addTimesheet);
  const [party, setParty] = useState(CREW[0]);
  const [date, setDate] = useState("");
  const [task, setTask] = useState("");
  const [hours, setHours] = useState("8");

  function submit() {
    addTimesheet({
      party,
      date: date || "01-Jul-2026",
      task: task || "General Site Work",
      hours: Number(hours) || 0,
    });
    onClose();
  }

  return (
    <Modal onClose={onClose}>
      <div className="p-8">
        <h2 className="mb-6 text-lg font-semibold text-gray-800">New Timesheet</h2>
        <div className="space-y-4">
          <label className="block">
            <span className="mb-1 block text-xs font-medium text-gray-500">Party</span>
            <select value={party} onChange={(e) => setParty(e.target.value)} className="input">
              {CREW.map((c) => (
                <option key={c}>{c}</option>
              ))}
            </select>
          </label>
          <label className="block">
            <span className="mb-1 block text-xs font-medium text-gray-500">Date</span>
            <input
              value={date}
              onChange={(e) => setDate(e.target.value)}
              placeholder="e.g. 01-Jul-2026"
              className="input"
            />
          </label>
          <label className="block">
            <span className="mb-1 block text-xs font-medium text-gray-500">Task</span>
            <input
              value={task}
              onChange={(e) => setTask(e.target.value)}
              placeholder="e.g. 170 Dia Pipe Laying"
              className="input"
            />
          </label>
          <label className="block">
            <span className="mb-1 block text-xs font-medium text-gray-500">Hours</span>
            <input
              type="number"
              value={hours}
              onChange={(e) => setHours(e.target.value)}
              className="input"
            />
          </label>
          <button
            onClick={submit}
            className="w-full rounded-lg bg-brand-accent py-2.5 text-sm font-medium text-white hover:opacity-90"
          >
            Save Timesheet
          </button>
        </div>
      </div>
    </Modal>
  );
}
