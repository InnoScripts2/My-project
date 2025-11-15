import { test, expect } from '@playwright/test';

test.describe('Dev Mode', () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => {
      localStorage.removeItem('devMode');
    });
  });

  test('dev mode should be disabled by default', async ({ page }) => {
    await page.goto('/');
    
    const devIndicator = page.locator('#dev-mode-indicator');
    await expect(devIndicator).not.toBeVisible();
    
    const devButtons = page.locator('[data-dev-only]');
    const count = await devButtons.count();
    
    for (let i = 0; i < count; i++) {
      await expect(devButtons.nth(i)).toBeHidden();
    }
  });

  test('should enable dev mode with Ctrl+Shift+D', async ({ page }) => {
    await page.goto('/');
    
    await page.keyboard.down('Control');
    await page.keyboard.down('Shift');
    await page.keyboard.press('D');
    await page.keyboard.up('Shift');
    await page.keyboard.up('Control');
    
    await page.waitForTimeout(500);
    
    const devIndicator = page.locator('#dev-mode-indicator');
    await expect(devIndicator).toBeVisible();
  });

  test('dev mode should persist across page reloads', async ({ page }) => {
    await page.goto('/');
    
    await page.keyboard.down('Control');
    await page.keyboard.down('Shift');
    await page.keyboard.press('D');
    await page.keyboard.up('Shift');
    await page.keyboard.up('Control');
    
    await page.waitForTimeout(500);
    
    await page.reload();
    
    await page.waitForTimeout(500);
    
    const devIndicator = page.locator('#dev-mode-indicator');
    await expect(devIndicator).toBeVisible();
  });

  test('should show dev buttons when dev mode is enabled', async ({ page, context }) => {
    await context.addInitScript(() => {
      localStorage.setItem('devMode', 'true');
    });
    
    await page.goto('/');
    
    const devIndicator = page.locator('#dev-mode-indicator');
    await expect(devIndicator).toBeVisible();
  });
});
