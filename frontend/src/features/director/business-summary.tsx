"use client";

import { cn } from "@/lib/utils";
import { useDirectorSnapshot } from "@/lib/hooks/use-director-snapshot";
import { formatINR } from "@/lib/utils/format";
import type { DirectorSnapshot } from "@/types/kpi";

type Level = "green" | "amber" | "red";
type Insight = { text: string; level: Level };

function deriveInsights(snap: DirectorSnapshot): Insight[] {
  const out: Insight[] = [];

  // Revenue trend
  const rev = snap.revenue_mtd_change_pct;
  if (rev > 10) {
    out.push({ text: `Revenue up ${rev.toFixed(1)}% vs last month — strong growth momentum`, level: "green" });
  } else if (rev >= 0) {
    out.push({ text: `Revenue +${rev.toFixed(1)}% vs last month — steady, room to accelerate`, level: "amber" });
  } else {
    out.push({ text: `Revenue down ${Math.abs(rev).toFixed(1)}% vs last month — investigate demand signals`, level: "red" });
  }

  // Return rate
  const rr = snap.return_rate_pct;
  if (rr < 8) {
    out.push({ text: `Return rate ${rr.toFixed(1)}% — healthy and well-controlled`, level: "green" });
  } else if (rr < 12) {
    out.push({ text: `Return rate ${rr.toFixed(1)}% — approaching threshold, monitor closely`, level: "amber" });
  } else {
    out.push({ text: `Return rate ${rr.toFixed(1)}% — above limit, review product quality and sizing`, level: "red" });
  }

  // COD outstanding
  const cod = snap.cod_outstanding_inr;
  const codCount = snap.cod_outstanding_count;
  if (cod > 1_00_000) {
    out.push({ text: `COD outstanding ${formatINR(cod)} across ${codCount} shipments — reconciliation overdue`, level: "red" });
  } else if (cod > 40_000) {
    out.push({ text: `COD outstanding ${formatINR(cod)} — ${codCount} shipments awaiting reconciliation`, level: "amber" });
  } else {
    out.push({ text: `COD position clean — ${formatINR(cod)} outstanding, well-reconciled`, level: "green" });
  }

  // Delivery success
  const del = snap.delivery_success_pct;
  if (del >= 87) {
    out.push({ text: `Delivery success ${del.toFixed(1)}% — logistics performing well`, level: "green" });
  } else if (del >= 75) {
    out.push({ text: `Delivery success ${del.toFixed(1)}% — acceptable but below benchmark`, level: "amber" });
  } else {
    out.push({ text: `Delivery success ${del.toFixed(1)}% — critical, investigate courier performance`, level: "red" });
  }

  // Cash position
  const cash = snap.cash_position_inr;
  if (cash > 2_00_000) {
    out.push({ text: `Cash position ${formatINR(cash)} — comfortable operating buffer`, level: "green" });
  } else if (cash > 50_000) {
    out.push({ text: `Cash position ${formatINR(cash)} — adequate, watch closely`, level: "amber" });
  } else {
    out.push({ text: `Cash position ${formatINR(cash)} — low, prioritise inflows`, level: "red" });
  }

  return out.slice(0, 5);
}

const dotColor: Record<Level, string> = {
  green: "bg-emerald-500",
  amber: "bg-amber-400",
  red:   "bg-red-500",
};
const textColor: Record<Level, string> = {
  green: "text-emerald-400",
  amber: "text-amber-400",
  red:   "text-red-400",
};

function healthScore(snap: DirectorSnapshot): number {
  let score = 100;
  if (snap.revenue_mtd_change_pct < 0)  score -= 20;
  else if (snap.revenue_mtd_change_pct < 5) score -= 8;
  if (snap.return_rate_pct > 12)  score -= 20;
  else if (snap.return_rate_pct > 8) score -= 8;
  if (snap.delivery_success_pct < 75)  score -= 20;
  else if (snap.delivery_success_pct < 87) score -= 8;
  if (snap.cod_outstanding_inr > 1_00_000) score -= 10;
  else if (snap.cod_outstanding_inr > 40_000) score -= 4;
  if (snap.red_alert_count > 0)   score -= snap.red_alert_count * 8;
  if (snap.amber_alert_count > 0) score -= snap.amber_alert_count * 3;
  return Math.max(0, Math.min(100, score));
}

function scoreLabel(score: number): { label: string; color: string } {
  if (score >= 80) return { label: "Good", color: "text-emerald-400" };
  if (score >= 60) return { label: "Attention", color: "text-amber-400" };
  return { label: "Action Required", color: "text-red-400" };
}

function scoreGradient(score: number): string {
  if (score >= 80) return `conic-gradient(#4ade80 0% ${score}%, #27272a ${score}% 100%)`;
  if (score >= 60) return `conic-gradient(#fb923c 0% ${score}%, #27272a ${score}% 100%)`;
  return `conic-gradient(#f87171 0% ${score}%, #27272a ${score}% 100%)`;
}

export function BusinessSummary() {
  const { data: snap, isLoading } = useDirectorSnapshot();

  if (isLoading) {
    return (
      <div className="rounded-xl border border-border bg-card p-5 sm:p-6">
        <div className="flex items-start gap-5">
          <div className="h-16 w-16 rounded-full skeleton flex-shrink-0" />
          <div className="flex-1 space-y-3 pt-1">
            {[80, 100, 90, 70, 95].map((w, i) => (
              <div key={i} className="h-4 rounded skeleton" style={{ width: `${w}%` }} />
            ))}
          </div>
        </div>
      </div>
    );
  }
  if (!snap) return null;

  const insights = deriveInsights(snap);
  const score = healthScore(snap);
  const { label: sLabel, color: sColor } = scoreLabel(score);

  return (
    <div className="rounded-xl border border-border bg-card p-5 sm:p-6">
      <div className="flex items-start gap-5 sm:gap-6">
        {/* Score ring */}
        <div className="flex-shrink-0 flex flex-col items-center gap-1.5">
          <div
            className="h-[64px] w-[64px] rounded-full flex items-center justify-center"
            style={{ background: scoreGradient(score) }}
          >
            <div className="h-[48px] w-[48px] bg-card rounded-full flex items-center justify-center">
              <span className={cn("text-[18px] font-black tabular-nums", sColor)}>{score}</span>
            </div>
          </div>
          <p className="text-[11px] font-semibold text-muted-foreground text-center leading-none">
            Health Score
          </p>
        </div>

        {/* Insights */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-3">
            <p className="text-[15px] font-bold text-foreground">Business Summary</p>
            <span className={cn("text-[12px] font-semibold px-2 py-0.5 rounded-full", {
              "bg-emerald-500/10 text-emerald-400": score >= 80,
              "bg-amber-400/10 text-amber-400":     score >= 60 && score < 80,
              "bg-red-500/10 text-red-400":          score < 60,
            })}>
              {sLabel}
            </span>
          </div>
          <ul className="space-y-2">
            {insights.map((ins, i) => (
              <li key={i} className="flex items-start gap-2.5">
                <span className={cn("mt-[6px] h-2 w-2 rounded-full flex-shrink-0", dotColor[ins.level])} />
                <span className={cn("text-[14px] leading-snug", textColor[ins.level])}>
                  {ins.text}
                </span>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
}
