export function isDefaultTableQuery(query: string, tableName?: string): boolean {
  if (!tableName) return false;

  const normalized = query.trim().toLowerCase();
  const tablePattern = new RegExp(`^select\\s+\\*\\s+from\\s+${tableName.toLowerCase()}\\s+limit\\s+\\d+`, 'i');

  return tablePattern.test(normalized);
}

export function extractTablesFromQuery(query: string): string[] {
  const tables: string[] = [];

  // Remove comments
  const cleanQuery = query.replace(/--.*$/gm, '').replace(/\/\*[\s\S]*?\*\//g, '');

  // Match FROM and JOIN clauses
  const fromMatches = cleanQuery.match(/(?:from|join)\s+([a-z_][a-z0-9_]*)/gi);

  if (fromMatches) {
    fromMatches.forEach(match => {
      const tableName = match.replace(/^(from|join)\s+/i, '').trim();
      if (tableName && !tables.includes(tableName)) {
        tables.push(tableName);
      }
    });
  }

  return tables;
}

export function generateQueryTitle(query: string, sourceTable?: string): string {
  // Check if it's a default table query
  if (sourceTable && isDefaultTableQuery(query, sourceTable)) {
    return sourceTable;
  }

  // Extract tables and create title
  const tables = extractTablesFromQuery(query);

  if (tables.length === 0) {
    return 'Query';
  }

  const tableList = tables.slice(0, 3).join(', ');
  const suffix = tables.length > 3 ? '...' : '';

  return `SELECT ... ${tableList}${suffix}`;
}