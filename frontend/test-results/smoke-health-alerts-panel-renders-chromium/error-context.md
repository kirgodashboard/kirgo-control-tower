# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: smoke.spec.ts >> health: alerts panel renders
- Location: e2e/smoke.spec.ts:97:5

# Error details

```
Error: expect(locator).toBeVisible() failed

Locator: getByText('Alerts')
Expected: visible
Error: strict mode violation: getByText('Alerts') resolved to 2 elements:
    1) <span class="flex-1 text-[13px]">Health & Alerts</span> aka getByRole('link', { name: 'Health & Alerts' })
    2) <p class="text-[14px] text-muted-foreground mt-1">Alerts to fix, integration sync status, and KPI v…</p> aka getByText('Alerts to fix, integration')

Call log:
  - Expect "toBeVisible" with timeout 5000ms
  - waiting for getByText('Alerts')

```

# Page snapshot

```yaml
- generic [ref=e2]:
  - complementary [ref=e4]:
    - generic [ref=e5]:
      - img "Kirgo" [ref=e6]
      - generic [ref=e7]:
        - generic [ref=e8]: Kirgo
        - generic [ref=e9]: Control Tower
    - navigation [ref=e10]:
      - button "Dashboards" [ref=e12] [cursor=pointer]:
        - generic [ref=e13]: Dashboards
        - img [ref=e14]
      - button "Transactions" [ref=e17] [cursor=pointer]:
        - generic [ref=e18]: Transactions
        - img [ref=e19]
      - button "Inventory" [ref=e22] [cursor=pointer]:
        - generic [ref=e23]: Inventory
        - img [ref=e24]
      - button "Finance & Bank" [ref=e27] [cursor=pointer]:
        - generic [ref=e28]: Finance & Bank
        - img [ref=e29]
      - generic [ref=e31]:
        - button "Administration" [ref=e32] [cursor=pointer]:
          - generic [ref=e33]: Administration
          - img [ref=e34]
        - generic [ref=e36]:
          - link "Order Classification" [ref=e37] [cursor=pointer]:
            - /url: /dashboard/order-classification
            - img [ref=e38]
            - generic [ref=e42]: Order Classification
          - link "Health & Alerts" [ref=e43] [cursor=pointer]:
            - /url: /dashboard/health
            - img [ref=e45]
            - generic [ref=e48]: Health & Alerts
            - img [ref=e49]
          - link "Metric Catalog" [ref=e51] [cursor=pointer]:
            - /url: /dashboard/metric-catalog
            - img [ref=e52]
            - generic [ref=e55]: Metric Catalog
          - link "Import Center" [ref=e56] [cursor=pointer]:
            - /url: /dashboard/import-center
            - img [ref=e57]
            - generic [ref=e60]: Import Center
          - link "Company" [ref=e61] [cursor=pointer]:
            - /url: /settings/company
            - img [ref=e62]
            - generic [ref=e65]: Company
          - link "Integrations" [ref=e66] [cursor=pointer]:
            - /url: /settings/integrations
            - img [ref=e67]
            - generic [ref=e68]: Integrations
    - generic [ref=e70]:
      - generic [ref=e71]: v1.0 · 2026
      - generic [ref=e74]: Live
  - generic [ref=e75]:
    - banner [ref=e76]:
      - button "Toggle theme" [ref=e78] [cursor=pointer]:
        - img [ref=e79]
    - main [ref=e81]:
      - generic [ref=e82]:
        - generic [ref=e84]:
          - heading "Health" [level=1] [ref=e85]
          - paragraph [ref=e86]: Alerts to fix, integration sync status, and KPI validation
        - generic [ref=e89]:
          - generic [ref=e90]:
            - generic [ref=e91]:
              - img [ref=e92]
              - paragraph [ref=e96]: Integrations
            - generic [ref=e98]: 0 syncing
          - img [ref=e100]
        - generic [ref=e102]:
          - button "KPI Integrity Check" [ref=e103] [cursor=pointer]:
            - paragraph [ref=e105]: KPI Integrity Check
          - button "Run check" [ref=e106] [cursor=pointer]:
            - img [ref=e107]
            - text: Run check
          - img [ref=e109]
      - generic [ref=e111]:
        - generic [ref=e112]:
          - img [ref=e113]
          - text: Green — OK
        - generic [ref=e116]:
          - img [ref=e117]
          - text: Amber — review soon
        - generic [ref=e119]:
          - img [ref=e120]
          - text: Red — action needed
        - generic [ref=e124]:
          - img [ref=e125]
          - text: Refreshes every 60s
```

# Test source

```ts
  1   | import { test, expect } from "@playwright/test";
  2   | 
  3   | // All routes that must load without crash or 404
  4   | const ROUTES = [
  5   |   // Dashboards
  6   |   { path: "/dashboard",                   label: "Command Center" },
  7   |   { path: "/dashboard/executive",         label: "Executive" },
  8   |   { path: "/dashboard/customers",         label: "Customers" },
  9   |   { path: "/dashboard/operations",        label: "Operations" },
  10  |   { path: "/dashboard/finance",           label: "Finance" },
  11  |   { path: "/dashboard/forecasting",       label: "Forecasting" },
  12  |   { path: "/dashboard/profitability",     label: "Profitability" },
  13  |   // Transactions
  14  |   { path: "/dashboard/sales-register",    label: "Sales Register" },
  15  |   { path: "/dashboard/logistics",         label: "Logistics Register" },
  16  |   { path: "/dashboard/customer-register", label: "Customer Register" },
  17  |   { path: "/dashboard/purchases",         label: "Purchases" },
  18  |   { path: "/dashboard/expenses-register", label: "Expenses Register" },
  19  |   // Inventory
  20  |   { path: "/dashboard/inventory",         label: "Inventory" },
  21  |   // Finance & Bank
  22  |   { path: "/dashboard/bank",              label: "Bank Feed" },
  23  |   { path: "/dashboard/receipts",          label: "Receipts" },
  24  |   { path: "/dashboard/payments",          label: "Payments" },
  25  |   { path: "/dashboard/bank-classification", label: "Classify Transactions" },
  26  |   { path: "/dashboard/expenses",          label: "Expenses" },
  27  |   { path: "/dashboard/expense-entry",     label: "New Expense" },
  28  |   { path: "/dashboard/receivables",       label: "Receivables" },
  29  |   // Administration
  30  |   { path: "/dashboard/order-classification", label: "Order Classification" },
  31  |   { path: "/dashboard/health",            label: "Health & Alerts" },
  32  |   { path: "/dashboard/metric-catalog",    label: "Metric Catalog" },
  33  |   { path: "/dashboard/import-center",     label: "Import Center" },
  34  |   // Settings
  35  |   { path: "/settings/company",            label: "Company Settings" },
  36  |   { path: "/settings/integrations",       label: "Integrations" },
  37  |   { path: "/settings/bank-feeds",         label: "Bank Feed Settings" },
  38  | ];
  39  | 
  40  | // Routes that should redirect (not 404)
  41  | const REDIRECT_ROUTES = [
  42  |   { path: "/dashboard/customer-intelligence", redirectsTo: "/dashboard/customers" },
  43  |   { path: "/dashboard/data-audit",            redirectsTo: "/dashboard/health" },
  44  |   { path: "/dashboard/system-health",         redirectsTo: "/dashboard/health" },
  45  |   { path: "/dashboard/system-audit-center",   redirectsTo: "/dashboard/health" },
  46  | ];
  47  | 
  48  | for (const route of ROUTES) {
  49  |   test(`route: ${route.path} — loads without error`, async ({ page }) => {
  50  |     const errors: string[] = [];
  51  |     page.on("console", (msg) => {
  52  |       if (msg.type() === "error") errors.push(msg.text());
  53  |     });
  54  | 
  55  |     const response = await page.goto(route.path);
  56  |     expect(response?.status(), `${route.path} returned non-200`).not.toBe(404);
  57  |     expect(response?.status(), `${route.path} returned 500`).not.toBe(500);
  58  | 
  59  |     // Page should not show a Next.js error overlay
  60  |     await expect(page.locator("body")).not.toContainText("Application error");
  61  |     await expect(page.locator("body")).not.toContainText("This page could not be found");
  62  | 
  63  |     // Sidebar should be present
  64  |     await expect(page.locator("aside")).toBeVisible();
  65  |   });
  66  | }
  67  | 
  68  | for (const route of REDIRECT_ROUTES) {
  69  |   test(`redirect: ${route.path} → ${route.redirectsTo}`, async ({ page }) => {
  70  |     await page.goto(route.path);
  71  |     await expect(page).toHaveURL(new RegExp(route.redirectsTo));
  72  |   });
  73  | }
  74  | 
  75  | test("sidebar: all groups render", async ({ page }) => {
  76  |   await page.goto("/dashboard");
  77  |   await expect(page.getByText("Dashboards")).toBeVisible();
  78  |   await expect(page.getByText("Transactions")).toBeVisible();
  79  |   await expect(page.getByText("Finance & Bank")).toBeVisible();
  80  |   await expect(page.getByText("Administration")).toBeVisible();
  81  | });
  82  | 
  83  | test("sidebar: active route auto-expands group", async ({ page }) => {
  84  |   await page.goto("/dashboard/health");
  85  |   // Administration group should be open and Health & Alerts highlighted
  86  |   await expect(page.getByRole("link", { name: "Health & Alerts" })).toBeVisible();
  87  | });
  88  | 
  89  | test("executive: KPI cards render with data", async ({ page }) => {
  90  |   await page.goto("/dashboard/executive");
  91  |   // Wait for loading to settle
  92  |   await page.waitForTimeout(3000);
  93  |   // Should not show skeleton/loading indefinitely
  94  |   await expect(page.locator('[class*="animate-pulse"]')).toHaveCount(0, { timeout: 10_000 });
  95  | });
  96  | 
  97  | test("health: alerts panel renders", async ({ page }) => {
  98  |   await page.goto("/dashboard/health");
> 99  |   await expect(page.getByText("Alerts")).toBeVisible();
      |                                          ^ Error: expect(locator).toBeVisible() failed
  100 |   await expect(page.getByText("Integrations")).toBeVisible();
  101 |   await expect(page.getByText("KPI Integrity Check")).toBeVisible();
  102 | });
  103 | 
  104 | test("sales-register: export buttons present", async ({ page }) => {
  105 |   await page.goto("/dashboard/sales-register");
  106 |   await expect(page.getByText("CSV")).toBeVisible();
  107 |   await expect(page.getByText("Excel")).toBeVisible();
  108 | });
  109 | 
  110 | test("metric-catalog: shows metrics (not empty)", async ({ page }) => {
  111 |   await page.goto("/dashboard/metric-catalog");
  112 |   await page.waitForTimeout(2000);
  113 |   await expect(page.getByText("No metrics match")).not.toBeVisible();
  114 | });
  115 | 
```