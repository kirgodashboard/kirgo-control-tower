export function formatINR(value: number | null | undefined, compact = true): string {
  if (value == null) return "—";
  if (compact) {
    const abs = Math.abs(value);
    const sign = value < 0 ? "-" : "";
    if (abs >= 1_00_00_000) {
      const str = (abs / 1_00_00_000).toFixed(2).replace(/\.?0+$/, "");
      return `${sign}₹${str}Cr`;
    }
    if (abs >= 1_00_000) {
      const str = (abs / 1_00_000).toFixed(2).replace(/\.?0+$/, "");
      return `${sign}₹${str}L`;
    }
    if (abs >= 1_000) {
      const str = (abs / 1_000).toFixed(1).replace(/\.?0+$/, "");
      return `${sign}₹${str}K`;
    }
  }
  return `₹${value.toLocaleString("en-IN", { maximumFractionDigits: 0 })}`;
}

export function formatINRFull(value: number | null | undefined): string {
  if (value == null) return "—";
  return `₹${value.toLocaleString("en-IN", { maximumFractionDigits: 0 })}`;
}

export function formatPct(value: number | null | undefined, decimals = 1): string {
  if (value == null) return "—";
  return `${value.toFixed(decimals)}%`;
}

export function formatCount(value: number | null | undefined): string {
  if (value == null) return "—";
  return value.toLocaleString("en-IN");
}

export function formatDelta(value: number | null | undefined): string {
  if (value == null) return "";
  const sign = value >= 0 ? "+" : "";
  return `${sign}${value.toFixed(1)}%`;
}

export function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

export function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString("en-IN", {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60_000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}
