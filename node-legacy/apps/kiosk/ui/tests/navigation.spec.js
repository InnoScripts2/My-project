import { test, expect } from '@playwright/test';

test.describe('Navigation', () => {
  test('should show attract screen on load', async ({ page }) => {
    await page.goto('/');
    
    const attractScreen = page.locator('#screen-attract');
    await expect(attractScreen).toBeVisible();
    await expect(attractScreen).toHaveClass(/active/);
  });

  test('should navigate from attract to welcome on click', async ({ page }) => {
    await page.goto('/');
    
    await page.waitForTimeout(700);
    
    await page.click('body');
    
    const welcomeScreen = page.locator('#screen-welcome');
    await expect(welcomeScreen).toBeVisible();
  });

  test('should enable continue button when terms accepted', async ({ page }) => {
    await page.goto('/');
    await page.waitForTimeout(700);
    await page.click('body');
    
    const checkbox = page.locator('#welcome-agree');
    const continueButton = page.locator('#welcome-continue');
    
    await expect(continueButton).toBeDisabled();
    
    await checkbox.check();
    
    await expect(continueButton).toBeEnabled();
  });

  test('should navigate to services screen', async ({ page }) => {
    await page.goto('/');
    await page.waitForTimeout(700);
    await page.click('body');
    
    await page.locator('#welcome-agree').check();
    await page.locator('#welcome-continue').click();
    
    const servicesScreen = page.locator('#screen-services');
    await expect(servicesScreen).toBeVisible();
  });

  test('should allow service selection', async ({ page }) => {
    await page.goto('/');
    await page.waitForTimeout(700);
    await page.click('body');
    await page.locator('#welcome-agree').check();
    await page.locator('#welcome-continue').click();
    
    const diagnosticsCard = page.locator('[data-service="diagnostics"]');
    await diagnosticsCard.click();
    
    await expect(diagnosticsCard).toHaveClass(/selected/);
    
    const continueButton = page.locator('#service-continue');
    await expect(continueButton).toBeEnabled();
  });
});
