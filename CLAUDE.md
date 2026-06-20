# Kirgo Control Tower — Claude Code Rules

## Project Overview
Founder/CFO-grade analytics dashboard for Kirgo (D2C brand). Next.js 14 App Router, TypeScript, Tailwind CSS, Supabase, dark-mode-first.

---

## Architecture

### Directory Layout
```
frontend/src/
  app/                        # Next.js App Router pages + API routes
    dashboard/                # All dashboard pages
      [page]/page.tsx         # Each route is a self-contained page
    api/sync/                 # Sync API routes (trigger, schedule)
  components/
    layout/                   # Sidebar, mobile nav, top bar
    ui/                       # Shared primitives (see below)
  features/[domain]/          # Domain-specific components
    director/                 # Command Center
    customers/
    profitability/
    operations/
    finance/
    expenses/
  lib/
    data/[domain].ts          # Supabase RPC fetchers — pure async functions
    hooks/use-[domain].ts     # React Query hooks wrapping data fetchers
    supabase/                 # client.ts (anon) + server.ts (service role)
    utils/                    # format.ts, date-ranges.ts, cn()
  types/                      # TypeScript interfaces
supabase/
  migrations/                 # SQL migration files
  functions/                  # Deno Edge Functions (sync workers)
```

### Key Rules
- Pages live in `app/dashboard/[name]/page.tsx` — always `"use client"`
- Domain components live in `features/[domain]/`, not in `components/`
- Data fetching: always via `lib/data/` → `lib/hooks/` → component
- Never call Supabase directly from a component — use hooks
- Never store credentials in code or DB columns — Supabase Vault only

---

## Design System

### Color Tokens (CSS Variables — never hardcode hex)
All colors are HSL CSS variables defined in `src/app/globals.css`.

| Token | Usage |
|-------|-------|
| `hsl(var(--background))` | Page background |
| `hsl(var(--card))` | Card / panel surface |
| `hsl(var(--foreground))` | Primary text |
| `hsl(var(--muted-foreground))` | Secondary / label text |
| `hsl(var(--border))` | Borders and dividers |
| `hsl(var(--primary))` | Brand violet accent |
| `hsl(var(--sidebar))` | Sidebar background |
| `hsl(var(--sidebar-border))` | Sidebar dividers |
| `hsl(var(--sidebar-accent))` | Sidebar hover / active bg |

**Traffic-light semantic colors** (use Tailwind, not CSS vars):
- Green / healthy: `text-emerald-500`, `bg-emerald-500/10`, `border-emerald-500/20`
- Amber / warning: `text-amber-500`, `bg-amber-500/10`, `border-amber-500/20`
- Red / critical: `text-red-500`, `bg-red-500/10`, `border-red-500/20`
- Grey / unknown: `text-muted-foreground`, `bg-muted`

**Brand accent**: `violet-500` / `violet-600` — used for active nav indicator, primary actions, brand logo.

### Typography
- Font: `font-sans` (Geist Sans) for UI, `font-mono` (Geist Mono) for numbers/code
- Large KPI numbers: `text-3xl font-bold tabular-nums`
- Section labels: `text-[11px] font-semibold uppercase tracking-widest text-muted-foreground`
- Card labels: `text-xs font-medium uppercase tracking-wider text-muted-foreground`
- Body: `text-sm text-foreground`
- Secondary body: `text-sm text-muted-foreground`

### Spacing & Radius
- Card padding: `p-4` or `p-5`
- Section gaps: `gap-4` or `gap-6`
- Border radius: `rounded-xl` for cards, `rounded-lg` for inner elements, `rounded-md` for buttons/badges
- Use `var(--radius)` via Tailwind's `rounded-lg` — never hardcode px radius

### Shared UI Components (`src/components/ui/`)
- **`KpiCard`** — metric card with label, value, trend badge, optional spark
- **`PageHeader`** — page title + subtitle + optional actions row
- **`Panel`** — generic card wrapper with consistent padding/border
- **`SectionHeader`** — label + optional right slot (used above tables/charts)
- **`TrendBadge`** — colored pill showing +/- delta with arrow icon
- **`DataUnavailableCard`** — empty state when no data

**IMPORTANT:** Always use these before building a custom version.

---

## Figma → Code Workflow

### Required Flow (do not skip)

1. Run `get_design_context` on the target Figma node
2. Run `get_screenshot` for visual reference
3. Translate output to this project's conventions (see rules below)
4. Validate against the Figma screenshot before marking complete

### Implementation Rules

- **Colors**: Map Figma fills to CSS variable tokens above — never output hex colors
- **Typography**: Map Figma text styles to the type scale above
- **Components**: Check `src/components/ui/` first — reuse before creating new
- **Icons**: Use `lucide-react` — do NOT install new icon packages
- **Charts**: Use `recharts` — already installed
- **Dark mode**: All new UI must work in dark mode via the `.dark` CSS variable cascade
- **Responsive**: Mobile-first; sidebar collapses on `md` breakpoint

### What Maps to What

| Figma pattern | Code equivalent |
|---------------|-----------------|
| Card / surface | `<Panel>` or `<div className="rounded-xl border border-border bg-card p-5">` |
| Metric tile | `<KpiCard>` |
| Page title | `<PageHeader title="..." subtitle="...">` |
| Section label | `<SectionHeader label="...">` |
| +/- delta chip | `<TrendBadge value={n} suffix="%">` |
| Status dot | `<span className="h-2 w-2 rounded-full bg-emerald-500">` |
| Primary button | `<Button>` from shadcn |
| Ghost / outline button | `<Button variant="outline">` or `variant="ghost"` |
| Table | Plain `<table>` with `text-sm` rows, `text-muted-foreground` headers |

---

## Business Rules

### BR-201: Commercial Order Classification (CRITICAL)

Orders classified as **`influencer_promotion`**, **`brand_seeding`**, **`internal_use`**, or **`replacement`** are NON-COMMERCIAL and must be treated as follows:

| Dimension | Treatment |
|-----------|-----------|
| Revenue KPIs | **EXCLUDED** — never count toward gross revenue, AOV, order counts |
| Customer Sales KPIs | **EXCLUDED** — not a real customer purchase; don't count for new/repeat/LTV |
| Receivables | **EXCLUDED** — no real money owed; they are not COD outstanding |
| Marketing Spend (`promo_spend_inr`) | **INCLUDED** — cost of goods used for promotion |
| Inventory Consumption | **INCLUDED** — units leave stock; tracked in inventory movements |
| Promotion Analysis (`get_promo_spend_summary`) | **INCLUDED** — dedicated promo reporting |

**How to enforce in every SQL RPC that touches revenue or orders:**
```sql
-- Required JOIN
LEFT JOIN order_classifications oc ON oc.order_id = o.id
-- Required WHERE clause
AND COALESCE(oc.classification, 'paid_sale'::order_class) != ALL(non_commercial_order_classes())
-- For "orders with no classification" use COALESCE default = 'paid_sale' (commercial)
```

**NEVER** write an order-count or revenue query without this filter. The canonical function `non_commercial_order_classes()` is the single source of truth — do not hardcode the class names.

The rule is enforced in:
- `non_commercial_order_classes()` — canonical anchor function
- All profitability RPCs (`get_profitability_kpis`, `get_profitability_trend`, `get_product_pl`, `get_sku_pl`, `get_city_pl`, `get_launch_pl`, `get_customer_pl`)
- Executive dashboard RPCs (`get_executive_kpis`, `get_revenue_trend`, `get_period_comparison`, `get_launch_performance`)
- Customer RPCs (`get_customer_kpis`, `get_director_snapshot`)
- Data quality COD variance calculation

### Date Dimensions (Revenue)
- **Executive / Customer / Director KPIs**: use `orders.ordered_at` (real-time order intake)
- **Profitability P&L suite**: use `shipments.delivered_at` (cash recognition on delivery)

---

## Data & State Conventions

### Supabase RPC Pattern
```ts
// lib/data/domain.ts
export async function fetchSomething(): Promise<SomeType[]> {
  const { data, error } = await supabase.rpc("rpc_name", { param });
  if (error) throw error;
  return data ?? [];
}

// lib/hooks/use-domain.ts
export function useSomething() {
  return useQuery({
    queryKey: ["something"],
    queryFn: fetchSomething,
    staleTime: 30_000,
  });
}
```

### Date Range Filtering
- Available periods: `"MTD" | "30D" | "90D" | "6M" | "ALL"`
- Use `useDateRange()` hook — never manage date state locally in a page

### Number Formatting
- Currency (INR): `formatINR(n)` from `lib/utils/format.ts` → `₹1.23L`
- Percentages: `formatPct(n)` → `12.3%`
- Counts: `formatCount(n)` → `1,234`
- Never call `toFixed()` or `toLocaleString()` directly in JSX

---

## Migration Rules

- All SQL goes in `supabase/migrations/YYYYMMDD_description.sql`
- IMPORTANT: Never DROP or ALTER existing tables — only ADD
- IMPORTANT: New RPCs must use `SECURITY DEFINER SET search_path = public`
- Every new table needs RLS enabled with authenticated SELECT, service-role full access
- Seed data goes in the same migration file, after table creation

---

## Asset Handling

- IMPORTANT: Use localhost sources from Figma MCP server directly when provided
- Store static assets in `frontend/public/`
- SVG icons come from `lucide-react` — do NOT add new icon libraries
- Images: use Next.js `<Image>` component, never `<img>`
