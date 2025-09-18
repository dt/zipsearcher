import { DuckDBService } from './duckdb-interface';
import { DuckDBService as OriginalDuckDBService } from './duckdb';

export class BrowserDuckDBService extends OriginalDuckDBService implements DuckDBService {
  // This is just a wrapper around the original DuckDBService for the browser
  // The original service already implements all the required methods
}