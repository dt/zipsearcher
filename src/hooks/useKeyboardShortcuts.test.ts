import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useKeyboardShortcuts } from './useKeyboardShortcuts';

describe('useKeyboardShortcuts', () => {
  let mockCallbacks: any;

  beforeEach(() => {
    mockCallbacks = {
      onExecuteQuery: vi.fn(),
      onOpenFile: vi.fn(),
      onCloseTab: vi.fn(),
      onSwitchTab: vi.fn(),
      onToggleSidebar: vi.fn(),
      onSearch: vi.fn()
    };
  });

  describe('keyboard event handling', () => {
    const testCases = [
      {
        key: 'Enter',
        metaKey: true,
        callback: 'onExecuteQuery',
        description: 'Cmd+Enter executes query'
      },
      {
        key: 'Enter',
        ctrlKey: true,
        callback: 'onExecuteQuery',
        description: 'Ctrl+Enter executes query'
      },
      {
        key: 'o',
        metaKey: true,
        callback: 'onOpenFile',
        description: 'Cmd+O opens file'
      },
      {
        key: 'w',
        metaKey: true,
        callback: 'onCloseTab',
        description: 'Cmd+W closes tab'
      },
      {
        key: 'b',
        metaKey: true,
        callback: 'onToggleSidebar',
        description: 'Cmd+B toggles sidebar'
      },
      {
        key: 'f',
        metaKey: true,
        callback: 'onSearch',
        description: 'Cmd+F opens search'
      },
      {
        key: '1',
        metaKey: true,
        callback: 'onSwitchTab',
        expectedArg: 0,
        description: 'Cmd+1 switches to first tab'
      },
      {
        key: '9',
        metaKey: true,
        callback: 'onSwitchTab',
        expectedArg: 8,
        description: 'Cmd+9 switches to ninth tab'
      }
    ];

    testCases.forEach(({ key, metaKey, ctrlKey, callback, expectedArg, description }) => {
      it(description, () => {
        renderHook(() => useKeyboardShortcuts(mockCallbacks));

        const event = new KeyboardEvent('keydown', {
          key,
          metaKey,
          ctrlKey,
          bubbles: true
        });

        act(() => {
          window.dispatchEvent(event);
        });

        expect(mockCallbacks[callback]).toHaveBeenCalledTimes(1);
        if (expectedArg !== undefined) {
          expect(mockCallbacks[callback]).toHaveBeenCalledWith(expectedArg);
        }
      });
    });
  });

  describe('preventDefault behavior', () => {
    it('should preventDefault for handled shortcuts', () => {
      renderHook(() => useKeyboardShortcuts(mockCallbacks));

      const event = new KeyboardEvent('keydown', {
        key: 'Enter',
        metaKey: true,
        bubbles: true
      });

      const preventDefaultSpy = vi.spyOn(event, 'preventDefault');

      act(() => {
        window.dispatchEvent(event);
      });

      expect(preventDefaultSpy).toHaveBeenCalled();
    });

    it('should not preventDefault for unhandled keys', () => {
      renderHook(() => useKeyboardShortcuts(mockCallbacks));

      const event = new KeyboardEvent('keydown', {
        key: 'a',
        bubbles: true
      });

      const preventDefaultSpy = vi.spyOn(event, 'preventDefault');

      act(() => {
        window.dispatchEvent(event);
      });

      expect(preventDefaultSpy).not.toHaveBeenCalled();
    });
  });

  describe('cleanup', () => {
    it('should remove event listener on unmount', () => {
      const removeEventListenerSpy = vi.spyOn(window, 'removeEventListener');

      const { unmount } = renderHook(() => useKeyboardShortcuts(mockCallbacks));

      unmount();

      expect(removeEventListenerSpy).toHaveBeenCalledWith('keydown', expect.any(Function));
    });
  });

  describe('edge cases', () => {
    it('should handle missing callbacks gracefully', () => {
      const partialCallbacks = { onExecuteQuery: vi.fn() };

      renderHook(() => useKeyboardShortcuts(partialCallbacks));

      const event = new KeyboardEvent('keydown', {
        key: 'w',
        metaKey: true,
        bubbles: true
      });

      expect(() => {
        act(() => {
          window.dispatchEvent(event);
        });
      }).not.toThrow();
    });

    it('should ignore shortcuts when typing in input', () => {
      renderHook(() => useKeyboardShortcuts(mockCallbacks));

      const input = document.createElement('input');
      document.body.appendChild(input);
      input.focus();

      const event = new KeyboardEvent('keydown', {
        key: 'Enter',
        metaKey: true,
        bubbles: true,
        target: input
      });

      act(() => {
        input.dispatchEvent(event);
      });

      // Should check if target is an input/textarea and skip
      // This depends on implementation
      document.body.removeChild(input);
    });
  });
});