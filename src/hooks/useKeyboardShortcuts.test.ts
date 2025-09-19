import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useKeyboardShortcuts, KeyboardShortcut } from './useKeyboardShortcuts';

describe('useKeyboardShortcuts', () => {
  let mockHandlers: any;

  beforeEach(() => {
    mockHandlers = {
      onExecuteQuery: vi.fn(),
      onOpenFile: vi.fn(),
      onCloseTab: vi.fn(),
      onSwitchTab: vi.fn(),
      onToggleSidebar: vi.fn(),
      onSearch: vi.fn()
    };
  });

  describe('keyboard event handling', () => {
    it('Cmd+Enter executes query', () => {
      const shortcuts: KeyboardShortcut[] = [
        { key: 'Enter', cmd: true, handler: mockHandlers.onExecuteQuery }
      ];

      renderHook(() => useKeyboardShortcuts(shortcuts));

      const event = new KeyboardEvent('keydown', {
        key: 'Enter',
        metaKey: true,
        bubbles: true
      });

      act(() => {
        window.dispatchEvent(event);
      });

      expect(mockHandlers.onExecuteQuery).toHaveBeenCalledTimes(1);
    });

    it('Ctrl+Enter executes query', () => {
      const shortcuts: KeyboardShortcut[] = [
        { key: 'Enter', ctrl: true, handler: mockHandlers.onExecuteQuery }
      ];

      renderHook(() => useKeyboardShortcuts(shortcuts));

      const event = new KeyboardEvent('keydown', {
        key: 'Enter',
        ctrlKey: true,
        bubbles: true
      });

      act(() => {
        window.dispatchEvent(event);
      });

      expect(mockHandlers.onExecuteQuery).toHaveBeenCalledTimes(1);
    });

    it('Cmd+O opens file', () => {
      const shortcuts: KeyboardShortcut[] = [
        { key: 'o', cmd: true, handler: mockHandlers.onOpenFile }
      ];

      renderHook(() => useKeyboardShortcuts(shortcuts));

      const event = new KeyboardEvent('keydown', {
        key: 'o',
        metaKey: true,
        bubbles: true
      });

      act(() => {
        window.dispatchEvent(event);
      });

      expect(mockHandlers.onOpenFile).toHaveBeenCalledTimes(1);
    });

    it('should not trigger for non-matching shortcuts', () => {
      const shortcuts: KeyboardShortcut[] = [
        { key: 'Enter', cmd: true, handler: mockHandlers.onExecuteQuery }
      ];

      renderHook(() => useKeyboardShortcuts(shortcuts));

      const event = new KeyboardEvent('keydown', {
        key: 'a',
        bubbles: true
      });

      act(() => {
        window.dispatchEvent(event);
      });

      expect(mockHandlers.onExecuteQuery).not.toHaveBeenCalled();
    });
  });

  describe('cleanup', () => {
    it('should remove event listener on unmount', () => {
      const removeEventListenerSpy = vi.spyOn(window, 'removeEventListener');

      const shortcuts: KeyboardShortcut[] = [
        { key: 'Enter', cmd: true, handler: mockHandlers.onExecuteQuery }
      ];

      const { unmount } = renderHook(() => useKeyboardShortcuts(shortcuts));

      unmount();

      expect(removeEventListenerSpy).toHaveBeenCalledWith('keydown', expect.any(Function));
    });
  });

  describe('edge cases', () => {
    it('should ignore shortcuts when typing in input (without modifiers)', () => {
      const shortcuts: KeyboardShortcut[] = [
        { key: 'a', handler: mockHandlers.onExecuteQuery }
      ];

      renderHook(() => useKeyboardShortcuts(shortcuts));

      const input = document.createElement('input');
      document.body.appendChild(input);
      input.focus();

      const event = new KeyboardEvent('keydown', {
        key: 'a',
        bubbles: true
      });

      // Set target manually since jsdom doesn't handle focus properly
      Object.defineProperty(event, 'target', {
        value: input,
        enumerable: true
      });

      act(() => {
        window.dispatchEvent(event);
      });

      // Should not execute because target is an input and no modifiers
      expect(mockHandlers.onExecuteQuery).not.toHaveBeenCalled();

      document.body.removeChild(input);
    });

    it('should allow shortcuts with modifiers when typing in input', () => {
      const shortcuts: KeyboardShortcut[] = [
        { key: 'Enter', cmd: true, handler: mockHandlers.onExecuteQuery }
      ];

      renderHook(() => useKeyboardShortcuts(shortcuts));

      const input = document.createElement('input');
      document.body.appendChild(input);
      input.focus();

      const event = new KeyboardEvent('keydown', {
        key: 'Enter',
        metaKey: true,
        bubbles: true
      });

      // Set target manually since jsdom doesn't handle focus properly
      Object.defineProperty(event, 'target', {
        value: input,
        enumerable: true
      });

      act(() => {
        window.dispatchEvent(event);
      });

      // Should execute because it has cmd modifier
      expect(mockHandlers.onExecuteQuery).toHaveBeenCalledTimes(1);

      document.body.removeChild(input);
    });

    it('should handle empty shortcuts array', () => {
      expect(() => {
        renderHook(() => useKeyboardShortcuts([]));
      }).not.toThrow();
    });
  });
});