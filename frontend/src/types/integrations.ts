export type ConnectionStatus = "unconfigured" | "ok" | "error" | "rate_limited";
export type RunStatus        = "running" | "success" | "partial" | "failed";
export type TriggeredBy      = "schedule" | "manual" | "webhook";

export type TrafficLight = "green" | "amber" | "red" | "grey";

export interface IntegrationSummary {
  integration_key:        string;
  display_name:           string;
  description:            string;
  is_enabled:             boolean;
  connection_status:      ConnectionStatus;
  last_tested_at:         string | null;
  secret_configured:      boolean;
  active_job_count:       number;
  // last successful run
  last_success_at:        string | null;
  last_success_inserted:  number;
  last_success_updated:   number;
  // last failed run
  last_failure_at:        string | null;
  last_failure_error:     string | null;
  // lifetime totals
  total_records_inserted: number;
  total_records_updated:  number;
  total_records_failed:   number;
  avg_duration_secs:      number | null;
  // latest run
  latest_run_id:          number | null;
  latest_run_status:      RunStatus | null;
  latest_run_started:     string | null;
  latest_run_entity:      string | null;
  latest_is_running:      boolean;
}

export interface SyncRun {
  id:               number;
  integration_key:  string;
  display_name:     string;
  entity_type:      string;
  triggered_by:     TriggeredBy;
  status:           RunStatus;
  started_at:       string;
  completed_at:     string | null;
  duration_secs:    number | null;
  records_fetched:  number;
  records_inserted: number;
  records_updated:  number;
  records_skipped:  number;
  records_failed:   number;
  error_summary:    string | null;
}

export interface SyncJob {
  id:              number;
  integration_key: string;
  entity_type:     string;
  display_label:   string;
  is_active:       boolean;
  sync_mode:       string;
  cron_schedule:   string | null;
  schedule_label:  string | null;
  watermark_value: string | null;
  edge_fn_name:    string;
}

// Derived traffic-light logic
export function deriveTrafficLight(s: IntegrationSummary): TrafficLight {
  if (!s.is_enabled || s.connection_status === "unconfigured") return "grey";
  if (s.connection_status === "error")                          return "red";
  if (s.latest_is_running)                                      return "amber";
  if (s.last_failure_at && !s.last_success_at)                  return "red";
  if (
    s.last_failure_at &&
    s.last_success_at &&
    s.last_failure_at > s.last_success_at
  )                                                             return "red";
  if (s.total_records_failed > 0)                               return "amber";
  if (s.last_success_at)                                        return "green";
  return "grey";
}

export const INTEGRATION_ICONS: Record<string, string> = {
  woocommerce: "🛒",
  shiprocket:  "📦",
  razorpay:    "💳",
  gokwik:      "⚡",
  bank_feed:   "🏦",
  ccavenue:    "🔐",
  meta_ads:    "📘",
  google_ads:  "🎯",
};

// ── Credential management (settings page) ────────────────────────────────────

export type CredentialFieldType = "text" | "password" | "email" | "url";

export interface CredentialField {
  key:         string;
  label:       string;
  type:        CredentialFieldType;
  placeholder: string;
  required:    boolean;
}

export const CREDENTIAL_SCHEMAS: Record<string, CredentialField[]> = {
  woocommerce: [
    { key: "store_url",       label: "Store URL",       type: "url",      placeholder: "https://shop.example.com", required: true },
    { key: "consumer_key",    label: "Consumer Key",    type: "text",     placeholder: "ck_...",                   required: true },
    { key: "consumer_secret", label: "Consumer Secret", type: "password", placeholder: "cs_...",                   required: true },
  ],
  shiprocket: [
    { key: "email",    label: "API User Email",    type: "email",    placeholder: "e.g. kirgo-api@gmail.com (NOT your main login)", required: true },
    { key: "password", label: "API User Password", type: "password", placeholder: "Password set when creating the API user",          required: true },
  ],
  razorpay: [
    { key: "key_id",     label: "Key ID",     type: "text",     placeholder: "rzp_live_...",     required: true },
    { key: "key_secret", label: "Key Secret", type: "password", placeholder: "••••••••••••••••", required: true },
  ],
  gokwik: [
    { key: "merchant_id", label: "Merchant ID", type: "text",     placeholder: "MID_...",  required: true },
    { key: "api_key",     label: "API Key",     type: "text",     placeholder: "gk_...",   required: true },
    { key: "api_secret",  label: "API Secret",  type: "password", placeholder: "••••••••", required: true },
  ],
  ccavenue: [
    { key: "merchant_id", label: "Merchant ID", type: "text",     placeholder: "1234567",  required: true },
    { key: "access_code", label: "Access Code", type: "text",     placeholder: "AVXXX...", required: true },
    { key: "working_key", label: "Working Key", type: "password", placeholder: "••••••••", required: true },
  ],
  bank_feed: [],
  meta_ads: [
    { key: "ad_account_id", label: "Ad Account ID",  type: "text",     placeholder: "act_12345678", required: true },
    { key: "access_token",  label: "Access Token",   type: "password", placeholder: "EAAxxxxxx…",   required: true },
  ],
  google_ads: [
    { key: "customer_id",       label: "Customer ID",              type: "text",     placeholder: "123-456-7890",                    required: true },
    { key: "developer_token",   label: "Developer Token",          type: "password", placeholder: "••••••••••••",                    required: true },
    { key: "client_id",         label: "OAuth Client ID",          type: "text",     placeholder: "12345.apps.googleusercontent.com", required: true },
    { key: "client_secret",     label: "Client Secret",            type: "password", placeholder: "••••••••••••",                    required: true },
    { key: "refresh_token",     label: "Refresh Token",            type: "password", placeholder: "1//xxxx…",                        required: true },
    { key: "login_customer_id", label: "Manager Account ID (opt)", type: "text",     placeholder: "Leave blank if direct account",   required: false },
  ],
};
