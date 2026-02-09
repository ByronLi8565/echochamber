import { test, expect } from '@playwright/test';

test.describe('EchoChamber Soundboard', () => {
  test.beforeEach(async ({ page }) => {
    // Log console messages for debugging
    page.on('console', msg => console.log('Browser console:', msg.text()));
    page.on('pageerror', err => {
      console.error('Page error:', err.message);
      console.error('Stack:', err.stack);
    });
  });

  test('home page loads successfully', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    // Check that the main toolbar is present
    await expect(page.locator('#toolbar')).toBeVisible();

    // Check that all main buttons are present
    await expect(page.locator('#btn-add-sound')).toBeVisible();
    await expect(page.locator('#btn-add-text')).toBeVisible();
    await expect(page.locator('#btn-export')).toBeVisible();
    await expect(page.locator('#btn-import')).toBeVisible();

    // Check that the canvas container exists
    await expect(page.locator('#canvas-container')).toBeVisible();

    // canvas-world exists but has 0x0 size (infinite canvas design)
    await expect(page.locator('#canvas-world')).toBeAttached();

    // Settings menu entrypoint is present
    await expect(page.locator('#btn-settings')).toBeVisible();
    await expect(page.locator('#btn-zoom-in')).toBeVisible();
    await expect(page.locator('#btn-zoom-out')).toBeVisible();
    await expect(page.locator('#btn-link-mode')).toBeVisible();
  });

  test('creates a sound button when Add Sound is clicked and canvas is clicked', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    // Verify no soundboard items exist initially
    await expect(page.locator('.soundboard-wrapper')).toHaveCount(0);

    // Click the "Add Sound" button to enter placement mode
    const addSoundBtn = page.locator('#btn-add-sound');
    await addSoundBtn.click();

    // Wait a bit for the click to process
    await page.waitForTimeout(100);

    // Verify placement mode is active (button should have 'active' class)
    const btnClasses = await addSoundBtn.getAttribute('class');
    expect(btnClasses || '').toContain('active');

    // Verify container has 'placing' class
    const containerClasses = await page.locator('#canvas-container').getAttribute('class');
    expect(containerClasses).toContain('placing');

    // Click on the canvas container to place a sound button
    const container = page.locator('#canvas-container');
    await container.click({ position: { x: 200, y: 200 } });

    // Verify a soundboard item was created
    await expect(page.locator('.soundboard-wrapper')).toHaveCount(1);

    // Verify the soundboard has the expected structure
    const soundboard = page.locator('.soundboard-wrapper').first();
    await expect(soundboard.locator('.soundboard-bubble')).toBeVisible();
    await expect(soundboard.locator('.soundboard-name')).toBeVisible();
    await expect(soundboard.locator('.soundboard-props')).toBeVisible();

    // Verify it's in empty state initially
    const bubbleClasses = await soundboard.locator('.soundboard-bubble').getAttribute('class');
    expect(bubbleClasses).toContain('state-empty');
    await expect(soundboard.locator('.soundboard-status')).toHaveText('Record');

    // Verify placement mode is deactivated after placement
    const btnClassesAfter = await addSoundBtn.getAttribute('class');
    expect(btnClassesAfter).not.toContain('active');
    const containerClassesAfter = await page.locator('#canvas-container').getAttribute('class');
    expect(containerClassesAfter).not.toContain('placing');
  });

  test('creates multiple sound buttons', async ({ page }) => {
    await page.goto('/');

    const container = page.locator('#canvas-container');

    // Create first sound button
    await page.click('#btn-add-sound');
    await container.click({ position: { x: 100, y: 100 } });
    await expect(page.locator('.soundboard-wrapper')).toHaveCount(1);

    // Create second sound button
    await page.click('#btn-add-sound');
    await container.click({ position: { x: 300, y: 100 } });
    await expect(page.locator('.soundboard-wrapper')).toHaveCount(2);

    // Create third sound button (positioned far enough to not overlap existing items)
    await page.click('#btn-add-sound');
    await container.click({ position: { x: 500, y: 300 } });
    await expect(page.locator('.soundboard-wrapper')).toHaveCount(3);
  });

  test('soundboard has proper hotkey assigned', async ({ page }) => {
    await page.goto('/');

    const container = page.locator('#canvas-container');

    // Create a sound button
    await page.click('#btn-add-sound');
    await container.click({ position: { x: 200, y: 200 } });

    // Check that a hotkey was assigned
    const hotkeyBubble = page.locator('.soundboard-wrapper .prop-hotkey').first();
    await expect(hotkeyBubble).toBeVisible();

    // The hotkey should not be "—" (empty state)
    const hotkeyText = await hotkeyBubble.textContent();
    expect(hotkeyText).not.toBe('—');
    expect(hotkeyText).toMatch(/^[1-9A-Z]$/);
  });

  test('soundboard has settings bubble and panel controls', async ({ page }) => {
    await page.goto('/');

    const container = page.locator('#canvas-container');

    // Create a sound button
    await page.click('#btn-add-sound');
    await container.click({ position: { x: 200, y: 200 } });

    // Check that settings bubble is present
    const soundboard = page.locator('.soundboard-wrapper').first();
    const settingsBubble = soundboard.locator('.prop-settings');
    await expect(settingsBubble).toBeVisible();

    await settingsBubble.click();

    const panel = soundboard.locator('.soundboard-settings-panel');
    await expect(panel).toHaveClass(/visible/);
    await expect(panel.locator('input[data-setting="speedRate"]')).toBeVisible();
    await expect(panel.locator('input[data-setting="reverbIntensity"]')).toBeVisible();
    await expect(panel.locator('input[data-setting="reversed"]')).toBeVisible();
    await expect(panel.locator('input[data-setting="loopEnabled"]')).toBeVisible();
    await expect(panel.locator('input[data-setting="loopDelaySeconds"]')).toBeVisible();
    await expect(panel.locator('input[data-setting="repeatCount"]')).toBeVisible();
    await expect(panel.locator('input[data-setting="repeatDelaySeconds"]')).toBeVisible();
    await expect(panel.locator('[data-setting-value="speedRate"]')).toContainText('1.00x');
  });

  test('can toggle placement mode on/off', async ({ page }) => {
    await page.goto('/');

    const addSoundBtn = page.locator('#btn-add-sound');
    const container = page.locator('#canvas-container');

    // Enter placement mode
    await addSoundBtn.click();
    let btnClasses = await addSoundBtn.getAttribute('class');
    expect(btnClasses).toContain('active');
    let containerClasses = await container.getAttribute('class');
    expect(containerClasses).toContain('placing');

    // Exit placement mode by clicking the button again
    await addSoundBtn.click();
    btnClasses = await addSoundBtn.getAttribute('class');
    expect(btnClasses).not.toContain('active');
    containerClasses = await container.getAttribute('class');
    expect(containerClasses).not.toContain('placing');
  });

  test('soundboard has duplicate/delete/re-record controls, duplicate works, and delete removes the original', async ({ page }) => {
    await page.goto('/');

    const container = page.locator('#canvas-container');
    await page.click('#btn-add-sound');
    await container.click({ position: { x: 220, y: 220 } });

    const soundboard = page.locator('.soundboard-wrapper').first();
    const duplicateButton = soundboard.locator('.soundboard-action-duplicate');
    const reRecordButton = soundboard.locator('.soundboard-action-rerecord');
    const deleteButton = soundboard.locator('.soundboard-action-delete');

    await expect(duplicateButton).toBeVisible();
    await expect(reRecordButton).toBeVisible();
    await expect(deleteButton).toBeVisible();

    await duplicateButton.click();
    await expect(page.locator('.soundboard-wrapper')).toHaveCount(2);

    await reRecordButton.click();
    await expect(soundboard.locator('.soundboard-bubble')).toBeVisible();

    await deleteButton.click();
    await expect(page.locator('.soundboard-wrapper')).toHaveCount(1);
  });

  test('settings menu toggles and sync audio can be changed', async ({ page }) => {
    await page.goto('/');

    const gearButton = page.locator('#btn-settings');
    const panel = page.locator('#settings-panel');
    const syncAudioToggle = page.locator('#toggle-sync-audio');

    await expect(panel).not.toHaveClass(/visible/);

    await gearButton.click();
    await expect(panel).toHaveClass(/visible/);

    await expect(syncAudioToggle).not.toBeChecked();
    await syncAudioToggle.check();
    await expect(syncAudioToggle).toBeChecked();
    await syncAudioToggle.uncheck();
    await expect(syncAudioToggle).not.toBeChecked();

    await gearButton.click();
    await expect(panel).not.toHaveClass(/visible/);
  });
});
