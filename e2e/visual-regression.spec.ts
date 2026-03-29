import { test, expect } from "@playwright/test";

async function selectWorkspace(page: import("@playwright/test").Page) {
  await page.goto("/");
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await page.waitForLoadState("networkidle");

  const wsButton = page.getByRole("combobox");
  await wsButton.waitFor({ state: "visible", timeout: 15000 });
  await wsButton.click();
  await page.getByText("Demo Workspace").click();
  await page.waitForTimeout(400);
}

test.describe("Visual regression", () => {
  test("main screen with workspace selected", async ({ page }) => {
    await selectWorkspace(page);
    await expect(page).toHaveScreenshot("main-screen.png", { maxDiffPixels: 100 });
  });

  test("collection settings view", async ({ page }) => {
    await selectWorkspace(page);

    // Click collection to open CollectionView
    await page.locator("text=Petstore API").first().click();
    await page.waitForTimeout(400);

    await expect(page).toHaveScreenshot("collection-settings.png", { maxDiffPixels: 100 });
  });

  test("request editor with request loaded", async ({ page }) => {
    await selectWorkspace(page);

    // Expand collection and click a request
    await page.locator("text=Petstore API").first().click();
    await page.waitForTimeout(400);

    await page.locator("button").filter({ hasText: "List Pets" }).click();
    await page.waitForTimeout(400);

    await expect(page).toHaveScreenshot("request-editor.png", { maxDiffPixels: 100 });
  });
});
