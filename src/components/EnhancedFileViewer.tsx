import { useEffect, useState, memo, useCallback, useRef } from 'react';
import Editor, { type Monaco } from '@monaco-editor/react';
import type { editor } from 'monaco-editor';
import type { ViewerTab } from '../state/types';
import { useKeyboardShortcuts } from '../hooks/useKeyboardShortcuts';
import { matchesFilter } from '../utils/filterUtils';
import { useApp } from '../state/AppContext';
import { setupLogLanguage } from '../services/monacoConfig';

interface FileViewerProps {
  tab: ViewerTab & { kind: 'file' };
}

// Debounce helper
function debounce<T extends (...args: any[]) => any>(
  func: T,
  wait: number
): (...args: Parameters<T>) => void {
  let timeout: NodeJS.Timeout | null = null;
  return (...args: Parameters<T>) => {
    if (timeout) clearTimeout(timeout);
    timeout = setTimeout(() => func(...args), wait);
  };
}

function EnhancedFileViewer({ tab }: FileViewerProps) {
  const { dispatch, state } = useApp();

  // File loading state
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [content, setContent] = useState<string>('');
  const [progress, setProgress] = useState({ loaded: 0, total: 0, percent: 0 });
  const [isStreaming, setIsStreaming] = useState(false);

  // Filter state
  const [filterText, setFilterText] = useState(tab.filterText || '');
  const [contextLines, setContextLines] = useState('');
  const [visibleLineCount, setVisibleLineCount] = useState(0);
  const [totalLineCount, setTotalLineCount] = useState(0);

  const editorRef = useRef<editor.IStandaloneCodeEditor | null>(null);
  const monacoRef = useRef<Monaco | null>(null);
  const abortRef = useRef<(() => void) | null>(null);
  const filterInputRef = useRef<HTMLInputElement>(null);
  const decorationIds = useRef<string[]>([]);
  const languageRef = useRef<string>('plaintext');
  const initialFilterRef = useRef<{ text: string; context: number } | null>(null);
  const applyFilterRef = useRef<((query: string, context?: number) => void) | null>(null);

  // Get original filename from filesIndex (never changes, unaffected by tab renaming)
  const originalFile = state.filesIndex[tab.fileId];
  const originalFileName = originalFile?.path || originalFile?.name || tab.title;

  // Detect file type and language
  const getLanguage = useCallback((fileName: string): string => {
    const ext = fileName.split('.').pop()?.toLowerCase();
    const languageMap: Record<string, string> = {
      'js': 'javascript',
      'jsx': 'javascript',
      'ts': 'typescript',
      'tsx': 'typescript',
      'json': 'json',
      'jsonl': 'json',
      'ndjson': 'json',
      'html': 'html',
      'htm': 'html',
      'css': 'css',
      'scss': 'scss',
      'sass': 'sass',
      'less': 'less',
      'xml': 'xml',
      'yaml': 'yaml',
      'yml': 'yaml',
      'md': 'markdown',
      'markdown': 'markdown',
      'py': 'python',
      'rb': 'ruby',
      'go': 'go',
      'java': 'java',
      'c': 'c',
      'cpp': 'cpp',
      'cc': 'cpp',
      'cxx': 'cpp',
      'h': 'c',
      'hpp': 'cpp',
      'cs': 'csharp',
      'php': 'php',
      'rs': 'rust',
      'toml': 'toml',
      'ini': 'ini',
      'cfg': 'ini',
      'conf': 'ini',
      'sql': 'sql',
      'sh': 'shell',
      'bash': 'shell',
      'zsh': 'shell',
      'fish': 'shell',
      'ps1': 'powershell',
      'psm1': 'powershell',
      'bat': 'bat',
      'cmd': 'bat',
      'dockerfile': 'dockerfile',
      'makefile': 'makefile',
      'mk': 'makefile',
      'r': 'r',
      'R': 'r',
      'swift': 'swift',
      'kt': 'kotlin',
      'scala': 'scala',
      'vim': 'vim',
      'lua': 'lua',
      'perl': 'perl',
      'pl': 'perl',
      'groovy': 'groovy',
      'gradle': 'groovy',
      'proto': 'protobuf',
      'graphql': 'graphql',
      'gql': 'graphql',
      'diff': 'diff',
      'patch': 'diff',
      'log': 'log',
      'txt': 'plaintext',
      'text': 'plaintext',
      'csv': 'plaintext',
      'tsv': 'plaintext'
    };

    return languageMap[ext || ''] || 'plaintext';
  }, []);

  const language = getLanguage(originalFileName);
  languageRef.current = language; // Keep ref in sync

  // Store initial filter state
  if (filterText) {
    initialFilterRef.current = { text: filterText, context: parseInt(contextLines) || 0 };
  }

  // DEBUG: Uncomment to test with different language
  // const language = 'javascript'; // Force javascript highlighting for testing

  // Apply filter/grep functionality
  const applyFilter = useCallback((query: string, context: number = 0) => {
    if (!editorRef.current || !monacoRef.current) {
      return;
    }

    const model = editorRef.current.getModel();
    if (!model) {
      return;
    }


    // Reset if empty
    if (!query) {
      // Clear hidden areas by using fold/unfold functionality instead
      const model = editorRef.current.getModel();
      if (model && monacoRef.current) {
        editorRef.current.setSelection(new monacoRef.current.Selection(1, 1, model.getLineCount(), 1));
        editorRef.current.trigger('editor', 'editor.unfoldAll', {});
      }
      decorationIds.current = editorRef.current.deltaDecorations(decorationIds.current, []);
      setVisibleLineCount(model?.getLineCount() || 0); // Show all lines
      return;
    }

    // Use our boolean expression filter to test each line
    const visible = new Set<number>();
    const matchingLines: Array<{ lineNumber: number; range: any }> = [];
    const maxLine = model.getLineCount();

    // Test each line against the boolean expression
    for (let lineNum = 1; lineNum <= maxLine; lineNum++) {
      const lineContent = model.getLineContent(lineNum);

      if (matchesFilter(lineContent, query)) {
        // Add the line and context lines
        const start = Math.max(1, lineNum - context);
        const end = Math.min(maxLine, lineNum + context);
        for (let ln = start; ln <= end; ln++) {
          visible.add(ln);
        }

        // Track for highlighting
        matchingLines.push({
          lineNumber: lineNum,
          range: new monacoRef.current.Range(lineNum, 1, lineNum, lineContent.length + 1)
        });
      }
    }


    // Always keep line 1 visible (never hide it)
    visible.add(1);

    // Build hidden ranges
    const hiddenRanges: any[] = [];
    let runStart: number | null = null;

    for (let ln = 1; ln <= maxLine; ln++) {
      const shouldHide = !visible.has(ln);
      if (shouldHide && runStart === null) {
        runStart = ln;
      }
      if ((!shouldHide || ln === maxLine) && runStart !== null) {
        const runEnd = shouldHide && ln === maxLine ? ln : ln - 1;
        hiddenRanges.push(
          new monacoRef.current.Range(runStart, 1, runEnd, Number.MAX_SAFE_INTEGER)
        );
        runStart = null;
      }
    }

    // Note: setHiddenAreas is not available in Monaco editor
    // Instead, we'll use a different approach with decorations to show matches

    // Update visible line count (subtract 1 for the always-visible line 1 if no actual matches)
    const actualMatches = matchingLines.length > 0 ? visible.size : 0;
    setVisibleLineCount(actualMatches);


    // DISABLED: Create decorations for highlights - testing if this clears hidden areas
    /*const newDecos = matchingLines.map(m => ({
      range: m.range,
      options: {
        inlineClassName: 'grep-highlight',
        overviewRuler: {
          position: monacoRef.current!.editor.OverviewRulerLane.Center,
          color: 'rgba(255, 200, 0, 0.8)'
        }
      }
    }));

    decorationIds.current = editorRef.current.deltaDecorations(decorationIds.current, newDecos);*/

    // Clear any existing decorations
    decorationIds.current = editorRef.current.deltaDecorations(decorationIds.current, []);

    // DISABLED: Reveal first match - testing if this clears hidden areas
    /*if (matchingLines.length > 0) {
      editorRef.current.revealRangeNearTop(matchingLines[0].range);
    }*/
  }, []);

  // Keep applyFilter ref in sync
  applyFilterRef.current = applyFilter;

  // Update tab title when filter changes
  const updateTabTitle = useCallback((filterText: string) => {
    const baseTitle = tab.title.replace(/ \(filtered\)$/, ''); // Remove existing filter suffix
    const newTitle = filterText ? `${baseTitle} (filtered)` : baseTitle;
    const isFiltered = !!filterText;

    dispatch({
      type: 'UPDATE_TAB',
      id: tab.id,
      updates: {
        title: newTitle,
        isFiltered,
        filterText: filterText || undefined
      }
    });
  }, [tab.id, tab.title, dispatch]);

  // Debounced filter application
  const debouncedApplyFilter = useRef(
    debounce((query: string, context: number) => {
      applyFilter(query, context);
      updateTabTitle(query);
    }, 150)
  ).current;

  // Load file content
  const loadFile = useCallback(async () => {
    setLoading(true);
    setError(null);
    setContent('');
    setProgress({ loaded: 0, total: 0, percent: 0 });
    setIsStreaming(true);

    try {
      const reader = (window as any).__zipReader;
      if (!reader) {
        throw new Error('No zip file loaded');
      }

      abortRef.current = () => reader.cancelStream();

      let accumulatedContent = '';
      const startTime = Date.now();
      let lastUpdateTime = startTime;

      await reader.readFileStream(
        tab.fileId,
        (chunk: string, info: { loaded: number; total: number; done: boolean }) => {
          accumulatedContent += chunk;

          const percent = info.total > 0 ? Math.round((info.loaded / info.total) * 100) : 0;
          setProgress({ loaded: info.loaded, total: info.total, percent });

          const now = Date.now();
          if (now - lastUpdateTime > 100 || info.done) {
            setContent(accumulatedContent);
            lastUpdateTime = now;
          }

          if (info.done) {
            setLoading(false);
            setIsStreaming(false);
            abortRef.current = null;
          }
        },
        (loaded: number, total: number) => {
          const percent = total > 0 ? Math.round((loaded / total) * 100) : 0;
          setProgress({ loaded, total, percent });
        }
      );
    } catch (err) {
      console.error('Failed to read file:', err);
      setError(`Failed to read file: ${err instanceof Error ? err.message : 'Unknown error'}`);
      setLoading(false);
      setIsStreaming(false);
      abortRef.current = null;
    }
  }, [tab.fileId]);

  useEffect(() => {
    if (!content && !loading) {
      loadFile();
    }

    return () => {
      if (abortRef.current) {
        abortRef.current();
      }
    };
  }, []);

  const handleBeforeMount = useCallback((monaco: Monaco) => {
    // Setup log language if this is a log file
    if (languageRef.current === 'log') {
      setupLogLanguage(monaco);
    }
  }, []); // No dependencies - stable callback

  const handleEditorDidMount = useCallback((editor: editor.IStandaloneCodeEditor, monaco: Monaco) => {
    editorRef.current = editor;
    monacoRef.current = monaco;

    const model = editor.getModel();
    if (model) {
      // Force set the language if it's wrong
      if (languageRef.current === 'log' && model.getLanguageId() !== 'log') {
        monaco.editor.setModelLanguage(model, 'log');
      }
    }

    // Format JSON files
    if (languageRef.current === 'json') {
      const currentContent = editor.getValue();
      if (currentContent) {
        try {
          const parsed = JSON.parse(currentContent);
          const formatted = JSON.stringify(parsed, null, 2);
          if (formatted !== currentContent) {
            editor.setValue(formatted);
          }
        } catch {
          // Not valid JSON, leave as is
        }
      }
    }

    // Configure JSON validation
    if (languageRef.current === 'json') {
      monaco.languages.json.jsonDefaults.setDiagnosticsOptions({
        validate: true,
        schemas: [],
        allowComments: true,
        trailingCommas: 'ignore'
      });
    }

    // Set initial line counts
    if (model) {
      const lineCount = model.getLineCount();
      setTotalLineCount(lineCount);
      setVisibleLineCount(lineCount);
    }

    // Apply initial filter if any
    if (initialFilterRef.current && applyFilterRef.current) {
      const { text, context } = initialFilterRef.current;
      applyFilterRef.current(text, context);
      initialFilterRef.current = null; // Clear after use
    }
  }, []); // No dependencies - stable callback that accesses current state via refs

  // Note: We don't need to update content when using defaultValue + keepCurrentModel
  // because the model is stable and content updates would clear hidden areas

  // Handle filter input change
  const handleFilterChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    setFilterText(value);
    const numericContext = contextLines === '' ? 0 : parseInt(contextLines, 10);
    debouncedApplyFilter(value, numericContext);
  }, [contextLines, debouncedApplyFilter]);


  // Open search with keyboard shortcut
  const openSearch = useCallback(() => {
    if (editorRef.current) {
      editorRef.current.trigger('keyboard', 'actions.find', null);
    }
  }, []);

  // Focus filter input
  const focusFilter = useCallback(() => {
    if (filterInputRef.current) {
      filterInputRef.current.focus();
      filterInputRef.current.select();
    }
  }, []);

  // Keyboard shortcuts
  useKeyboardShortcuts([
    { key: 'f', cmd: true, handler: openSearch },
    { key: '/', handler: focusFilter },
  ]);

  // Loading state
  if (loading && !content) {
    return (
      <div className="file-viewer loading">
        <div className="loading-container">
          <div className="loading-message">Loading {tab.title}...</div>
          {progress.total > 0 && (
            <>
              <div className="progress-bar">
                <div className="progress-fill" style={{ width: `${progress.percent}%` }} />
              </div>
              <div className="progress-text">
                {formatFileSize(progress.loaded)} / {formatFileSize(progress.total)} ({progress.percent}%)
              </div>
            </>
          )}
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="file-viewer error">
        <div className="error-message">
          <h3>Error loading file</h3>
          <p>{error}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="enhanced-file-viewer">
      {/* Filter controls */}
      <div className="file-controls">
        <div className="filter-controls">
          <input
            ref={filterInputRef}
            type="text"
            className="filter-input"
            placeholder="Filter: word +include -exclude (/ to focus)"
            value={filterText}
            onChange={handleFilterChange}
          />
          <input
            type="text"
            className="context-input"
            placeholder="plus context lines"
            value={contextLines}
            onChange={(e) => {
              const value = e.target.value;
              // Only allow empty string or numeric input
              if (value === '' || /^\d+$/.test(value)) {
                setContextLines(value);
                const numericValue = value === '' ? 0 : parseInt(value, 10);
                debouncedApplyFilter(filterText, numericValue);
              }
            }}
            style={{ width: '120px' }}
          />
          {filterText && (
            <span className="filter-status">
              {visibleLineCount.toLocaleString()} / {totalLineCount.toLocaleString()} lines
            </span>
          )}
        </div>
      </div>

      <Editor
        height="calc(100% - 40px)"
        language={language}
        defaultValue={content}
        path={tab.fileId} // stable path for the model
        keepCurrentModel={true}
        theme={language === 'log' ? 'log-theme' : 'vs-dark'}
        beforeMount={handleBeforeMount}
        onMount={handleEditorDidMount}
        options={{
          readOnly: true,
          minimap: {
            enabled: content.length > 10000 // Only show minimap for large files
          },
          scrollBeyondLastLine: false,
          fontSize: 13,
          fontFamily: 'Monaco, Menlo, "Courier New", monospace',
          automaticLayout: true,
          wordWrap: 'off',
          lineNumbers: 'on',
          renderLineHighlight: 'all',
          scrollbar: {
            vertical: 'visible',
            horizontal: 'visible',
            useShadows: false,
            verticalScrollbarSize: 10,
            horizontalScrollbarSize: 10
          },
          folding: true,
          foldingStrategy: 'indentation',
          showFoldingControls: 'always',
          bracketPairColorization: {
            enabled: true
          },
          guides: {
            bracketPairs: true,
            indentation: true
          },
          // Enable breadcrumbs for navigation - note: this should be set via Monaco configuration
          // 'breadcrumbs.enabled': true,
          // Quick suggestions for navigation
          quickSuggestions: false,
          suggestOnTriggerCharacters: false,
          // Enhanced navigation
          links: false,
          contextmenu: true,
          // Better selection
          selectionHighlight: true,
          occurrencesHighlight: "singleFile",
          // Format on paste
          formatOnPaste: false,
          formatOnType: false,
          // Performance settings
          renderValidationDecorations: 'on',
          smoothScrolling: true,
          cursorBlinking: 'blink',
          cursorSmoothCaretAnimation: 'on',
          // Disable unicode ambiguous character warnings for log files
          unicodeHighlight: {
            ambiguousCharacters: language === 'log' ? false : true,
            invisibleCharacters: language === 'log' ? false : true
          },
          // Search settings
          find: {
            seedSearchStringFromSelection: 'always',
            autoFindInSelection: 'never',
            addExtraSpaceOnTop: true
          }
        }}
      />

      {/* Streaming indicator */}
      {isStreaming && (
        <div className="streaming-footer">
          <div className="streaming-status">
            <span className="loading-spinner-small" />
            <span>Streaming content... {progress.percent}% complete</span>
          </div>
        </div>
      )}
    </div>
  );
}

function formatFileSize(bytes: number): string {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${(bytes / Math.pow(k, i)).toFixed(1)} ${sizes[i]}`;
}

export default memo(EnhancedFileViewer);