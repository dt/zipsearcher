import { useState, useCallback, useEffect, useRef } from 'react';
import Editor from '@monaco-editor/react';
import type { Monaco } from '@monaco-editor/react';
import type { editor } from 'monaco-editor';
import type { ViewerTab } from '../state/types';
import { duckDBService } from '../services/duckdb';
import { useApp } from '../state/AppContext';
import { isDefaultTableQuery, generateQueryTitle } from '../utils/sqlParser';
import { setupDuckDBLanguage, refreshSchemaCache } from '../services/monacoConfig';
import { formatValue } from '../crdb';

interface SqlEditorProps {
  tab: ViewerTab & { kind: 'sql' };
}

function SqlEditor({ tab }: SqlEditorProps) {
  const { dispatch } = useApp();
  const [query, setQuery] = useState(tab.query || '');
  const [results, setResults] = useState<any[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [expandedCell, setExpandedCell] = useState<{ row: number; col: number } | null>(null);
  const hasAutoRun = useRef(false);
  const lastNotifiedQuery = useRef(tab.query);
  const monacoRef = useRef<Monaco | null>(null);
  const editorRef = useRef<editor.IStandaloneCodeEditor | null>(null);
  const isMonacoSetup = useRef(false);

  // Calculate editor height based on content
  const calculateEditorHeight = useCallback(() => {
    if (!editorRef.current) return '42px'; // 2 lines default (21px per line)

    const lineCount = editorRef.current.getModel()?.getLineCount() || 1;
    const lineHeight = 21; // Monaco default line height
    const padding = 10; // Some padding

    // Start at 2 lines, expand to show content + 1 spare line, max 10 lines
    const minLines = 2;
    const maxLines = 10;
    const targetLines = Math.max(minLines, Math.min(lineCount + 1, maxLines));

    return `${targetLines * lineHeight + padding}px`;
  }, []);

  const [editorHeight, setEditorHeight] = useState('52px'); // 2 lines + padding initially

  const renderCellValue = (value: any, rowIndex: number, colIndex: number, columnName?: string) => {
    if (value === null) return <span className="sql-null">NULL</span>;

    // Use formatValue to handle Date objects properly
    const strValue = formatValue(value);

    // Check if it's a protobuf config column (still in hex)
    const isConfigColumn = columnName && (
      columnName.toLowerCase() === 'config' ||
      columnName.toLowerCase() === 'descriptor' ||
      columnName.toLowerCase() === 'payload'
    );

    // If it's hex data, just show it truncated if too long
    if (strValue.startsWith('\\x') && isConfigColumn) {
      const displayValue = strValue.length > 50 ? `${strValue.slice(0, 50)}...` : strValue;
      return <span className="sql-cell-hex">{displayValue}</span>;
    }

    // Check if it's JSON (from decoded protobuf or other sources)
    if (strValue.startsWith('{') || strValue.startsWith('[')) {
      try {
        const parsed = JSON.parse(strValue);

        // Just show the JSON formatted
        return (
          <pre className="sql-cell-json" style={{ margin: 0, fontSize: '0.9em' }}>
            {JSON.stringify(parsed, null, 2)}
          </pre>
        );
      } catch {
        // Not valid JSON, display as string
      }
    }

    // Regular value
    if (strValue.length > 100) {
      const isExpanded = expandedCell?.row === rowIndex && expandedCell?.col === colIndex;
      return (
        <div>
          <span
            onClick={() => setExpandedCell(isExpanded ? null : { row: rowIndex, col: colIndex })}
            style={{ cursor: 'pointer' }}
          >
            {strValue.substring(0, 100)}...
          </span>
          {isExpanded && (
            <div className="sql-cell-expanded">
              {strValue}
            </div>
          )}
        </div>
      );
    }

    return strValue;
  };

  const runQuery = useCallback(async () => {
    if (!query.trim()) return;

    setLoading(true);
    setError(null);
    setResults(null);

    try {
      const data = await duckDBService.query(query);
      setResults(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Query failed');
    } finally {
      setLoading(false);
    }
  }, [query]);

  const handleEditorWillMount = (monaco: Monaco) => {
    // Setup DuckDB language only once globally
    if (!isMonacoSetup.current) {
      setupDuckDBLanguage(monaco);
      isMonacoSetup.current = true;
    }
  };

  const handleEditorDidMount = async (editor: editor.IStandaloneCodeEditor, monaco: Monaco) => {
    editorRef.current = editor;
    monacoRef.current = monaco;

    // Set initial height
    const initialHeight = calculateEditorHeight();
    setEditorHeight(initialHeight);

    // Refresh schema cache when editor mounts
    await refreshSchemaCache();

    // Add keyboard shortcut for running query
    editor.addAction({
      id: 'run-query',
      label: 'Run Query',
      keybindings: [
        monaco.KeyMod.CtrlCmd | monaco.KeyCode.Enter
      ],
      run: async () => {
        const currentQuery = editor.getValue();
        if (!currentQuery.trim()) return;

        setLoading(true);
        setError(null);
        setResults(null);

        try {
          const data = await duckDBService.query(currentQuery);
          setResults(data);
        } catch (err) {
          setError(err instanceof Error ? err.message : 'Query failed');
        } finally {
          setLoading(false);
        }
      }
    });

    // Focus the editor
    editor.focus();
  };

  // Auto-run query when tab opens with a pre-filled query
  useEffect(() => {
    if (tab.query && !hasAutoRun.current) {
      hasAutoRun.current = true;
      runQuery();
    }
  }, [tab.query, runQuery]);

  // Update tab when query changes
  useEffect(() => {
    if (query !== lastNotifiedQuery.current) {
      const sourceTable = tab.sourceTable;
      const isCustom = !isDefaultTableQuery(query, sourceTable);
      const newTitle = generateQueryTitle(query, sourceTable);

      dispatch({
        type: 'UPDATE_TAB',
        id: tab.id,
        updates: {
          query,
          title: newTitle,
          isCustomQuery: isCustom,
        },
      });

      lastNotifiedQuery.current = query;
    }
  }, [query, tab.id, tab.sourceTable, dispatch]);

  // Refresh schema cache when tab changes (new tables might be loaded)
  useEffect(() => {
    if (monacoRef.current) {
      refreshSchemaCache();
    }
  }, [tab.id]);

  return (
    <div className="sql-editor">
      <div className="sql-editor-container">
        <button
          className="sql-run-button"
          onClick={runQuery}
          disabled={loading || !query.trim()}
          title="Run Query (Cmd/Ctrl+Enter)"
        >
          {loading ? 'Running...' : 'Run Query'}
        </button>
        <Editor
          height={editorHeight}
          language="duckdb-sql"
          value={query}
          onChange={(value) => {
            setQuery(value || '');
            // Update height after content change
            setTimeout(() => {
              const newHeight = calculateEditorHeight();
              setEditorHeight(newHeight);
            }, 0);
          }}
          beforeMount={handleEditorWillMount}
          onMount={handleEditorDidMount}
          theme="vs-dark"
          options={{
            minimap: { enabled: false },
            fontSize: 14,
            lineNumbers: 'on',
            renderLineHighlight: 'all',
            scrollBeyondLastLine: false,
            automaticLayout: true,
            padding: { top: 4, bottom: 4 },
            scrollbar: {
              vertical: 'auto',
              horizontal: 'auto',
              verticalScrollbarSize: 10,
              horizontalScrollbarSize: 10,
            },
            suggestOnTriggerCharacters: true,
            quickSuggestions: {
              other: true,
              comments: false,
              strings: false
            },
            acceptSuggestionOnCommitCharacter: true,
            acceptSuggestionOnEnter: 'on',
            accessibilitySupport: 'off',
            autoIndent: 'advanced',
            wordBasedSuggestions: 'off',
            suggest: {
              showKeywords: true,
              showSnippets: false,
              showFunctions: true,
              showVariables: true,
              showClasses: true,
              showStructs: true,
              showInterfaces: true,
              showModules: true,
              showProperties: true,
              showEvents: true,
              showOperators: true,
              showUnits: true,
              showValues: true,
              showConstants: true,
              showEnums: true,
              showEnumMembers: true,
              showColors: false,
              showFiles: false,
              showReferences: false,
              showFolders: false,
              showTypeParameters: true,
              showWords: false,
              insertMode: 'replace',
              filterGraceful: true,
            },
            bracketPairColorization: {
              enabled: true
            },
            matchBrackets: 'always',
            autoClosingBrackets: 'always',
            autoClosingQuotes: 'always',
            formatOnType: true,
            formatOnPaste: true,
            trimAutoWhitespace: true
          }}
        />
      </div>
      <div className="sql-results">
        {error && (
          <div className="sql-error">
            <strong>Error:</strong> {error}
          </div>
        )}
        {results && (
          <div className="sql-table-wrapper">
            {results.length === 0 ? (
              <p>No results</p>
            ) : (
              <table className="sql-table">
                <thead>
                  <tr>
                    {Object.keys(results[0]).map(col => (
                      <th key={col}>{col}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {results.slice(0, 1000).map((row, i) => (
                    <tr key={i}>
                      {Object.entries(row).map(([colName, val], j) => (
                        <td key={j}>
                          {renderCellValue(val, i, j, colName)}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
            {results.length > 1000 && (
              <p className="sql-truncated">
                Showing first 1000 of {results.length} rows
              </p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

export default SqlEditor;