import { test, expect, type Page, type BrowserContext } from "@playwright/test";

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

async function waitForPairConnected(hostPage: Page, peerPage: Page): Promise<void> {
  await waitForConnected(hostPage);
  await waitForConnected(peerPage);
  await waitForPeerJoin(hostPage);
}

test.describe("Sync", () => {
  test.describe.configure({ mode: "serial" });
  test.setTimeout(120_000);

  test("joins deployed room and receives host state", async ({
    page,
    browser,
  }) => {
    await page.goto("/");

    await createSoundboard(page, 200, 200);
    await expect(page.locator(".soundboard-wrapper")).toHaveCount(1);

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

      await createSoundboard(page, 460, 220);
      await expect(page.locator(".soundboard-wrapper")).toHaveCount(2);
      await expect(peerPage.locator(".soundboard-wrapper")).toHaveCount(2, {
        timeout: 30_000,
      });
    } finally {
      await peerContext.close().catch(() => {});
    }
  });

  test("syncs soundboard name and filters between peers", async ({
    page,
    browser,
  }) => {
    await page.goto("/");

    const shareUrl = await deployAndGetShareUrl(page);
    await waitForConnected(page);

    const peerContext: BrowserContext = await browser.newContext();
    const peerPage = await peerContext.newPage();

    try {
      await peerPage.goto(shareUrl);
      await waitForPairConnected(page, peerPage);

      await createSoundboard(page, 220, 220);
      await expect(page.locator(".soundboard-wrapper")).toHaveCount(1, {
        timeout: 30_000,
      });
      await expect(peerPage.locator(".soundboard-wrapper")).toHaveCount(1, {
        timeout: 30_000,
      });

      const peerName = peerPage.locator(".soundboard-name").first();
      await peerName.dblclick();
      await peerPage.keyboard.press("ControlOrMeta+A");
      await peerPage.keyboard.type("Peer rename");
      await peerPage.keyboard.press("Enter");

      await expect(page.locator(".soundboard-name").first()).toHaveText(
        "Peer rename",
      );

      const hostReverbFilter = page
        .locator(".soundboard-wrapper")
        .first()
        .locator(".prop-filter")
        .nth(1);
      await hostReverbFilter.click();

      await expect(
        peerPage
          .locator(".soundboard-wrapper")
          .first()
          .locator(".prop-filter")
          .nth(1),
      ).toHaveClass(/active/);
    } finally {
      await peerContext.close().catch(() => {});
    }
  });
});
