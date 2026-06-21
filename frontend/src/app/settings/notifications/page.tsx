"use client";

import { Bell, Mail, Webhook, Loader2, CheckCircle2 } from "lucide-react";
import { PageHeader } from "@/components/ui/page-header";
import { useNotificationPreferences, useSaveNotificationPreference } from "@/lib/hooks/use-company";
import type { NotificationPreference } from "@/types/company";
import { cn } from "@/lib/utils";

const TYPE_META: Record<string, { label: string; description: string; icon: string }> = {
  sync_failed:           { label: "Sync Failure Alert",        description: "Notified when any data sync fails",                   icon: "🔴" },
  revenue_variance:      { label: "Revenue Variance Alert",    description: "Alert when daily revenue drops > 20% vs last week",   icon: "📉" },
  cod_variance:          { label: "COD Variance Alert",        description: "Alert when COD reconciliation gap exceeds ₹10,000",   icon: "💰" },
  unclassified_expenses: { label: "Unclassified Expenses",     description: "Weekly digest of expenses needing classification",    icon: "🏷️"  },
  low_stock:             { label: "Low Stock Warning",         description: "Alert when any SKU stock falls below reorder level",  icon: "📦" },
  daily_summary:         { label: "Daily P&L Summary",         description: "Morning summary of yesterday's P&L and key metrics", icon: "📊" },
};

function ToggleRow({ pref }: { pref: NotificationPreference }) {
  const save = useSaveNotificationPreference();
  const meta = TYPE_META[pref.notification_type] ?? {
    label: pref.label, description: "", icon: "🔔",
  };

  async function toggle() {
    await save.mutateAsync({
      notification_type: pref.notification_type,
      channel: pref.channel,
      is_enabled: !pref.is_enabled,
      recipients: pref.recipients ?? undefined,
    });
  }

  return (
    <div className={cn(
      "flex items-start justify-between gap-4 py-4 border-b border-border last:border-0",
      "transition-colors",
    )}>
      <div className="flex items-start gap-3 flex-1 min-w-0">
        <span className="text-xl mt-0.5 flex-shrink-0">{meta.icon}</span>
        <div className="min-w-0">
          <p className="text-sm font-medium text-foreground">{meta.label}</p>
          <p className="text-xs text-muted-foreground mt-0.5">{meta.description}</p>
          {pref.recipients && pref.recipients.length > 0 && (
            <div className="flex flex-wrap gap-1 mt-1.5">
              {pref.recipients.map(r => (
                <span key={r} className="px-1.5 py-0.5 rounded-md bg-muted text-[10px] text-muted-foreground font-mono">
                  {r}
                </span>
              ))}
            </div>
          )}
        </div>
      </div>
      <button
        onClick={toggle}
        disabled={save.isPending}
        className={cn(
          "relative inline-flex h-5 w-9 flex-shrink-0 rounded-full border-2 border-transparent transition-colors duration-200",
          "focus:outline-none disabled:opacity-50 mt-0.5",
          pref.is_enabled ? "bg-violet-600" : "bg-muted",
        )}
        role="switch"
        aria-checked={pref.is_enabled}
      >
        <span
          className={cn(
            "pointer-events-none inline-block h-4 w-4 rounded-full bg-white shadow-sm transition-transform duration-200",
            pref.is_enabled ? "translate-x-4" : "translate-x-0",
          )}
        />
      </button>
    </div>
  );
}

export default function NotificationsPage() {
  const { data: prefs, isLoading } = useNotificationPreferences();

  const emailPrefs = prefs?.filter(p => p.channel === "email") ?? [];
  const webhookPrefs = prefs?.filter(p => p.channel === "webhook") ?? [];

  return (
    <div className="max-w-2xl space-y-6">
      <PageHeader
        title="Notifications"
        subtitle="Control when and how you receive platform alerts"
      />

      {isLoading ? (
        <div className="flex items-center justify-center h-48">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : (
        <>
          {/* Email notifications */}
          <div className="rounded-xl border border-border bg-card overflow-hidden">
            <div className="flex items-center gap-2.5 px-5 py-3.5 border-b border-border">
              <Mail className="h-4 w-4 text-violet-400" />
              <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                Email Notifications
              </p>
            </div>
            <div className="px-5">
              {emailPrefs.length === 0 ? (
                <p className="py-6 text-sm text-muted-foreground text-center">No email preferences configured</p>
              ) : (
                emailPrefs.map(p => <ToggleRow key={`${p.notification_type}-${p.channel}`} pref={p} />)
              )}
            </div>
          </div>

          {/* Webhook notifications */}
          {webhookPrefs.length > 0 && (
            <div className="rounded-xl border border-border bg-card overflow-hidden">
              <div className="flex items-center gap-2.5 px-5 py-3.5 border-b border-border">
                <Webhook className="h-4 w-4 text-violet-400" />
                <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                  Webhook Notifications
                </p>
              </div>
              <div className="px-5">
                {webhookPrefs.map(p => <ToggleRow key={`${p.notification_type}-${p.channel}`} pref={p} />)}
              </div>
            </div>
          )}

          {/* Coming soon */}
          <div className="rounded-xl border border-dashed border-border bg-muted/20 p-5">
            <div className="flex items-center gap-2 mb-3">
              <span className="text-sm font-medium text-foreground">Coming Soon</span>
            </div>
            <div className="flex flex-wrap gap-2">
              {["Slack", "WhatsApp", "SMS", "PagerDuty"].map(ch => (
                <span key={ch} className="px-2.5 py-1 rounded-md bg-muted text-xs text-muted-foreground border border-border">
                  {ch}
                </span>
              ))}
            </div>
            <p className="mt-3 text-xs text-muted-foreground">
              Additional notification channels will be available in a future update.
            </p>
          </div>
        </>
      )}
    </div>
  );
}
