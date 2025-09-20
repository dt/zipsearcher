export type ZipEntryId = string; // zip-internal path

export interface ZipEntryMeta {
  id: ZipEntryId;
  name: string;
  path: string;
  size: number;
  compressedSize: number;
  isDir: boolean;
  lastModified?: Date;
}

export type ViewerTab =
  | { kind: 'file'; id: string; fileId: ZipEntryId; title: string; content?: string; isFiltered?: boolean; filterText?: string }
  | { kind: 'sql'; id: string; title: string; query: string; isCustomQuery?: boolean; sourceTable?: string }
  | { kind: 'error'; id: string; title: string; error: string; sourceFile: ZipEntryId; tableName: string };

export interface TableMeta {
  name: string; // normalized (e.g., system_jobs)
  sourceFile: ZipEntryId;
  loaded: boolean;
  rowCount?: number;
  deferred?: boolean; // Large tables that need click-to-load
  size?: number; // File size in bytes
  loading?: boolean; // Currently loading
  nodeId?: number; // Node ID for node-specific tables
  originalName?: string; // Original table name without node prefix
  isError?: boolean; // True for .err.txt files
  loadError?: string; // Error message if loading failed
}

export interface AppState {
  zip?: {
    name: string;
    size: number;
    entries: ZipEntryMeta[];
  };
  openTabs: ViewerTab[];
  activeTabId?: string;
  filesIndex: Record<ZipEntryId, ZipEntryMeta>;
  fileCache: Map<ZipEntryId, { text?: string; bytes?: Uint8Array }>;
  tables: Record<string, TableMeta>;
  tablesLoading?: boolean; // Global state for table loading
}