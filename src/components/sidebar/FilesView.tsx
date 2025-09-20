import { useState } from 'react';
import { useApp } from '../../state/AppContext';
import FileTree from '../FileTree';

function FilesView() {
  const { state } = useApp();
  const [filter, setFilter] = useState('');

  if (!state.zip) {
    return (
      <div className="empty-state">
        <p>No zip file loaded</p>
        <p style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '8px' }}>
          Drag and drop a debug.zip file to get started
        </p>
      </div>
    );
  }

  return (
    <div className="files-view">
      <div className="filter-section">
        <input
          type="text"
          className="filter-input"
          placeholder="Filter files..."
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
        />
      </div>
      <FileTree entries={state.zip.entries} filter={filter} />
    </div>
  );
}

export default FilesView;