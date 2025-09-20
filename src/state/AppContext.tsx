import React, { createContext, useContext, useReducer } from 'react';
import type { ReactNode } from 'react';
import type { AppState, ViewerTab, ZipEntryMeta, TableMeta } from './types';

type AppAction =
  | { type: 'SET_ZIP'; name: string; size: number; entries: ZipEntryMeta[] }
  | { type: 'OPEN_TAB'; tab: ViewerTab }
  | { type: 'OPEN_NEW_FILE_TAB'; fileId: string; fileName: string }
  | { type: 'CLOSE_TAB'; id: string }
  | { type: 'SET_ACTIVE_TAB'; id: string }
  | { type: 'UPDATE_TAB'; id: string; updates: Partial<ViewerTab> }
  | { type: 'CACHE_FILE'; id: string; content: { text?: string; bytes?: Uint8Array } }
  | { type: 'REGISTER_TABLE'; table: TableMeta }
  | { type: 'UPDATE_TABLE'; name: string; updates: Partial<TableMeta> }
  | { type: 'SET_TABLES_LOADING'; loading: boolean };

const initialState: AppState = {
  openTabs: [],
  activeTabId: undefined,
  filesIndex: {},
  fileCache: new Map(),
  tables: {},
};

function appReducer(state: AppState, action: AppAction): AppState {
  switch (action.type) {
    case 'SET_ZIP': {
      const filesIndex: Record<string, ZipEntryMeta> = {};
      action.entries.forEach(entry => {
        filesIndex[entry.id] = entry;
      });
      return {
        ...state,
        zip: {
          name: action.name,
          size: action.size,
          entries: action.entries,
        },
        filesIndex,
      };
    }

    case 'OPEN_TAB': {
      const existingTab = state.openTabs.find(t => t.id === action.tab.id);
      if (existingTab) {
        return { ...state, activeTabId: action.tab.id };
      }
      // For file tabs, ensure fileId is set if not provided
      const tabToAdd = action.tab.kind === 'file'
        ? { ...action.tab, fileId: action.tab.fileId || action.tab.id }
        : action.tab;
      return {
        ...state,
        openTabs: [...state.openTabs, tabToAdd],
        activeTabId: action.tab.id,
      };
    }

    case 'OPEN_NEW_FILE_TAB': {
      // Check if a tab for this file already exists
      const existingTab = state.openTabs.find(tab =>
        tab.kind === 'file' && tab.fileId === action.fileId
      );

      if (existingTab) {
        // Activate existing tab instead of creating duplicate
        return {
          ...state,
          activeTabId: existingTab.id,
        };
      }

      // Generate a unique ID for this new tab instance
      const timestamp = Date.now();
      const uniqueId = `${action.fileId}_${timestamp}`;
      const newTab: ViewerTab = {
        kind: 'file',
        id: uniqueId,
        fileId: action.fileId,
        title: action.fileName,
      };
      return {
        ...state,
        openTabs: [...state.openTabs, newTab],
        activeTabId: uniqueId,
      };
    }

    case 'CLOSE_TAB': {
      const newTabs = state.openTabs.filter(t => t.id !== action.id);
      let newActiveId = state.activeTabId;

      if (state.activeTabId === action.id) {
        const closedIndex = state.openTabs.findIndex(t => t.id === action.id);
        if (newTabs.length > 0) {
          const newIndex = Math.min(closedIndex, newTabs.length - 1);
          newActiveId = newTabs[newIndex].id;
        } else {
          newActiveId = undefined;
        }
      }

      return {
        ...state,
        openTabs: newTabs,
        activeTabId: newActiveId,
      };
    }

    case 'SET_ACTIVE_TAB': {
      return { ...state, activeTabId: action.id };
    }

    case 'UPDATE_TAB': {
      const tabIndex = state.openTabs.findIndex(t => t.id === action.id);
      if (tabIndex === -1) return state;

      const newTabs = [...state.openTabs];
      newTabs[tabIndex] = { ...newTabs[tabIndex], ...action.updates } as ViewerTab;

      return { ...state, openTabs: newTabs };
    }

    case 'CACHE_FILE': {
      const newCache = new Map(state.fileCache);
      newCache.set(action.id, action.content);
      return { ...state, fileCache: newCache };
    }

    case 'REGISTER_TABLE': {
      return {
        ...state,
        tables: { ...state.tables, [action.table.name]: action.table },
      };
    }

    case 'UPDATE_TABLE': {
      const existing = state.tables[action.name];
      if (!existing) return state;

      return {
        ...state,
        tables: {
          ...state.tables,
          [action.name]: { ...existing, ...action.updates },
        },
      };
    }

    case 'SET_TABLES_LOADING': {
      return {
        ...state,
        tablesLoading: action.loading,
      };
    }

    default:
      return state;
  }
}

interface AppContextValue {
  state: AppState;
  dispatch: React.Dispatch<AppAction>;
}

const AppContext = createContext<AppContextValue | undefined>(undefined);

export function AppProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(appReducer, initialState);

  return (
    <AppContext.Provider value={{ state, dispatch }}>
      {children}
    </AppContext.Provider>
  );
}

export function useApp() {
  const context = useContext(AppContext);
  if (!context) {
    throw new Error('useApp must be used within AppProvider');
  }
  return context;
}