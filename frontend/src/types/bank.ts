export type BankName = "HDFC" | "ICICI" | "AXIS" | "SBI" | "KOTAK" | "INDUSIND" | "OTHER";

export const BANK_NAMES: BankName[] = ["HDFC", "ICICI", "AXIS", "SBI", "KOTAK", "INDUSIND", "OTHER"];

export const BANK_COLORS: Record<BankName, string> = {
  HDFC:    "#004C8F",
  ICICI:   "#F58220",
  AXIS:    "#800000",
  SBI:     "#22409A",
  KOTAK:   "#ED1C24",
  INDUSIND:"#9B2C6B",
  OTHER:   "#6B7280",
};

export interface BankAccount {
  id:                    number;
  bank_name:             BankName;
  account_name:          string;
  account_number_masked: string | null;
  currency:              string;
  opening_balance_inr:   number;
  is_active:             boolean;
  notes:                 string | null;
  transaction_count:     number;
  latest_date:           string | null;
  closing_balance_inr:   number | null;
  unclassified_count:    number;
}

export interface BankImportProfile {
  id:                 number;
  bank_account_id:    number;
  profile_name:       string;
  date_column:        string;
  description_column: string;
  debit_column:       string | null;
  credit_column:      string | null;
  amount_column:      string | null;
  balance_column:     string | null;
  date_format:        string;
  delimiter:          string;
  skip_rows:          number;
}

export interface BankUpload {
  id:             number;
  file_name:      string;
  uploaded_at:    string;
  status:         "pending" | "processing" | "completed" | "failed";
  row_count:      number;
  imported_rows:  number;
  duplicate_rows: number;
  failed_rows:    number;
  profile_name:   string | null;
}

export interface BankTransaction {
  id:                  number;
  transaction_date:    string;
  narration_raw:       string;
  counterparty:        string | null;
  deposit_inr:         number | null;
  withdrawal_inr:      number | null;
  closing_balance_inr: number | null;
  transaction_type:    string;
  bank_account_id:     number | null;
  bank_name:           string | null;
  account_name:        string | null;
}

export interface BankKpis {
  total_receipts:     number;
  total_payments:     number;
  net_flow:           number;
  unclassified_count: number;
  unclassified_amount:number;
  total_transactions: number;
  classified_count:   number;
  reconciliation_pct: number;
  latest_balance:     number | null;
}

export interface BankCashflowRow {
  day:          string;
  receipts_inr: number;
  payments_inr: number;
  net_inr:      number;
}

export interface BankCategoryRow {
  category_name:     string;
  total_inr:         number;
  transaction_count: number;
  pct_of_total:      number;
}

export interface BankClassificationRule {
  id:            number;
  pattern:       string;
  expense_head:  string;
  category_id:   number | null;
  category_name: string | null;
  priority:      number;
  is_active:     boolean;
}

export interface ColumnMapping {
  date?:      string;
  narration?: string;
  debit?:     string;
  credit?:    string;
  balance?:   string;
}

export interface UploadPreview {
  upload_id:        number;
  headers:          string[];
  preview_rows:     string[][];
  detected_mapping: ColumnMapping;
  total_rows:       number;
}
