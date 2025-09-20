import type { Monaco } from '@monaco-editor/react';
import type { languages } from 'monaco-editor';
import { duckDBService } from './duckdb';

interface SchemaCache {
  tables: string[];
  columns: Map<string, Array<{ name: string; type: string }>>;
  functions: Array<{ name: string; type: string; description?: string }>;
  keywords: string[];
  lastUpdated: number;
}

let schemaCache: SchemaCache | null = null;

async function updateSchemaCache() {
  const tables = await duckDBService.getLoadedTables();
  const columns = new Map<string, Array<{ name: string; type: string }>>();

  for (const table of tables) {
    try {
      const schema = await duckDBService.getTableSchema(table);
      columns.set(table, schema.map(col => ({
        name: col.column_name,
        type: col.data_type
      })));
    } catch (err) {
      console.warn(`Failed to get schema for ${table}:`, err);
    }
  }

  // Get DuckDB functions and keywords
  const functions = await duckDBService.getDuckDBFunctions();
  const keywords = await duckDBService.getDuckDBKeywords();

  schemaCache = {
    tables,
    columns,
    functions,
    keywords,
    lastUpdated: Date.now()
  };

  // // console.log('Schema cache updated:', {
  //   tables: tables.length,
  //   columns: columns.size,
  //   functions: functions.length,
  //   keywords: keywords.length
  // });

  return schemaCache;
}

// SQL Context Extraction
const WORD_OR_PUNCT = /\b\w+\b|[().,]/g;
const KEYWORDS = new Set([
  "select","from","join","left","right","inner","outer","full","cross",
  "on","where","group","order","having","limit","as","by","and","or","not",
  "in","exists","between","like","is","null","distinct","union","all",
  "except","intersect","with","recursive"
]);

type Context = {
  tables: Set<string>;              // canonical table names in scope
  aliases: Map<string, string>;     // alias -> canonical table name
};

function lastSelectSlice(sql: string, cursor: number): string {
  // Find the last SELECT before or around the cursor position
  const fullText = sql.toLowerCase();

  // Find all SELECT positions
  const selectPositions: number[] = [];
  let pos = 0;
  while ((pos = fullText.indexOf("select", pos)) !== -1) {
    selectPositions.push(pos);
    pos += 6;
  }

  // Find the SELECT that contains our cursor position
  // (the last SELECT that starts before the cursor)
  let relevantSelect = -1;
  for (const selectPos of selectPositions) {
    if (selectPos <= cursor) {
      relevantSelect = selectPos;
    }
  }

  if (relevantSelect >= 0) {
    // Return the ENTIRE query from this SELECT, not just to cursor
    // This ensures we see the FROM clause even when cursor is in SELECT clause
    return sql.slice(relevantSelect);
  }

  return sql;
}

function readIdentifier(tokens: string[], i: number): { id?: string; next: number } {
  const t = tokens[i];
  if (!t) return { next: i };
  if (/^[A-Za-z_]\w*$/.test(t)) return { id: t, next: i + 1 };
  return { next: i };
}

function readTableName(tokens: string[], i: number): { table?: string; next: number; subquery?: boolean } {
  // Handle subquery: FROM ( SELECT ... ) alias
  if (tokens[i] === "(") {
    let depth = 1, j = i + 1;
    while (j < tokens.length && depth > 0) {
      if (tokens[j] === "(") depth++;
      else if (tokens[j] === ")") depth--;
      j++;
    }
    return { subquery: true, next: j };
  }

  const a = readIdentifier(tokens, i);
  if (!a.id) return { next: i };

  let table = a.id!;
  let k = a.next;

  if (tokens[k] === ".") {
    const b = readIdentifier(tokens, k + 1);
    if (b.id) {
      table = `${table}.${b.id}`;
      k = b.next;
    }
  }

  return { table, next: k };
}

function extractContext(sql: string, cursor: number): Context {
  // Get the relevant SELECT statement that contains the cursor
  const slice = lastSelectSlice(sql, cursor);
  const tokens = slice.match(WORD_OR_PUNCT) || [];
  const lower = tokens.map(t => t.toLowerCase());

  const ctx: Context = { tables: new Set(), aliases: new Map() };

  let i = 0;
  let depth = 0;

  while (i < tokens.length) {
    const tok = lower[i];
    if (tokens[i] === "(") { depth++; i++; continue; }
    if (tokens[i] === ")") { depth = Math.max(0, depth - 1); i++; continue; }

    // Only look at top-level FROM / JOINs
    if (depth === 0 && (tok === "from" || tok === "join" || tok === "left" || tok === "right" ||
                        tok === "inner" || tok === "outer" || tok === "full" || tok === "cross")) {
      // Skip composite join keywords
      if (tok !== "from" && lower[i + 1] === "join") i++;
      i++;

      // Read table or subquery
      const { table, next, subquery } = readTableName(tokens, i);
      i = next;

      // Optional AS or implicit alias
      let alias: string | undefined;
      if (lower[i] === "as") {
        const { id, next: n2 } = readIdentifier(tokens, i + 1);
        if (id) alias = id;
        i = n2;
      } else {
        const maybeAlias = readIdentifier(tokens, i);
        if (maybeAlias.id && !KEYWORDS.has(maybeAlias.id.toLowerCase())) {
          alias = maybeAlias.id;
          i = maybeAlias.next;
        }
      }

      if (!subquery && table) {
        ctx.tables.add(table);
        if (alias) ctx.aliases.set(alias.toLowerCase(), table);
      } else if (subquery && alias) {
        ctx.aliases.set(alias.toLowerCase(), "__SUBQUERY__");
      }
      continue;
    }

    i++;
  }

  return ctx;
}

function resolveQualifierToTable(
  qualifier: string,
  ctx: Context,
  schemaColumns: Map<string, {name: string; type: string}[]>
): string | undefined {
  const q = qualifier.toLowerCase();

  // Check if it's an alias
  const aliased = ctx.aliases.get(q);
  if (aliased && aliased !== "__SUBQUERY__") return aliased;

  // Check exact table name
  for (const t of schemaColumns.keys()) {
    if (t.toLowerCase() === q) return t;
    // Support matching by unqualified part: users matches schema.users
    const short = t.toLowerCase().split(".").pop();
    if (short === q) return t;
  }

  return undefined;
}

export async function setupLogLanguage(monaco: Monaco) {
  // Register log file language
  monaco.languages.register({ id: 'log' });

  // Define log syntax highlighting for CRDB format
  // Format: I250808 06:44:26.929973 686 2@util/log/event_log.go:39 ⋮ [T1,Vsystem,n40] 133464 Balh
  monaco.languages.setMonarchTokensProvider('log', {
    defaultToken: '',
    tokenPostfix: '.log',
    ignoreCase: false,

    tokenizer: {
      root: [
        // Match the entire structured prefix first, then switch to message mode
        // Lines with counter
        [/^([IWEF])([0-9: ]{15})(\.\d+)( \d+ )(\d+@)([^:]+)(:\d+)( ⋮ )(\[[^\]]*\] )(\d+ )(.*)$/, [
          { cases: {
            'I': 'log.level.I',
            'W': 'log.level.W',
            'E': 'log.level.E',
            'F': 'log.level.F',
            '@default': 'log.level'
          }},
          'log.datetime',
          'log.fractional',
          'log.pid',
          'log.channel',
          'log.file',
          'log.line',
          'log.separator',
          'log.tags',
          'log.counter',
          'log.message'
        ]],
        // Lines without counter
        [/^([IWEF])([0-9: ]{15})(\.\d+)( \d+ )([^@:]+)(:\d+)( ⋮ )(\[[^\]]*\] )(.*)$/, [
          { cases: {
            'I': 'log.level.I',
            'W': 'log.level.W',
            'E': 'log.level.E',
            'F': 'log.level.F',
            '@default': 'log.level'
          }},
          'log.datetime',
          'log.fractional',
          'log.pid',
          'log.file',
          'log.line',
          'log.separator',
          'log.tags',
          'log.message'
        ]],
        // Fallback for malformed lines - everything is message
        [/.*/, 'log.message']
      ]
    }
  });

  // Define colors for log tokens
  monaco.editor.defineTheme('log-theme', {
    base: 'vs-dark',
    inherit: true,
    rules: [
      { token: 'log.level.I', foreground: '98FB98' }, // Green for I (Info)
      { token: 'log.level.W', foreground: 'F0E68C' }, // Yellow for W (Warning)
      { token: 'log.level.E', foreground: 'FF6B6B' }, // Red for E (Error)
      { token: 'log.level.F', foreground: 'FF6B6B' }, // Red for F (Fatal)
      { token: 'log.level', foreground: '555555' }, // Fallback for other levels
      { token: 'log.datetime', foreground: '87CEEB', fontStyle: 'bold' }, // Sky blue, bold for date+time together
      { token: 'log.fractional', foreground: '777777' }, // Dim for fractional seconds
      { token: 'log.pid', foreground: '6A9955' }, // Comment green for PID
      { token: 'log.goroutine', foreground: '999999' }, // Slightly lighter gray than fractional seconds
      { token: 'log.file', foreground: '6495ED' }, // Darker blue for file path
      { token: 'log.line', foreground: 'B0B0B0' }, // Light gray for line number
      { token: 'log.separator', foreground: '696969' }, // Dim gray for separators
      { token: 'log.bracket', foreground: 'F0E68C' }, // Khaki for brackets
      { token: 'log.tags', foreground: 'DDA0DD' }, // Purple/fuscia for tag content
      { token: 'log.counter', foreground: '444444' }, // Very dim for counter (de-emphasized)
      { token: 'log.message', foreground: 'FFFFFF' }, // White for message text
    ],
    colors: {
      'editor.findMatchBackground': 'transparent',
      'editor.findMatchHighlightBackground': 'transparent',
      'editor.findRangeHighlightBackground': 'transparent',
      'editor.selectionHighlightBackground': 'transparent'
    }
  });
}

export async function setupDuckDBLanguage(monaco: Monaco) {
  // Register DuckDB SQL as a custom language
  monaco.languages.register({ id: 'duckdb-sql' });

  // Define DuckDB SQL syntax highlighting
  monaco.languages.setMonarchTokensProvider('duckdb-sql', {
    defaultToken: '',
    tokenPostfix: '.sql',
    ignoreCase: true,

    // Define symbols used in the language
    symbols: /[=><!~?:&|+\-*\/\^%]+/,

    keywords: [
      'SELECT', 'FROM', 'WHERE', 'GROUP', 'BY', 'ORDER', 'HAVING', 'AS',
      'JOIN', 'LEFT', 'RIGHT', 'INNER', 'OUTER', 'FULL', 'CROSS', 'ON',
      'INSERT', 'INTO', 'VALUES', 'UPDATE', 'SET', 'DELETE', 'CREATE', 'DROP',
      'ALTER', 'TABLE', 'VIEW', 'INDEX', 'DISTINCT', 'UNION', 'ALL', 'EXCEPT',
      'INTERSECT', 'WITH', 'RECURSIVE', 'LIMIT', 'OFFSET', 'FETCH', 'FIRST',
      'CASE', 'WHEN', 'THEN', 'ELSE', 'END', 'AND', 'OR', 'NOT', 'IN', 'EXISTS',
      'BETWEEN', 'LIKE', 'ILIKE', 'IS', 'NULL', 'TRUE', 'FALSE', 'ASC', 'DESC',
      'USING', 'NATURAL', 'LATERAL', 'WINDOW', 'OVER', 'PARTITION', 'RANGE',
      'ROWS', 'UNBOUNDED', 'PRECEDING', 'FOLLOWING', 'CURRENT', 'ROW',
      'ROLLUP', 'CUBE', 'GROUPING', 'SETS'
    ],

    operators: [
      '=', '>', '<', '!', '~', '?', ':', '==', '<=', '>=', '!=', '<>',
      '&&', '||', '++', '--', '+', '-', '*', '/', '&', '|', '^', '%',
      '<<', '>>', '>>>', '+=', '-=', '*=', '/=', '&=', '|=', '^=',
      '%=', '<<=', '>>=', '>>>='
    ],

    builtinFunctions: [
      'COUNT', 'SUM', 'AVG', 'MIN', 'MAX', 'STDDEV', 'VARIANCE',
      'COALESCE', 'NULLIF', 'CAST', 'CONVERT', 'SUBSTRING', 'TRIM',
      'LTRIM', 'RTRIM', 'UPPER', 'LOWER', 'LENGTH', 'REPLACE',
      'NOW', 'CURRENT_DATE', 'CURRENT_TIME', 'CURRENT_TIMESTAMP',
      'DATE_PART', 'DATE_TRUNC', 'EXTRACT', 'ABS', 'ROUND', 'FLOOR',
      'CEIL', 'POWER', 'SQRT', 'EXP', 'LN', 'LOG', 'LOG10',
      'CONCAT', 'STRING_AGG', 'ARRAY_AGG', 'JSON_AGG', 'JSONB_AGG',
      'ROW_NUMBER', 'RANK', 'DENSE_RANK', 'PERCENT_RANK', 'CUME_DIST',
      'NTILE', 'LAG', 'LEAD', 'FIRST_VALUE', 'LAST_VALUE', 'NTH_VALUE'
    ],

    builtinVariables: [
      '@@VERSION', '@@SERVERNAME', '@@LANGUAGE', '@@SPID', '@@ROWCOUNT'
    ],

    tokenizer: {
      root: [
        // Identifiers and keywords
        [/[a-zA-Z_][\w]*/, {
          cases: {
            '@keywords': { token: 'keyword' },
            '@builtinFunctions': { token: 'predefined' },
            '@builtinVariables': { token: 'variable.predefined' },
            '@default': 'identifier'
          }
        }],

        // Whitespace
        { include: '@whitespace' },

        // Multi-line comments
        [/\/\*/, 'comment', '@comment'],

        // Single-line comments
        [/--.*$/, 'comment'],

        // Numbers
        [/[0-9]+\.?[0-9]*([eE][\-+]?[0-9]+)?/, 'number'],
        [/\.[0-9]+([eE][\-+]?[0-9]+)?/, 'number'],

        // Strings
        [/'/, 'string', '@string'],
        [/"/, 'string', '@dblstring'],

        // Delimiters and operators
        [/[{}()\[\]]/, '@brackets'],
        [/[<>](?!@symbols)/, '@brackets'],
        [/@symbols/, {
          cases: {
            '@operators': 'operator',
            '@default': ''
          }
        }],
        [/[;,.]/, 'delimiter'],
      ],

      whitespace: [
        [/\s+/, 'white'],
      ],

      comment: [
        [/[^\/*]+/, 'comment'],
        [/\*\//, 'comment', '@pop'],
        [/[\/*]/, 'comment']
      ],

      string: [
        [/[^']+/, 'string'],
        [/''/, 'string.escape'],
        [/'/, 'string', '@pop']
      ],

      dblstring: [
        [/[^"]+/, 'string'],
        [/""/, 'string.escape'],
        [/"/, 'string', '@pop']
      ],
    }
  });

  // Configure language features
  monaco.languages.setLanguageConfiguration('duckdb-sql', {
    comments: {
      lineComment: '--',
      blockComment: ['/*', '*/']
    },
    brackets: [
      ['{', '}'],
      ['[', ']'],
      ['(', ')']
    ],
    autoClosingPairs: [
      { open: '{', close: '}' },
      { open: '[', close: ']' },
      { open: '(', close: ')' },
      { open: '"', close: '"' },
      { open: "'", close: "'" },
    ],
    surroundingPairs: [
      { open: '{', close: '}' },
      { open: '[', close: ']' },
      { open: '(', close: ')' },
      { open: '"', close: '"' },
      { open: "'", close: "'" },
    ]
  });

  // Register completion provider with sophisticated context awareness
  monaco.languages.registerCompletionItemProvider('duckdb-sql', {
    triggerCharacters: ['.', ' ', '(', ','],

    async provideCompletionItems(model, position, _context, _token) {
      // // console.log('provideCompletionItems called at position:', position);

      // Ensure schema cache is fresh
      if (!schemaCache || Date.now() - schemaCache.lastUpdated > 5000) {
        await updateSchemaCache();
      }

      if (!schemaCache) {
        // // console.log('No schema cache available');
        return { suggestions: [] };
      }

      const fullText = model.getValue();
      const offset = model.getOffsetAt(position);
      const ctx = extractContext(fullText, offset);

      // // console.log('Full query:', fullText);
      // // console.log('Context extracted - tables found:', Array.from(ctx.tables));
      // // console.log('Context extracted - aliases:', Object.fromEntries(ctx.aliases));

      const textUntilPosition = model.getValueInRange({
        startLineNumber: 1,
        startColumn: 1,
        endLineNumber: position.lineNumber,
        endColumn: position.column
      });

      const word = model.getWordUntilPosition(position);
      const range = {
        startLineNumber: position.lineNumber,
        endLineNumber: position.lineNumber,
        startColumn: word.startColumn,
        endColumn: word.endColumn
      };

      const suggestions: languages.CompletionItem[] = [];
      const seen = new Set<string>(); // dedupe by label+kind

      function pushUnique(s: languages.CompletionItem) {
        const key = `${s.label}|${s.kind}`;
        if (seen.has(key)) return;
        seen.add(key);
        suggestions.push(s);
      }

      // Analyze immediate context
      const lastChars = textUntilPosition.toLowerCase().slice(-50);
      const isAfterFrom = /\bfrom\s+[\w_]*$/i.test(lastChars);
      const isAfterJoin = /\bjoin\s+[\w_]*$/i.test(lastChars);
      const isAfterWhere = /\bwhere\s+[\w_]*$/i.test(lastChars);
      // Fixed: \w already includes underscore, but let's be explicit
      const isAfterSelect = /\bselect\s+[a-zA-Z0-9_]*$/i.test(lastChars);
      const isAfterGroupBy = /\bgroup\s+by\s+[a-zA-Z0-9_]*$/i.test(lastChars);
      const isAfterOrderBy = /\border\s+by\s+[a-zA-Z0-9_]*$/i.test(lastChars);
      const isAfterComma = /,\s*[a-zA-Z0-9_]*$/i.test(lastChars);
      const isAfterDot = /([a-zA-Z_][\w_]*)\.[a-zA-Z0-9_]*$/i.test(lastChars);
      const isAfterParen = /\(\s*[a-zA-Z0-9_]*$/i.test(lastChars);

      // console.log('Context checks:', {
      //   isAfterSelect,
      //   isAfterComma,
      //   isAfterWhere,
      //   lastChars: lastChars.slice(-20)
      // });

      // ===== A) table.column (after dot) =====
      if (isAfterDot) {
        const match = lastChars.match(/([A-Za-z_]\w*)\.\w*$/);
        if (match) {
          const qualifier = match[1];
          const tableKey = resolveQualifierToTable(qualifier, ctx, schemaCache.columns);
          if (tableKey) {
            const cols = schemaCache.columns.get(tableKey) || [];
            for (const col of cols) {
              pushUnique({
                label: col.name,
                kind: monaco.languages.CompletionItemKind.Field,
                insertText: col.name,
                detail: col.type,
                documentation: `Column from ${qualifier} → ${tableKey}`,
                range
              });
            }
            return { suggestions }; // Only columns from this table
          }
        }
      }

      // ===== B) Suggest tables after FROM/JOIN =====
      if (isAfterFrom || isAfterJoin) {
        for (const table of schemaCache.tables) {
          pushUnique({
            label: table,
            kind: monaco.languages.CompletionItemKind.Class,
            insertText: table,
            detail: "Table",
            documentation: `Table: ${table}`,
            range
          });
        }
        return { suggestions };
      }

      // ===== C) Columns after SELECT/WHERE/GROUP/ORDER/COMMA =====
      if (isAfterSelect || isAfterWhere || isAfterGroupBy || isAfterOrderBy || isAfterComma) {
        // Only show columns if we have tables in scope
        const activeTables = Array.from(ctx.tables);

        // console.log('In SELECT/WHERE section. Active tables:', activeTables.length);

        // Always add functions first, regardless of tables
        // console.log('Adding functions. Current word:', word.word, 'Functions available:', schemaCache.functions.length);

        let functionsAdded = 0;
        for (const func of schemaCache.functions) {
          pushUnique({
            label: func.name,
            kind: monaco.languages.CompletionItemKind.Function,
            insertText: func.name + '(',
            detail: func.type === 'aggregate' ? 'Aggregate Function' : 'Scalar Function',
            documentation: func.description || `DuckDB ${func.type} function`,
            sortText: '5_' + func.name,
            range
          });
          functionsAdded++;
        }
        // console.log(`Added ${functionsAdded} functions`);

        // If no tables in scope yet, return with just functions
        if (activeTables.length === 0) {
          // console.log('No tables in scope, returning with functions only');
          return { suggestions };
        }

        // Build alias reverse map: table -> [aliases]
        const tableToAliases = new Map<string, string[]>();
        for (const [a, t] of ctx.aliases.entries()) {
          if (t === "__SUBQUERY__") continue;
          const arr = tableToAliases.get(t) ?? [];
          arr.push(a);
          tableToAliases.set(t, arr);
        }

        // Count column occurrences for uniqueness check
        const colCounts = new Map<string, number>();
        for (const t of activeTables) {
          for (const c of schemaCache.columns.get(t) || []) {
            colCounts.set(c.name, (colCounts.get(c.name) || 0) + 1);
          }
        }

        // Check if user is typing a table/alias prefix
        const currentWordLower = word.word.toLowerCase();
        const isTypingTablePrefix = activeTables.some(t => {
          const short = t.split(".").pop()?.toLowerCase() || t.toLowerCase();
          const aliases = tableToAliases.get(t) || [];
          return short.startsWith(currentWordLower) ||
                 aliases.some(a => a.toLowerCase().startsWith(currentWordLower));
        });

        // Single table scenario - keep it simple
        if (activeTables.length === 1 && !isTypingTablePrefix) {
          const table = activeTables[0];
          const cols = schemaCache.columns.get(table) || [];

          for (const col of cols) {
            pushUnique({
              label: col.name,
              kind: monaco.languages.CompletionItemKind.Field,
              insertText: col.name,
              detail: col.type,
              documentation: `Column from ${table}`,
              sortText: `0_${col.name}`,
              range
            });
          }

          // If user is starting to type table name, also offer qualified version
          if (currentWordLower.length > 0) {
            const short = table.split(".").pop() || table;
            const aliases = tableToAliases.get(table) || [];
            const qualifiers = aliases.length ? aliases : [short];

            for (const q of qualifiers) {
              if (q.toLowerCase().startsWith(currentWordLower)) {
                pushUnique({
                  label: q,
                  kind: monaco.languages.CompletionItemKind.Module,
                  insertText: q + '.',
                  detail: 'Table qualifier',
                  documentation: `Use ${q}. to access columns`,
                  sortText: `1_${q}`,
                  range
                });
              }
            }
          }

          return { suggestions };
        }

        // Multiple tables - be more explicit
        for (const table of activeTables) {
          const cols = schemaCache.columns.get(table) || [];
          const short = table.split(".").pop() || table;
          const aliases = tableToAliases.get(table) || [];
          const qualifiers = aliases.length ? aliases : [short];

          for (const col of cols) {
            const isUnique = (colCounts.get(col.name) || 0) === 1;

            // Always show unqualified if unique
            if (isUnique) {
              pushUnique({
                label: col.name,
                kind: monaco.languages.CompletionItemKind.Field,
                insertText: col.name,
                detail: `${col.type} (${short})`,
                documentation: `Unique column from ${table}`,
                sortText: `0_${col.name}`,
                range
              });
            }

            // Show qualified form if ambiguous OR user is typing a table prefix
            if (!isUnique || isTypingTablePrefix) {
              for (const q of qualifiers) {
                // Only show if user is typing this qualifier or if column is ambiguous
                if (!isUnique || q.toLowerCase().startsWith(currentWordLower)) {
                  pushUnique({
                    label: `${q}.${col.name}`,
                    kind: monaco.languages.CompletionItemKind.Field,
                    insertText: `${q}.${col.name}`,
                    detail: col.type,
                    documentation: `Column from ${table}`,
                    sortText: isUnique ? `2_${q}_${col.name}` : `1_${q}_${col.name}`,
                    range
                  });
                }
              }
            }
          }
        }

        // Return with all column and function suggestions
        return { suggestions };
      }

      // ===== D) After opening paren, suggest functions without parens =====
      if (isAfterParen) {
        // Use DuckDB-provided functions (without adding another paren)
        for (const func of schemaCache.functions) {
          pushUnique({
            label: func.name,
            kind: monaco.languages.CompletionItemKind.Function,
            insertText: func.name,
            detail: func.type === 'aggregate' ? 'Aggregate Function' : 'Scalar Function',
            documentation: func.description || `DuckDB ${func.type} function`,
            sortText: '0_' + func.name,
            range
          });
        }
      }

      // ===== E) Keywords from DuckDB =====
      // Filter keywords based on context
      const contextualKeywords = schemaCache.keywords.filter(kw => {
        // Don't suggest keywords that don't make sense in context
        if (isAfterSelect && ['FROM', 'WHERE', 'GROUP', 'ORDER', 'LIMIT'].includes(kw)) return false;
        if (isAfterFrom && ['SELECT', 'FROM'].includes(kw)) return false;
        if (isAfterWhere && ['SELECT', 'FROM', 'WHERE'].includes(kw)) return false;
        return true;
      });

      for (const kw of contextualKeywords) {
        pushUnique({
          label: kw,
          kind: monaco.languages.CompletionItemKind.Keyword,
          insertText: kw,
          detail: 'SQL Keyword',
          sortText: '9' + kw,
          range
        });
      }

      return { suggestions };
    }
  });
}

export async function refreshSchemaCache() {
  return updateSchemaCache();
}