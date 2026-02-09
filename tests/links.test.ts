import { test, expect, type Locator, type Page } from "@playwright/test";

async function createSoundboard(page: Page, x: number, y: number): Promise<void> {
  await page.click("#btn-add-sound");
  await page.locator("#canvas-container").click({ position: { x, y } });
}

async function enterLinkMode(page: Page): Promise<void> {
  await page.click("#btn-link-mode");
  await expect(page.locator("#btn-link-mode")).toHaveClass(/active/);
  await expect(page.locator("body")).toHaveClass(/link-mode/);
}

async function setColorAndEnterPaintMode(page: Page, color: string): Promise<void> {
  await page.locator("#color-picker-input").evaluate((el, c) => {
    (el as HTMLInputElement).value = c;
    el.dispatchEvent(new Event("input", { bubbles: true }));
    el.dispatchEvent(new Event("change", { bubbles: true }));
  }, color);
}

async function getLineRgbTriples(
  page: Page,
): Promise<Array<{ r: number; g: number; b: number }>> {
  const strokeColors = await page
    .locator("#link-overlay line")
    .evaluateAll((lines) => lines.map((line) => line.getAttribute("stroke")));

  return strokeColors
    .map((stroke) => {
      const match = stroke?.match(/^rgb\((\d+),\s*(\d+),\s*(\d+)\)$/);
      if (!match) return null;
      return {
        r: Number(match[1]),
        g: Number(match[2]),
        b: Number(match[3]),
      };
    })
    .filter((value): value is { r: number; g: number; b: number } => value !== null);
}

async function setRangeInputValue(locator: Locator, value: string): Promise<void> {
  await locator.evaluate((el, nextValue) => {
    const input = el as HTMLInputElement;
    input.value = nextValue;
    input.dispatchEvent(new Event("input", { bubbles: true }));
    input.dispatchEvent(new Event("change", { bubbles: true }));
  }, value);
}

test.describe("Links", () => {
  test("link mode toggles from the new tool button", async ({ page }) => {
    await page.goto("/");
    await page.waitForLoadState("networkidle");

    const button = page.locator("#btn-link-mode");
    await expect(button).toBeVisible();
    await expect(button).not.toHaveClass(/active/);

    await enterLinkMode(page);
    await page.keyboard.press("Escape");

    await expect(button).not.toHaveClass(/active/);
    await expect(page.locator("body")).not.toHaveClass(/link-mode/);
  });

  test("clicking a linked pair again removes the link", async ({ page }) => {
    await page.goto("/");
    await page.waitForLoadState("networkidle");

    await createSoundboard(page, 220, 220);
    await createSoundboard(page, 520, 220);
    const bubbles = page.locator(".soundboard-bubble");
    await expect(bubbles).toHaveCount(2);

    await enterLinkMode(page);
    await bubbles.nth(0).click();
    await bubbles.nth(1).click();
    await expect(page.locator("#link-overlay line")).toHaveCount(2);
    await expect(page.locator("#btn-link-mode")).not.toHaveClass(/active/);

    await enterLinkMode(page);
    await bubbles.nth(0).click();
    await bubbles.nth(1).click();
    await expect(page.locator("#link-overlay line")).toHaveCount(0);
    await expect(page.locator("#btn-link-mode")).not.toHaveClass(/active/);
  });

  test("link lines use half of each linked bubble color", async ({ page }) => {
    await page.goto("/");
    await page.waitForLoadState("networkidle");

    await createSoundboard(page, 260, 260);
    await createSoundboard(page, 560, 260);

    await setColorAndEnterPaintMode(page, "#ff0000");
    await page.locator(".soundboard-bubble").nth(0).click();
    await setColorAndEnterPaintMode(page, "#0000ff");
    await page.locator(".soundboard-bubble").nth(1).click();
    await page.keyboard.press("Escape");

    await enterLinkMode(page);
    await page.locator(".soundboard-bubble").nth(0).click();
    await page.locator(".soundboard-bubble").nth(1).click();
    await expect(page.locator("#link-overlay line")).toHaveCount(2);

    const rgbValues = await getLineRgbTriples(page);

    expect(
      rgbValues.some((rgb) => rgb.r > rgb.g && rgb.r > rgb.b),
    ).toBeTruthy();
    expect(
      rgbValues.some((rgb) => rgb.b > rgb.r && rgb.b > rgb.g),
    ).toBeTruthy();
  });

  test("link mode click does not start recording", async ({ page }) => {
    await page.goto("/");
    await page.waitForLoadState("networkidle");

    await createSoundboard(page, 260, 260);
    const bubble = page.locator(".soundboard-bubble").first();
    await expect(bubble).toHaveClass(/state-empty/);

    await enterLinkMode(page);
    await bubble.click();

    await expect(bubble).toHaveClass(/state-empty/);
  });

  test("link lines anchor to bubble boundaries and move during drag", async ({
    page,
  }) => {
    await page.goto("/");
    await page.waitForLoadState("networkidle");

    await createSoundboard(page, 260, 260);
    await createSoundboard(page, 560, 260);
    await enterLinkMode(page);
    await page.locator(".soundboard-bubble").nth(0).click();
    await page.locator(".soundboard-bubble").nth(1).click();
    await expect(page.locator("#link-overlay line")).toHaveCount(2);

    const geometryBefore = await page.evaluate(() => {
      const container = document.getElementById("canvas-container")!;
      const containerRect = container.getBoundingClientRect();
      const bubble = document.querySelector(".soundboard-bubble") as HTMLElement;
      const bubbleRect = bubble.getBoundingClientRect();
      const cx = bubbleRect.left + bubbleRect.width / 2 - containerRect.left;
      const cy = bubbleRect.top + bubbleRect.height / 2 - containerRect.top;
      const radius = Math.min(bubbleRect.width, bubbleRect.height) / 2;
      const firstLine = document.querySelector("#link-overlay line") as SVGLineElement;
      return {
        cx,
        cy,
        radius,
        x1: Number(firstLine.getAttribute("x1") || 0),
        y1: Number(firstLine.getAttribute("y1") || 0),
      };
    });

    const distanceFromCenter = Math.hypot(
      geometryBefore.x1 - geometryBefore.cx,
      geometryBefore.y1 - geometryBefore.cy,
    );
    expect(Math.abs(distanceFromCenter - geometryBefore.radius)).toBeLessThan(4);

    const firstBubble = page.locator(".soundboard-bubble").first();
    const box = await firstBubble.boundingBox();
    expect(box).not.toBeNull();
    const startX = box!.x + box!.width / 2;
    const startY = box!.y + box!.height / 2;

    await page.mouse.move(startX, startY);
    await page.mouse.down();
    await page.mouse.move(startX + 120, startY + 40, { steps: 8 });

    await expect
      .poll(
        async () =>
          page.evaluate(() => {
            const firstLine = document.querySelector(
              "#link-overlay line",
            ) as SVGLineElement;
            return {
              x1: Number(firstLine.getAttribute("x1") || 0),
              y1: Number(firstLine.getAttribute("y1") || 0),
            };
          }),
        { timeout: 1000 },
      )
      .not.toEqual({ x1: geometryBefore.x1, y1: geometryBefore.y1 });

    await page.mouse.up();
  });

  test("repainting a linked bubble updates link colors immediately", async ({
    page,
  }) => {
    await page.goto("/");
    await page.waitForLoadState("networkidle");

    await createSoundboard(page, 260, 260);
    await createSoundboard(page, 560, 260);
    await enterLinkMode(page);
    await page.locator(".soundboard-bubble").nth(0).click();
    await page.locator(".soundboard-bubble").nth(1).click();
    await expect(page.locator("#link-overlay line")).toHaveCount(2);

    await setColorAndEnterPaintMode(page, "#ff0000");
    await page.locator(".soundboard-bubble").nth(0).click();
    await setColorAndEnterPaintMode(page, "#0000ff");
    await page.locator(".soundboard-bubble").nth(1).click();

    const initialColors = await getLineRgbTriples(page);

    await setColorAndEnterPaintMode(page, "#00ff00");
    await page.locator(".soundboard-bubble").nth(0).click();

    await expect
      .poll(async () => {
        const colors = await getLineRgbTriples(page);
        const changed =
          JSON.stringify(colors) !== JSON.stringify(initialColors);
        const hasGreen = colors.some((rgb) => rgb.g > rgb.r && rgb.g > rgb.b);
        const hasBlue = colors.some((rgb) => rgb.b > rgb.r && rgb.b > rgb.g);
        return changed && hasGreen && hasBlue;
      }, { timeout: 1000 })
      .toBe(true);
  });

  test("loop and repeat settings propagate to linked bubbles", async ({
    page,
  }) => {
    await page.goto("/");
    await page.waitForLoadState("networkidle");

    await createSoundboard(page, 260, 260);
    await createSoundboard(page, 560, 260);
    await enterLinkMode(page);
    await page.locator(".soundboard-bubble").nth(0).click();
    await page.locator(".soundboard-bubble").nth(1).click();

    const firstBoard = page.locator(".soundboard-wrapper").nth(0);
    const secondBoard = page.locator(".soundboard-wrapper").nth(1);
    await firstBoard.locator(".prop-settings").click();

    const firstPanel = firstBoard.locator(".soundboard-settings-panel");
    const secondPanel = secondBoard.locator(".soundboard-settings-panel");

    await firstPanel.locator('input[data-setting="loopEnabled"]').check();
    await expect(secondPanel.locator('input[data-setting="loopEnabled"]')).toBeChecked();

    await setRangeInputValue(
      firstPanel.locator('input[data-setting="loopDelaySeconds"]'),
      "1.7",
    );
    await expect(
      secondPanel.locator('input[data-setting="loopDelaySeconds"]'),
    ).toHaveValue("1.7");

    await setRangeInputValue(
      firstPanel.locator('input[data-setting="repeatCount"]'),
      "4",
    );
    await expect(secondPanel.locator('input[data-setting="repeatCount"]')).toHaveValue("4");

    await setRangeInputValue(
      firstPanel.locator('input[data-setting="repeatDelaySeconds"]'),
      "0.8",
    );
    await expect(
      secondPanel.locator('input[data-setting="repeatDelaySeconds"]'),
    ).toHaveValue("0.8");
  });

});
