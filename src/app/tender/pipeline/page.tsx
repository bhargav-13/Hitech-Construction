"use client";

import { Suspense } from "react";
import { TenderShell } from "@/components/tender/TenderShell";
import { TenderBoard } from "@/components/tender/TenderBoard";

export default function TenderPipelinePage() {
  return (
    <TenderShell>
      {/* useSearchParams (?open=<id>) needs a Suspense boundary above it. */}
      <Suspense fallback={null}>
        <TenderBoard />
      </Suspense>
    </TenderShell>
  );
}
