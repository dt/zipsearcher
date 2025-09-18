import { test, expect } from '@playwright/test';
import * as path from 'path';

const DEBUG_ZIP_PATH = path.join(process.cwd(), 'debug.zip');

test('debug: file viewing selectors', async ({ page }) => {
  // Capture console
  page.on('console', msg => {
    if (msg.type() === 'error') console.log('Browser error:', msg.text());
  });

  await page.goto('/');

  // Load zip
  const fileInput = page.locator('input[type="file"]');
  await fileInput.setInputFiles(DEBUG_ZIP_PATH);
  await page.waitForTimeout(2000);

  // Click Files view
  const filesButton = page.locator('button[title="Files"]');
  await filesButton.click();
  await page.waitForTimeout(500);

  console.log('\n=== File Tree Loaded ===');
  console.log('File tree visible?', await page.locator('.file-tree').isVisible());

  // Find and click a .txt file
  const textFiles = page.locator('.tree-item.file').filter({ hasText: '.txt' });
  const textFileCount = await textFiles.count();
  console.log('Text files found:', textFileCount);

  if (textFileCount > 0) {
    const firstFile = textFiles.first();
    const fileName = await firstFile.textContent();
    console.log('Clicking on file:', fileName);

    await firstFile.click();
    await page.waitForTimeout(1000);

    console.log('\n=== After clicking file ===');

    // Check what viewers are present
    console.log('Looking for viewers...');
    console.log('.file-viewer visible?', await page.locator('.file-viewer').isVisible());
    console.log('.enhanced-file-viewer visible?', await page.locator('.enhanced-file-viewer').isVisible());
    console.log('.monaco-editor visible?', await page.locator('.monaco-editor').isVisible());
    console.log('.error-viewer visible?', await page.locator('.error-viewer').isVisible());

    // Check for any content areas
    console.log('\nLooking for content areas...');
    console.log('.file-content visible?', await page.locator('.file-content').isVisible());
    console.log('.view-lines visible?', await page.locator('.view-lines').isVisible());
    console.log('.monaco-scrollable-element visible?', await page.locator('.monaco-scrollable-element').isVisible());

    // Check main panel
    console.log('\nMain panel check:');
    console.log('.main-panel visible?', await page.locator('.main-panel').isVisible());
    const mainPanelContent = await page.locator('.main-panel').innerHTML();
    console.log('Main panel has content?', mainPanelContent.length > 100);

    // Look for any editor-like elements
    const editorElements = await page.locator('[class*="editor"], [class*="viewer"]').count();
    console.log('Elements with editor/viewer in class:', editorElements);

    // Get all visible class names
    const visibleClasses = await page.evaluate(() => {
      const elements = document.querySelectorAll('*');
      const classes = new Set();
      elements.forEach(el => {
        if (el.className && typeof el.className === 'string' && el.offsetParent !== null) {
          el.className.split(' ').forEach(c => {
            if (c && (c.includes('editor') || c.includes('viewer') || c.includes('monaco'))) {
              classes.add(c);
            }
          });
        }
      });
      return Array.from(classes).sort();
    });
    console.log('\nVisible editor/viewer classes:', visibleClasses);

    // Take screenshot for debugging
    await page.screenshot({ path: 'debug-file-view.png', fullPage: true });
    console.log('\nScreenshot saved as debug-file-view.png');
  }
});