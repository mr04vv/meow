import { test, expect } from "@playwright/test";

// Helper: select the demo workspace and expand a collection by name
async function setupWorkspaceAndCollection(page: import("@playwright/test").Page, collectionName = "Petstore API") {
  await page.goto("/");
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await page.waitForLoadState("networkidle");

  // Select demo workspace
  const wsButton = page.getByRole("combobox");
  await wsButton.waitFor({ state: "visible", timeout: 15000 });
  await wsButton.click();
  await page.getByText("Demo Workspace").click();
  await page.waitForTimeout(400);

  // Click the collection row to expand it and open CollectionView
  const collectionRow = page.locator("text=" + collectionName).first();
  await collectionRow.waitFor({ state: "visible", timeout: 10000 });
  await collectionRow.click();
  await page.waitForTimeout(500);
}

// TabBar is the strip below the header that contains tab items and the "+" button
// It has class "flex items-center border-b bg-muted/10 overflow-x-auto shrink-0"
const TAB_BAR_SELECTOR = "div.overflow-x-auto.shrink-0";

test.describe("Tab management", () => {
  test("clicking an endpoint opens a preview tab (italic)", async ({ page }) => {
    await setupWorkspaceAndCollection(page);

    // Click "List Pets" request in the sidebar
    const requestItem = page.locator("button").filter({ hasText: "List Pets" });
    await requestItem.click();
    await page.waitForTimeout(400);

    // Check italic (preview) styling — the span should have skewX transform
    const previewSpan = page.locator("span[style*='skewX']");
    await expect(previewSpan).toBeVisible();
    await expect(previewSpan).toContainText("List Pets");
  });

  test("clicking another endpoint replaces the preview tab", async ({ page }) => {
    await setupWorkspaceAndCollection(page);

    // Click first request
    await page.locator("button").filter({ hasText: "List Pets" }).click();
    await page.waitForTimeout(200);

    // Tab should show List Pets as preview (italic)
    await expect(page.locator("span[style*='skewX']")).toContainText("List Pets");

    // Click second request
    await page.locator("button").filter({ hasText: "Create Pet" }).click();
    await page.waitForTimeout(200);

    // Preview tab should now show Create Pet (replaced)
    await expect(page.locator("span[style*='skewX']")).toContainText("Create Pet");

    // Only one preview tab should exist
    await expect(page.locator("span[style*='skewX']")).toHaveCount(1);
  });

  test("editing the URL pins the tab (removes italic)", async ({ page }) => {
    await setupWorkspaceAndCollection(page);

    await page.locator("button").filter({ hasText: "List Pets" }).click();
    await page.waitForTimeout(200);

    // Should be italic/preview
    await expect(page.locator("span[style*='skewX']")).toBeVisible();

    // Edit the URL in the request editor — find the URL input
    const urlInput = page.locator("input").filter({ hasValue: /petstore/ }).first();
    await urlInput.click();
    await urlInput.fill("https://petstore.example.com/pets?limit=10");
    await page.keyboard.press("Tab");
    await page.waitForTimeout(300);

    // Tab should no longer be italic (pinned)
    await expect(page.locator("span[style*='skewX']")).toHaveCount(0);
  });

  test("pinned tab survives opening another preview", async ({ page }) => {
    await setupWorkspaceAndCollection(page);

    // Open List Pets as preview
    await page.locator("button").filter({ hasText: "List Pets" }).click();
    await page.waitForTimeout(200);

    // Pin it by double-clicking the tab (the row div containing the tab)
    // TabBar renders tabs as divs with onClick for single-click and onDoubleClick for pin
    const previewTabDiv = page.locator(TAB_BAR_SELECTOR).locator("div").filter({ hasText: "List Pets" }).first();
    await previewTabDiv.dblclick();
    await page.waitForTimeout(200);

    // Should be pinned now (no italic)
    await expect(page.locator("span[style*='skewX']")).toHaveCount(0);

    // Open Create Pet as new preview
    await page.locator("button").filter({ hasText: "Create Pet" }).click();
    await page.waitForTimeout(200);

    // Both "List Pets" (pinned) and "Create Pet" (preview) tabs should exist
    const tabBar = page.locator(TAB_BAR_SELECTOR);
    await expect(tabBar).toContainText("List Pets");
    await expect(tabBar).toContainText("Create Pet");

    // Create Pet should be italic (preview)
    await expect(page.locator("span[style*='skewX']")).toContainText("Create Pet");
  });

  test("Cmd+S pins the tab", async ({ page }) => {
    await setupWorkspaceAndCollection(page);

    await page.locator("button").filter({ hasText: "List Pets" }).click();
    await page.waitForTimeout(200);

    // Should be italic/preview
    await expect(page.locator("span[style*='skewX']")).toBeVisible();

    // Focus the page body to ensure keyboard events are received
    await page.locator("body").click();
    await page.waitForTimeout(100);

    // Press Cmd+S (lowercase s, as the handler checks e.key === "s")
    await page.keyboard.press("Meta+s");
    await page.waitForTimeout(800);

    // Tab should be pinned (no italic)
    await expect(page.locator("span[style*='skewX']")).toHaveCount(0);
  });
});
