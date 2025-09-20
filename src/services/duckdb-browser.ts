import { type DuckDBService, type DuckDBConnection, type DuckDBQueryResult } from './duckdb-interface';
import { DuckDBService as OriginalDuckDBService } from './duckdb';

class BrowserDuckDBQueryResult implements DuckDBQueryResult {
  private data: any[];
  constructor(data: any[]) {
    this.data = data;
  }

  toArray(): any[] {
    return this.data;
  }

  get(index: number): any {
    return this.data[index];
  }

  get rows(): any[] {
    return this.data;
  }
}

class BrowserDuckDBConnectionImpl implements DuckDBConnection {
  private service: OriginalDuckDBService;
  constructor(service: OriginalDuckDBService) {
    this.service = service;
  }

  async query(sql: string): Promise<DuckDBQueryResult> {
    const result = await this.service.query(sql);
    return new BrowserDuckDBQueryResult(result);
  }

  async close(): Promise<void> {
    // Connection doesn't need separate closing in browser implementation
  }
}

export class BrowserDuckDBService extends OriginalDuckDBService implements DuckDBService {
  async connect(): Promise<DuckDBConnection> {
    return new BrowserDuckDBConnectionImpl(this);
  }

  async registerFileText(filename: string, content: string): Promise<void> {
    if (!this.db) {
      throw new Error('DuckDB not initialized');
    }
    await this.db.registerFileText(filename, content);
  }

  async getFunctions(): Promise<Array<{ name: string; type: string }>> {
    return this.getDuckDBFunctions();
  }

  async query(sql: string): Promise<DuckDBQueryResult> {
    const result = await super.query(sql);
    return new BrowserDuckDBQueryResult(result);
  }

  async terminate(): Promise<void> {
    await this.close();
  }
}