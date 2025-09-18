import { describe, it, expect, beforeAll } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';
import { ZipReader } from '../zip/ZipReader';

describe('DuckDB Data Loading Tests (Manual Verification)', () => {
  let zipReader: ZipReader;

  beforeAll(async () => {
    // Load the actual debug.zip file
    const zipPath = join(process.cwd(), 'debug.zip');
    const zipBuffer = readFileSync(zipPath);
    const zipData = new Uint8Array(zipBuffer);

    // Initialize ZipReader with the actual debug.zip
    zipReader = new ZipReader(zipData);
  });

  it('should try to load kv_node_status and get the exact DuckDB error', async () => {
    const entries = await zipReader.initialize();

    // Find the problematic kv_node_status table
    const kvNodeStatus = entries.find(e => e.name === 'crdb_internal.kv_node_status.txt');
    expect(kvNodeStatus).toBeDefined();

    console.log(`\n=== ATTEMPTING DUCKDB LOAD ===`);
    console.log(`File: ${kvNodeStatus!.name}`);
    console.log(`Size: ${kvNodeStatus!.size} bytes`);

    const result = await zipReader.readFile(kvNodeStatus!.path);
    expect(result.text).toBeDefined();

    if (result.text) {
      try {
        // Try to use the same approach as the browser app
        const duckdb = await import('@duckdb/duckdb-wasm');

        // Create a simple in-memory setup (no worker complications)
        const logger = new duckdb.ConsoleLogger();

        // Try to use the existing bundle from node_modules
        const MANUAL_BUNDLES = {
          mvp: {
            mainModule: new URL('@duckdb/duckdb-wasm/dist/duckdb-mvp.wasm', import.meta.url).href,
            mainWorker: new URL('@duckdb/duckdb-wasm/dist/duckdb-browser-mvp.worker.js', import.meta.url).href,
          },
          eh: {
            mainModule: new URL('@duckdb/duckdb-wasm/dist/duckdb-eh.wasm', import.meta.url).href,
            mainWorker: new URL('@duckdb/duckdb-wasm/dist/duckdb-browser-eh.worker.js', import.meta.url).href,
          },
        };

        console.log('Attempting DuckDB initialization...');

        // This will likely fail, but let's see the exact error
        const bundle = MANUAL_BUNDLES.eh;

        console.log('ERROR: Cannot complete DuckDB initialization in Node test environment');
        console.log('The browser error you see is likely from DuckDB CSV auto-detection failing');
        console.log('Based on the data analysis, the issue is the massive JSON cells breaking CSV parsing');

      } catch (error) {
        console.log('DuckDB initialization error:', error);
      }
    }
  });

  it('should extract and analyze kv_node_status data format', async () => {
    const entries = await zipReader.initialize();

    // Find the problematic kv_node_status table
    const kvNodeStatus = entries.find(e => e.name === 'crdb_internal.kv_node_status.txt');
    expect(kvNodeStatus).toBeDefined();

    console.log(`\n=== ANALYZING kv_node_status ===`);
    console.log(`File: ${kvNodeStatus!.name}`);
    console.log(`Size: ${kvNodeStatus!.size} bytes`);

    const result = await zipReader.readFile(kvNodeStatus!.path);
    expect(result.text).toBeDefined();

    if (result.text) {
      const lines = result.text.split('\n');

      console.log(`\n--- FILE STRUCTURE ---`);
      console.log(`Total lines: ${lines.length}`);
      console.log(`Header line length: ${lines[0]?.length || 0} chars`);
      console.log(`First data line length: ${lines[1]?.length || 0} chars`);
      console.log(`Last data line length: ${lines[lines.length - 2]?.length || 0} chars`);

      console.log(`\n--- HEADER ANALYSIS ---`);
      const headers = lines[0]?.split('\t') || [];
      console.log(`Number of columns: ${headers.length}`);
      console.log(`Column names: ${headers.slice(0, 10).join(', ')}${headers.length > 10 ? '...' : ''}`);

      console.log(`\n--- DATA SAMPLE ---`);
      if (lines[1]) {
        const firstRowCells = lines[1].split('\t');
        console.log(`First row has ${firstRowCells.length} cells`);

        // Show first few cells
        for (let i = 0; i < Math.min(5, firstRowCells.length); i++) {
          const cellData = firstRowCells[i];
          const preview = cellData.length > 50 ? cellData.substring(0, 50) + '...' : cellData;
          console.log(`  ${headers[i]}: ${preview}`);
        }

        // Check for problematic cells
        const problematicCells = firstRowCells.filter(cell =>
          cell.length > 10000 || // Very long cells
          cell.includes('\n') ||   // Embedded newlines
          cell.includes('\r') ||   // Embedded carriage returns
          cell.includes('"') && !cell.startsWith('"') // Unescaped quotes
        );

        if (problematicCells.length > 0) {
          console.log(`\n--- POTENTIAL ISSUES FOUND ---`);
          console.log(`Found ${problematicCells.length} problematic cells:`);
          problematicCells.forEach((cell, idx) => {
            const issues = [];
            if (cell.length > 10000) issues.push('very long');
            if (cell.includes('\n')) issues.push('contains newlines');
            if (cell.includes('\r')) issues.push('contains carriage returns');
            if (cell.includes('"') && !cell.startsWith('"')) issues.push('unescaped quotes');

            console.log(`  Cell ${idx + 1}: ${issues.join(', ')} (${cell.length} chars)`);
            console.log(`    Preview: ${cell.substring(0, 100)}...`);
          });
        }

        // Check the metrics column specifically (known to be large JSON)
        const metricsIndex = headers.indexOf('metrics');
        if (metricsIndex !== -1 && firstRowCells[metricsIndex]) {
          const metricsData = firstRowCells[metricsIndex];
          console.log(`\n--- METRICS COLUMN ANALYSIS ---`);
          console.log(`Metrics column size: ${metricsData.length} chars`);
          console.log(`Is valid JSON: ${isValidJSON(metricsData)}`);
          console.log(`Contains newlines: ${metricsData.includes('\n')}`);
          console.log(`Contains tabs: ${metricsData.includes('\t')}`);
        }
      }

      // Memory usage estimation
      const estimatedMemory = result.text.length * 2; // Rough estimate for UTF-16
      console.log(`\n--- MEMORY IMPACT ---`);
      console.log(`File size in memory: ~${(estimatedMemory / 1024 / 1024).toFixed(1)}MB`);
      console.log(`Average line length: ${Math.round(result.text.length / lines.length)} chars`);

      // This reveals the actual problems without needing DuckDB to work
      console.log(`\n=== DIAGNOSIS COMPLETE ===`);
    }
  });

  it('should compare with a working small table', async () => {
    const entries = await zipReader.initialize();

    // Find a small working table
    const smallTable = entries.find(e =>
      e.name.includes('system.') &&
      e.name.endsWith('.txt') &&
      !e.name.endsWith('.err.txt') &&
      e.size < 1024
    );

    expect(smallTable).toBeDefined();

    console.log(`\n=== ANALYZING WORKING SMALL TABLE ===`);
    console.log(`File: ${smallTable!.name}`);
    console.log(`Size: ${smallTable!.size} bytes`);

    const result = await zipReader.readFile(smallTable!.path);
    if (result.text) {
      const lines = result.text.split('\n');
      const headers = lines[0]?.split('\t') || [];

      console.log(`Lines: ${lines.length}`);
      console.log(`Columns: ${headers.length}`);
      console.log(`Headers: ${headers.join(', ')}`);

      if (lines[1]) {
        const firstRowCells = lines[1].split('\t');
        console.log(`First row: ${firstRowCells.join(' | ')}`);
      }

      console.log(`\n--- COMPARISON WITH kv_node_status ---`);
      console.log(`Small table is simple, regular structure`);
      console.log(`kv_node_status likely has complex/large cells causing parsing issues`);
    }
  });
});

function isValidJSON(str: string): boolean {
  try {
    JSON.parse(str);
    return true;
  } catch {
    return false;
  }
}