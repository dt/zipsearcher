import { test, expect } from '@playwright/test';
import * as path from 'path';

const DEBUG_ZIP_PATH = path.join(process.cwd(), 'debug.zip');

test('debug: check page structure after loading zip', async ({ page }) => {
  // Capture console messages
  page.on('console', msg => console.log('Browser console:', msg.type(), msg.text()));
  page.on('pageerror', error => console.log('Page error:', error));

  await page.goto('/');

  // Check initial state
  console.log('Drop zone visible?', await page.locator('.drop-zone').isVisible());

  // Load the file
  const fileInput = page.locator('input[type="file"]');
  await fileInput.setInputFiles(DEBUG_ZIP_PATH);

  // Wait longer for processing
  await page.waitForTimeout(3000);

  // Check what happened after loading
  console.log('\n=== After loading ===');
  console.log('Drop zone still visible?', await page.locator('.drop-zone').isVisible());
  console.log('.file-tree visible?', await page.locator('.file-tree').isVisible());
  console.log('.files-view visible?', await page.locator('.files-view').isVisible());
  console.log('.tree-node visible?', await page.locator('.tree-node').isVisible());
  console.log('.sidebar visible?', await page.locator('.sidebar').isVisible());

  // Check if sidebar content changed
  const sidebarContent = await page.locator('.sidebar').textContent();
  console.log('Sidebar content:', sidebarContent?.substring(0, 100));

  // Look for error messages
  const errorElements = await page.locator('[class*="error"], [class*="Error"]').count();
  console.log('Error elements found:', errorElements);

  // Check if the app state changed
  const appState = await page.evaluate(() => {
    // Try to access app state if available
    return (window as any).__APP_STATE__ || 'No state available';
  });
  console.log('App state:', appState);

  // Take screenshot for debugging
  await page.screenshot({ path: 'debug-final.png', fullPage: true });
});