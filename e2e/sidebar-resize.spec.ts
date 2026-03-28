import { test, expect } from "@playwright/test";

test.describe("Sidebar resize", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/");
    // Clear any stored panel sizes
    await page.evaluate(() => localStorage.clear());
    await page.reload();
    await page.waitForTimeout(1000);
  });

  test("debug: inspect panel CSS", async ({ page }) => {
    const panelStyles = await page.evaluate(() => {
      const panels = document.querySelectorAll('[data-slot="resizable-panel"]');
      return Array.from(panels).map((p, i) => {
        const el = p as HTMLElement;
        const style = window.getComputedStyle(el);
        return {
          index: i,
          id: el.id,
          style_attr: el.getAttribute("style"),
          classes: el.className,
          display: style.display,
          flex: style.flex,
          flexBasis: style.flexBasis,
          flexGrow: style.flexGrow,
          flexShrink: style.flexShrink,
          width: style.width,
          minWidth: style.minWidth,
          maxWidth: style.maxWidth,
          overflow: style.overflow,
          offsetWidth: el.offsetWidth,
        };
      });
    });

    for (const p of panelStyles) {
      console.log(`Panel ${p.index}:`, JSON.stringify(p, null, 2));
    }

    expect(panelStyles.length).toBeGreaterThan(0);
  });

  test("sidebar can be made wider by dragging the handle to the right", async ({
    page,
  }) => {
    await page.waitForSelector('[data-slot="resizable-handle"]');

    const sidebarHandle = page.locator('[data-slot="resizable-handle"]').first();
    const sidebarPanel = page.locator('[data-slot="resizable-panel"]').first();

    const initialBox = await sidebarPanel.boundingBox();
    expect(initialBox).not.toBeNull();
    const initialWidth = initialBox!.width;

    const handleBox = await sidebarHandle.boundingBox();
    expect(handleBox).not.toBeNull();

    const startX = handleBox!.x + handleBox!.width / 2;
    const startY = handleBox!.y + handleBox!.height / 2;

    await page.mouse.move(startX, startY);
    await page.mouse.down();
    for (let i = 1; i <= 20; i++) {
      await page.mouse.move(startX + i * 10, startY);
      await page.waitForTimeout(16);
    }
    await page.mouse.up();
    await page.waitForTimeout(300);

    const newBox = await sidebarPanel.boundingBox();
    expect(newBox).not.toBeNull();
    console.log(`Widen: ${initialWidth} -> ${newBox!.width}`);

    expect(newBox!.width).toBeGreaterThan(initialWidth + 50);
  });

  test("sidebar can be made narrower by dragging the handle to the left", async ({
    page,
  }) => {
    await page.waitForSelector('[data-slot="resizable-handle"]');

    const sidebarHandle = page.locator('[data-slot="resizable-handle"]').first();
    const sidebarPanel = page.locator('[data-slot="resizable-panel"]').first();

    const initialBox = await sidebarPanel.boundingBox();
    expect(initialBox).not.toBeNull();
    const initialWidth = initialBox!.width;

    const handleBox = await sidebarHandle.boundingBox();
    expect(handleBox).not.toBeNull();

    const startX = handleBox!.x + handleBox!.width / 2;
    const startY = handleBox!.y + handleBox!.height / 2;

    await page.mouse.move(startX, startY);
    await page.mouse.down();
    for (let i = 1; i <= 10; i++) {
      await page.mouse.move(startX - i * 5, startY);
      await page.waitForTimeout(16);
    }
    await page.mouse.up();
    await page.waitForTimeout(300);

    const newBox = await sidebarPanel.boundingBox();
    expect(newBox).not.toBeNull();
    console.log(`Shrink: ${initialWidth} -> ${newBox!.width}`);

    expect(newBox!.width).toBeLessThan(initialWidth);
  });
});
