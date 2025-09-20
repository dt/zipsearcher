import { useState, useCallback, useMemo, useRef } from 'react';
import { useApp } from '../../state/AppContext';
import { duckDBService } from '../../services/duckdb';
import { useKeyboardNavigation } from '../../hooks/useKeyboardNavigation';

function formatFileSize(bytes: number): string {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${(bytes / Math.pow(k, i)).toFixed(1)} ${sizes[i]}`;
}

function parseTableName(name: string): { prefix?: string; mainName: string } {
  // Check for system_ or crdb_internal_ prefix
  if (name.startsWith('system_')) {
    return { prefix: 'system', mainName: name.substring(7) };
  }
  if (name.startsWith('crdb_internal_')) {
    return { prefix: 'crdb_internal', mainName: name.substring(14) };
  }
  return { mainName: name };
}

function TablesView() {
  const { state, dispatch } = useApp();
  const navigation = useKeyboardNavigation();
  const [filter, setFilter] = useState('');
  const [loadingTables, setLoadingTables] = useState<Set<string>>(new Set());
  const [collapsedSections, setCollapsedSections] = useState<Set<string>>(() => {
    // Default collapse all empty table sections
    const initial = new Set(['cluster-empty']);
    // Add all possible node empty sections (nodes 1-10 should cover most cases)
    for (let i = 1; i <= 10; i++) {
      initial.add(`node-${i}-empty`);
    }
    return initial;
  });
  const tables = Object.values(state.tables);
  const elementRefs = useRef<Map<string, HTMLElement>>(new Map());

  // Register element with refs
  const registerElement = useCallback((id: string, element: HTMLElement | null) => {
    if (element) {
      elementRefs.current.set(id, element);
    } else {
      elementRefs.current.delete(id);
    }
  }, []);

  // Calculate loading progress
  const loadingProgress = useMemo(() => {
    const loadableTables = tables.filter(t => !t.isError);
    if (loadableTables.length === 0) return null;

    // Only count non-deferred tables (deferred tables aren't loaded until clicked)
    const autoLoadTables = loadableTables.filter(t => !t.deferred);
    if (autoLoadTables.length === 0) return null;

    // Count tables that are either loaded or failed
    const completedCount = autoLoadTables.filter(t => t.loaded || t.loadError).length;
    const totalCount = autoLoadTables.length;

    // Debug: Log incomplete tables when we're close to completion
    if (completedCount >= totalCount - 5) {
      const incomplete = autoLoadTables.filter(t => !t.loaded && !t.loadError);
      if (incomplete.length > 0) {
        console.log(`Progress debug: ${completedCount}/${totalCount} complete. Incomplete tables:`,
          incomplete.map(t => ({ name: t.name, loading: t.loading, loaded: t.loaded, loadError: t.loadError }))
        );
      }
    }

    // Hide the progress bar when complete
    if (completedCount === totalCount) return null;

    // Calculate size-weighted progress
    const totalSize = autoLoadTables.reduce((sum, t) => sum + (t.size || 0), 0);
    const completedSize = autoLoadTables
      .filter(t => t.loaded || t.loadError)
      .reduce((sum, t) => sum + (t.size || 0), 0);

    // Weight by size for more accurate progress
    const progressPercent = totalSize > 0 ? Math.min(100, (completedSize / totalSize) * 100) : 0;

    return {
      completedCount,
      totalCount,
      progressPercent,
      isLoading: autoLoadTables.some(t => t.loading)
    };
  }, [tables]);

  // Get custom query tabs and filter them
  const customQueryTabs = useMemo(() => {
    const queryTabs = state.openTabs.filter(tab =>
      tab.kind === 'sql' && tab.isCustomQuery === true
    );
    if (!filter) return queryTabs;
    return queryTabs.filter(tab =>
      tab.title.toLowerCase().includes(filter.toLowerCase())
    );
  }, [state.openTabs, filter]);

  // Filter tables based on search input
  const filteredTables = tables.filter(table =>
    table.name.toLowerCase().includes(filter.toLowerCase()) ||
    (table.originalName && table.originalName.toLowerCase().includes(filter.toLowerCase()))
  );

  // Separate cluster (root) tables and node tables
  const clusterTables = filteredTables
    .filter(t => !t.nodeId)
    .sort((a, b) => a.name.localeCompare(b.name));

  // Separate zero-row tables from regular tables
  const regularClusterTables = clusterTables.filter(t => !t.loaded || t.rowCount === undefined || t.rowCount > 0);
  const emptyClusterTables = clusterTables.filter(t => t.loaded && t.rowCount === 0);

  const nodeTables = filteredTables
    .filter(t => t.nodeId !== undefined);

  // Group node tables by node
  const nodeGroups = new Map<number, typeof tables>();
  nodeTables.forEach(table => {
    if (table.nodeId !== undefined) {
      if (!nodeGroups.has(table.nodeId)) {
        nodeGroups.set(table.nodeId, []);
      }
      nodeGroups.get(table.nodeId)!.push(table);
    }
  });

  // Sort node groups by node ID
  const sortedNodeGroups = Array.from(nodeGroups.entries())
    .sort(([a], [b]) => a - b)
    .map(([nodeId, tables]) => ({
      nodeId,
      tables: tables.sort((a, b) => (a.originalName || a.name).localeCompare(b.originalName || b.name))
    }));

  // Auto-expand sections when filtering
  // Temporarily disabled to fix infinite loop caused by circular dependency
  // useEffect(() => {
  //   if (filter) {
  //     setCollapsedSections(prev => {
  //       const next = new Set(prev);

  //       // Expand custom queries section if there are matches
  //       if (customQueryTabs.length > 0) {
  //         next.delete('custom-queries');
  //       }

  //       // Expand cluster tables section if there are matches
  //       if (clusterTables.length > 0) {
  //         next.delete('cluster-tables');
  //       }

  //       // Expand node tables section and individual nodes if there are matches
  //       if (sortedNodeGroups.length > 0) {
  //         next.delete('node-tables');
  //         // Also expand individual node sections that have matches
  //         sortedNodeGroups.forEach(({ nodeId }) => {
  //           next.delete(`node-${nodeId}`);
  //         });
  //       }

  //       return next;
  //     });
  //   }
  // }, [filter, customQueryTabs.length, clusterTables.length, sortedNodeGroups]);

  // Update navigation items when filtered results change
  // Temporarily disabled to fix infinite loop
  // useEffect(() => {
  //   const items: NavigationItem[] = [];
  //   // ... navigation setup code ...
  //   navigation.setItems(items);
  // }, [navigation.setItems, customQueryTabs, regularClusterTables, emptyClusterTables, sortedNodeGroups, collapsedSections]);

  const loadDeferredTable = useCallback(async (table: typeof tables[0]) => {
    if (loadingTables.has(table.name)) return;

    setLoadingTables(prev => new Set([...prev, table.name]));

    // Update status to loading
    dispatch({
      type: 'UPDATE_TABLE',
      name: table.name,
      updates: { loading: true },
    });

    try {
      // Get zip reader
      const reader = (window as any).__zipReader;
      if (!reader) {
        throw new Error('No zip file loaded');
      }

      // Read file content
      console.log(`Loading deferred table ${table.name} from ${table.sourceFile}...`);
      const result = await reader.readFile(table.sourceFile);

      if (result.text) {
        // Load into DuckDB and get row count
        const rowCount = await duckDBService.loadTableFromText(table.name, result.text);

        // Update table status with row count
        dispatch({
          type: 'UPDATE_TABLE',
          name: table.name,
          updates: {
            loaded: true,
            rowCount,
            deferred: false,
            loading: false
          },
        });
      }
    } catch (err) {
      console.error(`Failed to load deferred table ${table.name}:`, err);
      const errorMessage = err instanceof Error ? err.message : String(err);
      dispatch({
        type: 'UPDATE_TABLE',
        name: table.name,
        updates: {
          loading: false,
          loadError: errorMessage
        },
      });
    } finally {
      setLoadingTables(prev => {
        const next = new Set(prev);
        next.delete(table.name);
        return next;
      });
    }
  }, [dispatch]);

  const handleTableClick = async (table: typeof tables[0]) => {
    // If it's an .err.txt file, open it in the file viewer
    if (table.isError) {
      const title = table.name.replace(/_/g, '.') + '.err.txt';
      dispatch({
        type: 'OPEN_TAB',
        tab: {
          kind: 'file',
          id: table.sourceFile,
          fileId: table.sourceFile,
          title,
        },
      });
      return;
    }

    // If it has a load error, open the error viewer
    if (table.loadError) {
      dispatch({
        type: 'OPEN_TAB',
        tab: {
          kind: 'error',
          id: `error-${table.name}`,
          title: `Error: ${table.originalName || table.name}`,
          error: table.loadError,
          sourceFile: table.sourceFile,
          tableName: table.originalName || table.name,
        },
      });
      return;
    }

    // Check if we have an existing tab for this table that's not custom
    const existingTab = state.openTabs.find(tab =>
      tab.kind === 'sql' &&
      tab.sourceTable === table.name &&
      !tab.isCustomQuery
    );

    // If table is deferred and not loaded, load it first
    if (table.deferred && !table.loaded && !table.loading) {
      await loadDeferredTable(table);
      // After loading, open the SQL tab
      setTimeout(() => {
        const query = `SELECT * FROM ${table.name} LIMIT 100`;
        dispatch({
          type: 'OPEN_TAB',
          tab: {
            kind: 'sql',
            id: existingTab ? existingTab.id : `sql-${table.name}`,
            title: table.name,
            query,
            sourceTable: table.name,
            isCustomQuery: false,
          },
        });
      }, 100);
    } else if (table.loaded) {
      // Table is already loaded
      const query = `SELECT * FROM ${table.name} LIMIT 100`;

      if (existingTab && existingTab.kind === 'sql' && existingTab.isCustomQuery) {
        // Existing tab has been modified, create a new one
        const newId = `sql-${table.name}-${Date.now()}`;
        dispatch({
          type: 'OPEN_TAB',
          tab: {
            kind: 'sql',
            id: newId,
            title: table.name,
            query,
            sourceTable: table.name,
            isCustomQuery: false,
          },
        });
      } else {
        // Open or switch to existing tab
        dispatch({
          type: 'OPEN_TAB',
          tab: {
            kind: 'sql',
            id: existingTab ? existingTab.id : `sql-${table.name}`,
            title: table.name,
            query,
            sourceTable: table.name,
            isCustomQuery: false,
          },
        });
      }
    }
  };

  const handleQueryClick = (tabId: string) => {
    dispatch({ type: 'SET_ACTIVE_TAB', id: tabId });
  };

  const toggleSection = (sectionId: string) => {
    setCollapsedSections(prev => {
      const next = new Set(prev);
      if (next.has(sectionId)) {
        next.delete(sectionId);
      } else {
        next.add(sectionId);
      }
      return next;
    });
  };

  // Early return for empty state (after all hooks)
  if (tables.length === 0) {
    return (
      <div className="empty-state">
        <p>No tables detected</p>
        <p style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '8px' }}>
          Tables will appear here when system.* CSV/TXT files are found
        </p>
      </div>
    );
  }

  return (
    <div className="tables-view">
      {/* Loading Progress - subtle bar at the very top */}
      {loadingProgress && loadingProgress.totalCount > 0 && (
        <div className="loading-progress-bar">
          <div
            className="progress-fill"
            style={{
              width: `${loadingProgress.progressPercent}%`,
              backgroundColor: '#007acc',
              height: '100%',
              position: 'absolute',
              left: 0,
              top: 0,
              transition: 'width 0.3s ease'
            }}
          />
        </div>
      )}

      {/* Filter */}
      <div className="filter-section">
        <input
          type="text"
          className="filter-input"
          placeholder="Filter tables..."
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
        />
      </div>

      {/* Custom Queries Section */}
      {customQueryTabs.length > 0 && (
        <div className="table-section">
          <div className="section-header sub-header clickable" onClick={() => toggleSection('custom-queries')}>
            <span className="section-chevron">{collapsedSections.has('custom-queries') ? '▶' : '▼'}</span>
            Custom Queries
          </div>
          {!collapsedSections.has('custom-queries') && customQueryTabs.map((tab) => {
            const isHighlighted = navigation.state.isNavigating &&
              navigation.state.items[navigation.state.highlightedIndex]?.id === `query-${tab.id}`;
            return (
              <div
                key={tab.id}
                ref={(el) => registerElement(`query-${tab.id}`, el)}
                className={`query-item ${isHighlighted ? 'keyboard-highlighted' : ''}`}
                onClick={() => handleQueryClick(tab.id)}
              >
                <span className="query-name">{tab.title}</span>
              </div>
            );
          })}
        </div>
      )}

      {/* Cluster Tables Section */}
      {(regularClusterTables.length > 0 || emptyClusterTables.length > 0) && (
        <div className="table-section">
          <div className="section-header sub-header clickable" onClick={() => toggleSection('cluster-tables')}>
            <span className="section-chevron">{collapsedSections.has('cluster-tables') ? '▶' : '▼'}</span>
            Cluster Tables
          </div>
          {!collapsedSections.has('cluster-tables') && (
            <>
              {regularClusterTables.map(table => {
                const { prefix, mainName } = parseTableName(table.name);
                const isHighlighted = navigation.state.isNavigating &&
                  navigation.state.items[navigation.state.highlightedIndex]?.id === `table-${table.name}`;
                return (
                  <div
                    key={table.name}
                    ref={(el) => registerElement(`table-${table.name}`, el)}
                    className={`table-item-compact ${table.loading ? 'loading' : ''} ${table.deferred ? 'deferred' : ''} ${table.isError ? 'error-file' : ''} ${table.loadError ? 'load-failed' : ''} ${table.rowCount === 0 ? 'empty-table' : ''} ${!table.loaded && !table.loading && !table.deferred ? 'unloaded' : ''} ${isHighlighted ? 'keyboard-highlighted' : ''}`}
                    onClick={() => handleTableClick(table)}
                  >
                    {table.loaded && table.rowCount !== undefined && !table.isError && !table.loadError && !table.deferred && (
                      <span className="table-row-count">{table.rowCount.toLocaleString()} rows</span>
                    )}
                    {table.loading && <span className="loading-spinner-small" />}
                    <div className="table-name-compact">
                      {prefix && <span className="table-prefix">{prefix}</span>}
                      <span className="table-main-name">{mainName}</span>
                    </div>
                    {(table.isError || table.loadError || table.deferred) && (
                      <div className="table-status-compact">
                        {table.isError && <span className="status-icon">⚠️</span>}
                        {table.loadError && <span className="status-icon">❌</span>}
                        {table.deferred && <span className="status-text">{formatFileSize(table.size || 0)}</span>}
                      </div>
                    )}
                  </div>
                );
              })}

              {/* Empty Tables Section */}
              {emptyClusterTables.length > 0 && (
                <>
                  <div className="subsection-header clickable" onClick={() => toggleSection('cluster-empty')}>
                    <span className="section-chevron">{collapsedSections.has('cluster-empty') ? '▶' : '▼'}</span>
                    Empty Tables ({emptyClusterTables.length})
                  </div>
                  {!collapsedSections.has('cluster-empty') && emptyClusterTables.map(table => {
                    const { prefix, mainName } = parseTableName(table.name);
                    const isHighlighted = navigation.state.isNavigating &&
                      navigation.state.items[navigation.state.highlightedIndex]?.id === `table-${table.name}`;
                    return (
                      <div
                        key={table.name}
                        ref={(el) => registerElement(`table-${table.name}`, el)}
                        className={`table-item-compact empty-table ${isHighlighted ? 'keyboard-highlighted' : ''}`}
                        onClick={() => handleTableClick(table)}
                      >
                        <span className="table-row-count">0 rows</span>
                        <div className="table-name-compact">
                          {prefix && <span className="table-prefix">{prefix}</span>}
                          <span className="table-main-name">{mainName}</span>
                        </div>
                      </div>
                    );
                  })}
                </>
              )}
            </>
          )}
        </div>
      )}

      {/* Node Tables Section */}
      {sortedNodeGroups.length > 0 && (
        <div className="table-section">
          <div className="section-header sub-header clickable" onClick={() => toggleSection('node-tables')}>
            <span className="section-chevron">{collapsedSections.has('node-tables') ? '▶' : '▼'}</span>
            Node Tables
          </div>
          {!collapsedSections.has('node-tables') && sortedNodeGroups.map(({ nodeId, tables }) => {
            // Separate zero-row tables from regular tables for each node
            const regularNodeTables = tables.filter(t => !t.loaded || t.rowCount === undefined || t.rowCount > 0);
            const emptyNodeTables = tables.filter(t => t.loaded && t.rowCount === 0);

            return (
              <div key={`node-${nodeId}`} className="node-group">
                <div className="node-subheader clickable" onClick={() => toggleSection(`node-${nodeId}`)}>
                  <span className="section-chevron">{collapsedSections.has(`node-${nodeId}`) ? '▶' : '▼'}</span>
                  Node {nodeId}
                </div>
                {!collapsedSections.has(`node-${nodeId}`) && (
                  <>
                    {regularNodeTables.map(table => {
                      const tableName = table.originalName || table.name;
                      const { prefix, mainName } = parseTableName(tableName);
                      const isHighlighted = navigation.state.isNavigating &&
                        navigation.state.items[navigation.state.highlightedIndex]?.id === `table-${table.name}`;
                      return (
                        <div
                          key={table.name}
                          ref={(el) => registerElement(`table-${table.name}`, el)}
                          className={`table-item-compact ${table.loading ? 'loading' : ''} ${table.deferred ? 'deferred' : ''} ${table.isError ? 'error-file' : ''} ${table.loadError ? 'load-failed' : ''} ${table.rowCount === 0 ? 'empty-table' : ''} ${!table.loaded && !table.loading && !table.deferred ? 'unloaded' : ''} ${isHighlighted ? 'keyboard-highlighted' : ''}`}
                          onClick={() => handleTableClick(table)}
                        >
                          {table.loaded && table.rowCount !== undefined && !table.isError && !table.loadError && !table.deferred && (
                            <span className="table-row-count">{table.rowCount.toLocaleString()}</span>
                          )}
                          {table.loading && <span className="loading-spinner-small" />}
                          <div className="table-name-compact">
                            {prefix && <span className="table-prefix">{prefix}</span>}
                            <span className="table-main-name">{mainName}</span>
                          </div>
                          {(table.isError || table.loadError || table.deferred) && (
                            <div className="table-status-compact">
                              {table.isError && <span className="status-icon">⚠️</span>}
                              {table.loadError && <span className="status-icon">❌</span>}
                              {table.deferred && <span className="status-text">{formatFileSize(table.size || 0)}</span>}
                            </div>
                          )}
                        </div>
                      );
                    })}

                    {/* Empty Tables for this node */}
                    {emptyNodeTables.length > 0 && (
                      <>
                        <div className="subsection-header clickable" onClick={() => toggleSection(`node-${nodeId}-empty`)}>
                          <span className="section-chevron">{collapsedSections.has(`node-${nodeId}-empty`) ? '▶' : '▼'}</span>
                          Empty Tables ({emptyNodeTables.length})
                        </div>
                        {!collapsedSections.has(`node-${nodeId}-empty`) && emptyNodeTables.map(table => {
                          const tableName = table.originalName || table.name;
                          const { prefix, mainName } = parseTableName(tableName);
                          const isHighlighted = navigation.state.isNavigating &&
                            navigation.state.items[navigation.state.highlightedIndex]?.id === `table-${table.name}`;
                          return (
                            <div
                              key={table.name}
                              ref={(el) => registerElement(`table-${table.name}`, el)}
                              className={`table-item-compact empty-table ${isHighlighted ? 'keyboard-highlighted' : ''}`}
                              onClick={() => handleTableClick(table)}
                            >
                              <span className="table-row-count">0 rows</span>
                              <div className="table-name-compact">
                                {prefix && <span className="table-prefix">{prefix}</span>}
                                <span className="table-main-name">{mainName}</span>
                              </div>
                            </div>
                          );
                        })}
                      </>
                    )}
                  </>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Show message if everything is filtered out */}
      {filter && customQueryTabs.length === 0 && clusterTables.length === 0 && sortedNodeGroups.length === 0 && (
        <div className="empty-state">
          <p>No matching items</p>
        </div>
      )}
    </div>
  );
}

export default TablesView;