"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

/** The bulk editor lives under Items; this keeps the Utilities nav entry working. */
export default function BulkItemsRedirect() {
  const router = useRouter();
  useEffect(() => {
    router.replace("/vyapar/items/bulk");
  }, [router]);
  return null;
}
