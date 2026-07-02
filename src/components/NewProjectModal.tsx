"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, Search } from "lucide-react";
import { Modal } from "./Modal";
import { useAppStore } from "@/lib/store";

const TABS = ["Dasboard", "Transactions", "Attendance", "Materials", "Tasks", "Photos", "Billing"];

function PreviewPanel() {
  return (
    <div className="relative hidden w-[46%] shrink-0 overflow-hidden rounded-r-2xl bg-teal-700 md:block">
      <div
        className="absolute -top-10 -right-16 h-64 w-64 rounded-[60%_40%_30%_70%/60%_30%_70%_40%] bg-teal-500/60"
        aria-hidden
      />
      <div
        className="absolute bottom-[-4rem] left-[-3rem] h-56 w-56 rounded-[40%_60%_70%_30%/50%_60%_40%_50%] bg-teal-400/50"
        aria-hidden
      />
      <div className="absolute inset-x-6 top-16 rounded-xl bg-white p-4 shadow-lg">
        <div className="mb-3 flex items-center gap-2">
          <div className="h-8 w-8 rounded-md bg-amber-500" />
          <div className="h-2 w-16 rounded bg-teal-100" />
          <div className="h-2 w-20 rounded bg-teal-100" />
        </div>
        <div className="mb-3 flex gap-3 border-b border-gray-100 pb-2 text-[10px] text-gray-400">
          {TABS.map((t, i) => (
            <span key={t} className={i === 0 ? "font-medium text-teal-600" : ""}>
              {t}
            </span>
          ))}
        </div>
        <div className="space-y-2">
          {[0, 1, 2].map((i) => (
            <div key={i} className="flex items-center gap-2">
              <div className="h-6 w-20 rounded bg-gray-100" />
              <div className="h-2 flex-1 rounded bg-teal-50" />
              <div className="h-4 w-10 rounded-full bg-teal-100" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

export function NewProjectModal({ onClose }: { onClose: () => void }) {
  const router = useRouter();
  const addProject = useAppStore((s) => s.addProject);
  const [step, setStep] = useState<1 | 2>(1);
  const [name, setName] = useState("");
  const [address, setAddress] = useState("");
  const [city, setCity] = useState("");

  function finish() {
    const project = addProject({ name: name || "Untitled Project", address, city });
    onClose();
    router.push(`/project/${project.id}`);
  }

  return (
    <Modal onClose={onClose} wide>
      <div className="flex">
        <div className="flex-1 p-8">
          {step === 2 && (
            <button
              onClick={() => setStep(1)}
              className="mb-2 text-gray-400 hover:text-gray-600"
            >
              <ArrowLeft size={18} />
            </button>
          )}
          <h2 className="mb-6 text-2xl font-semibold text-gray-900">Creating Project</h2>

          <div className="mb-8 flex items-center gap-3 text-sm text-gray-400">
            <span className={step === 1 ? "text-gray-700" : ""}>Project Details</span>
            <span className={step === 2 ? "text-gray-700" : ""}>Add Team member</span>
          </div>
          <div className="mb-8 flex items-center gap-2">
            <div
              className={`flex h-8 w-8 items-center justify-center rounded-full border-2 text-sm ${
                step === 1 ? "border-teal-600 text-teal-600" : "border-gray-300 text-gray-400"
              }`}
            >
              1
            </div>
            <div className="h-px flex-1 bg-gray-200" />
            <div
              className={`flex h-8 w-8 items-center justify-center rounded-full border-2 text-sm ${
                step === 2 ? "border-teal-600 text-teal-600" : "border-gray-300 text-gray-400"
              }`}
            >
              2
            </div>
          </div>

          {step === 1 ? (
            <div className="space-y-4">
              <h3 className="text-sm font-medium text-gray-700">Project Details</h3>
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Project Name"
                className="w-full rounded-lg border border-gray-200 bg-gray-50 px-4 py-3 text-sm outline-none focus:border-teal-400"
              />
              <input
                value={address}
                onChange={(e) => setAddress(e.target.value)}
                placeholder="Address"
                className="w-full rounded-lg border border-gray-200 bg-gray-50 px-4 py-3 text-sm outline-none focus:border-teal-400"
              />
              <input
                value={city}
                onChange={(e) => setCity(e.target.value)}
                placeholder="City"
                className="w-full rounded-lg border border-gray-200 bg-gray-50 px-4 py-3 text-sm outline-none focus:border-teal-400"
              />
              <button
                onClick={() => setStep(2)}
                disabled={!name.trim()}
                className="w-full rounded-lg bg-teal-950 py-3 text-sm font-medium text-white hover:bg-teal-900 disabled:opacity-40"
              >
                Continue
              </button>
            </div>
          ) : (
            <div className="space-y-4">
              <p className="text-sm text-gray-600">
                Add Team Members to Share your Project (optional)
              </p>
              <div className="flex items-center gap-2 rounded-lg border border-gray-200 bg-gray-50 px-4 py-3">
                <span className="flex-1 text-sm text-gray-400">Search and Add Person</span>
                <Search size={16} className="text-gray-400" />
              </div>
              <button
                onClick={finish}
                className="w-full rounded-lg bg-teal-950 py-3 text-sm font-medium text-white hover:bg-teal-900"
              >
                Finish
              </button>
            </div>
          )}
        </div>
        <PreviewPanel />
      </div>
    </Modal>
  );
}
