import { createContext, useContext, useReducer, useCallback, useEffect } from 'react';

export interface NavigationItem {
  id: string;
  type: 'file' | 'table' | 'query' | 'folder';
  element?: HTMLElement;
  data?: any;
}

interface NavigationState {
  items: NavigationItem[];
  highlightedIndex: number;
  isNavigating: boolean;
  lastFilterFocus: number;
}

type NavigationAction =
  | { type: 'SET_ITEMS'; items: NavigationItem[] }
  | { type: 'HIGHLIGHT_INDEX'; index: number }
  | { type: 'HIGHLIGHT_NEXT' }
  | { type: 'HIGHLIGHT_PREV' }
  | { type: 'SET_NAVIGATING'; isNavigating: boolean }
  | { type: 'SET_FILTER_FOCUS'; timestamp: number }
  | { type: 'CLEAR_NAVIGATION' };

const initialState: NavigationState = {
  items: [],
  highlightedIndex: -1,
  isNavigating: false,
  lastFilterFocus: 0,
};

function navigationReducer(state: NavigationState, action: NavigationAction): NavigationState {
  switch (action.type) {
    case 'SET_ITEMS':
      return {
        ...state,
        items: action.items,
        highlightedIndex: action.items.length > 0 ? 0 : -1,
      };
    case 'HIGHLIGHT_INDEX':
      return {
        ...state,
        highlightedIndex: Math.max(-1, Math.min(action.index, state.items.length - 1)),
      };
    case 'HIGHLIGHT_NEXT':
      return {
        ...state,
        highlightedIndex: Math.min(state.highlightedIndex + 1, state.items.length - 1),
      };
    case 'HIGHLIGHT_PREV':
      return {
        ...state,
        highlightedIndex: Math.max(0, state.highlightedIndex - 1),
      };
    case 'SET_NAVIGATING':
      return {
        ...state,
        isNavigating: action.isNavigating,
      };
    case 'SET_FILTER_FOCUS':
      return {
        ...state,
        lastFilterFocus: action.timestamp,
      };
    case 'CLEAR_NAVIGATION':
      return {
        ...state,
        highlightedIndex: -1,
        isNavigating: false,
      };
    default:
      return state;
  }
}

export const NavigationContext = createContext<{
  state: NavigationState;
  setItems: (items: NavigationItem[]) => void;
  highlightIndex: (index: number) => void;
  highlightNext: () => void;
  highlightPrev: () => void;
  setNavigating: (isNavigating: boolean) => void;
  setFilterFocus: () => void;
  clearNavigation: () => void;
  getHighlightedItem: () => NavigationItem | null;
} | null>(null);

export function useKeyboardNavigation() {
  const context = useContext(NavigationContext);
  if (!context) {
    throw new Error('useKeyboardNavigation must be used within NavigationProvider');
  }
  return context;
}

export function useNavigationProvider() {
  const [state, dispatch] = useReducer(navigationReducer, initialState);

  const setItems = useCallback((items: NavigationItem[]) => {
    dispatch({ type: 'SET_ITEMS', items });
  }, []);

  const highlightIndex = useCallback((index: number) => {
    dispatch({ type: 'HIGHLIGHT_INDEX', index });
  }, []);

  const highlightNext = useCallback(() => {
    dispatch({ type: 'HIGHLIGHT_NEXT' });
  }, []);

  const highlightPrev = useCallback(() => {
    dispatch({ type: 'HIGHLIGHT_PREV' });
  }, []);

  const setNavigating = useCallback((isNavigating: boolean) => {
    dispatch({ type: 'SET_NAVIGATING', isNavigating });
  }, []);

  const setFilterFocus = useCallback(() => {
    dispatch({ type: 'SET_FILTER_FOCUS', timestamp: Date.now() });
  }, []);

  const clearNavigation = useCallback(() => {
    dispatch({ type: 'CLEAR_NAVIGATION' });
  }, []);

  const getHighlightedItem = () => {
    if (state.highlightedIndex >= 0 && state.highlightedIndex < state.items.length) {
      return state.items[state.highlightedIndex];
    }
    return null;
  };

  // Auto-scroll highlighted item into view
  useEffect(() => {
    if (state.highlightedIndex >= 0 && state.items[state.highlightedIndex]?.element) {
      const element = state.items[state.highlightedIndex].element;
      element?.scrollIntoView({
        behavior: 'smooth',
        block: 'nearest',
        inline: 'nearest'
      });
    }
  }, [state.highlightedIndex]);

  return {
    state,
    setItems,
    highlightIndex,
    highlightNext,
    highlightPrev,
    setNavigating,
    setFilterFocus,
    clearNavigation,
    getHighlightedItem,
  };
}