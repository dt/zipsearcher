import { test, expect } from '@playwright/test';
import * as path from 'path';

test.describe('ZipBrowse Basic Tests', () => {
  test('should load and display debug.zip contents', async ({ page }) => {
    // Navigate to the app
    await page.goto('/');

    // Verify the drop zone is visible
    await expect(page.locator('.drop-zone')).toBeVisible();
    await expect(page.locator('text=Drop debug.zip here')).toBeVisible();

    // Upload the debug.zip file
    const fileInput = page.locator('input[type="file"]');
    const debugZipPath = path.join(process.cwd(), 'debug.zip');
    await fileInput.setInputFiles(debugZipPath);

    // Wait for file processing
    await page.waitForTimeout(2000);

    // Verify the file tree is shown
    await expect(page.locator('.file-tree')).toBeVisible();

    // Check that some expected system files are visible
    await expect(page.locator('text=system.jobs.txt')).toBeVisible();

    // Click on a file to open it
    await page.locator('text=system.jobs.txt').click();

    // Verify the file viewer opens
    await expect(page.locator('.file-viewer')).toBeVisible();

    // Verify content is displayed (should not be loading)
    await expect(page.locator('.file-content')).toBeVisible();

    // Verify we can see some content
    const content = await page.locator('.file-content').textContent();
    expect(content).toBeTruthy();
    expect(content?.length).toBeGreaterThan(0);
  });

  test('should handle tab switching efficiently', async ({ page }) => {
    // Navigate and load zip
    await page.goto('/');
    const fileInput = page.locator('input[type="file"]');
    const debugZipPath = path.join(process.cwd(), 'debug.zip');
    await fileInput.setInputFiles(debugZipPath);

    // Wait for file tree
    await page.waitForSelector('.file-tree');

    // Open first file
    await page.locator('text=system.jobs.txt').first().click();
    await expect(page.locator('.tab-bar')).toBeVisible();

    // Open second file if exists
    const secondFile = page.locator('text=system.statement_statistics.txt').first();
    if (await secondFile.isVisible()) {
      await secondFile.click();

      // Verify two tabs are open
      const tabs = page.locator('.tab-item');
      await expect(tabs).toHaveCount(2);

      // Switch back to first tab
      await page.locator('.tab-item').first().click();

      // Verify content switches (should be instant)
      await expect(page.locator('.file-content')).toBeVisible();
    }
  });

  test('should show tables in sidebar', async ({ page }) => {
    // Navigate and load zip
    await page.goto('/');
    const fileInput = page.locator('input[type="file"]');
    const debugZipPath = path.join(process.cwd(), 'debug.zip');
    await fileInput.setInputFiles(debugZipPath);

    // Wait for file processing
    await page.waitForTimeout(2000);

    // Click on Tables tab
    const tablesTab = page.locator('text=Tables');
    if (await tablesTab.isVisible()) {
      await tablesTab.click();

      // Check for system tables
      const tablesList = page.locator('.table-item');
      const count = await tablesList.count();
      expect(count).toBeGreaterThan(0);
    }
  });
});