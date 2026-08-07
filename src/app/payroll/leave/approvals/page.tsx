"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

/**
 * The Approval Queue is now a tab on the main Leave page, so this old route just forwards there —
 * kept so existing bookmarks / links don't 404.
 */
export default function LeaveApprovalsRedirect() {
  const router = useRouter();
  useEffect(() => {
    router.replace("/payroll/leave");
  }, [router]);
  return null;
}
