import { redirect } from "next/navigation";

// System Health merged into Health & Alerts
export default function SystemHealthRedirect() {
  redirect("/dashboard/health");
}
