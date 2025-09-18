
interface IconRailProps {
  activeView: 'files' | 'tables' | 'search';
  onViewChange: (view: 'files' | 'tables' | 'search') => void;
}

function IconRail({ activeView, onViewChange }: IconRailProps) {
  return (
    <div className="icon-rail">
      <button
        className={`icon-rail-item ${activeView === 'tables' ? 'active' : ''}`}
        onClick={() => onViewChange('tables')}
        title="Tables"
      >
        <svg width="20" height="20" viewBox="0 0 20 20" fill="currentColor">
          <path d="M3 3h14v14H3V3zm1 1v3h5V4H4zm6 0v3h6V4h-6zm6 4h-6v3h6V8zm0 4h-6v3h6v-3zm-7 3v-3H4v3h5zm-5-4h5V8H4v3z"/>
        </svg>
      </button>
      <button
        className={`icon-rail-item ${activeView === 'files' ? 'active' : ''}`}
        onClick={() => onViewChange('files')}
        title="Files"
      >
        📁
      </button>
      <button
        className={`icon-rail-item ${activeView === 'search' ? 'active' : ''}`}
        onClick={() => onViewChange('search')}
        title="Search"
      >
        🔍
      </button>
    </div>
  );
}

export default IconRail;