import { DashboardShell } from "@/components/layout/dashboard-shell";

export default function ReviewLayout({ children }: { children: React.ReactNode }) {
  return <DashboardShell>{children}</DashboardShell>;
}
