import { useMemo, useState, useRef, useCallback, useEffect } from 'react';
import { useApp } from '../state/AppContext';
import type { ZipEntryMeta } from '../state/types';
import { matchesFilter } from '../utils/filterUtils';
import { useKeyboardNavigation } from '../hooks/useKeyboardNavigation';
import type { NavigationItem } from '../hooks/useKeyboardNavigation';

interface FileTreeProps {
  entries: ZipEntryMeta[];
  filter: string;
}

interface TreeNode {
  name: string;
  path: string;
  entry?: ZipEntryMeta;
  children: Map<string, TreeNode>;
}

function FileTree({ entries, filter }: FileTreeProps) {
  const { dispatch } = useApp();
  const navigation = useKeyboardNavigation();
  const [expandedPaths, setExpandedPaths] = useState<Set<string>>(new Set());
  const elementRefs = useRef<Map<string, HTMLElement>>(new Map());

  // Register element with refs
  const registerElement = useCallback((id: string, element: HTMLElement | null) => {
    if (element) {
      elementRefs.current.set(id, element);
    } else {
      elementRefs.current.delete(id);
    }
  }, []);

  const tree = useMemo(() => {
    const root: TreeNode = {
      name: '',
      path: '',
      children: new Map(),
    };

    // Filter entries with boolean logic
    const filteredEntries = filter
      ? entries.filter(e => matchesFilter(e.path, filter))
      : entries;

    // Find common prefix to strip (like "debug/")
    let commonPrefix = '';
    if (filteredEntries.length > 0) {
      // Check if all paths start with the same folder
      const firstPath = filteredEntries[0].path;
      const firstFolder = firstPath.split('/')[0];

      if (firstFolder && filteredEntries.every(e => e.path.startsWith(firstFolder + '/'))) {
        commonPrefix = firstFolder + '/';
      }
    }

    // Build tree structure
    filteredEntries.forEach(entry => {
      // Strip common prefix if present
      const adjustedPath = commonPrefix ? entry.path.slice(commonPrefix.length) : entry.path;
      const parts = adjustedPath.split('/').filter(Boolean);

      let current = root;

      parts.forEach((part, index) => {
        if (!current.children.has(part)) {
          const path = parts.slice(0, index + 1).join('/');
          current.children.set(part, {
            name: part,
            path,
            children: new Map(),
          });
        }
        current = current.children.get(part)!;
      });

      // Attach entry to leaf node
      if (!entry.isDir) {
        current.entry = entry;
      }
    });

    return root;
  }, [entries, filter]);

  // Auto-expand paths when filtering
  useMemo(() => {
    if (filter) {
      const pathsToExpand = new Set<string>();

      // Find common prefix (same logic as tree building)
      let commonPrefix = '';
      const filteredEntries = entries.filter(e => matchesFilter(e.path, filter));

      if (filteredEntries.length > 0) {
        const firstPath = filteredEntries[0].path;
        const firstFolder = firstPath.split('/')[0];
        if (firstFolder && filteredEntries.every(e => e.path.startsWith(firstFolder + '/'))) {
          commonPrefix = firstFolder + '/';
        }
      }

      filteredEntries.forEach(entry => {
        // Strip common prefix if present (same as tree building)
        const adjustedPath = commonPrefix ? entry.path.slice(commonPrefix.length) : entry.path;
        const parts = adjustedPath.split('/').filter(Boolean);

        // Expand all parent folders of matching items
        for (let i = 1; i <= parts.length; i++) {
          pathsToExpand.add(parts.slice(0, i).join('/'));
        }
      });
      setExpandedPaths(pathsToExpand);
    }
  }, [filter, entries]);

  // Collect all visible files for navigation
  const collectVisibleFiles = useCallback((node: TreeNode, items: NavigationItem[] = []): NavigationItem[] => {
    if (node.name === '') {
      // Root node - process children
      Array.from(node.children.values()).forEach(child => {
        collectVisibleFiles(child, items);
      });
    } else {
      const isFile = !!node.entry;
      const hasChildren = node.children.size > 0;
      const isExpanded = expandedPaths.has(node.path);

      if (isFile && node.entry) {
        // Add file to navigation items
        const element = elementRefs.current.get(`file-${node.entry.id}`);
        if (element) {
          items.push({
            id: `file-${node.entry.id}`,
            type: 'file',
            element,
            data: node.entry
          });
        }
      }

      // If expanded, process children
      if (hasChildren && isExpanded) {
        Array.from(node.children.values()).forEach(child => {
          collectVisibleFiles(child, items);
        });
      }
    }
    return items;
  }, [expandedPaths]);

  // Update navigation items when tree structure or expansion changes
  // useEffect(() => {
  //   const items = collectVisibleFiles(tree);
  //   navigation.setItems(items);
  // }, [navigation.setItems, tree, expandedPaths, collectVisibleFiles]);

  const handleFileClick = (entry: ZipEntryMeta) => {
    dispatch({
      type: 'OPEN_NEW_FILE_TAB',
      fileId: entry.id,
      fileName: entry.name,
    });
  };

  const toggleFolder = (path: string) => {
    setExpandedPaths(prev => {
      const next = new Set(prev);
      if (next.has(path)) {
        next.delete(path);
      } else {
        next.add(path);
      }
      return next;
    });
  };

  const renderNode = (node: TreeNode, level: number = 0) => {
    const isFile = !!node.entry;
    const hasChildren = node.children.size > 0;
    const isExpanded = expandedPaths.has(node.path);

    if (node.name === '') {
      // Root node - just render children
      return Array.from(node.children.values())
        .sort((a, b) => {
          // Folders first, then files
          const aIsFolder = a.children.size > 0;
          const bIsFolder = b.children.size > 0;
          if (aIsFolder && !bIsFolder) return -1;
          if (!aIsFolder && bIsFolder) return 1;
          // Then alphabetically with natural number sorting
          return a.name.localeCompare(b.name, undefined, { numeric: true });
        })
        .map(child =>
          <div key={child.path}>{renderNode(child, level)}</div>
        );
    }

    const isHighlighted = isFile && node.entry && navigation.state.isNavigating &&
      navigation.state.items[navigation.state.highlightedIndex]?.id === `file-${node.entry.id}`;

    return (
      <div className="tree-node" key={node.path}>
        <div
          ref={isFile && node.entry ? (el) => registerElement(`file-${node.entry.id}`, el) : undefined}
          className={`tree-item ${isFile ? 'file' : 'folder'} ${isExpanded ? 'expanded' : ''} ${isHighlighted ? 'keyboard-highlighted' : ''}`}
          style={{ paddingLeft: `${level * 12 + 4}px` }}
          onClick={() => {
            if (isFile && node.entry) {
              handleFileClick(node.entry);
            } else if (hasChildren) {
              toggleFolder(node.path);
            }
          }}
        >
          {!isFile && hasChildren && (
            <span className="tree-chevron">
              {isExpanded ? '▼' : '▶'}
            </span>
          )}
          <span className="tree-label" title={node.path || node.name}>{node.name}</span>
          {isFile && node.entry && (
            <span className="tree-size">
              {formatFileSize(node.entry.size)}
            </span>
          )}
        </div>
        {hasChildren && isExpanded && (
          <div className="tree-children">
            {Array.from(node.children.values())
              .sort((a, b) => {
                // Folders first, then files
                const aIsFolder = a.children.size > 0;
                const bIsFolder = b.children.size > 0;
                if (aIsFolder && !bIsFolder) return -1;
                if (!aIsFolder && bIsFolder) return 1;
                // Then alphabetically
                return a.name.localeCompare(b.name, undefined, { numeric: true });
              })
              .map(child => renderNode(child, level + 1))
            }
          </div>
        )}
      </div>
    );
  };

  return <div className="file-tree">{renderNode(tree)}</div>;
}

function formatFileSize(bytes: number): string {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${(bytes / Math.pow(k, i)).toFixed(1)} ${sizes[i]}`;
}


export default FileTree;