"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Drawer, DrawerField } from "./Drawer";
import { useAppStore } from "@/lib/store";

/**
 * New Project — a right-side drawer capturing just the essentials. After creation we land
 * on the project and auto-open the full Project Setting drawer (where team members, stage,
 * value, location structure etc. are configured), so there's no separate "add person" step.
 */
export function NewProjectModal({ onClose }: { onClose: () => void }) {
  const router = useRouter();
  const addProject = useAppStore((s) => s.addProject);
  const [name, setName] = useState("");
  const [address, setAddress] = useState("");
  const [city, setCity] = useState("");
  const [error, setError] = useState("");

  function create() {
    if (!name.trim()) {
      setError("Project name is required.");
      return;
    }
    const project = addProject({ name: name.trim(), address: address.trim(), city: city.trim() });
    onClose();
    // Land on the new project and open the full Project Setting drawer for detailed config.
    router.push(`/project/${project.id}?setup=1`);
  }

  return (
    <Drawer title="New Project" onClose={onClose} onSave={create} saveLabel="Create Project">
      <p className="mb-5 text-sm text-gray-500">
        Start with the basics — you can add the team, stage, value and location structure in the next
        step.
      </p>

      <div className="space-y-4">
        <DrawerField label="Project Name" required>
          <input
            value={name}
            onChange={(e) => {
              setName(e.target.value);
              setError("");
            }}
            onKeyDown={(e) => e.key === "Enter" && create()}
            placeholder="e.g. Ward 12 CC Road"
            className="input"
            autoFocus
          />
        </DrawerField>

        <DrawerField label="Address">
          <input
            value={address}
            onChange={(e) => setAddress(e.target.value)}
            placeholder="Site address"
            className="input"
          />
        </DrawerField>

        <DrawerField label="City">
          <input value={city} onChange={(e) => setCity(e.target.value)} placeholder="City" className="input" />
        </DrawerField>

        {error && <div className="text-xs font-medium text-rose-600">{error}</div>}
      </div>
    </Drawer>
  );
}
