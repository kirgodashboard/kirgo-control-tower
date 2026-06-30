import type { Period } from "@/types/chart";

export interface DateRange {
  start: string; // YYYY-MM-DD
  end: string;
  label: string;
}

export function getPeriodDates(preset: Period): DateRange {
  const today = new Date();
  const fmt = (d: Date) => d.toISOString().slice(0, 10);

  const sub = (days: number) => {
    const d = new Date(today);
    d.setDate(d.getDate() - days);
    return d;
  };

  switch (preset) {
    case "7d":
      return { start: fmt(sub(7)), end: fmt(today), label: "Last 7 days" };
    case "30d":
      return { start: fmt(sub(30)), end: fmt(today), label: "Last 30 days" };
    case "90d":
      return { start: fmt(sub(90)), end: fmt(today), label: "Last 90 days" };
    case "6m":
      return { start: fmt(sub(180)), end: fmt(today), label: "Last 6 months" };
    case "1y":
      return { start: fmt(sub(365)), end: fmt(today), label: "Last 12 months" };
    case "ytd": {
      const jan1 = new Date(today.getFullYear(), 0, 1);
      return { start: fmt(jan1), end: fmt(today), label: "Year to date" };
    }
    case "all":
      return { start: "2020-01-01", end: fmt(today), label: "All time" };
  }
}

export function getPriorPeriod(current: DateRange): DateRange {
  const start = new Date(current.start);
  const end = new Date(current.end);
  const days = Math.round((end.getTime() - start.getTime()) / 86_400_000);
  const priorEnd = new Date(start);
  priorEnd.setDate(priorEnd.getDate() - 1);
  const priorStart = new Date(priorEnd);
  priorStart.setDate(priorStart.getDate() - days + 1);
  const fmt = (d: Date) => d.toISOString().slice(0, 10);
  return { start: fmt(priorStart), end: fmt(priorEnd), label: "Prior period" };
}

export function getMtdRange(): DateRange {
  const today = new Date();
  const jan1 = new Date(today.getFullYear(), today.getMonth(), 1);
  const fmt = (d: Date) => d.toISOString().slice(0, 10);
  return { start: fmt(jan1), end: fmt(today), label: "Month to date" };
}

// ── Business Review Period ──────────────────────────────────────────────────

export type ReviewPeriod =
  | "today"
  | "yesterday"
  | "7d"
  | "30d"
  | "60d"
  | "90d"
  | "mtd"
  | "prev_month"
  | "fy"
  | "all";

export function getReviewPeriodDates(period: ReviewPeriod): DateRange {
  const today = new Date();
  const fmt = (d: Date) => d.toISOString().slice(0, 10);
  const sub = (days: number) => {
    const d = new Date(today);
    d.setDate(d.getDate() - days);
    return d;
  };

  switch (period) {
    case "today":
      return { start: fmt(today), end: fmt(today), label: "Today" };
    case "yesterday": {
      const y = sub(1);
      return { start: fmt(y), end: fmt(y), label: "Yesterday" };
    }
    case "7d":
      return { start: fmt(sub(7)), end: fmt(today), label: "Last 7 days" };
    case "30d":
      return { start: fmt(sub(30)), end: fmt(today), label: "Last 30 days" };
    case "60d":
      return { start: fmt(sub(60)), end: fmt(today), label: "Last 60 days" };
    case "90d":
      return { start: fmt(sub(90)), end: fmt(today), label: "Last 90 days" };
    case "mtd": {
      const first = new Date(today.getFullYear(), today.getMonth(), 1);
      return { start: fmt(first), end: fmt(today), label: "This month" };
    }
    case "prev_month": {
      const firstOfThis = new Date(today.getFullYear(), today.getMonth(), 1);
      const lastOfPrev = new Date(firstOfThis);
      lastOfPrev.setDate(0);
      const firstOfPrev = new Date(lastOfPrev.getFullYear(), lastOfPrev.getMonth(), 1);
      return { start: fmt(firstOfPrev), end: fmt(lastOfPrev), label: "Previous month" };
    }
    case "fy": {
      // Indian FY: April 1 – March 31
      const fyStart =
        today.getMonth() >= 3
          ? new Date(today.getFullYear(), 3, 1)
          : new Date(today.getFullYear() - 1, 3, 1);
      return { start: fmt(fyStart), end: fmt(today), label: "Financial year" };
    }
    case "all":
      return { start: "2020-01-01", end: fmt(today), label: "All time" };
  }
}

export function getPriorMonthRange(): DateRange {
  const today = new Date();
  const firstOfThisMonth = new Date(today.getFullYear(), today.getMonth(), 1);
  const lastOfLastMonth = new Date(firstOfThisMonth);
  lastOfLastMonth.setDate(0);
  const firstOfLastMonth = new Date(lastOfLastMonth.getFullYear(), lastOfLastMonth.getMonth(), 1);
  const fmt = (d: Date) => d.toISOString().slice(0, 10);
  return { start: fmt(firstOfLastMonth), end: fmt(lastOfLastMonth), label: "Prior month" };
}
