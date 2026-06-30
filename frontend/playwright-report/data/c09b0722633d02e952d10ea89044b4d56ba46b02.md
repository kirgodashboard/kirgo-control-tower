# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: smoke.spec.ts >> executive: KPI cards render with data
- Location: e2e/smoke.spec.ts:89:5

# Error details

```
Error: expect(locator).toHaveCount(expected) failed

Locator:  locator('[class*="animate-pulse"]')
Expected: 0
Received: 1
Timeout:  10000ms

Call log:
  - Expect "toHaveCount" with timeout 10000ms
  - waiting for locator('[class*="animate-pulse"]')
    24 × locator resolved to 1 element
       - unexpected value "1"

```

# Page snapshot

```yaml
- generic [active] [ref=e1]:
  - generic [ref=e2]:
    - complementary [ref=e4]:
      - generic [ref=e5]:
        - img "Kirgo" [ref=e6]
        - generic [ref=e7]:
          - generic [ref=e8]: Kirgo
          - generic [ref=e9]: Control Tower
      - navigation [ref=e10]:
        - generic [ref=e11]:
          - button "Dashboards" [ref=e12] [cursor=pointer]:
            - generic [ref=e13]: Dashboards
            - img [ref=e14]
          - generic [ref=e16]:
            - link "Command Center" [ref=e17] [cursor=pointer]:
              - /url: /dashboard
              - img [ref=e18]
              - generic [ref=e24]: Command Center
            - link "Executive" [ref=e25] [cursor=pointer]:
              - /url: /dashboard/executive
              - img [ref=e27]
              - generic [ref=e30]: Executive
              - img [ref=e31]
            - link "Customers" [ref=e33] [cursor=pointer]:
              - /url: /dashboard/customers
              - img [ref=e34]
              - generic [ref=e39]: Customers
            - link "Operations" [ref=e40] [cursor=pointer]:
              - /url: /dashboard/operations
              - img [ref=e41]
              - generic [ref=e45]: Operations
            - link "Finance" [ref=e46] [cursor=pointer]:
              - /url: /dashboard/finance
              - img [ref=e47]
              - generic [ref=e49]: Finance
            - link "Forecasting" [ref=e50] [cursor=pointer]:
              - /url: /dashboard/forecasting
              - img [ref=e51]
              - generic [ref=e54]: Forecasting
            - link "Profitability" [ref=e55] [cursor=pointer]:
              - /url: /dashboard/profitability
              - img [ref=e56]
              - generic [ref=e58]: Profitability
        - button "Transactions" [ref=e60] [cursor=pointer]:
          - generic [ref=e61]: Transactions
          - img [ref=e62]
        - button "Inventory" [ref=e65] [cursor=pointer]:
          - generic [ref=e66]: Inventory
          - img [ref=e67]
        - button "Finance & Bank" [ref=e70] [cursor=pointer]:
          - generic [ref=e71]: Finance & Bank
          - img [ref=e72]
        - button "Administration" [ref=e75] [cursor=pointer]:
          - generic [ref=e76]: Administration
          - img [ref=e77]
      - generic [ref=e80]:
        - generic [ref=e81]: v1.0 · 2026
        - generic [ref=e84]: Live
    - generic [ref=e85]:
      - banner [ref=e86]:
        - button "Toggle theme" [ref=e88] [cursor=pointer]:
          - img [ref=e89]
      - main [ref=e95]:
        - generic [ref=e96]:
          - generic [ref=e97]:
            - generic [ref=e98]:
              - heading "Executive Overview" [level=1] [ref=e99]
              - paragraph [ref=e100]: Last 30 days
            - generic [ref=e101]:
              - button "MTD" [ref=e102] [cursor=pointer]
              - button "30 Days" [ref=e103] [cursor=pointer]
              - button "90 Days" [ref=e104] [cursor=pointer]
              - button "6 Months" [ref=e105] [cursor=pointer]
              - button "All Time" [ref=e106] [cursor=pointer]
          - generic [ref=e107]:
            - link "Gross Revenue Definition of Gross Revenue ₹29.7K 64.1% vs prior period" [ref=e108] [cursor=pointer]:
              - /url: /dashboard/sales-register
              - generic [ref=e109]:
                - generic [ref=e110]:
                  - paragraph [ref=e111]:
                    - text: Gross Revenue
                    - button "Definition of Gross Revenue" [ref=e113]:
                      - img [ref=e114]
                  - img [ref=e117]
                - paragraph [ref=e120]: ₹29.7K
                - generic [ref=e121]:
                  - generic [ref=e122]:
                    - img [ref=e123]
                    - text: 64.1%
                  - generic [ref=e126]: vs prior period
            - link "Orders Definition of Orders / Sale Events 10 63.0% vs prior period" [ref=e127] [cursor=pointer]:
              - /url: /dashboard/sales-register
              - generic [ref=e128]:
                - generic [ref=e129]:
                  - paragraph [ref=e130]:
                    - text: Orders
                    - button "Definition of Orders / Sale Events" [ref=e132]:
                      - img [ref=e133]
                  - img [ref=e136]
                - paragraph [ref=e140]: "10"
                - generic [ref=e141]:
                  - generic [ref=e142]:
                    - img [ref=e143]
                    - text: 63.0%
                  - generic [ref=e146]: vs prior period
            - link "Avg Order Value Definition of Average Order Value ₹3K" [ref=e147] [cursor=pointer]:
              - /url: /dashboard/sales-register
              - generic [ref=e148]:
                - generic [ref=e149]:
                  - paragraph [ref=e150]:
                    - text: Avg Order Value
                    - button "Definition of Average Order Value" [ref=e152]:
                      - img [ref=e153]
                  - img [ref=e156]
                - paragraph [ref=e157]: ₹3K
            - link "Unique Customers 9" [ref=e158] [cursor=pointer]:
              - /url: /dashboard/customers
              - generic [ref=e159]:
                - generic [ref=e160]:
                  - paragraph [ref=e161]: Unique Customers
                  - img [ref=e163]
                - paragraph [ref=e168]: "9"
            - link "New Customers Definition of New Customers 7" [ref=e169] [cursor=pointer]:
              - /url: /dashboard/customers
              - generic [ref=e170]:
                - generic [ref=e171]:
                  - paragraph [ref=e172]:
                    - text: New Customers
                    - button "Definition of New Customers" [ref=e174]:
                      - img [ref=e175]
                  - img [ref=e178]
                - paragraph [ref=e181]: "7"
            - link "COD Share 30.0%" [ref=e182] [cursor=pointer]:
              - /url: /dashboard/receivables
              - generic [ref=e183]:
                - generic [ref=e184]:
                  - paragraph [ref=e185]: COD Share
                  - img [ref=e187]
                - paragraph [ref=e189]: 30.0%
            - link "RTO Rate Definition of RTO Rate 0.0%" [ref=e190] [cursor=pointer]:
              - /url: /dashboard/operations
              - generic [ref=e191]:
                - generic [ref=e192]:
                  - paragraph [ref=e193]:
                    - text: RTO Rate
                    - button "Definition of RTO Rate" [ref=e195]:
                      - img [ref=e196]
                  - img [ref=e199]
                - paragraph [ref=e204]: 0.0%
            - link "RTO Definition of Return to Origin 0" [ref=e205] [cursor=pointer]:
              - /url: /dashboard/operations
              - generic [ref=e206]:
                - generic [ref=e207]:
                  - paragraph [ref=e208]:
                    - text: RTO
                    - button "Definition of Return to Origin" [ref=e210]:
                      - img [ref=e211]
                  - img [ref=e214]
                - paragraph [ref=e218]: "0"
          - generic [ref=e219]:
            - generic [ref=e221]:
              - paragraph [ref=e222]: Launch Performance
              - table [ref=e224]:
                - rowgroup [ref=e225]:
                  - row "Launch Live Date Revenue Orders AOV" [ref=e226]:
                    - columnheader "Launch" [ref=e227]
                    - columnheader "Live Date" [ref=e228]
                    - columnheader "Revenue" [ref=e229]
                    - columnheader "Orders" [ref=e230]
                    - columnheader "AOV" [ref=e231]
                - rowgroup [ref=e232]:
                  - row "Classic 1 Oct 2023 ₹3.72L 158 ₹2.4K" [ref=e233]:
                    - cell "Classic" [ref=e234]
                    - cell "1 Oct 2023" [ref=e235]
                    - cell "₹3.72L" [ref=e236]
                    - cell "158" [ref=e237]
                    - cell "₹2.4K" [ref=e238]
                  - row "Summer + Classic Restock 1 May 2024 ₹7.55L 305 ₹2.5K" [ref=e239]:
                    - cell "Summer + Classic Restock" [ref=e240]
                    - cell "1 May 2024" [ref=e241]
                    - cell "₹7.55L" [ref=e242]
                    - cell "305" [ref=e243]
                    - cell "₹2.5K" [ref=e244]
                  - row "Core 1 Jan 2026 ₹3.29L 111 ₹3K" [ref=e245]:
                    - cell "Core" [ref=e246]
                    - cell "1 Jan 2026" [ref=e247]
                    - cell "₹3.29L" [ref=e248]
                    - cell "111" [ref=e249]
                    - cell "₹3K" [ref=e250]
            - generic [ref=e251]:
              - paragraph [ref=e252]: Payment Split
              - paragraph [ref=e253]: COD vs Prepaid for period
              - generic [ref=e255]:
                - list [ref=e257]:
                  - listitem [ref=e258]:
                    - img "COD legend icon" [ref=e259]
                    - generic [ref=e261]: COD
                  - listitem [ref=e262]:
                    - img "Prepaid legend icon" [ref=e263]
                    - generic [ref=e265]: Prepaid
                - application [ref=e266]
  - alert [ref=e276]
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
> 94  |   await expect(page.locator('[class*="animate-pulse"]')).toHaveCount(0, { timeout: 10_000 });
      |                                                          ^ Error: expect(locator).toHaveCount(expected) failed
  95  | });
  96  | 
  97  | test("health: alerts panel renders", async ({ page }) => {
  98  |   await page.goto("/dashboard/health");
  99  |   await expect(page.getByText("Alerts")).toBeVisible();
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