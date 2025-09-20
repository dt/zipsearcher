import { useApp } from '../state/AppContext';
import TabBar from './TabBar';
import FileViewer from './FileViewer';
import SqlEditor from './SqlEditor';
import ErrorViewer from './ErrorViewer';
import DropZone from './DropZone';
import { useKeyboardShortcuts } from '../hooks/useKeyboardShortcuts';
import { useCallback } from 'react';

function MainPanel() {
  const { state, dispatch } = useApp();

  // Keyboard shortcuts for tab navigation
  const closeCurrentTab = useCallback(() => {
    if (state.activeTabId) {
      dispatch({ type: 'CLOSE_TAB', id: state.activeTabId });
    }
  }, [state.activeTabId, dispatch]);

  const nextTab = useCallback(() => {
    if (state.openTabs.length > 1) {
      const currentIndex = state.openTabs.findIndex(t => t.id === state.activeTabId);
      const nextIndex = (currentIndex + 1) % state.openTabs.length;
      dispatch({ type: 'SET_ACTIVE_TAB', id: state.openTabs[nextIndex].id });
    }
  }, [state.openTabs, state.activeTabId, dispatch]);

  const prevTab = useCallback(() => {
    if (state.openTabs.length > 1) {
      const currentIndex = state.openTabs.findIndex(t => t.id === state.activeTabId);
      const prevIndex = currentIndex === 0 ? state.openTabs.length - 1 : currentIndex - 1;
      dispatch({ type: 'SET_ACTIVE_TAB', id: state.openTabs[prevIndex].id });
    }
  }, [state.openTabs, state.activeTabId, dispatch]);

  const focusQueryEditor = useCallback(() => {
    const activeTab = state.openTabs.find(t => t.id === state.activeTabId);
    if (activeTab?.kind === 'sql') {
      // Focus Monaco editor
      const monacoEditor = document.querySelector('.monaco-editor textarea') as HTMLTextAreaElement;
      if (monacoEditor) {
        monacoEditor.focus();
      }
    }
  }, [state.openTabs, state.activeTabId]);

  const runQuery = useCallback(() => {
    const activeTab = state.openTabs.find(t => t.id === state.activeTabId);
    if (activeTab?.kind === 'sql') {
      // Trigger run button click
      const runButton = document.querySelector('.run-button') as HTMLButtonElement;
      if (runButton) {
        runButton.click();
      }
    }
  }, [state.openTabs, state.activeTabId]);

  useKeyboardShortcuts([
    { key: 'w', cmd: true, handler: closeCurrentTab },
    { key: 'Tab', ctrl: true, handler: nextTab },
    { key: 'Tab', ctrl: true, shift: true, handler: prevTab },
    { key: 'e', cmd: true, handler: focusQueryEditor },
    { key: 'Enter', cmd: true, handler: runQuery },
  ]);

  if (!state.zip || state.tablesLoading) {
    return (
      <div className="main-panel">
        <div className="content-area">
          <DropZone />
        </div>
      </div>
    );
  }

  return (
    <div className="main-panel">
      {state.openTabs.length > 0 && <TabBar />}
      <div className="content-area">
        {state.openTabs.length === 0 ? (
          <div className="empty-tab-state">
            <p>Select a file or table to view</p>
          </div>
        ) : (
          // Render ALL tabs but only show the active one
          state.openTabs.map(tab => {
            const isActive = tab.id === state.activeTabId;
            return (
              <div
                key={tab.id}
                style={{
                  display: isActive ? 'flex' : 'none',
                  height: '100%',
                  flexDirection: 'column',
                  overflow: 'hidden'
                }}
              >
                {tab.kind === 'file' && <FileViewer tab={tab} />}
                {tab.kind === 'sql' && <SqlEditor tab={tab} />}
                {tab.kind === 'error' && (
                  <ErrorViewer
                    error={tab.error}
                    sourceFile={tab.sourceFile}
                    tableName={tab.tableName}
                  />
                )}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}

export default MainPanel;