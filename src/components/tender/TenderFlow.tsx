"use client";

import Link from "next/link";
import { FLOW_ORDER } from "@/lib/tenderStateMachine";
import { STAGE_META, type TenderStage } from "@/lib/tenderTypes";
import { Check, ChevronRight, FolderOpen, XCircle } from "lucide-react";

/**
 * Horizontal stepper for the tender lifecycle: Sorting → Research → Applied → Won → Project.
 *
 * "Project" is not a tender stage — it is where the record leaves this module — but showing it
 * makes the whole funnel legible at a glance, which is exactly how the client describes their flow.
 * A LOST tender is shown as a red terminal branch instead.
 */
export function TenderFlow({ stage, projectId }: { stage: TenderStage; projectId?: number | null }) {
  if (stage === "LOST") {
    return (
      <div className="flex items-center gap-2 rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700 ring-1 ring-inset ring-rose-600/20">
        <XCircle size={16} /> Closed / Lost — dropped from the pipeline.
      </div>
    );
  }

  const currentIdx = FLOW_ORDER.indexOf(stage);
  const handedOver = projectId != null;

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {FLOW_ORDER.map((s, i) => {
        const done = i < currentIdx;
        const active = i === currentIdx && !handedOver;
        return (
          <div key={s} className="flex items-center gap-1.5">
            <span
              className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-medium ring-1 ring-inset ${
                active
                  ? STAGE_META[s].chip
                  : done || handedOver
                    ? "bg-emerald-50 text-emerald-700 ring-emerald-600/20"
                    : "bg-gray-50 text-gray-400 ring-gray-200"
              }`}
            >
              {(done || handedOver) && <Check size={12} />}
              {STAGE_META[s].label}
            </span>
            <ChevronRight size={13} className="text-gray-300" />
          </div>
        );
      })}
      {handedOver && projectId! > 0 ? (
        <Link
          href={`/project/${projectId}`}
          className="inline-flex items-center gap-1 rounded-full bg-cyan-50 px-2.5 py-1 text-xs font-medium text-brand-accent ring-1 ring-inset ring-cyan-600/20 hover:bg-cyan-100"
        >
          <FolderOpen size={12} />
          Project #{projectId}
        </Link>
      ) : (
        <span
          className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-medium ring-1 ring-inset ${
            handedOver ? "bg-amber-50 text-amber-700 ring-amber-600/20" : "bg-gray-50 text-gray-400 ring-gray-200"
          }`}
        >
          <FolderOpen size={12} />
          {handedOver ? "Project (pending sync)" : "Project"}
        </span>
      )}
    </div>
  );
}
