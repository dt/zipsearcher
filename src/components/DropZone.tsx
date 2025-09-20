import React, { useState, useCallback } from 'react';
import { useApp } from '../state/AppContext';
import { ZipReader } from '../zip/ZipReader';
import { duckDBService } from '../services/duckdb';

function DropZone() {
  const { dispatch, state } = useApp();
  const [isDragging, setIsDragging] = useState(false);
  const [loading, setLoading] = useState(false);
  const [loadingMessage, setLoadingMessage] = useState('');
  const [error, setError] = useState<string | null>(null);

  // Check if we should show loading state (either local loading or tables loading)
  const isLoading = loading || state.tablesLoading;

  const loadSystemTables = async (reader: any, entries: any[]): Promise<void> => {
    // Load system and crdb_internal tables in the background
    // First load root tables, then node-specific tables
    const rootTables = entries.filter(entry =>
      !entry.isDir &&
      (entry.path.includes('system.') || entry.path.includes('crdb_internal.')) &&
      (entry.path.endsWith('.txt') || entry.path.endsWith('.csv')) &&
      !entry.path.endsWith('.err.txt') &&
      !entry.path.includes('/nodes/')
    );

    const nodeTables = entries.filter(entry =>
      !entry.isDir &&
      entry.path.includes('/nodes/') &&
      (entry.path.includes('system.') || entry.path.includes('crdb_internal.')) &&
      (entry.path.endsWith('.txt') || entry.path.endsWith('.csv')) &&
      !entry.path.endsWith('.err.txt')
    );

    const tablesToLoad = [...rootTables, ...nodeTables];

    const LARGE_FILE_THRESHOLD = 20 * 1024 * 1024; // 20MB

    for (const entry of tablesToLoad) {
      // Check if it's a node-specific table
      let tableName = entry.name.replace(/\.(err\.txt|txt|csv)$/, '').replace(/\./g, '_');
      let nodeId: number | undefined;
      let originalName: string | undefined;

      // Parse node ID from path like /nodes/1/system.jobs.txt
      const nodeMatch = entry.path.match(/\/nodes\/(\d+)\//);
      if (nodeMatch) {
        nodeId = parseInt(nodeMatch[1], 10);
        originalName = tableName;
        tableName = `n${nodeId}_${tableName}`;
      }

      try {
        // Mark table as loading
        dispatch({
          type: 'UPDATE_TABLE',
          name: tableName,
          updates: { loading: true, nodeId, originalName },
        });

        // Check file size - defer loading if too large
        if (entry.size > LARGE_FILE_THRESHOLD) {
          console.log(`Deferring large table ${tableName} (${(entry.size / 1024 / 1024).toFixed(1)}MB)`);

          // Just mark as deferred, don't load yet
          dispatch({
            type: 'UPDATE_TABLE',
            name: tableName,
            updates: {
              loaded: false,
              loading: false,
              deferred: true,
              size: entry.size,
              nodeId,
              originalName
            },
          });
          continue;
        }

        // Debug specific problematic table
        if (tableName.includes('probe_ranges')) {
          console.log(`[DEBUG] Loading problematic table ${tableName} from ${entry.path}...`);
        }

        // Read file content
        const result = await reader.readFile(entry.path);
        if (result.text) {
          // Check if file has only headers (no data rows)
          const lines = result.text.trim().split('\n');
          if (lines.length <= 1) {
            // Only header line or empty file
            dispatch({
              type: 'UPDATE_TABLE',
              name: tableName,
              updates: { loaded: true, loading: false, rowCount: 0, nodeId, originalName },
            });
          } else {

          // Load into DuckDB and get row count
          const rowCount = await duckDBService.loadTableFromText(tableName, result.text);

          // Debug specific problematic table
          if (tableName.includes('probe_ranges')) {
            console.log(`[DEBUG] Successfully loaded ${tableName} with ${rowCount} rows`);
          }

          // Update table status with row count
          dispatch({
            type: 'UPDATE_TABLE',
            name: tableName,
            updates: { loaded: true, loading: false, rowCount, nodeId, originalName },
          });
          }
        } else {
          // No text content found
          throw new Error('No text content found in file');
        }
      } catch (err) {
        console.error(`Failed to load table from ${entry.path}:`, err);

        // Debug specific problematic table
        if (tableName.includes('probe_ranges')) {
          console.log(`[DEBUG] Error loading ${tableName}:`, err);
        }

        // Mark table as failed with error message
        const errorMessage = err instanceof Error ? err.message : String(err);
        dispatch({
          type: 'UPDATE_TABLE',
          name: tableName,
          updates: {
            loaded: false,
            loading: false,
            loadError: errorMessage,
            nodeId,
            originalName
          },
        });
      }
    }

    // console.log('All system tables loaded');
  };

  const handleFile = async (file: File) => {
    if (!file.name.endsWith('.zip')) {
      setError('Please select a .zip file');
      return;
    }

    setLoading(true);
    setLoadingMessage(`Reading ${file.name} (${(file.size / 1024 / 1024).toFixed(1)} MB)...`);
    setError(null);

    try {
      setLoadingMessage('Loading file into memory...');

      // Read file with progress tracking
      const arrayBuffer = await file.arrayBuffer();
      const uint8Array = new Uint8Array(arrayBuffer);

      setLoadingMessage('Scanning zip contents...');
      const reader = new ZipReader(uint8Array);
      const entries = await reader.initialize();

      setLoadingMessage(`Processing ${entries.length} files...`);

      // Store reader globally for later file reading
      (window as any).__zipReader = reader;

      dispatch({
        type: 'SET_ZIP',
        name: file.name,
        size: file.size,
        entries,
      });

      // Set tables loading state before starting DuckDB
      dispatch({ type: 'SET_TABLES_LOADING', loading: true });
      setLoadingMessage('Loading tables...');

      // Initialize DuckDB in the background
      duckDBService.initialize().then(() => {
        // console.log('DuckDB ready, loading system tables...');
        loadSystemTables(reader, entries).then(() => {
          dispatch({ type: 'SET_TABLES_LOADING', loading: false });
          setLoading(false);
        }).catch(err => {
          console.error('Failed to load system tables:', err);
          dispatch({ type: 'SET_TABLES_LOADING', loading: false });
          setLoading(false);
        });
      }).catch(err => {
        console.error('Failed to initialize DuckDB:', err);
        dispatch({ type: 'SET_TABLES_LOADING', loading: false });
        setLoading(false);
      });

      // Auto-detect system tables (root and node-specific)
      entries.forEach(entry => {
        if (!entry.isDir &&
            (entry.path.includes('system.') || entry.path.includes('crdb_internal.')) &&
            (entry.path.endsWith('.txt') || entry.path.endsWith('.csv') || entry.path.endsWith('.err.txt'))) {

          let tableName = entry.name.replace(/\.(err\.txt|txt|csv)$/, '').replace(/\./g, '_');
          let nodeId: number | undefined;
          let originalName: string | undefined;

          // Parse node ID from path like /nodes/1/system.jobs.txt
          const nodeMatch = entry.path.match(/\/nodes\/(\d+)\//);
          if (nodeMatch) {
            nodeId = parseInt(nodeMatch[1], 10);
            originalName = tableName;
            tableName = `n${nodeId}_${tableName}`;
          }

          // Check if it's an error file
          const isErrorFile = entry.path.endsWith('.err.txt');

          dispatch({
            type: 'REGISTER_TABLE',
            table: {
              name: tableName,
              sourceFile: entry.id,
              loaded: false,
              size: entry.size,
              nodeId,
              originalName,
              isError: isErrorFile,
            },
          });
        }
      });
    } catch (err) {
      console.error('Failed to read zip:', err);
      setError(`Failed to read zip: ${err instanceof Error ? err.message : 'Unknown error'}`);
      setLoading(false);
    }
  };

  const handleDragEnter = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.currentTarget === e.target) {
      setIsDragging(false);
    }
  }, []);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);

    const files = Array.from(e.dataTransfer.files);
    if (files.length > 0) {
      handleFile(files[0]);
    }
  }, []);

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (files && files.length > 0) {
      handleFile(files[0]);
    }
  };

  const loadDemoFile = useCallback(async () => {
    setLoading(true);
    setLoadingMessage('Loading demo file...');
    setError(null);

    try {
      // Use relative path that works in both dev and production
      const response = await fetch(`${import.meta.env.BASE_URL}debug.zip`);
      if (!response.ok) {
        throw new Error('Failed to load demo file');
      }
      const arrayBuffer = await response.arrayBuffer();
      const file = new File([arrayBuffer], 'debug.zip', { type: 'application/zip' });
      handleFile(file);
    } catch (err) {
      console.error('Failed to load demo file:', err);
      setError(`Failed to load demo file: ${err instanceof Error ? err.message : 'Unknown error'}`);
      setLoading(false);
    }
  }, []);

  return (
    <div
      className={`drop-zone ${isDragging ? 'dragover' : ''}`}
      onDragEnter={handleDragEnter}
      onDragLeave={handleDragLeave}
      onDragOver={handleDragOver}
      onDrop={handleDrop}
      onClick={() => document.getElementById('file-input')?.click()}
    >
      <input
        id="file-input"
        type="file"
        accept=".zip"
        style={{ display: 'none' }}
        onChange={handleFileSelect}
      />

      <div className="drop-message">
        {isLoading ? (
          <p style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span className="loading-spinner-small" />
            {loadingMessage || 'Loading tables...'}
          </p>
        ) : error ? (
          <>
            <h2 style={{ color: 'var(--accent-danger)' }}>Error</h2>
            <p>{error}</p>
            <button className="btn" onClick={() => setError(null)}>
              Try Again
            </button>
          </>
        ) : (
          <>
            <h2>📦 Drop debug.zip here</h2>
            <p>or click to browse</p>
            <div style={{ marginTop: '1rem' }}>
              <button
                className="btn btn-secondary"
                onClick={(e) => {
                  e.stopPropagation();
                  loadDemoFile();
                }}
                style={{
                  fontSize: '0.9rem',
                  padding: '0.5rem 1rem',
                  background: 'var(--accent-muted)',
                  border: '1px solid var(--border)',
                  color: 'var(--text)'
                }}
              >
                🚀 Try Demo File
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

export default DropZone;