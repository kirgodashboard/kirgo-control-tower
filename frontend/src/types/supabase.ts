// Auto-generated types stub — run `npx supabase gen types typescript` to regenerate
export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

export interface Database {
  public: {
    Tables: Record<string, unknown>;
    Views: Record<string, unknown>;
    Functions: {
      get_director_snapshot: {
        Args: Record<string, never>;
        Returns: Json;
      };
      get_executive_kpis: {
        Args: { p_start: string; p_end: string };
        Returns: Json;
      };
      get_revenue_trend: {
        Args: { p_start: string; p_end: string; p_grain: string };
        Returns: Array<{
          period: string;
          revenue_inr: number;
          orders_count: number;
          aov_inr: number;
        }>;
      };
      get_period_comparison: {
        Args: {
          p_current_start: string;
          p_current_end: string;
          p_prior_start: string;
          p_prior_end: string;
        };
        Returns: Json;
      };
      get_customer_kpis: {
        Args: { p_start: string; p_end: string };
        Returns: Json;
      };
      get_operations_kpis: {
        Args: { p_start: string; p_end: string };
        Returns: Json;
      };
      get_finance_kpis: {
        Args: { p_start: string; p_end: string };
        Returns: Json;
      };
      get_launch_performance: {
        Args: Record<string, never>;
        Returns: Array<{
          launch_id: string;
          launch_name: string;
          live_date: string;
          revenue_inr: number;
          orders_count: number;
          aov_inr: number;
        }>;
      };
      get_cod_reconciliation: {
        Args: { p_start?: string; p_end?: string };
        Returns: Array<{
          awb_number: string;
          cod_payable_inr: number;
          delivered_at: string;
          days_outstanding: number;
          cod_crf_id: string | null;
          is_reconciled: boolean;
        }>;
      };
    };
    Enums: Record<string, unknown>;
  };
}
