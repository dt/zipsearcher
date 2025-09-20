import * as duckdb from '@duckdb/duckdb-wasm';
import { preprocessCSV, shouldPreprocess } from '../crdb/csvPreprocessor';
import { getTableTypeHints } from '../crdb/columnTypeRegistry';
import duckdb_wasm from '@duckdb/duckdb-wasm/dist/duckdb-mvp.wasm?url';
import mvp_worker from '@duckdb/duckdb-wasm/dist/duckdb-browser-mvp.worker.js?url';
import duckdb_wasm_eh from '@duckdb/duckdb-wasm/dist/duckdb-eh.wasm?url';
import eh_worker from '@duckdb/duckdb-wasm/dist/duckdb-browser-eh.worker.js?url';

export class DuckDBService {
  protected db: duckdb.AsyncDuckDB | null = null;
  protected conn: duckdb.AsyncDuckDBConnection | null = null;
  private initialized = false;
  private loadedTables = new Set<string>();

  async initialize(): Promise<void> {
    if (this.initialized) return;

    try {
      // Configure DuckDB with workers
      const MANUAL_BUNDLES: duckdb.DuckDBBundles = {
        mvp: {
          mainModule: duckdb_wasm,
          mainWorker: mvp_worker,
        },
        eh: {
          mainModule: duckdb_wasm_eh,
          mainWorker: eh_worker,
        },
      };

      // Select bundle based on browser support
      const bundle = await duckdb.selectBundle(MANUAL_BUNDLES);

      // Instantiate worker
      const worker = new Worker(bundle.mainWorker!);
      // Use a silent logger to avoid spammy console output
      const logger = new duckdb.VoidLogger();

      // Initialize database
      this.db = new duckdb.AsyncDuckDB(logger, worker);
      await this.db.instantiate(bundle.mainModule, bundle.pthreadWorker);

      // Configure database options
      await this.db.open({
        query: {
          castBigIntToDouble: true,
          castTimestampToDate: true  // Convert timestamps to JavaScript Date objects
        }
      });

      // Create connection
      this.conn = await this.db.connect();

      this.initialized = true;
    } catch (error) {
      console.error('Failed to initialize DuckDB:', error);
      throw error;
    }
  }

  async loadTableFromText(
    tableName: string,
    content: string,
    delimiter: string = '\t'
  ): Promise<number> {
    if (!this.conn) {
      throw new Error('DuckDB not initialized');
    }

    if (this.loadedTables.has(tableName)) {
      // console.log(`Table ${tableName} already loaded`);
      // Get and return existing row count
      const cleanTableName = tableName.replace(/[^a-zA-Z0-9_]/g, '_');
      const countResult = await this.conn.query(
        `SELECT COUNT(*) as count FROM ${cleanTableName}`
      );
      return countResult.toArray()[0].count;
    }

    try {
      // Clean table name for SQL
      const cleanTableName = tableName.replace(/[^a-zA-Z0-9_]/g, '_');

      // Check if we should preprocess this table
      let processedContent = content;
      let usePreprocessed = false;

      if (shouldPreprocess(tableName, content)) {
        try {
          processedContent = preprocessCSV(content, {
            tableName,
            delimiter,
            decodeKeys: true,
            decodeProtos: true // Enable proto decoding
          });
          usePreprocessed = true;
        } catch (err) {
          console.warn(`Preprocessing failed for ${tableName}:`, err);
          processedContent = content;
        }
      }

      // Create table from CSV/TSV content
      // First, register the content as a virtual file
      await this.db!.registerFileText(
        `${cleanTableName}.txt`,
        processedContent
      );

      // Drop table if exists
      await this.conn.query(`DROP TABLE IF EXISTS ${cleanTableName}`);

      // Check if we have type hints for this table
      const typeHints = getTableTypeHints(tableName);

      // Create table from CSV with auto-detection or explicit types
      try {
        let sql: string;

        if (typeHints.size > 0) {
          // For tables with type hints, try explicit column definitions first
          const firstLine = processedContent.split('\n')[0];
          const headers = firstLine.split(delimiter);

          // Build column definitions with type hints for ALL columns
          const columnDefs = headers.map(header => {
            const hint = typeHints.get(header.toLowerCase());
            const columnType = hint || 'VARCHAR'; // Safe default for columns without hints
            return `'${header}': '${columnType}'`;
          });

          const columnsClause = columnDefs.join(', ');
          sql = `
            CREATE TABLE ${cleanTableName} AS
            SELECT * FROM read_csv(
              '${cleanTableName}.txt',
              delim='${delimiter}',
              header=true,
              columns={${columnsClause}},
              auto_detect=false,
              quote='"',
              escape='"'
            )
          `;
        } else {
          // No type hints, use standard auto-detection
          sql = `
            CREATE TABLE ${cleanTableName} AS
            SELECT * FROM read_csv_auto(
              '${cleanTableName}.txt',
              delim='${delimiter}',
              header=true
            )
          `;
        }

        await this.conn.query(sql);
      } catch (parseError: any) {
        // If preprocessing caused issues or CSV sniffing failed, try with original content
        if (usePreprocessed && (parseError.message?.includes('sniffing file') ||
                               parseError.message?.includes('Error when sniffing file'))) {
          // console.log(`Retrying ${tableName} without preprocessing due to parse error`);

          // Re-register with original content
          await this.db!.registerFileText(
            `${cleanTableName}.txt`,
            content
          );

          const sql = `
            CREATE TABLE ${cleanTableName} AS
            SELECT * FROM read_csv_auto(
              '${cleanTableName}.txt',
              delim='${delimiter}',
              header=true
            )
          `;

          await this.conn.query(sql);
        } else if (parseError.message?.includes('Error when sniffing file') ||
                   parseError.message?.includes('not possible to automatically detect') ||
                   parseError.message?.includes('Could not convert string') ||
                   parseError.message?.includes('Conversion Error: CSV Error')) {
          // Some files have such complex data that DuckDB can't auto-detect them
          // Try with very explicit parameters and treat everything as VARCHAR
          console.warn(`Cannot auto-detect CSV format for ${tableName}, using fallback`);

          // Parse headers manually
          const lines = content.split('\n');
          const headerLine = lines[0];
          const headers = headerLine.split(delimiter);

          // Apply type hints if available, otherwise use VARCHAR to avoid detection issues
          const columnDefs = headers.map(header => {
            const hint = typeHints.get(header.toLowerCase());
            const safeType = hint || 'VARCHAR';
            return `'${header}': '${safeType}'`;
          }).join(', ');

          const fallbackSql = `
            CREATE TABLE ${cleanTableName} AS
            SELECT * FROM read_csv(
              '${cleanTableName}.txt',
              delim='${delimiter}',
              header=true,
              columns={${columnDefs}},
              auto_detect=false,
              sample_size=1
            )
          `;

          try {
            await this.conn.query(fallbackSql);
          } catch (fallbackError: any) {
            console.error(`Even fallback failed for ${tableName}:`, fallbackError.message);
            throw parseError; // Throw original error if fallback also fails
          }
        } else {
          throw parseError;
        }
      }

      // Get row count
      const countResult = await this.conn.query(
        `SELECT COUNT(*) as count FROM ${cleanTableName}`
      );
      const count = countResult.toArray()[0].count;

      // console.log(`Loaded table ${cleanTableName} with ${count} rows`);
      this.loadedTables.add(tableName);
      return count;
    } catch (error) {
      console.error(`Failed to load table ${tableName}:`, error);
      throw error;
    }
  }

  async query(sql: string): Promise<any> {
    if (!this.conn) {
      throw new Error('DuckDB not initialized');
    }

    try {
      const result = await this.conn.query(sql);
      const data = result.toArray();

      // Get column names and check for timestamps in the data
      // DuckDB returns timestamps as numbers (milliseconds since epoch)
      if (data.length > 0) {
        const firstRow = data[0];
        Object.keys(firstRow).forEach(columnName => {
          const value = firstRow[columnName];
          // Check if this looks like a timestamp (large number in milliseconds range)
          if (typeof value === 'number' && value > 1000000000000 && value < 2000000000000) {
            // This is likely a timestamp in milliseconds, convert all rows
            data.forEach(row => {
              if (typeof row[columnName] === 'number') {
                row[columnName] = new Date(row[columnName]);
              } else if (typeof row[columnName] === 'bigint') {
                row[columnName] = new Date(Number(row[columnName]));
              }
            });
          }
        });
      }

      return data;
    } catch (error) {
      console.error('Query failed:', error);
      throw error;
    }
  }

  async getTableSchema(tableName: string): Promise<any[]> {
    const cleanTableName = tableName.replace(/[^a-zA-Z0-9_]/g, '_');
    return this.query(`
      SELECT column_name, data_type
      FROM information_schema.columns
      WHERE table_name = '${cleanTableName}'
    `);
  }

  async getLoadedTables(): Promise<string[]> {
    if (!this.conn) return [];

    try {
      const result = await this.conn.query(`
        SELECT table_name
        FROM information_schema.tables
        WHERE table_schema = 'main'
      `);
      return result.toArray().map(row => row.table_name);
    } catch {
      return [];
    }
  }

  async getDuckDBFunctions(): Promise<Array<{name: string; type: string; description?: string}>> {
    if (!this.conn) return [];

    try {
      // Get all available functions from DuckDB
      const result = await this.conn.query(`
        SELECT DISTINCT
          function_name,
          function_type
        FROM duckdb_functions()
        WHERE function_type IN ('scalar', 'aggregate')
        ORDER BY function_name
      `);

      const functions = result.toArray().map(row => ({
        name: row.function_name.toUpperCase(),
        type: row.function_type
      }));


      return functions;
    } catch (err) {
      console.warn('Failed to get DuckDB functions:', err);
      // Fallback to a basic set including TO_TIMESTAMP
      return [
        { name: 'COUNT', type: 'aggregate' },
        { name: 'SUM', type: 'aggregate' },
        { name: 'AVG', type: 'aggregate' },
        { name: 'MIN', type: 'aggregate' },
        { name: 'MAX', type: 'aggregate' },
        { name: 'CAST', type: 'scalar' },
        { name: 'COALESCE', type: 'scalar' },
        { name: 'UPPER', type: 'scalar' },
        { name: 'LOWER', type: 'scalar' },
        { name: 'LENGTH', type: 'scalar' },
        { name: 'SUBSTRING', type: 'scalar' },
        { name: 'REPLACE', type: 'scalar' },
        { name: 'TRIM', type: 'scalar' },
        { name: 'ABS', type: 'scalar' },
        { name: 'ROUND', type: 'scalar' },
        { name: 'TO_TIMESTAMP', type: 'scalar' },
        { name: 'TO_DATE', type: 'scalar' },
        { name: 'TO_CHAR', type: 'scalar' }
      ];
    }
  }

  async getDuckDBKeywords(): Promise<string[]> {
    if (!this.conn) return [];

    try {
      // Get DuckDB keywords
      const result = await this.conn.query(`
        SELECT keyword_name FROM duckdb_keywords()
      `);

      return result.toArray().map(row => row.keyword_name.toUpperCase());
    } catch (err) {
      console.warn('Failed to get DuckDB keywords:', err);
      // Fallback to basic SQL keywords
      return [
        'SELECT', 'FROM', 'WHERE', 'JOIN', 'LEFT', 'RIGHT', 'INNER',
        'GROUP', 'BY', 'ORDER', 'HAVING', 'LIMIT', 'OFFSET', 'AS',
        'ON', 'AND', 'OR', 'NOT', 'IN', 'EXISTS', 'BETWEEN', 'LIKE'
      ];
    }
  }

  async close(): Promise<void> {
    if (this.conn) {
      await this.conn.close();
      this.conn = null;
    }
    if (this.db) {
      await this.db.terminate();
      this.db = null;
    }
    this.initialized = false;
    this.loadedTables.clear();
  }
}

// Singleton instance
export const duckDBService = new DuckDBService();