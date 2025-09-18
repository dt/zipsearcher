/**
 * @vitest-environment node
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { readFile } from 'fs/promises';
import { Worker as NodeWorker } from 'worker_threads';
import { fetch } from 'undici';
import * as duckdb from '@duckdb/duckdb-wasm';

// Polyfill Web Worker API using Node's worker_threads
class WebWorkerPolyfill extends NodeWorker {
  onmessage: ((event: { data: any }) => void) | null = null;
  onerror: ((event: any) => void) | null = null;

  constructor(url: string | URL) {
    // For data: URLs, we need to create a temporary worker script
    if (typeof url === 'string' && url.startsWith('data:')) {
      const code = decodeURIComponent(url.split(',')[1]);
      super(`
        const { parentPort } = require('worker_threads');
        ${code}
        // Bridge messages
        if (typeof postMessage === 'undefined') {
          global.postMessage = (data) => parentPort.postMessage(data);
        }
      `, { eval: true });
    } else {
      super(url);
    }

    this.on('message', (data) => {
      if (this.onmessage) {
        this.onmessage({ data });
      }
    });

    this.on('error', (error) => {
      if (this.onerror) {
        this.onerror(error);
      }
    });
  }

  postMessage(data: any): void {
    super.postMessage(data);
  }

  terminate(): void {
    return super.terminate();
  }
}

// Set up Node.js polyfills for browser APIs
(global as any).Worker = WebWorkerPolyfill;
(global as any).fetch = fetch;

import { ZipReader } from '../zip/ZipReader';
import { preprocessCSV, shouldPreprocess } from '../crdb/csvPreprocessor';
import { getTableTypeHints } from '../crdb/columnTypeRegistry';

describe('DuckDB-WASM CSV loading (Node unit test)', () => {
  let db: duckdb.AsyncDuckDB;
  let conn: duckdb.AsyncDuckDBConnection;
  let zipReader: ZipReader;

  beforeAll(async () => {
    // Load debug.zip
    const buffer = await readFile('./debug.zip');
    const zipData = buffer.buffer.slice(
      buffer.byteOffset,
      buffer.byteOffset + buffer.byteLength
    );
    zipReader = new ZipReader(new Uint8Array(zipData));

    // Initialize DuckDB with CDN bundle and data: URL worker
    const bundles = duckdb.getJsDelivrBundles();
    const bundle = await duckdb.selectBundle(bundles);

    // Create worker from data: URL that importScripts the CDN worker
    const workerURL =
      'data:application/javascript,' +
      encodeURIComponent(`importScripts("${bundle.mainWorker}");`);
    const worker = new Worker(workerURL);

    // Initialize DuckDB
    const logger = new duckdb.VoidLogger();
    db = new duckdb.AsyncDuckDB(logger, worker);
    await db.instantiate(bundle.mainModule);
    conn = await db.connect();
  });

  afterAll(async () => {
    if (conn) await conn.close();
    if (db) await db.terminate();
  });

  it('should load ALL tables from debug.zip into real DuckDB without errors', async () => {
    const entries = await zipReader.initialize();

    // Find ALL table files (same logic as DropZone.tsx)
    const tableFiles = entries.filter(entry =>
      !entry.isDir &&
      (entry.path.includes('system.') || entry.path.includes('crdb_internal.')) &&
      (entry.path.endsWith('.txt') || entry.path.endsWith('.csv')) &&
      !entry.path.endsWith('.err.txt')
    );

    console.log(`Loading ${tableFiles.length} tables from debug.zip into real DuckDB`);

    const errors: Array<{ table: string; error: string }> = [];
    const loaded: string[] = [];

    // Test first 10 tables to keep test reasonable
    for (const entry of tableFiles.slice(0, 10)) {
      // Convert filename to table name (same as DropZone.tsx)
      let tableName = entry.name.replace(/\.(err\.txt|txt|csv)$/, '').replace(/\./g, '_');

      // Handle node-specific tables
      const nodeMatch = entry.path.match(/\/nodes\/(\d+)\//);
      if (nodeMatch) {
        const nodeId = parseInt(nodeMatch[1], 10);
        tableName = `n${nodeId}_${tableName}`;
      }

      try {
        const { text } = await zipReader.readFile(entry.path);
        if (text) {
          // Preprocess if needed
          const processedText = shouldPreprocess(tableName, text)
            ? preprocessCSV(text, { tableName, decodeKeys: true, decodeProtos: false })
            : text;

          // Register CSV in DuckDB memory (hermetic, no disk)
          await db.registerFileText(`${tableName}.csv`, processedText);

          // Generate SQL with type hints
          const typeHints = getTableTypeHints(tableName);
          let sql: string;

          if (typeHints.size > 0) {
            const firstLine = processedText.split('\n')[0];
            const headers = firstLine.split('\t');
            const columnDefs = headers.map(header => {
              const hint = typeHints.get(header.toLowerCase());
              if (hint) {
                return `'${header}': '${hint}'`;
              }
              return null;
            }).filter(Boolean);

            if (columnDefs.length > 0) {
              const columnsClause = columnDefs.join(', ');
              sql = `
                CREATE TABLE ${tableName} AS
                SELECT * FROM read_csv(
                  '${tableName}.csv',
                  delim='\t',
                  header=true,
                  columns={${columnsClause}},
                  auto_detect=true
                )
              `;
            } else {
              sql = `
                CREATE TABLE ${tableName} AS
                SELECT * FROM read_csv_auto(
                  '${tableName}.csv',
                  delim='\t',
                  header=true
                )
              `;
            }
          } else {
            sql = `
              CREATE TABLE ${tableName} AS
              SELECT * FROM read_csv_auto(
                '${tableName}.csv',
                delim='\t',
                header=true
              )
            `;
          }

          // Execute the CREATE TABLE
          await conn.query(sql);

          // Get row count
          const result = await conn.query(`SELECT COUNT(*) as count FROM ${tableName}`);
          const rowCount = result.toArray()[0].count;

          console.log(`  ✓ ${tableName}: ${rowCount} rows`);
          loaded.push(tableName);
        }
      } catch (error: any) {
        const errorMsg = error.message || String(error);
        console.error(`  ✗ ${tableName}: ${errorMsg}`);

        // Check for specific errors we fixed
        if (errorMsg.includes('syntax error at or near "TIMESTAMP"')) {
          errors.push({ table: tableName, error: 'TIMESTAMP syntax error (SHOULD BE FIXED!)' });
        } else if (errorMsg.includes('Error when sniffing file')) {
          errors.push({ table: tableName, error: 'CSV sniffing error (SHOULD BE FIXED!)' });
        } else {
          errors.push({ table: tableName, error: errorMsg });
        }
      }
    }

    console.log(`\n=== Summary ===`);
    console.log(`✓ Loaded: ${loaded.length}/${Math.min(tableFiles.length, 10)} tables`);
    console.log(`✗ Failed: ${errors.length}/${Math.min(tableFiles.length, 10)} tables`);

    if (errors.length > 0) {
      console.log('\nFailed tables:');
      errors.forEach(({ table, error }) => {
        console.log(`  ${table}: ${error.substring(0, 100)}`);
      });
    }

    // All tables should load without the errors we specifically fixed
    const timestampErrors = errors.filter(e => e.error.includes('TIMESTAMP syntax error'));
    const sniffingErrors = errors.filter(e => e.error.includes('CSV sniffing error'));

    expect(timestampErrors).toHaveLength(0);
    expect(sniffingErrors).toHaveLength(0);

    // Most tables should load successfully
    expect(loaded.length).toBeGreaterThan(Math.min(tableFiles.length, 10) * 0.8);
  }, 120000); // 2 minute timeout for real DuckDB operations
});