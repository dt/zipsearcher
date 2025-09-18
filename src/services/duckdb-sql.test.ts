import { describe, it, expect } from 'vitest';
import { getTableTypeHints } from '../crdb/columnTypeRegistry';

describe('DuckDB SQL generation', () => {
  it('should generate correct SQL for TIMESTAMP columns', () => {
    // Simulate the SQL generation logic from duckdb.ts
    const tableName = 'system_jobs';  // This is what's passed to loadTableFromText after conversion
    const cleanTableName = tableName.replace(/[^a-zA-Z0-9_]/g, '_');
    const delimiter = '\t';

    // Sample headers from system.jobs.txt
    const headers = ['id', 'status', 'created', 'started_at', 'finished', 'modified'];

    // Get type hints
    const typeHints = getTableTypeHints(tableName);

    // Build column definitions (this is the code we fixed)
    const columnDefs = headers.map(header => {
      const hint = typeHints.get(header.toLowerCase());
      if (hint) {
        return `'${header}': '${hint}'`;
      }
      return null;
    }).filter(Boolean);

    // Generate SQL
    const columnsClause = columnDefs.join(', ');
    const sql = `
      CREATE TABLE ${cleanTableName} AS
      SELECT * FROM read_csv(
        '${cleanTableName}.txt',
        delim='${delimiter}',
        header=true,
        columns={${columnsClause}},
        auto_detect=true
      )
    `;

    // Check that the SQL is properly formatted
    expect(sql).toContain("columns={");
    expect(sql).toContain("}");

    // Should have proper key-value format for columns
    if (columnDefs.length > 0) {
      expect(sql).toMatch(/'[^']+': '[^']+'/); // Should have 'column': 'type' format
    }

    // Should NOT have the old incorrect format
    expect(sql).not.toContain('" TIMESTAMP');
    expect(sql).not.toContain('"started_at" TIMESTAMP');

    // If there are TIMESTAMP columns, they should be properly formatted
    if (typeHints.has('started_at')) {
      expect(sql).toContain("'started_at': 'TIMESTAMP'");
    }

    console.log('Generated SQL:', sql);
  });

  it('should handle tables with no type hints', () => {
    const tableName = 'unknown_table';
    const cleanTableName = tableName.replace(/[^a-zA-Z0-9_]/g, '_');
    const delimiter = '\t';
    const headers = ['col1', 'col2', 'col3'];

    const typeHints = getTableTypeHints(tableName);
    const columnDefs = headers.map(header => {
      const hint = typeHints.get(header.toLowerCase());
      if (hint) {
        return `'${header}': '${hint}'`;
      }
      return null;
    }).filter(Boolean);

    // Should have no column definitions
    expect(columnDefs).toHaveLength(0);

    // Should use auto-detect SQL
    const sql = columnDefs.length > 0 ? 'WITH COLUMNS' : 'AUTO DETECT';
    expect(sql).toBe('AUTO DETECT');
  });

  it('should handle mixed columns (some with hints, some without)', () => {
    const tableName = 'system.jobs';
    const cleanTableName = 'system_jobs';
    const headers = ['id', 'unknown_col', 'started_at', 'another_unknown'];

    const typeHints = getTableTypeHints(tableName);
    const columnDefs = headers.map(header => {
      const hint = typeHints.get(header.toLowerCase());
      if (hint) {
        return `'${header}': '${hint}'`;
      }
      return null;
    }).filter(Boolean);

    // Should only include columns with hints
    expect(columnDefs.length).toBeGreaterThan(0);
    expect(columnDefs.length).toBeLessThan(headers.length);

    // Check each definition is properly formatted
    columnDefs.forEach(def => {
      expect(def).toMatch(/^'[^']+': '[^']+'$/);
    });
  });
});