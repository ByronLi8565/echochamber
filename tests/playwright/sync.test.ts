import { test, expect, type Page, type BrowserContext } from "@playwright/test";

const PEER_SYNC_TIMEOUT_MS = 60_000;
const CONNECT_TIMEOUT_MS = 15_000;

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
    timeout: CONNECT_TIMEOUT_MS,
  });
}

async function waitForPeerJoin(hostPage: Page): Promise<void> {
  await expect(hostPage.locator("#connection-count")).toHaveText("2", {
    timeout: CONNECT_TIMEOUT_MS,
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

async function waitForSoundboardCount(
  page: Page,
  count: number,
  timeout: number = PEER_SYNC_TIMEOUT_MS,
): Promise<void> {
  await expect(page.locator(".soundboard-wrapper")).toHaveCount(count, {
    timeout,
  });
}

async function gotoWithRetry(
  page: Page,
  url: string,
  maxAttempts = 3,
): Promise<void> {
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      await page.goto(url);
      return;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      const shouldRetry = message.includes("ERR_CONNECTION_REFUSED");
      const isLastAttempt = attempt === maxAttempts;

      if (!shouldRetry || isLastAttempt) {
        throw error;
      }

      await page.waitForTimeout(300 * attempt);
    }
  }
}

test.describe("Sync", () => {
  test.describe.configure({ mode: "serial" });
  test.setTimeout(120_000);

  test("joins deployed room and receives host state", async ({
    page,
    browser,
  }) => {
    await gotoWithRetry(page, "/");

    const shareUrl = await deployAndGetShareUrl(page);
    await waitForConnected(page);

    const peerContext = await browser.newContext();
    const peerPage = await peerContext.newPage();

    try {
      await gotoWithRetry(peerPage, shareUrl);
      await waitForPairConnected(page, peerPage);

      // Host changes should appear on joining peer.
      await createSoundboard(page, 200, 200);
      await createSoundboard(page, 460, 220);
      await waitForSoundboardCount(page, 2);
      await waitForSoundboardCount(peerPage, 2);
    } finally {
      await peerContext.close().catch(() => {});
    }
  });

  test("syncs soundboard name and settings between peers", async ({
    page,
    browser,
  }) => {
    await gotoWithRetry(page, "/");

    const shareUrl = await deployAndGetShareUrl(page);
    await waitForConnected(page);

    const peerContext: BrowserContext = await browser.newContext();
    const peerPage = await peerContext.newPage();

    try {
      await gotoWithRetry(peerPage, shareUrl);
      await waitForPairConnected(page, peerPage);

      await createSoundboard(page, 220, 220);
      await waitForSoundboardCount(page, 1);
      await waitForSoundboardCount(peerPage, 1);

      const peerName = peerPage.locator(".soundboard-name").first();
      await peerName.dblclick();
      await peerPage.keyboard.press("ControlOrMeta+A");
      await peerPage.keyboard.type("Peer rename");
      await peerPage.keyboard.press("Enter");

      await expect(page.locator(".soundboard-name").first()).toHaveText(
        "Peer rename",
        { timeout: PEER_SYNC_TIMEOUT_MS },
      );

      const hostBoard = page.locator(".soundboard-wrapper").first();
      await hostBoard.locator(".prop-settings").click();
      await hostBoard
        .locator('.soundboard-settings-panel input[data-setting="reversed"]')
        .check();

      const peerBoard = peerPage.locator(".soundboard-wrapper").first();
      await peerBoard.locator(".prop-settings").click();
      await expect(
        peerBoard.locator(
          '.soundboard-settings-panel input[data-setting="reversed"]',
        ),
      ).toBeChecked({ timeout: PEER_SYNC_TIMEOUT_MS });
    } finally {
      await peerContext.close().catch(() => {});
    }
  });
});
