import { useState, useCallback, useRef, useEffect } from 'react';
import './styles/global.css';
import './styles/App.css';
import './styles/crdb.css';
import './styles/error-viewer.css';
import './styles/navigation.css';
import IconRail from './components/IconRail';
import Sidebar from './components/Sidebar';
import MainPanel from './components/MainPanel';
import { AppProvider, useApp } from './state/AppContext';
import { NavigationProvider } from './components/NavigationProvider';
import { useKeyboardShortcuts } from './hooks/useKeyboardShortcuts';
import { useKeyboardNavigation } from './hooks/useKeyboardNavigation';

type ActiveView = 'files' | 'tables' | 'search';

function AppContent() {
  const [activeView, setActiveView] = useState<ActiveView>('tables');
  const [sidebarVisible, setSidebarVisible] = useState(true);
  const [sidebarWidth, setSidebarWidth] = useState(360);
  const [isDragging, setIsDragging] = useState(false);
  const { state, dispatch } = useApp();
  const navigation = useKeyboardNavigation();
  const dragRef = useRef<{ startX: number; startWidth: number } | null>(null);

  const handleViewChange = (view: ActiveView) => {
    if (view === activeView && sidebarVisible) {
      // If clicking the current view, toggle sidebar
      setSidebarVisible(false);
    } else {
      // Otherwise, show sidebar and change view
      setSidebarVisible(true);
      setActiveView(view);
    }
  };

  // Global keyboard shortcuts
  const toggleSidebar = useCallback(() => {
    setSidebarVisible(prev => !prev);
  }, []);

  const focusFilterInput = useCallback(() => {
    const filterInput = document.querySelector('.filter-input') as HTMLInputElement;
    if (filterInput) {
      filterInput.focus();
      filterInput.select();
      navigation.setFilterFocus();
      navigation.clearNavigation();
    }
  }, [navigation]);

  const handleArrowDown = useCallback(() => {
    const activeElement = document.activeElement as HTMLElement;
    if (activeElement && (activeElement.classList.contains('filter-input') || activeElement.classList.contains('search-input'))) {
      // Focus is in filter input, move to first result
      navigation.setNavigating(true);
      navigation.highlightIndex(0);
      activeElement.blur();
    } else if (navigation.state.isNavigating) {
      // Already navigating, move to next item
      navigation.highlightNext();
    }
  }, [navigation]);

  const handleArrowUp = useCallback(() => {
    if (navigation.state.isNavigating) {
      if (navigation.state.highlightedIndex === 0) {
        // At first item, return to filter
        navigation.clearNavigation();
        focusFilterInput();
      } else {
        navigation.highlightPrev();
      }
    }
  }, [navigation, focusFilterInput]);

  const handleEnterOrRight = useCallback(() => {
    if (navigation.state.isNavigating) {
      const highlightedItem = navigation.getHighlightedItem();
      if (highlightedItem) {
        // Trigger click on highlighted item
        if (highlightedItem.element) {
          highlightedItem.element.click();
        }
      }
    }
  }, [navigation]);

  const handleTabSwitch = useCallback((tabNumber: number) => {
    if (tabNumber >= 1 && tabNumber <= 9) {
      const tabIndex = tabNumber - 1;
      if (state.openTabs[tabIndex]) {
        dispatch({ type: 'SET_ACTIVE_TAB', id: state.openTabs[tabIndex].id });
      }
    }
  }, [state.openTabs, dispatch]);

  // Sidebar resize functionality
  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    setIsDragging(true);
    dragRef.current = {
      startX: e.clientX,
      startWidth: sidebarWidth
    };
  }, [sidebarWidth]);

  const handleMouseMove = useCallback((e: MouseEvent) => {
    if (!isDragging || !dragRef.current) return;

    const deltaX = e.clientX - dragRef.current.startX;
    const newWidth = Math.max(200, Math.min(600, dragRef.current.startWidth + deltaX));
    setSidebarWidth(newWidth);
  }, [isDragging]);

  const handleMouseUp = useCallback(() => {
    setIsDragging(false);
    dragRef.current = null;
  }, []);

  // Add global mouse event listeners for dragging
  useEffect(() => {
    if (isDragging) {
      document.addEventListener('mousemove', handleMouseMove);
      document.addEventListener('mouseup', handleMouseUp);
      document.body.style.cursor = 'col-resize';
      document.body.style.userSelect = 'none';
    } else {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    }

    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    };
  }, [isDragging, handleMouseMove, handleMouseUp]);

  useKeyboardShortcuts([
    { key: '/', handler: focusFilterInput },
    { key: 'b', cmd: true, handler: toggleSidebar },
    { key: 'ArrowDown', handler: handleArrowDown },
    { key: 'ArrowUp', handler: handleArrowUp },
    { key: 'Enter', handler: handleEnterOrRight },
    { key: 'ArrowRight', handler: handleEnterOrRight },
    // Tab switching with cmd-number
    { key: '1', cmd: true, handler: () => handleTabSwitch(1) },
    { key: '2', cmd: true, handler: () => handleTabSwitch(2) },
    { key: '3', cmd: true, handler: () => handleTabSwitch(3) },
    { key: '4', cmd: true, handler: () => handleTabSwitch(4) },
    { key: '5', cmd: true, handler: () => handleTabSwitch(5) },
    { key: '6', cmd: true, handler: () => handleTabSwitch(6) },
    { key: '7', cmd: true, handler: () => handleTabSwitch(7) },
    { key: '8', cmd: true, handler: () => handleTabSwitch(8) },
    { key: '9', cmd: true, handler: () => handleTabSwitch(9) },
  ]);

  return (
    <div className={`app-container ${!sidebarVisible ? 'sidebar-collapsed' : ''}`}>
      <IconRail activeView={activeView} onViewChange={handleViewChange} />
      <Sidebar
        activeView={activeView}
        isVisible={sidebarVisible}
        width={sidebarWidth}
      />
      {sidebarVisible && (
        <div
          className="sidebar-resize-handle"
          onMouseDown={handleMouseDown}
        />
      )}
      <MainPanel />
    </div>
  );
}

function App() {
  return (
    <AppProvider>
      <NavigationProvider>
        <AppContent />
      </NavigationProvider>
    </AppProvider>
  );
}

export default App
