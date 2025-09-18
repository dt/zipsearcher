import { useState } from 'react';

function SearchView() {
  const [query, setQuery] = useState('');
  const [results] = useState<any[]>([]);

  const handleSearch = () => {
    // TODO: Implement search functionality
    console.log('Searching for:', query);
  };

  return (
    <div className="search-view">
      <div className="search-form">
        <input
          type="text"
          className="search-input"
          placeholder="Search in files..."
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
        />
        <button className="btn search-btn" onClick={handleSearch}>
          Search
        </button>
      </div>

      {results.length > 0 ? (
        <div className="search-results">
          {/* TODO: Render search results */}
        </div>
      ) : (
        <div className="empty-state">
          <p style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
            Unsupported; TODO
          </p>
        </div>
      )}
    </div>
  );
}

export default SearchView;