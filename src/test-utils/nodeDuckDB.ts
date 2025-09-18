import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { DuckDBInstance, DuckDBConnection } from '@duckdb/node-api';

export class NodeDuckDB {
  private instance!: DuckDBInstance;
  private conn!: DuckDBConnection;
  private dir!: string;

  async init() {
    this.instance = await DuckDBInstance.create(':memory:');
    this.conn = await this.instance.connect();
    this.dir = mkdtempSync(join(tmpdir(), 'duckdb-ut-'));
  }

  async query(sql: string) {
    return this.conn.run(sql);
  }

  /** Writes text to a temp file and creates a view via read_csv_auto (triggers sniffer). */
  async createViewFromCsvAuto(viewName: string, text: string) {
    const path = join(this.dir, `${viewName}.txt`);
    writeFileSync(path, text, 'utf8');
    // sample_size=-1 so the sniffer examines the whole file, like your repro
    await this.conn.run(
      `create or replace view ${viewName} as from read_csv_auto('${path}', header=true, sample_size=-1)`
    );
  }

  /** Create view with explicit column types like the browser does */
  async createViewWithTypeHints(viewName: string, text: string, columnTypes: Record<string, string>) {
    const path = join(this.dir, `${viewName}.txt`);
    writeFileSync(path, text, 'utf8');

    // Build columns clause like the browser DuckDB service does
    const columnsClause = Object.entries(columnTypes)
      .map(([col, type]) => `'${col}': '${type}'`)
      .join(', ');

    await this.conn.run(
      `create or replace view ${viewName} as from read_csv('${path}', header=true, delim='\t', columns={${columnsClause}}, auto_detect=false)`
    );
  }

  dispose() {
    try { this.conn.closeSync(); } catch {}
    try { rmSync(this.dir, { recursive: true, force: true }); } catch {}
  }
}