"use client";

import { useState, useEffect } from "react";
import { Save, Building2, Upload, CheckCircle2, AlertCircle, Loader2 } from "lucide-react";
import { PageHeader } from "@/components/ui/page-header";
import { useCompanySettings, useSaveCompanySettings } from "@/lib/hooks/use-company";
import { FY_MONTHS, CURRENCIES, TIMEZONES } from "@/types/company";
import type { CompanySettings } from "@/types/company";
import { cn } from "@/lib/utils";

function Label({ children, required }: { children: React.ReactNode; required?: boolean }) {
  return (
    <label className="block text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-1.5">
      {children} {required && <span className="text-red-400">*</span>}
    </label>
  );
}

function Input({
  value, onChange, placeholder, type = "text", className,
}: {
  value: string; onChange: (v: string) => void; placeholder?: string;
  type?: string; className?: string;
}) {
  return (
    <input
      type={type}
      value={value}
      onChange={e => onChange(e.target.value)}
      placeholder={placeholder}
      className={cn(
        "w-full bg-background border border-border rounded-lg px-3 py-2 text-sm",
        "placeholder:text-muted-foreground/50 focus:outline-none focus:ring-1 focus:ring-violet-500/50 focus:border-violet-500/50",
        className,
      )}
    />
  );
}

function Select({
  value, onChange, options,
}: {
  value: string; onChange: (v: string) => void;
  options: { value: string | number; label: string }[];
}) {
  return (
    <select
      value={value}
      onChange={e => onChange(e.target.value)}
      className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-violet-500/50 focus:border-violet-500/50"
    >
      {options.map(o => (
        <option key={o.value} value={o.value}>{o.label}</option>
      ))}
    </select>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-border bg-card p-5 space-y-4">
      <h3 className="text-sm font-semibold text-foreground">{title}</h3>
      {children}
    </div>
  );
}

function Row({ children }: { children: React.ReactNode }) {
  return <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">{children}</div>;
}

const EMPTY: Partial<CompanySettings> = {
  company_name: "", brand_name: "", logo_url: "", gst_number: "", pan_number: "",
  financial_year_start: 4, currency: "INR", timezone: "Asia/Kolkata",
  address_line1: "", address_line2: "", city: "", state: "", pincode: "",
  country: "India", support_email: "",
};

export default function CompanySettingsPage() {
  const { data, isLoading } = useCompanySettings();
  const save = useSaveCompanySettings();
  const [form, setForm] = useState<Partial<CompanySettings>>(EMPTY);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (data) setForm(data);
  }, [data]);

  const set = (key: keyof CompanySettings) => (v: string) =>
    setForm(f => ({ ...f, [key]: v }));

  const setNum = (key: keyof CompanySettings) => (v: string) =>
    setForm(f => ({ ...f, [key]: Number(v) }));

  async function handleSave() {
    await save.mutateAsync(form);
    setSaved(true);
    setTimeout(() => setSaved(false), 3000);
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-48">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="max-w-3xl space-y-6">
      <PageHeader
        title="Company"
        subtitle="Brand identity, tax info, and regional settings"
      />

      {/* Brand Identity */}
      <Section title="Brand Identity">
        <Row>
          <div>
            <Label required>Company Name</Label>
            <Input value={form.company_name ?? ""} onChange={set("company_name")} placeholder="Acme Pvt. Ltd." />
          </div>
          <div>
            <Label>Brand Name</Label>
            <Input value={form.brand_name ?? ""} onChange={set("brand_name")} placeholder="Acme" />
          </div>
        </Row>
        <div>
          <Label>Logo URL</Label>
          <div className="flex gap-2">
            <Input
              value={form.logo_url ?? ""}
              onChange={set("logo_url")}
              placeholder="https://cdn.example.com/logo.svg"
              type="url"
              className="flex-1"
            />
            {form.logo_url && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={form.logo_url} alt="Logo" className="h-9 w-9 rounded-lg object-contain border border-border bg-muted" />
            )}
          </div>
          <p className="mt-1.5 text-[11px] text-muted-foreground">Hosted URL — PNG, SVG, or WebP recommended</p>
        </div>
        <div>
          <Label>Support Email</Label>
          <Input value={form.support_email ?? ""} onChange={set("support_email")} placeholder="hello@yourbrand.com" type="email" />
        </div>
      </Section>

      {/* Tax & Compliance */}
      <Section title="Tax & Compliance">
        <Row>
          <div>
            <Label>GSTIN</Label>
            <Input value={form.gst_number ?? ""} onChange={set("gst_number")} placeholder="29XXXXX1234Z1ZV" />
          </div>
          <div>
            <Label>PAN</Label>
            <Input value={form.pan_number ?? ""} onChange={set("pan_number")} placeholder="XXXXX0000X" />
          </div>
        </Row>
      </Section>

      {/* Regional Settings */}
      <Section title="Regional Settings">
        <Row>
          <div>
            <Label required>Currency</Label>
            <Select
              value={form.currency ?? "INR"}
              onChange={set("currency")}
              options={CURRENCIES.map(c => ({ value: c.code, label: c.name }))}
            />
          </div>
          <div>
            <Label required>Timezone</Label>
            <Select
              value={form.timezone ?? "Asia/Kolkata"}
              onChange={set("timezone")}
              options={TIMEZONES.map(tz => ({ value: tz, label: tz }))}
            />
          </div>
        </Row>
        <div>
          <Label required>Financial Year Start</Label>
          <Select
            value={String(form.financial_year_start ?? 4)}
            onChange={setNum("financial_year_start")}
            options={FY_MONTHS.map(m => ({ value: m.value, label: m.label }))}
          />
          <p className="mt-1.5 text-[11px] text-muted-foreground">
            FY runs from this month to the same month next year (e.g. April → March)
          </p>
        </div>
      </Section>

      {/* Address */}
      <Section title="Address">
        <div>
          <Label>Address Line 1</Label>
          <Input value={form.address_line1 ?? ""} onChange={set("address_line1")} placeholder="Plot 12, Industrial Area" />
        </div>
        <div>
          <Label>Address Line 2</Label>
          <Input value={form.address_line2 ?? ""} onChange={set("address_line2")} placeholder="Phase 2" />
        </div>
        <Row>
          <div>
            <Label>City</Label>
            <Input value={form.city ?? ""} onChange={set("city")} placeholder="Bengaluru" />
          </div>
          <div>
            <Label>State</Label>
            <Input value={form.state ?? ""} onChange={set("state")} placeholder="Karnataka" />
          </div>
        </Row>
        <Row>
          <div>
            <Label>PIN Code</Label>
            <Input value={form.pincode ?? ""} onChange={set("pincode")} placeholder="560001" />
          </div>
          <div>
            <Label>Country</Label>
            <Input value={form.country ?? "India"} onChange={set("country")} placeholder="India" />
          </div>
        </Row>
      </Section>

      {/* Save */}
      <div className="flex items-center gap-3">
        <button
          onClick={handleSave}
          disabled={save.isPending}
          className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-violet-600 hover:bg-violet-500 text-white text-sm font-medium transition-colors disabled:opacity-50"
        >
          {save.isPending ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Save className="h-4 w-4" />
          )}
          Save Changes
        </button>
        {saved && (
          <span className="flex items-center gap-1.5 text-sm text-emerald-400">
            <CheckCircle2 className="h-4 w-4" /> Saved
          </span>
        )}
        {save.isError && (
          <span className="flex items-center gap-1.5 text-sm text-red-400">
            <AlertCircle className="h-4 w-4" /> Save failed
          </span>
        )}
      </div>

      {/* Multi-company notice */}
      <div className="rounded-lg border border-border bg-muted/30 p-4 text-sm text-muted-foreground">
        <span className="font-medium text-foreground">Multi-company ready.</span>{" "}
        This platform supports multiple brands under one account. Contact support to enable multi-company access.
      </div>
    </div>
  );
}
