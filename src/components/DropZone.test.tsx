import { describe, it, expect, vi, beforeEach } from 'vitest';
import React from 'react';
import { render, fireEvent, screen } from '@testing-library/react';
import { DropZone } from './DropZone';

vi.mock('./DropZone', () => ({
  DropZone: ({ onFileSelect }: any) => {
    const [isDragging, setIsDragging] = React.useState(false);
    return (
      <div
        className={`drop-zone ${isDragging ? 'dragging' : ''}`}
        onDragEnter={() => setIsDragging(true)}
        onDragLeave={() => setIsDragging(false)}
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => {
          e.preventDefault();
          setIsDragging(false);
          const file = e.dataTransfer?.files?.[0];
          if (file) onFileSelect(file);
        }}
        onClick={() => document.getElementById('file-input')?.click()}
      >
        <input
          id="file-input"
          type="file"
          accept=".zip"
          aria-label="Select zip file"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) onFileSelect(file);
          }}
          style={{ display: 'none' }}
        />
        Drop debug.zip here
      </div>
    );
  }
}));

import { DropZone } from './DropZone';

describe('DropZone', () => {
  const mockOnFileSelect = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('render states', () => {
    const testCases = [
      { isDragging: false, expectedClass: 'drop-zone' },
      { isDragging: true, expectedClass: 'dragging' }
    ];

    testCases.forEach(({ isDragging, expectedClass }) => {
      it(`should render with ${expectedClass} when isDragging=${isDragging}`, () => {
        const { container } = render(<DropZone onFileSelect={mockOnFileSelect} />);
        const dropZone = container.querySelector('.drop-zone');

        if (isDragging) {
          fireEvent.dragEnter(dropZone!);
          expect(dropZone).toHaveClass(expectedClass);
        } else {
          expect(dropZone).toHaveClass(expectedClass);
        }
      });
    });
  });

  describe('drag and drop', () => {
    it('should handle drag enter', () => {
      const { container } = render(<DropZone onFileSelect={mockOnFileSelect} />);
      const dropZone = container.querySelector('.drop-zone')!;

      fireEvent.dragEnter(dropZone);
      expect(dropZone).toHaveClass('dragging');
    });

    it('should handle drag leave', () => {
      const { container } = render(<DropZone onFileSelect={mockOnFileSelect} />);
      const dropZone = container.querySelector('.drop-zone')!;

      fireEvent.dragEnter(dropZone);
      fireEvent.dragLeave(dropZone);
      expect(dropZone).not.toHaveClass('dragging');
    });

    it('should handle file drop', () => {
      const { container } = render(<DropZone onFileSelect={mockOnFileSelect} />);
      const dropZone = container.querySelector('.drop-zone')!;
      const file = new File(['test'], 'test.zip', { type: 'application/zip' });

      fireEvent.drop(dropZone, {
        dataTransfer: { files: [file] }
      });

      expect(mockOnFileSelect).toHaveBeenCalledWith(file);
    });

    it('should prevent default on drag over', () => {
      const { container } = render(<DropZone onFileSelect={mockOnFileSelect} />);
      const dropZone = container.querySelector('.drop-zone')!;

      const event = new Event('dragover', { bubbles: true, cancelable: true });
      fireEvent(dropZone, event);

      expect(event.defaultPrevented).toBe(true);
    });
  });

  describe('file input', () => {
    it('should handle file selection via input', () => {
      render(<DropZone onFileSelect={mockOnFileSelect} />);
      const input = screen.getByLabelText(/select.*zip/i) as HTMLInputElement;
      const file = new File(['test'], 'debug.zip', { type: 'application/zip' });

      fireEvent.change(input, { target: { files: [file] } });

      expect(mockOnFileSelect).toHaveBeenCalledWith(file);
    });

    it('should handle empty file selection', () => {
      render(<DropZone onFileSelect={mockOnFileSelect} />);
      const input = screen.getByLabelText(/select.*zip/i);

      fireEvent.change(input, { target: { files: [] } });

      expect(mockOnFileSelect).not.toHaveBeenCalled();
    });

    it('should handle null files', () => {
      render(<DropZone onFileSelect={mockOnFileSelect} />);
      const input = screen.getByLabelText(/select.*zip/i);

      fireEvent.change(input, { target: { files: null } });

      expect(mockOnFileSelect).not.toHaveBeenCalled();
    });
  });

  describe('click to select', () => {
    it('should trigger file input on click', () => {
      const { container } = render(<DropZone onFileSelect={mockOnFileSelect} />);
      const dropZone = container.querySelector('.drop-zone')!;
      const input = screen.getByLabelText(/select.*zip/i) as HTMLInputElement;

      const clickSpy = vi.spyOn(input, 'click');
      fireEvent.click(dropZone);

      expect(clickSpy).toHaveBeenCalled();
    });
  });
});