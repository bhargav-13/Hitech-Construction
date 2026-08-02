"use client";

import { TenderShell } from "@/components/tender/TenderShell";
import { TenderPipeline } from "@/components/tender/TenderPipeline";

export default function TenderAppliedPage() {
  return (
    <TenderShell>
      <TenderPipeline variant="applied" />
    </TenderShell>
  );
}
