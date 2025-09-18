import { useApp } from '../state/AppContext';

interface ErrorViewerProps {
  error: string;
  sourceFile: string;
  tableName: string;
}

function ErrorViewer({ error, sourceFile, tableName }: ErrorViewerProps) {
  const { dispatch } = useApp();

  const handleViewFile = () => {
    dispatch({
      type: 'OPEN_TAB',
      tab: {
        kind: 'file',
        id: sourceFile,
        fileId: sourceFile,
        title: sourceFile.split('/').pop() || sourceFile,
      },
    });
  };

  // Parse the error message to extract useful information
  const parseError = (errorMsg: string) => {
    // Look for line number in error
    const lineMatch = errorMsg.match(/Line:\s*(\d+)/i);
    const lineNumber = lineMatch ? lineMatch[1] : null;

    // Look for "Original Line" content if present
    const originalLineMatch = errorMsg.match(/Original Line[:\s]+(.+?)(?:\n|$)/i);
    const originalLine = originalLineMatch ? originalLineMatch[1] : null;

    return { lineNumber, originalLine, fullError: errorMsg };
  };

  const { lineNumber, originalLine, fullError } = parseError(error);

  return (
    <div className="error-viewer">
      <div className="error-header">
        <h2>Failed to Load Table: {tableName}</h2>
        <button className="btn btn-sm" onClick={handleViewFile}>
          📄 View Source File
        </button>
      </div>

      <div className="error-content">
        <div className="error-section">
          <h3>Error Details</h3>
          <div className="error-box">
            {lineNumber && (
              <div className="error-field">
                <span className="error-label">Line Number:</span>
                <span className="error-value">{lineNumber}</span>
              </div>
            )}
            {originalLine && (
              <div className="error-field">
                <span className="error-label">Problematic Line:</span>
                <pre className="error-line-content">{originalLine}</pre>
              </div>
            )}
          </div>
        </div>

        <div className="error-section">
          <h3>Full Error Message</h3>
          <pre className="error-message">{fullError}</pre>
        </div>

        <div className="error-section">
          <h3>Troubleshooting</h3>
          <div className="error-hints">
            <p>This error typically occurs when:</p>
            <ul>
              <li>The CSV/TSV file has inconsistent column counts</li>
              <li>There are unescaped quotes or special characters</li>
              <li>The delimiter is not correctly detected</li>
              <li>The file encoding is not UTF-8</li>
            </ul>
            <p className="hint-action">
              Click "View Source File" above to inspect the raw data and identify the issue.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

export default ErrorViewer;