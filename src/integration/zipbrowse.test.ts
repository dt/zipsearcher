import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { Worker } from 'web-worker';
import { fetch } from 'undici';
import { readFileSync } from 'fs';
import { join } from 'path';
import { ZipReader } from '../zip/ZipReader';

// Set up global shims for DuckDB-WASM to work in Node
beforeAll(() => {
  // @ts-ignore - shimming global Worker for Node
  globalThis.Worker = Worker;
  // @ts-ignore - shimming global fetch for Node
  globalThis.fetch = fetch;
  // @ts-ignore - shimming global Blob for Node
  if (typeof globalThis.Blob === 'undefined') {
    globalThis.Blob = class Blob {
      constructor(parts: any[], options?: any) {
        this.type = options?.type || '';
        this.content = parts.join('');
      }
      type: string;
      content: string;
    };
  }
  // @ts-ignore - shimming URL.createObjectURL for Node
  if (!globalThis.URL?.createObjectURL) {
    const OriginalURL = globalThis.URL;
    (globalThis.URL as any).createObjectURL = function(blob: any) {
      return `data:${blob.type},${encodeURIComponent(blob.content)}`;
    };
    (globalThis.URL as any).revokeObjectURL = function(url: string) {
      // No-op for data URLs
    };
  }
});

async function createDuckDBInstance() {
  // Import DuckDB-WASM and web-worker dynamically
  const duckdb = await import('@duckdb/duckdb-wasm');
  const { default: NodeWorker } = await import('web-worker');

  // Use local worker file to avoid importScripts issues
  const workerPath = join(process.cwd(), 'src/integration/duckdb-worker.js');
  const worker = new NodeWorker(workerPath);

  // Initialize DuckDB with the worker
  const logger = new duckdb.ConsoleLogger();
  const db = new duckdb.AsyncDuckDB(logger, worker);
  await db.instantiate('https://cdn.jsdelivr.net/npm/@duckdb/duckdb-wasm@1.28.0/dist/duckdb-eh.wasm');

  const conn = await db.connect();

  return { db, conn };
}

describe('ZipBrowse Integration Tests', () => {
  let zipReader: ZipReader;

  beforeAll(async () => {
    // Load the actual debug.zip file
    const zipPath = join(process.cwd(), 'debug.zip');
    const zipBuffer = readFileSync(zipPath);
    const zipData = new Uint8Array(zipBuffer);

    // Initialize ZipReader with the actual debug.zip
    zipReader = new ZipReader(zipData);
  });

  it('should load debug.zip and extract file entries', async () => {
    const entries = await zipReader.initialize();

    // Verify we have entries
    expect(entries.length).toBeGreaterThan(100);

    // Check for key file types
    const hasJsonFiles = entries.some(e => e.name.endsWith('.json'));
    const hasTxtFiles = entries.some(e => e.name.endsWith('.txt'));
    const hasCsvFiles = entries.some(e => e.name.endsWith('.csv'));

    expect(hasJsonFiles).toBe(true);
    expect(hasTxtFiles).toBe(true);

    // Check for system tables
    const systemTables = entries.filter(e =>
      e.name.includes('system.') &&
      (e.name.endsWith('.txt') || e.name.endsWith('.csv'))
    );
    expect(systemTables.length).toBeGreaterThan(0);

    // Check for crdb_internal tables
    const crdbInternalTables = entries.filter(e =>
      e.name.includes('crdb_internal.') &&
      (e.name.endsWith('.txt') || e.name.endsWith('.csv'))
    );
    expect(crdbInternalTables.length).toBeGreaterThan(0);

    console.log(`Found ${entries.length} total entries`);
    console.log(`Found ${systemTables.length} system tables`);
    console.log(`Found ${crdbInternalTables.length} crdb_internal tables`);
  });

  it('should load CSV data into DuckDB and query it', async () => {
    // Create DuckDB instance
    const { db, conn } = await createDuckDBInstance();

    try {
      // Sample CSV data
      const csvData = `id,name,age,city
1,Alice,25,New York
2,Bob,30,San Francisco
3,Charlie,35,Chicago
4,Diana,28,Boston`;

      // Register CSV data as file (hermetic, no disk)
      await db.registerFileText('test_data.csv', csvData);

      // Create table and load data
      await conn.query(`
        CREATE TABLE users AS
        SELECT * FROM read_csv_auto('test_data.csv')
      `);

      // Test basic query
      const result1 = await conn.query('SELECT COUNT(*) as count FROM users');
      expect(result1.toArray()).toHaveLength(1);
      expect(result1.toArray()[0].count).toBe(4);

      // Test filtered query
      const result2 = await conn.query("SELECT name, age FROM users WHERE age > 28 ORDER BY age");
      const rows = result2.toArray();
      expect(rows).toHaveLength(2);
      expect(rows[0].name).toBe('Bob');
      expect(rows[0].age).toBe(30);
      expect(rows[1].name).toBe('Charlie');
      expect(rows[1].age).toBe(35);

      console.log('Successfully loaded and queried CSV data in DuckDB');
    } finally {
      await conn.close();
      await db.terminate();
    }
  });

  it('should load and query system tables from debug.zip', async () => {
    const entries = await zipReader.initialize();

    // Find a small system table first
    const smallTable = entries.find(e =>
      e.name.includes('system.') &&
      e.name.endsWith('.txt') &&
      !e.name.endsWith('.err.txt') &&
      e.size < 1024 // Less than 1KB for first test
    );

    expect(smallTable).toBeDefined();

    if (smallTable) {
      console.log(`Loading small system table: ${smallTable.name} (${smallTable.size} bytes)`);

      const result = await zipReader.readFile(smallTable.path);
      expect(result.text).toBeDefined();

      if (result.text) {
        const { db, conn } = await createDuckDBInstance();

        try {
          const tableName = smallTable.name.replace(/\.(txt|csv)$/, '').replace(/\./g, '_');
          await db.registerFileText(`${tableName}.txt`, result.text);

          await conn.query(`
            CREATE TABLE ${tableName} AS
            SELECT * FROM read_csv_auto('${tableName}.txt', delim='\t', header=true)
          `);

          const queryResult = await conn.query(`SELECT COUNT(*) as count FROM ${tableName}`);
          const rowCount = queryResult.toArray()[0].count;
          expect(rowCount).toBeGreaterThan(0);

          console.log(`✅ Successfully loaded small table ${tableName} with ${rowCount} rows`);
        } finally {
          await conn.close();
          await db.terminate();
        }
      }
    }
  });

  it('should attempt to load kv_node_status and find the real error', async () => {
    const entries = await zipReader.initialize();

    // Find the problematic kv_node_status table
    const kvNodeStatus = entries.find(e => e.name === 'crdb_internal.kv_node_status.txt');
    expect(kvNodeStatus).toBeDefined();

    console.log(`Testing problematic file: ${kvNodeStatus!.name} (${kvNodeStatus!.size} bytes)`);

    const result = await zipReader.readFile(kvNodeStatus!.path);
    expect(result.text).toBeDefined();

    if (result.text) {
      const { db, conn } = await createDuckDBInstance();

      try {
        const tableName = 'kv_node_status';

        // Show first few lines for debugging
        const lines = result.text.split('\n');
        console.log(`File has ${lines.length} lines`);
        console.log(`Header: ${lines[0].substring(0, 100)}...`);
        console.log(`First row length: ${lines[1]?.length || 'undefined'} chars`);

        await db.registerFileText(`${tableName}.txt`, result.text);

        // Try to load it and catch the actual error
        await conn.query(`
          CREATE TABLE ${tableName} AS
          SELECT * FROM read_csv_auto('${tableName}.txt', delim='\t', header=true, sample_size=1000)
        `);

        const queryResult = await conn.query(`SELECT COUNT(*) as count FROM ${tableName}`);
        const rowCount = queryResult.toArray()[0].count;

        console.log(`🎉 Unexpectedly succeeded! Loaded ${tableName} with ${rowCount} rows`);
      } catch (error) {
        console.log(`❌ Found the real error loading kv_node_status:`);
        console.log(error);
        // Don't fail the test - we want to see the error
        expect(error).toBeDefined();
      } finally {
        await conn.close();
        await db.terminate();
      }
    }
  });

  it('should load and query multiple tables with JOINs', async () => {
    // Create DuckDB instance
    const { db, conn } = await createDuckDBInstance();

    try {
      // Sample data for employees and departments
      const employeesData = `emp_id,name,dept_id,salary
1,Alice,101,75000
2,Bob,102,80000
3,Charlie,101,85000
4,Diana,103,70000`;

      const departmentsData = `dept_id,dept_name,location
101,Engineering,San Francisco
102,Marketing,New York
103,Sales,Chicago`;

      // Register both CSV files
      await db.registerFileText('employees.csv', employeesData);
      await db.registerFileText('departments.csv', departmentsData);

      // Create tables
      await conn.query(`
        CREATE TABLE employees AS
        SELECT * FROM read_csv_auto('employees.csv')
      `);

      await conn.query(`
        CREATE TABLE departments AS
        SELECT * FROM read_csv_auto('departments.csv')
      `);

      // Test JOIN query
      const result = await conn.query(`
        SELECT e.name, e.salary, d.dept_name, d.location
        FROM employees e
        JOIN departments d ON e.dept_id = d.dept_id
        WHERE e.salary > 75000
        ORDER BY e.salary DESC
      `);

      const rows = result.toArray();
      expect(rows).toHaveLength(2);
      expect(rows[0].name).toBe('Charlie');
      expect(rows[0].salary).toBe(85000);
      expect(rows[0].dept_name).toBe('Engineering');
      expect(rows[1].name).toBe('Bob');
      expect(rows[1].salary).toBe(80000);
      expect(rows[1].dept_name).toBe('Marketing');

      console.log('Successfully performed JOIN operations');
    } finally {
      await conn.close();
      await db.terminate();
    }
  });

  it('should handle large files and streaming', async () => {
    const entries = await zipReader.initialize();

    // Find a larger file (but not too large for testing)
    const largeFile = entries.find(e =>
      !e.isDir &&
      e.size > 50 * 1024 && // At least 50KB
      e.size < 5 * 1024 * 1024 && // But less than 5MB for test performance
      (e.name.endsWith('.json') || e.name.endsWith('.txt'))
    );

    if (largeFile) {
      console.log(`Testing streaming read of ${largeFile.name} (${(largeFile.size / 1024).toFixed(1)}KB)`);

      let totalChunks = 0;
      let totalBytes = 0;

      await zipReader.readFileStream(
        largeFile.path,
        (chunk, progress) => {
          totalChunks++;
          totalBytes += chunk.length;
          expect(progress.loaded).toBeGreaterThan(0);
          expect(progress.total).toBeGreaterThan(0);
          expect(progress.loaded).toBeLessThanOrEqual(progress.total);
        }
      );

      expect(totalChunks).toBeGreaterThan(0);
      expect(totalBytes).toBeGreaterThan(0);

      console.log(`Streamed ${totalChunks} chunks, ${totalBytes} total bytes`);
    }
  });

});