import { describe, it, expect, beforeAll } from 'vitest';
import { Worker } from 'web-worker';
import { fetch } from 'undici';

// Set up global shims for DuckDB-WASM to work in Node
beforeAll(() => {
  // @ts-ignore - shimming global Worker for Node
  globalThis.Worker = Worker;
  // @ts-ignore - shimming global fetch for Node
  globalThis.fetch = fetch;
});

describe('DuckDB Integration Tests', () => {
  it('should load CSV data and query it successfully', async () => {
    // Sample CSV data
    const csvData = `id,name,age,city
1,Alice,25,New York
2,Bob,30,San Francisco
3,Charlie,35,Chicago
4,Diana,28,Boston`;

    // Create DuckDB worker from data URL (following DuckDB CDN pattern)
    const workerScript = `
      importScripts('https://cdn.jsdelivr.net/npm/@duckdb/duckdb-wasm@1.28.0/dist/duckdb-browser-eh.worker.js');
    `;

    const dataUrl = `data:application/javascript,${encodeURIComponent(workerScript)}`;
    const worker = new Worker(dataUrl);

    // Import DuckDB-WASM dynamically
    const duckdb = await import('@duckdb/duckdb-wasm');

    // Initialize DuckDB with the worker
    const logger = new duckdb.ConsoleLogger();
    const db = new duckdb.AsyncDuckDB(logger, worker);
    await db.instantiate('https://cdn.jsdelivr.net/npm/@duckdb/duckdb-wasm@1.28.0/dist/duckdb-eh.wasm');

    // Get connection
    const conn = await db.connect();

    // Register CSV data as file
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

    // Test aggregation
    const result3 = await conn.query('SELECT AVG(age) as avg_age, COUNT(*) as total FROM users');
    const avgResult = result3.toArray()[0];
    expect(avgResult.total).toBe(4);
    expect(avgResult.avg_age).toBe(29.5);

    // Clean up
    await conn.close();
    await db.terminate();
    worker.terminate();
  });

  it('should handle multiple CSV files and JOIN operations', async () => {
    const employeesData = `emp_id,name,dept_id,salary
1,Alice,101,75000
2,Bob,102,80000
3,Charlie,101,85000
4,Diana,103,70000`;

    const departmentsData = `dept_id,dept_name,location
101,Engineering,San Francisco
102,Marketing,New York
103,Sales,Chicago`;

    const workerScript = `
      importScripts('https://cdn.jsdelivr.net/npm/@duckdb/duckdb-wasm@1.28.0/dist/duckdb-browser-eh.worker.js');
    `;

    const dataUrl = `data:application/javascript,${encodeURIComponent(workerScript)}`;
    const worker = new Worker(dataUrl);

    const duckdb = await import('@duckdb/duckdb-wasm');
    const logger = new duckdb.ConsoleLogger();
    const db = new duckdb.AsyncDuckDB(logger, worker);
    await db.instantiate('https://cdn.jsdelivr.net/npm/@duckdb/duckdb-wasm@1.28.0/dist/duckdb-eh.wasm');

    const conn = await db.connect();

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

    // Test aggregation with GROUP BY
    const deptStats = await conn.query(`
      SELECT d.dept_name, COUNT(*) as emp_count, AVG(e.salary) as avg_salary
      FROM employees e
      JOIN departments d ON e.dept_id = d.dept_id
      GROUP BY d.dept_name
      ORDER BY avg_salary DESC
    `);

    const deptRows = deptStats.toArray();
    expect(deptRows).toHaveLength(3);
    expect(deptRows[0].dept_name).toBe('Engineering');
    expect(deptRows[0].emp_count).toBe(2);
    expect(deptRows[0].avg_salary).toBe(80000);

    await conn.close();
    await db.terminate();
    worker.terminate();
  });

  it('should handle complex queries with window functions', async () => {
    const salesData = `date,product,sales_rep,amount
2023-01-15,Widget A,Alice,1500
2023-01-20,Widget B,Bob,2000
2023-01-25,Widget A,Alice,1800
2023-02-10,Widget C,Charlie,2500
2023-02-15,Widget B,Bob,2200
2023-02-20,Widget A,Alice,1600
2023-03-05,Widget C,Charlie,2800
2023-03-10,Widget B,Bob,1900`;

    const workerScript = `
      importScripts('https://cdn.jsdelivr.net/npm/@duckdb/duckdb-wasm@1.28.0/dist/duckdb-browser-eh.worker.js');
    `;

    const dataUrl = `data:application/javascript,${encodeURIComponent(workerScript)}`;
    const worker = new Worker(dataUrl);

    const duckdb = await import('@duckdb/duckdb-wasm');
    const logger = new duckdb.ConsoleLogger();
    const db = new duckdb.AsyncDuckDB(logger, worker);
    await db.instantiate('https://cdn.jsdelivr.net/npm/@duckdb/duckdb-wasm@1.28.0/dist/duckdb-eh.wasm');

    const conn = await db.connect();

    await db.registerFileText('sales.csv', salesData);

    await conn.query(`
      CREATE TABLE sales AS
      SELECT
        date::DATE as sale_date,
        product,
        sales_rep,
        amount
      FROM read_csv_auto('sales.csv')
    `);

    // Test window function - running total by sales rep
    const result = await conn.query(`
      SELECT
        sales_rep,
        sale_date,
        amount,
        SUM(amount) OVER (PARTITION BY sales_rep ORDER BY sale_date) as running_total,
        RANK() OVER (PARTITION BY sales_rep ORDER BY amount DESC) as amount_rank
      FROM sales
      ORDER BY sales_rep, sale_date
    `);

    const rows = result.toArray();
    expect(rows).toHaveLength(8);

    // Check Alice's running total
    const aliceRows = rows.filter(r => r.sales_rep === 'Alice');
    expect(aliceRows).toHaveLength(3);
    expect(aliceRows[0].running_total).toBe(1500);
    expect(aliceRows[1].running_total).toBe(3300); // 1500 + 1800
    expect(aliceRows[2].running_total).toBe(4900); // 1500 + 1800 + 1600

    // Test monthly aggregation
    const monthlyResult = await conn.query(`
      SELECT
        DATE_TRUNC('month', sale_date) as month,
        COUNT(*) as transaction_count,
        SUM(amount) as total_amount,
        AVG(amount) as avg_amount
      FROM sales
      GROUP BY DATE_TRUNC('month', sale_date)
      ORDER BY month
    `);

    const monthlyRows = monthlyResult.toArray();
    expect(monthlyRows).toHaveLength(3);
    expect(monthlyRows[0].transaction_count).toBe(2); // January
    expect(monthlyRows[1].transaction_count).toBe(3); // February
    expect(monthlyRows[2].transaction_count).toBe(3); // March

    await conn.close();
    await db.terminate();
    worker.terminate();
  });
});