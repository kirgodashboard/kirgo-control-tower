"use client";

import { useState, useRef } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  Building2, Plus, Upload, History, Edit2, ToggleLeft, ToggleRight,
  CheckCircle, XCircle, AlertCircle, Loader2, ChevronDown, ChevronUp,
  ShieldCheck, Trash2, RefreshCw, FileText,
} from "lucide-react";
import { PageHeader } from "@/components/ui/page-header";
import { useBankAccounts, useBankImportHistory, useBankClassificationRules } from "@/lib/hooks/use-bank";
import { formatINR } from "@/lib/utils/format";
import type { BankAccount, BankName, ColumnMapping, UploadPreview, BankUpload } from "@/types/bank";
import { BANK_NAMES } from "@/types/bank";

// ─── Account Form ──────────────────────────────────────────────────────────

interface AccountFormState {
  bank_name:             BankName;
  account_name:          string;
  account_number_masked: string;
  currency:              string;
  opening_balance_inr:   string;
  notes:                 string;
}

const defaultForm = (): AccountFormState => ({
  bank_name:             "HDFC",
  account_name:          "",
  account_number_masked: "",
  currency:              "INR",
  opening_balance_inr:   "0",
  notes:                 "",
});

function AccountFormModal({
  initial,
  onClose,
  onSaved,
}: {
  initial?: Partial<AccountFormState> & { id?: number };
  onClose: () => void;
  onSaved: () => void;
}) {
  const [form, setForm]   = useState<AccountFormState>({ ...defaultForm(), ...initial });
  const [busy, setBusy]   = useState(false);
  const [err,  setErr]    = useState("");

  const set = (k: keyof AccountFormState, v: string) =>
    setForm(f => ({ ...f, [k]: v }));

  const save = async () => {
    if (!form.account_name.trim()) { setErr("Account name is required"); return; }
    setBusy(true); setErr("");
    try {
      const url = initial?.id
        ? `/api/settings/bank-feeds/accounts/${initial.id}`
        : "/api/settings/bank-feeds/accounts";
      const res = await fetch(url, {
        method: initial?.id ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...form,
          opening_balance_inr: parseFloat(form.opening_balance_inr) || 0,
        }),
      });
      if (!res.ok) { const d = await res.json(); throw new Error(d.error); }
      onSaved();
      onClose();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Save failed");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div className="w-full max-w-md rounded-xl border border-border bg-card p-6 shadow-2xl">
        <h2 className="text-base font-semibold text-foreground mb-4">
          {initial?.id ? "Edit Account" : "Add Bank Account"}
        </h2>

        <div className="space-y-3">
          <div>
            <label className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground mb-1 block">Bank</label>
            <select
              value={form.bank_name}
              onChange={e => set("bank_name", e.target.value)}
              className="h-9 w-full px-3 rounded-md border border-border bg-background text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-violet-500"
            >
              {BANK_NAMES.map(b => <option key={b}>{b}</option>)}
            </select>
          </div>

          <div>
            <label className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground mb-1 block">Account Name *</label>
            <input
              type="text"
              value={form.account_name}
              onChange={e => set("account_name", e.target.value)}
              placeholder="e.g. HDFC Current Account"
              className="h-9 w-full px-3 rounded-md border border-border bg-background text-sm text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:ring-1 focus:ring-violet-500"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground mb-1 block">Account No. (masked)</label>
              <input
                type="text"
                value={form.account_number_masked}
                onChange={e => set("account_number_masked", e.target.value)}
                placeholder="XXXX1234"
                className="h-9 w-full px-3 rounded-md border border-border bg-background text-sm text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:ring-1 focus:ring-violet-500"
              />
            </div>
            <div>
              <label className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground mb-1 block">Currency</label>
              <select
                value={form.currency}
                onChange={e => set("currency", e.target.value)}
                className="h-9 w-full px-3 rounded-md border border-border bg-background text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-violet-500"
              >
                <option>INR</option>
                <option>USD</option>
                <option>EUR</option>
              </select>
            </div>
          </div>

          <div>
            <label className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground mb-1 block">Opening Balance (INR)</label>
            <input
              type="number"
              value={form.opening_balance_inr}
              onChange={e => set("opening_balance_inr", e.target.value)}
              className="h-9 w-full px-3 rounded-md border border-border bg-background text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-violet-500"
            />
          </div>

          <div>
            <label className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground mb-1 block">Notes</label>
            <input
              type="text"
              value={form.notes}
              onChange={e => set("notes", e.target.value)}
              placeholder="Optional"
              className="h-9 w-full px-3 rounded-md border border-border bg-background text-sm text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:ring-1 focus:ring-violet-500"
            />
          </div>
        </div>

        {err && <p className="mt-3 text-[12px] text-red-400">{err}</p>}

        <div className="mt-5 flex gap-2 justify-end">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm text-muted-foreground hover:text-foreground transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={save}
            disabled={busy}
            className="flex items-center gap-2 px-4 py-2 rounded-md bg-violet-600 hover:bg-violet-500 disabled:opacity-50 text-white text-sm font-medium transition-colors"
          >
            {busy && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
            {initial?.id ? "Save Changes" : "Add Account"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Import Wizard ─────────────────────────────────────────────────────────

type WizardStep = "upload" | "map" | "preview" | "result";

interface ImportResult { imported: number; duplicates: number; failed: number; total: number; }

function ImportWizard({
  account,
  onDone,
}: {
  account: BankAccount;
  onDone: () => void;
}) {
  const [step,    setStep]    = useState<WizardStep>("upload");
  const [preview, setPreview] = useState<UploadPreview | null>(null);
  const [mapping, setMapping] = useState<ColumnMapping>({});
  const [saveProfile, setSaveProfile]   = useState(false);
  const [profileName, setProfileName]   = useState("");
  const [result,  setResult]  = useState<ImportResult | null>(null);
  const [busy,    setBusy]    = useState(false);
  const [err,     setErr]     = useState("");
  const fileRef = useRef<HTMLInputElement>(null);

  const handleFileSelect = async (file: File) => {
    setBusy(true); setErr("");
    try {
      const fd = new FormData();
      fd.append("file", file);
      fd.append("bank_account_id", String(account.id));
      const res = await fetch("/api/settings/bank-feeds/upload", { method: "POST", body: fd });
      if (!res.ok) { const d = await res.json(); throw new Error(d.error); }
      const data: UploadPreview = await res.json();
      setPreview(data);
      setMapping(data.detected_mapping);
      setStep("map");
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Upload failed");
    } finally {
      setBusy(false);
    }
  };

  const handleImport = async () => {
    if (!preview) return;
    setBusy(true); setErr("");
    try {
      const res = await fetch("/api/settings/bank-feeds/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          upload_id:      preview.upload_id,
          column_mapping: mapping,
          save_profile:   saveProfile,
          profile_name:   profileName,
        }),
      });
      if (!res.ok) { const d = await res.json(); throw new Error(d.error); }
      const data: ImportResult = await res.json();
      setResult(data);
      setStep("result");
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Import failed");
    } finally {
      setBusy(false);
    }
  };

  const MappingSelect = ({ label, field }: { label: string; field: keyof ColumnMapping }) => (
    <div>
      <label className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground mb-1 block">{label}</label>
      <select
        value={mapping[field] ?? ""}
        onChange={e => setMapping(m => ({ ...m, [field]: e.target.value || undefined }))}
        className="h-8 w-full px-2 rounded-md border border-border bg-background text-[13px] text-foreground focus:outline-none focus:ring-1 focus:ring-violet-500"
      >
        <option value="">— not mapped —</option>
        {(preview?.headers ?? []).map(h => <option key={h} value={h}>{h}</option>)}
      </select>
    </div>
  );

  return (
    <div className="border-t border-border bg-muted/30 px-5 py-4">
      {/* Step: upload */}
      {step === "upload" && (
        <div>
          <div
            onClick={() => fileRef.current?.click()}
            className="flex flex-col items-center justify-center gap-2 border-2 border-dashed border-border rounded-lg py-8 cursor-pointer hover:border-violet-500/50 hover:bg-violet-500/5 transition-colors"
          >
            {busy
              ? <Loader2 className="h-6 w-6 text-violet-400 animate-spin" />
              : <Upload className="h-6 w-6 text-muted-foreground" />}
            <p className="text-sm text-muted-foreground">
              {busy ? "Parsing file…" : "Drop or click to upload CSV / XLSX"}
            </p>
            <p className="text-[11px] text-muted-foreground/60">HDFC · ICICI · Axis · SBI · Kotak · IndusInd</p>
          </div>
          <input
            ref={fileRef}
            type="file"
            accept=".csv,.xlsx,.xls"
            className="hidden"
            onChange={e => {
              const f = e.target.files?.[0];
              if (f) handleFileSelect(f);
              e.target.value = "";
            }}
          />
          {err && <p className="mt-2 text-[12px] text-red-400">{err}</p>}
        </div>
      )}

      {/* Step: map columns */}
      {step === "map" && preview && (
        <div className="space-y-3">
          <p className="text-[12px] text-muted-foreground">
            <span className="font-semibold text-foreground">{preview.total_rows}</span> rows detected in{" "}
            <span className="font-mono text-violet-400">{preview.headers.length}</span> columns. Verify mapping below.
          </p>

          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            <MappingSelect label="Date *"       field="date" />
            <MappingSelect label="Narration *"  field="narration" />
            <MappingSelect label="Debit (Dr)"   field="debit" />
            <MappingSelect label="Credit (Cr)"  field="credit" />
            <MappingSelect label="Balance"      field="balance" />
          </div>

          {/* Preview table */}
          <div className="overflow-x-auto rounded-lg border border-border">
            <table className="w-full text-[11px]">
              <thead>
                <tr className="border-b border-border bg-muted/50">
                  {preview.headers.map(h => (
                    <th key={h} className="px-2 py-1.5 text-left text-muted-foreground font-medium whitespace-nowrap">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {preview.preview_rows.map((row, i) => (
                  <tr key={i} className="border-b border-border/50 last:border-0">
                    {row.map((cell, j) => (
                      <td key={j} className="px-2 py-1 text-foreground/80 whitespace-nowrap max-w-[140px] truncate">{cell}</td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="flex items-center gap-3 pt-1">
            <label className="flex items-center gap-1.5 cursor-pointer text-[12px] text-muted-foreground">
              <input
                type="checkbox"
                checked={saveProfile}
                onChange={e => setSaveProfile(e.target.checked)}
                className="rounded border-border"
              />
              Save as profile
            </label>
            {saveProfile && (
              <input
                type="text"
                value={profileName}
                onChange={e => setProfileName(e.target.value)}
                placeholder="Profile name"
                className="h-7 px-2 rounded-md border border-border bg-background text-[12px] text-foreground focus:outline-none focus:ring-1 focus:ring-violet-500 w-40"
              />
            )}
          </div>

          {err && <p className="text-[12px] text-red-400">{err}</p>}

          <div className="flex gap-2">
            <button
              onClick={() => { setStep("upload"); setPreview(null); setErr(""); }}
              className="px-3 py-1.5 text-[12px] text-muted-foreground hover:text-foreground transition-colors"
            >
              ← Back
            </button>
            <button
              onClick={handleImport}
              disabled={busy || !mapping.date || !mapping.narration}
              className="flex items-center gap-1.5 px-4 py-1.5 rounded-md bg-violet-600 hover:bg-violet-500 disabled:opacity-50 text-white text-[12px] font-medium transition-colors"
            >
              {busy && <Loader2 className="h-3 w-3 animate-spin" />}
              Import {preview.total_rows} Rows
            </button>
          </div>
        </div>
      )}

      {/* Step: result */}
      {step === "result" && result && (
        <div className="space-y-3">
          <div className="grid grid-cols-3 gap-3">
            <div className="rounded-lg bg-emerald-500/10 border border-emerald-500/20 p-3 text-center">
              <p className="text-2xl font-bold text-emerald-400">{result.imported}</p>
              <p className="text-[11px] text-emerald-400/80 mt-0.5">Imported</p>
            </div>
            <div className="rounded-lg bg-amber-500/10 border border-amber-500/20 p-3 text-center">
              <p className="text-2xl font-bold text-amber-400">{result.duplicates}</p>
              <p className="text-[11px] text-amber-400/80 mt-0.5">Duplicates</p>
            </div>
            <div className="rounded-lg bg-red-500/10 border border-red-500/20 p-3 text-center">
              <p className="text-2xl font-bold text-red-400">{result.failed}</p>
              <p className="text-[11px] text-red-400/80 mt-0.5">Failed</p>
            </div>
          </div>
          <p className="text-[12px] text-muted-foreground">
            Processed {result.total} rows. New transactions are now visible on the Bank dashboard.
          </p>
          <div className="flex gap-2">
            <button
              onClick={() => { setStep("upload"); setPreview(null); setResult(null); setErr(""); }}
              className="px-3 py-1.5 text-[12px] rounded-md border border-border text-muted-foreground hover:text-foreground transition-colors"
            >
              Import Another
            </button>
            <button
              onClick={onDone}
              className="px-3 py-1.5 text-[12px] rounded-md bg-violet-600 hover:bg-violet-500 text-white font-medium transition-colors"
            >
              Done
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Import History ────────────────────────────────────────────────────────

function ImportHistory({ accountId }: { accountId: number }) {
  const { data: history, isLoading } = useBankImportHistory(accountId);

  if (isLoading) return <p className="px-5 py-3 text-[12px] text-muted-foreground">Loading…</p>;
  if (!history?.length) return <p className="px-5 py-3 text-[12px] text-muted-foreground">No imports yet.</p>;

  const statusBadge = (status: BankUpload["status"]) => {
    const map: Record<string, string> = {
      completed: "bg-emerald-500/10 text-emerald-400 border-emerald-500/20",
      failed:    "bg-red-500/10 text-red-400 border-red-500/20",
      pending:   "bg-muted text-muted-foreground border-border",
      processing:"bg-amber-500/10 text-amber-400 border-amber-500/20",
    };
    return (
      <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium border ${map[status] ?? map.pending}`}>
        {status}
      </span>
    );
  };

  return (
    <div className="border-t border-border">
      <table className="w-full text-[12px]">
        <thead>
          <tr className="border-b border-border bg-muted/30">
            <th className="px-5 py-2 text-left text-muted-foreground font-medium">File</th>
            <th className="px-3 py-2 text-left text-muted-foreground font-medium">Date</th>
            <th className="px-3 py-2 text-right text-muted-foreground font-medium">Imported</th>
            <th className="px-3 py-2 text-right text-muted-foreground font-medium">Dupes</th>
            <th className="px-3 py-2 text-left text-muted-foreground font-medium">Status</th>
          </tr>
        </thead>
        <tbody>
          {history.map(u => (
            <tr key={u.id} className="border-b border-border/50 last:border-0">
              <td className="px-5 py-2 text-foreground/80 max-w-[160px] truncate">{u.file_name}</td>
              <td className="px-3 py-2 text-muted-foreground whitespace-nowrap">
                {new Date(u.uploaded_at).toLocaleDateString("en-IN", { day:"2-digit", month:"short" })}
              </td>
              <td className="px-3 py-2 text-right tabular-nums text-emerald-400">{u.imported_rows}</td>
              <td className="px-3 py-2 text-right tabular-nums text-amber-400">{u.duplicate_rows}</td>
              <td className="px-3 py-2">{statusBadge(u.status)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ─── Account Card ──────────────────────────────────────────────────────────

function AccountCard({ account, onEdit, onRefresh }: {
  account: BankAccount;
  onEdit: () => void;
  onRefresh: () => void;
}) {
  const [showImport,  setShowImport]  = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [toggling,    setToggling]    = useState(false);

  const toggle = async () => {
    setToggling(true);
    await fetch(`/api/settings/bank-feeds/accounts/${account.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ is_active: !account.is_active }),
    });
    setToggling(false);
    onRefresh();
  };

  const bankColor: Record<string, string> = {
    HDFC:"text-blue-400", ICICI:"text-orange-400", AXIS:"text-red-400",
    SBI:"text-blue-500", KOTAK:"text-red-400", INDUSIND:"text-purple-400", OTHER:"text-muted-foreground",
  };

  return (
    <div className={`rounded-xl border border-border bg-card overflow-hidden ${!account.is_active ? "opacity-60" : ""}`}>
      {/* Header row */}
      <div className="flex items-center gap-4 px-5 py-4">
        <div className="h-10 w-10 rounded-full bg-muted flex items-center justify-center flex-shrink-0">
          <Building2 className={`h-5 w-5 ${bankColor[account.bank_name] ?? "text-muted-foreground"}`} />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <p className="text-[14px] font-semibold text-foreground">{account.account_name}</p>
            <span className="text-[10px] font-bold text-muted-foreground bg-muted px-1.5 py-0.5 rounded">
              {account.bank_name}
            </span>
          </div>
          <p className="text-[12px] text-muted-foreground">
            {account.account_number_masked ?? "•••• ••••"} · {account.currency}
            {account.latest_date && (
              <> · Last txn {new Date(account.latest_date).toLocaleDateString("en-IN", { day:"2-digit", month:"short" })}</>
            )}
          </p>
        </div>

        {/* Stats */}
        <div className="hidden sm:flex items-center gap-5 text-center">
          <div>
            <p className="text-[13px] font-bold tabular-nums text-foreground">
              {account.closing_balance_inr != null ? formatINR(account.closing_balance_inr) : "—"}
            </p>
            <p className="text-[10px] text-muted-foreground">Balance</p>
          </div>
          <div>
            <p className="text-[13px] font-bold tabular-nums text-foreground">{account.transaction_count}</p>
            <p className="text-[10px] text-muted-foreground">Transactions</p>
          </div>
          {account.unclassified_count > 0 && (
            <div>
              <p className="text-[13px] font-bold tabular-nums text-amber-400">{account.unclassified_count}</p>
              <p className="text-[10px] text-amber-400/80">Unclassified</p>
            </div>
          )}
        </div>

        {/* Actions */}
        <div className="flex items-center gap-1.5 flex-shrink-0">
          <button
            onClick={toggle}
            disabled={toggling}
            title={account.is_active ? "Disable" : "Enable"}
            className="h-7 w-7 flex items-center justify-center rounded-md hover:bg-accent transition-colors"
          >
            {toggling
              ? <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
              : account.is_active
                ? <ToggleRight className="h-4 w-4 text-emerald-400" />
                : <ToggleLeft  className="h-4 w-4 text-muted-foreground" />}
          </button>
          <button
            onClick={onEdit}
            title="Edit"
            className="h-7 w-7 flex items-center justify-center rounded-md hover:bg-accent transition-colors"
          >
            <Edit2 className="h-3.5 w-3.5 text-muted-foreground" />
          </button>
          <button
            onClick={() => { setShowImport(v => !v); setShowHistory(false); }}
            className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-[12px] font-medium transition-colors ${
              showImport ? "bg-violet-600 text-white" : "border border-border text-muted-foreground hover:text-foreground hover:border-violet-500/50"
            }`}
          >
            <Upload className="h-3.5 w-3.5" />
            Import
          </button>
          <button
            onClick={() => { setShowHistory(v => !v); setShowImport(false); }}
            className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-[12px] font-medium transition-colors ${
              showHistory ? "bg-muted text-foreground" : "border border-border text-muted-foreground hover:text-foreground"
            }`}
          >
            <History className="h-3.5 w-3.5" />
            History
            {showHistory ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
          </button>
        </div>
      </div>

      {showImport && (
        <ImportWizard
          account={account}
          onDone={() => { setShowImport(false); onRefresh(); }}
        />
      )}

      {showHistory && (
        <ImportHistory accountId={account.id} />
      )}
    </div>
  );
}

// ─── Classification Rules ──────────────────────────────────────────────────

function ClassificationRulesPanel() {
  const [open, setOpen] = useState(false);
  const { data: rules, isLoading } = useBankClassificationRules();
  const qc = useQueryClient();
  const [deleting, setDeleting] = useState<number | null>(null);

  const deleteRule = async (id: number) => {
    setDeleting(id);
    await fetch(`/api/settings/bank-feeds/rules?id=${id}`, { method: "DELETE" });
    qc.invalidateQueries({ queryKey: ["bank-classification-rules"] });
    setDeleting(null);
  };

  const activeRules = rules?.filter(r => r.is_active) ?? [];

  return (
    <div className="rounded-xl border border-border bg-card overflow-hidden">
      <button
        onClick={() => setOpen(v => !v)}
        className="w-full flex items-center justify-between px-5 py-3.5 hover:bg-accent/30 transition-colors"
      >
        <div className="flex items-center gap-2.5">
          <FileText className="h-4 w-4 text-violet-400" />
          <span className="text-[13px] font-semibold text-foreground">Auto-Classification Rules</span>
          <span className="text-[11px] text-muted-foreground bg-muted px-2 py-0.5 rounded-full">{activeRules.length}</span>
        </div>
        {open ? <ChevronUp className="h-4 w-4 text-muted-foreground" /> : <ChevronDown className="h-4 w-4 text-muted-foreground" />}
      </button>

      {open && (
        <div className="border-t border-border">
          {isLoading ? (
            <p className="px-5 py-3 text-[12px] text-muted-foreground">Loading…</p>
          ) : (
            <table className="w-full text-[12px]">
              <thead>
                <tr className="border-b border-border bg-muted/30">
                  <th className="px-5 py-2 text-left text-muted-foreground font-medium">Pattern (ILIKE)</th>
                  <th className="px-3 py-2 text-left text-muted-foreground font-medium">Expense Head</th>
                  <th className="px-3 py-2 text-right text-muted-foreground font-medium">Priority</th>
                  <th className="px-3 py-2 text-left text-muted-foreground font-medium">Category</th>
                  <th className="px-3 py-2"></th>
                </tr>
              </thead>
              <tbody>
                {activeRules.map(r => (
                  <tr key={r.id} className="border-b border-border/50 last:border-0">
                    <td className="px-5 py-2 font-mono text-violet-400">{r.pattern}</td>
                    <td className="px-3 py-2 text-foreground/80">{r.expense_head}</td>
                    <td className="px-3 py-2 text-right tabular-nums text-muted-foreground">{r.priority}</td>
                    <td className="px-3 py-2 text-muted-foreground">{r.category_name ?? "—"}</td>
                    <td className="px-3 py-2">
                      <button
                        onClick={() => deleteRule(r.id)}
                        disabled={deleting === r.id}
                        className="h-5 w-5 flex items-center justify-center rounded hover:bg-red-500/10 transition-colors"
                      >
                        {deleting === r.id
                          ? <Loader2 className="h-3 w-3 animate-spin text-muted-foreground" />
                          : <Trash2 className="h-3 w-3 text-muted-foreground hover:text-red-400" />}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Page ──────────────────────────────────────────────────────────────────

export default function BankFeedsSettingsPage() {
  const { data: accounts, isLoading, refetch } = useBankAccounts();
  const qc = useQueryClient();
  const [showAdd, setShowAdd] = useState(false);
  const [editAccount, setEditAccount] = useState<BankAccount | null>(null);
  const [autoClassBusy, setAutoClassBusy] = useState(false);
  const [autoClassResult, setAutoClassResult] = useState<string>("");

  const refresh = () => {
    refetch();
    qc.invalidateQueries({ queryKey: ["bank-accounts"] });
    qc.invalidateQueries({ queryKey: ["bank-import-history"] });
  };

  const runAutoClassify = async () => {
    setAutoClassBusy(true); setAutoClassResult("");
    try {
      const res = await fetch("/api/settings/bank-feeds/classify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      const d = await res.json();
      setAutoClassResult(`Auto-classified ${d.classified} transactions (${d.skipped} unmatched)`);
      refresh();
    } catch {
      setAutoClassResult("Auto-classify failed");
    } finally {
      setAutoClassBusy(false);
    }
  };

  return (
    <div className="flex flex-col gap-6 p-4 sm:p-6">
      <PageHeader
        title="Bank Feeds"
        subtitle="Manage bank accounts, import statements, and classification rules"
      >
        <div className="flex items-center gap-2">
          <button
            onClick={runAutoClassify}
            disabled={autoClassBusy}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-md border border-border text-sm text-muted-foreground hover:text-foreground hover:border-violet-500/40 transition-colors"
          >
            {autoClassBusy
              ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
              : <RefreshCw className="h-3.5 w-3.5" />}
            Auto-Classify
          </button>
          <button
            onClick={() => setShowAdd(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-violet-600 hover:bg-violet-500 text-white text-sm font-medium transition-colors"
          >
            <Plus className="h-3.5 w-3.5" />
            Add Account
          </button>
        </div>
      </PageHeader>

      {autoClassResult && (
        <div className="flex items-center gap-2 px-4 py-2.5 rounded-lg bg-emerald-500/10 border border-emerald-500/20 text-[13px] text-emerald-400">
          <CheckCircle className="h-4 w-4 flex-shrink-0" />
          {autoClassResult}
        </div>
      )}

      {/* Security banner */}
      <div className="flex items-start gap-3 rounded-lg border border-emerald-500/20 bg-emerald-500/5 px-4 py-3">
        <ShieldCheck className="h-4 w-4 text-emerald-400 mt-0.5 flex-shrink-0" />
        <p className="text-[12px] text-emerald-400/90 leading-relaxed">
          Bank account data is stored securely. Account numbers are masked — only the last 4 digits are retained.
          Statement files are parsed server-side and raw data is discarded after import.
        </p>
      </div>

      {/* Account list */}
      {isLoading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : !accounts?.length ? (
        <div className="flex flex-col items-center justify-center gap-3 py-16 text-center">
          <Building2 className="h-10 w-10 text-muted-foreground/40" />
          <p className="text-sm text-muted-foreground">No bank accounts yet.</p>
          <button
            onClick={() => setShowAdd(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-violet-600 hover:bg-violet-500 text-white text-sm font-medium transition-colors"
          >
            <Plus className="h-3.5 w-3.5" />
            Add First Account
          </button>
        </div>
      ) : (
        <div className="space-y-3">
          {accounts.map(acc => (
            <AccountCard
              key={acc.id}
              account={acc}
              onEdit={() => setEditAccount(acc)}
              onRefresh={refresh}
            />
          ))}
        </div>
      )}

      {/* Classification rules */}
      <ClassificationRulesPanel />

      {/* Modals */}
      {showAdd && (
        <AccountFormModal
          onClose={() => setShowAdd(false)}
          onSaved={refresh}
        />
      )}
      {editAccount && (
        <AccountFormModal
          initial={{
            id:                    editAccount.id,
            bank_name:             editAccount.bank_name,
            account_name:          editAccount.account_name,
            account_number_masked: editAccount.account_number_masked ?? "",
            currency:              editAccount.currency,
            opening_balance_inr:   String(editAccount.opening_balance_inr),
            notes:                 editAccount.notes ?? "",
          }}
          onClose={() => setEditAccount(null)}
          onSaved={refresh}
        />
      )}
    </div>
  );
}
