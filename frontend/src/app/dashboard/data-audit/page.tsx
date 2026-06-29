import { redirect } from "next/navigation";

// Data Audit merged into Health & Alerts
export default function DataAuditRedirect() {
  redirect("/dashboard/health");
}
