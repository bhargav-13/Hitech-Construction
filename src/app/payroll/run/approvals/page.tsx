import { redirect } from "next/navigation";

/** Old address — approvals for a run now live on the Payroll page itself. */
export default function PayrollRunApprovalsPage() {
  redirect("/payroll/run");
}
