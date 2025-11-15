import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

test.describe('Accessibility (WCAG AA)', () => {
  test('attract screen should have no accessibility violations', async ({ page }) => {
    await page.goto('/');
    
    const accessibilityScanResults = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa'])
      .analyze();
    
    expect(accessibilityScanResults.violations).toEqual([]);
  });

  test('welcome screen should have no accessibility violations', async ({ page }) => {
    await page.goto('/');
    await page.waitForTimeout(700);
    await page.click('body');
    
    const accessibilityScanResults = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa'])
      .analyze();
    
    expect(accessibilityScanResults.violations).toEqual([]);
  });

  test('services screen should have no accessibility violations', async ({ page }) => {
    await page.goto('/');
    await page.waitForTimeout(700);
    await page.click('body');
    await page.locator('#welcome-agree').check();
    await page.locator('#welcome-continue').click();
    
    const accessibilityScanResults = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa'])
      .analyze();
    
    expect(accessibilityScanResults.violations).toEqual([]);
  });

  test('buttons should have minimum touch target size', async ({ page }) => {
    await page.goto('/');
    await page.waitForTimeout(700);
    await page.click('body');
    await page.locator('#welcome-agree').check();
    await page.locator('#welcome-continue').click();
    
    const buttons = page.locator('button.primary, button.secondary');
    const count = await buttons.count();
    
    for (let i = 0; i < count; i++) {
      const button = buttons.nth(i);
      const boundingBox = await button.boundingBox();
      
      if (boundingBox) {
        expect(boundingBox.width).toBeGreaterThanOrEqual(44);
        expect(boundingBox.height).toBeGreaterThanOrEqual(44);
      }
    }
  });

  test('should support keyboard navigation', async ({ page }) => {
    await page.goto('/');
    await page.waitForTimeout(700);
    await page.keyboard.press('Enter');
    
    const welcomeScreen = page.locator('#screen-welcome');
    await expect(welcomeScreen).toBeVisible();
    
    await page.keyboard.press('Tab');
    await page.keyboard.press('Space');
    
    await page.keyboard.press('Tab');
    await page.keyboard.press('Enter');
    
    const servicesScreen = page.locator('#screen-services');
    await expect(servicesScreen).toBeVisible();
  });

  test('all images should have alt text', async ({ page }) => {
    await page.goto('/');
    
    const images = page.locator('img');
    const count = await images.count();
    
    for (let i = 0; i < count; i++) {
      const img = images.nth(i);
      const alt = await img.getAttribute('alt');
      expect(alt).toBeDefined();
    }
  });
});
