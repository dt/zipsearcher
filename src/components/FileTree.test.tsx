import { describe, it, expect, vi, beforeEach } from 'vitest';
import React from 'react';
import { render, fireEvent, screen } from '@testing-library/react';
import { FileTree } from './FileTree';
import type { FileEntry } from '../state/types';

describe('FileTree', () => {
  const mockOnFileSelect = vi.fn();

  const mockFiles: FileEntry[] = [
    {
      id: '1',
      name: 'folder1',
      path: 'folder1/',
      isDir: true,
      size: 0,
      compressedSize: 0
    },
    {
      id: '2',
      name: 'file1.txt',
      path: 'folder1/file1.txt',
      isDir: false,
      size: 100,
      compressedSize: 50
    },
    {
      id: '3',
      name: 'file2.sql',
      path: 'file2.sql',
      isDir: false,
      size: 200,
      compressedSize: 100
    }
  ];

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('rendering', () => {
    const testCases = [
      { files: [], expectedText: null },
      { files: mockFiles, expectedText: 'folder1' }
    ];

    testCases.forEach(({ files, expectedText }) => {
      it(`should render ${files.length} files`, () => {
        render(<FileTree files={files} onFileSelect={mockOnFileSelect} />);

        if (expectedText) {
          expect(screen.getByText(expectedText)).toBeInTheDocument();
        } else {
          expect(screen.queryByRole('tree')).toBeEmptyDOMElement();
        }
      });
    });
  });

  describe('folder expansion', () => {
    it('should toggle folder on click', () => {
      render(<FileTree files={mockFiles} onFileSelect={mockOnFileSelect} />);

      const folder = screen.getByText('folder1');

      // Initially collapsed
      expect(screen.queryByText('file1.txt')).not.toBeInTheDocument();

      // Click to expand
      fireEvent.click(folder);
      expect(screen.getByText('file1.txt')).toBeInTheDocument();

      // Click to collapse
      fireEvent.click(folder);
      expect(screen.queryByText('file1.txt')).not.toBeInTheDocument();
    });

    it('should not call onFileSelect for folders', () => {
      render(<FileTree files={mockFiles} onFileSelect={mockOnFileSelect} />);

      const folder = screen.getByText('folder1');
      fireEvent.click(folder);

      expect(mockOnFileSelect).not.toHaveBeenCalled();
    });
  });

  describe('file selection', () => {
    it('should call onFileSelect when file clicked', () => {
      render(<FileTree files={mockFiles} onFileSelect={mockOnFileSelect} />);

      const file = screen.getByText('file2.sql');
      fireEvent.click(file);

      expect(mockOnFileSelect).toHaveBeenCalledWith(mockFiles[2]);
    });

    it('should handle nested file selection', () => {
      render(<FileTree files={mockFiles} onFileSelect={mockOnFileSelect} />);

      // Expand folder first
      const folder = screen.getByText('folder1');
      fireEvent.click(folder);

      // Click nested file
      const file = screen.getByText('file1.txt');
      fireEvent.click(file);

      expect(mockOnFileSelect).toHaveBeenCalledWith(mockFiles[1]);
    });
  });

  describe('file icons', () => {
    const iconTestCases = [
      { extension: '.txt', expectedIcon: '📄' },
      { extension: '.sql', expectedIcon: '🗃️' },
      { extension: '.json', expectedIcon: '📊' },
      { extension: '.log', expectedIcon: '📝' },
      { extension: '.csv', expectedIcon: '📊' }
    ];

    iconTestCases.forEach(({ extension, expectedIcon }) => {
      it(`should show ${expectedIcon} for ${extension} files`, () => {
        const file: FileEntry = {
          id: '1',
          name: `test${extension}`,
          path: `test${extension}`,
          isDir: false,
          size: 100,
          compressedSize: 50
        };

        render(<FileTree files={[file]} onFileSelect={mockOnFileSelect} />);
        expect(screen.getByText(expectedIcon)).toBeInTheDocument();
      });
    });
  });

  describe('tree structure', () => {
    it('should build nested tree from flat file list', () => {
      const nestedFiles: FileEntry[] = [
        {
          id: '1',
          name: 'a',
          path: 'a/',
          isDir: true,
          size: 0,
          compressedSize: 0
        },
        {
          id: '2',
          name: 'b',
          path: 'a/b/',
          isDir: true,
          size: 0,
          compressedSize: 0
        },
        {
          id: '3',
          name: 'c.txt',
          path: 'a/b/c.txt',
          isDir: false,
          size: 100,
          compressedSize: 50
        }
      ];

      render(<FileTree files={nestedFiles} onFileSelect={mockOnFileSelect} />);

      // Expand folders
      fireEvent.click(screen.getByText('a'));
      fireEvent.click(screen.getByText('b'));

      // Nested file should be visible
      expect(screen.getByText('c.txt')).toBeInTheDocument();
    });
  });

  describe('search filter', () => {
    it('should filter files by search term', () => {
      render(<FileTree files={mockFiles} onFileSelect={mockOnFileSelect} searchTerm="sql" />);

      expect(screen.queryByText('folder1')).not.toBeInTheDocument();
      expect(screen.getByText('file2.sql')).toBeInTheDocument();
    });

    it('should show parent folders of matching files', () => {
      render(<FileTree files={mockFiles} onFileSelect={mockOnFileSelect} searchTerm="file1" />);

      // Parent folder should be visible and expanded
      expect(screen.getByText('folder1')).toBeInTheDocument();
      expect(screen.getByText('file1.txt')).toBeInTheDocument();
    });

    it('should handle empty search', () => {
      render(<FileTree files={mockFiles} onFileSelect={mockOnFileSelect} searchTerm="" />);

      expect(screen.getByText('folder1')).toBeInTheDocument();
      expect(screen.getByText('file2.sql')).toBeInTheDocument();
    });
  });
});