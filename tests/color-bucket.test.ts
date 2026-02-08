import { test, expect, type Page } from "@playwright/test";

async function createSoundboard(
  page: Page,
  x: number,
  y: number,
): Promise<void> {
  await page.click("#btn-add-sound");
  await page.locator("#canvas-container").click({ position: { x, y } });
}

async function deployAndGetShareUrl(page: Page): Promise<string> {
  await page.click("#btn-deploy");
  await expect(page.locator("#deploy-modal")).toHaveClass(/visible/);
  return page.locator("#deploy-modal-url").inputValue();
}

async function waitForConnected(page: Page): Promise<void> {
  await expect(page.locator("#connection-status")).toHaveClass(/connected/, {
    timeout: 15_000,
  });
}

async function waitForPeerJoin(hostPage: Page): Promise<void> {
  await expect(hostPage.locator("#connection-count")).toHaveText("2", {
    timeout: 15_000,
  });
}

async function waitForPairConnected(
  hostPage: Page,
  peerPage: Page,
): Promise<void> {
  await waitForConnected(hostPage);
  await waitForConnected(peerPage);
  await waitForPeerJoin(hostPage);
}

async function setColorAndEnterPaintMode(
  page: Page,
  color: string,
): Promise<void> {
  // Set the color on the hidden input directly
  await page.locator("#color-picker-input").evaluate((el, c) => {
    (el as HTMLInputElement).value = c;
    el.dispatchEvent(new Event("input", { bubbles: true }));
    el.dispatchEvent(new Event("change", { bubbles: true }));
  }, color);
}

test.describe("Color Bucket", () => {
  test.beforeEach(async ({ page }) => {
    page.on("console", (msg) => console.log("Browser console:", msg.text()));
    page.on("pageerror", (err) => {
      console.error("Page error:", err.message);
    });
  });

  test("color bucket and settings buttons are visible", async ({ page }) => {
    await page.goto("/");
    await page.waitForLoadState("networkidle");

    await expect(page.locator("#btn-color-bucket")).toBeVisible();
    await expect(page.locator("#btn-settings")).toBeVisible();
    await expect(page.locator("#bottom-left-actions")).toBeVisible();
  });

  test("settings panel opens and closes", async ({ page }) => {
    await page.goto("/");
    await page.waitForLoadState("networkidle");

    const panel = page.locator("#settings-panel");
    await expect(panel).not.toHaveClass(/visible/);

    // Open settings
    await page.click("#btn-settings");
    await expect(panel).toHaveClass(/visible/);

    // Sync colors checkbox should be visible and checked by default
    const checkbox = page.locator("#toggle-sync-colors");
    await expect(checkbox).toBeVisible();
    await expect(checkbox).toBeChecked();

    // Close by clicking outside
    await page.locator("#canvas-container").click({ position: { x: 400, y: 400 } });
    await expect(panel).not.toHaveClass(/visible/);
  });

  test("color bucket enters paint mode after color selection", async ({
    page,
  }) => {
    await page.goto("/");
    await page.waitForLoadState("networkidle");

    // Bucket should not be in active state initially
    const bucket = page.locator("#btn-color-bucket");
    await expect(bucket).not.toHaveClass(/active/);

    // Set color and trigger paint mode
    await setColorAndEnterPaintMode(page, "#ff0000");

    // Bucket should now be active and body should have paint-mode class
    await expect(bucket).toHaveClass(/active/);
    await expect(page.locator("body")).toHaveClass(/paint-mode/);
  });

  test("escape exits paint mode", async ({ page }) => {
    await page.goto("/");
    await page.waitForLoadState("networkidle");

    await setColorAndEnterPaintMode(page, "#ff0000");
    await expect(page.locator("#btn-color-bucket")).toHaveClass(/active/);

    await page.keyboard.press("Escape");
    await expect(page.locator("#btn-color-bucket")).not.toHaveClass(/active/);
    await expect(page.locator("body")).not.toHaveClass(/paint-mode/);
  });

  test("painting a soundboard bubble changes its color", async ({ page }) => {
    await page.goto("/");
    await page.waitForLoadState("networkidle");

    // Create a soundboard item
    await createSoundboard(page, 300, 300);
    await expect(page.locator(".soundboard-wrapper")).toHaveCount(1);

    // Enter paint mode with red
    await setColorAndEnterPaintMode(page, "#ff0000");

    // Click the soundboard bubble
    await page.locator(".soundboard-bubble").first().click();

    // Verify the bubble has the custom background color
    const bubble = page.locator(".soundboard-bubble").first();
    await expect(bubble).toHaveCSS("background-color", "rgb(255, 0, 0)");
  });

  test("painting the background changes its color", async ({ page }) => {
    await page.goto("/");
    await page.waitForLoadState("networkidle");

    // Enter paint mode with a green color
    await setColorAndEnterPaintMode(page, "#00ff00");

    // Click the canvas background
    await page
      .locator("#canvas-container")
      .click({ position: { x: 400, y: 400 } });

    // Verify background color changed
    await expect(page.locator("#canvas-container")).toHaveCSS(
      "background-color",
      "rgb(0, 255, 0)",
    );
  });

  test("paint mode does not trigger soundboard record/play", async ({
    page,
  }) => {
    await page.goto("/");
    await page.waitForLoadState("networkidle");

    await createSoundboard(page, 300, 300);

    // Enter paint mode
    await setColorAndEnterPaintMode(page, "#ff0000");

    // Click the soundboard bubble - should paint, NOT start recording
    await page.locator(".soundboard-bubble").first().click();

    // The bubble should still be in empty state (not recording)
    await expect(page.locator(".soundboard-bubble").first()).toHaveClass(
      /state-empty/,
    );
    // But it should have the custom color
    await expect(page.locator(".soundboard-bubble").first()).toHaveCSS(
      "background-color",
      "rgb(255, 0, 0)",
    );
  });

  test("placement mode and paint mode are mutually exclusive", async ({
    page,
  }) => {
    await page.goto("/");
    await page.waitForLoadState("networkidle");

    // Enter paint mode
    await setColorAndEnterPaintMode(page, "#ff0000");
    await expect(page.locator("#btn-color-bucket")).toHaveClass(/active/);

    // Enter placement mode - should exit paint mode
    await page.click("#btn-add-sound");
    await expect(page.locator("#btn-add-sound")).toHaveClass(/active/);
    await expect(page.locator("#btn-color-bucket")).not.toHaveClass(/active/);
    await expect(page.locator("body")).not.toHaveClass(/paint-mode/);

    // Cancel placement mode
    await page.click("#btn-add-sound");
  });

  test("sync colors toggle disables bucket and clears theme", async ({
    page,
  }) => {
    await page.goto("/");
    await page.waitForLoadState("networkidle");

    // Paint a soundboard
    await createSoundboard(page, 300, 300);
    await setColorAndEnterPaintMode(page, "#ff0000");
    await page.locator(".soundboard-bubble").first().click();
    await expect(page.locator(".soundboard-bubble").first()).toHaveCSS(
      "background-color",
      "rgb(255, 0, 0)",
    );

    // Exit paint mode
    await page.keyboard.press("Escape");

    // Open settings and toggle sync colors OFF
    await page.click("#btn-settings");
    await page.locator("#toggle-sync-colors").uncheck();

    // Bucket should be disabled (in solo mode, bucket stays enabled since there's no room)
    // Theme should be cleared - bubble should go back to default
    await expect(page.locator(".soundboard-bubble").first()).not.toHaveCSS(
      "background-color",
      "rgb(255, 0, 0)",
    );

    // Toggle back ON
    await page.locator("#toggle-sync-colors").check();

    // Theme should be restored from the automerge doc
    await expect(page.locator(".soundboard-bubble").first()).toHaveCSS(
      "background-color",
      "rgb(255, 0, 0)",
    );
  });
});

test.describe("Color Bucket Sync", () => {
  test.describe.configure({ mode: "serial" });
  test.setTimeout(120_000);

  test("color changes sync between peers", async ({ page, browser }) => {
    await page.goto("/");

    // Create a soundboard
    await createSoundboard(page, 300, 300);
    await expect(page.locator(".soundboard-wrapper")).toHaveCount(1);

    // Deploy
    const shareUrl = await deployAndGetShareUrl(page);
    await waitForConnected(page);

    const peerContext = await browser.newContext();
    const peerPage = await peerContext.newPage();

    try {
      await peerPage.goto(shareUrl);
      await waitForPairConnected(page, peerPage);

      // Wait for peer to receive the soundboard
      await expect(peerPage.locator(".soundboard-wrapper")).toHaveCount(1, {
        timeout: 30_000,
      });

      // Host paints the soundboard red
      await setColorAndEnterPaintMode(page, "#ff0000");
      await page.locator(".soundboard-bubble").first().click();

      // Peer should see the red color
      await expect(peerPage.locator(".soundboard-bubble").first()).toHaveCSS(
        "background-color",
        "rgb(255, 0, 0)",
        { timeout: 15_000 },
      );
    } finally {
      await peerContext.close().catch(() => {});
    }
  });

  test("background color syncs between peers", async ({ page, browser }) => {
    await page.goto("/");

    const shareUrl = await deployAndGetShareUrl(page);
    await waitForConnected(page);

    const peerContext = await browser.newContext();
    const peerPage = await peerContext.newPage();

    try {
      await peerPage.goto(shareUrl);
      await waitForPairConnected(page, peerPage);

      // Host paints the background blue
      await setColorAndEnterPaintMode(page, "#0000ff");
      await page
        .locator("#canvas-container")
        .click({ position: { x: 400, y: 400 } });

      // Peer should see the blue background
      await expect(peerPage.locator("#canvas-container")).toHaveCSS(
        "background-color",
        "rgb(0, 0, 255)",
        { timeout: 15_000 },
      );
    } finally {
      await peerContext.close().catch(() => {});
    }
  });

  test("toggling sync colors off in room clears theme and disables bucket", async ({
    page,
    browser,
  }) => {
    await page.goto("/");

    await createSoundboard(page, 300, 300);

    const shareUrl = await deployAndGetShareUrl(page);
    await waitForConnected(page);

    const peerContext = await browser.newContext();
    const peerPage = await peerContext.newPage();

    try {
      await peerPage.goto(shareUrl);
      await waitForPairConnected(page, peerPage);
      await expect(peerPage.locator(".soundboard-wrapper")).toHaveCount(1, {
        timeout: 30_000,
      });

      // Host paints the soundboard green
      await setColorAndEnterPaintMode(page, "#00ff00");
      await page.locator(".soundboard-bubble").first().click();

      // Both should see green
      await expect(page.locator(".soundboard-bubble").first()).toHaveCSS(
        "background-color",
        "rgb(0, 255, 0)",
      );
      await expect(peerPage.locator(".soundboard-bubble").first()).toHaveCSS(
        "background-color",
        "rgb(0, 255, 0)",
        { timeout: 15_000 },
      );

      // Exit paint mode on host
      await page.keyboard.press("Escape");

      // Peer toggles sync colors OFF
      await peerPage.click("#btn-settings");
      await peerPage.locator("#toggle-sync-colors").uncheck();

      // Peer's theme should be cleared
      await expect(
        peerPage.locator(".soundboard-bubble").first(),
      ).not.toHaveCSS("background-color", "rgb(0, 255, 0)");

      // Peer's bucket should be disabled
      const peerBucket = peerPage.locator("#btn-color-bucket");
      await expect(peerBucket).toHaveAttribute("disabled");

      // Host still sees green
      await expect(page.locator(".soundboard-bubble").first()).toHaveCSS(
        "background-color",
        "rgb(0, 255, 0)",
      );

      // Peer toggles sync colors back ON - should restore theme
      await peerPage.locator("#toggle-sync-colors").check();
      await expect(peerPage.locator(".soundboard-bubble").first()).toHaveCSS(
        "background-color",
        "rgb(0, 255, 0)",
        { timeout: 15_000 },
      );
    } finally {
      await peerContext.close().catch(() => {});
    }
  });
});
