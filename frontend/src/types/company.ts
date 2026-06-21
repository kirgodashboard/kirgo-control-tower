export interface CompanySettings {
  id: number;
  company_id: number;
  company_name: string;
  brand_name: string | null;
  logo_url: string | null;
  gst_number: string | null;
  pan_number: string | null;
  financial_year_start: number;
  currency: string;
  timezone: string;
  address_line1: string | null;
  address_line2: string | null;
  city: string | null;
  state: string | null;
  pincode: string | null;
  country: string;
  support_email: string | null;
  created_at: string;
  updated_at: string;
}

export type RoleType = "super_admin" | "admin" | "finance" | "operations" | "viewer";

export interface UserRole {
  id: number;
  company_id: number;
  email: string;
  full_name: string | null;
  role: RoleType;
  is_active: boolean;
  invited_by: string | null;
  invited_at: string | null;
  last_seen_at: string | null;
  created_at: string;
  updated_at: string;
}

export const ROLE_LABELS: Record<RoleType, string> = {
  super_admin: "Super Admin",
  admin:       "Admin",
  finance:     "Finance",
  operations:  "Operations",
  viewer:      "Viewer",
};

export const ROLE_COLORS: Record<RoleType, string> = {
  super_admin: "text-violet-400 bg-violet-500/10 border-violet-500/20",
  admin:       "text-blue-400 bg-blue-500/10 border-blue-500/20",
  finance:     "text-emerald-400 bg-emerald-500/10 border-emerald-500/20",
  operations:  "text-amber-400 bg-amber-500/10 border-amber-500/20",
  viewer:      "text-muted-foreground bg-muted/50 border-border",
};

export const ROLE_PERMISSIONS: Record<RoleType, string[]> = {
  super_admin: ["All access", "User management", "Integration credentials", "Data export", "Billing & plan"],
  admin:       ["All dashboards", "Integration config", "Data export", "Manage viewers/editors"],
  finance:     ["Financial dashboards", "Expense classification", "P&L reports", "Data export"],
  operations:  ["Operations dashboard", "Order classification", "Inventory", "Shipments"],
  viewer:      ["Read-only access to all dashboards"],
};

export interface NotificationPreference {
  id: number;
  company_id: number;
  notification_type: string;
  label: string;
  channel: string;
  is_enabled: boolean;
  threshold_value: number | null;
  recipients: string[] | null;
  webhook_url: string | null;
}

export interface SystemInfo {
  app_version: string;
  db_version: string;
  table_count: number;
  active_jobs: number;
  running_jobs: number;
  db_size: string;
  server_time: string;
}

export interface SettingsDataQuality {
  unclassified_bank_tx: number;
  unclassified_expenses: number;
  failed_syncs_7d: number;
  products_missing_cost: number;
  orders_without_shipment: number;
}

export const FY_MONTHS = [
  { value: 1, label: "January" },
  { value: 2, label: "February" },
  { value: 3, label: "March" },
  { value: 4, label: "April" },
  { value: 5, label: "May" },
  { value: 6, label: "June" },
  { value: 7, label: "July" },
  { value: 8, label: "August" },
  { value: 9, label: "September" },
  { value: 10, label: "October" },
  { value: 11, label: "November" },
  { value: 12, label: "December" },
];

export const CURRENCIES = [
  { code: "INR", name: "Indian Rupee (₹)" },
  { code: "USD", name: "US Dollar ($)" },
  { code: "EUR", name: "Euro (€)" },
  { code: "GBP", name: "British Pound (£)" },
  { code: "AED", name: "UAE Dirham (د.إ)" },
];

export const TIMEZONES = [
  "Asia/Kolkata",
  "Asia/Dubai",
  "Asia/Singapore",
  "Asia/Tokyo",
  "Europe/London",
  "Europe/Paris",
  "America/New_York",
  "America/Los_Angeles",
  "UTC",
];
