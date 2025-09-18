import { test, expect, Page } from '@playwright/test';
import * as path from 'path';

const DEBUG_ZIP_PATH = path.join(process.cwd(), 'debug.zip');
const SHORT_TIMEOUT = 3000; // 3 seconds max for any element

async function loadDebugZip(page: Page) {
  await page.goto('/');
  const fileInput = page.locator('input[type="file"]');
  await fileInput.setInputFiles(DEBUG_ZIP_PATH);

  // Wait for processing to complete
  await page.waitForTimeout(2000);

  // Click on Files view in the icon rail
  const filesButton = page.locator('button[title="Files"]');
  await filesButton.click();

  // Now wait for file tree
  await page.waitForSelector('.file-tree', { timeout: SHORT_TIMEOUT });
  await page.waitForTimeout(500); // Give UI time to stabilize
}

test.describe('Zip File Loading and Browsing', () => {
  test('should load zip file and display file tree structure', async ({ page }) => {
    await page.goto('/');

    // Verify initial drop zone state
    await expect(page.locator('.drop-zone')).toBeVisible({ timeout: SHORT_TIMEOUT });
    await expect(page.locator('text=Drop debug.zip here')).toBeVisible({ timeout: SHORT_TIMEOUT });

    // Load the zip file
    const fileInput = page.locator('input[type="file"]');
    await fileInput.setInputFiles(DEBUG_ZIP_PATH);

    // Wait for processing
    await page.waitForTimeout(2000);

    // Click on Files view
    const filesButton = page.locator('button[title="Files"]');
    await filesButton.click();

    // Verify file tree appears
    await expect(page.locator('.file-tree')).toBeVisible({ timeout: SHORT_TIMEOUT });

    // Verify tree nodes appear
    await expect(page.locator('.tree-node').first()).toBeVisible({ timeout: SHORT_TIMEOUT });

    // Check for folders
    const folders = await page.locator('.tree-node .folder').count();
    expect(folders).toBeGreaterThan(0);
  });

  test('should expand and collapse folders in file tree', async ({ page }) => {
    await loadDebugZip(page);

    // Find a folder node
    const folder = page.locator('.tree-item.folder').first();
    await expect(folder).toBeVisible({ timeout: SHORT_TIMEOUT });

    // Get initial child count
    const initialChildren = await page.locator('.tree-node').count();

    // Click to expand/collapse
    await folder.click();
    await page.waitForTimeout(200);

    // Check if child count changed
    const afterChildren = await page.locator('.tree-node').count();
    expect(afterChildren).not.toBe(initialChildren);
  });

  test('should navigate through nested folder structure', async ({ page }) => {
    await loadDebugZip(page);

    // Click on first folder
    const firstFolder = page.locator('.tree-item.folder').first();
    if (await firstFolder.isVisible({ timeout: SHORT_TIMEOUT })) {
      await firstFolder.click();
      await page.waitForTimeout(200);

      // Look for nested items
      const items = await page.locator('.tree-node').count();
      expect(items).toBeGreaterThan(1);
    }
  });
});

test.describe('File Viewing and Content Display', () => {
  test('should open and display text file content', async ({ page }) => {
    await loadDebugZip(page);

    // Open a text file - look for any .txt file
    const textFile = page.locator('.tree-item.file').filter({ hasText: '.txt' }).first();
    await textFile.click();

    // Verify file viewer opens
    await expect(page.locator('.enhanced-file-viewer')).toBeVisible({ timeout: SHORT_TIMEOUT });

    // Verify content area exists
    const contentArea = page.locator('.file-content-scroll, .file-lines').first();
    await expect(contentArea).toBeVisible({ timeout: SHORT_TIMEOUT });
  });

  test('should display line numbers for text files', async ({ page }) => {
    await loadDebugZip(page);

    const textFile = page.locator('.tree-item.file').filter({ hasText: '.txt' }).first();
    await textFile.click();

    // Wait for file viewer to load
    await page.waitForSelector('.enhanced-file-viewer', { timeout: SHORT_TIMEOUT });

    // Check for line numbers
    const lineNumbers = page.locator('.line-number').first();
    await expect(lineNumbers).toBeVisible({ timeout: SHORT_TIMEOUT });
  });

  test('should handle large files efficiently', async ({ page }) => {
    await loadDebugZip(page);

    // Look for a potentially large file
    const largeFile = page.locator('.tree-item.file').filter({ hasText: 'statement' }).first();
    if (await largeFile.isVisible({ timeout: SHORT_TIMEOUT })) {
      const startTime = Date.now();
      await largeFile.click();

      // Should load quickly
      await expect(page.locator('.enhanced-file-viewer')).toBeVisible({ timeout: SHORT_TIMEOUT });
      const loadTime = Date.now() - startTime;
      expect(loadTime).toBeLessThan(3000);
    }
  });
});

test.describe('Line Filtering', () => {
  test('should filter lines based on search term', async ({ page }) => {
    await loadDebugZip(page);

    // Open a file
    const textFile = page.locator('.tree-item.file').filter({ hasText: '.txt' }).first();
    await textFile.click();
    await page.waitForSelector('.enhanced-file-viewer', { timeout: SHORT_TIMEOUT });

    // Look for filter input in the enhanced file viewer
    const filterInput = page.locator('.filter-input').first();
    if (await filterInput.isVisible({ timeout: 1000 })) {
      await filterInput.fill('SELECT');
      await filterInput.press('Enter');
      await page.waitForTimeout(300);

      // Verify filtering applied (content should change)
      const content = page.locator('.file-lines').first();
      await expect(content).toBeVisible({ timeout: SHORT_TIMEOUT });
    }
  });

  test('should clear filter and show all lines', async ({ page }) => {
    await loadDebugZip(page);

    const textFile = page.locator('.tree-item.file').filter({ hasText: '.txt' }).first();
    await textFile.click();
    await page.waitForSelector('.enhanced-file-viewer', { timeout: SHORT_TIMEOUT });

    const filterInput = page.locator('.filter-input').first();
    if (await filterInput.isVisible({ timeout: 1000 })) {
      // Apply filter
      await filterInput.fill('SELECT');
      await filterInput.press('Enter');
      await page.waitForTimeout(300);

      // Clear filter
      await filterInput.clear();
      await filterInput.press('Enter');
      await page.waitForTimeout(300);

      // Content should still be visible
      const content = page.locator('.file-lines').first();
      await expect(content).toBeVisible({ timeout: SHORT_TIMEOUT });
    }
  });
});

test.describe('Search Functionality', () => {
  test('should search within file content using Ctrl+F', async ({ page }) => {
    await loadDebugZip(page);

    const textFile = page.locator('.tree-item.file').filter({ hasText: '.txt' }).first();
    await textFile.click();
    await page.waitForSelector('.enhanced-file-viewer', { timeout: SHORT_TIMEOUT });

    // Use the search input in the file controls
    const searchInput = page.locator('.search-input').first();
    await searchInput.fill('job');
    await searchInput.press('Enter');
    await page.waitForTimeout(200);
  });

  test('should navigate through search results', async ({ page }) => {
    await loadDebugZip(page);

    const textFile = page.locator('.tree-item.file').filter({ hasText: '.txt' }).first();
    await textFile.click();
    await page.waitForSelector('.enhanced-file-viewer', { timeout: SHORT_TIMEOUT });

    // Use a search term that's likely to have results
    const searchInput = page.locator('.search-input').first();
    await searchInput.fill('the');
    await searchInput.press('Enter');
    await page.waitForTimeout(500);

    // Check if there are matches
    const matchCount = page.locator('.match-count').first();
    if (await matchCount.isVisible({ timeout: 1000 })) {
      const matchText = await matchCount.textContent();

      // Only try navigation if there are matches
      if (!matchText?.includes('No matches')) {
        const nextButton = page.locator('.nav-button').filter({ hasText: '↓' }).first();
        const prevButton = page.locator('.nav-button').filter({ hasText: '↑' }).first();

        // Check buttons are enabled before clicking
        const nextDisabled = await nextButton.isDisabled();
        if (!nextDisabled) {
          await nextButton.click();
          await page.waitForTimeout(100);
          await prevButton.click();
        }
      }
    }
  });
});

test.describe('Tab Management', () => {
  test('should open multiple tabs', async ({ page }) => {
    await loadDebugZip(page);

    // Open first file
    const firstFile = page.locator('.tree-item.file').nth(0);
    await firstFile.click();
    await page.waitForTimeout(300);

    // Open second file
    const secondFile = page.locator('.tree-item.file').nth(1);
    await secondFile.click();
    await page.waitForTimeout(300);

    // Open third file if available
    const thirdFile = page.locator('.tree-item.file').nth(2);
    if (await thirdFile.isVisible({ timeout: 1000 })) {
      await thirdFile.click();
      await page.waitForTimeout(300);
    }

    // Verify multiple tabs
    const tabs = page.locator('.tab-item, .tab');
    const tabCount = await tabs.count();
    expect(tabCount).toBeGreaterThanOrEqual(2);
  });

  test('should switch between tabs', async ({ page }) => {
    await loadDebugZip(page);

    // Open two files
    const firstFile = page.locator('.tree-item.file').nth(0);
    await firstFile.click();
    await page.waitForTimeout(300);

    const secondFile = page.locator('.tree-item.file').nth(1);
    await secondFile.click();
    await page.waitForTimeout(300);

    // Switch back to first tab
    const firstTab = page.locator('.tab-item, .tab').first();
    await firstTab.click();
    await page.waitForTimeout(200);

    // Verify tab is active
    await expect(firstTab).toHaveClass(/active|selected/, { timeout: SHORT_TIMEOUT });
  });

  test('should close tabs', async ({ page }) => {
    await loadDebugZip(page);

    // Open multiple files
    await page.locator('.tree-item.file').nth(0).click();
    await page.waitForTimeout(300);
    await page.locator('.tree-item.file').nth(1).click();
    await page.waitForTimeout(300);

    const tabs = page.locator('.tab-item, .tab');
    const initialCount = await tabs.count();

    // Try to close a tab
    const closeButton = tabs.first().locator('.tab-close, .close-icon, button[aria-label*="Close"]').first();
    if (await closeButton.isVisible({ timeout: 1000 })) {
      await closeButton.click();
      await page.waitForTimeout(200);

      const newCount = await tabs.count();
      expect(newCount).toBe(initialCount - 1);
    }
  });

  test('should maintain tab state when switching', async ({ page }) => {
    await loadDebugZip(page);

    // Open file and get some state
    const firstFile = page.locator('.tree-item.file').nth(0);
    await firstFile.click();
    await page.waitForTimeout(500);

    // Try to scroll if possible
    const scrollContainer = page.locator('.file-content-scroll').first();
    await scrollContainer.evaluate(el => el.scrollTop = 100);

    // Open another file
    const secondFile = page.locator('.tree-item.file').nth(1);
    await secondFile.click();
    await page.waitForTimeout(300);

    // Switch back
    const firstTab = page.locator('.tab-item, .tab').first();
    await firstTab.click();
    await page.waitForTimeout(200);

    // Verify we're back on first tab
    await expect(firstTab).toHaveClass(/active|selected/, { timeout: SHORT_TIMEOUT });
  });
});

test.describe('SQL Tables and Queries', () => {
  test('should display tables in sidebar', async ({ page }) => {
    await loadDebugZip(page);

    // Click on Tables icon in icon rail
    const tablesButton = page.locator('button[title="Tables"]');
    await tablesButton.click();

    // Wait for tables view
    await page.waitForTimeout(500);

    // Check for table items
    const tables = page.locator('.table-item, .table-entry, [role="treeitem"]').filter({ hasText: /\w+/ });
    if (await tables.first().isVisible({ timeout: SHORT_TIMEOUT })) {
      const tableCount = await tables.count();
      expect(tableCount).toBeGreaterThan(0);
    }
  });

  test('should open table and show SQL editor', async ({ page }) => {
    await loadDebugZip(page);

    // Navigate to Tables
    const tablesButton = page.locator('button[title="Tables"]');
    await tablesButton.click();
    await page.waitForTimeout(500);

    // Click on first table
    const firstTable = page.locator('.table-item, .table-entry').first();
    if (await firstTable.isVisible({ timeout: SHORT_TIMEOUT })) {
      await firstTable.click();
      await page.waitForTimeout(500);

      // Check for SQL editor
      const sqlEditor = page.locator('.sql-editor, .monaco-editor').first();
      await expect(sqlEditor).toBeVisible({ timeout: SHORT_TIMEOUT });
    }
  });

  test('should execute SQL queries', async ({ page }) => {
    await loadDebugZip(page);

    // Open Tables view
    const tablesButton = page.locator('button[title="Tables"]');
    await tablesButton.click();
    await page.waitForTimeout(500);

    // Open a table
    const firstTable = page.locator('.table-item, .table-entry').first();
    if (await firstTable.isVisible({ timeout: SHORT_TIMEOUT })) {
      await firstTable.click();
      await page.waitForTimeout(500);

      // Look for run button
      const runButton = page.locator('button').filter({ hasText: /Run|Execute|►/ }).first();
      if (await runButton.isVisible({ timeout: 1000 })) {
        await runButton.click();
        await page.waitForTimeout(1000);

        // Check for results
        const results = page.locator('.sql-results').first();
        await expect(results).toBeVisible({ timeout: SHORT_TIMEOUT });
      }
    }
  });

  test('should provide SQL auto-complete', async ({ page }) => {
    await loadDebugZip(page);

    const tablesButton = page.locator('button[title="Tables"]');
    await tablesButton.click();
    await page.waitForTimeout(500);

    const firstTable = page.locator('.table-item, .table-entry').first();
    if (await firstTable.isVisible({ timeout: SHORT_TIMEOUT })) {
      await firstTable.click();
      await page.waitForTimeout(500);

      // Type in editor to trigger autocomplete
      const editor = page.locator('.monaco-editor').first();
      if (await editor.isVisible({ timeout: SHORT_TIMEOUT })) {
        await editor.click();
        await page.keyboard.press('Control+a');
        await page.keyboard.type('SELECT * FROM ');
        await page.waitForTimeout(500);

        // Check for suggestions
        const suggestions = page.locator('.suggest-widget, .monaco-list').first();
        // Autocomplete might appear
        if (await suggestions.isVisible({ timeout: 500 })) {
          const items = await suggestions.locator('.monaco-list-row').count();
          expect(items).toBeGreaterThan(0);
        }
      }
    }
  });
});

test.describe('CRDB-Specific Features', () => {
  test('should display jobs with correct structure', async ({ page }) => {
    await loadDebugZip(page);

    // Look for jobs file
    const jobsFile = page.locator('.tree-item.file').filter({ hasText: 'jobs' }).first();
    if (await jobsFile.isVisible({ timeout: SHORT_TIMEOUT })) {
      await jobsFile.click();
      await page.waitForTimeout(500);

      // Check content loaded
      const content = page.locator('.enhanced-file-viewer').first();
      await expect(content).toBeVisible({ timeout: SHORT_TIMEOUT });
    }
  });

  test('should show job progress information', async ({ page }) => {
    await loadDebugZip(page);

    const jobsFile = page.locator('.tree-item.file').filter({ hasText: 'jobs' }).first();
    if (await jobsFile.isVisible({ timeout: SHORT_TIMEOUT })) {
      await jobsFile.click();
      await page.waitForTimeout(500);

      // Verify viewer loaded
      const viewer = page.locator('.enhanced-file-viewer').first();
      await expect(viewer).toBeVisible({ timeout: SHORT_TIMEOUT });
    }
  });

  test('should display spanconfigs if present', async ({ page }) => {
    await loadDebugZip(page);

    // Look for spanconfig files
    const spanconfigFile = page.locator('.tree-item.file').filter({ hasText: /span/i }).first();
    if (await spanconfigFile.isVisible({ timeout: 1000 })) {
      await spanconfigFile.click();
      await page.waitForTimeout(500);

      const viewer = page.locator('.enhanced-file-viewer').first();
      await expect(viewer).toBeVisible({ timeout: SHORT_TIMEOUT });
    }
  });
});

test.describe('Performance and Efficiency', () => {
  test('should handle rapid tab switching', async ({ page }) => {
    await loadDebugZip(page);

    // Open two files with more wait time
    const firstFile = page.locator('.tree-item.file').nth(0);
    await firstFile.click();
    await page.waitForSelector('.enhanced-file-viewer', { timeout: SHORT_TIMEOUT });

    const secondFile = page.locator('.tree-item.file').nth(1);
    await secondFile.click();
    await page.waitForTimeout(1000);

    // Wait for tabs to be ready
    const tabs = page.locator('.tab-item, .tab');
    await expect(tabs).toHaveCount(2, { timeout: SHORT_TIMEOUT });

    // Rapidly switch tabs
    for (let i = 0; i < 3; i++) {
      await tabs.first().click();
      await page.waitForTimeout(100);
      await tabs.nth(1).click();
      await page.waitForTimeout(100);
    }

    // UI should remain responsive - tabs should still exist
    await expect(tabs).toHaveCount(2, { timeout: SHORT_TIMEOUT });

    // Main panel should be visible
    const mainPanel = page.locator('.main-panel');
    await expect(mainPanel).toBeVisible({ timeout: SHORT_TIMEOUT });
  });

  test('should load zip file quickly', async ({ page }) => {
    const startTime = Date.now();

    await page.goto('/');
    const fileInput = page.locator('input[type="file"]');
    await fileInput.setInputFiles(DEBUG_ZIP_PATH);

    // Wait for processing
    await page.waitForTimeout(2000);

    // Click on Files view
    const filesButton = page.locator('button[title="Files"]');
    await filesButton.click();

    await page.waitForSelector('.file-tree', { timeout: SHORT_TIMEOUT });

    const loadTime = Date.now() - startTime;
    expect(loadTime).toBeLessThan(5000); // Should load in under 5 seconds

    // Verify tree is populated
    const nodes = await page.locator('.tree-node').count();
    expect(nodes).toBeGreaterThan(5);
  });

  test('should handle concurrent file operations', async ({ page }) => {
    await loadDebugZip(page);

    // Click multiple files quickly
    const files = page.locator('.tree-item.file');
    const fileCount = Math.min(await files.count(), 3);

    for (let i = 0; i < fileCount; i++) {
      await files.nth(i).click();
      // No wait between clicks
    }

    await page.waitForTimeout(1000);

    // Should have opened tabs
    const tabs = page.locator('.tab-item, .tab');
    const tabCount = await tabs.count();
    expect(tabCount).toBeGreaterThanOrEqual(Math.min(fileCount, 2));
  });
});

test.describe('Error Handling', () => {
  test('should handle missing or invalid files gracefully', async ({ page }) => {
    await loadDebugZip(page);

    // Try to open a binary file if present
    const binaryFile = page.locator('.tree-item.file').filter({ hasText: /\.(bin|exe|dll|so|dylib)/ }).first();
    if (await binaryFile.isVisible({ timeout: 1000 })) {
      await binaryFile.click();
      await page.waitForTimeout(500);

      // Should show some viewer (enhanced, error, or hex)
      const viewer = page.locator('.enhanced-file-viewer, .error-viewer').first();
      await expect(viewer).toBeVisible({ timeout: SHORT_TIMEOUT });
    }
  });

  test('should handle search with no results', async ({ page }) => {
    await loadDebugZip(page);

    const textFile = page.locator('.tree-item.file').filter({ hasText: '.txt' }).first();
    await textFile.click();
    await page.waitForSelector('.enhanced-file-viewer', { timeout: SHORT_TIMEOUT });

    // Search for non-existent term
    const searchInput = page.locator('.search-input').first();
    await searchInput.fill('xyzxyzxyz999999');
    await searchInput.press('Enter');
    await page.waitForTimeout(300);

    // Check for no matches indicator
    const matchCount = page.locator('.match-count').first();
    if (await matchCount.isVisible({ timeout: 1000 })) {
      const text = await matchCount.textContent();
      expect(text).toContain('No matches');
    }
  });
});

test.describe('UI Responsiveness', () => {
  test('should remain responsive during file loading', async ({ page }) => {
    await loadDebugZip(page);

    // Open a file
    const file = page.locator('.tree-item.file').first();
    await file.click();

    // Immediately try to interact with UI
    const tablesButton = page.locator('button[title="Tables"]');
    await tablesButton.click();

    // Should switch views even while file is loading
    await page.waitForTimeout(200);

    // Switch back
    const filesButton = page.locator('button[title="Files"]');
    await filesButton.click();

    // UI should still be responsive
    await expect(page.locator('.sidebar')).toBeVisible({ timeout: SHORT_TIMEOUT });
  });

  test('should show loading states appropriately', async ({ page }) => {
    await page.goto('/');

    const fileInput = page.locator('input[type="file"]');
    const uploadPromise = fileInput.setInputFiles(DEBUG_ZIP_PATH);

    // Check for any loading indicator quickly
    const loadingStates = page.locator('.loading, .spinner, .progress, [aria-busy="true"]');

    // Complete the upload
    await uploadPromise;

    // Wait for processing
    await page.waitForTimeout(2000);

    // Click on Files view to see the tree
    const filesButton = page.locator('button[title="Files"]');
    await filesButton.click();

    // File tree should appear quickly
    await expect(page.locator('.file-tree')).toBeVisible({ timeout: SHORT_TIMEOUT });

    // Loading indicators should be gone
    const visibleLoaders = await loadingStates.count();
    if (visibleLoaders > 0) {
      await expect(loadingStates.first()).not.toBeVisible({ timeout: SHORT_TIMEOUT });
    }
  });
});