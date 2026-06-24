import { defineConfig, devices } from "@playwright/test";

// BASE_URL: deployed app URL (e.g. https://kirgodashboard-kirgo.vercel.app)
// VERCEL_AUTOMATION_BYPASS_SECRET: Vercel Protection-Bypass token (Project →
//   Settings → Deployment Protection → Protection Bypass for Automation)
const BASE_URL = process.env.BASE_URL ?? "http://localhost:3000";
const bypass = process.env.VERCEL_AUTOMATION_BYPASS_SECRET;

export default defineConfig({
  testDir: "./tests",
  timeout: 60_000,
  expect: { timeout: 15_000 },
  retries: 1,
  reporter: [["html", { outputFolder: "report", open: "never" }], ["list"]],
  use: {
    baseURL: BASE_URL,
    screenshot: "on",
    trace: "retain-on-failure",
    // Bypass Vercel Deployment Protection for automation
    extraHTTPHeaders: bypass ? { "x-vercel-protection-bypass": bypass, "x-vercel-set-bypass-cookie": "true" } : {},
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
});
