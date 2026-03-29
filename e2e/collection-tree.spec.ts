import { test, expect } from "@playwright/test";

async function selectWorkspace(page: import("@playwright/test").Page) {
  await page.goto("/");
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await page.waitForLoadState("networkidle");

  // Wait for the workspace combobox to be visible
  const wsButton = page.getByRole("combobox");
  await wsButton.waitFor({ state: "visible", timeout: 15000 });
  await wsButton.click();
  await page.getByText("Demo Workspace").click();
  await page.waitForTimeout(400);
}

test.describe("Collection tree", () => {
  test("clicking a collection row expands the tree", async ({ page }) => {
    await selectWorkspace(page);

    // Initially the requests should not be visible
    await expect(page.locator("button").filter({ hasText: "List Pets" })).toHaveCount(0);

    // Click the collection row to expand
    await page.locator("text=Petstore API").first().click();
    await page.waitForTimeout(400);

    // Requests should now be visible
    await expect(page.locator("button").filter({ hasText: "List Pets" })).toBeVisible();
    await expect(page.locator("button").filter({ hasText: "Create Pet" })).toBeVisible();
  });

  test("clicking the chevron on an expanded collection collapses it", async ({ page }) => {
    await selectWorkspace(page);

    // First expand by clicking collection name
    await page.locator("text=Petstore API").first().click();
    await page.waitForTimeout(400);
    await expect(page.locator("button").filter({ hasText: "List Pets" })).toBeVisible();

    // Find the chevron button (first button in the collection row)
    // The collection row contains a chevron button as the first button element
    const collectionRows = page.locator("div").filter({ hasText: /^Petstore API$/ }).locator("button").first();
    await collectionRows.click();
    await page.waitForTimeout(300);

    // Requests should be hidden
    await expect(page.locator("button").filter({ hasText: "List Pets" })).toHaveCount(0);
  });

  test("clicking chevron again re-expands the collection", async ({ page }) => {
    await selectWorkspace(page);

    // Expand
    await page.locator("text=Petstore API").first().click();
    await page.waitForTimeout(400);

    // Collapse via chevron
    const chevron = page.locator("div").filter({ hasText: /^Petstore API$/ }).locator("button").first();
    await chevron.click();
    await page.waitForTimeout(300);
    await expect(page.locator("button").filter({ hasText: "List Pets" })).toHaveCount(0);

    // Re-expand via chevron
    await chevron.click();
    await page.waitForTimeout(400);
    await expect(page.locator("button").filter({ hasText: "List Pets" })).toBeVisible();
  });

  test("subfolder can be collapsed and re-expanded independently", async ({ page }) => {
    await selectWorkspace(page);

    // Clicking the parent collection expands it and also auto-expands subfolders
    await page.locator("text=Petstore API").first().click();
    await page.waitForTimeout(500);

    // Subfolder "Pets" and its requests should be visible (auto-expanded)
    const subfolderRow = page.locator("span").filter({ hasText: /^Pets$/ }).first();
    await expect(subfolderRow).toBeVisible();
    await expect(page.locator("button").filter({ hasText: "Get Pet" })).toBeVisible();

    // Collapse subfolder by clicking its row (the span text, not the chevron)
    await subfolderRow.click();
    await page.waitForTimeout(500);
    await expect(page.locator("button").filter({ hasText: "Get Pet" })).toHaveCount(0);

    // Parent requests still visible
    await expect(page.locator("button").filter({ hasText: "List Pets" })).toBeVisible();

    // Re-expand subfolder
    await subfolderRow.click();
    await page.waitForTimeout(400);
    await expect(page.locator("button").filter({ hasText: "Get Pet" })).toBeVisible();

    // Parent requests still visible
    await expect(page.locator("button").filter({ hasText: "List Pets" })).toBeVisible();
  });

  test("multiple root collections are visible", async ({ page }) => {
    await selectWorkspace(page);

    // Both root collections should be visible
    await expect(page.locator("text=Petstore API").first()).toBeVisible();
    await expect(page.locator("text=Weather API").first()).toBeVisible();
  });
});
