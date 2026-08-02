"use client";

import { TenderShell } from "@/components/tender/TenderShell";
import { TenderPipeline } from "@/components/tender/TenderPipeline";

export default function TenderResearchPage() {
  return (
    <TenderShell>
      <TenderPipeline variant="research" />
    </TenderShell>
  );
}
