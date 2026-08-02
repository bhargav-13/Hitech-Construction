"use client";

import { TenderShell } from "@/components/tender/TenderShell";
import { TenderPipeline } from "@/components/tender/TenderPipeline";

export default function TenderSortingPage() {
  return (
    <TenderShell>
      <TenderPipeline variant="sorting" />
    </TenderShell>
  );
}
