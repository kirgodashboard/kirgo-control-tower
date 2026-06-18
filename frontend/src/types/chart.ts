export interface ChartDataPoint {
  date: string;
  value: number;
  label?: string;
}

export interface MultiSeriesPoint {
  date: string;
  [key: string]: string | number;
}

export type Grain = "day" | "week" | "month";
export type Period = "7d" | "30d" | "90d" | "6m" | "1y" | "ytd" | "all";
