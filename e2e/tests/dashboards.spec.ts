import { test, expect } from "@playwright/test";
import { DASHBOARDS, BROKEN_MARKERS } from "../fixtures";

// Part B — Playwright QA: each dashboard loads, data renders, no broken state.
// Part C — Visual QA: full-page screenshot captured per dashboard (artifacts).
for (const d of DASHBOARDS) {
  test(`${d.name} loads, renders data, and is visually intact`, async ({ page }) => {
    const resp = await page.goto(d.path, { waitUntil: "networkidle" });

    // Page load status
    expect(resp?.status(), `${d.name} HTTP status`).toBeLessThan(400);

    // Data load: required KPI labels present
    for (const frag of d.mustContain) {
      await expect(page.getByText(frag, { exact: false }).first()).toBeVisible();
    }

    // No broken-render markers
    const body = await page.locator("body").innerText();
    for (const marker of BROKEN_MARKERS) {
      expect(body, `${d.name} should not show "${marker}"`).not.toContain(marker);
    }

    // Unexpected-zero guard: a dashboard full of "0" / "₹0" is suspicious
    const zeroHits = (body.match(/(?:^|\s)(?:₹\s?0|0)(?:\s|$)/g) ?? []).length;
    expect(zeroHits, `${d.name} has an implausible number of zero values`).toBeLessThan(30);

    // Visual QA artifact
    await page.screenshot({ path: `report/screots/${d.path.replace(/\W+/g, "_")}.png`, fullPage: true });
  });
}
