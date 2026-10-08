import { redirect } from "next/navigation";

/** Old address — the muster is the Muster view of the Attendance page. */
export default function MusterPage() {
  redirect("/payroll/attendance");
}
