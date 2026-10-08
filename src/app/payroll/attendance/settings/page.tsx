import { redirect } from "next/navigation";

/** Old address — attendance rules (shift timings, fines, overtime) are set on Setup -> Shifts. */
export default function AttendanceSettingsPage() {
  redirect("/payroll/setup/shifts");
}
