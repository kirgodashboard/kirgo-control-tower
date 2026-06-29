import { test, expect } from "@playwright/test";

// All routes that must load without crash or 404
const ROUTES = [
  // Dashboards
  { path: "/dashboard",                   label: "Command Center" },
  { path: "/dashboard/executive",         label: "Executive" },
  { path: "/dashboard/customers",         label: "Customers" },
  { path: "/dashboard/operations",        label: "Operations" },
  { path: "/dashboard/finance",           label: "Finance" },
  { path: "/dashboard/forecasting",       label: "Forecasting" },
  { path: "/dashboard/profitability",     label: "Profitability" },
  // Transactions
  { path: "/dashboard/sales-register",    label: "Sales Register" },
  { path: "/dashboard/logistics",         label: "Logistics Register" },
  { path: "/dashboard/customer-register", label: "Customer Register" },
  { path: "/dashboard/purchases",         label: "Purchases" },
  // Inventory
  { path: "/dashboard/inventory",         label: "Inventory" },
  // Finance & Bank
  { path: "/dashboard/bank",              label: "Bank Feed" },
  { path: "/dashboard/receipts",          label: "Receipts" },
  { path: "/dashboard/payments",          label: "Payments" },
  { path: "/dashboard/expenses",          label: "Expenses" },
  { path: "/dashboard/receivables",       label: "Receivables" },
  // Administration
  { path: "/dashboard/health",            label: "Health & Alerts" },
  { path: "/dashboard/metric-catalog",    label: "Metric Catalog" },
  { path: "/dashboard/import-center",     label: "Import Center" },
  // Settings
  { path: "/settings/company",            label: "Company Settings" },
  { path: "/settings/bank-feeds",         label: "Bank Feed Settings" },
];

// Routes that should redirect (not 404)
const REDIRECT_ROUTES = [
  { path: "/dashboard/customer-intelligence", redirectsTo: "/dashboard/customers" },
  { path: "/dashboard/data-audit",            redirectsTo: "/dashboard/health" },
  { path: "/dashboard/system-health",         redirectsTo: "/dashboard/health" },
  { path: "/dashboard/system-audit-center",   redirectsTo: "/dashboard/health" },
  { path: "/dashboard/bank-classification",   redirectsTo: "/dashboard/bank" },
  { path: "/dashboard/expense-entry",         redirectsTo: "/dashboard/expenses" },
  { path: "/dashboard/order-classification",  redirectsTo: "/dashboard/sales-register" },
  { path: "/dashboard/expenses-register",     redirectsTo: "/dashboard/expenses" },
];

for (const route of ROUTES) {
  test(`route: ${route.path} — loads without error`, async ({ page }) => {
    const errors: string[] = [];
    page.on("console", (msg) => {
      if (msg.type() === "error") errors.push(msg.text());
    });

    const response = await page.goto(route.path);
    expect(response?.status(), `${route.path} returned non-200`).not.toBe(404);
    expect(response?.status(), `${route.path} returned 500`).not.toBe(500);

    // Page should not show a Next.js error overlay
    await expect(page.locator("body")).not.toContainText("Application error");
    await expect(page.locator("body")).not.toContainText("This page could not be found");

    // Sidebar should be present
    await expect(page.locator("aside")).toBeVisible();
  });
}

for (const route of REDIRECT_ROUTES) {
  test(`redirect: ${route.path} → ${route.redirectsTo}`, async ({ page }) => {
    await page.goto(route.path);
    await expect(page).toHaveURL(new RegExp(route.redirectsTo));
  });
}

test("sidebar: all groups render", async ({ page }) => {
  await page.goto("/dashboard");
  await expect(page.getByText("Dashboards")).toBeVisible();
  await expect(page.getByText("Transactions")).toBeVisible();
  await expect(page.getByText("Finance & Bank")).toBeVisible();
  await expect(page.getByText("Administration")).toBeVisible();
});

test("sidebar: active route auto-expands group", async ({ page }) => {
  await page.goto("/dashboard/health");
  // Administration group should be open and Health & Alerts highlighted
  await expect(page.getByRole("link", { name: "Health & Alerts" })).toBeVisible();
});

test("executive: KPI cards render with data", async ({ page }) => {
  await page.goto("/dashboard/executive");
  // Wait for loading to settle
  await page.waitForTimeout(3000);
  // Should not show skeleton/loading indefinitely
  await expect(page.locator('[class*="animate-pulse"]')).toHaveCount(0, { timeout: 10_000 });
});

test("health: alerts panel renders", async ({ page }) => {
  await page.goto("/dashboard/health");
  await expect(page.getByText("Alerts")).toBeVisible();
  await expect(page.getByText("Integrations")).toBeVisible();
  await expect(page.getByText("KPI Integrity Check")).toBeVisible();
});

test("sales-register: export buttons present", async ({ page }) => {
  await page.goto("/dashboard/sales-register");
  await expect(page.getByText("CSV")).toBeVisible();
  await expect(page.getByText("Excel")).toBeVisible();
});

test("metric-catalog: shows metrics (not empty)", async ({ page }) => {
  await page.goto("/dashboard/metric-catalog");
  await page.waitForTimeout(2000);
  await expect(page.getByText("No metrics match")).not.toBeVisible();
});
