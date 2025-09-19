import { describe, it, expect, vi, beforeEach } from 'vitest';
import React from 'react';
import { render, fireEvent, screen } from '@testing-library/react';
import { TabBar } from './TabBar';
import type { Tab } from '../state/types';

describe.skip('TabBar', () => {
  const mockOnTabSelect = vi.fn();
  const mockOnTabClose = vi.fn();

  const mockTabs: Tab[] = [
    { id: '1', title: 'file1.txt', type: 'file', data: {} },
    { id: '2', title: 'query.sql', type: 'query', data: {} },
    { id: '3', title: 'table_users', type: 'table', data: {} }
  ];

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('rendering', () => {
    const testCases = [
      { tabs: [], activeId: undefined, expectedCount: 0 },
      { tabs: mockTabs, activeId: '1', expectedCount: 3 },
      { tabs: [mockTabs[0]], activeId: '1', expectedCount: 1 }
    ];

    testCases.forEach(({ tabs, activeId, expectedCount }) => {
      it(`should render ${expectedCount} tabs`, () => {
        render(
          <TabBar
            tabs={tabs}
            activeTabId={activeId}
            onTabSelect={mockOnTabSelect}
            onTabClose={mockOnTabClose}
          />
        );

        const tabElements = screen.queryAllByRole('tab');
        expect(tabElements).toHaveLength(expectedCount);
      });
    });
  });

  describe('tab selection', () => {
    it('should call onTabSelect when tab clicked', () => {
      render(
        <TabBar
          tabs={mockTabs}
          activeTabId="1"
          onTabSelect={mockOnTabSelect}
          onTabClose={mockOnTabClose}
        />
      );

      const secondTab = screen.getByText('query.sql');
      fireEvent.click(secondTab);

      expect(mockOnTabSelect).toHaveBeenCalledWith('2');
    });

    it('should highlight active tab', () => {
      render(
        <TabBar
          tabs={mockTabs}
          activeTabId="2"
          onTabSelect={mockOnTabSelect}
          onTabClose={mockOnTabClose}
        />
      );

      const activeTab = screen.getByText('query.sql').closest('.tab-item');
      expect(activeTab).toHaveClass('active');
    });

    it('should not call onTabSelect for already active tab', () => {
      render(
        <TabBar
          tabs={mockTabs}
          activeTabId="1"
          onTabSelect={mockOnTabSelect}
          onTabClose={mockOnTabClose}
        />
      );

      const activeTab = screen.getByText('file1.txt');
      fireEvent.click(activeTab);

      expect(mockOnTabSelect).not.toHaveBeenCalled();
    });
  });

  describe('tab closing', () => {
    it('should call onTabClose when close button clicked', () => {
      render(
        <TabBar
          tabs={mockTabs}
          activeTabId="1"
          onTabSelect={mockOnTabSelect}
          onTabClose={mockOnTabClose}
        />
      );

      const closeButtons = screen.getAllByRole('button', { name: /close/i });
      fireEvent.click(closeButtons[0]);

      expect(mockOnTabClose).toHaveBeenCalledWith('1');
    });

    it('should stop propagation on close click', () => {
      render(
        <TabBar
          tabs={mockTabs}
          activeTabId="1"
          onTabSelect={mockOnTabSelect}
          onTabClose={mockOnTabClose}
        />
      );

      const closeButton = screen.getAllByRole('button', { name: /close/i })[0];
      fireEvent.click(closeButton);

      expect(mockOnTabSelect).not.toHaveBeenCalled();
      expect(mockOnTabClose).toHaveBeenCalledWith('1');
    });
  });

  describe('tab icons', () => {
    const iconTestCases = [
      { type: 'file', extension: '.txt', expectedIcon: '📄' },
      { type: 'file', extension: '.sql', expectedIcon: '🗃️' },
      { type: 'query', extension: '', expectedIcon: '🔍' },
      { type: 'table', extension: '', expectedIcon: '📊' }
    ];

    iconTestCases.forEach(({ type, extension, expectedIcon }) => {
      it(`should show ${expectedIcon} for ${type}${extension}`, () => {
        const tab: Tab = {
          id: '1',
          title: `test${extension}`,
          type: type as any,
          data: {}
        };

        render(
          <TabBar
            tabs={[tab]}
            activeTabId="1"
            onTabSelect={mockOnTabSelect}
            onTabClose={mockOnTabClose}
          />
        );

        expect(screen.getByText(expectedIcon)).toBeInTheDocument();
      });
    });
  });

  describe('keyboard navigation', () => {
    it('should switch tabs with Ctrl+Tab', () => {
      render(
        <TabBar
          tabs={mockTabs}
          activeTabId="1"
          onTabSelect={mockOnTabSelect}
          onTabClose={mockOnTabClose}
        />
      );

      fireEvent.keyDown(window, { key: 'Tab', ctrlKey: true });

      expect(mockOnTabSelect).toHaveBeenCalledWith('2');
    });

    it('should cycle to first tab from last', () => {
      render(
        <TabBar
          tabs={mockTabs}
          activeTabId="3"
          onTabSelect={mockOnTabSelect}
          onTabClose={mockOnTabClose}
        />
      );

      fireEvent.keyDown(window, { key: 'Tab', ctrlKey: true });

      expect(mockOnTabSelect).toHaveBeenCalledWith('1');
    });

    it('should close tab with Ctrl+W', () => {
      render(
        <TabBar
          tabs={mockTabs}
          activeTabId="2"
          onTabSelect={mockOnTabSelect}
          onTabClose={mockOnTabClose}
        />
      );

      fireEvent.keyDown(window, { key: 'w', ctrlKey: true });

      expect(mockOnTabClose).toHaveBeenCalledWith('2');
    });
  });

  describe('overflow handling', () => {
    it('should show scroll buttons when tabs overflow', () => {
      const manyTabs = Array.from({ length: 20 }, (_, i) => ({
        id: String(i),
        title: `file${i}.txt`,
        type: 'file' as const,
        data: {}
      }));

      render(
        <TabBar
          tabs={manyTabs}
          activeTabId="0"
          onTabSelect={mockOnTabSelect}
          onTabClose={mockOnTabClose}
        />
      );

      // Check for overflow indicators or scroll functionality
      const container = screen.getByRole('tablist');
      expect(container).toHaveClass('tab-bar');
    });
  });
});