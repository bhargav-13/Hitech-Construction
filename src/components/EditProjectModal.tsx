"use client";

import { useState } from "react";
import { Modal } from "./Modal";
import { useAppStore } from "@/lib/store";
import { projectAvatarColor, projectInitials } from "@/lib/projectHelpers";
import type { Project } from "@/lib/types";

const STAGES = ["Received LOA", "Pending For Land Clearance", "Sample Testing At GERI", "Final Bill In Progress", "Completed"];
const CATEGORIES = ["Road and Building Division", "Rajkot Municipal Corporation", "Directorate Urban Administration and Development"];

export function EditProjectModal({
  project,
  onClose,
}: {
  project: Project;
  onClose: () => void;
}) {
  const updateProject = useAppStore((s) => s.updateProject);
  const [form, setForm] = useState({
    projectCode: project.projectCode,
    name: project.name,
    stage: project.stage,
    category: project.category,
    startDate: project.startDate,
    endDate: project.endDate,
    address: project.address,
    companyBranch: project.companyBranch,
    attendanceRadius: project.attendanceRadius,
    projectValue: project.projectValue,
    orientation: project.orientation,
    dimension: project.dimension,
    scopeOfWork: project.scopeOfWork,
  });

  function save() {
    updateProject(project.id, {
      projectCode: form.projectCode,
      name: form.name,
      stage: form.stage,
      category: form.category,
      startDate: form.startDate,
      endDate: form.endDate,
      address: form.address,
      companyBranch: form.companyBranch,
      attendanceRadius: Number(form.attendanceRadius) || 0,
      projectValue: Number(form.projectValue) || 0,
      orientation: form.orientation,
      dimension: form.dimension,
      scopeOfWork: form.scopeOfWork,
    });
    onClose();
  }

  return (
    <Modal onClose={onClose} wide>
      <div className="p-8">
        <div className="mb-6 flex items-center gap-3">
          <div
            className={`flex h-14 w-14 items-center justify-center rounded-xl text-lg font-semibold text-white ${projectAvatarColor(project.id)}`}
          >
            {projectInitials(project.name)}
          </div>
          <h2 className="text-lg font-semibold text-gray-800">{project.name}</h2>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <Field label="Project Code">
            <input
              value={form.projectCode}
              onChange={(e) => setForm({ ...form, projectCode: e.target.value })}
              placeholder="Project Code"
              className="input"
            />
          </Field>
          <Field label="Project Name">
            <input
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              className="input"
            />
          </Field>

          <Field label="Project Stage">
            <select
              value={form.stage}
              onChange={(e) => setForm({ ...form, stage: e.target.value })}
              className="input"
            >
              <option value="">Select Stage</option>
              {STAGES.map((s) => (
                <option key={s}>{s}</option>
              ))}
            </select>
          </Field>
          <Field label="Project Category">
            <select
              value={form.category}
              onChange={(e) => setForm({ ...form, category: e.target.value })}
              className="input"
            >
              <option value="">Select Category</option>
              {CATEGORIES.map((c) => (
                <option key={c}>{c}</option>
              ))}
            </select>
          </Field>

          <Field label="Start Date">
            <input
              type="text"
              value={form.startDate}
              onChange={(e) => setForm({ ...form, startDate: e.target.value })}
              placeholder="Start Date"
              className="input"
            />
          </Field>
          <Field label="End Date">
            <input
              type="text"
              value={form.endDate}
              onChange={(e) => setForm({ ...form, endDate: e.target.value })}
              placeholder="End Date"
              className="input"
            />
          </Field>

          <div className="col-span-2">
            <Field label="Project Address">
              <input
                value={form.address}
                onChange={(e) => setForm({ ...form, address: e.target.value })}
                placeholder="Address"
                className="input"
              />
            </Field>
          </div>

          <div className="col-span-2">
            <Field label="Company Branch">
              <select
                value={form.companyBranch}
                onChange={(e) => setForm({ ...form, companyBranch: e.target.value })}
                className="input"
              >
                <option value="">Select Company Address</option>
                <option>Hi-Tech Construction - Head Office</option>
                <option>Hi-Tech Construction - Rajkot Branch</option>
              </select>
            </Field>
          </div>

          <Field label="Attendance Radius">
            <input
              type="number"
              value={form.attendanceRadius}
              onChange={(e) => setForm({ ...form, attendanceRadius: Number(e.target.value) })}
              className="input"
            />
          </Field>
          <Field label="Project Value">
            <input
              type="number"
              value={form.projectValue}
              onChange={(e) => setForm({ ...form, projectValue: Number(e.target.value) })}
              className="input"
            />
          </Field>

          <Field label="Project Orientation">
            <input
              value={form.orientation}
              onChange={(e) => setForm({ ...form, orientation: e.target.value })}
              placeholder="Project Orientation"
              className="input"
            />
          </Field>
          <Field label="Project Dimension">
            <input
              value={form.dimension}
              onChange={(e) => setForm({ ...form, dimension: e.target.value })}
              placeholder="Project Dimension"
              className="input"
            />
          </Field>

          <div className="col-span-2">
            <Field label="Scope of Work">
              <textarea
                value={form.scopeOfWork}
                onChange={(e) => setForm({ ...form, scopeOfWork: e.target.value })}
                rows={3}
                className="input resize-none"
              />
            </Field>
          </div>
        </div>

        <div className="mt-6 flex justify-end">
          <button
            onClick={save}
            className="rounded-lg bg-brand-accent px-6 py-2.5 text-sm font-medium text-white hover:opacity-90"
          >
            Save
          </button>
        </div>
      </div>
    </Modal>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-[11px] font-medium tracking-wide text-gray-400 uppercase">
        {label}
      </span>
      {children}
    </label>
  );
}
