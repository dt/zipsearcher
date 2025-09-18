import { describe, it, expect, vi } from 'vitest';
import React from 'react';
import { renderHook, act } from '@testing-library/react';
import { AppProvider, useApp } from './AppContext';
import type { FileEntry, Tab } from './types';

describe('AppContext', () => {
  const wrapper = ({ children }: { children: React.ReactNode }) => (
    <AppProvider>{children}</AppProvider>
  );

  describe('file management', () => {
    const mockFile: FileEntry = {
      id: '1',
      name: 'test.txt',
      path: 'test.txt',
      isDir: false,
      size: 100,
      compressedSize: 50
    };

    it('should set and get files', () => {
      const { result } = renderHook(() => useApp(), { wrapper });

      act(() => {
        result.current.setFiles([mockFile]);
      });

      expect(result.current.files).toEqual([mockFile]);
    });

    it('should set selected file', () => {
      const { result } = renderHook(() => useApp(), { wrapper });

      act(() => {
        result.current.setFiles([mockFile]);
        result.current.setSelectedFile(mockFile);
      });

      expect(result.current.selectedFile).toEqual(mockFile);
    });
  });

  describe('tab management', () => {
    const mockTab: Tab = {
      id: '1',
      title: 'test.txt',
      type: 'file',
      data: { path: 'test.txt' }
    };

    it('should add tab', () => {
      const { result } = renderHook(() => useApp(), { wrapper });

      act(() => {
        result.current.addTab(mockTab);
      });

      expect(result.current.tabs).toContainEqual(mockTab);
      expect(result.current.activeTabId).toBe('1');
    });

    it('should not add duplicate tab', () => {
      const { result } = renderHook(() => useApp(), { wrapper });

      act(() => {
        result.current.addTab(mockTab);
        result.current.addTab(mockTab);
      });

      expect(result.current.tabs).toHaveLength(1);
    });

    it('should close tab', () => {
      const { result } = renderHook(() => useApp(), { wrapper });

      act(() => {
        result.current.addTab(mockTab);
        result.current.closeTab('1');
      });

      expect(result.current.tabs).toHaveLength(0);
      expect(result.current.activeTabId).toBeUndefined();
    });

    it('should switch to next tab when closing active', () => {
      const { result } = renderHook(() => useApp(), { wrapper });

      const tab1 = { ...mockTab, id: '1' };
      const tab2 = { ...mockTab, id: '2', title: 'file2.txt' };

      act(() => {
        result.current.addTab(tab1);
        result.current.addTab(tab2);
        result.current.setActiveTabId('1');
        result.current.closeTab('1');
      });

      expect(result.current.activeTabId).toBe('2');
    });

    it('should set active tab', () => {
      const { result } = renderHook(() => useApp(), { wrapper });

      const tab1 = { ...mockTab, id: '1' };
      const tab2 = { ...mockTab, id: '2', title: 'file2.txt' };

      act(() => {
        result.current.addTab(tab1);
        result.current.addTab(tab2);
        result.current.setActiveTabId('2');
      });

      expect(result.current.activeTabId).toBe('2');
    });
  });

  describe('loading states', () => {
    it('should set loading state', () => {
      const { result } = renderHook(() => useApp(), { wrapper });

      act(() => {
        result.current.setLoading(true);
      });

      expect(result.current.isLoading).toBe(true);

      act(() => {
        result.current.setLoading(false);
      });

      expect(result.current.isLoading).toBe(false);
    });
  });

  describe('search functionality', () => {
    it('should set search term', () => {
      const { result } = renderHook(() => useApp(), { wrapper });

      act(() => {
        result.current.setSearchTerm('test');
      });

      expect(result.current.searchTerm).toBe('test');
    });

    it('should filter files by search term', () => {
      const { result } = renderHook(() => useApp(), { wrapper });

      const files = [
        { id: '1', name: 'test.txt', path: 'test.txt', isDir: false, size: 100, compressedSize: 50 },
        { id: '2', name: 'other.sql', path: 'other.sql', isDir: false, size: 200, compressedSize: 100 }
      ];

      act(() => {
        result.current.setFiles(files);
        result.current.setSearchTerm('test');
      });

      const filtered = result.current.getFilteredFiles();
      expect(filtered).toHaveLength(1);
      expect(filtered[0].name).toBe('test.txt');
    });
  });

  describe('SQL tables', () => {
    it('should set available tables', () => {
      const { result } = renderHook(() => useApp(), { wrapper });

      const tables = ['users', 'products', 'orders'];

      act(() => {
        result.current.setTables(tables);
      });

      expect(result.current.tables).toEqual(tables);
    });

    it('should set query results', () => {
      const { result } = renderHook(() => useApp(), { wrapper });

      const results = {
        columns: ['id', 'name'],
        rows: [
          { id: 1, name: 'Alice' },
          { id: 2, name: 'Bob' }
        ]
      };

      act(() => {
        result.current.setQueryResults(results);
      });

      expect(result.current.queryResults).toEqual(results);
    });
  });

  describe('sidebar state', () => {
    it('should toggle sidebar', () => {
      const { result } = renderHook(() => useApp(), { wrapper });

      const initial = result.current.sidebarOpen;

      act(() => {
        result.current.toggleSidebar();
      });

      expect(result.current.sidebarOpen).toBe(!initial);

      act(() => {
        result.current.toggleSidebar();
      });

      expect(result.current.sidebarOpen).toBe(initial);
    });

    it('should set sidebar view', () => {
      const { result } = renderHook(() => useApp(), { wrapper });

      act(() => {
        result.current.setSidebarView('tables');
      });

      expect(result.current.sidebarView).toBe('tables');

      act(() => {
        result.current.setSidebarView('files');
      });

      expect(result.current.sidebarView).toBe('files');
    });
  });

  describe('error handling', () => {
    it('should set and clear errors', () => {
      const { result } = renderHook(() => useApp(), { wrapper });

      act(() => {
        result.current.setError('Something went wrong');
      });

      expect(result.current.error).toBe('Something went wrong');

      act(() => {
        result.current.clearError();
      });

      expect(result.current.error).toBeUndefined();
    });
  });

  describe('zip file handling', () => {
    it('should set zip data', () => {
      const { result } = renderHook(() => useApp(), { wrapper });

      const mockZipData = new Uint8Array([1, 2, 3, 4, 5]);

      act(() => {
        result.current.setZipData(mockZipData);
      });

      expect(result.current.zipData).toEqual(mockZipData);
    });

    it('should clear all data on reset', () => {
      const { result } = renderHook(() => useApp(), { wrapper });

      act(() => {
        result.current.setFiles([{ id: '1', name: 'test.txt', path: 'test.txt', isDir: false, size: 100, compressedSize: 50 }]);
        result.current.addTab({ id: '1', title: 'test', type: 'file', data: {} });
        result.current.setSearchTerm('test');
        result.current.reset();
      });

      expect(result.current.files).toHaveLength(0);
      expect(result.current.tabs).toHaveLength(0);
      expect(result.current.searchTerm).toBe('');
      expect(result.current.selectedFile).toBeUndefined();
      expect(result.current.activeTabId).toBeUndefined();
    });
  });
});