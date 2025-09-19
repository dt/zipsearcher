import { useEffect, useRef } from 'react';

export interface KeyboardShortcut {
  key: string;
  ctrl?: boolean;
  cmd?: boolean;
  shift?: boolean;
  alt?: boolean;
  handler: (e: KeyboardEvent) => void;
  description?: string;
}

export function useKeyboardShortcuts(shortcuts: KeyboardShortcut[]) {
  const shortcutsRef = useRef(shortcuts);
  shortcutsRef.current = shortcuts;

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Skip if user is typing in an input/textarea (unless it's a global shortcut)
      const target = e.target as HTMLElement;
      const isTyping = target.tagName === 'INPUT' ||
                      target.tagName === 'TEXTAREA' ||
                      target.contentEditable === 'true';

      for (const shortcut of shortcutsRef.current) {
        const matchesKey = e.key === shortcut.key ||
                          e.key.toLowerCase() === shortcut.key.toLowerCase();

        const matchesCtrl = shortcut.ctrl ? (e.ctrlKey || e.metaKey) : true;
        const matchesCmd = shortcut.cmd ? e.metaKey : true;
        const matchesShift = shortcut.shift ? e.shiftKey : !e.shiftKey;
        const matchesAlt = shortcut.alt ? e.altKey : !e.altKey;

        // Special handling for "/" shortcut - allow even when typing
        const isSlashShortcut = shortcut.key === '/' && !shortcut.ctrl && !shortcut.cmd;

        if (matchesKey && matchesCtrl && matchesCmd && matchesShift && matchesAlt) {
          // For "/" shortcut, only trigger if not already in a search/filter input
          if (isSlashShortcut) {
            if (isTyping && (target.classList.contains('filter-input') ||
                            target.classList.contains('search-input'))) {
              // We're already in a filter/search input, let the '/' character be typed normally
              continue;
            }
          } else if (isTyping && !shortcut.ctrl && !shortcut.cmd) {
            // Skip other shortcuts when typing (unless they have modifiers)
            continue;
          }

          e.preventDefault();
          e.stopPropagation();
          shortcut.handler(e);
          break;
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);
}

// Common keyboard shortcuts
export const SHORTCUTS = {
  FOCUS_FILTER: { key: '/', description: 'Focus filter' },
  FOCUS_SEARCH: { key: 'f', cmd: true, description: 'Focus search' },
  FOCUS_QUERY: { key: 'e', cmd: true, description: 'Focus query editor' },
  TOGGLE_SIDEBAR: { key: 'b', cmd: true, description: 'Toggle sidebar' },
  CLOSE_TAB: { key: 'w', cmd: true, description: 'Close current tab' },
  NEXT_TAB: { key: 'Tab', ctrl: true, description: 'Next tab' },
  PREV_TAB: { key: 'Tab', ctrl: true, shift: true, description: 'Previous tab' },
  RUN_QUERY: { key: 'Enter', cmd: true, description: 'Run query' },
};