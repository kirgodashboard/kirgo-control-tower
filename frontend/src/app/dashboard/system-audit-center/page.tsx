import { redirect } from "next/navigation";

// System Audit Center merged into Health & Alerts (KPI Integrity Check)
export default function SystemAuditCenterRedirect() {
  redirect("/dashboard/health");
}
