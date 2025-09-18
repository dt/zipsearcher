// Common interface for DuckDB implementations
export interface DuckDBQueryResult {
  toArray(): any[];
  get(index: number): any;
  rows?: any[];
}

export interface DuckDBConnection {
  query(sql: string): Promise<DuckDBQueryResult>;
  close(): Promise<void>;
}

export interface DuckDBService {
  initialize(): Promise<void>;
  connect(): Promise<DuckDBConnection>;
  registerFileText(filename: string, content: string): Promise<void>;
  loadTableFromText(tableName: string, content: string, delimiter?: string): Promise<number>;
  query(sql: string): Promise<DuckDBQueryResult>;
  getFunctions(): Promise<Array<{ name: string; type: string }>>;
  close(): Promise<void>;
  terminate?(): Promise<void>;
}

// Factory function to get the appropriate DuckDB implementation
export async function createDuckDBService(): Promise<DuckDBService> {
  // Check if we're in a test environment (Node.js)
  if (typeof process !== 'undefined' && process.env?.NODE_ENV === 'test') {
    // Use Node.js implementation for tests
    const { NodeDuckDBService } = await import('./duckdb-node');
    return new NodeDuckDBService();
  } else {
    // Use WASM implementation for browser
    const { BrowserDuckDBService } = await import('./duckdb-browser');
    return new BrowserDuckDBService();
  }
}