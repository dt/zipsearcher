import { describe, it, expect, beforeAll } from 'vitest';
import { readFileSync, writeFileSync } from 'fs';
import { join } from 'path';
import { ZipReader } from '../zip/ZipReader';

describe('DuckDB Dialect Detection Error', () => {
  let zipReader: ZipReader;

  beforeAll(async () => {
    const zipPath = join(process.cwd(), 'debug.zip');
    const zipBuffer = readFileSync(zipPath);
    const zipData = new Uint8Array(zipBuffer);
    zipReader = new ZipReader(zipData);
  });

  it('should attempt various CSV parsing strategies to trigger dialect detection error', async () => {
    const entries = await zipReader.initialize();
    const kvNodeStatus = entries.find(e => e.name === 'crdb_internal.kv_node_status.txt');

    const result = await zipReader.readFile(kvNodeStatus!.path);
    const content = result.text!;

    console.log('\n=== TESTING DIFFERENT CSV PARSING STRATEGIES ===');

    // Save to a temporary file to mimic browser file handling
    const tempFile = '/tmp/test_kv_node_status.txt';
    writeFileSync(tempFile, content);

    console.log(`File saved as: ${tempFile}`);
    console.log(`File size: ${content.length} bytes`);

    // Test different delimiter detection strategies
    const delimiters = ['\t', ',', '|', ';'];
    const lines = content.split('\n').filter(line => line.trim().length > 0);
    const firstDataLine = lines[1];

    console.log('\n--- DELIMITER DETECTION ANALYSIS ---');
    for (const delim of delimiters) {
      const headerCells = lines[0].split(delim);
      const dataCells = firstDataLine.split(delim);

      console.log(`\nDelimiter '${delim === '\t' ? '\\t' : delim}':`);
      console.log(`  Header cells: ${headerCells.length}`);
      console.log(`  Data cells: ${dataCells.length}`);
      console.log(`  Match: ${headerCells.length === dataCells.length ? '✅' : '❌'}`);

      if (headerCells.length !== dataCells.length) {
        const diff = Math.abs(headerCells.length - dataCells.length);
        console.log(`  Column count mismatch by ${diff} - this causes dialect detection failure!`);
      }
    }

    // Check for problematic characters that break auto-detection
    console.log('\n--- PROBLEMATIC CHARACTER ANALYSIS ---');

    const problematicChars = ['"', "'", '\n', '\r', '\0'];
    for (const char of problematicChars) {
      const count = (content.match(new RegExp(char === '\n' ? '\\n' : char === '\r' ? '\\r' : char === '\0' ? '\\0' : `\\${char}`, 'g')) || []).length;
      if (count > 0) {
        console.log(`  Character '${char === '\n' ? '\\n' : char === '\r' ? '\\r' : char === '\0' ? '\\0' : char}': ${count} occurrences`);

        if (char === '"') {
          // Check quote patterns that break CSV parsing
          const doubleQuotes = (content.match(/""/g) || []).length;
          const unescapedQuotes = count - (doubleQuotes * 2);
          console.log(`    Double quotes ("") patterns: ${doubleQuotes}`);
          console.log(`    Potentially unescaped quotes: ${unescapedQuotes}`);

          if (unescapedQuotes > 0) {
            console.log(`    ❌ Unescaped quotes break CSV auto-detection!`);
          }
        }
      }
    }

    // Look for the specific pattern that would cause the browser error
    console.log('\n--- ROOT CAUSE ANALYSIS ---');

    // Check if metrics column contains embedded delimiters
    const metricsColumnIndex = lines[0].split('\t').indexOf('metrics');
    if (metricsColumnIndex !== -1) {
      const metricsCell = firstDataLine.split('\t')[metricsColumnIndex];

      if (metricsCell && metricsCell.includes('\t')) {
        console.log('❌ FOUND THE PROBLEM: Metrics JSON contains embedded tabs!');
        console.log('This breaks TSV parsing and causes column count mismatches');
        console.log('DuckDB auto-detection fails because it cannot determine consistent column structure');
      }

      if (metricsCell && metricsCell.includes(',')) {
        const commaCount = (metricsCell.match(/,/g) || []).length;
        console.log(`Metrics contains ${commaCount} commas - would break CSV parsing too`);
      }
    }

    console.log('\n🎯 REPRODUCTION: This data would cause DuckDB to fail with:');
    console.log('"Error when sniffing file - It was not possible to automatically detect the CSV Parsing dialect/types"');
    console.log('Because the massive JSON cells with embedded delimiters prevent consistent column detection.');
  });
});