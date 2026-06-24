// Canonical expected values + dashboards under test. Update alongside the
// metric catalog. The DB-vs-UI check compares rendered KPI text to these
// within tolerance (Part A tolerances mirrored on the UI side).

export interface DashboardSpec {
  path: string;
  name: string;
  // Text fragments that must appear (KPI labels) and must NOT (broken states)
  mustContain: string[];
}

export const DASHBOARDS: DashboardSpec[] = [
  { path: "/dashboard/executive",     name: "Executive Overview",    mustContain: ["Revenue"] },
  { path: "/dashboard/customers",     name: "Customer Intelligence", mustContain: ["Repeat"] },
  { path: "/dashboard/operations",    name: "Operations",            mustContain: ["RTO"] },
  { path: "/dashboard/profitability", name: "Profitability",         mustContain: ["Revenue"] },
  { path: "/dashboard/finance",       name: "Cash Flow",             mustContain: ["Cash"] },
  { path: "/dashboard/import-center",     name: "Import Center",      mustContain: ["Import history"] },
  { path: "/dashboard/system-audit-center", name: "System Audit Center", mustContain: ["Tests run", "passed"] },
];

// Strings that indicate a broken render — fail the visual check if present.
export const BROKEN_MARKERS = [
  "Application error",
  "Unhandled Runtime Error",
  "client-side exception",
  "No data available",
];
