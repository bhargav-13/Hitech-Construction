import * as api from "./api";
import { useTenderStore } from "./tenderStore";
import type { Tender } from "./tenderTypes";
import { type HandoffOptions } from "./projectBoqStore";
import { handoffToServer } from "./projectBoqHandoff";
import { findAnalysis, useAnalysisStore } from "./tenderAnalysisStore";

/**
 * Convert the tender's analysis into the project's BOQ and targets. Returns a fragment for the
 * flash message, so the user is told what actually landed rather than just "project created".
 */
async function buildBoq(t: Tender, projectId: number, handoff: HandoffOptions | null): Promise<string> {
  // Say what happened either way. Silently creating an empty project when the user ticked
  // "create the BOQ" is the failure they cannot diagnose from the outside.
  if (!handoff) return " — no BOQ, because this tender has no health analysis";
  const analysis = findAnalysis(useAnalysisStore.getState().analyses, t);
  if (!analysis) return " — but its health analysis could not be found, so the BOQ was not created";
  if (analysis.boqLines.length === 0) return " — its health analysis has no items yet, so the BOQ is empty";
  try {
    const boq = await handoffToServer(projectId, analysis, handoff);
    const targets = boq.targets.length;
    return ` with ${boq.items.length} BOQ items${
      targets > 0 ? ` and ${targets} targets` : " (no targets — add them on the project's Target tab)"
    }`;
  } catch (e) {
    // The project landed and the BOQ did not. Naming that is the whole point: a silent failure
    // here looks identical to a tender with no analysis, and the conversion is the reason anyone
    // ran the handover.
    return ` — but its BOQ did not save (${
      e instanceof Error ? e.message : "the project module refused it"
    }), so convert it again from the tender`;
  }
}

/**
 * Hand a won tender over to the **Project module** — this module does not keep its own project
 * list. `createProject` only accepts name/address/city, so the commercial detail the client
 * actually tracks (contract value, work order date, completion date, customer) goes across in a
 * follow-up update. If that second call fails the handoff is marked unsynced rather than lost.
 *
 * Shared by the list screens and the pipeline board. Returns the message to show and, when the
 * project reached the server, its id.
 */
export async function handoffTenderToProject(
  t: Tender,
  handoff: HandoffOptions | null,
): Promise<{ message: string; projectId: number | null }> {
  const { handoffPayloadFor, linkProject } = useTenderStore.getState();
  const payload = handoffPayloadFor(t.id);
  try {
    const res = await api.createProject({
      name: t.nameOfWork || `Tender ${t.tenderId}`,
      address: t.officeAddress ?? undefined,
      city: t.location ?? undefined,
    });
    let synced = false;
    try {
      await api.updateProject(res.id, {
        customerName: t.department ?? null,
        projectValue: payload?.contractValue ?? 0,
        startDate: payload?.workOrderDate ?? null,
        endDate: payload?.completionDate ?? null,
        scopeOfWork: t.nameOfWork ?? null,
        status: "ONGOING",
      });
      synced = true;
    } catch {
      // The project exists; only the commercial fields did not land. Keep it flagged.
    }
    linkProject(t.id, res.id, { synced });
    const built = await buildBoq(t, res.id, handoff);
    return {
      projectId: res.id,
      message: synced
        ? `Project #${res.id} created${built}.`
        : `Project #${res.id} created${built}, but its contract details did not save — open it to finish.`,
    };
  } catch {
    // No project backend reachable — keep the handoff locally so the conversion is not lost, and
    // say so plainly rather than reporting a success that did not happen. No BOQ is attempted: the
    // project never reached the server, so there is nothing for a BOQ to hang off.
    const localId = -Math.floor(Date.now() / 1000);
    linkProject(t.id, localId, { synced: false });
    return {
      projectId: null,
      message: "Project module unreachable — the handoff is saved locally and can be pushed later. Its BOQ has not been created.",
    };
  }
}
