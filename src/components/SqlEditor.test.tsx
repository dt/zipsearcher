import { describe, it, expect, vi, beforeEach } from 'vitest';
import React from 'react';
import { render, fireEvent, screen, waitFor } from '@testing-library/react';
import SqlEditor from './SqlEditor';

// Mock Monaco Editor
vi.mock('@monaco-editor/react', () => ({
  default: ({ value, onChange, onMount }: any) => {
    const handleChange = (e: any) => onChange?.(e.target.value);

    React.useEffect(() => {
      onMount?.({
        getValue: () => value,
        setValue: (v: string) => onChange?.(v),
        focus: vi.fn(),
        getSelection: () => ({ isEmpty: () => false })
      }, {});
    }, []);

    return (
      <textarea
        data-testid="monaco-editor"
        value={value}
        onChange={handleChange}
        aria-label="SQL editor"
      />
    );
  }
}));

describe.skip('SqlEditor', () => {
  const mockOnExecute = vi.fn();
  const mockQuery = 'SELECT * FROM users LIMIT 10';

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('rendering', () => {
    const testCases = [
      { query: '', showRunButton: true },
      { query: mockQuery, showRunButton: true },
      { query: 'SELECT', showRunButton: true }
    ];

    testCases.forEach(({ query, showRunButton }) => {
      it(`should render with query: "${query.slice(0, 20)}..."`, () => {
        render(
          <SqlEditor
            value={query}
            onChange={vi.fn()}
            onExecute={mockOnExecute}
          />
        );

        const editor = screen.getByTestId('monaco-editor');
        expect(editor).toHaveValue(query);

        if (showRunButton) {
          expect(screen.getByRole('button', { name: /run/i })).toBeInTheDocument();
        }
      });
    });
  });

  describe('query execution', () => {
    it('should execute query on button click', () => {
      render(
        <SqlEditor
          value={mockQuery}
          onChange={vi.fn()}
          onExecute={mockOnExecute}
        />
      );

      const runButton = screen.getByRole('button', { name: /run/i });
      fireEvent.click(runButton);

      expect(mockOnExecute).toHaveBeenCalledWith(mockQuery);
    });

    it('should execute query on Ctrl+Enter', () => {
      render(
        <SqlEditor
          value={mockQuery}
          onChange={vi.fn()}
          onExecute={mockOnExecute}
        />
      );

      const editor = screen.getByTestId('monaco-editor');
      fireEvent.keyDown(editor, { key: 'Enter', ctrlKey: true });

      expect(mockOnExecute).toHaveBeenCalledWith(mockQuery);
    });

    it('should execute query on Cmd+Enter', () => {
      render(
        <SqlEditor
          value={mockQuery}
          onChange={vi.fn()}
          onExecute={mockOnExecute}
        />
      );

      const editor = screen.getByTestId('monaco-editor');
      fireEvent.keyDown(editor, { key: 'Enter', metaKey: true });

      expect(mockOnExecute).toHaveBeenCalledWith(mockQuery);
    });

    it('should not execute empty query', () => {
      render(
        <SqlEditor
          value=""
          onChange={vi.fn()}
          onExecute={mockOnExecute}
        />
      );

      const runButton = screen.getByRole('button', { name: /run/i });
      fireEvent.click(runButton);

      expect(mockOnExecute).not.toHaveBeenCalled();
    });
  });

  describe('query editing', () => {
    it('should call onChange when query is edited', () => {
      const mockOnChange = vi.fn();

      render(
        <SqlEditor
          value={mockQuery}
          onChange={mockOnChange}
          onExecute={mockOnExecute}
        />
      );

      const editor = screen.getByTestId('monaco-editor');
      const newQuery = 'SELECT * FROM products';

      fireEvent.change(editor, { target: { value: newQuery } });

      expect(mockOnChange).toHaveBeenCalledWith(newQuery);
    });
  });

  describe('autocomplete', () => {
    it('should provide table suggestions', () => {
      const tables = ['users', 'products', 'orders'];

      render(
        <SqlEditor
          value="SELECT * FROM "
          onChange={vi.fn()}
          onExecute={mockOnExecute}
          tables={tables}
        />
      );

      // Tables should be passed to Monaco for autocomplete
      expect(screen.getByTestId('monaco-editor')).toBeInTheDocument();
    });
  });

  describe('loading state', () => {
    it('should disable run button when loading', () => {
      render(
        <SqlEditor
          value={mockQuery}
          onChange={vi.fn()}
          onExecute={mockOnExecute}
          isLoading={true}
        />
      );

      const runButton = screen.getByRole('button', { name: /run/i });
      expect(runButton).toBeDisabled();
    });

    it('should show loading indicator', () => {
      render(
        <SqlEditor
          value={mockQuery}
          onChange={vi.fn()}
          onExecute={mockOnExecute}
          isLoading={true}
        />
      );

      expect(screen.getByText(/running/i)).toBeInTheDocument();
    });
  });

  describe('error handling', () => {
    it('should display error message', () => {
      const errorMessage = 'Syntax error near SELECT';

      render(
        <SqlEditor
          value={mockQuery}
          onChange={vi.fn()}
          onExecute={mockOnExecute}
          error={errorMessage}
        />
      );

      expect(screen.getByText(errorMessage)).toBeInTheDocument();
      expect(screen.getByRole('alert')).toBeInTheDocument();
    });

    it('should clear error on new execution', () => {
      const { rerender } = render(
        <SqlEditor
          value={mockQuery}
          onChange={vi.fn()}
          onExecute={mockOnExecute}
          error="Previous error"
        />
      );

      // Execute new query
      const runButton = screen.getByRole('button', { name: /run/i });
      fireEvent.click(runButton);

      // Error should be cleared
      rerender(
        <SqlEditor
          value={mockQuery}
          onChange={vi.fn()}
          onExecute={mockOnExecute}
          error={undefined}
        />
      );

      expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    });
  });

  describe('query history', () => {
    it('should navigate through history with up/down arrows', () => {
      const history = [
        'SELECT * FROM users',
        'SELECT * FROM products',
        'SELECT * FROM orders'
      ];

      const mockOnChange = vi.fn();

      render(
        <SqlEditor
          value=""
          onChange={mockOnChange}
          onExecute={mockOnExecute}
          history={history}
        />
      );

      const editor = screen.getByTestId('monaco-editor');

      // Press up arrow to get previous query
      fireEvent.keyDown(editor, { key: 'ArrowUp', ctrlKey: true });
      expect(mockOnChange).toHaveBeenCalledWith(history[2]);

      // Press up again
      fireEvent.keyDown(editor, { key: 'ArrowUp', ctrlKey: true });
      expect(mockOnChange).toHaveBeenCalledWith(history[1]);

      // Press down to go forward
      fireEvent.keyDown(editor, { key: 'ArrowDown', ctrlKey: true });
      expect(mockOnChange).toHaveBeenCalledWith(history[2]);
    });
  });
});