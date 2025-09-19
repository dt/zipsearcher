import { describe, it, expect, beforeAll } from 'vitest';
import { readFile } from 'fs/promises';

import { ZipReader } from '../zip/ZipReader';
import { DuckDBService } from '../services/duckdb';
import { preprocessCSV, shouldPreprocess } from '../crdb/csvPreprocessor';
import { ProtoDecoder } from '../crdb/protoDecoder';
import { prettyKey } from '../crdb/prettyKey';
import { getTableTypeHints } from '../crdb/columnTypeRegistry';

describe.skip('debug.zip integration', () => {
  let zipData: ArrayBuffer;
  let zipReader: ZipReader;
  let processedFiles: Map<string, any> = new Map();

  beforeAll(async () => {
    // Load the actual debug.zip file
    const buffer = await readFile('./debug.zip');
    zipData = buffer.buffer.slice(
      buffer.byteOffset,
      buffer.byteOffset + buffer.byteLength
    );
    zipReader = new ZipReader(new Uint8Array(zipData));
  });

  describe('zip file loading', () => {
    it('should initialize without errors', async () => {
      const entries = await zipReader.initialize();

      expect(entries).toBeDefined();
      expect(entries.length).toBeGreaterThan(0);
      expect(entries.some(e => e.path.includes('nodes'))).toBe(true);
      expect(entries.some(e => e.path.includes('system.jobs'))).toBe(true);
    });

    it('should have expected structure', async () => {
      const entries = await zipReader.initialize();

      // Check for expected file types
      const txtFiles = entries.filter(e => e.path.endsWith('.txt'));
      const logFiles = entries.filter(e => e.path.endsWith('.log'));
      const jsonFiles = entries.filter(e => e.path.endsWith('.json'));

      expect(txtFiles.length).toBeGreaterThan(0);
      expect(jsonFiles.length).toBeGreaterThan(0);

      // Check for expected paths with folders (even if not explicit directory entries)
      const hasNodesPaths = entries.some(e => e.path.includes('nodes/'));
      const hasDebugPaths = entries.some(e => e.path.startsWith('debug/'));

      expect(hasNodesPaths).toBe(true);
      expect(hasDebugPaths).toBe(true);

      console.log(`Found ${txtFiles.length} .txt files, ${logFiles.length} .log files, ${jsonFiles.length} .json files`);
    });
  });

  describe('file reading', () => {
    const criticalFiles = [
      'debug/nodes/1/status.txt',
      'debug/nodes/1/ranges/1.json',
      'debug/system.jobs.txt',
      'debug/system.descriptor.txt'
    ];

    criticalFiles.forEach(filePath => {
      it(`should read ${filePath} without errors`, async () => {
        const entries = await zipReader.initialize();
        const entry = entries.find(e => e.path === filePath || e.path.includes(filePath.split('/').pop()!));

        if (entry && !entry.isDir) {
          const result = await zipReader.readFile(entry.path);

          expect(result).toBeDefined();
          expect(result.text || result.bytes).toBeDefined();

          // Store for further processing
          processedFiles.set(filePath, result);
        }
      });
    });
  });

  describe('CSV preprocessing', () => {
    it('should preprocess system.jobs.txt without errors', async () => {
      const entries = await zipReader.initialize();
      const jobsFile = entries.find(e => e.path.includes('system.jobs.txt'));

      if (jobsFile) {
        const { text } = await zipReader.readFile(jobsFile.path);

        if (text) {
          expect(() => {
            const processed = preprocessCSV(text, {
              tableName: 'system.jobs.txt',
              decodeProtos: true
            });
            expect(processed).toBeDefined();
            expect(processed.length).toBeGreaterThan(0);
          }).not.toThrow();
        }
      }
    });

    it('should preprocess system.descriptor.txt without errors', async () => {
      const entries = await zipReader.initialize();
      const descriptorFile = entries.find(e => e.path.includes('system.descriptor.txt'));

      if (descriptorFile) {
        const { text } = await zipReader.readFile(descriptorFile.path);

        if (text) {
          expect(() => {
            const processed = preprocessCSV(text, {
              tableName: 'system.descriptor.txt',
              decodeProtos: true
            });
            expect(processed).toBeDefined();
          }).not.toThrow();
        }
      }
    });

    it('should handle all CSV files without throwing', async () => {
      const entries = await zipReader.initialize();
      const csvFiles = entries.filter(e =>
        (e.path.endsWith('.txt') || e.path.endsWith('.csv')) && !e.isDir
      );

      const errors: Array<{ file: string; error: any }> = [];

      for (const file of csvFiles.slice(0, 10)) { // Test first 10 to keep it fast
        try {
          const { text } = await zipReader.readFile(file.path);

          if (text && shouldPreprocess(file.path, text)) {
            preprocessCSV(text, {
              tableName: file.path,
              decodeProtos: true,
              decodeKeys: true
            });
          }
        } catch (error) {
          errors.push({ file: file.path, error });
        }
      }

      // Log errors but don't fail - we want to see what's broken
      if (errors.length > 0) {
        console.log('Preprocessing errors found:');
        errors.forEach(({ file, error }) => {
          console.log(`  ${file}: ${error.message}`);
        });
      }

      // Should handle most files without errors
      expect(errors.length).toBeLessThan(csvFiles.length * 0.1); // Less than 10% error rate
    });
  });

  describe('DuckDB loading - REPRODUCING CSV SNIFFING ERRORS', () => {
    it('should reproduce CSV sniffing errors when loading crdb_internal.kv_node_status.txt', async () => {
      // This test REPRODUCES the actual errors the user sees in production
      // FULL ERROR MESSAGE: Conversion Error: CSV Error on Line: 2. Error when converting column 'started_at'. Could not convert string '1' to 'TIMESTAMP'

      // Use the EXACT same factory function as production
      const { createDuckDBService } = await import('../services/duckdb-interface');
      const duckDbService = await createDuckDBService();

      try {
        await duckDbService.initialize();

        const entries = await zipReader.initialize();

        // Find the problematic file that causes CSV sniffing errors
        const kvNodeStatusFile = entries.find(e => e.path.includes('crdb_internal.kv_node_status.txt'));
        expect(kvNodeStatusFile).toBeDefined();

        const { text } = await zipReader.readFile(kvNodeStatusFile!.path);
        expect(text).toBeDefined();

        console.log(`Testing CSV sniffing with crdb_internal.kv_node_status.txt using production loadTableFromText`);
        console.log(`File size: ${text!.length} characters`);

        // Now call the EXACT same method that the browser calls
        try {
          console.log('Calling loadTableFromText with exact production parameters...');
          const rowCount = await duckDbService.loadTableFromText('crdb_internal.kv_node_status', text!, '\t');

          // If we get here, the error didn't reproduce
          console.log(`Table loaded successfully, row count: ${rowCount}`);
          expect.fail('Expected TIMESTAMP conversion error but table loaded successfully.');

        } catch (error: any) {
          const errorMsg = error.message || String(error);
          console.log(`Reproduced error: ${errorMsg}`);

          // Check for the specific errors we're trying to reproduce
          if (errorMsg.includes('Error when sniffing file')) {
            console.log('✓ Successfully reproduced the CSV sniffing error!');
            expect(errorMsg).toContain('It was not possible to automatically detect the CSV Parsing dialect/types');
          } else if (errorMsg.includes('Could not convert string') && errorMsg.includes('TIMESTAMP')) {
            console.log('✓ Successfully reproduced the TIMESTAMP conversion error!');
            expect(errorMsg).toContain('Could not convert string');
            expect(errorMsg).toContain('to \'TIMESTAMP\'');
          } else if (errorMsg.includes('Expected Number of Columns')) {
            console.log('✓ Successfully reproduced a CSV parsing error!');
            expect(errorMsg).toContain('Expected Number of Columns');
          } else {
            console.log('Got a different error than expected:', errorMsg);
            throw error; // Re-throw to see what the actual error is
          }
        }

      } finally {
        await duckDbService.close();
      }
    }, 30000); // 30 second timeout

    it('should successfully load kv_node_status after fixing CSV sniffing issues', async () => {
      // This test verifies that our fixes actually work in practice

      const { createDuckDBService } = await import('../services/duckdb-interface');
      const duckDbService = await createDuckDBService();

      try {
        await duckDbService.initialize();

        const entries = await zipReader.initialize();
        const kvNodeStatusFile = entries.find(e => e.path.includes('crdb_internal.kv_node_status.txt'));
        expect(kvNodeStatusFile).toBeDefined();

        const { text } = await zipReader.readFile(kvNodeStatusFile!.path);
        expect(text).toBeDefined();

        console.log(`Attempting to load kv_node_status with fixed CSV handling...`);

        // This should now succeed with our fixes
        const rowCount = await duckDbService.loadTableFromText('crdb_internal.kv_node_status', text!, '\t');

        console.log(`✓ Successfully loaded kv_node_status with ${rowCount} rows`);
        expect(rowCount).toBeGreaterThan(0);

        // Verify we can query the data
        const sampleResult = await duckDbService.query('SELECT node_id, started_at, updated_at FROM crdb_internal_kv_node_status LIMIT 1');
        expect(sampleResult).toBeDefined();
        expect(sampleResult.length).toBe(1);

      } finally {
        await duckDbService.close();
      }
    }, 30000); // 30 second timeout
  });

  describe('proto decoding', () => {
    it('should handle proto columns without crashing', () => {
      const decoder = new ProtoDecoder();

      // Test with a sample proto-like hex value
      const testHex = '\\x0a126b65792076697375616c697a6572206a6f62';

      expect(() => {
        const result = decoder.parseProtoValue(testHex, 'cockroach.sql.jobs.jobspb.Payload');
        // May return null if descriptors not loaded, but shouldn't throw
      }).not.toThrow();
    });
  });

  describe('key decoding', () => {
    it('should decode keys without errors', () => {
      const testKeys = [
        '\\x88',
        '\\x89',
        '\\xf6\\xbd',
        '12001300',
        'invalid_key'
      ];

      testKeys.forEach(key => {
        expect(() => {
          const result = prettyKey(key);
          expect(result).toBeDefined();
          expect(result.pretty).toBeDefined();
        }).not.toThrow();
      });
    });
  });

  describe('full file processing pipeline', () => {
    it('should process a complete file through the entire pipeline', async () => {
      const entries = await zipReader.initialize();
      const testFile = entries.find(e => e.path.includes('system.jobs.txt'));

      if (testFile) {
        // 1. Read file
        const { text } = await zipReader.readFile(testFile.path);
        expect(text).toBeDefined();

        // 2. Preprocess if needed
        let processedText = text!;
        if (shouldPreprocess(testFile.path, text!)) {
          processedText = preprocessCSV(text!, {
            tableName: testFile.path,
            decodeProtos: false, // Skip proto to avoid descriptor issues
            decodeKeys: true
          });
        }

        // 3. Load into DuckDB
        const duckdb = new DuckDBService();
        await duckdb.initialize();

        const tableName = 'test_jobs';
        const rowCount = await duckdb.loadTableFromText(tableName, processedText);
        expect(rowCount).toBeGreaterThanOrEqual(0);

        // 4. Query the data
        const result = await duckdb.query(`SELECT COUNT(*) as count FROM ${tableName}`);
        const rows = result.rows || result.toArray?.() || result;
        expect(rows[0].count).toBeGreaterThanOrEqual(0);

        await duckdb.close();
      }
    });
  });

  describe('error scenarios', () => {
    it('should handle missing files gracefully', async () => {
      await expect(async () => {
        await zipReader.readFile('non/existent/file.txt');
      }).rejects.toThrow();
    });

    it('should handle corrupted data gracefully', () => {
      expect(() => {
        preprocessCSV('corrupted\tdata\nwith\tmismatch\tcolumns\nextra', {
          tableName: 'test.txt'
        });
      }).not.toThrow();
    });
  });

  describe('performance', () => {
    it('should load zip file in reasonable time', async () => {
      const start = Date.now();
      await zipReader.initialize();
      const duration = Date.now() - start;

      expect(duration).toBeLessThan(2000); // Should load in under 2 seconds
    });

    it('should read large files efficiently', async () => {
      const entries = await zipReader.initialize();
      const largeFile = entries
        .filter(e => !e.isDir)
        .sort((a, b) => b.size - a.size)[0]; // Get largest file

      if (largeFile) {
        const start = Date.now();
        await zipReader.readFile(largeFile.path);
        const duration = Date.now() - start;

        console.log(`Read ${largeFile.name} (${largeFile.size} bytes) in ${duration}ms`);
        expect(duration).toBeLessThan(1000); // Should read in under 1 second
      }
    });
  });
});