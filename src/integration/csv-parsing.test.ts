import { describe, it, expect, beforeAll } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';
import { ZipReader } from '../zip/ZipReader';

describe.skip('CSV Parsing Error Reproduction', () => {
  let zipReader: ZipReader;

  beforeAll(async () => {
    const zipPath = join(process.cwd(), 'debug.zip');
    const zipBuffer = readFileSync(zipPath);
    const zipData = new Uint8Array(zipBuffer);
    zipReader = new ZipReader(zipData);
  });

  it('should reproduce the exact CSV parsing error from browser', async () => {
    const entries = await zipReader.initialize();
    const kvNodeStatus = entries.find(e => e.name === 'crdb_internal.kv_node_status.txt');

    const result = await zipReader.readFile(kvNodeStatus!.path);
    const content = result.text!;

    console.log('\n=== REPRODUCING BROWSER CSV PARSING ERROR ===');

    // Try to parse as TSV like DuckDB would
    const lines = content.split('\n').filter(line => line.trim().length > 0);
    const headers = lines[0].split('\t');

    console.log(`Headers found: ${headers.length} columns`);
    console.log(`Data lines: ${lines.length - 1} rows`);

    // Check each data line for parsing issues
    for (let i = 1; i < lines.length; i++) {
      const line = lines[i];
      const cells = line.split('\t');

      if (cells.length !== headers.length) {
        console.log(`\n❌ ROW ${i} PARSING ERROR:`);
        console.log(`Expected ${headers.length} columns, got ${cells.length} columns`);
        console.log(`This would cause: "Error when sniffing file - not possible to automatically detect CSV Parsing dialect/types"`);

        // Find where the mismatch occurs
        for (let j = 0; j < Math.max(cells.length, headers.length); j++) {
          if (j >= cells.length) {
            console.log(`Missing cell for column: ${headers[j]}`);
          } else if (j >= headers.length) {
            console.log(`Extra cell: ${cells[j].substring(0, 50)}...`);
          }
        }

        // Check if it's due to embedded tabs in JSON
        const problematicCell = cells.find(cell => {
          try {
            if (cell.startsWith('{') && cell.includes('\t')) {
              console.log(`Found JSON cell with embedded tabs - this breaks TSV parsing!`);
              return true;
            }
          } catch (e) {}
          return false;
        });

        return; // Stop after first error
      }
    }

    console.log('✅ All rows have correct column count - parsing should work');

    // Additional checks for JSON validity in metrics column
    const metricsIndex = headers.indexOf('metrics');
    if (metricsIndex !== -1) {
      console.log('\n=== CHECKING METRICS COLUMN JSON ===');

      for (let i = 1; i < Math.min(3, lines.length); i++) {
        const cells = lines[i].split('\t');
        if (cells[metricsIndex]) {
          const metricsData = cells[metricsIndex];
          console.log(`\nRow ${i} metrics (${metricsData.length} chars):`);

          // Check for specific JSON issues
          if (metricsData.includes('""')) {
            console.log('❌ Contains double-escaped quotes ("")');
          }
          if (metricsData.includes('\t')) {
            console.log('❌ Contains embedded tabs - breaks TSV parsing!');
          }
          if (metricsData.includes('\n')) {
            console.log('❌ Contains embedded newlines - breaks CSV parsing!');
          }

          try {
            JSON.parse(metricsData);
            console.log('✅ Valid JSON');
          } catch (e) {
            console.log(`❌ Invalid JSON: ${(e as Error).message}`);
            console.log(`First 200 chars: ${metricsData.substring(0, 200)}`);
          }
        }
      }
    }
  });
});